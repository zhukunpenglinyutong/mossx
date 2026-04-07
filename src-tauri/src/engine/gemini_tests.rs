use super::EngineEvent;
use super::{
    collect_latest_turn_reasoning_texts, extract_latest_thought_text,
    extract_session_id, extract_tool_events_from_snapshot, parse_gemini_event,
    should_extract_thought_fallback, GeminiSession, GeminiSessionMessage, SendMessageParams,
    GeminiSnapshotToolState,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn with_image_refs_for_test(text: &str, images: &[String]) -> String {
    let workspace_path = std::env::temp_dir();
    with_image_refs_for_test_in_workspace(text, images, workspace_path.as_path())
}

fn with_image_refs_for_test_in_workspace(
    text: &str,
    images: &[String],
    workspace_path: &Path,
) -> String {
    GeminiSession::with_image_references(text, Some(images), workspace_path)
}

fn unique_temp_path(prefix: &str) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    std::env::temp_dir().join(format!("{}-{}-{}", prefix, std::process::id(), timestamp))
}

fn unescape_at_path(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut escaping = false;
    for ch in value.chars() {
        if escaping {
            output.push(ch);
            escaping = false;
            continue;
        }
        if ch == '\\' {
            escaping = true;
            continue;
        }
        output.push(ch);
    }
    if escaping {
        output.push('\\');
    }
    output
}

fn extract_first_image_path(prompt: &str) -> String {
    let marker = '@';
    let start = prompt.find(marker).expect("image marker missing") + 1;
    let tail = &prompt[start..];
    if let Some(quoted_tail) = tail.strip_prefix('"') {
        let end = quoted_tail.find('"').expect("closing quote missing");
        return unescape_at_path(&quoted_tail[..end]);
    }

    let token = tail.split_whitespace().next().expect("missing image path");
    unescape_at_path(token)
}

fn command_args(cmd: &super::Command) -> Vec<String> {
    cmd.as_std()
        .get_args()
        .map(|value| value.to_string_lossy().to_string())
        .collect()
}

#[test]
fn selected_auth_type_for_api_key_modes() {
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("custom")),
        "gemini-api-key"
    );
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("gemini_api_key")),
        "gemini-api-key"
    );
}

#[test]
fn selected_auth_type_for_vertex_modes() {
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("vertex_api_key")),
        "vertex-ai"
    );
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("vertex_adc")),
        "vertex-ai"
    );
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("vertex_service_account")),
        "vertex-ai"
    );
}

#[test]
fn selected_auth_type_for_login_google_mode() {
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("login_google")),
        "oauth-personal"
    );
    assert_eq!(
        GeminiSession::selected_auth_type_for_mode(Some("unknown")),
        "oauth-personal"
    );
}

#[test]
fn locale_hint_detects_chinese_locale() {
    let hint = GeminiSession::locale_to_prompt_language_hint("zh_CN.UTF-8");
    assert_eq!(hint, Some("Output language: Simplified Chinese."));
}

#[test]
fn locale_hint_skips_non_chinese_locale() {
    let hint = GeminiSession::locale_to_prompt_language_hint("en_US.UTF-8");
    assert_eq!(hint, None);
}

#[test]
fn with_image_references_appends_deduped_at_paths() {
    let images = vec![
        "/tmp/screen 1.png".to_string(),
        "/tmp/screen 1.png".to_string(),
        "/tmp/screen-2.jpg".to_string(),
    ];
    let prompt = with_image_refs_for_test("Describe screenshots", images.as_slice());
    assert_eq!(
        prompt,
        "Describe screenshots\n\n@/tmp/screen\\ 1.png @/tmp/screen-2.jpg"
    );
}

#[test]
fn with_image_references_strips_file_uri_prefix() {
    let images = vec!["file:///Users/demo/a.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@/Users/demo/a.png");
}

#[test]
fn with_image_references_normalizes_localhost_file_uri() {
    let images = vec!["file://localhost/Users/demo/a.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@/Users/demo/a.png");
}

#[test]
fn with_image_references_preserves_unc_host_file_uri() {
    let images = vec!["file://server/share/folder/a%20b.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@//server/share/folder/a\\ b.png");
}

#[test]
fn with_image_references_decodes_percent_escaped_file_uri() {
    let images = vec!["file:///Users/demo/a%20b.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@/Users/demo/a\\ b.png");
}

