use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RuntimeLifecycleState {
    #[default]
    Idle,
    Acquiring,
    Active,
    Replacing,
    Stopping,
    Recovering,
    Quarantined,
    Ended,
}

#[cfg(test)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeLifecycleTransition {
    pub(crate) from: RuntimeLifecycleState,
    pub(crate) to: RuntimeLifecycleState,
    pub(crate) source: String,
    pub(crate) reason_code: Option<String>,
    pub(crate) allowed: bool,
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
    #[serde(default)]
    pub(crate) lifecycle_state: RuntimeLifecycleState,
    pub(crate) pid: Option<u32>,
    #[serde(default)]
    pub(crate) runtime_generation: Option<String>,
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
    pub(crate) foreground_work_source: Option<String>,
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
    pub(crate) reason_code: Option<String>,
    #[serde(default)]
    pub(crate) recovery_source: Option<String>,
    #[serde(default)]
    pub(crate) retryable: bool,
    #[serde(default)]
    pub(crate) user_action: Option<String>,
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
    #[serde(default)]
    pub(crate) runtime_end_diagnostics_recorded: u32,
    #[serde(default)]
    pub(crate) last_runtime_end_reason_code: Option<String>,
    #[serde(default)]
    pub(crate) last_runtime_end_message: Option<String>,
    #[serde(default)]
    pub(crate) last_runtime_end_at_ms: Option<u64>,
    #[serde(default)]
    pub(crate) last_runtime_end_workspace_id: Option<String>,
    #[serde(default)]
    pub(crate) last_runtime_end_engine: Option<String>,
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

#[derive(Debug, Clone, Default)]
pub(crate) struct RuntimeEndedRecord {
    pub(crate) reason_code: String,
    pub(crate) message: Option<String>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) exit_signal: Option<String>,
    pub(crate) pending_request_count: u32,
}
