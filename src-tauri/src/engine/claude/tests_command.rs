use super::*;

fn test_workspace_path() -> PathBuf {
    std::env::temp_dir().join("ccgui-claude-test-workspace")
}

#[test]
fn build_command_uses_session_id_for_new_conversation_without_continue() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "hello".to_string();
    params.continue_session = false;
    params.session_id = Some("11111111-1111-4111-8111-111111111111".to_string());

    let command = session.build_command(&params, false, true);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args.windows(2).any(|window| {
        window[0] == "--session-id" && window[1] == "11111111-1111-4111-8111-111111111111"
    }));
    assert!(!args
        .iter()
        .any(|arg| arg == "--continue" || arg == "--resume"));
}

#[test]
fn build_command_uses_resume_when_continue_session_is_enabled() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "hello".to_string();
    params.continue_session = true;
    params.session_id = Some("22222222-2222-4222-8222-222222222222".to_string());

    let command = session.build_command(&params, false, true);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args.windows(2).any(|window| {
        window[0] == "--resume" && window[1] == "22222222-2222-4222-8222-222222222222"
    }));
    assert!(!args.iter().any(|arg| arg == "--session-id"));
}

#[test]
fn build_command_includes_hook_events_when_requested() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "hello".to_string();

    let command = session.build_command(&params, false, true);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args.iter().any(|arg| arg == "--include-hook-events"));
}

#[test]
fn build_command_marks_gui_launch_as_claude_non_interactive() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "hello".to_string();

    let command = session.build_command(&params, false, true);

    assert!(command.as_std().get_envs().any(|(key, value)| {
        key == CLAUDE_NON_INTERACTIVE_ENV && value.is_some_and(|entry| entry == "1")
    }));
}

#[test]
fn build_command_can_omit_hook_events_for_legacy_retry() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "hello".to_string();

    let command = session.build_command(&params, false, false);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(!args.iter().any(|arg| arg == "--include-hook-events"));
}

#[test]
fn detects_unknown_include_hook_events_errors_for_legacy_retry() {
    assert!(ClaudeSession::is_unknown_include_hook_events_error(
        "error: unknown option '--include-hook-events'",
    ));
    assert!(ClaudeSession::is_unknown_include_hook_events_error(
        "unrecognized option: --include-hook-events",
    ));
    assert!(!ClaudeSession::is_unknown_include_hook_events_error(
        "API Error: provider overloaded",
    ));
}

#[test]
fn build_command_uses_native_fork_session_contract() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "branch from parent".to_string();
    params.session_id = Some("child-should-not-be-used".to_string());
    params.fork_session_id = Some("33333333-3333-4333-8333-333333333333".to_string());

    let command = session.build_command(&params, false, true);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args.windows(2).any(|window| {
        window[0] == "--resume" && window[1] == "33333333-3333-4333-8333-333333333333"
    }));
    assert!(args.iter().any(|arg| arg == "--fork-session"));
    assert!(!args
        .windows(2)
        .any(|window| { window[0] == "--session-id" && window[1] == "child-should-not-be-used" }));
}

#[test]
fn build_command_rejects_invalid_native_fork_session_ids() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    for invalid in [
        "",
        "   ",
        ".",
        "../secrets",
        "..\\secrets",
        "--continue",
        "abc\nresume",
        "parent:child",
        "parent.jsonl",
    ] {
        let mut params = SendMessageParams::default();
        params.text = "branch from parent".to_string();
        params.fork_session_id = Some(invalid.to_string());
        params.continue_session = true;
        params.session_id = Some("must-not-fallback".to_string());

        assert!(
            ClaudeSession::normalized_fork_session_id(&params).is_err(),
            "expected invalid fork session id to be rejected: {invalid:?}",
        );
        let command = session.build_command(&params, false, true);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();
        assert!(
            !args.iter().any(|arg| arg == "--fork-session"),
            "invalid fork session id must not reach argv: {args:?}",
        );
        assert!(
            !args
                .windows(2)
                .any(|window| window[0] == "--resume" && window[1] == "must-not-fallback"),
            "invalid fork session id must not silently fall back to resume: {args:?}",
        );
        assert!(
            !args.iter().any(|arg| arg == "--continue"),
            "invalid fork session id must not silently fall back to continue: {args:?}",
        );
    }
}

#[test]
fn build_command_passes_custom_bracket_model_to_cli_argv() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut params = SendMessageParams::default();
    params.text = "1+1".to_string();
    params.model = Some("Cxn[1m]".to_string());

    let command = session.build_command(&params, false, true);
    let args: Vec<String> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert!(args
        .windows(2)
        .any(|window| { window[0] == "--model" && window[1] == "Cxn[1m]" }));
}

#[test]
fn build_command_appends_allowed_reasoning_efforts() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);

    for effort in ["low", "medium", "high", "xhigh", "max"] {
        let mut params = SendMessageParams::default();
        params.text = "1+1".to_string();
        params.effort = Some(effort.to_string());

        let command = session.build_command(&params, false, true);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(
            args.windows(2)
                .any(|window| window[0] == "--effort" && window[1] == effort),
            "missing --effort {effort} in args: {args:?}"
        );
    }
}

#[test]
fn build_command_ignores_missing_empty_and_invalid_reasoning_effort() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);

    for effort in [None, Some(""), Some("   "), Some("ultra"), Some("--danger")] {
        let mut params = SendMessageParams::default();
        params.text = "1+1".to_string();
        params.effort = effort.map(str::to_string);

        let command = session.build_command(&params, false, true);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(!args.iter().any(|arg| arg == "--effort"));
        assert!(!args.iter().any(|arg| arg == "--danger"));
        assert!(!args.iter().any(|arg| arg == "ultra"));
    }
}
