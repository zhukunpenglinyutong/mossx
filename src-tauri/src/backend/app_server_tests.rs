use super::{
    build_late_turn_error_event, build_late_turn_started_event, build_mode_blocked_event,
    build_plan_blocker_user_input_event, codex_args_override_instructions,
    codex_external_spec_priority_config_arg, detect_plan_blocker_reason,
    detect_repo_mutating_blocked_method, evaluate_auto_compaction_state,
    extract_compaction_usage_percent, extract_plan_step_count, extract_stream_delta_text,
    extract_thread_id, is_codex_thread_id, is_plan_blocker_stream_method,
    is_repo_mutating_command_tokens, looks_like_executable_plan_text,
    looks_like_plan_blocker_prompt, looks_like_user_info_followup_prompt,
    normalize_command_tokens_from_item, now_millis, should_block_request_user_input,
    should_skip_codex_stderr_line, visible_console_fallback_enabled_from_env,
    wrapper_kind_for_binary, AutoCompactionThreadState, DeferredStartupEventSink, PlanTurnState,
    RuntimeShutdownSource, TimedOutRequest, WorkspaceSession, AUTO_COMPACTION_THRESHOLD_PERCENT,
    MODE_BLOCKED_PLAN_REASON, MODE_BLOCKED_PLAN_SUGGESTION, MODE_BLOCKED_REASON,
    MODE_BLOCKED_REASON_CODE_PLAN_READONLY, MODE_BLOCKED_REASON_CODE_REQUEST_USER_INPUT,
    MODE_BLOCKED_SUGGESTION,
};
use crate::backend::events::{AppServerEvent, EventSink, TerminalOutput};
use crate::runtime::RuntimeManager;
use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, Mutex};

#[derive(Clone, Default)]
struct TestEventSink {
    app_server_events: Arc<StdMutex<Vec<AppServerEvent>>>,
}

impl TestEventSink {
    fn emitted_app_server_events(&self) -> Vec<AppServerEvent> {
        self.app_server_events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

impl EventSink for TestEventSink {
    fn emit_app_server_event(&self, event: AppServerEvent) {
        self.app_server_events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(event);
    }

    fn emit_terminal_output(&self, _event: TerminalOutput) {}
}

#[test]
fn deferred_startup_event_sink_buffers_until_flush() {
    let inner = TestEventSink::default();
    let sink = DeferredStartupEventSink::new(inner.clone());

    sink.emit_app_server_event(AppServerEvent {
        workspace_id: "workspace-1".to_string(),
        message: json!({ "method": "runtime/ended" }),
    });
    assert!(inner.emitted_app_server_events().is_empty());

    sink.flush_and_forward();
    let events = inner.emitted_app_server_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].message["method"], "runtime/ended");

    sink.emit_app_server_event(AppServerEvent {
        workspace_id: "workspace-1".to_string(),
        message: json!({ "method": "codex/connected" }),
    });
    let events = inner.emitted_app_server_events();
    assert_eq!(events.len(), 2);
    assert_eq!(events[1].message["method"], "codex/connected");
}

#[test]
fn deferred_startup_event_sink_discards_primary_failure_events() {
    let inner = TestEventSink::default();
    let sink = DeferredStartupEventSink::new(inner.clone());

    sink.emit_app_server_event(AppServerEvent {
        workspace_id: "workspace-1".to_string(),
        message: json!({ "method": "runtime/ended" }),
    });
    sink.discard();
    sink.emit_app_server_event(AppServerEvent {
        workspace_id: "workspace-1".to_string(),
        message: json!({ "method": "codex/stderr" }),
    });

    assert!(inner.emitted_app_server_events().is_empty());
}

fn workspace_entry(id: &str) -> WorkspaceEntry {
    let mut settings = WorkspaceSettings::default();
    settings.engine_type = Some("codex".to_string());
    WorkspaceEntry {
        id: id.to_string(),
        name: format!("Workspace {id}"),
        path: std::env::temp_dir().join(id).display().to_string(),
        codex_bin: None,
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings,
    }
}

fn spawn_test_runtime_process() -> (tokio::process::Child, String) {
    #[cfg(windows)]
    {
        let command_path = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut command = Command::new(&command_path);
        command.args(["/Q", "/K"]);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        let child = command
            .spawn()
            .unwrap_or_else(|error| panic!("failed to spawn {command_path}: {error}"));
        return (child, command_path);
    }

    #[cfg(not(windows))]
    {
        let command_path = "cat".to_string();
        let mut command = Command::new(&command_path);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        let child = command
            .spawn()
            .unwrap_or_else(|error| panic!("failed to spawn {command_path}: {error}"));
        return (child, command_path);
    }
}

