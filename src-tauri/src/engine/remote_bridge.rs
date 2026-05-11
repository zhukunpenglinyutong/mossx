use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::remote_backend;
use crate::state::AppState;

use super::EngineType;

pub(crate) async fn call_remote_typed<T: DeserializeOwned>(
    state: &AppState,
    app: &AppHandle,
    method: &str,
    params: Value,
) -> Result<T, String> {
    let response = remote_backend::call_remote(state, app.clone(), method, params).await?;
    serde_json::from_value(response).map_err(|error| error.to_string())
}

pub(crate) fn remote_detect_engines_request() -> (&'static str, Value) {
    ("detect_engines", json!({}))
}

pub(crate) fn remote_engine_send_message_sync_request(
    workspace_id: String,
    text: String,
    engine: Option<EngineType>,
    model: Option<String>,
    effort: Option<String>,
    disable_thinking: Option<bool>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    continue_session: bool,
    session_id: Option<String>,
    fork_session_id: Option<String>,
    agent: Option<String>,
    variant: Option<String>,
    custom_spec_root: Option<String>,
) -> (&'static str, Value) {
    let images = images.map(|paths| {
        paths
            .into_iter()
            .map(remote_backend::normalize_path_for_remote)
            .collect::<Vec<_>>()
    });
    (
        "engine_send_message_sync",
        json!({
            "workspaceId": workspace_id,
            "text": text,
            "engine": engine,
            "model": model,
            "effort": effort,
            "disableThinking": disable_thinking.unwrap_or(false),
            "accessMode": access_mode,
            "images": images,
            "continueSession": continue_session,
            "sessionId": session_id,
            "forkSessionId": fork_session_id,
            "agent": agent,
            "variant": variant,
            "customSpecRoot": custom_spec_root,
        }),
    )
}

pub(crate) fn remote_engine_interrupt_request(workspace_id: String) -> (&'static str, Value) {
    ("engine_interrupt", json!({ "workspaceId": workspace_id }))
}

#[cfg(test)]
mod tests {
    use super::{
        remote_detect_engines_request, remote_engine_interrupt_request,
        remote_engine_send_message_sync_request,
    };
    use crate::engine::EngineType;
    use serde_json::json;

    #[test]
    fn remote_detect_engines_request_has_expected_shape() {
        let (method, params) = remote_detect_engines_request();

        assert_eq!(method, "detect_engines");
        assert_eq!(params, json!({}));
    }

    #[test]
    fn remote_engine_send_message_sync_request_normalizes_images() {
        let (method, params) = remote_engine_send_message_sync_request(
            "ws-remote".to_string(),
            "hello remote".to_string(),
            Some(EngineType::Claude),
            None,
            None,
            Some(true),
            Some("read-only".to_string()),
            Some(vec!["\\\\wsl$\\Ubuntu\\home\\demo\\shot.png".to_string()]),
            false,
            None,
            None,
            None,
            None,
            Some("/tmp/spec-root".to_string()),
        );

        assert_eq!(method, "engine_send_message_sync");
        assert_eq!(params["workspaceId"], "ws-remote");
        assert_eq!(params["text"], "hello remote");
        assert_eq!(params["engine"], "claude");
        assert_eq!(params["accessMode"], "read-only");
        assert_eq!(params["disableThinking"], true);
        assert_eq!(params["images"], json!(["/home/demo/shot.png"]));
        assert_eq!(params["customSpecRoot"], "/tmp/spec-root");
    }

    #[test]
    fn remote_engine_interrupt_request_maps_workspace_id() {
        let (method, params) = remote_engine_interrupt_request("ws-interrupt".to_string());

        assert_eq!(method, "engine_interrupt");
        assert_eq!(params, json!({ "workspaceId": "ws-interrupt" }));
    }
}