#[test]
fn with_image_references_supports_windows_drive_host_form() {
    let images = vec!["file://C:/Users/demo/a%20b.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    let expected = if cfg!(windows) {
        "Describe\n\n@C:/Users/demo/a\\ b.png"
    } else {
        "Describe\n\n@/C:/Users/demo/a\\ b.png"
    };
    assert_eq!(prompt, expected);
}

#[cfg(windows)]
#[test]
fn with_image_references_normalizes_windows_backslashes() {
    let images = vec![r"C:\Users\demo\Desktop\bug image.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@C:/Users/demo/Desktop/bug\\ image.png");
}

#[cfg(windows)]
#[test]
fn with_image_references_normalizes_windows_unc_backslashes() {
    let images = vec![r"\\server\share\folder\bug image.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@//server/share/folder/bug\\ image.png");
}

#[test]
fn with_image_references_recovers_miswrapped_data_url_file_uri() {
    let images = vec!["data:image/png;base64,file:///Users/demo/c%20d.png".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe\n\n@/Users/demo/c\\ d.png");
}

#[test]
fn with_image_references_materializes_base64_data_urls_to_temp_files() {
    let encoded = STANDARD.encode([0x89, b'P', b'N', b'G']);
    let images = vec![format!("data:image/png;base64,{}", encoded)];
    let workspace_path = unique_temp_path("moss-x-gemini-workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace");
    let prompt = with_image_refs_for_test_in_workspace(
        "Describe",
        images.as_slice(),
        workspace_path.as_path(),
    );
    assert!(prompt.starts_with("Describe\n\n@"));

    let normalized_path = extract_first_image_path(&prompt);

    let path = std::path::Path::new(&normalized_path);
    assert!(path.exists(), "workspace image file should exist");
    assert!(
        path.starts_with(&workspace_path),
        "materialized path should stay inside workspace"
    );
    let bytes = std::fs::read(path).expect("read temp image");
    assert_eq!(bytes, vec![0x89, b'P', b'N', b'G']);
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_dir_all(&workspace_path);
}

#[test]
fn with_image_references_copies_external_local_paths_into_workspace() {
    let workspace_path = unique_temp_path("moss-x-gemini-workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace");
    let source_path = unique_temp_path("moss-x-gemini-source.png");
    std::fs::write(&source_path, [0x89, b'P', b'N', b'G']).expect("write source image");

    let images = vec![source_path.to_string_lossy().to_string()];
    let prompt = with_image_refs_for_test_in_workspace(
        "Describe",
        images.as_slice(),
        workspace_path.as_path(),
    );
    let normalized_path = extract_first_image_path(&prompt);
    let copied_path = PathBuf::from(normalized_path);

    assert!(
        copied_path.starts_with(&workspace_path),
        "copied image path should stay inside workspace"
    );
    let copied_bytes = std::fs::read(&copied_path).expect("read copied image");
    assert_eq!(copied_bytes, vec![0x89, b'P', b'N', b'G']);

    let _ = std::fs::remove_file(&source_path);
    let _ = std::fs::remove_file(&copied_path);
    let _ = std::fs::remove_dir_all(&workspace_path);
}

#[test]
fn with_image_references_skips_unsupported_data_urls() {
    let images = vec!["data:text/plain;base64,SGVsbG8=".to_string()];
    let prompt = with_image_refs_for_test("Describe", images.as_slice());
    assert_eq!(prompt, "Describe");
}

#[test]
fn build_command_keeps_short_prompt_in_argv() {
    let workspace_path = unique_temp_path("moss-x-gemini-workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace");
    let session = GeminiSession::new("workspace-1".to_string(), workspace_path.clone(), None);
    let mut params = SendMessageParams::default();
    params.text = "short prompt".to_string();

    let built = session.build_command(&params);
    assert!(
        built.prompt_stdin_payload.is_none(),
        "short prompt should remain in argv path"
    );
    let args = command_args(&built.command);
    let prompt_idx = args
        .iter()
        .position(|value| value == "--prompt")
        .expect("missing --prompt arg");
    let prompt_value = args
        .get(prompt_idx + 1)
        .expect("missing prompt value after --prompt");
    assert!(
        !prompt_value.is_empty(),
        "short prompt argv value should not be empty placeholder"
    );

    let _ = std::fs::remove_dir_all(&workspace_path);
}

#[test]
fn build_command_routes_long_prompt_to_stdin() {
    let workspace_path = unique_temp_path("moss-x-gemini-workspace");
    std::fs::create_dir_all(&workspace_path).expect("create workspace");
    let session = GeminiSession::new("workspace-1".to_string(), workspace_path.clone(), None);
    let mut params = SendMessageParams::default();
    params.text = "a".repeat(super::GEMINI_PROMPT_ARG_MAX_CHARS + 128);

    let built = session.build_command(&params);
    let payload = built
        .prompt_stdin_payload
        .as_ref()
        .expect("long prompt should be routed via stdin");
    assert!(payload.chars().count() > super::GEMINI_PROMPT_ARG_MAX_CHARS);

    let args = command_args(&built.command);
    let prompt_idx = args
        .iter()
        .position(|value| value == "--prompt")
        .expect("missing --prompt arg");
    let prompt_value = args
        .get(prompt_idx + 1)
        .expect("missing prompt value after --prompt");
    assert_eq!(prompt_value, "", "long prompt should use empty argv placeholder");

    let _ = std::fs::remove_dir_all(&workspace_path);
}

#[test]
fn parse_result_error_maps_to_turn_error() {
    let payload = json!({
        "type": "result",
        "status": "error",
        "error": {
            "message": "quota exceeded"
        }
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::TurnError { error, .. }) => {
            assert!(error.contains("quota exceeded"));
        }
        _ => panic!("expected TurnError"),
    }
}

#[test]
fn parse_result_success_maps_to_turn_completed() {
    let payload = json!({
        "type": "result",
        "status": "success",
        "text": "你好"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    assert!(matches!(parsed, Some(EngineEvent::TurnCompleted { .. })));
}

#[test]
fn parse_reasoning_delta_alias_maps_to_reasoning_delta() {
    let payload = json!({
        "type": "reasoning_delta",
        "delta": "先规划，再执行"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::ReasoningDelta { text, .. }) => {
            assert_eq!(text, "先规划，再执行");
        }
        _ => panic!("expected ReasoningDelta"),
    }
}

#[test]
fn parse_thought_event_with_subject_description_maps_to_reasoning_delta() {
    let payload = json!({
        "type": "thought",
        "subject": "读取项目结构",
        "description": "先检查 README 和 pom.xml"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::ReasoningDelta { text, .. }) => {
            assert_eq!(text, "读取项目结构: 先检查 README 和 pom.xml");
        }
        _ => panic!("expected ReasoningDelta"),
    }
}

#[test]
fn parse_reasoning_keyword_event_with_nested_thought_maps_to_reasoning_delta() {
    let payload = json!({
        "type": "assistant_thinking_update",
        "thought": {
            "subject": "规划步骤",
            "description": "先看配置再看源码"
        }
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::ReasoningDelta { text, .. }) => {
            assert_eq!(text, "规划步骤: 先看配置再看源码");
        }
        _ => panic!("expected ReasoningDelta"),
    }
}

#[test]
fn parse_reasoning_keyword_event_with_nested_message_thoughts_maps_to_reasoning_delta() {
    let payload = json!({
        "type": "assistant_thinking_update",
        "message": {
            "thoughts": [
                {
                    "subject": "读取项目结构",
                    "description": "先看 README 和 package.json"
                }
            ]
        }
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::ReasoningDelta { text, .. }) => {
            assert_eq!(text, "读取项目结构: 先看 README 和 package.json");
        }
        _ => panic!("expected ReasoningDelta"),
    }
}

#[test]
fn parse_message_with_reasoning_role_maps_to_reasoning_delta() {
    let payload = json!({
        "type": "message",
        "role": "assistant_reasoning",
        "delta": "分析上下文..."
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::ReasoningDelta { text, .. }) => {
            assert_eq!(text, "分析上下文...");
        }
        _ => panic!("expected ReasoningDelta"),
    }
}

#[test]
fn thought_fallback_triggers_for_non_reasoning_events() {
    let parsed = EngineEvent::TextDelta {
        workspace_id: "workspace-1".to_string(),
        text: "正文".to_string(),
    };
    assert!(should_extract_thought_fallback(Some(&parsed)));
    assert!(should_extract_thought_fallback(None));
}

#[test]
fn thought_fallback_skips_reasoning_events() {
    let parsed = EngineEvent::ReasoningDelta {
        workspace_id: "workspace-1".to_string(),
        text: "思考".to_string(),
    };
    assert!(!should_extract_thought_fallback(Some(&parsed)));
}

#[test]
fn parse_message_delta_alias_maps_to_text_delta() {
    let payload = json!({
        "type": "message_delta",
        "delta": "回复片段"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::TextDelta { text, .. }) => {
            assert_eq!(text, "回复片段");
        }
        _ => panic!("expected TextDelta"),
    }
}

#[test]
fn parse_response_item_payload_message_maps_to_text_delta() {
    let payload = json!({
        "type": "response_item",
        "payload": {
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "output_text",
                    "text": "第一段正文"
                }
            ]
        }
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::TextDelta { text, .. }) => {
            assert_eq!(text, "第一段正文");
        }
        _ => panic!("expected TextDelta"),
    }
}

#[test]
fn parse_response_output_item_added_maps_to_text_delta() {
    let payload = json!({
        "type": "response.output_item.added",
        "item": {
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "output_text",
                    "text": "第二段正文"
                }
            ]
        }
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::TextDelta { text, .. }) => {
            assert_eq!(text, "第二段正文");
        }
        _ => panic!("expected TextDelta"),
    }
}

