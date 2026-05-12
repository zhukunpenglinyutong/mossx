use super::claude_history::{
    encode_project_path, hydrate_claude_deferred_image_from_base_dir,
    list_claude_sessions_from_base_dir, load_claude_session_from_base_dir,
    ClaudeSessionAttributionScope,
};
use super::claude_history_large_payload::{
    extract_images_and_deferred_from_content, CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET,
};
use serde_json::json;
use uuid::Uuid;

fn create_project_dir(
    base_dir: &std::path::Path,
    workspace_path: &std::path::Path,
) -> std::path::PathBuf {
    let project_dir = base_dir.join(encode_project_path(&workspace_path.to_string_lossy()));
    std::fs::create_dir_all(&project_dir).expect("create project dir");
    project_dir
}

fn write_jsonl_lines(path: &std::path::Path, lines: &[serde_json::Value], line_ending: &str) {
    let payload = lines
        .iter()
        .map(|line| line.to_string())
        .collect::<Vec<String>>()
        .join(line_ending);
    std::fs::write(path, format!("{}{}", payload, line_ending)).expect("write session");
}

fn extract_images_from_content(content: &serde_json::Value) -> Vec<String> {
    extract_images_and_deferred_from_content(content, "", 0, None).0
}

#[test]
fn extract_images_from_content_supports_base64_and_url() {
    let content = json!([
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": "AAAA"
            }
        },
        {
            "type": "image",
            "source": {
                "type": "url",
                "url": "https://example.com/a.png"
            }
        }
    ]);
    let images = extract_images_from_content(&content);
    assert_eq!(
        images,
        vec![
            "data:image/png;base64,AAAA".to_string(),
            "https://example.com/a.png".to_string()
        ]
    );
}

#[test]
fn extract_images_from_content_dedupes_repeated_entries() {
    let content = json!([
        {
            "type": "image",
            "source": {
                "type": "url",
                "url": "https://example.com/a.png"
            }
        },
        {
            "type": "image",
            "source": {
                "type": "url",
                "url": "https://example.com/a.png"
            }
        }
    ]);
    let images = extract_images_from_content(&content);
    assert_eq!(images, vec!["https://example.com/a.png".to_string()]);
}