async fn make_workspace_session(id: &str) -> Arc<WorkspaceSession> {
    let (mut child, resolved_bin) = spawn_test_runtime_process();
    let process_id = child.id();
    let stdin = child.stdin.take().expect("test child stdin");
    Arc::new(WorkspaceSession {
        entry: workspace_entry(id),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        wrapper_kind: "direct".to_string(),
        resolved_bin,
        process_id,
        started_at_ms: now_millis(),
        pending: Mutex::new(HashMap::new()),
        timed_out_requests: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        thread_mode_state: crate::codex::thread_mode_state::ThreadModeState::default(),
        mode_enforcement_enabled: AtomicBool::new(false),
        collaboration_mode_supported: AtomicBool::new(false),
        auto_compaction_threshold_percent: AUTO_COMPACTION_THRESHOLD_PERCENT,
        auto_compaction_enabled: true,
        auto_compaction_thread_state: Mutex::new(HashMap::new()),
        plan_turn_state: Mutex::new(HashMap::new()),
        local_user_input_requests: Mutex::new(HashMap::new()),
        local_request_seq: AtomicU64::new(1),
        resume_pending_turns: Mutex::new(HashMap::new()),
        runtime_manager: StdMutex::new(None),
        active_turns: Mutex::new(HashMap::new()),
        manual_shutdown_requested: AtomicBool::new(false),
        shutdown_source: StdMutex::new(None),
        shutdown_had_active_work_protection: AtomicBool::new(false),
        runtime_end_emitted: AtomicBool::new(false),
    })
}

async fn dispose_workspace_session(session: &WorkspaceSession) {
    session.mark_manual_shutdown();
    let mut child = session.child.lock().await;
    let _ = child.kill().await;
    let _ = child.wait().await;
}

#[test]
fn extract_thread_id_reads_camel_case() {
    let value = json!({ "params": { "threadId": "thread-123" } });
    assert_eq!(extract_thread_id(&value), Some("thread-123".to_string()));
}

#[test]
fn extract_thread_id_reads_snake_case() {
    let value = json!({ "params": { "thread_id": "thread-456" } });
    assert_eq!(extract_thread_id(&value), Some("thread-456".to_string()));
}

#[test]
fn extract_thread_id_reads_turn_nested_shape() {
    let value = json!({ "params": { "turn": { "threadId": "thread-turn-1" } } });
    assert_eq!(extract_thread_id(&value), Some("thread-turn-1".to_string()));
    let value = json!({ "params": { "turn": { "thread_id": "thread-turn-2" } } });
    assert_eq!(extract_thread_id(&value), Some("thread-turn-2".to_string()));
}

#[test]
fn extract_thread_id_returns_none_when_missing() {
    let value = json!({ "params": {} });
    assert_eq!(extract_thread_id(&value), None);
}

#[test]
fn extract_compaction_usage_percent_reads_token_count_last_payload() {
    let value = json!({
        "method": "token_count",
        "params": {
            "info": {
                "last_token_usage": {
                    "input_tokens": 160000,
                    "cached_input_tokens": 40000,
                    "model_context_window": 200000
                }
            }
        }
    });
    let percent = extract_compaction_usage_percent(&value).unwrap_or_default();
    assert!((percent - 100.0).abs() < 0.0001);
}

#[test]
fn extract_compaction_usage_percent_returns_none_when_token_count_last_missing() {
    let value = json!({
        "method": "token_count",
        "params": {
            "info": {
                "total_token_usage": {
                    "input_tokens": 160000,
                    "cached_input_tokens": 40000,
                    "model_context_window": 200000
                }
            }
        }
    });
    assert!(extract_compaction_usage_percent(&value).is_none());
}

#[test]
fn extract_compaction_usage_percent_prefers_last_token_count_snapshot() {
    let value = json!({
        "method": "token_count",
        "params": {
            "info": {
                "total_token_usage": {
                    "input_tokens": 180000,
                    "cached_input_tokens": 0,
                    "model_context_window": 200000
                },
                "last_token_usage": {
                    "input_tokens": 20000,
                    "cached_input_tokens": 0,
                    "model_context_window": 200000
                }
            }
        }
    });
    let percent = extract_compaction_usage_percent(&value).unwrap_or_default();
    assert!((percent - 10.0).abs() < 0.0001);
}

#[test]
fn extract_compaction_usage_percent_reads_thread_last_usage_payload() {
    let value = json!({
        "method": "thread/tokenUsage/updated",
        "params": {
            "tokenUsage": {
                "last": {
                    "inputTokens": 92000,
                    "cachedInputTokens": 0
                },
                "modelContextWindow": 100000
            }
        }
    });
    let percent = extract_compaction_usage_percent(&value).unwrap_or_default();
    assert!((percent - 92.0).abs() < 0.0001);
}

#[test]
fn extract_compaction_usage_percent_returns_none_when_thread_last_missing() {
    let value = json!({
        "method": "thread/tokenUsage/updated",
        "params": {
            "tokenUsage": {
                "total": {
                    "inputTokens": 92000,
                    "cachedInputTokens": 0
                },
                "modelContextWindow": 100000
            }
        }
    });
    assert!(extract_compaction_usage_percent(&value).is_none());
}

#[test]
fn extract_compaction_usage_percent_prefers_thread_last_snapshot() {
    let value = json!({
        "method": "thread/tokenUsage/updated",
        "params": {
            "tokenUsage": {
                "total": {
                    "inputTokens": 190000,
                    "cachedInputTokens": 0
                },
                "last": {
                    "inputTokens": 20000,
                    "cachedInputTokens": 0
                },
                "modelContextWindow": 200000
            }
        }
    });
    let percent = extract_compaction_usage_percent(&value).unwrap_or_default();
    assert!((percent - 10.0).abs() < 0.0001);
}