#[test]
fn parse_response_item_with_user_role_is_ignored() {
    let payload = json!({
        "type": "response_item",
        "payload": {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "output_text",
                    "text": "用户输入"
                }
            ]
        }
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    assert!(parsed.is_none());
}

#[test]
fn parse_gemini_snapshot_content_maps_to_text_delta() {
    let payload = json!({
        "type": "gemini",
        "content": "接下来，我将创建 PhoneRequest.java 文件。"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    match parsed {
        Some(EngineEvent::TextDelta { text, .. }) => {
            assert_eq!(text, "接下来，我将创建 PhoneRequest.java 文件。");
        }
        _ => panic!("expected TextDelta"),
    }
}

#[test]
fn parse_gemini_snapshot_ignores_user_role() {
    let payload = json!({
        "type": "gemini",
        "role": "user",
        "content": "用户输入"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    assert!(parsed.is_none());
}

#[test]
fn extract_session_id_reads_init_event_shape() {
    let payload = json!({
        "type": "init",
        "session_id": "ses_init_123"
    });
    assert_eq!(
        extract_session_id(&payload).as_deref(),
        Some("ses_init_123")
    );
}

#[test]
fn extract_session_id_reads_nested_result_shape() {
    let payload = json!({
        "type": "result",
        "result": {
            "session": {
                "id": "ses_nested_456"
            }
        }
    });
    assert_eq!(
        extract_session_id(&payload).as_deref(),
        Some("ses_nested_456")
    );
}

#[test]
fn extract_session_id_rejects_invalid_path_like_value() {
    let payload = json!({
        "type": "result",
        "sessionId": "../tmp/session"
    });
    assert!(extract_session_id(&payload).is_none());
}

#[test]
fn parse_done_alias_maps_to_turn_completed() {
    let payload = json!({
        "type": "done",
        "status": "success",
        "text": "完成"
    });
    let parsed = parse_gemini_event("workspace-1", &payload);
    assert!(matches!(parsed, Some(EngineEvent::TurnCompleted { .. })));
}

#[test]
fn extract_tool_events_from_snapshot_emits_started_then_completed_once() {
    let mut tool_states: HashMap<String, GeminiSnapshotToolState> = HashMap::new();
    let started_payload = json!({
        "type": "gemini",
        "toolCalls": [
            {
                "id": "tool-1",
                "displayName": "ReadFile",
                "args": {
                    "path": "README.md"
                }
            }
        ]
    });

    let started_events =
        extract_tool_events_from_snapshot("workspace-1", &started_payload, &mut tool_states);
    assert_eq!(started_events.len(), 1);
    match &started_events[0] {
        EngineEvent::ToolStarted {
            tool_id, tool_name, ..
        } => {
            assert_eq!(tool_id, "tool-1");
            assert_eq!(tool_name, "ReadFile");
        }
        _ => panic!("expected ToolStarted"),
    }

    // Replayed snapshots should not duplicate tool started rows.
    let replay_started =
        extract_tool_events_from_snapshot("workspace-1", &started_payload, &mut tool_states);
    assert!(replay_started.is_empty());

    let completed_payload = json!({
        "type": "gemini",
        "toolCalls": [
            {
                "id": "tool-1",
                "displayName": "ReadFile",
                "args": {
                    "path": "README.md"
                },
                "resultDisplay": "ok",
                "result": {
                    "status": "ok"
                }
            }
        ]
    });
    let completed_events =
        extract_tool_events_from_snapshot("workspace-1", &completed_payload, &mut tool_states);
    assert_eq!(completed_events.len(), 1);
    match &completed_events[0] {
        EngineEvent::ToolCompleted { tool_id, .. } => {
            assert_eq!(tool_id, "tool-1");
        }
        _ => panic!("expected ToolCompleted"),
    }

    // Completed snapshot replay should also stay deduped.
    let replay_completed =
        extract_tool_events_from_snapshot("workspace-1", &completed_payload, &mut tool_states);
    assert!(replay_completed.is_empty());
}

#[test]
fn extract_tool_events_from_snapshot_emits_started_for_completed_only_payload() {
    let mut tool_states: HashMap<String, GeminiSnapshotToolState> = HashMap::new();
    let payload = json!({
        "type": "gemini",
        "message": {
            "toolCalls": [
                {
                    "id": "tool-2",
                    "displayName": "EditFile",
                    "args": {
                        "path": "src/App.tsx"
                    },
                    "status": "completed",
                    "resultDisplay": "updated"
                }
            ]
        }
    });

    let events = extract_tool_events_from_snapshot("workspace-1", &payload, &mut tool_states);
    assert_eq!(events.len(), 2);
    assert!(matches!(events[0], EngineEvent::ToolStarted { .. }));
    assert!(matches!(events[1], EngineEvent::ToolCompleted { .. }));
}

#[test]
fn extract_latest_thought_text_prefers_latest_non_empty_entry() {
    let payload = json!({
        "thoughts": [
            {
                "subject": "先检查上下文",
                "description": "确认用户意图"
            },
            {
                "subject": "再输出答案",
                "description": "整理最终结论"
            }
        ]
    });
    let extracted = extract_latest_thought_text(&payload);
    assert_eq!(extracted.as_deref(), Some("再输出答案: 整理最终结论"));
}

#[test]
fn extract_latest_thought_text_reads_nested_message_payload() {
    let payload = json!({
        "type": "message",
        "message": {
            "messages": [
                {
                    "type": "assistant",
                    "thoughts": [
                        {
                            "subject": "先收集上下文",
                            "description": "读取 docs 和 src 目录"
                        },
                        {
                            "subject": "再生成结论",
                            "description": "整理关键变更点"
                        }
                    ]
                }
            ]
        }
    });
    let extracted = extract_latest_thought_text(&payload);
    assert_eq!(extracted.as_deref(), Some("再生成结论: 整理关键变更点"));
}

#[test]
fn approval_mode_current_uses_cli_default() {
    assert_eq!(GeminiSession::resolve_approval_mode(Some("current")), None);
}

#[test]
fn approval_mode_full_access_maps_to_yolo() {
    assert_eq!(
        GeminiSession::resolve_approval_mode(Some("full-access")),
        Some("yolo")
    );
}

#[test]
fn collect_latest_turn_reasoning_texts_stops_at_latest_user_boundary() {
    let messages = vec![
        GeminiSessionMessage {
            id: "old-r1".to_string(),
            role: "assistant".to_string(),
            text: "旧思考".to_string(),
            images: None,
            timestamp: None,
            kind: "reasoning".to_string(),
            tool_type: None,
            title: None,
            tool_input: None,
            tool_output: None,
        },
        GeminiSessionMessage {
            id: "old-a1".to_string(),
            role: "assistant".to_string(),
            text: "旧正文".to_string(),
            images: None,
            timestamp: None,
            kind: "message".to_string(),
            tool_type: None,
            title: None,
            tool_input: None,
            tool_output: None,
        },
        GeminiSessionMessage {
            id: "u-last".to_string(),
            role: "user".to_string(),
            text: "新的提问".to_string(),
            images: None,
            timestamp: None,
            kind: "message".to_string(),
            tool_type: None,
            title: None,
            tool_input: None,
            tool_output: None,
        },
        GeminiSessionMessage {
            id: "r-last-1".to_string(),
            role: "assistant".to_string(),
            text: "先看目录".to_string(),
            images: None,
            timestamp: None,
            kind: "reasoning".to_string(),
            tool_type: None,
            title: None,
            tool_input: None,
            tool_output: None,
        },
        GeminiSessionMessage {
            id: "r-last-2".to_string(),
            role: "assistant".to_string(),
            text: "再读 README".to_string(),
            images: None,
            timestamp: None,
            kind: "reasoning".to_string(),
            tool_type: None,
            title: None,
            tool_input: None,
            tool_output: None,
        },
    ];
    let collected = collect_latest_turn_reasoning_texts(&messages);
    assert_eq!(
        collected,
        vec!["先看目录".to_string(), "再读 README".to_string()]
    );
}
