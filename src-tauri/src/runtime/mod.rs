use std::collections::{BTreeSet, HashMap, VecDeque};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};
use tokio::process::Child;
use tokio::sync::{Mutex, Notify};
#[cfg(unix)]
use tokio::time::sleep;

use crate::backend::app_server::WorkspaceSession;
use crate::state::AppState;
use crate::types::{AppSettings, WorkspaceEntry};

use self::process_diagnostics::{
    build_engine_observability, current_host_untracked_engine_roots,
    merge_process_diagnostics, snapshot_process_diagnostics, terminate_pid_tree,
};

const LEDGER_FILE_NAME: &str = "runtime-pool-ledger.json";
const TERMINATE_GRACE_MILLIS: u64 = 150;
pub(crate) const RUNTIME_ACQUIRE_WAIT_TIMEOUT_SECS: u64 = 5;
pub(crate) const RUNTIME_RECOVERY_MAX_CONSECUTIVE_FAILURES: u8 = 3;
pub(crate) const RUNTIME_RECOVERY_RETRY_BACKOFF_MILLIS: u64 = 250;
pub(crate) const RUNTIME_RECOVERY_QUARANTINE_MILLIS: u64 = 15_000;
const RUNTIME_CHURN_WINDOW_MILLIS: u64 = 30_000;
const THREAD_CREATE_PENDING_SENTINEL: &str = "__thread-create-pending__";

mod process_diagnostics;

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn write_json_atomically(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| format!("runtime ledger path has no parent: {}", path.display()))?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            format!(
                "runtime ledger path has invalid filename: {}",
                path.display()
            )
        })?;
    let temp_path = parent.join(format!(".{filename}.{}.tmp", uuid::Uuid::new_v4()));
    let mut temp_file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp_path)
        .map_err(|error| error.to_string())?;
    temp_file
        .write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    temp_file.sync_all().map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error.to_string());
    }
    Ok(())
}

fn runtime_key(engine: &str, workspace_id: &str) -> String {
    format!("{engine}::{workspace_id}")
}

fn normalize_engine(engine: &str) -> String {
    let normalized = engine.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        "codex".to_string()
    } else {
        normalized
    }
}