#[test]
fn is_codex_thread_id_filters_non_codex_prefixes() {
    assert!(is_codex_thread_id("thread-1"));
    assert!(is_codex_thread_id("codex-abc"));
    assert!(!is_codex_thread_id("claude:session-1"));
    assert!(!is_codex_thread_id("claude-pending-1"));
    assert!(!is_codex_thread_id("opencode:session-1"));
    assert!(!is_codex_thread_id("gemini:session-1"));
    assert!(!is_codex_thread_id(""));
}

#[test]
fn should_skip_codex_stderr_line_filters_rmcp_authrequired_noise() {
    let noisy_line = "\u{1b}[2m2026-04-14T05:38:37Z\u{1b}[0m \u{1b}[31mERROR\u{1b}[0m \u{1b}[2mrmcp::transport::worker\u{1b}[0m: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: \"Bearer resource_metadata=https://mcp.stripe.com/.well-known/oauth-protected-resource\" })";
    assert!(should_skip_codex_stderr_line(noisy_line));
    assert!(should_skip_codex_stderr_line("   "));
    assert!(!should_skip_codex_stderr_line(
        "ERROR: git failed: fatal: not a git repository"
    ));
}

#[test]
fn evaluate_auto_compaction_state_applies_processing_cooldown_and_trigger() {
    let mut state = AutoCompactionThreadState::default();

    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "turn/started",
        Some(95.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        10_000,
    ));
    assert!(state.is_processing);
    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(95.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        20_000,
    ));
    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "turn/completed",
        None,
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        30_000,
    ));
    assert!(evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(95.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        100_000,
    ));
    assert!(state.in_flight);
    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(96.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        100_500,
    ));
    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "thread/compacted",
        None,
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        101_000,
    ));
    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(95.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        110_000,
    ));
    assert!(evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(95.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        true,
        200_000,
    ));
}

#[test]
fn evaluate_auto_compaction_state_uses_configured_threshold() {
    let mut state = AutoCompactionThreadState::default();

    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(115.0),
        120.0,
        true,
        100_000,
    ));
    assert!(evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(120.0),
        120.0,
        true,
        200_000,
    ));
}

#[test]
fn evaluate_auto_compaction_state_respects_disabled_setting() {
    let mut state = AutoCompactionThreadState::default();

    assert!(!evaluate_auto_compaction_state(
        &mut state,
        "token_count",
        Some(95.0),
        AUTO_COMPACTION_THRESHOLD_PERCENT,
        false,
        100_000,
    ));
    assert!(!state.in_flight);
}

#[test]
fn codex_args_override_instructions_detects_developer_instructions() {
    assert!(codex_args_override_instructions(Some(
        r#"-c developer_instructions="follow workspace policy""#
    )));
    assert!(codex_args_override_instructions(Some(
        r#"--config instructions="be concise""#
    )));
}

#[test]
fn codex_args_override_instructions_ignores_unrelated_configs() {
    assert!(!codex_args_override_instructions(Some(
        r#"-c model="gpt-5.3-codex" --search"#
    )));
    assert!(!codex_args_override_instructions(None));
}

#[test]
fn codex_external_spec_priority_config_arg_is_toml_quoted() {
    let arg = codex_external_spec_priority_config_arg();
    assert!(arg.starts_with("developer_instructions=\""));
    assert!(arg.ends_with('"'));
    assert!(arg.contains("writableRoots"));
}

#[test]
fn build_late_turn_started_event_extracts_turn_identity() {
    let response = json!({
        "id": 9,
        "result": {
            "turn": {
                "id": "turn-123",
                "threadId": "thread-456"
            }
        }
    });

    let event = build_late_turn_started_event(&response).expect("late turn event");
    assert_eq!(
        event.get("method").and_then(Value::as_str),
        Some("turn/started")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("threadId"))
            .and_then(Value::as_str),
        Some("thread-456")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("turnId"))
            .and_then(Value::as_str),
        Some("turn-123")
    );
}

#[test]
fn build_late_turn_error_event_extracts_thread_identity_and_message() {
    let response = json!({
        "id": 9,
        "error": {
            "message": "Upstream overloaded",
            "code": -32001
        }
    });
    let request = TimedOutRequest {
        method: "turn/start".to_string(),
        thread_id: Some("thread-456".to_string()),
        timed_out_at_ms: 0,
    };

    let event = build_late_turn_error_event(&response, &request).expect("late turn error");
    assert_eq!(
        event.get("method").and_then(Value::as_str),
        Some("turn/error")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("threadId"))
            .and_then(Value::as_str),
        Some("thread-456")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("error"))
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str),
        Some("Upstream overloaded")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("willRetry"))
            .and_then(Value::as_bool),
        Some(false)
    );
}

#[test]
fn build_late_turn_error_event_reads_nested_result_error_message() {
    let response = json!({
        "id": 9,
        "result": {
            "error": {
                "message": "Late nested failure",
                "code": -32002
            }
        }
    });
    let request = TimedOutRequest {
        method: "turn/start".to_string(),
        thread_id: Some("thread-789".to_string()),
        timed_out_at_ms: 0,
    };

    let event = build_late_turn_error_event(&response, &request).expect("late turn error");
    assert_eq!(
        event.get("method").and_then(Value::as_str),
        Some("turn/error")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("threadId"))
            .and_then(Value::as_str),
        Some("thread-789")
    );
    assert_eq!(
        event
            .get("params")
            .and_then(|params| params.get("error"))
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str),
        Some("Late nested failure")
    );
}

