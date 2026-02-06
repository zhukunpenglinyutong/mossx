//! Tauri commands for engine management
//!
//! Provides frontend-accessible commands for engine detection, switching,
//! and configuration.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

use super::events::{engine_event_to_app_server_event, EngineEvent};
use super::{EngineConfig, EngineStatus, EngineType};

/// Detect all installed engines and their capabilities
#[tauri::command]
pub async fn detect_engines(state: State<'_, AppState>) -> Result<Vec<EngineStatus>, String> {
    let manager = &state.engine_manager;
    Ok(manager.detect_engines().await)
}

/// Get the currently active engine
#[tauri::command]
pub async fn get_active_engine(state: State<'_, AppState>) -> Result<EngineType, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_active_engine().await)
}

/// Switch to a different engine
#[tauri::command]
pub async fn switch_engine(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.engine_manager;
    manager.set_active_engine(engine_type).await
}

/// Get cached status for a specific engine
#[tauri::command]
pub async fn get_engine_status(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<Option<EngineStatus>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_engine_status(engine_type).await)
}

/// Get all cached engine statuses
#[tauri::command]
pub async fn get_all_engine_statuses(state: State<'_, AppState>) -> Result<Vec<EngineStatus>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_all_statuses().await)
}

/// Set engine configuration
#[tauri::command]
pub async fn set_engine_config(
    engine_type: EngineType,
    config: EngineConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.engine_manager;
    manager.set_engine_config(engine_type, config).await;
    Ok(())
}

/// Get engine configuration
#[tauri::command]
pub async fn get_engine_config(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<Option<EngineConfig>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_engine_config(engine_type).await)
}

/// Check if an engine is available
#[tauri::command]
pub async fn is_engine_available(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let manager = &state.engine_manager;
    Ok(manager.is_engine_available(engine_type).await)
}

/// Get list of available engines
#[tauri::command]
pub async fn get_available_engines(state: State<'_, AppState>) -> Result<Vec<EngineType>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_available_engines().await)
}

