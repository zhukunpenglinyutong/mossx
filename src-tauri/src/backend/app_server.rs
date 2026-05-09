use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;
#[cfg(test)]
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
#[cfg(test)]
use tokio::process::Command;
use tokio::process::{Child, ChildStdin};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::timeout;

use crate::backend::events::{AppServerEvent, EventSink, TerminalOutput};
use crate::codex::collaboration_policy::strict_local_collaboration_profile_enabled;
use crate::codex::thread_mode_state::ThreadModeState;
use crate::runtime::{RuntimeEndedRecord, RuntimeManager};
use crate::types::WorkspaceEntry;

#[path = "app_server_event_helpers.rs"]
mod event_helpers;
use event_helpers::*;
#[path = "app_server_plan_enforcement.rs"]
mod plan_enforcement;
use plan_enforcement::*;
#[path = "app_server_auto_compaction.rs"]
mod app_server_auto_compaction;
use app_server_auto_compaction::*;
#[path = "app_server_runtime_lifecycle.rs"]
mod runtime_lifecycle;
use runtime_lifecycle::*;

#[derive(Clone)]
struct DeferredStartupEventSink<E: EventSink> {
    inner: E,
    state: Arc<StdMutex<DeferredStartupEventState>>,
}

enum DeferredStartupEventMode {
    Buffering,
    Forwarding,
    Discarding,
}

enum DeferredStartupEvent {
    AppServer(AppServerEvent),
    Terminal(TerminalOutput),
}

struct DeferredStartupEventState {
    mode: DeferredStartupEventMode,
    events: Vec<DeferredStartupEvent>,
}

impl<E: EventSink> DeferredStartupEventSink<E> {
    fn new(inner: E) -> Self {
        Self {
            inner,
            state: Arc::new(StdMutex::new(DeferredStartupEventState {
                mode: DeferredStartupEventMode::Buffering,
                events: Vec::new(),
            })),
        }
    }

    fn flush_and_forward(&self) {
        let events = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.mode = DeferredStartupEventMode::Forwarding;
            std::mem::take(&mut state.events)
        };
        for event in events {
            self.emit_deferred_event(event);
        }
    }

    fn discard(&self) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.mode = DeferredStartupEventMode::Discarding;
        state.events.clear();
    }

    fn emit_deferred_event(&self, event: DeferredStartupEvent) {
        match event {
            DeferredStartupEvent::AppServer(event) => self.inner.emit_app_server_event(event),
            DeferredStartupEvent::Terminal(event) => self.inner.emit_terminal_output(event),
        }
    }
}

impl<E: EventSink> EventSink for DeferredStartupEventSink<E> {
    fn emit_app_server_event(&self, event: AppServerEvent) {
        let mut forward_event = Some(event);
        {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            match state.mode {
                DeferredStartupEventMode::Buffering => {
                    if let Some(event) = forward_event.take() {
                        state.events.push(DeferredStartupEvent::AppServer(event));
                    }
                }
                DeferredStartupEventMode::Forwarding => {}
                DeferredStartupEventMode::Discarding => {
                    forward_event = None;
                }
            }
        }
        if let Some(event) = forward_event {
            self.inner.emit_app_server_event(event);
        }
    }

    fn emit_terminal_output(&self, event: TerminalOutput) {
        let mut forward_event = Some(event);
        {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            match state.mode {
                DeferredStartupEventMode::Buffering => {
                    if let Some(event) = forward_event.take() {
                        state.events.push(DeferredStartupEvent::Terminal(event));
                    }
                }
                DeferredStartupEventMode::Forwarding => {}
                DeferredStartupEventMode::Discarding => {
                    forward_event = None;
                }
            }
        }
        if let Some(event) = forward_event {
            self.inner.emit_terminal_output(event);
        }
    }
}