#[tokio::test]
async fn handle_runtime_end_emits_runtime_ended_and_settles_pending_state() {
    let session = make_workspace_session("runtime-ended-eof").await;
    let runtime_manager = Arc::new(RuntimeManager::new(&std::env::temp_dir()));
    runtime_manager
        .record_starting(&session.entry, "codex", "test")
        .await;
    runtime_manager
        .acquire_turn_lease(&session.entry, "codex", "turn:thread-1")
        .await;
    session.attach_runtime_manager(Arc::clone(&runtime_manager));
    session
        .record_runtime_event_activity(&json!({
            "method": "turn/started",
            "params": {
                "threadId": "thread-stale",
                "turnId": "turn-stale"
            }
        }))
        .await;
    session
        .record_runtime_event_activity(&json!({
            "method": "turn/completed",
            "params": {
                "threadId": "thread-stale",
                "turnId": "turn-stale"
            }
        }))
        .await;
    session
        .record_runtime_event_activity(&json!({
            "method": "turn/started",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1"
            }
        }))
        .await;
    let (pending_tx, pending_rx) = oneshot::channel();
    session.pending.lock().await.insert(1, pending_tx);
    session
        .record_timed_out_request(2, "turn/start", Some("thread-2".to_string()))
        .await;
    let (callback_tx, _callback_rx) = mpsc::unbounded_channel();
    session
        .background_thread_callbacks
        .lock()
        .await
        .insert("thread-3".to_string(), callback_tx);

    let sink = TestEventSink::default();
    let message =
            "[RUNTIME_ENDED] Managed runtime stdout closed before the turn reached a terminal lifecycle event."
                .to_string();
    session
        .handle_runtime_end(&sink, "stdout_eof", message.clone(), None, None)
        .await;

    assert_eq!(
        pending_rx.await.expect("pending request should settle"),
        Err(message.clone())
    );
    assert!(session.pending.lock().await.is_empty());
    assert!(session.timed_out_requests.lock().await.is_empty());
    assert!(session.background_thread_callbacks.lock().await.is_empty());

    let events = sink.emitted_app_server_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].workspace_id, "runtime-ended-eof");
    assert_eq!(events[0].message["method"], "runtime/ended");
    assert_eq!(events[0].message["params"]["reasonCode"], "stdout_eof");
    assert_eq!(events[0].message["params"]["message"], message);
    assert_eq!(events[0].message["params"]["pendingRequestCount"], 2);
    assert_eq!(events[0].message["params"]["hadActiveLease"], true);
    assert_eq!(
        events[0].message["params"]["runtimeGeneration"],
        json!(session.runtime_generation())
    );
    assert_eq!(
        events[0].message["params"]["runtimeProcessId"],
        json!(session.process_id)
    );
    assert_eq!(
        events[0].message["params"]["runtimeStartedAtMs"],
        json!(session.started_at_ms)
    );
    assert_eq!(
        events[0].message["params"]["affectedTurnIds"],
        json!(["turn-1"])
    );
    assert_eq!(
        events[0].message["params"]["affectedActiveTurns"],
        json!([{ "threadId": "thread-1", "thread_id": "thread-1", "turnId": "turn-1", "turn_id": "turn-1" }])
    );
    let mut affected_threads = events[0].message["params"]["affectedThreadIds"]
        .as_array()
        .expect("affected thread ids array")
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();
    affected_threads.sort();
    assert_eq!(
        affected_threads,
        vec![
            "thread-1".to_string(),
            "thread-2".to_string(),
            "thread-3".to_string()
        ]
    );
    assert!(!affected_threads.contains(&"thread-stale".to_string()));

    let snapshot = runtime_manager.snapshot(&AppSettings::default()).await;
    let row = snapshot
        .rows
        .iter()
        .find(|item| item.workspace_id == "runtime-ended-eof")
        .expect("runtime row should exist");
    assert_eq!(row.last_exit_reason_code.as_deref(), Some("stdout_eof"));
    assert_eq!(row.last_exit_message.as_deref(), Some(message.as_str()));
    assert_eq!(row.last_exit_pending_request_count, 2);
    assert_eq!(row.turn_lease_count, 0);
    assert_eq!(row.stream_lease_count, 0);
    assert!(!row.active_work_protected);

    dispose_workspace_session(&session).await;
}

#[tokio::test]
async fn handle_runtime_end_suppresses_event_when_internal_cleanup_has_no_affected_work() {
    let session = make_workspace_session("runtime-ended-internal-cleanup").await;
    let runtime_manager = Arc::new(RuntimeManager::new(&std::env::temp_dir()));
    runtime_manager
        .record_starting(&session.entry, "codex", "test")
        .await;
    session.attach_runtime_manager(Arc::clone(&runtime_manager));
    session.mark_shutdown_requested(RuntimeShutdownSource::InternalReplacement);

    let sink = TestEventSink::default();
    let message =
            "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown (source: internal_replacement)."
                .to_string();
    session
        .handle_runtime_end(&sink, "manual_shutdown", message.clone(), None, None)
        .await;

    assert!(sink.emitted_app_server_events().is_empty());
    let snapshot = runtime_manager.snapshot(&AppSettings::default()).await;
    let row = snapshot
        .rows
        .iter()
        .find(|item| item.workspace_id == "runtime-ended-internal-cleanup")
        .expect("runtime diagnostics row should exist");
    assert_eq!(
        row.last_exit_reason_code.as_deref(),
        Some("manual_shutdown")
    );
    assert_eq!(row.last_exit_message.as_deref(), Some(message.as_str()));

    dispose_workspace_session(&session).await;
}

