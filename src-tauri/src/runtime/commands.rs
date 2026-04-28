use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::backend::app_server::RuntimeShutdownSource;
use crate::state::AppState;
use crate::types::AppSettings;

use super::process_diagnostics::{current_host_untracked_engine_roots, terminate_pid_tree};
use super::session_lifecycle::{close_runtime, evict_runtime};
use super::{normalize_engine, RuntimePoolSnapshot};

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
            close_runtime(
                state,
                &candidate.engine,
                &candidate.workspace_id,
                RuntimeShutdownSource::ManualRelease,
            )
            .await
        } else {
            evict_runtime(
                state,
                &candidate.engine,
                &candidate.workspace_id,
                RuntimeShutdownSource::IdleEviction,
            )
            .await
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
                RuntimeShutdownSource::UserManualShutdown,
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
                close_runtime(
                    &state,
                    &engine,
                    &workspace_id,
                    RuntimeShutdownSource::ManualRelease,
                )
                .await?;
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