#[allow(unused_imports)]
pub(crate) use crate::backend::app_server_cli::{
    apply_codex_app_server_args, build_codex_command_from_launch_context,
    build_codex_command_with_bin, build_codex_path_env, can_retry_wrapper_compatibility_launch,
    can_retry_wrapper_launch, check_cli_binary, check_codex_installation,
    codex_args_override_instructions, codex_external_spec_priority_config_arg,
    probe_codex_app_server, resolve_codex_launch_context,
    visible_console_fallback_enabled_from_env, wrapper_kind_for_binary,
    CodexAppServerLaunchOptions, CodexAppServerProbeStatus, CodexLaunchContext,
};
#[allow(unused_imports)]
pub use crate::backend::app_server_cli::{
    build_command_for_binary, build_command_for_binary_with_console, find_cli_binary,
    get_cli_debug_info,
};

const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 300;
const DEFAULT_INITIAL_TURN_START_TIMEOUT_MS: u64 = 120_000;
const MIN_INITIAL_TURN_START_TIMEOUT_MS: u64 = 30_000;
const MAX_INITIAL_TURN_START_TIMEOUT_MS: u64 = 240_000;
const DEFAULT_RESUME_AFTER_USER_INPUT_TIMEOUT_MS: u64 = 360_000;
const MIN_RESUME_AFTER_USER_INPUT_TIMEOUT_MS: u64 = 10_000;
const MAX_RESUME_AFTER_USER_INPUT_TIMEOUT_MS: u64 = 600_000;
const TIMED_OUT_REQUEST_GRACE_MS: u64 = 600_000;

#[derive(Debug, Clone)]
struct TimedOutRequest {
    method: String,
    thread_id: Option<String>,
    timed_out_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RuntimeShutdownSource {
    UserManualShutdown,
    ManualRelease,
    InternalReplacement,
    StaleReuseCleanup,
    SettingsRestart,
    AppExit,
    IdleEviction,
    CompatibilityManual,
}

impl RuntimeShutdownSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::UserManualShutdown => "user_manual_shutdown",
            Self::ManualRelease => "manual_release",
            Self::InternalReplacement => "internal_replacement",
            Self::StaleReuseCleanup => "stale_reuse_cleanup",
            Self::SettingsRestart => "settings_restart",
            Self::AppExit => "app_exit",
            Self::IdleEviction => "idle_eviction",
            Self::CompatibilityManual => "manual_shutdown",
        }
    }

    fn stale_reuse_reason(self) -> &'static str {
        match self {
            Self::UserManualShutdown => "user-manual-shutdown-requested",
            Self::ManualRelease => "manual-release-requested",
            Self::InternalReplacement => "internal-replacement-shutdown-requested",
            Self::StaleReuseCleanup => "stale-reuse-cleanup-shutdown-requested",
            Self::SettingsRestart => "settings-restart-shutdown-requested",
            Self::AppExit => "app-exit-shutdown-requested",
            Self::IdleEviction => "idle-eviction-shutdown-requested",
            Self::CompatibilityManual => "manual-shutdown-requested",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) enum ResumePendingSource {
    UserInputResume,
    QueueFusionCutover { previous_turn_id: Option<String> },
}

