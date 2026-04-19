use super::*;
use serde_json::json;

fn test_workspace_path() -> PathBuf {
    std::env::temp_dir().join("ccgui-claude-test-workspace")
}

fn test_external_spec_root() -> String {
    std::env::temp_dir()
        .join("ccgui-external-openspec")
        .to_string_lossy()
        .to_string()
}

#[test]
fn session_creation() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);

    assert_eq!(session.workspace_id, "test-workspace");
}

#[test]
fn format_synthetic_approval_completion_text_aggregates_multiple_entries() {
    let text = format_synthetic_approval_completion_text(&[
        SyntheticApprovalSummaryEntry {
            summary: "Approved and wrote aaa.txt".to_string(),
            path: Some("aaa.txt".to_string()),
            kind: Some("add".to_string()),
            status: "completed".to_string(),
        },
        SyntheticApprovalSummaryEntry {
            summary: "Approved and wrote bbb.txt".to_string(),
            path: Some("bbb.txt".to_string()),
            kind: Some("add".to_string()),
            status: "completed".to_string(),
        },
    ])
    .expect("aggregated summary");

    assert!(text.contains("Completed approved operations:"));
    assert!(text.contains("- Approved and wrote aaa.txt"));
    assert!(text.contains("- Approved and wrote bbb.txt"));
}

#[test]
fn format_synthetic_approval_resume_message_embeds_marker_payload() {
    let message = format_synthetic_approval_resume_message(&[SyntheticApprovalSummaryEntry {
        summary: "Approved and updated aaa.txt".to_string(),
        path: Some("aaa.txt".to_string()),
        kind: Some("modified".to_string()),
        status: "completed".to_string(),
    }]);

    assert!(message.contains(SYNTHETIC_APPROVAL_RESUME_MARKER_PREFIX));
    assert!(message.contains("\"path\":\"aaa.txt\""));
    assert!(message.contains("\"kind\":\"modified\""));
    assert!(message.contains("Please continue from the current workspace state"));
}

#[tokio::test]
async fn ask_user_question_registers_and_clears_pending_request() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let input = json!({
        "questions": [
            {
                "header": "确认",
                "question": "继续吗？",
                "options": [{ "label": "继续", "description": "继续执行" }]
            }
        ]
    });

    let event = session
        .convert_ask_user_question_to_request("tool-ask-1", &input, "turn-1")
        .expect("request user input event");

    let request_id = match event {
        EngineEvent::RequestUserInput { request_id, .. } => request_id,
        other => panic!("unexpected event: {:?}", other),
    };

    assert!(session.has_pending_user_input(&request_id));

    let result = json!({
        "answers": {
            "q-0": {
                "answers": ["继续"]
            }
        }
    });
    session
        .respond_to_user_input(request_id.clone(), result)
        .await
        .expect("respond success");

    assert!(!session.has_pending_user_input(&request_id));
}

#[test]
fn ask_user_question_preserves_multi_select_flag() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let input = json!({
        "questions": [
            {
                "header": "关注点",
                "question": "可多选",
                "multiSelect": true,
                "options": [{ "label": "性能", "description": "" }]
            }
        ]
    });

    let event = session
        .convert_ask_user_question_to_request("tool-ask-multi", &input, "turn-1")
        .expect("request user input event");

    let questions = match event {
        EngineEvent::RequestUserInput { questions, .. } => questions,
        other => panic!("unexpected event: {:?}", other),
    };
    let question = questions
        .as_array()
        .and_then(|arr| arr.first())
        .expect("first question");
    assert_eq!(question["multiSelect"], json!(true));
}

#[test]
fn has_pending_user_input_accepts_numeric_id_for_backward_compat() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    if let Ok(mut pending) = session.pending_user_inputs.lock() {
        pending.insert("42".to_string(), "turn-42".to_string());
    }
    assert!(session.has_pending_user_input(&json!(42)));
    assert!(session.has_pending_user_input(&json!("42")));
}

#[test]
fn has_any_pending_user_input_reports_presence() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    assert!(!session.has_any_pending_user_input());
    if let Ok(mut pending) = session.pending_user_inputs.lock() {
        pending.insert("ask-1".to_string(), "turn-1".to_string());
    }
    assert!(session.has_any_pending_user_input());
}

#[tokio::test]
async fn respond_to_user_input_rejects_mismatched_request_id() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    if let Ok(mut pending) = session.pending_user_inputs.lock() {
        pending.insert("ask-fallback".to_string(), "turn-1".to_string());
    }

    let result = json!({
        "answers": {
            "q-0": {
                "answers": ["继续"]
            }
        }
    });
    let err = session
        .respond_to_user_input(json!(999), result)
        .await
        .expect_err("mismatched request_id should fail");

    assert!(err.contains("unknown request_id"));
    assert!(session.has_any_pending_user_input());
}

#[test]
fn build_command_adds_external_spec_root_when_configured() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "hello".to_string();
    params.custom_spec_root = Some(test_external_spec_root());

    let command = session.build_command(&params, false);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args.windows(2).any(|window| {
        window[0] == "--add-dir" && window[1] == params.custom_spec_root.clone().unwrap()
    }));
}

#[test]
fn should_use_stream_json_input_for_multiline_text_without_images() {
    let mut params = SendMessageParams::default();
    params.text = "line1\nline2".to_string();
    assert!(ClaudeSession::should_use_stream_json_input(&params));
}

#[test]
fn should_not_use_stream_json_input_for_single_line_text_without_images() {
    let mut params = SendMessageParams::default();
    params.text = "single line".to_string();
    assert!(!ClaudeSession::should_use_stream_json_input(&params));
}

#[test]
fn build_command_uses_stream_json_for_multiline_text() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "line1\nline2".to_string();

    let use_stream_json_input = ClaudeSession::should_use_stream_json_input(&params);
    let command = session.build_command(&params, use_stream_json_input);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args
        .windows(2)
        .any(|window| { window[0] == "--input-format" && window[1] == "stream-json" }));
    assert!(args.iter().all(|arg| arg != "line1\nline2"));
}

#[test]
fn build_resume_command_uses_stream_json_for_multiline_answer() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "line1\r\nline2".to_string();
    params.continue_session = true;
    params.session_id = Some("33333333-3333-4333-8333-333333333333".to_string());
    params.images = None;

    let use_stream_json_input = ClaudeSession::should_use_stream_json_input(&params);
    let command = session.build_command(&params, use_stream_json_input);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args.windows(2).any(|window| {
        window[0] == "--resume" && window[1] == "33333333-3333-4333-8333-333333333333"
    }));
    assert!(args
        .windows(2)
        .any(|window| { window[0] == "--input-format" && window[1] == "stream-json" }));
    assert!(args.iter().all(|arg| arg != "line1\r\nline2"));
}