#[tokio::test]
async fn handle_runtime_end_emits_shutdown_source_when_pending_work_is_affected() {
    let session = make_workspace_session("runtime-ended-source").await;
    let runtime_manager = Arc::new(RuntimeManager::new(&std::env::temp_dir()));
    runtime_manager
        .record_starting(&session.entry, "codex", "test")
        .await;
    session.attach_runtime_manager(Arc::clone(&runtime_manager));
    session.mark_shutdown_requested(RuntimeShutdownSource::ManualRelease);
    let (pending_tx, pending_rx) = oneshot::channel();
    session.pending.lock().await.insert(1, pending_tx);

    let sink = TestEventSink::default();
    let message =
        "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown (source: manual_release)."
            .to_string();
    session
        .handle_runtime_end(&sink, "manual_shutdown", message.clone(), None, None)
        .await;

    assert_eq!(
        pending_rx.await.expect("pending request should settle"),
        Err(message.clone())
    );
    let events = sink.emitted_app_server_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].message["params"]["reasonCode"], "manual_shutdown");
    assert_eq!(
        events[0].message["params"]["shutdownSource"],
        "manual_release"
    );
    assert_eq!(events[0].message["params"]["pendingRequestCount"], 1);

    dispose_workspace_session(&session).await;
}

#[tokio::test]
async fn handle_runtime_end_emits_when_runtime_manager_active_work_is_protected() {
    let session = make_workspace_session("runtime-ended-active-protected").await;
    let runtime_manager = Arc::new(RuntimeManager::new(&std::env::temp_dir()));
    runtime_manager.record_ready(&session, "test").await;
    runtime_manager
        .acquire_turn_lease(&session.entry, "codex", "turn:protected")
        .await;
    session.attach_runtime_manager(Arc::clone(&runtime_manager));

    let sink = TestEventSink::default();
    let message =
        "[RUNTIME_ENDED] Managed runtime process exited unexpectedly with code 9.".to_string();
    session
        .handle_runtime_end(&sink, "process_exit", message, Some(9), None)
        .await;

    let events = sink.emitted_app_server_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].message["params"]["reasonCode"], "process_exit");
    assert_eq!(events[0].message["params"]["pendingRequestCount"], 0);

    dispose_workspace_session(&session).await;
}

#[tokio::test]
async fn handle_runtime_end_ignores_successor_active_work_for_stale_predecessor() {
    let original_session = make_workspace_session("runtime-ended-stale-predecessor").await;
    let successor_session = make_workspace_session("runtime-ended-stale-predecessor").await;
    let runtime_manager = Arc::new(RuntimeManager::new(&std::env::temp_dir()));
    runtime_manager
        .record_ready(&successor_session, "successor")
        .await;
    runtime_manager
        .acquire_turn_lease(&successor_session.entry, "codex", "turn:successor")
        .await;
    original_session.attach_runtime_manager(Arc::clone(&runtime_manager));
    original_session.mark_shutdown_requested(RuntimeShutdownSource::InternalReplacement);

    let sink = TestEventSink::default();
    let message =
            "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown (source: internal_replacement)."
                .to_string();
    original_session
        .handle_runtime_end(&sink, "manual_shutdown", message, None, None)
        .await;

    assert!(sink.emitted_app_server_events().is_empty());
    let snapshot = runtime_manager.snapshot(&AppSettings::default()).await;
    let row = snapshot
        .rows
        .iter()
        .find(|item| item.workspace_id == "runtime-ended-stale-predecessor")
        .expect("successor runtime row should exist");
    assert_eq!(row.pid, successor_session.process_id);
    assert!(row.active_work_protected);
    assert!(row.last_exit_reason_code.is_none());

    dispose_workspace_session(&original_session).await;
    dispose_workspace_session(&successor_session).await;
}

#[tokio::test]
async fn handle_runtime_end_emits_when_shutdown_started_with_foreground_work() {
    let session = make_workspace_session("runtime-ended-foreground-marker").await;
    session.mark_shutdown_requested(RuntimeShutdownSource::ManualRelease);
    session.mark_shutdown_had_active_work_protection();

    let sink = TestEventSink::default();
    let message =
        "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown (source: manual_release)."
            .to_string();
    session
        .handle_runtime_end(&sink, "manual_shutdown", message, None, None)
        .await;

    let events = sink.emitted_app_server_events();
    assert_eq!(events.len(), 1);
    assert_eq!(
        events[0].message["params"]["shutdownSource"],
        "manual_release"
    );

    dispose_workspace_session(&session).await;
}

#[tokio::test]
async fn handle_runtime_end_is_idempotent_and_preserves_first_exit_metadata() {
    let session = make_workspace_session("runtime-ended-exit").await;
    let sink = TestEventSink::default();
    let (pending_tx, _pending_rx) = oneshot::channel();
    session.pending.lock().await.insert(1, pending_tx);

    session
        .handle_runtime_end(
            &sink,
            "process_exit",
            "[RUNTIME_ENDED] Managed runtime process exited unexpectedly with code 9.".to_string(),
            Some(9),
            Some("15".to_string()),
        )
        .await;
    session
            .handle_runtime_end(
                &sink,
                "stdout_eof",
                "[RUNTIME_ENDED] Managed runtime stdout closed before the turn reached a terminal lifecycle event."
                    .to_string(),
                None,
                None,
            )
            .await;

    let events = sink.emitted_app_server_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].message["params"]["reasonCode"], "process_exit");
    assert_eq!(events[0].message["params"]["exitCode"], 9);
    assert_eq!(events[0].message["params"]["exitSignal"], "15");

    dispose_workspace_session(&session).await;
}

