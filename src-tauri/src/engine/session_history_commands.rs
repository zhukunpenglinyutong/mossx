use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::state::AppState;

use super::remote_bridge::call_remote_typed;
use super::EngineType;

pub(super) fn remote_delete_claude_session_request(
    workspace_path: String,
    session_id: String,
) -> (&'static str, Value) {
    (
        "delete_claude_session",
        json!({
            "workspacePath": crate::remote_backend::normalize_path_for_remote(workspace_path),
            "sessionId": session_id,
        }),
    )
}

pub(super) fn remote_delete_gemini_session_request(
    workspace_path: String,
    session_id: String,
) -> (&'static str, Value) {
    (
        "delete_gemini_session",
        json!({
            "workspacePath": crate::remote_backend::normalize_path_for_remote(workspace_path),
            "sessionId": session_id,
        }),
    )
}

/// List Claude Code session history for a workspace path.
/// Reads JSONL files from `<effective-claude-home>/projects/{encoded-path}/`.
#[tauri::command]
pub async fn list_claude_sessions(
    workspace_path: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "list_claude_sessions",
            json!({ "workspacePath": workspace_path, "limit": limit }),
        )
        .await;
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Claude)
        .await;
    let sessions =
        super::claude_history::list_claude_sessions_with_config(&path, limit, config.as_ref())
            .await?;
    serde_json::to_value(sessions).map_err(|error| error.to_string())
}

/// Load full message history for a specific Claude Code session.
#[tauri::command]
pub async fn load_claude_session(
    workspace_path: String,
    session_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "load_claude_session",
            json!({ "workspacePath": workspace_path, "sessionId": session_id }),
        )
        .await;
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Claude)
        .await;
    let result =
        super::claude_history::load_claude_session_with_config(&path, &session_id, config.as_ref())
            .await?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

/// Load one deferred Claude history image by locator.
#[tauri::command]
pub async fn hydrate_claude_deferred_image(
    workspace_path: String,
    locator: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "hydrate_claude_deferred_image",
            json!({ "workspacePath": workspace_path, "locator": locator }),
        )
        .await;
    }
    let locator = serde_json::from_value(locator)
        .map_err(|error| format!("Invalid Claude deferred image locator: {error}"))?;
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Claude)
        .await;
    let result = super::claude_history::hydrate_claude_deferred_image_with_config(
        &path,
        locator,
        config.as_ref(),
    )
    .await?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

/// Fork a Claude Code session by cloning its JSONL history into a new session id.
#[tauri::command]
pub async fn fork_claude_session(
    workspace_path: String,
    session_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "fork_claude_session",
            json!({ "workspacePath": workspace_path, "sessionId": session_id }),
        )
        .await;
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Claude)
        .await;
    let forked_session_id =
        super::claude_history::fork_claude_session_with_config(&path, &session_id, config.as_ref())
            .await?;
    Ok(json!({
        "thread": {
            "id": format!("claude:{}", forked_session_id)
        },
        "sessionId": forked_session_id
    }))
}

/// Delete a Claude Code session (remove JSONL file from disk).
#[tauri::command]
pub async fn delete_claude_session(
    workspace_path: String,
    session_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        let (method, params) = remote_delete_claude_session_request(workspace_path, session_id);
        let _: Value = call_remote_typed(&*state, &app, method, params).await?;
        return Ok(());
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Claude)
        .await;
    super::claude_history::delete_claude_session_with_config(&path, &session_id, config.as_ref())
        .await
}

/// List Gemini CLI session history for a workspace path.
#[tauri::command]
pub async fn list_gemini_sessions(
    workspace_path: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "list_gemini_sessions",
            json!({ "workspacePath": workspace_path, "limit": limit }),
        )
        .await;
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Gemini)
        .await;
    let sessions = super::gemini_history::list_gemini_sessions(
        &path,
        limit,
        config.as_ref().and_then(|item| item.home_dir.as_deref()),
    )
    .await?;
    serde_json::to_value(sessions).map_err(|error| error.to_string())
}

/// Load full message history for a specific Gemini CLI session.
#[tauri::command]
pub async fn load_gemini_session(
    workspace_path: String,
    session_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let workspace_path = remote_backend::normalize_path_for_remote(workspace_path);
        return remote_backend::call_remote(
            &*state,
            app,
            "load_gemini_session",
            json!({ "workspacePath": workspace_path, "sessionId": session_id }),
        )
        .await;
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Gemini)
        .await;
    let result = super::gemini_history::load_gemini_session(
        &path,
        &session_id,
        config.as_ref().and_then(|item| item.home_dir.as_deref()),
    )
    .await?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

/// Delete a Gemini CLI session.
#[tauri::command]
pub async fn delete_gemini_session(
    workspace_path: String,
    session_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        let (method, params) = remote_delete_gemini_session_request(workspace_path, session_id);
        let _: Value = call_remote_typed(&*state, &app, method, params).await?;
        return Ok(());
    }
    let path = std::path::PathBuf::from(&workspace_path);
    let config = state
        .engine_manager
        .get_engine_config(EngineType::Gemini)
        .await;
    super::gemini_history::delete_gemini_session(
        &path,
        &session_id,
        config.as_ref().and_then(|item| item.home_dir.as_deref()),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{remote_delete_claude_session_request, remote_delete_gemini_session_request};
    use serde_json::json;

    #[test]
    fn remote_delete_claude_session_request_normalizes_workspace_path() {
        let (method, params) = remote_delete_claude_session_request(
            "\\\\wsl$\\Ubuntu\\home\\demo\\repo".to_string(),
            "claude-session-1".to_string(),
        );

        assert_eq!(method, "delete_claude_session");
        assert_eq!(
            params,
            json!({
                "workspacePath": "/home/demo/repo",
                "sessionId": "claude-session-1",
            })
        );
    }

    #[test]
    fn remote_delete_gemini_session_request_normalizes_workspace_path() {
        let (method, params) = remote_delete_gemini_session_request(
            "\\\\wsl$\\Ubuntu\\home\\demo\\repo".to_string(),
            "gemini-session-1".to_string(),
        );

        assert_eq!(method, "delete_gemini_session");
        assert_eq!(
            params,
            json!({
                "workspacePath": "/home/demo/repo",
                "sessionId": "gemini-session-1",
            })
        );
    }
}
