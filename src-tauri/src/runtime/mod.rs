use std::collections::{BTreeSet, HashMap, HashSet};
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

const LEDGER_FILE_NAME: &str = "runtime-pool-ledger.json";
const TERMINATE_GRACE_MILLIS: u64 = 150;

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
    let temp_path = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
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
    fs::rename(&temp_path, path).map_err(|error| error.to_string())?;
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
    Acquired,
    Streaming,
    GracefulIdle,
    Evictable,
    Stopping,
    Failed,
    ZombieSuspected,
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
    pub(crate) evict_candidate: bool,
    pub(crate) eviction_reason: Option<String>,
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) process_diagnostics: Option<RuntimeProcessDiagnostics>,
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
    evict_candidate: bool,
    manual_release_requested: bool,
    eviction_reason: Option<String>,
    process_diagnostics: Option<RuntimeProcessDiagnostics>,
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
            evict_candidate: false,
            manual_release_requested: false,
            eviction_reason: None,
            process_diagnostics: None,
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

    fn has_active_leases(&self) -> bool {
        !self.turn_leases.is_empty() || !self.stream_leases.is_empty()
    }
}

#[derive(Debug)]
pub(crate) struct RuntimeManager {
    entries: Mutex<HashMap<String, RuntimeEntry>>,
    diagnostics: Mutex<RuntimePoolDiagnostics>,
    startup_gates: Mutex<HashMap<String, Arc<Notify>>>,
    ledger_path: PathBuf,
    shutting_down: AtomicBool,
}