#[test]
fn wrapper_kind_for_binary_labels_windows_wrappers() {
    assert_eq!(wrapper_kind_for_binary("codex"), "direct");
    assert_eq!(wrapper_kind_for_binary("C:/bin/codex.cmd"), "cmd-wrapper");
    assert_eq!(wrapper_kind_for_binary("C:/bin/codex.bat"), "bat-wrapper");
}

#[test]
fn should_block_request_user_input_only_for_code_mode_when_enabled() {
    assert!(should_block_request_user_input(
        "item/tool/requestUserInput",
        Some("code"),
        true,
        true,
    ));
    assert!(!should_block_request_user_input(
        "item/tool/requestUserInput",
        Some("plan"),
        true,
        true,
    ));
    assert!(!should_block_request_user_input(
        "item/tool/requestUserInput",
        Some("code"),
        false,
        true,
    ));
    assert!(!should_block_request_user_input(
        "item/updated",
        Some("code"),
        true,
        true,
    ));
    assert!(!should_block_request_user_input(
        "item/tool/requestUserInput",
        Some("code"),
        true,
        false,
    ));
}

#[test]
fn build_mode_blocked_event_has_required_params() {
    let event = build_mode_blocked_event(
        "thread-1",
        "item/tool/requestUserInput",
        "code",
        MODE_BLOCKED_REASON_CODE_REQUEST_USER_INPUT,
        MODE_BLOCKED_REASON,
        MODE_BLOCKED_SUGGESTION,
        Some(json!(91)),
    );
    assert_eq!(event["method"], "collaboration/modeBlocked");
    assert_eq!(event["params"]["threadId"], "thread-1");
    assert_eq!(event["params"]["thread_id"], "thread-1");
    assert_eq!(
        event["params"]["blockedMethod"],
        "item/tool/requestUserInput"
    );
    assert_eq!(
        event["params"]["blocked_method"],
        "item/tool/requestUserInput"
    );
    assert_eq!(event["params"]["effectiveMode"], "code");
    assert_eq!(event["params"]["effective_mode"], "code");
    assert_eq!(
        event["params"]["reasonCode"],
        "request_user_input_blocked_in_default_mode"
    );
    assert_eq!(
        event["params"]["reason_code"],
        "request_user_input_blocked_in_default_mode"
    );
    assert_eq!(
        event["params"]["reason"],
        "requestUserInput is blocked while effective_mode=code"
    );
    assert_eq!(event["params"]["requestId"], 91);
    assert_eq!(event["params"]["request_id"], 91);
}

#[test]
fn normalize_command_tokens_from_item_supports_string_and_array() {
    let string_item = json!({
        "command": "git push origin main"
    });
    assert_eq!(
        normalize_command_tokens_from_item(&string_item),
        vec!["git", "push", "origin", "main"]
    );
    let array_item = json!({
        "command": ["git", "commit", "-m", "msg"]
    });
    assert_eq!(
        normalize_command_tokens_from_item(&array_item),
        vec!["git", "commit", "-m", "msg"]
    );
}

#[test]
fn is_repo_mutating_command_tokens_detects_git_write_actions() {
    assert!(is_repo_mutating_command_tokens(
        &["git", "push", "origin", "main"]
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
    ));
    assert!(is_repo_mutating_command_tokens(
        &["git", "commit", "-m", "msg"]
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
    ));
    assert!(!is_repo_mutating_command_tokens(
        &["git", "status"]
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
    ));
    assert!(!is_repo_mutating_command_tokens(
        &["rg", "--files"]
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
    ));
}

#[test]
fn detect_repo_mutating_blocked_method_detects_apply_patch_and_git_push() {
    let patch_event = json!({
        "method": "item/started",
        "params": {
            "threadId": "thread-1",
            "item": {
                "id": "tool-1",
                "type": "apply_patch"
            }
        }
    });
    assert_eq!(
        detect_repo_mutating_blocked_method(&patch_event),
        Some("item/tool/apply_patch".to_string())
    );

    let git_push_event = json!({
        "method": "item/started",
        "params": {
            "threadId": "thread-1",
            "item": {
                "id": "tool-2",
                "type": "commandExecution",
                "command": ["git", "push", "origin", "main"]
            }
        }
    });
    assert_eq!(
        detect_repo_mutating_blocked_method(&git_push_event),
        Some("item/tool/commandExecution:git push origin main".to_string())
    );

    let read_only_event = json!({
        "method": "item/started",
        "params": {
            "threadId": "thread-1",
            "item": {
                "id": "tool-3",
                "type": "commandExecution",
                "command": ["git", "status"]
            }
        }
    });
    assert_eq!(detect_repo_mutating_blocked_method(&read_only_event), None);
}