/// Get models for a specific engine
#[tauri::command]
pub async fn get_engine_models(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<Vec<super::ModelInfo>, String> {
    let manager = &state.engine_manager;

    match engine_type {
        EngineType::Claude => {
            // Claude models are known statically
            if let Some(status) = manager.get_engine_status(EngineType::Claude).await {
                Ok(status.models)
            } else {
                // Detect if not cached
                let statuses = manager.detect_engines().await;
                let claude_status = statuses
                    .into_iter()
                    .find(|s| s.engine_type == EngineType::Claude);

                if let Some(status) = claude_status {
                    Ok(status.models)
                } else {
                    Err("Claude not detected".to_string())
                }
            }
        }
        EngineType::Codex => {
            // Codex models should be fetched via model_list command through workspace session
            // Return empty for now - frontend should use model_list for Codex
            Ok(Vec::new())
        }
        _ => Err(format!("{} is not supported yet", engine_type.display_name())),
    }
}

/// Send a message using the active engine
/// For Claude: spawns async tasks for streaming events to the frontend
/// via app-server-event, returns immediately with turn ID.
#[tauri::command]
pub async fn engine_send_message(
    workspace_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    continue_session: bool,
    thread_id: Option<String>,
    session_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let manager = &state.engine_manager;
    let active_engine = manager.get_active_engine().await;
    log::info!(
        "[engine_send_message] engine={:?} workspace_id={} model={:?} continue_session={} thread_id={:?} session_id={:?}",
        active_engine,
        workspace_id,
        model,
        continue_session,
        thread_id,
        session_id
    );

    match active_engine {
        EngineType::Claude => {
            // Get workspace path
            let workspace_path = {
                let workspaces = state.workspaces.lock().await;
                workspaces
                    .get(&workspace_id)
                    .map(|w| std::path::PathBuf::from(&w.path))
                    .ok_or_else(|| "Workspace not found".to_string())?
            };

            let session = manager
                .get_claude_session(&workspace_id, &workspace_path)
                .await;

            // Use explicit session_id from frontend (for Claude history resume),
            // or fall back to the session's tracked session_id ONLY when continuing
            // BUG FIX: When creating a new agent (continue_session=false), we must NOT
            // auto-use the old session_id, otherwise the new conversation inherits
            // the old conversation's context!
            let resolved_session_id = if session_id.is_some() {
                // Frontend explicitly provided a session_id (resuming from history)
                session_id
            } else if continue_session {
                // Frontend wants to continue the current session
                session.get_session_id().await
            } else {
                // New agent/conversation - do NOT reuse old session_id
                None
            };

            let params = super::SendMessageParams {
                text,
                model,
                effort,
                access_mode,
                images,
                continue_session: resolved_session_id.is_some(),
                session_id: resolved_session_id,
                collaboration_mode: None,
            };

            // Generate a unique turn ID and item ID for this turn
            let turn_id = format!("claude-turn-{}", uuid::Uuid::new_v4());
            let thread_id = thread_id.unwrap_or_else(|| turn_id.clone());
            let item_id = format!("claude-item-{}", uuid::Uuid::new_v4());

            // Subscribe to session events BEFORE spawning send_message
            let mut receiver = session.subscribe();
            let app_clone = app.clone();
            let mut current_thread_id = thread_id.clone();
            let item_id_clone = item_id.clone();
            let turn_id_for_forwarder = turn_id.clone();

            // Spawn event forwarder: reads from broadcast channel and emits Tauri events
            tokio::spawn(async move {
                while let Ok(turn_event) = receiver.recv().await {
                    if turn_event.turn_id != turn_id_for_forwarder {
                        continue;
                    }

                    let event = turn_event.event;
                    let is_terminal = event.is_terminal();

                    // Emit event with CURRENT thread_id (for SessionStarted, this is the OLD pending id)
                    // Frontend uses this to rename claude-pending-xxx to claude:{sessionId}
                    if let Some(payload) = engine_event_to_app_server_event(
                        &event,
                        &current_thread_id,
                        &item_id_clone,
                    ) {
                        let _ = app_clone.emit("app-server-event", payload);
                    }

                    // Update thread_id AFTER emitting SessionStarted so subsequent events use new id
                    if let EngineEvent::SessionStarted {
                        session_id,
                        engine: EngineType::Claude,
                        ..
                    } = &event
                    {
                        if !session_id.is_empty() && session_id != "pending" {
                            current_thread_id = format!("claude:{}", session_id);
                        }
                    }

                    if is_terminal {
                        break;
                    }
                }
            });

            // Spawn the message sender: drives the Claude CLI process
            let session_clone = session.clone();
            let turn_id_clone = turn_id.clone();
            tokio::spawn(async move {
                if let Err(e) = session_clone.send_message(params, &turn_id_clone).await {
                    log::error!("Claude send_message failed: {}", e);
                    // Emit TurnError so the frontend event forwarder receives a terminal
                    // event and the user sees the error instead of an infinite loading state.
                    session_clone.emit_error(&turn_id_clone, e);
                }
            });

            // Return immediately with turn info (frontend will receive streaming events)
            Ok(json!({
                "engine": "claude",
                "result": {
                    "turn": {
                        "id": turn_id,
                        "status": "started"
                    },
                },
                "turn": {
                    "id": turn_id,
                    "status": "started"
                }
            }))
        }
        EngineType::Codex => {
            // For Codex, delegate to existing send_user_message command
            // The frontend should use the existing command for now
            Ok(json!({
                "delegateTo": "send_user_message",
                "engine": "codex",
            }))
        }
        _ => Err(format!("{} is not supported yet", active_engine.display_name())),
    }
}

/// Interrupt the current operation for the active engine
#[tauri::command]
pub async fn engine_interrupt(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.engine_manager;
    let active_engine = manager.get_active_engine().await;

    match active_engine {
        EngineType::Claude => {
            if let Some(session) = manager.claude_manager.get_session(&workspace_id).await {
                session.interrupt().await?;
            }
            Ok(())
        }
        EngineType::Codex => {
            // Delegate to existing turn_interrupt command
            // Frontend should call turn_interrupt for Codex
            Ok(())
        }
        _ => Err(format!("{} is not supported yet", active_engine.display_name())),
    }
}

/// List Claude Code session history for a workspace path.
/// Reads JSONL files from ~/.claude/projects/{encoded-path}/.
#[tauri::command]
pub async fn list_claude_sessions(
    workspace_path: String,
    limit: Option<usize>,
) -> Result<Value, String> {
    let path = std::path::PathBuf::from(&workspace_path);
    let sessions = super::claude_history::list_claude_sessions(&path, limit).await?;
    serde_json::to_value(sessions).map_err(|e| e.to_string())
}

/// Load full message history for a specific Claude Code session.
#[tauri::command]
pub async fn load_claude_session(
    workspace_path: String,
    session_id: String,
) -> Result<Value, String> {
    let path = std::path::PathBuf::from(&workspace_path);
    let result = super::claude_history::load_claude_session(&path, &session_id).await?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

/// Delete a Claude Code session (remove JSONL file from disk).
#[tauri::command]
pub async fn delete_claude_session(
    workspace_path: String,
    session_id: String,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(&workspace_path);
    super::claude_history::delete_claude_session(&path, &session_id).await
}
