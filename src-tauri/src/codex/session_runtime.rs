use super::*;
use crate::runtime::{RuntimeAcquireDisposition, RuntimeAcquireToken};
use tauri::AppHandle;
use tokio::time::Duration;

const SESSION_HEALTH_PROBE_TIMEOUT_SECS: u64 = 3;
pub(crate) const CREATE_SESSION_RUNTIME_RECOVERING_ERROR_PREFIX: &str =
    "[SESSION_CREATE_RUNTIME_RECOVERING]";
pub(crate) const HOOK_SAFE_FALLBACK_METADATA_KEY: &str = "ccguiHookSafeFallback";
const HOOK_SAFE_FALLBACK_SOURCE: &str = "codex-sessionstart-hook-safe-fallback";
const HOOK_SKIPPED_NOTICE: &str =
    "ccgui skipped project SessionStart hooks for this thread because the primary thread creation path was blocked. Project hook context may be incomplete; inspect .codex/hooks.json.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CodexSessionEnsureMode {
    Normal,
    SessionHooksDisabled,
}

impl CodexSessionEnsureMode {
    fn recovery_source(self, default_source: &str) -> &str {
        match self {
            Self::Normal => default_source,
            Self::SessionHooksDisabled => HOOK_SAFE_FALLBACK_SOURCE,
        }
    }

    fn launch_options(self) -> CodexAppServerLaunchOptions {
        match self {
            Self::Normal => CodexAppServerLaunchOptions::primary(),
            Self::SessionHooksDisabled => CodexAppServerLaunchOptions::session_hooks_disabled(),
        }
    }

    fn requires_replacement(self) -> bool {
        matches!(self, Self::SessionHooksDisabled)
    }
}

pub(crate) fn is_hook_safe_fallback_trigger(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();
    let has_hook_evidence = normalized.contains("hook")
        || normalized.contains("sessionstart")
        || normalized.contains("session start");
    let has_failure_evidence = normalized.contains("failed")
        || normalized.contains("error")
        || normalized.contains("permission")
        || normalized.contains("denied")
        || normalized.contains("timed out")
        || normalized.contains("timeout");

    normalized.contains(crate::shared::codex_core::INVALID_THREAD_START_RESPONSE_ERROR_PREFIX)
        || (has_hook_evidence && (has_failure_evidence || normalized.contains("thread/start")))
}

pub(crate) fn attach_hook_safe_fallback_metadata(
    mut response: serde_json::Value,
    primary_failure: &str,
) -> serde_json::Value {
    let metadata = serde_json::json!({
        "mode": "session-hooks-disabled",
        "reason": classify_hook_safe_fallback_reason(primary_failure),
        "primaryFailureSummary": summarize_fallback_failure(primary_failure),
        "notice": HOOK_SKIPPED_NOTICE,
    });
    if let Some(object) = response.as_object_mut() {
        object.insert(HOOK_SAFE_FALLBACK_METADATA_KEY.to_string(), metadata);
        return response;
    }
    serde_json::json!({
        "result": response,
        HOOK_SAFE_FALLBACK_METADATA_KEY: metadata,
    })
}

fn classify_hook_safe_fallback_reason(error: &str) -> &'static str {
    let normalized = error.to_ascii_lowercase();
    if normalized.contains(crate::shared::codex_core::INVALID_THREAD_START_RESPONSE_ERROR_PREFIX) {
        "invalid_thread_start_response"
    } else if normalized.contains("timed out") || normalized.contains("timeout") {
        "thread_start_timeout"
    } else if normalized.contains("permission") || normalized.contains("denied") {
        "hook_permission_denied"
    } else if normalized.contains("hook") || normalized.contains("sessionstart") {
        "sessionstart_hook_failure"
    } else {
        "thread_start_failure"
    }
}

fn summarize_fallback_failure(error: &str) -> String {
    let normalized = error.trim().replace('\n', " ");
    if normalized.len() <= 320 {
        return normalized;
    }
    format!("{}...", &normalized[..320])
}