#[test]
fn detect_repo_mutating_blocked_method_detects_item_request_approval_events() {
    let file_change_approval_event = json!({
        "method": "item/fileChange/requestApproval",
        "id": "req-1",
        "params": {
            "threadId": "thread-1"
        }
    });
    assert_eq!(
        detect_repo_mutating_blocked_method(&file_change_approval_event),
        Some("item/fileChange/requestApproval".to_string())
    );

    let command_approval_event = json!({
        "method": "item/commandExecution/requestApproval",
        "id": "req-2",
        "params": {
            "threadId": "thread-1"
        }
    });
    assert_eq!(
        detect_repo_mutating_blocked_method(&command_approval_event),
        Some("item/commandExecution/requestApproval".to_string())
    );
}

#[test]
fn build_mode_blocked_event_for_plan_contains_standard_reason_code_and_suggestion() {
    let event = build_mode_blocked_event(
        "thread-plan-1",
        "item/tool/commandExecution:git push origin main",
        "plan",
        MODE_BLOCKED_REASON_CODE_PLAN_READONLY,
        MODE_BLOCKED_PLAN_REASON,
        MODE_BLOCKED_PLAN_SUGGESTION,
        None,
    );
    assert_eq!(event["method"], "collaboration/modeBlocked");
    assert_eq!(event["params"]["effectiveMode"], "plan");
    assert_eq!(event["params"]["reasonCode"], "plan_readonly_violation");
    assert_eq!(
        event["params"]["suggestion"],
        "Switch to Default mode and retry the write operation."
    );
}

#[test]
fn detect_plan_blocker_reason_matches_not_git_repo_marker() {
    let event = json!({
        "method": "item/completed",
        "params": {
            "threadId": "thread-1",
            "item": {
                "status": "completed",
                "result": "NOT_GIT_REPO"
            }
        }
    });
    assert_eq!(
        detect_plan_blocker_reason(&event),
        Some("当前目录不是 Git 仓库，无法基于真实代码上下文继续计划。")
    );
}

#[test]
fn detect_plan_blocker_reason_matches_missing_context_marker() {
    let event = json!({
        "method": "item/completed",
        "params": {
            "threadId": "thread-1",
            "item": {
                "status": "completed",
                "error": "No such file or directory: /tmp/not-found"
            }
        }
    });
    assert_eq!(
        detect_plan_blocker_reason(&event),
        Some("Plan 模式下发现关键路径或上下文缺失，继续推进前需要你确认范围与目标位置。")
    );
}

#[test]
fn detect_plan_blocker_reason_matches_semantic_assistant_blocker_text() {
    let event = json!({
        "method": "item/completed",
        "params": {
            "threadId": "thread-1",
            "item": {
                "type": "agentMessage",
                "status": "completed",
                "text": "出现一个阻塞：当前仓库只有 docs/，没有 src/。我先发一个选项问题，等你选择后再继续。"
            }
        }
    });
    assert_eq!(
        detect_plan_blocker_reason(&event),
        Some("Plan 模式检测到阻断条件，需要你先确认下一步后再继续。")
    );
}

#[test]
fn detect_plan_blocker_reason_matches_agent_delta_blocker_text() {
    let event = json!({
        "method": "item/agentMessage/delta",
        "params": {
            "threadId": "thread-1",
            "delta": "出现一个阻塞：没有 src。需要你确认，我先发一个选项问题。"
        }
    });
    assert_eq!(detect_plan_blocker_reason(&event), None);
}

#[test]
fn detect_plan_blocker_reason_matches_turn_completed_result_text() {
    let event = json!({
        "method": "turn/completed",
        "params": {
            "threadId": "thread-1",
            "result": {
                "summary": "当前仓库只有 docs/plans，还没看到前端源码，无法把计划精确落地。下一步先发一个选项问题。"
            }
        }
    });
    assert_eq!(
        detect_plan_blocker_reason(&event),
        Some("Plan 模式检测到阻断条件，需要你先确认下一步后再继续。")
    );
}

#[test]
fn detect_plan_blocker_reason_matches_turn_completed_turn_payload_text() {
    let event = json!({
        "method": "turn/completed",
        "params": {
            "threadId": "thread-1",
            "turn": {
                "id": "turn-1",
                "status": "completed",
                "items": [{
                    "type": "agentMessage",
                    "text": "当前仓库只有 design.md，没有可执行前端代码文件，计划无法基于真实文件落地。先给你选项确认下一步。"
                }]
            }
        }
    });
    assert_eq!(
        detect_plan_blocker_reason(&event),
        Some("Plan 模式检测到阻断条件，需要你先确认下一步后再继续。")
    );
}

#[test]
fn detect_plan_blocker_reason_matches_turn_completed_followup_question_text() {
    let event = json!({
        "method": "turn/completed",
        "params": {
            "threadId": "thread-1",
            "result": {
                "summary": "我还不知道你的出生日期，所以现在算不出来。请把你的出生年月日发我，我可以继续。"
            }
        }
    });
    assert_eq!(
        detect_plan_blocker_reason(&event),
        Some("Plan 模式检测到需要你补充关键信息，继续前请先确认输入。")
    );
}

#[test]
fn looks_like_plan_blocker_prompt_matches_docs_without_src_style() {
    let text = "我已确认仓库当前只有 docs/plans 下的一份规划文档，还没看到前端源码；下一步先按你的规范检查 .claude/.codex/openspec。";
    assert!(looks_like_plan_blocker_prompt(text));
}

