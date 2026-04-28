use super::{approval, ClaudeSession};
use crate::engine::events::EngineEvent;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn test_workspace_path() -> PathBuf {
    std::env::temp_dir().join("ccgui-claude-test-workspace")
}

#[test]
fn normalize_claude_workspace_relative_path_accepts_segmented_path() {
    let normalized =
        approval::normalize_claude_workspace_relative_path(Path::new("nested/path/demo.txt"))
            .expect("path should normalize");
    assert_eq!(normalized, "nested/path/demo.txt");
}

#[test]
fn command_can_apply_as_local_file_action_accepts_windows_style_path_and_cmd_alias() {
    assert!(approval::command_can_apply_as_local_file_action(
        r#"mkdir nested\windows\dir"#
    ));
    assert!(approval::command_can_apply_as_local_file_action(
        r#"touch nested\windows\file.txt"#
    ));
}

#[tokio::test]
async fn synthetic_claude_file_approval_accept_creates_missing_parent_directories() {
    let workspace_root =
        std::env::temp_dir().join(format!("ccgui-claude-approval-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&workspace_root).expect("create temp workspace");
    let file_path = workspace_root
        .join("nested")
        .join("deep")
        .join("approved.txt");

    let session = ClaudeSession::new("test-workspace".to_string(), workspace_root.clone(), None);

    session.cache_tool_name("tool-write-nested", "Write");
    session.cache_tool_input_value(
        "tool-write-nested",
        &json!({
            "file_path": "nested\\deep\\approved.txt",
            "content": "nested approval"
        }),
    );
    session.register_pending_tool("turn-nested", "tool-write-nested", "Write", None);
    session
        .pending_approval_requests
        .lock()
        .expect("pending approvals lock")
        .insert("tool-write-nested".to_string(), "turn-nested".to_string());

    session
        .respond_to_approval_request(
            Value::String("tool-write-nested".to_string()),
            Value::String("accept".to_string()),
        )
        .await
        .expect("approval should create missing parent directories");

    assert_eq!(
        std::fs::read_to_string(&file_path).expect("file should exist"),
        "nested approval"
    );
    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[tokio::test]
async fn synthetic_claude_file_approval_accepts_absolute_workspace_path() {
    let workspace_root =
        std::env::temp_dir().join(format!("ccgui-claude-approval-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&workspace_root).expect("create temp workspace");
    let file_path = workspace_root.join("absolute-approved.txt");

    let session = ClaudeSession::new("test-workspace".to_string(), workspace_root.clone(), None);

    session.cache_tool_name("tool-write-absolute", "Write");
    session.cache_tool_input_value(
        "tool-write-absolute",
        &json!({
            "file_path": file_path.to_string_lossy().to_string(),
            "content": "absolute approval"
        }),
    );
    session.register_pending_tool("turn-absolute", "tool-write-absolute", "Write", None);
    session
        .pending_approval_requests
        .lock()
        .expect("pending approvals lock")
        .insert(
            "tool-write-absolute".to_string(),
            "turn-absolute".to_string(),
        );

    session
        .respond_to_approval_request(
            Value::String("tool-write-absolute".to_string()),
            Value::String("accept".to_string()),
        )
        .await
        .expect("absolute workspace path should resolve");

    assert_eq!(
        std::fs::read_to_string(&file_path).expect("file should exist"),
        "absolute approval"
    );
    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[test]
fn convert_event_treats_cmd_alias_single_path_command_as_file_approval() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut receiver = session.subscribe();

    session.cache_tool_name("tool-bash-cmd", "Bash");
    session.cache_tool_input_value(
        "tool-bash-cmd",
        &json!({
            "cmd": r#"mkdir nested\windows\dir"#
        }),
    );
    session.register_pending_tool("turn-cmd", "tool-bash-cmd", "Bash", None);

    let event = json!({
        "type": "assistant",
        "message": {
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "tool-bash-cmd",
                    "is_error": true,
                    "content": "This command requires approval"
                }
            ]
        }
    });

    let converted = session.convert_event("turn-cmd", &event);
    assert!(converted.is_none());

    let approval = receiver
        .try_recv()
        .expect("expected approval request event");
    match approval.event {
        EngineEvent::ApprovalRequest {
            request_id,
            tool_name,
            input,
            ..
        } => {
            assert_eq!(request_id, Value::String("tool-bash-cmd".to_string()));
            assert_eq!(tool_name, "Bash");
            assert_eq!(
                input.as_ref().and_then(|value| value.get("cmd")),
                Some(&Value::String(r#"mkdir nested\windows\dir"#.to_string()))
            );
        }
        other => panic!("expected approval request, got {:?}", other),
    }
}

#[cfg(unix)]
#[tokio::test]
async fn synthetic_claude_file_approval_rejects_symlink_targets() {
    use std::os::unix::fs::symlink;

    let workspace_root =
        std::env::temp_dir().join(format!("ccgui-claude-approval-{}", uuid::Uuid::new_v4()));
    let outside_root =
        std::env::temp_dir().join(format!("ccgui-claude-outside-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&workspace_root).expect("create temp workspace");
    std::fs::create_dir_all(&outside_root).expect("create outside workspace");
    let outside_file = outside_root.join("outside.txt");
    std::fs::write(&outside_file, "outside").expect("seed outside file");
    let symlink_path = workspace_root.join("linked.txt");
    symlink(&outside_file, &symlink_path).expect("create symlink");

    let session = ClaudeSession::new("test-workspace".to_string(), workspace_root.clone(), None);
    let mut receiver = session.subscribe();

    session.cache_tool_name("tool-write-symlink", "Write");
    session.cache_tool_input_value(
        "tool-write-symlink",
        &json!({
            "file_path": symlink_path.to_string_lossy(),
            "content": "modified through symlink"
        }),
    );
    session.register_pending_tool("turn-symlink", "tool-write-symlink", "Write", None);
    session
        .pending_approval_requests
        .lock()
        .expect("pending approvals lock")
        .insert("tool-write-symlink".to_string(), "turn-symlink".to_string());

    session
        .respond_to_approval_request(
            Value::String("tool-write-symlink".to_string()),
            Value::String("accept".to_string()),
        )
        .await
        .expect("approval response should complete with tool error");

    let completion = receiver.try_recv().expect("expected tool completion event");
    match completion.event {
        EngineEvent::ToolCompleted { error, .. } => {
            assert_eq!(
                error.as_deref(),
                Some("Claude approval preview cannot modify symlink targets.")
            );
        }
        other => panic!("expected tool completed event, got {:?}", other),
    }

    assert_eq!(
        std::fs::read_to_string(&outside_file).expect("outside file should stay untouched"),
        "outside"
    );
    let _ = std::fs::remove_dir_all(&workspace_root);
    let _ = std::fs::remove_dir_all(&outside_root);
}