async fn reuse_existing_session_if_healthy<FProbe, FutProbe, FTouch, FutTouch, FStop, FutStop>(
    workspace_id: &str,
    stale_reason: Option<&str>,
    probe: FProbe,
    touch: FTouch,
    stop: FStop,
) -> bool
where
    FProbe: FnOnce() -> FutProbe,
    FutProbe: std::future::Future<Output = Result<(), String>>,
    FTouch: FnOnce() -> FutTouch,
    FutTouch: std::future::Future<Output = ()>,
    FStop: FnOnce() -> FutStop,
    FutStop: std::future::Future<Output = Result<(), String>>,
{
    if let Some(reason) = stale_reason {
        log::warn!(
            "[ensure_codex_session] stale session rejected before probe for workspace {}: {}",
            workspace_id,
            reason
        );
        if let Err(stop_error) = stop().await {
            log::warn!(
                "[ensure_codex_session] failed to stop stale session for workspace {}: {}",
                workspace_id,
                stop_error
            );
        }
        return false;
    }

    match probe().await {
        Ok(()) => {
            touch().await;
            true
        }
        Err(error) => {
            log::warn!(
                "[ensure_codex_session] stale session detected for workspace {}: {}",
                workspace_id,
                error
            );
            if let Err(stop_error) = stop().await {
                log::warn!(
                    "[ensure_codex_session] failed to stop stale session for workspace {}: {}",
                    workspace_id,
                    stop_error
                );
            }
            false
        }
    }
}

pub(crate) fn is_stopping_runtime_race_error(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();
    normalized.contains("manual shutdown")
        || normalized.contains("manual_shutdown")
        || (normalized.contains("[runtime_ended]") && normalized.contains("stopped after"))
}

pub(crate) fn create_session_runtime_recovering_error() -> String {
    format!(
        "{CREATE_SESSION_RUNTIME_RECOVERING_ERROR_PREFIX} Managed runtime was restarting while creating this session. The app retried automatically but could not acquire a healthy runtime yet. Reconnect the workspace and try again."
    )
}

async fn load_workspace_entries_for_runtime_start(
    workspace_id: &str,
    workspaces: &tokio::sync::Mutex<std::collections::HashMap<String, WorkspaceEntry>>,
    runtime_manager: &crate::runtime::RuntimeManager,
    acquire_token: &RuntimeAcquireToken,
) -> Result<(WorkspaceEntry, Option<WorkspaceEntry>), String> {
    let resolved: Result<(WorkspaceEntry, Option<WorkspaceEntry>), String> = {
        let workspaces = workspaces.lock().await;
        match workspaces.get(workspace_id).cloned() {
            Some(entry) => {
                let parent_entry = entry
                    .parent_id
                    .as_ref()
                    .and_then(|parent_id| workspaces.get(parent_id).cloned());
                Ok((entry, parent_entry))
            }
            None => Err("workspace not found".to_string()),
        }
    };

    if resolved.is_err() {
        runtime_manager.finish_runtime_acquire(acquire_token).await;
    }

    resolved
}

/// Ensure a Codex session exists for the workspace. If not, spawn one.
/// This is called before sending messages to handle the case where user
/// switches from Claude to Codex engine without reconnecting the workspace.
pub(crate) async fn ensure_codex_session(
    workspace_id: &str,
    state: &AppState,
    app: &AppHandle,
) -> Result<(), String> {
    ensure_codex_session_with_mode(
        workspace_id,
        state,
        app,
        false,
        "ensure-runtime-ready",
        CodexSessionEnsureMode::Normal,
    )
    .await
}

pub(crate) async fn ensure_codex_session_without_session_hooks(
    workspace_id: &str,
    state: &AppState,
    app: &AppHandle,
) -> Result<(), String> {
    ensure_codex_session_with_mode(
        workspace_id,
        state,
        app,
        false,
        HOOK_SAFE_FALLBACK_SOURCE,
        CodexSessionEnsureMode::SessionHooksDisabled,
    )
    .await
}

