use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::state::AppState;

/// Fork a Claude Code session from a target user message (inclusive).
#[tauri::command]
pub async fn fork_claude_session_from_message(
    workspace_path: String,
    session_id: String,
    message_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "fork_claude_session_from_message",
            json!({
                "workspacePath": workspace_path,
                "sessionId": session_id,
                "messageId": message_id,
            }),
        )
        .await;
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(super::EngineType::Claude)
        .await;
    let forked_session_id = super::claude_history::fork_claude_session_from_message_with_config(
        &path,
        &session_id,
        &message_id,
        config.as_ref(),
    )
    .await?;
    Ok(json!({
        "thread": {
            "id": format!("claude:{}", forked_session_id)
        },
        "sessionId": forked_session_id
    }))
}