impl ResumePendingSource {
    fn runtime_source_label(&self) -> &'static str {
        match self {
            Self::UserInputResume => "user-input-resume",
            Self::QueueFusionCutover { .. } => "queue-fusion-cutover",
        }
    }

    fn stalled_reason_code(&self) -> &'static str {
        match self {
            Self::UserInputResume => "resume_timeout",
            Self::QueueFusionCutover { .. } => "fusion_resume_timeout",
        }
    }

    fn stalled_stage(&self) -> &'static str {
        match self {
            Self::UserInputResume => "resume-pending",
            Self::QueueFusionCutover { .. } => "fusion-resume-pending",
        }
    }

    fn stalled_message(&self, timeout_ms: u64) -> String {
        match self {
            Self::UserInputResume => format!(
                "[TURN_STALLED] User input was submitted, but Codex did not resume within {}s. You can continue from the latest visible state.",
                timeout_ms.div_ceil(1000)
            ),
            Self::QueueFusionCutover { .. } => format!(
                "[TURN_STALLED] Queue fusion switched to a successor run, but Codex did not resume within {}s. You can continue from the latest visible state.",
                timeout_ms.div_ceil(1000)
            ),
        }
    }

    fn should_clear_on_event(&self, method: Option<&str>, turn_id: Option<&str>) -> bool {
        match self {
            Self::UserInputResume => true,
            Self::QueueFusionCutover { previous_turn_id } => {
                if !matches!(method, Some("turn/started")) {
                    return false;
                }
                let normalized_turn_id = turn_id.map(str::trim).filter(|value| !value.is_empty());
                match (previous_turn_id.as_deref(), normalized_turn_id) {
                    (Some(previous_turn_id), Some(candidate_turn_id)) => {
                        candidate_turn_id != previous_turn_id
                    }
                    (Some(_), None) => false,
                    (None, Some(_)) => true,
                    (None, None) => false,
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
struct ResumePendingTurnState {
    nonce: String,
    turn_id: Option<String>,
    started_at_ms: u64,
    timeout_ms: u64,
    source: ResumePendingSource,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis() as u64
}

fn resolve_initial_turn_start_timeout_ms() -> u64 {
    let configured = env::var("MOSSX_INITIAL_TURN_START_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_INITIAL_TURN_START_TIMEOUT_MS);
    configured.clamp(
        MIN_INITIAL_TURN_START_TIMEOUT_MS,
        MAX_INITIAL_TURN_START_TIMEOUT_MS,
    )
}

fn resolve_resume_after_user_input_timeout_ms() -> u64 {
    let configured = env::var("MOSSX_RESUME_AFTER_USER_INPUT_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_RESUME_AFTER_USER_INPUT_TIMEOUT_MS);
    configured.clamp(
        MIN_RESUME_AFTER_USER_INPUT_TIMEOUT_MS,
        MAX_RESUME_AFTER_USER_INPUT_TIMEOUT_MS,
    )
}

fn extract_thread_id(value: &Value) -> Option<String> {
    let params = value.get("params")?;

    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .or_else(|| params.get("turn").and_then(|turn| turn.get("threadId")))
        .or_else(|| params.get("turn").and_then(|turn| turn.get("thread_id")))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .get("thread")
                .and_then(|thread| thread.get("id"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
}

fn extract_turn_id(value: &Value) -> Option<String> {
    let params = value.get("params")?;

    params
        .get("turnId")
        .or_else(|| params.get("turn_id"))
        .or_else(|| params.get("turn").and_then(|turn| turn.get("id")))
        .and_then(|turn| turn.as_str())
        .map(ToOwned::to_owned)
}

fn extract_event_method(value: &Value) -> Option<&str> {
    value.get("method").and_then(Value::as_str)
}

fn extract_request_thread_id(params: &Value) -> Option<String> {
    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn should_skip_codex_stderr_line(line: &str) -> bool {
    let normalized = line.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return true;
    }
    normalized.contains("rmcp::transport::worker")
        && normalized.contains("transport channel closed")
        && normalized.contains("authrequired(")
}

pub(crate) struct WorkspaceSession {
    pub(crate) entry: WorkspaceEntry,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) wrapper_kind: String,
    pub(crate) resolved_bin: String,
    pub(crate) process_id: Option<u32>,
    pub(crate) started_at_ms: u64,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    timed_out_requests: Mutex<HashMap<u64, TimedOutRequest>>,
    pub(crate) next_id: AtomicU64,
    /// Callbacks for background threads - events for these threadIds are sent through the channel
    pub(crate) background_thread_callbacks: Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>,
    pub(crate) thread_mode_state: ThreadModeState,
    pub(crate) mode_enforcement_enabled: AtomicBool,
    pub(crate) collaboration_mode_supported: AtomicBool,
    auto_compaction_threshold_percent: f64,
    auto_compaction_enabled: bool,
    auto_compaction_thread_state: Mutex<HashMap<String, AutoCompactionThreadState>>,
    plan_turn_state: Mutex<HashMap<String, PlanTurnState>>,
    local_user_input_requests: Mutex<HashMap<String, String>>,
    local_request_seq: AtomicU64,
    resume_pending_turns: Mutex<HashMap<String, ResumePendingTurnState>>,
    runtime_manager: StdMutex<Option<Arc<RuntimeManager>>>,
    active_turns: Mutex<HashMap<String, String>>,
    manual_shutdown_requested: AtomicBool,
    shutdown_source: StdMutex<Option<RuntimeShutdownSource>>,
    shutdown_had_active_work_protection: AtomicBool,
    runtime_end_emitted: AtomicBool,
}

impl WorkspaceSession {
    pub(crate) fn runtime_generation(&self) -> String {
        match self.process_id {
            Some(process_id) => format!("pid:{process_id}:startedAt:{}", self.started_at_ms),
            None => format!("pid:unknown:startedAt:{}", self.started_at_ms),
        }
    }

    fn configure_spawn_command(cmd: &mut tokio::process::Command) {
        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                if libc::setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
    }

    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    pub(crate) async fn probe_health(&self, timeout_duration: Duration) -> Result<(), String> {
        self.send_request_with_timeout("model/list", json!({}), timeout_duration)
            .await
            .map(|_| ())
    }

    pub(crate) async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.send_request_with_timeout(
            method,
            params,
            Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS),
        )
        .await
    }

    pub(crate) async fn send_request_with_timeout(
        &self,
        method: &str,
        params: Value,
        timeout_duration: Duration,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        if let Err(error) = self
            .write_message(json!({ "id": id, "method": method, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        // Add timeout to prevent pending entries from leaking forever
        // when the child process crashes without sending a response.
        match timeout(timeout_duration, rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(error))) => Err(error),
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&id);
                Err("request canceled".to_string())
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                self.record_timed_out_request(id, method, extract_request_thread_id(&params))
                    .await;
                Err("request timed out".to_string())
            }
        }
    }

    pub(crate) fn default_request_timeout(&self) -> Duration {
        Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS)
    }

    pub(crate) fn initial_turn_start_timeout(&self) -> Duration {
        Duration::from_millis(resolve_initial_turn_start_timeout_ms())
    }

    pub(crate) fn attach_runtime_manager(&self, runtime_manager: Arc<RuntimeManager>) {
        *self
            .runtime_manager
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(runtime_manager);
    }

    fn runtime_manager(&self) -> Option<Arc<RuntimeManager>> {
        self.runtime_manager
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub(crate) async fn note_codex_turn_start_pending(
        &self,
        thread_id: &str,
        timeout_duration: Duration,
    ) {
        let normalized_thread_id = thread_id.trim();
        if normalized_thread_id.is_empty() {
            return;
        }
        if let Some(runtime_manager) = self.runtime_manager() {
            runtime_manager
                .note_foreground_turn_start_pending(
                    &self.entry,
                    "codex",
                    normalized_thread_id,
                    timeout_duration.as_millis() as u64,
                )
                .await;
        }
    }

    pub(crate) async fn note_codex_thread_create_pending(&self, timeout_duration: Duration) {
        if let Some(runtime_manager) = self.runtime_manager() {
            runtime_manager
                .note_foreground_thread_create_pending(
                    &self.entry,
                    "codex",
                    timeout_duration.as_millis() as u64,
                )
                .await;
        }
    }

    pub(crate) async fn clear_codex_foreground_work(
        &self,
        thread_id: Option<&str>,
        turn_id: Option<&str>,
    ) {
        if let Some(runtime_manager) = self.runtime_manager() {
            runtime_manager
                .clear_foreground_work_continuity("codex", &self.entry.id, thread_id, turn_id)
                .await;
        }
    }

    pub(crate) async fn clear_resume_pending_watch(
        &self,
        thread_id: Option<&str>,
        turn_id: Option<&str>,
        method: Option<&str>,
    ) {
        let Some(thread_id) = thread_id.map(str::trim).filter(|value| !value.is_empty()) else {
            return;
        };
        let mut resume_pending_turns = self.resume_pending_turns.lock().await;
        let should_remove = resume_pending_turns
            .get(thread_id)
            .map(|state| {
                if !state.source.should_clear_on_event(method, turn_id) {
                    return false;
                }
                if let Some(expected_turn_id) = state.turn_id.as_deref() {
                    if let Some(candidate_turn_id) = turn_id.map(str::trim) {
                        return candidate_turn_id.is_empty()
                            || candidate_turn_id == expected_turn_id;
                    }
                }
                true
            })
            .unwrap_or(false);
        if should_remove {
            resume_pending_turns.remove(thread_id);
        }
    }

    pub(crate) async fn start_resume_pending_watch(
        self: &Arc<Self>,
        app: AppHandle,
        thread_id: String,
        turn_id: Option<String>,
        source: ResumePendingSource,
    ) {
        let normalized_thread_id = thread_id.trim().to_string();
        if normalized_thread_id.is_empty() {
            return;
        }
        let normalized_turn_id = turn_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let timeout_ms = resolve_resume_after_user_input_timeout_ms();
        let state = ResumePendingTurnState {
            nonce: format!(
                "resume-pending-{}",
                self.next_id.fetch_add(1, Ordering::SeqCst)
            ),
            turn_id: normalized_turn_id.clone(),
            started_at_ms: now_millis(),
            timeout_ms,
            source: source.clone(),
        };
        self.resume_pending_turns
            .lock()
            .await
            .insert(normalized_thread_id.clone(), state.clone());
        if let Some(runtime_manager) = self.runtime_manager() {
            runtime_manager
                .note_foreground_resume_pending(
                    &self.entry,
                    "codex",
                    &normalized_thread_id,
                    normalized_turn_id.as_deref(),
                    source.runtime_source_label(),
                    timeout_ms,
                )
                .await;
        }
        let session = Arc::clone(self);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(timeout_ms)).await;
            let timed_out_state = {
                let mut resume_pending_turns = session.resume_pending_turns.lock().await;
                match resume_pending_turns.get(&normalized_thread_id) {
                    Some(current) if current.nonce == state.nonce => {
                        resume_pending_turns.remove(&normalized_thread_id)
                    }
                    _ => None,
                }
            };
            let Some(timed_out_state) = timed_out_state else {
                return;
            };
            if let Some(runtime_manager) = session.runtime_manager() {
                let guard_state = format!("{}-timeout", timed_out_state.source.stalled_stage());
                runtime_manager
                    .settle_foreground_work_timeout(
                        "codex",
                        &session.entry.id,
                        Some(&normalized_thread_id),
                        timed_out_state.turn_id.as_deref(),
                        timed_out_state.source.runtime_source_label(),
                        &guard_state,
                    )
                    .await;
            }
            let message = timed_out_state
                .source
                .stalled_message(timed_out_state.timeout_ms);
            let _ = app.emit(
                "app-server-event",
                AppServerEvent {
                    workspace_id: session.entry.id.clone(),
                    message: build_turn_stalled_event(
                        &normalized_thread_id,
                        timed_out_state.turn_id.as_deref(),
                        timed_out_state.source.stalled_reason_code(),
                        timed_out_state.source.stalled_stage(),
                        timed_out_state.source.runtime_source_label(),
                        &message,
                        timed_out_state.started_at_ms,
                        timed_out_state.timeout_ms,
                        Some(session.runtime_generation().as_str()),
                        session.process_id,
                        Some(session.started_at_ms),
                    ),
                },
            );
        });
    }

    pub(crate) async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let value = if let Some(params) = params {
            json!({ "method": method, "params": params })
        } else {
            json!({ "method": method })
        };
        self.write_message(value).await
    }

    pub(crate) async fn send_response(&self, id: Value, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }

    pub(crate) fn set_mode_enforcement_enabled(&self, enabled: bool) {
        self.mode_enforcement_enabled
            .store(enabled, Ordering::Relaxed);
    }

    pub(crate) fn mode_enforcement_enabled(&self) -> bool {
        self.mode_enforcement_enabled.load(Ordering::Relaxed)
    }

    pub(crate) fn set_collaboration_mode_supported(&self, supported: bool) {
        self.collaboration_mode_supported
            .store(supported, Ordering::Relaxed);
    }

    pub(crate) fn collaboration_mode_supported(&self) -> bool {
        self.collaboration_mode_supported.load(Ordering::Relaxed)
    }

    pub(crate) async fn get_thread_effective_mode(&self, thread_id: &str) -> Option<String> {
        self.thread_mode_state.get(thread_id).await
    }

    pub(crate) async fn set_thread_effective_mode(&self, thread_id: &str, mode: &str) {
        self.thread_mode_state
            .set(thread_id.to_string(), mode)
            .await;
    }

    pub(crate) async fn inherit_thread_effective_mode(
        &self,
        parent_thread_id: &str,
        child_thread_id: &str,
    ) -> Option<String> {
        self.thread_mode_state
            .inherit(parent_thread_id, child_thread_id)
            .await
    }

    pub(crate) async fn clear_thread_effective_mode(&self, thread_id: &str) {
        self.thread_mode_state.remove(thread_id).await;
        self.plan_turn_state.lock().await.remove(thread_id);
    }

    pub(crate) async fn consume_local_user_input_request(&self, request_id: &str) -> bool {
        self.local_user_input_requests
            .lock()
            .await
            .remove(request_id)
            .is_some()
    }

    async fn fire_and_forget_request(&self, method: &str, params: Value) -> Result<(), String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        self.write_message(json!({ "id": id, "method": method, "params": params }))
            .await
    }

    fn auto_compaction_threshold_percent(&self) -> f64 {
        self.auto_compaction_threshold_percent
    }

    fn auto_compaction_enabled(&self) -> bool {
        self.auto_compaction_enabled
    }
}

