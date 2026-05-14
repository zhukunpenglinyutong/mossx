use super::claude_history::{encode_project_path, load_claude_session_from_base_dir};
use serde_json::json;
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn create_project_dir(base_dir: &Path, workspace_path: &Path) -> PathBuf {
    let project_dir = base_dir.join(encode_project_path(&workspace_path.to_string_lossy()));
    std::fs::create_dir_all(&project_dir).expect("create project dir");
    project_dir
}

fn write_jsonl_lines(path: &Path, lines: &[serde_json::Value], line_ending: &str) {
    let payload = lines
        .iter()
        .map(|line| line.to_string())
        .collect::<Vec<String>>()
        .join(line_ending);
    std::fs::write(path, format!("{}{}", payload, line_ending)).expect("write session");
}

#[tokio::test]
async fn load_claude_session_keeps_issue_529_rows_and_hides_synthetic_resume() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-claude-issue-529-{}", unique));
    let base_dir = temp_root.join("claude-projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");
    std::fs::create_dir_all(&base_dir).expect("create base dir");

    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let session_id = format!("issue-529-{}", unique);
    let session_path = project_dir.join(format!("{}.jsonl", session_id));
    write_jsonl_lines(
        &session_path,
        &[
            json!({
                "type": "user",
                "uuid": "user-first",
                "timestamp": "2026-05-14T09:47:17.480Z",
                "cwd": workspace_path.to_string_lossy(),
                "message": {
                    "role": "user",
                    "content": "哪个是入口文件"
                }
            }),
            json!({
                "type": "user",
                "isMeta": true,
                "uuid": "synthetic-user",
                "timestamp": "2026-05-14T09:51:00.000Z",
                "cwd": workspace_path.to_string_lossy(),
                "message": {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": "Continue from where you left off." }
                    ]
                }
            }),
            json!({
                "type": "assistant",
                "uuid": "synthetic-assistant",
                "timestamp": "2026-05-14T09:51:01.000Z",
                "cwd": workspace_path.to_string_lossy(),
                "message": {
                    "role": "assistant",
                    "model": "<synthetic>",
                    "content": [
                        { "type": "text", "text": "No response requested." }
                    ]
                }
            }),
            json!({
                "type": "user",
                "uuid": "user-second",
                "timestamp": "2026-05-14T09:52:00.000Z",
                "cwd": workspace_path.to_string_lossy(),
                "message": {
                    "role": "user",
                    "content": "修改应用标题为：测试APP"
                }
            }),
            json!({
                "type": "assistant",
                "uuid": "assistant-tool",
                "timestamp": "2026-05-14T09:52:10.000Z",
                "cwd": workspace_path.to_string_lossy(),
                "message": {
                    "role": "assistant",
                    "model": "glm-5",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "call-edit-1",
                            "name": "Edit",
                            "input": {
                                "file_path": "Y:\\\\04_lab\\\\testccgui\\\\main.go",
                                "old_string": "Title: \"Window 1\",",
                                "new_string": "Title: \"测试APP\","
                            }
                        }
                    ]
                }
            }),
            json!({
                "type": "assistant",
                "uuid": "assistant-final",
                "timestamp": "2026-05-14T09:52:26.450Z",
                "cwd": workspace_path.to_string_lossy(),
                "message": {
                    "role": "assistant",
                    "model": "glm-5",
                    "content": [
                        { "type": "text", "text": "已完成修改" }
                    ]
                }
            }),
        ],
        "\n",
    );

    let result = load_claude_session_from_base_dir(&base_dir, &workspace_path, &session_id)
        .await
        .expect("load issue-shaped session");
    assert!(result
        .messages
        .iter()
        .any(|message| message.role == "user" && message.text == "修改应用标题为：测试APP"));
    assert!(result
        .messages
        .iter()
        .any(|message| message.kind == "tool" && message.tool_type.as_deref() == Some("Edit")));
    assert!(result
        .messages
        .iter()
        .any(|message| message.role == "assistant" && message.text == "已完成修改"));
    assert!(!result.messages.iter().any(|message| {
        message.text.contains("Continue from where you left off")
            || message.text.contains("No response requested")
    }));

    let _ = std::fs::remove_dir_all(&temp_root);
}