#[derive(Debug, Clone)]
pub(crate) enum RuntimeAcquireGate {
    Leader,
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
            startup_gates: Mutex::new(HashMap::new()),
            ledger_path: data_dir.join(LEDGER_FILE_NAME),
            shutting_down: AtomicBool::new(false),
        }
    }

    pub(crate) async fn begin_runtime_acquire(
        &self,
        engine: &str,
        workspace_id: &str,
    ) -> RuntimeAcquireGate {
        let key = runtime_key(engine, workspace_id);
        let mut startup_gates = self.startup_gates.lock().await;
        if let Some(notify) = startup_gates.get(&key) {
            return RuntimeAcquireGate::Waiter(notify.clone());
        }
        startup_gates.insert(key, Arc::new(Notify::new()));
        RuntimeAcquireGate::Leader
    }

    pub(crate) async fn finish_runtime_acquire(&self, engine: &str, workspace_id: &str) {
        let key = runtime_key(engine, workspace_id);
        let notify = self.startup_gates.lock().await.remove(&key);
        if let Some(notify) = notify {
            notify.notify_waiters();
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

    pub(crate) async fn record_starting(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        _source: &str,
    ) {
        let mut entries = self.entries.lock().await;
        let runtime = Self::upsert_entry(&mut entries, entry, engine);
        runtime.update_workspace(entry, engine);
        runtime.starting = true;
        runtime.stopping = false;
        runtime.error = None;
        runtime.evict_candidate = false;
        runtime.eviction_reason = None;
        runtime.process_diagnostics = None;
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_ready(&self, session: &WorkspaceSession, _source: &str) {
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
        runtime.process_diagnostics = pid.and_then(snapshot_process_diagnostics);
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
        runtime.process_diagnostics = Some(diagnostics);
        runtime.turn_leases.insert(source.to_string());
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn touch(&self, engine: &str, workspace_id: &str, _source: &str) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.last_used_at_ms = now_millis();
            runtime.evict_candidate = false;
            runtime.eviction_reason = None;
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
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn release_turn_lease(&self, engine: &str, workspace_id: &str, source: &str) {
        let key = runtime_key(engine, workspace_id);
        let mut entries = self.entries.lock().await;
        if let Some(runtime) = entries.get_mut(&key) {
            runtime.turn_leases.remove(source);
            runtime.last_used_at_ms = now_millis();
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
        }
        drop(entries);
        let _ = self.persist_ledger().await;
    }

    pub(crate) async fn record_failure(
        &self,
        entry: &WorkspaceEntry,
        engine: &str,
        _source: &str,
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
            runtime.evict_candidate = true;
            runtime.eviction_reason = Some("manual-release".to_string());
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
                    || entry.has_active_leases()
                    || entry.evict_candidate
                    || entry.starting
            })
            .cloned()
            .map(|entry| {
                let state = Self::classify_state(&entry);
                let turn_lease_count = entry.turn_leases.len() as u32;
                let stream_lease_count = entry.stream_leases.len() as u32;
                let lease_sources = entry.lease_sources();
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
                    evict_candidate: entry.evict_candidate,
                    eviction_reason: entry.eviction_reason,
                    error: entry.error,
                    process_diagnostics: entry
                        .pid
                        .and_then(snapshot_process_diagnostics)
                        .or(entry.process_diagnostics),
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
                    entry.has_active_leases(),
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
                if entry.has_active_leases() {
                    diagnostics.lease_blocked_eviction_count += 1;
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
            .map(|entry| !entry.pinned && !entry.has_active_leases())
            .unwrap_or(true)
    }

    async fn persist_ledger(&self) -> Result<(), String> {
        let rows = self
            .entries
            .lock()
            .await
            .values()
            .filter(|entry| entry.pid.is_some() || entry.error.is_some())
            .cloned()
            .map(|entry| {
                let state = Self::classify_state(&entry);
                let turn_lease_count = entry.turn_leases.len() as u32;
                let stream_lease_count = entry.stream_leases.len() as u32;
                let lease_sources = entry.lease_sources();
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
                    evict_candidate: entry.evict_candidate,
                    eviction_reason: entry.eviction_reason,
                    error: entry.error,
                    process_diagnostics: entry.process_diagnostics,
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
        let _ = close_runtime(state, &candidate.engine, &candidate.workspace_id).await;
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
    let workspace_id = session.entry.id.clone();
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
            runtime_manager.note_force_kill().await;
        }
    }
    if let Some(runtime_manager) = runtime_manager {
        runtime_manager.record_removed("codex", &workspace_id).await;
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
    if let Some(runtime_manager) = runtime_manager {
        runtime_manager
            .record_ready(&new_session, lease_source)
            .await;
    }
    let old_session = sessions.lock().await.insert(workspace_id, new_session);
    if let Some(old_session) = old_session {
        terminate_workspace_session(old_session, runtime_manager).await?;
    }
    Ok(())
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

fn current_host_untracked_engine_roots(
    engine: &str,
    tracked_pids: &[u32],
) -> Result<Vec<u32>, String> {
    let Some(process_rows) = snapshot_process_rows() else {
        return Ok(Vec::new());
    };
    let rows_by_pid = process_rows
        .iter()
        .map(|row| (row.pid, row))
        .collect::<HashMap<_, _>>();
    let tracked = tracked_pids.iter().copied().collect::<HashSet<_>>();
    let host_pid = std::process::id();
    let mut roots = Vec::new();
    for row in &process_rows {
        if row.ppid != host_pid {
            continue;
        }
        if tracked.contains(&row.pid) {
            continue;
        }
        if is_engine_root_process(engine, row, &rows_by_pid) {
            roots.push(row.pid);
        }
    }
    Ok(roots)
}

fn terminate_pid_tree(pid: u32) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let status = crate::utils::std_command("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .status()
            .map_err(|error| error.to_string())?;
        return Ok(status.success());
    }

    #[cfg(unix)]
    {
        let pgid = pid as libc::pid_t;
        let terminate_status = unsafe { libc::kill(-pgid, libc::SIGTERM) };
        if terminate_status == 0 {
            std::thread::sleep(Duration::from_millis(TERMINATE_GRACE_MILLIS));
        }
        let kill_status = unsafe { libc::kill(-pgid, libc::SIGKILL) };
        if kill_status != 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ESRCH) {
                return Err(error.to_string());
            }
        }
        return Ok(true);
    }
}

fn merge_process_diagnostics(pids: &[u32], category: &str) -> RuntimeProcessDiagnostics {
    let mut diagnostics = RuntimeProcessDiagnostics {
        root_processes: pids.len() as u32,
        total_processes: 0,
        node_processes: 0,
        root_command: None,
        managed_runtime_processes: 0,
        resume_helper_processes: 0,
        orphan_residue_processes: 0,
    };
    for pid in pids {
        if let Some(snapshot) = snapshot_process_diagnostics(*pid) {
            diagnostics.total_processes = diagnostics
                .total_processes
                .saturating_add(snapshot.total_processes);
            diagnostics.node_processes = diagnostics
                .node_processes
                .saturating_add(snapshot.node_processes);
            if diagnostics.root_command.is_none() {
                diagnostics.root_command = snapshot.root_command;
            }
        } else {
            diagnostics.total_processes = diagnostics.total_processes.saturating_add(1);
        }
    }
    match category {
        "managed-runtime" => diagnostics.managed_runtime_processes = diagnostics.node_processes,
        "resume-helper" => diagnostics.resume_helper_processes = diagnostics.node_processes,
        "orphan-residue" => diagnostics.orphan_residue_processes = diagnostics.node_processes,
        _ => {}
    }
    diagnostics
}

#[derive(Debug, Clone)]
struct ProcessSnapshotRow {
    pid: u32,
    ppid: u32,
    command: String,
    args: String,
}

fn parse_process_rows_unix_output(stdout: &str) -> Vec<ProcessSnapshotRow> {
    let mut rows = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let pid = parts.next().and_then(|value| value.parse::<u32>().ok());
        let ppid = parts.next().and_then(|value| value.parse::<u32>().ok());
        let command = parts.next().map(|value| value.trim().to_string());
        let args = parts.collect::<Vec<_>>().join(" ");
        let (pid, ppid, command) = match (pid, ppid, command) {
            (Some(pid), Some(ppid), Some(command)) if !command.is_empty() => (pid, ppid, command),
            _ => continue,
        };
        rows.push(ProcessSnapshotRow {
            pid,
            ppid,
            command,
            args,
        });
    }
    rows
}

fn parse_process_rows_windows_payload(payload: &Value) -> Vec<ProcessSnapshotRow> {
    let rows = payload
        .as_array()
        .cloned()
        .unwrap_or_else(|| vec![payload.clone()]);
    let mut parsed = Vec::new();
    for row in rows {
        let obj = match row.as_object() {
            Some(obj) => obj,
            None => continue,
        };
        let pid = obj
            .get("ProcessId")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let ppid = obj
            .get("ParentProcessId")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let command = obj
            .get("Name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        let args = obj
            .get("CommandLine")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .or_else(|| command.clone());
        let (pid, ppid, command, args) = match (pid, ppid, command, args) {
            (Some(pid), Some(ppid), Some(command), Some(args)) => (pid, ppid, command, args),
            _ => continue,
        };
        parsed.push(ProcessSnapshotRow {
            pid,
            ppid,
            command,
            args,
        });
    }
    parsed
}

#[cfg(unix)]
fn snapshot_process_rows() -> Option<Vec<ProcessSnapshotRow>> {
    let output = crate::utils::std_command("ps")
        .args(["-axo", "pid=,ppid=,comm=,args="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Some(parse_process_rows_unix_output(&stdout))
}

#[cfg(windows)]
fn snapshot_process_rows() -> Option<Vec<ProcessSnapshotRow>> {
    fn read_process_rows(shell_bin: &str) -> Option<Vec<ProcessSnapshotRow>> {
        let output = crate::utils::std_command(shell_bin)
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return None;
        }
        let payload = serde_json::from_str::<Value>(&stdout).ok()?;
        Some(parse_process_rows_windows_payload(&payload))
    }

    read_process_rows("powershell").or_else(|| read_process_rows("pwsh"))
}

#[cfg(not(any(unix, windows)))]
fn snapshot_process_rows() -> Option<Vec<ProcessSnapshotRow>> {
    None
}

fn process_descendant_count(root_pid: u32, parent_to_children: &HashMap<u32, Vec<u32>>) -> u32 {
    let mut stack = vec![root_pid];
    let mut visited = HashSet::new();
    let mut total = 0u32;
    while let Some(current_pid) = stack.pop() {
        if !visited.insert(current_pid) {
            continue;
        }
        total = total.saturating_add(1);
        if let Some(children) = parent_to_children.get(&current_pid) {
            stack.extend(children.iter().copied());
        }
    }
    total
}

fn is_codex_app_server_process(row: &ProcessSnapshotRow) -> bool {
    let command = row.command.to_ascii_lowercase();
    let args = row.args.to_ascii_lowercase();
    (command.contains("codex") || args.contains("codex")) && args.contains("app-server")
}

fn is_engine_process_row(engine: &str, row: &ProcessSnapshotRow) -> bool {
    match normalize_engine(engine).as_str() {
        "codex" => is_codex_app_server_process(row),
        "claude" => {
            let command = row.command.to_ascii_lowercase();
            let args = row.args.to_ascii_lowercase();
            (command.contains("claude") || args.contains("claude"))
                && !args.contains("claude-agent-acp")
        }
        _ => false,
    }
}

fn is_engine_root_process(
    engine: &str,
    row: &ProcessSnapshotRow,
    rows_by_pid: &HashMap<u32, &ProcessSnapshotRow>,
) -> bool {
    if !is_engine_process_row(engine, row) {
        return false;
    }
    rows_by_pid
        .get(&row.ppid)
        .map(|parent| !is_engine_process_row(engine, parent))
        .unwrap_or(true)
}

fn build_engine_observability(rows: &[RuntimePoolRow]) -> Vec<RuntimeEngineObservability> {
    let engines = ["codex", "claude"];
    let mut observability = engines
        .into_iter()
        .map(|engine| {
            let engine_rows = rows
                .iter()
                .filter(|row| normalize_engine(&row.engine) == engine)
                .collect::<Vec<_>>();
            RuntimeEngineObservability {
                engine: engine.to_string(),
                session_count: engine_rows.len() as u32,
                tracked_root_processes: engine_rows
                    .iter()
                    .map(|row| {
                        row.process_diagnostics
                            .as_ref()
                            .map(|item| item.root_processes)
                            .unwrap_or(u32::from(row.pid.is_some()))
                    })
                    .sum(),
                tracked_total_processes: engine_rows
                    .iter()
                    .map(|row| {
                        row.process_diagnostics
                            .as_ref()
                            .map(|item| item.total_processes)
                            .unwrap_or(u32::from(row.pid.is_some()))
                    })
                    .sum(),
                tracked_node_processes: engine_rows
                    .iter()
                    .map(|row| {
                        row.process_diagnostics
                            .as_ref()
                            .map(|item| item.node_processes)
                            .unwrap_or(0)
                    })
                    .sum(),
                host_managed_root_processes: 0,
                host_unmanaged_root_processes: 0,
                external_root_processes: 0,
                host_unmanaged_total_processes: 0,
                external_total_processes: 0,
            }
        })
        .collect::<Vec<_>>();

    let Some(process_rows) = snapshot_process_rows() else {
        return observability;
    };
    let rows_by_pid = process_rows
        .iter()
        .map(|row| (row.pid, row))
        .collect::<HashMap<_, _>>();
    let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
    for row in &process_rows {
        parent_to_children
            .entry(row.ppid)
            .or_default()
            .push(row.pid);
    }
    let host_pid = std::process::id();

    for item in &mut observability {
        let tracked_pids = rows
            .iter()
            .filter(|row| normalize_engine(&row.engine) == item.engine)
            .filter_map(|row| row.pid)
            .collect::<HashSet<_>>();
        for row in &process_rows {
            if !is_engine_root_process(&item.engine, row, &rows_by_pid) {
                continue;
            }
            let subtree_total = process_descendant_count(row.pid, &parent_to_children);
            if tracked_pids.contains(&row.pid) {
                if row.ppid == host_pid {
                    item.host_managed_root_processes =
                        item.host_managed_root_processes.saturating_add(1);
                }
                continue;
            }
            if row.ppid == host_pid {
                item.host_unmanaged_root_processes =
                    item.host_unmanaged_root_processes.saturating_add(1);
                item.host_unmanaged_total_processes = item
                    .host_unmanaged_total_processes
                    .saturating_add(subtree_total);
            } else {
                item.external_root_processes = item.external_root_processes.saturating_add(1);
                item.external_total_processes =
                    item.external_total_processes.saturating_add(subtree_total);
            }
        }
    }

    observability
}

fn snapshot_process_diagnostics(pid: u32) -> Option<RuntimeProcessDiagnostics> {
    #[cfg(windows)]
    {
        return snapshot_process_diagnostics_windows(pid);
    }

    #[cfg(unix)]
    {
        return snapshot_process_diagnostics_unix(pid);
    }

    #[allow(unreachable_code)]
    None
}

#[cfg(unix)]
fn snapshot_process_diagnostics_unix(pid: u32) -> Option<RuntimeProcessDiagnostics> {
    let stdout = snapshot_process_rows()?;
    let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut command_by_pid: HashMap<u32, String> = HashMap::new();
    for row in stdout {
        command_by_pid.insert(row.pid, row.command.clone());
        parent_to_children
            .entry(row.ppid)
            .or_default()
            .push(row.pid);
    }
    build_process_diagnostics(pid, &parent_to_children, &command_by_pid)
}

#[cfg(windows)]
fn snapshot_process_diagnostics_windows(pid: u32) -> Option<RuntimeProcessDiagnostics> {
    let rows = snapshot_process_rows()?;
    let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut command_by_pid: HashMap<u32, String> = HashMap::new();
    for row in rows {
        command_by_pid.insert(row.pid, row.command.clone());
        parent_to_children
            .entry(row.ppid)
            .or_default()
            .push(row.pid);
    }

    build_process_diagnostics(pid, &parent_to_children, &command_by_pid)
}

fn build_process_diagnostics(
    root_pid: u32,
    parent_to_children: &HashMap<u32, Vec<u32>>,
    command_by_pid: &HashMap<u32, String>,
) -> Option<RuntimeProcessDiagnostics> {
    let mut stack = vec![root_pid];
    let mut visited = HashSet::new();
    let mut total_processes = 0u32;
    let mut node_processes = 0u32;

    while let Some(current_pid) = stack.pop() {
        if !visited.insert(current_pid) {
            continue;
        }
        total_processes = total_processes.saturating_add(1);
        if let Some(command) = command_by_pid.get(&current_pid) {
            let normalized = command.to_ascii_lowercase();
            if normalized == "node"
                || normalized == "node.exe"
                || normalized.ends_with("/node")
                || normalized.ends_with("\\node.exe")
            {
                node_processes = node_processes.saturating_add(1);
            }
        }
        if let Some(children) = parent_to_children.get(&current_pid) {
            stack.extend(children.iter().copied());
        }
    }

    if total_processes == 0 {
        return None;
    }

    Some(RuntimeProcessDiagnostics {
        root_processes: 1,
        total_processes,
        node_processes,
        root_command: command_by_pid.get(&root_pid).cloned(),
        managed_runtime_processes: node_processes,
        resume_helper_processes: 0,
        orphan_residue_processes: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        build_engine_observability, is_engine_root_process, parse_process_rows_unix_output,
        parse_process_rows_windows_payload, write_json_atomically, ProcessSnapshotRow,
        RuntimeEngineObservability, RuntimeManager, RuntimeProcessDiagnostics, RuntimeState,
    };
    use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
    use serde_json::json;
    use std::fs;
    use uuid::Uuid;

    fn workspace_entry(id: &str) -> WorkspaceEntry {
        let mut settings = WorkspaceSettings::default();
        settings.engine_type = Some("codex".to_string());
        WorkspaceEntry {
            id: id.to_string(),
            name: format!("Workspace {id}"),
            path: format!("/tmp/{id}"),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings,
        }
    }

    #[tokio::test]
    async fn reconcile_never_marks_leased_runtime_evictable() {
        let manager = RuntimeManager::new(&std::env::temp_dir());
        let entry = workspace_entry("leased");
        manager.record_starting(&entry, "codex", "test").await;
        manager.acquire_turn_lease(&entry, "codex", "turn:a").await;
        {
            let mut entries = manager.entries.lock().await;
            let runtime = entries
                .get_mut("codex::leased")
                .expect("runtime entry should exist");
            runtime.session_exists = true;
            runtime.starting = false;
            runtime.last_used_at_ms = 0;
        }
        let mut settings = AppSettings::default();
        settings.codex_warm_ttl_seconds = 1;
        let candidates = manager.reconcile_pool(&settings).await;
        assert!(candidates.is_empty());
        let snapshot = manager.snapshot(&settings).await;
        assert!(matches!(snapshot.rows[0].state, RuntimeState::Acquired));
    }

    #[tokio::test]
    async fn reconcile_marks_old_idle_runtime_evictable() {
        let manager = RuntimeManager::new(&std::env::temp_dir());
        let entry = workspace_entry("idle");
        manager.record_starting(&entry, "codex", "test").await;
        {
            let mut entries = manager.entries.lock().await;
            let runtime = entries
                .get_mut("codex::idle")
                .expect("runtime entry should exist");
            runtime.session_exists = true;
            runtime.starting = false;
            runtime.last_used_at_ms = 0;
        }
        let mut settings = AppSettings::default();
        settings.codex_warm_ttl_seconds = 1;
        let candidates = manager.reconcile_pool(&settings).await;
        assert_eq!(candidates.len(), 1);
        let snapshot = manager.snapshot(&settings).await;
        assert!(matches!(snapshot.rows[0].state, RuntimeState::Evictable));
    }

    #[test]
    fn engine_observability_uses_tracked_snapshot_fields() {
        let rows = vec![super::RuntimePoolRow {
            workspace_id: "workspace-a".to_string(),
            workspace_name: "Workspace A".to_string(),
            workspace_path: "/tmp/workspace-a".to_string(),
            engine: "codex".to_string(),
            state: RuntimeState::Acquired,
            pid: Some(4242),
            wrapper_kind: Some("node".to_string()),
            resolved_bin: Some("/opt/homebrew/bin/codex".to_string()),
            started_at_ms: Some(1),
            last_used_at_ms: 2,
            pinned: false,
            turn_lease_count: 1,
            stream_lease_count: 0,
            lease_sources: vec!["turn:test".to_string()],
            evict_candidate: false,
            eviction_reason: None,
            error: None,
            process_diagnostics: Some(RuntimeProcessDiagnostics {
                root_processes: 1,
                total_processes: 2,
                node_processes: 1,
                root_command: Some("node".to_string()),
                managed_runtime_processes: 1,
                resume_helper_processes: 0,
                orphan_residue_processes: 0,
            }),
        }];

        let observability = build_engine_observability(&rows);
        let codex = observability
            .into_iter()
            .find(|item| item.engine == "codex")
            .unwrap_or(RuntimeEngineObservability {
                engine: "codex".to_string(),
                session_count: 0,
                tracked_root_processes: 0,
                tracked_total_processes: 0,
                tracked_node_processes: 0,
                host_managed_root_processes: 0,
                host_unmanaged_root_processes: 0,
                external_root_processes: 0,
                host_unmanaged_total_processes: 0,
                external_total_processes: 0,
            });

        assert_eq!(codex.session_count, 1);
        assert_eq!(codex.tracked_root_processes, 1);
        assert_eq!(codex.tracked_total_processes, 2);
        assert_eq!(codex.tracked_node_processes, 1);
    }

    #[test]
    fn codex_root_detector_ignores_vendor_child() {
        let root = ProcessSnapshotRow {
            pid: 100,
            ppid: 1,
            command: "node".to_string(),
            args: "node /opt/homebrew/bin/codex app-server".to_string(),
        };
        let vendor_child = ProcessSnapshotRow {
            pid: 101,
            ppid: 100,
            command: "codex".to_string(),
            args: "/vendor/codex app-server".to_string(),
        };
        let rows_by_pid = [(100, &root), (101, &vendor_child)]
            .into_iter()
            .collect::<std::collections::HashMap<_, _>>();

        assert!(is_engine_root_process("codex", &root, &rows_by_pid));
        assert!(!is_engine_root_process(
            "codex",
            &vendor_child,
            &rows_by_pid
        ));
    }

    #[test]
    fn parse_process_rows_unix_output_skips_malformed_rows() {
        let rows = parse_process_rows_unix_output(
            "100 1 node node /opt/homebrew/bin/codex app-server\ninvalid row\n101 100 codex /vendor/codex app-server\n",
        );

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].pid, 100);
        assert_eq!(rows[0].ppid, 1);
        assert_eq!(rows[0].command, "node");
        assert!(rows[0].args.contains("codex app-server"));
    }

    #[test]
    fn parse_process_rows_windows_payload_reads_command_line() {
        let rows = parse_process_rows_windows_payload(&json!([
            {
                "ProcessId": 200,
                "ParentProcessId": 50,
                "Name": "node.exe",
                "CommandLine": "\"C:\\\\Program Files\\\\node.exe\" C:\\\\Users\\\\demo\\\\codex app-server"
            },
            {
                "ProcessId": 201,
                "ParentProcessId": 200,
                "Name": "codex.exe",
                "CommandLine": null
            }
        ]));

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].pid, 200);
        assert_eq!(rows[0].command, "node.exe");
        assert!(rows[0].args.contains("codex app-server"));
        assert_eq!(rows[1].args, "codex.exe");
    }

    #[test]
    fn write_json_atomically_replaces_existing_file() {
        let temp_dir =
            std::env::temp_dir().join(format!("ccgui-runtime-ledger-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("runtime-pool-ledger.json");

        fs::write(&path, "{\"old\":true}").expect("seed existing file");
        write_json_atomically(&path, "{\"new\":true}").expect("replace existing file");

        let persisted = fs::read_to_string(&path).expect("read persisted file");
        assert_eq!(persisted, "{\"new\":true}");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