#[allow(dead_code)]
pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    spawn_workspace_session_with_auto_compaction_threshold(
        entry,
        default_codex_bin,
        codex_args,
        codex_home,
        client_version,
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        event_sink,
    )
    .await
}

pub(crate) async fn spawn_workspace_session_with_auto_compaction_threshold<E: EventSink>(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    auto_compaction_threshold_percent: f64,
    auto_compaction_enabled: bool,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let codex_bin = entry
        .codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_codex_bin);
    let _ = check_codex_installation(codex_bin.clone()).await?;
    let probe_status = probe_codex_app_server(codex_bin.clone(), codex_args.as_deref()).await?;
    if !probe_status.ok {
        let details = probe_status
            .details
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "`codex app-server --help` failed.".to_string());
        return Err(format!(
            "Codex CLI is not app-server capable. Check that the configured binary is a real Codex CLI and that `codex app-server --help` works in Terminal. Details: {details}"
        ));
    }
    let launch_context = resolve_codex_launch_context(codex_bin.as_deref());

    if can_retry_wrapper_compatibility_launch(&launch_context) {
        return spawn_workspace_session_with_wrapper_fallback(
            entry,
            codex_args,
            codex_home,
            client_version,
            auto_compaction_threshold_percent,
            auto_compaction_enabled,
            event_sink,
            &launch_context,
        )
        .await;
    }

    spawn_workspace_session_once(
        entry,
        codex_args,
        codex_home,
        client_version,
        auto_compaction_threshold_percent,
        auto_compaction_enabled,
        event_sink,
        &launch_context,
        CodexAppServerLaunchOptions::primary(),
    )
    .await
}