#[test]
fn looks_like_plan_blocker_prompt_matches_key_blocker_phrase_from_ui() {
    let text = "我定位到一个关键阻塞：仓库里目前只有 docs/plans/2026-03-02-csv-export.md，没有前端源码目录（如 src/），因此无法给出基于真实文件的落地计划。先发一个选项让你决定下一步。";
    assert!(looks_like_plan_blocker_prompt(text));
}

#[test]
fn looks_like_plan_blocker_prompt_matches_git_metadata_without_frontend_text() {
    let text = "我刚定位到一个阻塞点：当前工作区几乎只有 .git 元数据，没有看到任何前端实现目录。";
    assert!(looks_like_plan_blocker_prompt(text));
}

#[test]
fn looks_like_plan_blocker_prompt_matches_missing_frontend_without_blocker_word() {
    let text = "当前仓库只有 design.md，没有可执行前端代码文件，计划无法基于真实代码落地。";
    assert!(looks_like_plan_blocker_prompt(text));
}

#[test]
fn looks_like_executable_plan_text_matches_structured_plan_content() {
    let text = "实施计划：\n1. 定位导出入口\n2. 补充 CSV 下载逻辑\n3. 增加回归测试\n测试点：验证导出文件头与空态处理";
    assert!(looks_like_executable_plan_text(text));
}

#[test]
fn looks_like_executable_plan_text_rejects_blocker_only_text() {
    let text = "当前仓库只有 design.md，没有可执行前端代码文件。";
    assert!(!looks_like_executable_plan_text(text));
}

#[test]
fn extract_plan_step_count_reads_plan_updated_payload() {
    let event = json!({
        "method": "turn/plan/updated",
        "params": {
            "threadId": "thread-1",
            "plan": [
                { "step": "Inspect", "status": "in_progress" },
                { "step": "Implement", "status": "pending" }
            ]
        }
    });
    assert_eq!(extract_plan_step_count(&event), 2);
}

#[test]
fn is_plan_blocker_stream_method_matches_reasoning_variants() {
    assert!(is_plan_blocker_stream_method("item/agentMessage/delta"));
    assert!(is_plan_blocker_stream_method("item/reasoning/textDelta"));
    assert!(is_plan_blocker_stream_method("item/reasoning/delta"));
    assert!(is_plan_blocker_stream_method(
        "item/reasoning/summaryTextDelta"
    ));
    assert!(!is_plan_blocker_stream_method(
        "item/reasoning/summaryPartAdded"
    ));
}

#[test]
fn extract_stream_delta_text_reads_reasoning_delta_payload() {
    let event = json!({
        "method": "item/reasoning/textDelta",
        "params": {
            "threadId": "thread-1",
            "itemId": "item-1",
            "delta": "我刚定位到一个阻塞点：当前工作区几乎只有 .git 元数据。"
        }
    });
    assert_eq!(
        extract_stream_delta_text(&event),
        Some("我刚定位到一个阻塞点：当前工作区几乎只有 .git 元数据。".to_string())
    );
}

#[test]
fn looks_like_user_info_followup_prompt_matches_age_question() {
    let text = "我还不知道你的出生日期。请把你的出生年月日发我，我就能继续。";
    assert!(looks_like_user_info_followup_prompt(text));
}

#[test]
fn build_plan_blocker_user_input_event_has_questions() {
    let event = build_plan_blocker_user_input_event(
        "thread-1",
        Some("turn-1"),
        "ccgui-plan-blocker:1",
        "当前目录不是 Git 仓库，无法基于真实代码上下文继续计划。",
    );
    assert_eq!(event["method"], "item/tool/requestUserInput");
    assert_eq!(event["id"], "ccgui-plan-blocker:1");
    assert_eq!(event["params"]["threadId"], "thread-1");
    assert_eq!(event["params"]["turnId"], "turn-1");
    assert_eq!(
        event["params"]["questions"][0]["id"],
        "plan_blocker_resolution"
    );
}

#[test]
fn build_plan_blocker_user_input_event_uses_generic_options_for_non_repo_reason() {
    let event = build_plan_blocker_user_input_event(
        "thread-1",
        Some("turn-1"),
        "ccgui-plan-blocker:2",
        "Plan 模式检测到需要你补充关键信息，继续前请先确认输入。",
    );
    assert_eq!(
        event["params"]["questions"][0]["options"][0]["label"],
        "直接补充关键信息 (Recommended)"
    );
}

#[test]
fn plan_turn_state_default_has_no_synthetic_block() {
    let state = PlanTurnState::default();
    assert!(!state.synthetic_block_active);
    assert!(!state.has_user_input_request);
    assert!(state.active_turn_id.is_none());
}

#[test]
fn visible_console_fallback_env_parser_accepts_supported_values() {
    assert!(visible_console_fallback_enabled_from_env(Some("1")));
    assert!(visible_console_fallback_enabled_from_env(Some("true")));
}

#[test]
fn visible_console_fallback_env_parser_rejects_other_values() {
    assert!(!visible_console_fallback_enabled_from_env(None));
    assert!(!visible_console_fallback_enabled_from_env(Some("0")));
    assert!(!visible_console_fallback_enabled_from_env(Some("false")));
    assert!(!visible_console_fallback_enabled_from_env(Some("TRUE")));
    assert!(!visible_console_fallback_enabled_from_env(Some(" true ")));
}