async fn ensure_codex_session_with_mode(
    workspace_id: &str,
    state: &AppState,
    app: &AppHandle,
    automatic_recovery: bool,
    recovery_source: &str,
    ensure_mode: CodexSessionEnsureMode,
) -> Result<(), String> {
    loop {
        let recovery_source = ensure_mode.recovery_source(recovery_source);
        let lifecycle = state.runtime_manager.lifecycle_coordinator();
        let existing_session = {
            let sessions = state.sessions.lock().await;
            sessions.get(workspace_id).cloned()
        };
        if let Some(session) = existing_session {
            if ensure_mode.requires_replacement() {
                let has_active_work = state
                    .runtime_manager
                    .has_active_work_protection_for_session(
                        "codex",
                        workspace_id,
                        session.process_id,
                        Some(session.started_at_ms),
                    )
                    .await;
                if has_active_work {
                    return Err(format!(
                        "Hook-safe fallback cannot replace the existing Codex runtime for workspace {workspace_id} while it has active work. Wait for the current turn to finish, then retry creating the session."
                    ));
                }
                crate::runtime::stop_workspace_session_with_source(
                    &state.sessions,
                    &state.runtime_manager,
                    workspace_id,
                    crate::backend::app_server::RuntimeShutdownSource::InternalReplacement,
                )
                .await?;
                continue;
            }
            let stale_reason = session.stale_reuse_reason().map(str::to_owned);
            if let Some(reason) = stale_reason.as_deref() {
                state
                    .runtime_manager
                    .note_stale_session_rejection("codex", workspace_id, recovery_source, reason)
                    .await;
            }
            if reuse_existing_session_if_healthy(
                workspace_id,
                stale_reason.as_deref(),
                || session.probe_health(Duration::from_secs(SESSION_HEALTH_PROBE_TIMEOUT_SECS)),
                || async {
                    state
                        .runtime_manager
                        .touch("codex", workspace_id, recovery_source)
                        .await;
                },
                || async {
                    crate::runtime::stop_workspace_session_with_source(
                        &state.sessions,
                        &state.runtime_manager,
                        workspace_id,
                        crate::backend::app_server::RuntimeShutdownSource::StaleReuseCleanup,
                    )
                    .await
                },
            )
            .await
            {
                state
                    .runtime_manager
                    .record_recovery_success("codex", workspace_id)
                    .await;
                return Ok(());
            }
            let stale_failure = stale_reason
                .unwrap_or_else(|| "stale existing session failed health probe".to_string());
            if stale_failure == "stale existing session failed health probe" {
                state
                    .runtime_manager
                    .note_probe_failure("codex", workspace_id, recovery_source, &stale_failure)
                    .await;
            }
            if automatic_recovery {
                if let Err(quarantine_error) = lifecycle
                    .record_recovering_failure(
                        "codex",
                        workspace_id,
                        recovery_source,
                        &stale_failure,
                    )
                    .await
                {
                    return Err(quarantine_error);
                }
            }
            continue;
        }

        let acquire_token = match lifecycle
            .acquire_or_retry(
                "codex",
                workspace_id,
                recovery_source,
                automatic_recovery,
                "timed out waiting for concurrent runtime acquire",
            )
            .await
        {
            Ok(RuntimeAcquireDisposition::Leader(token)) => token,
            Ok(RuntimeAcquireDisposition::Retry) => continue,
            Err(error) => return Err(error),
        };
        log::info!(
            "[ensure_codex_session] No session for workspace {}, spawning new Codex session",
            workspace_id
        );

        let (entry, parent_entry) = load_workspace_entries_for_runtime_start(
            workspace_id,
            &state.workspaces,
            &state.runtime_manager,
            &acquire_token,
        )
        .await?;

        let (default_bin, codex_args) = {
            let settings = state.app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(&entry, parent_entry.as_ref(), Some(&settings)),
            )
        };

        let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
        let mode_enforcement_enabled = {
            let settings = state.app_settings.lock().await;
            settings.codex_mode_enforcement_enabled
        };

        lifecycle
            .record_acquiring(&entry, "codex", recovery_source)
            .await;

        let spawn_result = spawn_workspace_session_with_launch_options(
            entry.clone(),
            default_bin,
            codex_args,
            app.clone(),
            codex_home,
            ensure_mode.launch_options(),
        )
        .await;
        let session = match spawn_result {
            Ok(created_session) => created_session,
            Err(error) => {
                state
                    .runtime_manager
                    .record_failure(&entry, "codex", recovery_source, error.clone())
                    .await;
                lifecycle.finish_acquire(&acquire_token).await;
                if automatic_recovery {
                    if let Err(quarantine_error) = lifecycle
                        .record_recovering_failure(
                            "codex",
                            workspace_id,
                            recovery_source,
                            error.as_str(),
                        )
                        .await
                    {
                        return Err(quarantine_error);
                    }
                    continue;
                }
                return Err(error);
            }
        };
        session.set_mode_enforcement_enabled(mode_enforcement_enabled);
        session.attach_runtime_manager(state.runtime_manager.clone());
        let replace_result = crate::runtime::replace_workspace_session(
            &state.sessions,
            Some(&state.runtime_manager),
            entry.id,
            session,
            recovery_source,
        )
        .await;
        lifecycle.finish_acquire(&acquire_token).await;
        if replace_result.is_ok() {
            lifecycle.record_recovered("codex", workspace_id).await;
            return replace_result;
        }
        if let Err(error) = &replace_result {
            if automatic_recovery {
                if let Err(quarantine_error) = lifecycle
                    .record_recovering_failure(
                        "codex",
                        workspace_id,
                        recovery_source,
                        error.as_str(),
                    )
                    .await
                {
                    return Err(quarantine_error);
                }
                continue;
            }
            return replace_result;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        attach_hook_safe_fallback_metadata, create_session_runtime_recovering_error,
        is_hook_safe_fallback_trigger, is_stopping_runtime_race_error,
        load_workspace_entries_for_runtime_start, reuse_existing_session_if_healthy,
        CREATE_SESSION_RUNTIME_RECOVERING_ERROR_PREFIX,
    };
    use crate::runtime::{RuntimeAcquireGate, RuntimeManager};
    use crate::types::WorkspaceEntry;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use uuid::Uuid;

    #[tokio::test]
    async fn reuses_existing_session_when_probe_succeeds() {
        let touched = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));

        let reused = reuse_existing_session_if_healthy(
            "ws-1",
            None,
            || async { Ok(()) },
            {
                let touched = Arc::clone(&touched);
                move || async move {
                    touched.store(true, Ordering::SeqCst);
                }
            },
            {
                let stopped = Arc::clone(&stopped);
                move || async move {
                    stopped.store(true, Ordering::SeqCst);
                    Ok(())
                }
            },
        )
        .await;

        assert!(reused);
        assert!(touched.load(Ordering::SeqCst));
        assert!(!stopped.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn stops_stale_session_when_probe_fails() {
        let touched = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));

        let reused = reuse_existing_session_if_healthy(
            "ws-1",
            None,
            || async { Err("Broken pipe (os error 32)".to_string()) },
            {
                let touched = Arc::clone(&touched);
                move || async move {
                    touched.store(true, Ordering::SeqCst);
                }
            },
            {
                let stopped = Arc::clone(&stopped);
                move || async move {
                    stopped.store(true, Ordering::SeqCst);
                    Ok(())
                }
            },
        )
        .await;

        assert!(!reused);
        assert!(!touched.load(Ordering::SeqCst));
        assert!(stopped.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn stops_stale_session_before_probe_when_already_marked_stopping() {
        let probe_called = Arc::new(AtomicBool::new(false));
        let touched = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));

        let reused = reuse_existing_session_if_healthy(
            "ws-1",
            Some("manual-shutdown-requested"),
            {
                let probe_called = Arc::clone(&probe_called);
                move || async move {
                    probe_called.store(true, Ordering::SeqCst);
                    Ok(())
                }
            },
            {
                let touched = Arc::clone(&touched);
                move || async move {
                    touched.store(true, Ordering::SeqCst);
                }
            },
            {
                let stopped = Arc::clone(&stopped);
                move || async move {
                    stopped.store(true, Ordering::SeqCst);
                    Ok(())
                }
            },
        )
        .await;

        assert!(!reused);
        assert!(!probe_called.load(Ordering::SeqCst));
        assert!(!touched.load(Ordering::SeqCst));
        assert!(stopped.load(Ordering::SeqCst));
    }

    #[test]
    fn stopping_runtime_race_error_matches_manual_shutdown_messages() {
        assert!(is_stopping_runtime_race_error(
            "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown."
        ));
        assert!(is_stopping_runtime_race_error(
            "Managed runtime stopped after manual shutdown."
        ));
        assert!(!is_stopping_runtime_race_error("workspace not connected"));
    }

    #[test]
    fn create_session_runtime_recovering_error_uses_stable_prefix() {
        let error = create_session_runtime_recovering_error();
        assert!(error.starts_with(CREATE_SESSION_RUNTIME_RECOVERING_ERROR_PREFIX));
        assert!(error.contains("retried automatically"));
    }

    #[test]
    fn hook_safe_fallback_trigger_matches_hook_and_invalid_response_errors() {
        assert!(is_hook_safe_fallback_trigger(
            "invalid_thread_start_response: root_keys=[]"
        ));
        assert!(is_hook_safe_fallback_trigger(
            "thread/start failed: SessionStart hook timed out"
        ));
        assert!(is_hook_safe_fallback_trigger(
            "Project hook permission denied"
        ));
        assert!(!is_hook_safe_fallback_trigger(
            "thread/start timed out after 300 seconds"
        ));
        assert!(!is_hook_safe_fallback_trigger("workspace not connected"));
        assert!(!is_hook_safe_fallback_trigger(
            "Codex CLI is not app-server capable"
        ));
    }

    #[test]
    fn hook_safe_fallback_metadata_preserves_thread_response() {
        let response = attach_hook_safe_fallback_metadata(
            serde_json::json!({ "result": { "thread": { "id": "thread-1" } } }),
            "invalid_thread_start_response: root_keys=[]",
        );

        assert_eq!(response["result"]["thread"]["id"], "thread-1");
        assert_eq!(
            response["ccguiHookSafeFallback"]["mode"],
            "session-hooks-disabled"
        );
        assert_eq!(
            response["ccguiHookSafeFallback"]["reason"],
            "invalid_thread_start_response"
        );
        assert!(response["ccguiHookSafeFallback"]["notice"]
            .as_str()
            .unwrap_or_default()
            .contains(".codex/hooks.json"));
    }

    #[tokio::test]
    async fn missing_workspace_after_acquire_releases_runtime_gate() {
        let runtime_root =
            std::env::temp_dir().join(format!("ccgui-session-runtime-test-{}", Uuid::new_v4()));
        let manager = RuntimeManager::new(&runtime_root);
        let workspaces = Mutex::new(HashMap::<String, WorkspaceEntry>::new());
        let acquire_token = match manager.begin_runtime_acquire("codex", "ws-missing").await {
            RuntimeAcquireGate::Leader(token) => token,
            RuntimeAcquireGate::Waiter(_) => panic!("first acquire should become leader"),
        };

        let result = load_workspace_entries_for_runtime_start(
            "ws-missing",
            &workspaces,
            &manager,
            &acquire_token,
        )
        .await;

        assert_eq!(
            result.expect_err("missing workspace should surface"),
            "workspace not found"
        );
        assert!(!manager.has_pending_acquire_for_engine("codex").await);
        assert!(matches!(
            manager.begin_runtime_acquire("codex", "ws-missing").await,
            RuntimeAcquireGate::Leader(_)
        ));
    }
}