async fn spawn_workspace_session_with_wrapper_fallback<E: EventSink>(
    entry: WorkspaceEntry,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    auto_compaction_threshold_percent: f64,
    auto_compaction_enabled: bool,
    event_sink: E,
    launch_context: &CodexLaunchContext,
) -> Result<Arc<WorkspaceSession>, String> {
    let primary_sink = DeferredStartupEventSink::new(event_sink.clone());
    let primary_result = spawn_workspace_session_once(
        entry.clone(),
        codex_args.clone(),
        codex_home.clone(),
        client_version.clone(),
        auto_compaction_threshold_percent,
        auto_compaction_enabled,
        primary_sink.clone(),
        launch_context,
        CodexAppServerLaunchOptions::primary(),
    )
    .await;
    match primary_result {
        Ok(session) => {
            primary_sink.flush_and_forward();
            Ok(session)
        }
        Err(primary_error) => {
            primary_sink.discard();
            log::warn!(
                "[codex-wrapper-fallback] retrying workspace={} bin={} wrapper={} without internal spec hint after primary failure: {}",
                entry.id,
                launch_context.resolved_bin,
                launch_context.wrapper_kind,
                primary_error
            );
            spawn_workspace_session_once(
                entry,
                codex_args,
                codex_home,
                client_version,
                auto_compaction_threshold_percent,
                auto_compaction_enabled,
                event_sink,
                launch_context,
                CodexAppServerLaunchOptions::wrapper_compatibility_retry(),
            )
            .await
            .map_err(|retry_error| {
                format!(
                    "Primary wrapper launch failed: {primary_error}\nFallback retry failed: {retry_error}"
                )
            })
        }
    }
}

