use serde_json::json;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::claude_history::{
    delete_claude_session_with_config, list_claude_sessions_with_config,
    load_claude_session_with_config,
};
use super::EngineConfig;

fn encode_project_path(path: &str) -> String {
    path.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn create_project_dir(base_dir: &Path, workspace_path: &Path) -> PathBuf {
    let project_dir = base_dir.join(encode_project_path(&workspace_path.to_string_lossy()));
    std::fs::create_dir_all(&project_dir).expect("create project dir");
    project_dir
}

fn write_jsonl_lines(path: &Path, lines: &[serde_json::Value]) {
    let payload = lines
        .iter()
        .map(|line| line.to_string())
        .collect::<Vec<String>>()
        .join("\n");
    std::fs::write(path, format!("{}\n", payload)).expect("write session");
}

fn test_config(claude_home: &Path) -> EngineConfig {
    EngineConfig {
        home_dir: Some(claude_home.to_string_lossy().to_string()),
        ..EngineConfig::default()
    }
}

#[tokio::test]
async fn lists_and_loads_real_claude_subagent_transcripts() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-claude-subagent-real-{}", unique));
    let claude_home = temp_root.join("claude-home");
    let base_dir = claude_home.join("projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");

    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let parent_session_id = format!("parent-{}", unique);
    let parent_session_path = project_dir.join(format!("{}.jsonl", parent_session_id));
    write_jsonl_lines(
        &parent_session_path,
        &[json!({
            "uuid": "parent-user",
            "timestamp": "2026-05-10T01:00:00.000Z",
            "cwd": workspace_path.to_string_lossy(),
            "message": { "role": "user", "content": "同时启动2个子 agents 分析项目" }
        })],
    );

    let subagents_dir = project_dir.join(&parent_session_id).join("subagents");
    std::fs::create_dir_all(&subagents_dir).expect("create subagents dir");
    let agent_id = "a5e6403f261113239";
    let subagent_path = subagents_dir.join(format!("agent-{}.jsonl", agent_id));
    std::fs::write(
        subagents_dir.join(format!("agent-{}.meta.json", agent_id)),
        r#"{"agentType":"Explore","description":"分析 km-chat-new-web 项目"}"#,
    )
    .expect("write subagent meta");
    write_jsonl_lines(
        &subagent_path,
        &[
            json!({
                "uuid": "agent-user",
                "timestamp": "2026-05-10T01:00:00.000Z",
                "cwd": workspace_path.to_string_lossy(),
                "agentId": agent_id,
                "isSidechain": true,
                "message": { "role": "user", "content": "分析子代理任务" }
            }),
            json!({
                "uuid": "agent-assistant",
                "timestamp": "2026-05-10T01:00:01.000Z",
                "agentId": agent_id,
                "isSidechain": true,
                "message": { "role": "assistant", "content": "子代理分析完成" }
            }),
        ],
    );

    let config = test_config(&claude_home);
    let sessions = list_claude_sessions_with_config(&workspace_path, None, Some(&config))
        .await
        .expect("list claude sessions");
    let child_session_id = format!("subagent:{}:{}", parent_session_id, agent_id);
    let child = sessions
        .iter()
        .find(|session| session.session_id == child_session_id)
        .expect("real subagent session is listed");
    assert_eq!(
        child.parent_session_id.as_deref(),
        Some(parent_session_id.as_str())
    );
    assert_eq!(child.subagent_type.as_deref(), Some("Explore"));
    assert_eq!(child.first_message, "分析 km-chat-new-web 项目");

    let result = load_claude_session_with_config(&workspace_path, &child_session_id, Some(&config))
        .await
        .expect("load real subagent transcript by compound id");

    assert!(result
        .messages
        .iter()
        .any(|message| message.id == "agent-assistant" && message.text == "子代理分析完成"));

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[tokio::test]
async fn delete_claude_subagent_session_removes_real_transcript_and_meta() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-delete-subagent-{}", unique));
    let claude_home = temp_root.join("claude-home");
    let base_dir = claude_home.join("projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");
    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let parent_session_id = format!("parent-{}", unique);
    let agent_id = "a5e6403f261113239";
    let subagents_dir = project_dir.join(&parent_session_id).join("subagents");
    std::fs::create_dir_all(&subagents_dir).expect("create subagents dir");
    let transcript_path = subagents_dir.join(format!("agent-{}.jsonl", agent_id));
    let meta_path = subagents_dir.join(format!("agent-{}.meta.json", agent_id));
    std::fs::write(&transcript_path, "{}\n").expect("write subagent transcript");
    std::fs::write(&meta_path, "{}").expect("write subagent meta");
    let config = test_config(&claude_home);

    delete_claude_session_with_config(
        &workspace_path,
        &format!("subagent:{}:{}", parent_session_id, agent_id),
        Some(&config),
    )
    .await
    .expect("delete subagent session");

    assert!(!transcript_path.exists());
    assert!(!meta_path.exists());
    assert!(!subagents_dir.exists());

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[tokio::test]
async fn delete_claude_parent_session_removes_real_subagent_directory() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-delete-parent-{}", unique));
    let claude_home = temp_root.join("claude-home");
    let base_dir = claude_home.join("projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");
    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let parent_session_id = format!("parent-{}", unique);
    let parent_session_path = project_dir.join(format!("{}.jsonl", parent_session_id));
    std::fs::write(&parent_session_path, "{}\n").expect("write parent session");
    let subagents_dir = project_dir.join(&parent_session_id).join("subagents");
    std::fs::create_dir_all(&subagents_dir).expect("create subagents dir");
    std::fs::write(subagents_dir.join("agent-a5e6403f261113239.jsonl"), "{}\n")
        .expect("write subagent transcript");
    std::fs::write(
        subagents_dir.join("agent-a5e6403f261113239.meta.json"),
        "{}",
    )
    .expect("write subagent meta");
    let config = test_config(&claude_home);

    delete_claude_session_with_config(&workspace_path, &parent_session_id, Some(&config))
        .await
        .expect("delete parent session");

    assert!(!parent_session_path.exists());
    assert!(!project_dir.join(&parent_session_id).exists());

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[tokio::test]
async fn delete_claude_session_rejects_invalid_subagent_path_segments() {
    let workspace_path = std::env::temp_dir();
    for session_id in [
        "subagent:.:agent",
        "subagent:parent:.",
        "subagent:parent:agent*id",
    ] {
        let error = delete_claude_session_with_config(&workspace_path, session_id, None)
            .await
            .expect_err("invalid subagent id should fail before IO");
        assert!(error.contains("Invalid Claude session id"));
    }
}