fn event_thread_id(value: &Value) -> Option<String> {
    value.get("params").and_then(|params| {
        params
            .get("threadId")
            .or_else(|| params.get("thread_id"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| {
                params
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
}

fn event_turn_id(value: &Value) -> Option<String> {
    value.get("params").and_then(|params| {
        params
            .get("turnId")
            .or_else(|| params.get("turn_id"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| {
                params
                    .get("turn")
                    .and_then(|turn| turn.get("id"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
}

fn event_method(value: &Value) -> Option<&str> {
    value.get("method").and_then(Value::as_str)
}

fn event_stream_source(value: &Value) -> Option<String> {
    let method = event_method(value)?;
    if !matches!(
        method,
        "item/updated"
            | "item/completed"
            | "item/reasoning/summaryTextDelta"
            | "item/reasoning/textDelta"
            | "item/messageDelta"
            | "item/textDelta"
    ) {
        return None;
    }
    let token = event_turn_id(value)
        .or_else(|| event_thread_id(value))
        .unwrap_or_else(|| "unknown".to_string());
    Some(format!("stream:{token}"))
}

fn event_turn_source(value: &Value) -> Option<String> {
    let method = event_method(value)?;
    if !matches!(method, "turn/started" | "turn/completed" | "turn/error") {
        return None;
    }
    let token = event_turn_id(value)
        .or_else(|| event_thread_id(value))
        .unwrap_or_else(|| "unknown".to_string());
    Some(format!("turn:{token}"))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RuntimeState {
    Starting,
    StartupPending,
    ResumePending,
    Acquired,
    Streaming,
    GracefulIdle,
    Evictable,
    Stopping,
    Failed,
    ZombieSuspected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RuntimeForegroundWorkState {
    StartupPending,
    ResumePending,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RuntimeStartupState {
    Starting,
    Ready,
    SuspectStale,
    Cooldown,
    Quarantined,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeProcessDiagnostics {
    pub(crate) root_processes: u32,
    pub(crate) total_processes: u32,
    pub(crate) node_processes: u32,
    pub(crate) root_command: Option<String>,
    pub(crate) managed_runtime_processes: u32,
    pub(crate) resume_helper_processes: u32,
    pub(crate) orphan_residue_processes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeEngineObservability {
    pub(crate) engine: String,
    pub(crate) session_count: u32,
    pub(crate) tracked_root_processes: u32,
    pub(crate) tracked_total_processes: u32,
    pub(crate) tracked_node_processes: u32,
    pub(crate) host_managed_root_processes: u32,
    pub(crate) host_unmanaged_root_processes: u32,
    pub(crate) external_root_processes: u32,
    pub(crate) host_unmanaged_total_processes: u32,
    pub(crate) external_total_processes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimePoolRow {
    pub(crate) workspace_id: String,
    pub(crate) workspace_name: String,
    pub(crate) workspace_path: String,
    pub(crate) engine: String,
    pub(crate) state: RuntimeState,
    pub(crate) pid: Option<u32>,
    pub(crate) wrapper_kind: Option<String>,
    pub(crate) resolved_bin: Option<String>,
    pub(crate) started_at_ms: Option<u64>,
    pub(crate) last_used_at_ms: u64,
    pub(crate) pinned: bool,
    pub(crate) turn_lease_count: u32,
    pub(crate) stream_lease_count: u32,
    pub(crate) lease_sources: Vec<String>,
    #[serde(default)]
    pub(crate) active_work_protected: bool,
    #[serde(default)]
    pub(crate) active_work_reason: Option<String>,
    #[serde(default)]
    pub(crate) active_work_since_ms: Option<u64>,
    #[serde(default)]
    pub(crate) active_work_last_renewed_at_ms: Option<u64>,
    #[serde(default)]
    pub(crate) foreground_work_state: Option<RuntimeForegroundWorkState>,
    #[serde(default)]
    pub(crate) foreground_work_thread_id: Option<String>,
    #[serde(default)]
    pub(crate) foreground_work_turn_id: Option<String>,
    #[serde(default)]
    pub(crate) foreground_work_since_ms: Option<u64>,
    #[serde(default)]
    pub(crate) foreground_work_timeout_at_ms: Option<u64>,
    #[serde(default)]
    pub(crate) foreground_work_last_event_at_ms: Option<u64>,
    #[serde(default)]
    pub(crate) foreground_work_timed_out: bool,
    pub(crate) evict_candidate: bool,
    pub(crate) eviction_reason: Option<String>,
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) last_exit_reason_code: Option<String>,
    #[serde(default)]
    pub(crate) last_exit_message: Option<String>,
    #[serde(default)]
    pub(crate) last_exit_at_ms: Option<u64>,
    #[serde(default)]
    pub(crate) last_exit_code: Option<i32>,
    #[serde(default)]
    pub(crate) last_exit_signal: Option<String>,
    #[serde(default)]
    pub(crate) last_exit_pending_request_count: u32,
    #[serde(default)]
    pub(crate) process_diagnostics: Option<RuntimeProcessDiagnostics>,
    #[serde(default)]
    pub(crate) startup_state: Option<RuntimeStartupState>,
    #[serde(default)]
    pub(crate) last_recovery_source: Option<String>,
    #[serde(default)]
    pub(crate) last_guard_state: Option<String>,
    #[serde(default)]
    pub(crate) last_replace_reason: Option<String>,
    #[serde(default)]
    pub(crate) last_probe_failure: Option<String>,
    #[serde(default)]
    pub(crate) last_probe_failure_source: Option<String>,
    #[serde(default)]
    pub(crate) has_stopping_predecessor: bool,
    #[serde(default)]
    pub(crate) recent_spawn_count: u32,
    #[serde(default)]
    pub(crate) recent_replace_count: u32,
    #[serde(default)]
    pub(crate) recent_force_kill_count: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimePoolDiagnostics {
    pub(crate) orphan_entries_found: u32,
    pub(crate) orphan_entries_cleaned: u32,
    pub(crate) orphan_entries_failed: u32,
    pub(crate) force_kill_count: u32,
    pub(crate) lease_blocked_eviction_count: u32,
    pub(crate) coordinator_abort_count: u32,
    pub(crate) startup_managed_node_processes: u32,
    pub(crate) startup_resume_helper_node_processes: u32,
    pub(crate) startup_orphan_residue_processes: u32,
    pub(crate) last_orphan_sweep_at_ms: Option<u64>,
    pub(crate) last_shutdown_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimePoolBudgetSnapshot {
    pub(crate) max_hot_codex: u8,
    pub(crate) max_warm_codex: u8,
    pub(crate) warm_ttl_seconds: u16,
    pub(crate) restore_threads_only_on_launch: bool,
    pub(crate) force_cleanup_on_exit: bool,
    pub(crate) orphan_sweep_on_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimePoolSummary {
    pub(crate) total_runtimes: usize,
    pub(crate) acquired_runtimes: usize,
    pub(crate) streaming_runtimes: usize,
    pub(crate) graceful_idle_runtimes: usize,
    pub(crate) evictable_runtimes: usize,
    pub(crate) active_work_protected_runtimes: usize,
    pub(crate) pinned_runtimes: usize,
    pub(crate) codex_runtimes: usize,
    pub(crate) claude_runtimes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimePoolSnapshot {
    pub(crate) rows: Vec<RuntimePoolRow>,
    pub(crate) summary: RuntimePoolSummary,
    pub(crate) budgets: RuntimePoolBudgetSnapshot,
    pub(crate) diagnostics: RuntimePoolDiagnostics,
    pub(crate) engine_observability: Vec<RuntimeEngineObservability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedRuntimeLedger {
    rows: Vec<RuntimePoolRow>,
    diagnostics: RuntimePoolDiagnostics,
}

#[derive(Debug, Clone)]
struct RuntimeEntry {
    workspace_id: String,
    workspace_name: String,
    workspace_path: String,
    engine: String,
    pid: Option<u32>,
    wrapper_kind: Option<String>,
    resolved_bin: Option<String>,
    started_at_ms: Option<u64>,
    last_used_at_ms: u64,
    pinned: bool,
    error: Option<String>,
    session_exists: bool,
    starting: bool,
    stopping: bool,
    zombie_suspected: bool,
    turn_leases: BTreeSet<String>,
    stream_leases: BTreeSet<String>,
    active_work_since_ms: Option<u64>,
    active_work_last_renewed_at_ms: Option<u64>,
    foreground_work_state: Option<RuntimeForegroundWorkState>,
    foreground_work_thread_id: Option<String>,
    foreground_work_turn_id: Option<String>,
    foreground_work_since_ms: Option<u64>,
    foreground_work_timeout_at_ms: Option<u64>,
    foreground_work_last_event_at_ms: Option<u64>,
    foreground_work_timed_out: bool,
    evict_candidate: bool,
    manual_release_requested: bool,
    eviction_reason: Option<String>,
    last_exit_reason_code: Option<String>,
    last_exit_message: Option<String>,
    last_exit_at_ms: Option<u64>,
    last_exit_code: Option<i32>,
    last_exit_signal: Option<String>,
    last_exit_pending_request_count: u32,
    process_diagnostics: Option<RuntimeProcessDiagnostics>,
    startup_state: Option<RuntimeStartupState>,
    last_recovery_source: Option<String>,
    last_guard_state: Option<String>,
    last_replace_reason: Option<String>,
    last_probe_failure: Option<String>,
    last_probe_failure_source: Option<String>,
    has_stopping_predecessor: bool,
    recent_spawn_events: VecDeque<u64>,
    recent_replace_events: VecDeque<u64>,
    recent_force_kill_events: VecDeque<u64>,
}

#[derive(Debug, Clone, Default)]
struct RuntimeRecoveryEntry {
    consecutive_failures: u8,
    last_failure_at_ms: Option<u64>,
    quarantined_until_ms: Option<u64>,
    last_error: Option<String>,
}

impl RuntimeEntry {
    fn from_workspace(entry: &WorkspaceEntry, engine: &str) -> Self {
        Self {
            workspace_id: entry.id.clone(),
            workspace_name: entry.name.clone(),
            workspace_path: entry.path.clone(),
            engine: normalize_engine(engine),
            pid: None,
            wrapper_kind: None,
            resolved_bin: None,
            started_at_ms: None,
            last_used_at_ms: now_millis(),
            pinned: false,
            error: None,
            session_exists: false,
            starting: true,
            stopping: false,
            zombie_suspected: false,
            turn_leases: BTreeSet::new(),
            stream_leases: BTreeSet::new(),
            active_work_since_ms: None,
            active_work_last_renewed_at_ms: None,
            foreground_work_state: None,
            foreground_work_thread_id: None,
            foreground_work_turn_id: None,
            foreground_work_since_ms: None,
            foreground_work_timeout_at_ms: None,
            foreground_work_last_event_at_ms: None,
            foreground_work_timed_out: false,
            evict_candidate: false,
            manual_release_requested: false,
            eviction_reason: None,
            last_exit_reason_code: None,
            last_exit_message: None,
            last_exit_at_ms: None,
            last_exit_code: None,
            last_exit_signal: None,
            last_exit_pending_request_count: 0,
            process_diagnostics: None,
            startup_state: Some(RuntimeStartupState::Starting),
            last_recovery_source: None,
            last_guard_state: None,
            last_replace_reason: None,
            last_probe_failure: None,
            last_probe_failure_source: None,
            has_stopping_predecessor: false,
            recent_spawn_events: VecDeque::new(),
            recent_replace_events: VecDeque::new(),
            recent_force_kill_events: VecDeque::new(),
        }
    }

    fn update_workspace(&mut self, entry: &WorkspaceEntry, engine: &str) {
        self.workspace_name = entry.name.clone();
        self.workspace_path = entry.path.clone();
        self.engine = normalize_engine(engine);
        self.last_used_at_ms = now_millis();
    }

    fn lease_sources(&self) -> Vec<String> {
        self.turn_leases
            .iter()
            .chain(self.stream_leases.iter())
            .cloned()
            .collect()
    }

    fn prune_recent_events(events: &mut VecDeque<u64>) {
        let cutoff = now_millis().saturating_sub(RUNTIME_CHURN_WINDOW_MILLIS);
        while matches!(events.front(), Some(timestamp) if *timestamp < cutoff) {
            events.pop_front();
        }
    }

    fn record_recent_event(events: &mut VecDeque<u64>) {
        Self::prune_recent_events(events);
        events.push_back(now_millis());
    }

    fn recent_event_count(events: &VecDeque<u64>) -> u32 {
        let cutoff = now_millis().saturating_sub(RUNTIME_CHURN_WINDOW_MILLIS);
        events
            .iter()
            .filter(|timestamp| **timestamp >= cutoff)
            .count() as u32
    }

    fn record_spawn_event(&mut self) {
        Self::record_recent_event(&mut self.recent_spawn_events);
    }

    fn record_replace_event(&mut self) {
        Self::record_recent_event(&mut self.recent_replace_events);
    }

    fn record_force_kill_event(&mut self) {
        Self::record_recent_event(&mut self.recent_force_kill_events);
    }

    fn recent_spawn_count(&self) -> u32 {
        Self::recent_event_count(&self.recent_spawn_events)
    }

    fn recent_replace_count(&self) -> u32 {
        Self::recent_event_count(&self.recent_replace_events)
    }

    fn recent_force_kill_count(&self) -> u32 {
        Self::recent_event_count(&self.recent_force_kill_events)
    }

    fn has_active_leases(&self) -> bool {
        !self.turn_leases.is_empty() || !self.stream_leases.is_empty()
    }

    fn has_foreground_work_continuity(&self) -> bool {
        self.foreground_work_state.is_some()
    }

    fn has_active_work_protection(&self) -> bool {
        self.has_active_leases() || self.has_foreground_work_continuity()
    }

    fn active_work_reason(&self) -> Option<String> {
        match (!self.turn_leases.is_empty(), !self.stream_leases.is_empty()) {
            (true, true) => Some("turn+stream".to_string()),
            (true, false) => Some("turn".to_string()),
            (false, true) => Some("stream".to_string()),
            (false, false) => self
                .foreground_work_state
                .as_ref()
                .map(|state| match state {
                    RuntimeForegroundWorkState::StartupPending => "startup-pending".to_string(),
                    RuntimeForegroundWorkState::ResumePending => "resume-pending".to_string(),
                }),
        }
    }

    fn refresh_active_work_protection(&mut self) {
        if !self.has_active_leases() {
            self.active_work_since_ms = None;
            self.active_work_last_renewed_at_ms = None;
            return;
        }
        let now = now_millis();
        self.active_work_since_ms.get_or_insert(now);
        self.active_work_last_renewed_at_ms = Some(now);
        self.evict_candidate = false;
        if self.eviction_reason.as_deref() != Some("manual-release-waiting-for-active-work") {
            self.eviction_reason = None;
        }
    }

    fn clear_active_work_protection_if_idle(&mut self) {
        if self.has_active_leases() {
            self.refresh_active_work_protection();
            return;
        }
        self.active_work_since_ms = None;
        self.active_work_last_renewed_at_ms = None;
    }

    fn set_foreground_work_continuity(
        &mut self,
        state: RuntimeForegroundWorkState,
        thread_id: &str,
        turn_id: Option<&str>,
        timeout_ms: u64,
    ) {
        let now = now_millis();
        self.foreground_work_state = Some(state);
        self.foreground_work_thread_id = Some(thread_id.to_string());
        self.foreground_work_turn_id = turn_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        self.foreground_work_since_ms = Some(now);
        self.foreground_work_timeout_at_ms = Some(now.saturating_add(timeout_ms.max(1)));
        self.foreground_work_last_event_at_ms = Some(now);
        self.foreground_work_timed_out = false;
        self.evict_candidate = false;
        if self.eviction_reason.as_deref() != Some("manual-release-waiting-for-active-work") {
            self.eviction_reason = None;
        }
    }

    fn clear_foreground_work_continuity(&mut self) {
        self.foreground_work_state = None;
        self.foreground_work_thread_id = None;
        self.foreground_work_turn_id = None;
        self.foreground_work_since_ms = None;
        self.foreground_work_timeout_at_ms = None;
        self.foreground_work_last_event_at_ms = None;
        self.foreground_work_timed_out = false;
    }

    fn note_foreground_work_timeout(&mut self) {
        if self
            .foreground_work_timeout_at_ms
            .is_some_and(|timeout_at_ms| timeout_at_ms <= now_millis())
        {
            self.foreground_work_timed_out = true;
        }
    }

    fn matches_foreground_work_identity(
        &self,
        thread_id: Option<&str>,
        turn_id: Option<&str>,
    ) -> bool {
        let Some(current_thread_id) = self.foreground_work_thread_id.as_deref() else {
            return false;
        };
        if let Some(candidate_thread_id) = thread_id {
            let normalized_thread_id = candidate_thread_id.trim();
            if !normalized_thread_id.is_empty() && normalized_thread_id != current_thread_id {
                return false;
            }
        }
        if let Some(expected_turn_id) = self.foreground_work_turn_id.as_deref() {
            if let Some(candidate_turn_id) = turn_id {
                let normalized_turn_id = candidate_turn_id.trim();
                if !normalized_turn_id.is_empty() && normalized_turn_id != expected_turn_id {
                    return false;
                }
            }
        }
        true
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct RuntimeEndedRecord {
    pub(crate) reason_code: String,
    pub(crate) message: Option<String>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) exit_signal: Option<String>,
    pub(crate) pending_request_count: u32,
}

#[derive(Debug)]
pub(crate) struct RuntimeManager {
    entries: Mutex<HashMap<String, RuntimeEntry>>,
    diagnostics: Mutex<RuntimePoolDiagnostics>,
    recovery: Mutex<HashMap<String, RuntimeRecoveryEntry>>,
    startup_gates: Mutex<HashMap<String, RuntimeAcquireGateEntry>>,
    replacement_gates: Mutex<HashMap<String, RuntimeReplacementGateEntry>>,
    ledger_path: PathBuf,
    shutting_down: AtomicBool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RuntimeAcquireToken {
    key: String,
    nonce: String,
}

#[derive(Debug, Clone)]
struct RuntimeAcquireGateEntry {
    notify: Arc<Notify>,
    token: RuntimeAcquireToken,
    started_at_ms: u64,
}

#[derive(Debug, Clone)]
pub(crate) enum RuntimeAcquireGate {
    Leader(RuntimeAcquireToken),
    Waiter(Arc<Notify>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RuntimeAcquireDisposition {
    Leader(RuntimeAcquireToken),
    Retry,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RuntimeReplacementToken {
    key: String,
    nonce: String,
}

#[derive(Debug, Clone)]
struct RuntimeReplacementGateEntry {
    notify: Arc<Notify>,
    token: RuntimeReplacementToken,
}

#[derive(Debug, Clone)]
enum RuntimeReplacementGate {
    Leader(RuntimeReplacementToken),
    Waiter(Arc<Notify>),
}

#[derive(Debug, Clone)]
pub(crate) struct EvictionCandidate {
    engine: String,
    workspace_id: String,
    reason: String,
}

impl RuntimeManager {
    pub(crate) fn new(data_dir: &Path) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            diagnostics: Mutex::new(RuntimePoolDiagnostics::default()),
            recovery: Mutex::new(HashMap::new()),
            startup_gates: Mutex::new(HashMap::new()),
            replacement_gates: Mutex::new(HashMap::new()),
            ledger_path: data_dir.join(LEDGER_FILE_NAME),
            shutting_down: AtomicBool::new(false),
        }
    }

    pub(crate) async fn recovery_quarantine_error(
        &self,
        engine: &str,
        workspace_id: &str,
    ) -> Option<String> {
        let key = runtime_key(engine, workspace_id);
        let mut recovery = self.recovery.lock().await;
        let now = now_millis();
        let entry = recovery.get_mut(&key)?;
        let quarantined_until_ms = entry.quarantined_until_ms?;
        if quarantined_until_ms <= now {
            recovery.remove(&key);
            return None;
        }
        let remaining_ms = quarantined_until_ms.saturating_sub(now);
        let remaining_secs = remaining_ms.div_ceil(1000);
        let last_error = entry
            .last_error
            .as_deref()
            .unwrap_or("unknown runtime failure");
        Some(format!(
            "[RUNTIME_RECOVERY_QUARANTINED] Runtime recovery paused for workspace {} (engine {}) after repeated failures. Retry after {}s. Last error: {}",
            workspace_id,
            normalize_engine(engine),
            remaining_secs,
            last_error
        ))
    }

    pub(crate) async fn ensure_recovery_ready(
        &self,
        engine: &str,
        workspace_id: &str,
    ) -> Result<(), String> {
        if let Some(error) = self.recovery_quarantine_error(engine, workspace_id).await {
            return Err(error);
        }
        Ok(())
    }

    pub(crate) async fn record_recovery_success(&self, engine: &str, workspace_id: &str) {
        let key = runtime_key(engine, workspace_id);
        self.recovery.lock().await.remove(&key);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_guard_state = Some("recovered".to_string());
            if !runtime.starting && runtime.error.is_none() {
                runtime.startup_state = Some(RuntimeStartupState::Ready);
            }
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn reset_recovery_cycle(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
    ) {
        let key = runtime_key(engine, workspace_id);
        self.recovery.lock().await.remove(&key);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_recovery_source = Some(source.to_string());
            runtime.last_guard_state = Some("explicit-reset".to_string());
            if runtime.error.is_none() {
                runtime.startup_state = Some(RuntimeStartupState::Ready);
            }
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_guard_event(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
        guard_state: &str,
    ) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_recovery_source = Some(source.to_string());
            runtime.last_guard_state = Some(guard_state.to_string());
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_probe_failure(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
        error: &str,
    ) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_probe_failure = Some(error.to_string());
            runtime.last_probe_failure_source = Some(source.to_string());
            runtime.last_recovery_source = Some(source.to_string());
            runtime.last_guard_state = Some("probe-failed".to_string());
            if runtime.startup_state == Some(RuntimeStartupState::Ready) {
                runtime.startup_state = Some(RuntimeStartupState::SuspectStale);
            }
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_replacement_started(
        &self,
        session: &WorkspaceSession,
        source: &str,
        has_predecessor: bool,
    ) {
        let pid = {
            let child = session.child.lock().await;
            child.id()
        };
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, &session.entry, "codex");
        runtime.update_workspace(&session.entry, "codex");
        runtime.pid = pid;
        runtime.wrapper_kind = Some(session.wrapper_kind.clone());
        runtime.resolved_bin = Some(session.resolved_bin.clone());
        runtime.started_at_ms.get_or_insert_with(now_millis);
        runtime.error = None;
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.stopping = false;
        runtime.zombie_suspected = false;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.last_exit_reason_code = None;
        runtime.last_exit_message = None;
        runtime.last_exit_at_ms = None;
        runtime.last_exit_code = None;
        runtime.last_exit_signal = None;
        runtime.last_exit_pending_request_count = 0;
        runtime.process_diagnostics = pid.and_then(snapshot_process_diagnostics);
        runtime.startup_state = Some(RuntimeStartupState::Ready);
        runtime.last_recovery_source = Some(source.to_string());
        runtime.last_guard_state = Some("replacement-ready".to_string());
        runtime.last_replace_reason = Some(source.to_string());
        runtime.has_stopping_predecessor = has_predecessor;
        runtime.record_replace_event();
        runtime.clear_active_work_protection_if_idle();
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn clear_stopping_predecessor(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
    ) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.has_stopping_predecessor = false;
            runtime.last_recovery_source = Some(source.to_string());
            runtime.last_guard_state = Some("replacement-settled".to_string());
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_recovery_failure(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
        error: &str,
    ) -> Option<String> {
        let key = runtime_key(engine, workspace_id);
        let now = now_millis();
        let consecutive_failures = {
            let mut recovery = self.recovery.lock().await;
            let entry = recovery.entry(key.clone()).or_default();
            entry.consecutive_failures = entry
                .consecutive_failures
                .saturating_add(1)
                .min(RUNTIME_RECOVERY_MAX_CONSECUTIVE_FAILURES);
            entry.last_failure_at_ms = Some(now);
            entry.last_error = Some(error.to_string());
            if entry.consecutive_failures < RUNTIME_RECOVERY_MAX_CONSECUTIVE_FAILURES {
                entry.quarantined_until_ms = None;
            }
            entry.consecutive_failures
        };

        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_guard_state = Some("cooldown".to_string());
            runtime.last_probe_failure = Some(error.to_string());
            runtime.last_probe_failure_source = Some(source.to_string());
            runtime.last_recovery_source = Some(source.to_string());
            runtime.startup_state = Some(RuntimeStartupState::Cooldown);
        }
        drop(entries);

        if consecutive_failures < RUNTIME_RECOVERY_MAX_CONSECUTIVE_FAILURES {
            return None;
        }

        {
            let mut recovery = self.recovery.lock().await;
            if let Some(entry) = recovery.get_mut(&key) {
                let quarantined_until_ms = now.saturating_add(RUNTIME_RECOVERY_QUARANTINE_MILLIS);
                entry.quarantined_until_ms = Some(quarantined_until_ms);
            }
        }
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&runtime_key(engine, workspace_id)) {
            runtime.last_guard_state = Some("quarantined".to_string());
            runtime.last_recovery_source = Some(source.to_string());
            runtime.startup_state = Some(RuntimeStartupState::Quarantined);
        }
        drop(entries);
        let remaining_secs = RUNTIME_RECOVERY_QUARANTINE_MILLIS.div_ceil(1000);
        Some(format!(
            "[RUNTIME_RECOVERY_QUARANTINED] Runtime recovery paused for workspace {} (engine {}) after {} consecutive failures. Retry after {}s. Last error: {}",
            workspace_id,
            normalize_engine(engine),
            consecutive_failures,
            remaining_secs,
            error
        ))
    }

    pub(crate) async fn record_recovery_failure_with_backoff(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
        error: &str,
    ) -> Result<(), String> {
        if let Some(quarantine_error) = self
            .record_recovery_failure(engine, workspace_id, source, error)
            .await
        {
            return Err(quarantine_error);
        }
        tokio::time::sleep(Duration::from_millis(RUNTIME_RECOVERY_RETRY_BACKOFF_MILLIS)).await;
        Ok(())
    }

    fn runtime_acquire_stale_after(wait_timeout: Duration) -> Duration {
        let wait_millis = wait_timeout.as_millis();
        let multiplier = u128::from(RUNTIME_RECOVERY_MAX_CONSECUTIVE_FAILURES);
        let total_millis = wait_millis
            .saturating_mul(multiplier)
            .min(u128::from(u64::MAX));
        Duration::from_millis(total_millis as u64)
    }

    pub(crate) async fn begin_runtime_acquire(
        &self,
        engine: &str,
        workspace_id: &str,
    ) -> RuntimeAcquireGate {
        let key = runtime_key(engine, workspace_id);
        let mut startup_gates = self.startup_gates.lock().await;
        if let Some(entry) = startup_gates.get(&key) {
            return RuntimeAcquireGate::Waiter(entry.notify.clone());
        }
        let token = RuntimeAcquireToken {
            key: key.clone(),
            nonce: uuid::Uuid::new_v4().to_string(),
        };
        startup_gates.insert(
            key,
            RuntimeAcquireGateEntry {
                notify: Arc::new(Notify::new()),
                token: token.clone(),
                started_at_ms: now_millis(),
            },
        );
        RuntimeAcquireGate::Leader(token)
    }

    async fn take_over_runtime_acquire_if_stale(
        &self,
        engine: &str,
        workspace_id: &str,
        waited_notify: &Arc<Notify>,
        stale_after: Duration,
    ) -> Option<RuntimeAcquireToken> {
        let key = runtime_key(engine, workspace_id);
        let stale_after_ms = stale_after.as_millis().min(u128::from(u64::MAX)) as u64;
        let mut startup_gates = self.startup_gates.lock().await;
        let existing = startup_gates.get(&key)?;
        let waited_long_enough =
            now_millis().saturating_sub(existing.started_at_ms) >= stale_after_ms;
        if !Arc::ptr_eq(&existing.notify, waited_notify) || !waited_long_enough {
            return None;
        }

        let stale_notify = existing.notify.clone();
        let token = RuntimeAcquireToken {
            key: key.clone(),
            nonce: uuid::Uuid::new_v4().to_string(),
        };
        startup_gates.insert(
            key,
            RuntimeAcquireGateEntry {
                notify: Arc::new(Notify::new()),
                token: token.clone(),
                started_at_ms: now_millis(),
            },
        );
        drop(startup_gates);
        stale_notify.notify_waiters();
        Some(token)
    }

    async fn begin_runtime_acquire_or_retry_with_timeout(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
        automatic_recovery: bool,
        wait_timeout: Duration,
        timeout_error: &str,
    ) -> Result<RuntimeAcquireDisposition, String> {
        if automatic_recovery {
            if let Err(error) = self.ensure_recovery_ready(engine, workspace_id).await {
                self.note_guard_event(engine, workspace_id, source, "quarantined")
                    .await;
                return Err(error);
            }
        } else {
            self.reset_recovery_cycle(engine, workspace_id, source)
                .await;
        }
        match self.begin_runtime_acquire(engine, workspace_id).await {
            RuntimeAcquireGate::Leader(token) => {
                self.note_guard_event(engine, workspace_id, source, "leader")
                    .await;
                Ok(RuntimeAcquireDisposition::Leader(token))
            }
            RuntimeAcquireGate::Waiter(notify) => {
                match tokio::time::timeout(wait_timeout, notify.notified()).await {
                    Ok(()) => {
                        self.note_guard_event(engine, workspace_id, source, "retry")
                            .await;
                        Ok(RuntimeAcquireDisposition::Retry)
                    }
                    Err(_) => {
                        self.record_recovery_failure_with_backoff(
                            engine,
                            workspace_id,
                            source,
                            timeout_error,
                        )
                        .await?;
                        if let Some(token) = self
                            .take_over_runtime_acquire_if_stale(
                                engine,
                                workspace_id,
                                &notify,
                                Self::runtime_acquire_stale_after(wait_timeout),
                            )
                            .await
                        {
                            self.note_guard_event(engine, workspace_id, source, "leader")
                                .await;
                            return Ok(RuntimeAcquireDisposition::Leader(token));
                        }
                        self.note_guard_event(engine, workspace_id, source, "cooldown")
                            .await;
                        Ok(RuntimeAcquireDisposition::Retry)
                    }
                }
            }
        }
    }

    pub(crate) async fn begin_runtime_acquire_or_retry(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
        automatic_recovery: bool,
        timeout_error: &str,
    ) -> Result<RuntimeAcquireDisposition, String> {
        self.begin_runtime_acquire_or_retry_with_timeout(
            engine,
            workspace_id,
            source,
            automatic_recovery,
            Duration::from_secs(RUNTIME_ACQUIRE_WAIT_TIMEOUT_SECS),
            timeout_error,
        )
        .await
    }

    pub(crate) async fn finish_runtime_acquire(&self, token: &RuntimeAcquireToken) {
        let notify = {
            let mut startup_gates = self.startup_gates.lock().await;
            match startup_gates.get(&token.key) {
                Some(entry) if entry.token == *token => startup_gates.remove(&token.key),
                _ => None,
            }
        };
        if let Some(entry) = notify {
            entry.notify.notify_waiters();
        }
    }
    async fn begin_runtime_replacement(
        &self,
        engine: &str,
        workspace_id: &str,
    ) -> RuntimeReplacementGate {
        let key = runtime_key(engine, workspace_id);
        let mut replacement_gates = self.replacement_gates.lock().await;
        if let Some(entry) = replacement_gates.get(&key) {
            return RuntimeReplacementGate::Waiter(entry.notify.clone());
        }
        let token = RuntimeReplacementToken {
            key: key.clone(),
            nonce: uuid::Uuid::new_v4().to_string(),
        };
        replacement_gates.insert(
            key,
            RuntimeReplacementGateEntry {
                notify: Arc::new(Notify::new()),
                token: token.clone(),
            },
        );
        RuntimeReplacementGate::Leader(token)
    }
    async fn finish_runtime_replacement(&self, token: &RuntimeReplacementToken) {
        let notify = {
            let mut replacement_gates = self.replacement_gates.lock().await;
            match replacement_gates.get(&token.key) {
                Some(entry) if entry.token == *token => replacement_gates.remove(&token.key),
                _ => None,
            }
        };
        if let Some(entry) = notify {
            entry.notify.notify_waiters();
        }
    }
    pub(crate) async fn tracked_engine_pids(&self, engine: &str) -> Vec<u32> {
        let normalized = normalize_engine(engine);
        self.entries
            .lock()
            .await
            .values()
            .filter(|entry| normalize_engine(&entry.engine) == normalized)
            .filter_map(|entry| entry.pid)
            .collect()
    }

    pub(crate) async fn has_pending_acquire_for_engine(&self, engine: &str) -> bool {
        let prefix = format!("{}::", normalize_engine(engine));
        self.startup_gates
            .lock()
            .await
            .keys()
            .any(|key| key.starts_with(&prefix))
    }

    pub(crate) fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }

    pub(crate) fn begin_shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
    }

    fn upsert_entry<'a>(
        entries: &'a mut HashMap<String, RuntimeEntry>,
        entry: &WorkspaceEntry,
        engine: &str,
    ) -> &'a mut RuntimeEntry {
        entries
            .entry(runtime_key(engine, &entry.id))
            .or_insert_with(|| RuntimeEntry::from_workspace(entry, engine))
    }

    pub(crate) async fn record_starting(&self, entry: &WorkspaceEntry, engine: &str, source: &str) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.starting = true;
        runtime.stopping = false;
        runtime.error = None;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.active_work_since_ms = None;
        runtime.active_work_last_renewed_at_ms = None;
        runtime.clear_foreground_work_continuity();
        runtime.last_exit_reason_code = None;
        runtime.last_exit_message = None;
        runtime.last_exit_at_ms = None;
        runtime.last_exit_code = None;
        runtime.last_exit_signal = None;
        runtime.last_exit_pending_request_count = 0;
        runtime.process_diagnostics = None;
        runtime.startup_state = Some(RuntimeStartupState::Starting);
        runtime.last_recovery_source = Some(source.to_string());
        runtime.last_guard_state = Some("leader".to_string());
        runtime.last_replace_reason = None;
        runtime.last_probe_failure = None;
        runtime.last_probe_failure_source = None;
        runtime.has_stopping_predecessor = false;
        runtime.record_spawn_event();
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_ready(&self, session: &WorkspaceSession, source: &str) {
        let pid = {
            let child = session.child.lock().await;
            child.id()
        };
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, &session.entry, "codex");
        runtime.update_workspace(&session.entry, "codex");
        runtime.pid = pid;
        runtime.wrapper_kind = Some(session.wrapper_kind.clone());
        runtime.resolved_bin = Some(session.resolved_bin.clone());
        runtime.started_at_ms.get_or_insert_with(now_millis);
        runtime.error = None;
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.stopping = false;
        runtime.zombie_suspected = false;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.last_exit_reason_code = None;
        runtime.last_exit_message = None;
        runtime.last_exit_at_ms = None;
        runtime.last_exit_code = None;
        runtime.last_exit_signal = None;
        runtime.last_exit_pending_request_count = 0;
        runtime.clear_active_work_protection_if_idle();
        runtime.clear_foreground_work_continuity();
        runtime.process_diagnostics = pid.and_then(snapshot_process_diagnostics);
        runtime.startup_state = Some(RuntimeStartupState::Ready);
        runtime.last_recovery_source = Some(source.to_string());
        runtime.last_guard_state = Some("ready".to_string());
        runtime.last_probe_failure = None;
        runtime.last_probe_failure_source = None;
        runtime.has_stopping_predecessor = false;
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn sync_claude_runtime(
        &self,
        entry: &WorkspaceEntry,
        pids: &[u32],
        source: &str,
    ) {
        if pids.is_empty() {
            self.record_removed("claude", &entry.id).await;
            return;
        }
        let mut diagnostics = merge_process_diagnostics(pids, "resume-helper");
        if diagnostics.root_command.is_none() {
            diagnostics.root_command = Some("claude".to_string());
        }
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, "claude");
        runtime.update_workspace(entry, "claude");
        runtime.pid = pids.first().copied();
        runtime.wrapper_kind = Some("claude-cli".to_string());
        runtime.resolved_bin = None;
        runtime.started_at_ms.get_or_insert_with(now_millis);
        runtime.error = None;
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.stopping = false;
        runtime.zombie_suspected = false;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.last_exit_reason_code = None;
        runtime.last_exit_message = None;
        runtime.last_exit_at_ms = None;
        runtime.last_exit_code = None;
        runtime.last_exit_signal = None;
        runtime.last_exit_pending_request_count = 0;
        runtime.process_diagnostics = Some(diagnostics);
        runtime.turn_leases.insert(source.to_string());
        runtime.refresh_active_work_protection();
        runtime.clear_foreground_work_continuity();
        runtime.startup_state = Some(RuntimeStartupState::Ready);
        runtime.last_recovery_source = Some(source.to_string());
        runtime.last_guard_state = Some("ready".to_string());
        runtime.has_stopping_predecessor = false;
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn touch(&self, engine: &str, workspace_id: &str, _source: &str) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_used_at_ms = now_millis();
            runtime.evict_candidate = false;
            if runtime.eviction_reason.as_deref() != Some("manual-release-waiting-for-active-work")
            {
                runtime.eviction_reason = None;
            }
            if runtime.has_active_leases() {
                runtime.refresh_active_work_protection();
            }
            runtime.note_foreground_work_timeout();
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn acquire_turn_lease(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        source: &str,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.turn_leases.insert(source.to_string());
        runtime.starting = false;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.refresh_active_work_protection();
        runtime.clear_foreground_work_continuity();
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn release_turn_lease(&self, engine: &str, workspace_id: &str, source: &str) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.turn_leases.remove(source);
            runtime.last_used_at_ms = now_millis();
            runtime.clear_active_work_protection_if_idle();
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn acquire_stream_lease(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        source: &str,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.stream_leases.insert(source.to_string());
        runtime.starting = false;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.refresh_active_work_protection();
        runtime.clear_foreground_work_continuity();
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn release_stream_lease(
        &self,
        engine: &str,
        workspace_id: &str,
        source: &str,
    ) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.stream_leases.remove(source);
            runtime.last_used_at_ms = now_millis();
            runtime.clear_active_work_protection_if_idle();
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_failure(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        source: &str,
        error: String,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.error = Some(error);
        runtime.session_exists = false;
        runtime.starting = false;
        runtime.stopping = false;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.turn_leases.clear();
        runtime.stream_leases.clear();
        runtime.active_work_since_ms = None;
        runtime.active_work_last_renewed_at_ms = None;
        runtime.clear_foreground_work_continuity();
        runtime.startup_state = Some(RuntimeStartupState::Cooldown);
        runtime.last_recovery_source = Some(source.to_string());
        runtime.last_guard_state = Some("failed".to_string());
        runtime.has_stopping_predecessor = false;
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn pin_runtime(&self, engine: &str, workspace_id: &str, pinned: bool) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.pinned = pinned;
            runtime.last_used_at_ms = now_millis();
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn request_release_to_cold(&self, engine: &str, workspace_id: &str) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.manual_release_requested = true;
            runtime.evict_candidate = !runtime.has_active_work_protection();
            runtime.eviction_reason = Some(if runtime.has_active_work_protection() {
                "manual-release-waiting-for-active-work".to_string()
            } else {
                "manual-release".to_string()
            });
            runtime.last_used_at_ms = now_millis();
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_stopping(&self, engine: &str, workspace_id: &str) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.stopping = true;
            runtime.starting = false;
            runtime.evict_candidate = false;
            runtime.eviction_reason = None;
            runtime.turn_leases.clear();
            runtime.stream_leases.clear();
            runtime.active_work_since_ms = None;
            runtime.active_work_last_renewed_at_ms = None;
            runtime.clear_foreground_work_continuity();
            runtime.startup_state = None;
            runtime.has_stopping_predecessor = false;
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_runtime_ended(
        &self,
        engine: &str,
        workspace_id: &str,
        record: RuntimeEndedRecord,
    ) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            let now = now_millis();
            runtime.error = record.message.clone();
            runtime.session_exists = false;
            runtime.starting = false;
            runtime.stopping = false;
            runtime.pid = None;
            runtime.process_diagnostics = None;
            runtime.evict_candidate = false;
            runtime.manual_release_requested = false;
            runtime.eviction_reason = None;
            runtime.turn_leases.clear();
            runtime.stream_leases.clear();
            runtime.active_work_since_ms = None;
            runtime.active_work_last_renewed_at_ms = None;
            runtime.clear_foreground_work_continuity();
            runtime.last_exit_reason_code = Some(record.reason_code);
            runtime.last_exit_message = record.message;
            runtime.last_exit_at_ms = Some(now);
            runtime.last_exit_code = record.exit_code;
            runtime.last_exit_signal = record.exit_signal;
            runtime.last_exit_pending_request_count = record.pending_request_count;
            runtime.last_used_at_ms = now;
            runtime.startup_state = Some(RuntimeStartupState::Cooldown);
            runtime.has_stopping_predecessor = false;
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_foreground_turn_start_pending(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        thread_id: &str,
        timeout_ms: u64,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.set_foreground_work_continuity(
            RuntimeForegroundWorkState::StartupPending,
            thread_id,
            None,
            timeout_ms,
        );
        runtime.last_used_at_ms = now_millis();
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_foreground_thread_create_pending(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        timeout_ms: u64,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.set_foreground_work_continuity(
            RuntimeForegroundWorkState::StartupPending,
            THREAD_CREATE_PENDING_SENTINEL,
            None,
            timeout_ms,
        );
        runtime.last_used_at_ms = now_millis();
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_foreground_resume_pending(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        thread_id: &str,
        turn_id: Option<&str>,
        timeout_ms: u64,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.set_foreground_work_continuity(
            RuntimeForegroundWorkState::ResumePending,
            thread_id,
            turn_id,
            timeout_ms,
        );
        runtime.last_used_at_ms = now_millis();
        drop(entries);
        let _ = self.persist_ledger().await;
    }
    pub(crate) async fn clear_foreground_work_continuity(
        &self,
        engine: &str,
        workspace_id: &str,
        thread_id: Option<&str>,
        turn_id: Option<&str>,
    ) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            if runtime.matches_foreground_work_identity(thread_id, turn_id) {
                runtime.clear_foreground_work_continuity();
                runtime.last_used_at_ms = now_millis();
            }
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_removed(&self, engine: &str, workspace_id: &str) {
        let mut entries = self.entries.lock().await;
        entries.remove(&runtime_key(engine, workspace_id));
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_force_kill(&self) {
        let mut diagnostics = self.diagnostics.lock().await;
        diagnostics.force_kill_count += 1;
        drop(diagnostics);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_force_kill_for_runtime(&self, engine: &str, workspace_id: &str) {
        self.note_force_kill().await;
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.record_force_kill_event();
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_shutdown(&self) {
        let mut diagnostics = self.diagnostics.lock().await;
        diagnostics.last_shutdown_at_ms = Some(now_millis());
        drop(diagnostics);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn note_coordinator_abort(&self) {
        let mut diagnostics = self.diagnostics.lock().await;
        diagnostics.coordinator_abort_count += 1;
        drop(diagnostics);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn handle_codex_runtime_event(&self, entry: &WorkspaceEntry, value: &Value) {
        let Some(method) = event_method(value) else {
            return;
        };
        let thread_id = event_thread_id(value);
        let turn_id = event_turn_id(value);
        if thread_id.is_some()
            && method != "codex/stderr"
            && method != "codex/parseError"
            && method != "codex/raw"
        {
            self.clear_foreground_work_continuity(
                "codex",
                &entry.id,
                thread_id.as_deref(),
                turn_id.as_deref(),
            )
            .await;
        }
        if let Some(source) = event_turn_source(value) {
            match method {
                "turn/started" => {
                    self.acquire_turn_lease(entry, "codex", &source).await;
                }
                "turn/completed" | "turn/error" => {
                    self.release_turn_lease("codex", &entry.id, &source).await;
                }
                _ => {}
            }
        }
        if let Some(source) = event_stream_source(value) {
            self.acquire_stream_lease(entry, "codex", &source).await;
            if matches!(method, "item/completed") {
                self.release_stream_lease("codex", &entry.id, &source).await;
            }
        }
        if matches!(method, "turn/completed" | "turn/error") {
            if let Some(source) = event_stream_source(value) {
                self.release_stream_lease("codex", &entry.id, &source).await;
            } else if let Some(turn_source) = event_turn_source(value) {
                let stream_source = turn_source.replacen("turn:", "stream:", 1);
                self.release_stream_lease("codex", &entry.id, &stream_source)
                    .await;
            }
        }
    }

    fn classify_state(entry: &RuntimeEntry) -> RuntimeState {
        if entry.zombie_suspected {
            RuntimeState::ZombieSuspected
        } else if entry.error.is_some() {
            RuntimeState::Failed
        } else if entry.stopping {
            RuntimeState::Stopping
        } else if !entry.stream_leases.is_empty() {
            RuntimeState::Streaming
        } else if matches!(
            entry.foreground_work_state,
            Some(RuntimeForegroundWorkState::ResumePending)
        ) {
            RuntimeState::ResumePending
        } else if matches!(
            entry.foreground_work_state,
            Some(RuntimeForegroundWorkState::StartupPending)
        ) {
            RuntimeState::StartupPending
        } else if !entry.turn_leases.is_empty() {
            RuntimeState::Acquired
        } else if entry.evict_candidate {
            RuntimeState::Evictable
        } else if entry.starting {
            RuntimeState::Starting
        } else {
            RuntimeState::GracefulIdle
        }
    }

    async fn snapshot_rows(&self) -> Vec<RuntimePoolRow> {
        let mut rows = self
            .entries
            .lock()
            .await
            .values()
            .filter(|entry| {
                entry.session_exists
                    || entry.pid.is_some()
                    || entry.error.is_some()
                    || entry.has_active_work_protection()
                    || entry.evict_candidate
                    || entry.starting
            })
            .cloned()
            .map(|entry| {
                let mut entry = entry;
                entry.note_foreground_work_timeout();
                let state = Self::classify_state(&entry);
                let turn_lease_count = entry.turn_leases.len() as u32;
                let stream_lease_count = entry.stream_leases.len() as u32;
                let lease_sources = entry.lease_sources();
                let active_work_protected = entry.has_active_work_protection();
                let active_work_reason = entry.active_work_reason();
                let recent_spawn_count = entry.recent_spawn_count();
                let recent_replace_count = entry.recent_replace_count();
                let recent_force_kill_count = entry.recent_force_kill_count();
                RuntimePoolRow {
                    workspace_id: entry.workspace_id,
                    workspace_name: entry.workspace_name,
                    workspace_path: entry.workspace_path,
                    engine: entry.engine,
                    state,
                    pid: entry.pid,
                    wrapper_kind: entry.wrapper_kind,
                    resolved_bin: entry.resolved_bin,
                    started_at_ms: entry.started_at_ms,
                    last_used_at_ms: entry.last_used_at_ms,
                    pinned: entry.pinned,
                    turn_lease_count,
                    stream_lease_count,
                    lease_sources,
                    active_work_protected,
                    active_work_reason,
                    active_work_since_ms: entry
                        .active_work_since_ms
                        .or(entry.foreground_work_since_ms),
                    active_work_last_renewed_at_ms: entry
                        .active_work_last_renewed_at_ms
                        .or(entry.foreground_work_last_event_at_ms),
                    foreground_work_state: entry.foreground_work_state.clone(),
                    foreground_work_thread_id: entry.foreground_work_thread_id.clone(),
                    foreground_work_turn_id: entry.foreground_work_turn_id.clone(),
                    foreground_work_since_ms: entry.foreground_work_since_ms,
                    foreground_work_timeout_at_ms: entry.foreground_work_timeout_at_ms,
                    foreground_work_last_event_at_ms: entry.foreground_work_last_event_at_ms,
                    foreground_work_timed_out: entry.foreground_work_timed_out,
                    evict_candidate: entry.evict_candidate,
                    eviction_reason: entry.eviction_reason,
                    error: entry.error,
                    last_exit_reason_code: entry.last_exit_reason_code,
                    last_exit_message: entry.last_exit_message,
                    last_exit_at_ms: entry.last_exit_at_ms,
                    last_exit_code: entry.last_exit_code,
                    last_exit_signal: entry.last_exit_signal,
                    last_exit_pending_request_count: entry.last_exit_pending_request_count,
                    process_diagnostics: entry
                        .pid
                        .and_then(snapshot_process_diagnostics)
                        .or(entry.process_diagnostics),
                    startup_state: entry.startup_state.clone(),
                    last_recovery_source: entry.last_recovery_source.clone(),
                    last_guard_state: entry.last_guard_state.clone(),
                    last_replace_reason: entry.last_replace_reason.clone(),
                    last_probe_failure: entry.last_probe_failure.clone(),
                    last_probe_failure_source: entry.last_probe_failure_source.clone(),
                    has_stopping_predecessor: entry.has_stopping_predecessor,
                    recent_spawn_count,
                    recent_replace_count,
                    recent_force_kill_count,
                }
            })
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| right.last_used_at_ms.cmp(&left.last_used_at_ms));
        rows
    }

    pub(crate) async fn snapshot(&self, settings: &AppSettings) -> RuntimePoolSnapshot {
        let rows = self.snapshot_rows().await;
        RuntimePoolSnapshot {
            summary: runtime_pool_summary_from_rows(&rows),
            engine_observability: build_engine_observability(&rows),
            rows,
            budgets: RuntimePoolBudgetSnapshot {
                max_hot_codex: settings.codex_max_hot_runtimes,
                max_warm_codex: settings.codex_max_warm_runtimes,
                warm_ttl_seconds: settings.codex_warm_ttl_seconds,
                restore_threads_only_on_launch: settings.runtime_restore_threads_only_on_launch,
                force_cleanup_on_exit: settings.runtime_force_cleanup_on_exit,
                orphan_sweep_on_launch: settings.runtime_orphan_sweep_on_launch,
            },
            diagnostics: self.diagnostics.lock().await.clone(),
        }
    }

    pub(crate) async fn reconcile_pool(&self, settings: &AppSettings) -> Vec<EvictionCandidate> {
        let mut entries = self.entries.lock().await;
        let mut diagnostics = self.diagnostics.lock().await;
        let now = now_millis();
        let warm_ttl_ms = (settings.codex_warm_ttl_seconds as u64).saturating_mul(1000);
        let hot_limit = settings.codex_max_hot_runtimes as usize;
        let warm_limit = settings.codex_max_warm_runtimes as usize;

        for entry in entries.values_mut() {
            if entry.engine == "codex" && !entry.manual_release_requested {
                entry.evict_candidate = false;
                if entry.eviction_reason.as_deref() != Some("manual-release") {
                    entry.eviction_reason = None;
                }
            }
        }

        let mut idle_codex = entries
            .values()
            .filter(|entry| {
                entry.engine == "codex"
                    && entry.session_exists
                    && !entry.stopping
                    && entry.error.is_none()
                    && !entry.zombie_suspected
            })
            .map(|entry| {
                (
                    runtime_key(&entry.engine, &entry.workspace_id),
                    entry.last_used_at_ms,
                    entry.pinned,
                    entry.has_active_work_protection(),
                    entry.manual_release_requested,
                    now.saturating_sub(entry.last_used_at_ms) > warm_ttl_ms,
                )
            })
            .collect::<Vec<_>>();

        idle_codex.sort_by(|left, right| right.1.cmp(&left.1));

        let mut keep_idle = 0usize;
        let mut candidates = Vec::new();

        for (key, _, pinned, leased, manual_release, ttl_expired) in idle_codex {
            let Some(entry) = entries.get_mut(&key) else {
                continue;
            };
            if leased {
                if manual_release {
                    entry.evict_candidate = false;
                    entry.eviction_reason =
                        Some("manual-release-waiting-for-active-work".to_string());
                    diagnostics.lease_blocked_eviction_count += 1;
                } else if ttl_expired {
                    diagnostics.lease_blocked_eviction_count += 1;
                    entry.evict_candidate = false;
                }
                entry.refresh_active_work_protection();
                continue;
            }
            let mut reason: Option<&str> = None;
            if manual_release {
                reason = Some("manual-release");
            } else if ttl_expired {
                reason = Some("ttl-expired");
            } else if !pinned && !leased {
                if keep_idle < hot_limit + warm_limit {
                    keep_idle += 1;
                } else {
                    reason = Some("budget-overflow");
                }
            }

            if let Some(reason) = reason {
                if entry.pinned {
                    continue;
                }
                entry.evict_candidate = true;
                entry.eviction_reason = Some(reason.to_string());
                candidates.push(EvictionCandidate {
                    engine: entry.engine.clone(),
                    workspace_id: entry.workspace_id.clone(),
                    reason: reason.to_string(),
                });
            }
        }

        drop(diagnostics);
        drop(entries);
        let _ = self.persist_ledger().await;
        candidates
    }

    pub(crate) async fn can_evict(&self, engine: &str, workspace_id: &str) -> bool {
        let entries = self.entries.lock().await;
        entries
            .get(&runtime_key(engine, workspace_id))
            .map(|entry| !entry.pinned && !entry.has_active_work_protection())
            .unwrap_or(true)
    }

    async fn persist_ledger(&self) -> Result<(), String> {
        let rows = self
            .entries
            .lock()
            .await
            .values()
            .filter(|entry| {
                entry.pid.is_some()
                    || entry.error.is_some()
                    || entry.foreground_work_state.is_some()
            })
            .cloned()
            .map(|entry| {
                let mut entry = entry;
                entry.note_foreground_work_timeout();
                let state = Self::classify_state(&entry);
                let turn_lease_count = entry.turn_leases.len() as u32;
                let stream_lease_count = entry.stream_leases.len() as u32;
                let lease_sources = entry.lease_sources();
                let active_work_protected = entry.has_active_work_protection();
                let active_work_reason = entry.active_work_reason();
                let recent_spawn_count = entry.recent_spawn_count();
                let recent_replace_count = entry.recent_replace_count();
                let recent_force_kill_count = entry.recent_force_kill_count();
                RuntimePoolRow {
                    workspace_id: entry.workspace_id,
                    workspace_name: entry.workspace_name,
                    workspace_path: entry.workspace_path,
                    engine: entry.engine,
                    state,
                    pid: entry.pid,
                    wrapper_kind: entry.wrapper_kind,
                    resolved_bin: entry.resolved_bin,
                    started_at_ms: entry.started_at_ms,
                    last_used_at_ms: entry.last_used_at_ms,
                    pinned: entry.pinned,
                    turn_lease_count,
                    stream_lease_count,
                    lease_sources,
                    active_work_protected,
                    active_work_reason,
                    active_work_since_ms: entry
                        .active_work_since_ms
                        .or(entry.foreground_work_since_ms),
                    active_work_last_renewed_at_ms: entry
                        .active_work_last_renewed_at_ms
                        .or(entry.foreground_work_last_event_at_ms),
                    foreground_work_state: entry.foreground_work_state.clone(),
                    foreground_work_thread_id: entry.foreground_work_thread_id.clone(),
                    foreground_work_turn_id: entry.foreground_work_turn_id.clone(),
                    foreground_work_since_ms: entry.foreground_work_since_ms,
                    foreground_work_timeout_at_ms: entry.foreground_work_timeout_at_ms,
                    foreground_work_last_event_at_ms: entry.foreground_work_last_event_at_ms,
                    foreground_work_timed_out: entry.foreground_work_timed_out,
                    evict_candidate: entry.evict_candidate,
                    eviction_reason: entry.eviction_reason,
                    error: entry.error,
                    last_exit_reason_code: entry.last_exit_reason_code,
                    last_exit_message: entry.last_exit_message,
                    last_exit_at_ms: entry.last_exit_at_ms,
                    last_exit_code: entry.last_exit_code,
                    last_exit_signal: entry.last_exit_signal,
                    last_exit_pending_request_count: entry.last_exit_pending_request_count,
                    process_diagnostics: entry.process_diagnostics,
                    startup_state: entry.startup_state.clone(),
                    last_recovery_source: entry.last_recovery_source.clone(),
                    last_guard_state: entry.last_guard_state.clone(),
                    last_replace_reason: entry.last_replace_reason.clone(),
                    last_probe_failure: entry.last_probe_failure.clone(),
                    last_probe_failure_source: entry.last_probe_failure_source.clone(),
                    has_stopping_predecessor: entry.has_stopping_predecessor,
                    recent_spawn_count,
                    recent_replace_count,
                    recent_force_kill_count,
                }
            })
            .collect::<Vec<_>>();
        let diagnostics = self.diagnostics.lock().await.clone();
        let payload = serde_json::to_string_pretty(&PersistedRuntimeLedger { rows, diagnostics })
            .map_err(|error| error.to_string())?;
        write_json_atomically(&self.ledger_path, &payload)
    }

    pub(crate) fn orphan_sweep_on_startup(&self, enabled: bool) {
        if !enabled {
            return;
        }
        let raw_ledger = match fs::read_to_string(&self.ledger_path) {
            Ok(raw_ledger) => raw_ledger,
            Err(_) => return,
        };
        let parsed = match serde_json::from_str::<PersistedRuntimeLedger>(&raw_ledger) {
            Ok(parsed) => parsed,
            Err(_) => return,
        };
        let mut diagnostics = parsed.diagnostics;
        diagnostics.last_orphan_sweep_at_ms = Some(now_millis());
        diagnostics.orphan_entries_found += parsed.rows.len() as u32;
        for row in parsed.rows {
            if let Some(process_diagnostics) = row.process_diagnostics {
                diagnostics.startup_orphan_residue_processes = diagnostics
                    .startup_orphan_residue_processes
                    .saturating_add(process_diagnostics.node_processes);
            }
            let Some(pid) = row.pid else {
                continue;
            };
            match terminate_pid_tree(pid) {
                Ok(force_killed) => {
                    diagnostics.orphan_entries_cleaned += 1;
                    if force_killed {
                        diagnostics.force_kill_count += 1;
                    }
                }
                Err(_) => diagnostics.orphan_entries_failed += 1,
            }
        }
        let payload = PersistedRuntimeLedger {
            rows: Vec::new(),
            diagnostics: diagnostics.clone(),
        };
        if let Ok(serialized) = serde_json::to_string_pretty(&payload) {
            let _ = write_json_atomically(&self.ledger_path, &serialized);
        }
        *self.diagnostics.blocking_lock() = diagnostics;
    }
}

fn runtime_pool_summary_from_rows(rows: &[RuntimePoolRow]) -> RuntimePoolSummary {
    RuntimePoolSummary {
        total_runtimes: rows.len(),
        acquired_runtimes: rows
            .iter()
            .filter(|row| matches!(row.state, RuntimeState::Acquired))
            .count(),
        streaming_runtimes: rows
            .iter()
            .filter(|row| matches!(row.state, RuntimeState::Streaming))
            .count(),
        graceful_idle_runtimes: rows
            .iter()
            .filter(|row| matches!(row.state, RuntimeState::GracefulIdle))
            .count(),
        evictable_runtimes: rows
            .iter()
            .filter(|row| matches!(row.state, RuntimeState::Evictable))
            .count(),
        active_work_protected_runtimes: rows.iter().filter(|row| row.active_work_protected).count(),
        pinned_runtimes: rows.iter().filter(|row| row.pinned).count(),
        codex_runtimes: rows.iter().filter(|row| row.engine == "codex").count(),
        claude_runtimes: rows.iter().filter(|row| row.engine == "claude").count(),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "action")]
pub(crate) enum RuntimePoolMutation {
    Close {
        #[serde(alias = "workspaceId")]
        workspace_id: String,
        #[serde(default)]
        engine: Option<String>,
    },
    ReleaseToCold {
        #[serde(alias = "workspaceId")]
        workspace_id: String,
        #[serde(default)]
        engine: Option<String>,
    },
    Pin {
        #[serde(alias = "workspaceId")]
        workspace_id: String,
        #[serde(default)]
        engine: Option<String>,
        pinned: bool,
    },
}

pub(crate) async fn run_reconcile_cycle(state: &AppState, settings: &AppSettings) {
    let candidates = state.runtime_manager.reconcile_pool(settings).await;
    for candidate in candidates {
        if !state
            .runtime_manager
            .can_evict(&candidate.engine, &candidate.workspace_id)
            .await
        {
            state.runtime_manager.note_coordinator_abort().await;
            continue;
        }
        let _ = if candidate.reason == "manual-release" {
            close_runtime(state, &candidate.engine, &candidate.workspace_id).await
        } else {
            evict_runtime(state, &candidate.engine, &candidate.workspace_id).await
        };
        log::info!(
            "[runtime] evicted engine={} workspace_id={} reason={}",
            candidate.engine,
            candidate.workspace_id,
            candidate.reason
        );
    }

    // Startup restore should not leave detached Codex app-server roots behind.
    // If the host has no tracked Codex runtime and no acquire in progress, any
    // host-owned Codex root is stale and can be reclaimed.
    let tracked_codex_pids = state.runtime_manager.tracked_engine_pids("codex").await;
    let has_pending_codex_acquire = state
        .runtime_manager
        .has_pending_acquire_for_engine("codex")
        .await;
    if tracked_codex_pids.is_empty() && !has_pending_codex_acquire {
        if let Ok(untracked_roots) =
            current_host_untracked_engine_roots("codex", &tracked_codex_pids)
        {
            for pid in untracked_roots {
                if terminate_pid_tree(pid).unwrap_or(false) {
                    state.runtime_manager.note_force_kill().await;
                    log::warn!(
                        "[runtime] reclaimed untracked host codex root pid={pid} during reconcile"
                    );
                }
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn ensure_runtime_ready(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };
    if entry
        .settings
        .engine_type
        .as_deref()
        .map(|value| !value.eq_ignore_ascii_case("codex"))
        .unwrap_or(false)
    {
        return Ok(());
    }
    crate::codex::ensure_codex_session(&workspace_id, &state, &app).await?;
    let settings = state.app_settings.lock().await.clone();
    run_reconcile_cycle(&state, &settings).await;
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_runtime_pool_snapshot(
    state: State<'_, AppState>,
) -> Result<RuntimePoolSnapshot, String> {
    let settings = state.app_settings.lock().await.clone();
    Ok(state.runtime_manager.snapshot(&settings).await)
}

#[tauri::command]
pub(crate) async fn mutate_runtime_pool(
    mutation: RuntimePoolMutation,
    state: State<'_, AppState>,
) -> Result<RuntimePoolSnapshot, String> {
    match mutation {
        RuntimePoolMutation::Close {
            workspace_id,
            engine,
        } => {
            close_runtime(
                &state,
                &normalize_engine(engine.as_deref().unwrap_or("codex")),
                &workspace_id,
            )
            .await?;
        }
        RuntimePoolMutation::ReleaseToCold {
            workspace_id,
            engine,
        } => {
            let engine = normalize_engine(engine.as_deref().unwrap_or("codex"));
            if engine == "codex" {
                state
                    .runtime_manager
                    .request_release_to_cold(&engine, &workspace_id)
                    .await;
            } else {
                close_runtime(&state, &engine, &workspace_id).await?;
            }
        }
        RuntimePoolMutation::Pin {
            workspace_id,
            engine,
            pinned,
        } => {
            state
                .runtime_manager
                .pin_runtime(
                    &normalize_engine(engine.as_deref().unwrap_or("codex")),
                    &workspace_id,
                    pinned,
                )
                .await;
        }
    }
    let settings = state.app_settings.lock().await.clone();
    run_reconcile_cycle(&state, &settings).await;
    Ok(state.runtime_manager.snapshot(&settings).await)
}

async fn close_runtime(state: &AppState, engine: &str, workspace_id: &str) -> Result<(), String> {
    match engine {
        "claude" => stop_claude_workspace_session(state, workspace_id).await,
        _ => stop_workspace_session(&state.sessions, &state.runtime_manager, workspace_id).await,
    }
}

async fn evict_runtime(state: &AppState, engine: &str, workspace_id: &str) -> Result<(), String> {
    match engine {
        "claude" => stop_claude_workspace_session(state, workspace_id).await,
        _ => evict_workspace_session(&state.sessions, &state.runtime_manager, workspace_id).await,
    }
}

async fn stop_claude_workspace_session(state: &AppState, workspace_id: &str) -> Result<(), String> {
    state
        .runtime_manager
        .record_stopping("claude", workspace_id)
        .await;
    let session = state
        .engine_manager
        .claude_manager
        .remove_session(workspace_id)
        .await;
    if let Some(session) = session {
        session.mark_disposed();
        session.interrupt().await?;
    }
    state
        .runtime_manager
        .record_removed("claude", workspace_id)
        .await;
    Ok(())
}

pub(crate) async fn terminate_workspace_session_process(child: &mut Child) -> Result<bool, String> {
    #[cfg(unix)]
    {
        if let Some(pid) = child.id() {
            let process_group_id = pid as libc::pid_t;
            let terminate_status = unsafe { libc::kill(-process_group_id, libc::SIGTERM) };
            if terminate_status == 0 {
                sleep(Duration::from_millis(TERMINATE_GRACE_MILLIS)).await;
                if matches!(child.try_wait(), Ok(Some(_))) {
                    let _ = child.wait().await;
                    return Ok(false);
                }
            }
            let kill_status = unsafe { libc::kill(-process_group_id, libc::SIGKILL) };
            if kill_status == 0 {
                let _ = child.wait().await;
                return Ok(true);
            }
        }
    }

    #[cfg(windows)]
    {
        if let Some(pid) = child.id() {
            let output = crate::utils::async_command("taskkill")
                .arg("/PID")
                .arg(pid.to_string())
                .arg("/T")
                .arg("/F")
                .output()
                .await
                .map_err(|error| format!("taskkill failed for pid {pid}: {error}"))?;
            if output.status.success() || matches!(child.try_wait(), Ok(Some(_))) {
                let _ = child.wait().await;
                return Ok(true);
            }
        }
    }

    child
        .kill()
        .await
        .map_err(|error| format!("Failed to kill process: {error}"))?;
    let _ = child.wait().await;
    Ok(true)
}

pub(crate) async fn terminate_workspace_session(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
) -> Result<(), String> {
    terminate_workspace_session_with_shutdown_mode(session, runtime_manager, true).await
}

async fn terminate_workspace_session_for_eviction(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
) -> Result<(), String> {
    terminate_workspace_session_with_shutdown_mode(session, runtime_manager, false).await
}

async fn terminate_workspace_session_with_shutdown_mode(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
    manual_shutdown: bool,
) -> Result<(), String> {
    let workspace_id = session.entry.id.clone();
    if manual_shutdown {
        session.mark_manual_shutdown();
    }
    if let Some(runtime_manager) = runtime_manager {
        runtime_manager
            .record_stopping("codex", &workspace_id)
            .await;
    }
    let forced = {
        let mut child = session.child.lock().await;
        terminate_workspace_session_process(&mut child).await?
    };
    if forced {
        if let Some(runtime_manager) = runtime_manager {
            runtime_manager
                .note_force_kill_for_runtime("codex", &workspace_id)
                .await;
        }
    }
    if let Some(runtime_manager) = runtime_manager {
        runtime_manager.record_removed("codex", &workspace_id).await;
    }
    Ok(())
}

async fn terminate_replaced_workspace_session(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
) -> Result<(), String> {
    let workspace_id = session.entry.id.clone();
    session.mark_manual_shutdown();
    let forced = {
        let mut child = session.child.lock().await;
        terminate_workspace_session_process(&mut child).await?
    };
    if let Some(runtime_manager) = runtime_manager {
        if forced {
            runtime_manager
                .note_force_kill_for_runtime("codex", &workspace_id)
                .await;
        }
        runtime_manager
            .clear_stopping_predecessor("codex", &workspace_id, "replacement-stop")
            .await;
    }
    Ok(())
}

async fn rollback_replaced_workspace_session(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: Option<&RuntimeManager>,
    workspace_id: &str,
    previous_session: Arc<WorkspaceSession>,
    replacement_session: Arc<WorkspaceSession>,
) -> Result<(), String> {
    {
        let mut sessions_guard = sessions.lock().await;
        let should_restore_previous = sessions_guard
            .get(workspace_id)
            .map(|current| Arc::ptr_eq(current, &replacement_session))
            .unwrap_or(false);
        if should_restore_previous {
            sessions_guard.insert(workspace_id.to_string(), Arc::clone(&previous_session));
        }
    }

    let forced = {
        replacement_session.mark_manual_shutdown();
        let mut child = replacement_session.child.lock().await;
        terminate_workspace_session_process(&mut child).await?
    };
    if forced {
        if let Some(runtime_manager) = runtime_manager {
            runtime_manager
                .note_force_kill_for_runtime("codex", workspace_id)
                .await;
        }
    }
    if let Some(runtime_manager) = runtime_manager {
        runtime_manager
            .record_ready(&previous_session, "replacement-rollback")
            .await;
    }
    Ok(())
}

pub(crate) async fn replace_workspace_session(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: Option<&RuntimeManager>,
    workspace_id: String,
    new_session: Arc<WorkspaceSession>,
    lease_source: &str,
) -> Result<(), String> {
    replace_workspace_session_with_terminator(
        sessions,
        runtime_manager,
        workspace_id,
        new_session,
        lease_source,
        |session, runtime_manager| {
            Box::pin(
                async move { terminate_replaced_workspace_session(session, runtime_manager).await },
            )
        },
    )
    .await
}

async fn replace_workspace_session_with_terminator<Terminator>(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: Option<&RuntimeManager>,
    workspace_id: String,
    new_session: Arc<WorkspaceSession>,
    lease_source: &str,
    terminate_replaced: Terminator,
) -> Result<(), String>
where
    Terminator: for<'a> FnOnce(
            Arc<WorkspaceSession>,
            Option<&'a RuntimeManager>,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>,
        > + Send,
{
    let replacement_token = if let Some(runtime_manager) = runtime_manager {
        match runtime_manager
            .begin_runtime_replacement("codex", &workspace_id)
            .await
        {
            RuntimeReplacementGate::Leader(token) => {
                runtime_manager
                    .note_guard_event("codex", &workspace_id, lease_source, "replacement-leader")
                    .await;
                Some(token)
            }
            RuntimeReplacementGate::Waiter(notify) => {
                runtime_manager
                    .note_guard_event("codex", &workspace_id, lease_source, "replacement-waiter")
                    .await;
                notify.notified().await;
                let active_session_exists = {
                    let sessions_guard = sessions.lock().await;
                    sessions_guard.contains_key(&workspace_id)
                };
                terminate_workspace_session(Arc::clone(&new_session), None).await?;
                if active_session_exists {
                    return Ok(());
                }
                return Err(format!(
                    "replacement settled without an active runtime for workspace {workspace_id}",
                ));
            }
        }
    } else {
        None
    };

    let old_session = sessions
        .lock()
        .await
        .insert(workspace_id.clone(), Arc::clone(&new_session));
    let result = if let Some(old_session) = old_session {
        if let Some(runtime_manager) = runtime_manager {
            runtime_manager
                .note_replacement_started(&new_session, lease_source, true)
                .await;
        }
        if let Err(error) = terminate_replaced(Arc::clone(&old_session), runtime_manager).await {
            if let Err(rollback_error) = rollback_replaced_workspace_session(
                sessions,
                runtime_manager,
                &workspace_id,
                old_session,
                new_session,
            )
            .await
            {
                Err(format!(
                    "failed to stop replaced workspace session for {workspace_id}: {error}; replacement rollback failed: {rollback_error}",
                ))
            } else {
                Err(format!(
                    "failed to stop replaced workspace session for {workspace_id}: {error}",
                ))
            }
        } else {
            if let Some(runtime_manager) = runtime_manager {
                runtime_manager
                    .record_ready(&new_session, lease_source)
                    .await;
            }
            Ok(())
        }
    } else {
        if let Some(runtime_manager) = runtime_manager {
            runtime_manager
                .record_ready(&new_session, lease_source)
                .await;
        }
        Ok(())
    };

    if let (Some(runtime_manager), Some(token)) = (runtime_manager, replacement_token.as_ref()) {
        runtime_manager.finish_runtime_replacement(token).await;
    }

    result
}

pub(crate) async fn stop_workspace_session(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: &RuntimeManager,
    workspace_id: &str,
) -> Result<(), String> {
    let session = sessions.lock().await.remove(workspace_id);
    if let Some(session) = session {
        terminate_workspace_session(session, Some(runtime_manager)).await?;
    } else {
        runtime_manager.record_removed("codex", workspace_id).await;
    }
    Ok(())
}

async fn evict_workspace_session(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: &RuntimeManager,
    workspace_id: &str,
) -> Result<(), String> {
    let session = sessions.lock().await.remove(workspace_id);
    if let Some(session) = session {
        terminate_workspace_session_for_eviction(session, Some(runtime_manager)).await?;
    } else {
        runtime_manager.record_removed("codex", workspace_id).await;
    }
    Ok(())
}

pub(crate) async fn shutdown_managed_runtimes(state: &AppState) {
    state.runtime_manager.begin_shutdown();
    let active_sessions = {
        let mut sessions = state.sessions.lock().await;
        sessions
            .drain()
            .map(|(_, session)| session)
            .collect::<Vec<_>>()
    };
    for session in active_sessions {
        let _ = terminate_workspace_session(session, Some(&state.runtime_manager)).await;
    }
    let claude_sessions = state.engine_manager.claude_manager.list_sessions().await;
    for (workspace_id, session) in claude_sessions {
        let _ = session.interrupt().await;
        state
            .runtime_manager
            .record_removed("claude", &workspace_id)
            .await;
    }
    if let Ok(untracked_roots) = current_host_untracked_engine_roots("codex", &[]) {
        for pid in untracked_roots {
            if terminate_pid_tree(pid).unwrap_or(false) {
                state.runtime_manager.note_force_kill().await;
            }
        }
    }
    state.runtime_manager.note_shutdown().await;
}

#[cfg(test)]
mod recovery_tests;
#[cfg(test)]
mod tests;