async fn spawn_workspace_session_once<E: EventSink>(
    entry: WorkspaceEntry,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    auto_compaction_threshold_percent: f64,
    auto_compaction_enabled: bool,
    event_sink: E,
    launch_context: &CodexLaunchContext,
    launch_options: CodexAppServerLaunchOptions,
) -> Result<Arc<WorkspaceSession>, String> {
    let mut command =
        build_codex_command_from_launch_context(launch_context, launch_options.hide_console);
    WorkspaceSession::configure_spawn_command(&mut command);
    apply_codex_app_server_args(&mut command, codex_args.as_deref(), launch_options)?;
    command.current_dir(&entry.path);
    if let Some(codex_home) = codex_home {
        command.env("CODEX_HOME", codex_home);
    }
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let started_at_ms = now_millis();
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let process_id = child.id();
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(WorkspaceSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        wrapper_kind: launch_context.wrapper_kind.to_string(),
        resolved_bin: launch_context.resolved_bin.clone(),
        process_id,
        started_at_ms,
        pending: Mutex::new(HashMap::new()),
        timed_out_requests: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        thread_mode_state: ThreadModeState::default(),
        mode_enforcement_enabled: AtomicBool::new(true),
        collaboration_mode_supported: AtomicBool::new(true),
        auto_compaction_threshold_percent,
        auto_compaction_enabled,
        auto_compaction_thread_state: Mutex::new(HashMap::new()),
        plan_turn_state: Mutex::new(HashMap::new()),
        local_user_input_requests: Mutex::new(HashMap::new()),
        local_request_seq: AtomicU64::new(1),
        resume_pending_turns: Mutex::new(HashMap::new()),
        runtime_manager: StdMutex::new(None),
        active_turns: Mutex::new(HashMap::new()),
        manual_shutdown_requested: AtomicBool::new(false),
        shutdown_source: StdMutex::new(None),
        shutdown_had_active_work_protection: AtomicBool::new(false),
        runtime_end_emitted: AtomicBool::new(false),
    });

    spawn_workspace_session_runtime_tasks(
        session.clone(),
        stdout,
        stderr,
        entry.id.clone(),
        event_sink.clone(),
    );

    let init_params = json!({
        "clientInfo": {
            "name": "ccgui",
            "title": "ccgui",
            "version": client_version
        },
        "capabilities": {
            // Plan mode collaboration and requestUserInput are experimental APIs in codex app-server.
            "experimentalApi": true
        },
    });
    let init_result = timeout(
        Duration::from_secs(15),
        session.send_request("initialize", init_params),
    )
    .await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
            return Err(
                "Codex app-server did not respond to initialize. Check that `codex app-server` works in Terminal."
                    .to_string(),
            );
        }
    };
    if let Err(error) = init_response {
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
        return Err(error);
    }
    session.send_notification("initialized", None).await?;

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id.clone() }
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}

