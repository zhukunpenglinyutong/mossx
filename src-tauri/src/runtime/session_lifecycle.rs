use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::backend::app_server::{RuntimeShutdownSource, WorkspaceSession};
use crate::state::AppState;

use super::{terminate_workspace_session_process, RuntimeManager, RuntimeReplacementGate};

pub(super) async fn close_runtime(
    state: &AppState,
    engine: &str,
    workspace_id: &str,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    match engine {
        "claude" => stop_claude_workspace_session(state, workspace_id).await,
        _ => {
            stop_workspace_session_with_source(
                &state.sessions,
                &state.runtime_manager,
                workspace_id,
                shutdown_source,
            )
            .await
        }
    }
}

pub(super) async fn evict_runtime(
    state: &AppState,
    engine: &str,
    workspace_id: &str,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    match engine {
        "claude" => stop_claude_workspace_session(state, workspace_id).await,
        _ => {
            evict_workspace_session(
                &state.sessions,
                &state.runtime_manager,
                workspace_id,
                shutdown_source,
            )
            .await
        }
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

pub(crate) async fn terminate_workspace_session(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
) -> Result<(), String> {
    terminate_workspace_session_with_shutdown_source(
        session,
        runtime_manager,
        RuntimeShutdownSource::CompatibilityManual,
    )
    .await
}

pub(crate) async fn terminate_workspace_session_with_source(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    terminate_workspace_session_with_shutdown_source(session, runtime_manager, shutdown_source)
        .await
}

async fn terminate_workspace_session_for_eviction(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    terminate_workspace_session_with_shutdown_source(session, runtime_manager, shutdown_source)
        .await
}

async fn terminate_workspace_session_with_shutdown_source(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    let workspace_id = session.entry.id.clone();
    session.mark_shutdown_requested(shutdown_source);
    if let Some(runtime_manager) = runtime_manager {
        if runtime_manager
            .has_active_work_protection_for_session("codex", &workspace_id, session.process_id)
            .await
        {
            session.mark_shutdown_had_active_work_protection();
        }
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

#[cfg(test)]
pub(crate) async fn terminate_replaced_workspace_session(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
) -> Result<(), String> {
    terminate_replaced_workspace_session_with_source(
        session,
        runtime_manager,
        RuntimeShutdownSource::InternalReplacement,
    )
    .await
}

async fn terminate_replaced_workspace_session_with_source(
    session: Arc<WorkspaceSession>,
    runtime_manager: Option<&RuntimeManager>,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    let workspace_id = session.entry.id.clone();
    session.mark_shutdown_requested(shutdown_source);
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
        replacement_session.mark_shutdown_requested(RuntimeShutdownSource::InternalReplacement);
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
    replace_workspace_session_with_source(
        sessions,
        runtime_manager,
        workspace_id,
        new_session,
        lease_source,
        RuntimeShutdownSource::InternalReplacement,
    )
    .await
}

pub(crate) async fn replace_workspace_session_with_source(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: Option<&RuntimeManager>,
    workspace_id: String,
    new_session: Arc<WorkspaceSession>,
    lease_source: &str,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    replace_workspace_session_with_terminator(
        sessions,
        runtime_manager,
        workspace_id,
        new_session,
        lease_source,
        |session, runtime_manager| {
            Box::pin(async move {
                terminate_replaced_workspace_session_with_source(
                    session,
                    runtime_manager,
                    shutdown_source,
                )
                .await
            })
        },
        shutdown_source,
    )
    .await
}

pub(crate) async fn replace_workspace_session_with_terminator<Terminator>(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: Option<&RuntimeManager>,
    workspace_id: String,
    new_session: Arc<WorkspaceSession>,
    lease_source: &str,
    terminate_replaced: Terminator,
    shutdown_source: RuntimeShutdownSource,
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
                terminate_workspace_session_with_source(
                    Arc::clone(&new_session),
                    None,
                    shutdown_source,
                )
                .await?;
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
    stop_workspace_session_with_source(
        sessions,
        runtime_manager,
        workspace_id,
        RuntimeShutdownSource::UserManualShutdown,
    )
    .await
}

pub(crate) async fn stop_workspace_session_with_source(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: &RuntimeManager,
    workspace_id: &str,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    let session = sessions.lock().await.remove(workspace_id);
    if let Some(session) = session {
        terminate_workspace_session_with_source(session, Some(runtime_manager), shutdown_source)
            .await?;
    } else {
        runtime_manager.record_removed("codex", workspace_id).await;
    }
    Ok(())
}

async fn evict_workspace_session(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    runtime_manager: &RuntimeManager,
    workspace_id: &str,
    shutdown_source: RuntimeShutdownSource,
) -> Result<(), String> {
    let session = sessions.lock().await.remove(workspace_id);
    if let Some(session) = session {
        terminate_workspace_session_for_eviction(session, Some(runtime_manager), shutdown_source)
            .await?;
    } else {
        runtime_manager.record_removed("codex", workspace_id).await;
    }
    Ok(())
}