#[tokio::test]
async fn list_claude_sessions_redacts_large_base64_payloads_from_summary_scan() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-claude-large-summary-{}", unique));
    let base_dir = temp_root.join("claude-projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");
    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let large_session_id = format!("large-image-session-{}", unique);
    let small_session_id = format!("normal-session-{}", unique);
    let large_payload = "A".repeat(CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET * 3);

    write_jsonl_lines(
        &project_dir.join(format!("{}.jsonl", large_session_id)),
        &[json!({
            "uuid": "large-user-1",
            "timestamp": "2026-05-09T08:00:00.000Z",
            "session_id": large_session_id,
            "cwd": workspace_path.to_string_lossy(),
            "message": {
                "role": "user",
                "content": [
                    { "type": "text", "text": "Please inspect this screenshot" },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": large_payload
                        }
                    }
                ]
            }
        })],
        "\n",
    );
    write_jsonl_lines(
        &project_dir.join(format!("{}.jsonl", small_session_id)),
        &[json!({
            "uuid": "small-user-1",
            "timestamp": "2026-05-09T08:01:00.000Z",
            "session_id": small_session_id,
            "cwd": workspace_path.to_string_lossy(),
            "message": { "role": "user", "content": "Unrelated valid session" }
        })],
        "\n",
    );

    let attribution_scopes = vec![ClaudeSessionAttributionScope::workspace_path(
        workspace_path.clone(),
    )];
    let sessions = list_claude_sessions_from_base_dir(
        &base_dir,
        &workspace_path,
        &attribution_scopes,
        Some(10),
    )
    .await
    .expect("list sessions");
    assert!(sessions
        .iter()
        .any(|session| session.session_id == large_session_id
            && session.first_message == "Please inspect this screenshot"));
    assert!(sessions
        .iter()
        .any(|session| session.session_id == small_session_id
            && session.first_message == "Unrelated valid session"));
    let serialized = serde_json::to_string(&sessions).expect("serialize summaries");
    assert!(!serialized.contains("data:image/"));
    assert!(!serialized.contains(&"A".repeat(128)));

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[tokio::test]
async fn load_claude_session_defers_large_base64_image_and_hydrates_on_demand() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-claude-deferred-image-{}", unique));
    let base_dir = temp_root.join("claude-projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");
    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let session_id = format!("deferred-image-session-{}", unique);
    let large_payload = "B".repeat(CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET + 1);
    write_jsonl_lines(
        &project_dir.join(format!("{}.jsonl", session_id)),
        &[json!({
            "uuid": "image-message-1",
            "timestamp": "2026-05-09T08:00:00.000Z",
            "session_id": session_id,
            "cwd": workspace_path.to_string_lossy(),
            "message": {
                "role": "user",
                "content": [
                    { "type": "text", "text": "Load this only when I click it" },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": large_payload
                        }
                    }
                ]
            }
        })],
        "\n",
    );

    let result = load_claude_session_from_base_dir(&base_dir, &workspace_path, &session_id)
        .await
        .expect("load session");
    let message = result
        .messages
        .iter()
        .find(|message| message.id == "image-message-1")
        .expect("message with deferred image");
    assert_eq!(message.images, None);
    let deferred = message
        .deferred_images
        .as_ref()
        .and_then(|items| items.first())
        .expect("deferred image");
    assert_eq!(deferred.media_type, "image/png");
    assert_eq!(deferred.locator.session_id, session_id);
    assert_eq!(deferred.locator.line_index, 0);
    assert_eq!(deferred.locator.block_index, 1);
    assert_eq!(
        deferred.locator.message_id.as_deref(),
        Some("image-message-1")
    );
    let serialized = serde_json::to_string(&result).expect("serialize load result");
    assert!(!serialized.contains("data:image/png;base64"));
    assert!(!serialized.contains(&"B".repeat(128)));

    let hydrated = hydrate_claude_deferred_image_from_base_dir(
        &base_dir,
        &workspace_path,
        deferred.locator.clone(),
    )
    .await
    .expect("hydrate deferred image");
    assert_eq!(hydrated.media_type, "image/png");
    assert!(hydrated.src.starts_with("data:image/png;base64,"));
    assert!(hydrated.src.ends_with(&"B".repeat(32)));

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[tokio::test]
async fn hydrate_claude_deferred_image_reports_recoverable_locator_errors() {
    let unique = Uuid::new_v4().to_string();
    let temp_root = std::env::temp_dir().join(format!("ccgui-claude-deferred-errors-{}", unique));
    let base_dir = temp_root.join("claude-projects");
    let workspace_path = temp_root.join("workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace path");
    let project_dir = create_project_dir(&base_dir, &workspace_path);
    let session_id = format!("deferred-error-session-{}", unique);
    let large_payload = "C".repeat(CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET + 1);
    write_jsonl_lines(
        &project_dir.join(format!("{}.jsonl", session_id)),
        &[json!({
            "uuid": "image-message-1",
            "timestamp": "2026-05-09T08:00:00.000Z",
            "session_id": session_id,
            "cwd": workspace_path.to_string_lossy(),
            "message": {
                "role": "user",
                "content": [
                    { "type": "text", "text": "Image with locator checks" },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": large_payload
                        }
                    }
                ]
            }
        })],
        "\n",
    );
    let result = load_claude_session_from_base_dir(&base_dir, &workspace_path, &session_id)
        .await
        .expect("load session");
    let locator = result.messages[0].deferred_images.as_ref().unwrap()[0]
        .locator
        .clone();

    let mut stale_locator = locator.clone();
    stale_locator.message_id = Some("different-message".to_string());
    let stale_error =
        hydrate_claude_deferred_image_from_base_dir(&base_dir, &workspace_path, stale_locator)
            .await
            .expect_err("stale locator should fail");
    assert!(stale_error.contains("message id"));

    let mut unsupported_locator = locator.clone();
    unsupported_locator.media_type = "application/octet-stream".to_string();
    let unsupported_error = hydrate_claude_deferred_image_from_base_dir(
        &base_dir,
        &workspace_path,
        unsupported_locator,
    )
    .await
    .expect_err("unsupported media type should fail");
    assert!(unsupported_error.contains("Unsupported Claude deferred image media type"));

    let mut missing_locator = locator;
    missing_locator.session_id = format!("missing-session-{}", unique);
    let missing_error =
        hydrate_claude_deferred_image_from_base_dir(&base_dir, &workspace_path, missing_locator)
            .await
            .expect_err("missing file should fail");
    assert!(missing_error.contains("Session file not found"));

    let _ = std::fs::remove_dir_all(&temp_root);
}