#[cfg(test)]
fn make_test_workspace_entry(id: &str) -> WorkspaceEntry {
    let mut settings = crate::types::WorkspaceSettings::default();
    settings.engine_type = Some("codex".to_string());
    WorkspaceEntry {
        id: id.to_string(),
        name: format!("Workspace {id}"),
        path: std::env::temp_dir().join(id).display().to_string(),
        codex_bin: None,
        kind: crate::types::WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings,
    }
}

#[cfg(test)]
fn spawn_test_runtime_process_for_runtime() -> (tokio::process::Child, String) {
    #[cfg(windows)]
    {
        let command_path = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut command = Command::new(&command_path);
        command.args(["/Q", "/K"]);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        let child = command
            .spawn()
            .unwrap_or_else(|error| panic!("failed to spawn {command_path}: {error}"));
        return (child, command_path);
    }

    #[cfg(not(windows))]
    {
        let command_path = "cat".to_string();
        let mut command = Command::new(&command_path);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        let child = command
            .spawn()
            .unwrap_or_else(|error| panic!("failed to spawn {command_path}: {error}"));
        (child, command_path)
    }
}

#[cfg(test)]
pub(crate) async fn make_test_workspace_session(id: &str) -> Arc<WorkspaceSession> {
    let (mut child, resolved_bin) = spawn_test_runtime_process_for_runtime();
    let process_id = child.id();
    let stdin = child.stdin.take().expect("test child stdin");
    Arc::new(WorkspaceSession {
        entry: make_test_workspace_entry(id),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        wrapper_kind: "direct".to_string(),
        resolved_bin,
        process_id,
        started_at_ms: now_millis(),
        pending: Mutex::new(HashMap::new()),
        timed_out_requests: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        thread_mode_state: crate::codex::thread_mode_state::ThreadModeState::default(),
        mode_enforcement_enabled: AtomicBool::new(false),
        collaboration_mode_supported: AtomicBool::new(false),
        auto_compaction_threshold_percent: AUTO_COMPACTION_THRESHOLD_PERCENT,
        auto_compaction_enabled: true,
        auto_compaction_thread_state: Mutex::new(HashMap::new()),
        plan_turn_state: Mutex::new(HashMap::new()),
        local_user_input_requests: Mutex::new(HashMap::new()),
        local_request_seq: AtomicU64::new(1),
        resume_pending_turns: Mutex::new(HashMap::new()),
        runtime_manager: StdMutex::new(None),
        active_turns: Mutex::new(HashMap::new()),
        manual_shutdown_requested: AtomicBool::new(false),
        shutdown_source: StdMutex::new(None),
        shutdown_had_active_work_protection: AtomicBool::new(false),
        runtime_end_emitted: AtomicBool::new(false),
    })
}

#[cfg(test)]
pub(crate) async fn dispose_test_workspace_session(session: &WorkspaceSession) {
    session.mark_manual_shutdown();
    let mut child = session.child.lock().await;
    let _ = child.kill().await;
    let _ = child.wait().await;
}

#[cfg(test)]
#[path = "app_server_tests.rs"]
mod tests;
