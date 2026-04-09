//! Claude Code engine implementation
//!
//! Handles Claude Code CLI execution via `claude -p` (print mode) with
//! streaming JSON output.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
#[cfg(unix)]
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{broadcast, Mutex, Notify, RwLock};
#[cfg(unix)]
use tokio::time::sleep;

use super::claude_message_content::{build_message_content, format_ask_user_answer};
use super::events::EngineEvent;
use super::{EngineConfig, EngineType, SendMessageParams};
mod lifecycle;
#[path = "claude_stream_helpers.rs"]
mod stream_helpers;
mod user_input;
#[cfg(test)]
use stream_helpers::extract_text_from_content;
use stream_helpers::{
    concat_reasoning_blocks, concat_text_blocks, extract_claude_tool_input,
    extract_claude_tool_name, extract_delta_text_from_event, extract_reasoning_fragment,
    extract_result_text, extract_string_field, extract_tool_result_output,
    extract_tool_result_text, is_claude_stream_control_line, looks_like_claude_runtime_error,
    parse_claude_stream_json_line, tool_input_signature,
};

#[derive(Debug, Clone)]
pub struct ClaudeTurnEvent {
    pub turn_id: String,
    pub event: EngineEvent,
}

#[derive(Debug, Clone)]
struct PendingClaudeTool {
    turn_id: String,
    tool_id: String,
    tool_name: String,
    input_signature: Option<String>,
}

const RETRYABLE_PROMPT_TOO_LONG_PREFIX: &str = "__claude_retryable_prompt_too_long__:";
const AUTO_COMPACT_SIGNAL_SOURCE: &str = "auto_compact_retry";

/// Claude Code session for a workspace
pub struct ClaudeSession {
    /// Workspace identifier
    pub workspace_id: String,
    /// Workspace directory path
    pub workspace_path: PathBuf,
    /// Current Claude session ID (for --resume)
    session_id: RwLock<Option<String>>,
    /// Event broadcaster
    event_sender: broadcast::Sender<ClaudeTurnEvent>,
    /// Custom binary path
    bin_path: Option<String>,
    /// Custom home directory
    home_dir: Option<String>,
    /// Additional CLI arguments
    custom_args: Option<String>,
    /// Active child processes by turn ID (supports concurrent turns)
    active_processes: Mutex<HashMap<String, Child>>,
    /// Flag set by interrupt() so send_message() knows the process was killed intentionally
    interrupted: AtomicBool,
    /// Track tool names for completion events
    tool_name_by_id: StdMutex<HashMap<String, String>>,
    /// Track tool input buffers for streaming input_json_delta
    tool_input_by_id: StdMutex<HashMap<String, String>>,
    /// Cache the latest structured tool input so completion events can reuse it
    tool_input_value_by_id: StdMutex<HashMap<String, Value>>,
    /// Map turn-scoped content block index to tool id
    tool_id_by_block_index: StdMutex<HashMap<(String, i64), String>>,
    /// Track unresolved tools so transcript-style tool_result payloads can be paired back
    pending_tools: StdMutex<Vec<PendingClaudeTool>>,
    /// Last emitted text for assistant partial messages, isolated per turn
    last_emitted_text_by_turn: StdMutex<HashMap<String, String>>,
    /// Stdin handles per turn for AskUserQuestion responses
    stdin_by_turn: Mutex<HashMap<String, ChildStdin>>,
    /// Pending AskUserQuestion requests: request_id -> turn_id
    pending_user_inputs: StdMutex<HashMap<String, String>>,
    /// Per-turn signal to resume stdout processing after AskUserQuestion response
    user_input_notify_by_turn: StdMutex<HashMap<String, Arc<Notify>>>,
    /// Per-turn formatted AskUserQuestion answer for kill+resume mechanism
    user_input_answer_by_turn: StdMutex<HashMap<String, String>>,
}

impl ClaudeSession {
    fn configure_spawn_command(cmd: &mut Command) {
        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                if libc::setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
    }

    fn should_use_stream_json_input(params: &SendMessageParams) -> bool {
        let has_images = params
            .images
            .as_ref()
            .map_or(false, |imgs| imgs.iter().any(|s| !s.trim().is_empty()));
        if has_images {
            return true;
        }
        params.text.contains('\n') || params.text.contains('\r')
    }

    /// Create a new Claude session for a workspace
    pub fn new(
        workspace_id: String,
        workspace_path: PathBuf,
        config: Option<EngineConfig>,
    ) -> Self {
        let (event_sender, _) = broadcast::channel(1024);
        let config = config.unwrap_or_default();

        Self {
            workspace_id,
            workspace_path,
            session_id: RwLock::new(None),
            event_sender,
            bin_path: config.bin_path,
            home_dir: config.home_dir,
            custom_args: config.custom_args,
            active_processes: Mutex::new(HashMap::new()),
            interrupted: AtomicBool::new(false),
            tool_name_by_id: StdMutex::new(HashMap::new()),
            tool_input_by_id: StdMutex::new(HashMap::new()),
            tool_input_value_by_id: StdMutex::new(HashMap::new()),
            tool_id_by_block_index: StdMutex::new(HashMap::new()),
            pending_tools: StdMutex::new(Vec::new()),
            last_emitted_text_by_turn: StdMutex::new(HashMap::new()),
            stdin_by_turn: Mutex::new(HashMap::new()),
            pending_user_inputs: StdMutex::new(HashMap::new()),
            user_input_notify_by_turn: StdMutex::new(HashMap::new()),
            user_input_answer_by_turn: StdMutex::new(HashMap::new()),
        }
    }

    /// Get a receiver for engine events
    pub fn subscribe(&self) -> broadcast::Receiver<ClaudeTurnEvent> {
        self.event_sender.subscribe()
    }

    /// Get current session ID
    pub async fn get_session_id(&self) -> Option<String> {
        self.session_id.read().await.clone()
    }

    /// Emit a TurnError event to notify the frontend when an error occurs
    /// outside the normal send_message flow (e.g., spawn failure, early errors).
    fn emit_turn_event(&self, turn_id: &str, event: EngineEvent) {
        let _ = self.event_sender.send(ClaudeTurnEvent {
            turn_id: turn_id.to_string(),
            event,
        });
    }

    pub fn emit_error(&self, turn_id: &str, error: String) {
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnError {
                workspace_id: self.workspace_id.clone(),
                error,
                code: None,
            },
        );
    }

    async fn fail_send_setup_and_terminate_child(
        &self,
        turn_id: &str,
        child: &mut Child,
        error_msg: String,
    ) -> Result<String, String> {
        if let Err(error) = self.terminate_child_process(turn_id, child).await {
            log::debug!(
                "[claude] failed to terminate setup-failed child process (turn={}): {}",
                turn_id,
                error
            );
        }
        self.clear_turn_ephemeral_state(turn_id);
        Err(error_msg)
    }

    /// Set session ID (after successful execution)
    pub async fn set_session_id(&self, id: Option<String>) {
        *self.session_id.write().await = id;
    }

    /// Build the Claude CLI command
    fn build_command(&self, params: &SendMessageParams, use_stream_json_input: bool) -> Command {
        // Resolve the Claude CLI binary path:
        // 1. Use custom bin_path if configured
        // 2. Otherwise use find_cli_binary() to search npm global, cargo, etc.
        // 3. Fall back to bare "claude" as last resort
        let bin = if let Some(ref custom) = self.bin_path {
            custom.clone()
        } else {
            crate::backend::app_server::find_cli_binary("claude", None)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "claude".to_string())
        };

        // Use build_command_for_binary to properly handle .cmd/.bat files on Windows
        let mut cmd = crate::backend::app_server::build_command_for_binary(&bin);

        // Set working directory
        cmd.current_dir(&self.workspace_path);

        // Print mode (non-interactive)
        cmd.arg("-p");

        if use_stream_json_input {
            // Use stream-json input format for image payloads and multiline text.
            // The actual content will be sent via stdin.
            cmd.arg(""); // Empty string as placeholder, real content via stdin
            cmd.arg("--input-format");
            cmd.arg("stream-json");
        } else {
            // Text-only mode
            cmd.arg(&params.text);
        }

        // Output format for streaming
        cmd.arg("--output-format");
        cmd.arg("stream-json");

        // Verbose for more events
        cmd.arg("--verbose");

        // Include partial messages for streaming text
        cmd.arg("--include-partial-messages");

        // Access mode / permission handling
        // Maps UI access modes to Claude Code CLI permission flags
        match params.access_mode.as_deref() {
            Some("full-access") => {
                // Full access: bypass all permission checks
                cmd.arg("--dangerously-skip-permissions");
            }
            Some("read-only") => {
                // Read-only / Plan mode: only allow planning, no execution
                cmd.arg("--permission-mode");
                cmd.arg("plan");
            }
            Some("default") => {
                // Default mode: each tool use requires explicit permission
                cmd.arg("--permission-mode");
                cmd.arg("default");
            }
            _ => {
                // "current" mode: auto-accept edits but still prompt for dangerous ops
                cmd.arg("--permission-mode");
                cmd.arg("acceptEdits");
            }
        }

        // Model selection
        if let Some(ref model) = params.model {
            cmd.arg("--model");
            cmd.arg(model);
        }

        // Session continuation / explicit session identity
        if params.continue_session {
            if let Some(ref session_id) = params.session_id {
                cmd.arg("--resume");
                cmd.arg(session_id);
            } else {
                cmd.arg("--continue");
            }
        } else if let Some(ref session_id) = params.session_id {
            // Force a fresh, stable identity for "new conversation" runs.
            // This prevents concurrent Claude turns from collapsing into the
            // same persisted session due CLI implicit reuse behavior.
            cmd.arg("--session-id");
            cmd.arg(session_id);
        }

        if let Some(spec_root) = params
            .custom_spec_root
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            let spec_path = Path::new(spec_root);
            if spec_path.is_absolute() && spec_path != self.workspace_path.as_path() {
                cmd.arg("--add-dir");
                cmd.arg(spec_root);
            }
        }

        // Custom arguments
        if let Some(ref args) = self.custom_args {
            for arg in args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // Set up stdio - always pipe stdin so we can write responses
        // for AskUserQuestion tool calls mid-stream
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Environment
        if let Some(ref home) = self.home_dir {
            cmd.env("CLAUDE_HOME", home);
        }

        cmd
    }

    /// Send a message and stream the response
    pub async fn send_message(
        &self,
        params: SendMessageParams,
        turn_id: &str,
    ) -> Result<String, String> {
        // Reset cumulative text tracker for the new turn only.
        if let Ok(mut map) = self.last_emitted_text_by_turn.lock() {
            map.remove(turn_id);
        }

        let use_stream_json_input = Self::should_use_stream_json_input(&params);

        let mut cmd = self.build_command(&params, use_stream_json_input);
        Self::configure_spawn_command(&mut cmd);

        // Spawn the process
        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                let error_msg = format!("Failed to spawn claude: {}", e);
                self.emit_turn_event(
                    turn_id,
                    EngineEvent::TurnError {
                        workspace_id: self.workspace_id.clone(),
                        error: error_msg.clone(),
                        code: None,
                    },
                );
                self.clear_turn_ephemeral_state(turn_id);
                return Err(error_msg);
            }
        };

        // If stream-json input is enabled, write the message content to stdin.
        // This path is required for image payloads and multiline text prompts.
        if use_stream_json_input {
            if let Some(mut stdin) = child.stdin.take() {
                let message = match build_message_content(&params) {
                    Ok(value) => value,
                    Err(error) => {
                        drop(stdin);
                        return self
                            .fail_send_setup_and_terminate_child(
                                turn_id,
                                &mut child,
                                format!("Failed to build message: {}", error),
                            )
                            .await;
                    }
                };
                let message_str = match serde_json::to_string(&message) {
                    Ok(value) => value,
                    Err(error) => {
                        drop(stdin);
                        return self
                            .fail_send_setup_and_terminate_child(
                                turn_id,
                                &mut child,
                                format!("Failed to serialize message: {}", error),
                            )
                            .await;
                    }
                };

                if let Err(error) = stdin.write_all(message_str.as_bytes()).await {
                    drop(stdin);
                    return self
                        .fail_send_setup_and_terminate_child(
                            turn_id,
                            &mut child,
                            format!("Failed to write to stdin: {}", error),
                        )
                        .await;
                }
                if let Err(error) = stdin.write_all(b"\n").await {
                    drop(stdin);
                    return self
                        .fail_send_setup_and_terminate_child(
                            turn_id,
                            &mut child,
                            format!("Failed to write newline: {}", error),
                        )
                        .await;
                }
                // Drop stdin to signal EOF
                drop(stdin);
            } else {
                return self
                    .fail_send_setup_and_terminate_child(
                        turn_id,
                        &mut child,
                        "Failed to capture stdin for stream-json mode".to_string(),
                    )
                    .await;
            }
        } else {
            // For non-image messages, drop stdin immediately so the CLI
            // doesn't hang waiting for EOF.
            drop(child.stdin.take());
        }

        let stdout = match child.stdout.take() {
            Some(value) => value,
            None => {
                return self
                    .fail_send_setup_and_terminate_child(
                        turn_id,
                        &mut child,
                        "Failed to capture stdout".to_string(),
                    )
                    .await;
            }
        };

        let stderr = match child.stderr.take() {
            Some(value) => value,
            None => {
                return self
                    .fail_send_setup_and_terminate_child(
                        turn_id,
                        &mut child,
                        "Failed to capture stderr".to_string(),
                    )
                    .await;
            }
        };

        // Store child for interruption (per turn)
        {
            let mut active = self.active_processes.lock().await;
            active.insert(turn_id.to_string(), child);
        }

        // Emit session started event
        self.emit_turn_event(
            turn_id,
            EngineEvent::SessionStarted {
                workspace_id: self.workspace_id.clone(),
                session_id: "pending".to_string(),
                engine: EngineType::Claude,
            },
        );

        // Emit turn started event
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnStarted {
                workspace_id: self.workspace_id.clone(),
                turn_id: turn_id.to_string(),
            },
        );

        // Read stdout line by line
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut response_text = String::new();
        let mut saw_text_delta = false;
        let mut new_session_id: Option<String> = None;
        let mut error_output = String::new();
        let mut stream_runtime_error: Option<String> = None;
        let mut stream_error_event_emitted = false;

        // Spawn stderr reader
        let stderr_reader = BufReader::new(stderr);
        let _workspace_id_clone = self.workspace_id.clone();
        let stderr_handle = tokio::spawn(async move {
            let mut lines = stderr_reader.lines();
            let mut stderr_text = String::new();
            while let Ok(Some(line)) = lines.next_line().await {
                stderr_text.push_str(&line);
                stderr_text.push('\n');
            }
            stderr_text
        });

        // Process stdout events
        let mut session_id_emitted = false;
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            match parse_claude_stream_json_line(&line) {
                Ok(event) => {
                    // If Claude only emits a final result without streaming deltas,
                    // synthesize a text delta so the frontend still renders a reply.
                    if !saw_text_delta {
                        if let Some(event_type) = event.get("type").and_then(|v| v.as_str()) {
                            if event_type == "result" {
                                if let Some(text) = extract_result_text(&event) {
                                    if !text.trim().is_empty() {
                                        saw_text_delta = true;
                                        response_text.push_str(&text);
                                        self.emit_turn_event(
                                            turn_id,
                                            EngineEvent::TextDelta {
                                                workspace_id: self.workspace_id.clone(),
                                                text,
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }

                    // Extract session ID if present and emit event with real session_id
                    // Check both snake_case (session_id) and camelCase (sessionId) field names
                    let sid = event
                        .get("session_id")
                        .or_else(|| event.get("sessionId"))
                        .and_then(|v| v.as_str());
                    if let Some(sid) = sid {
                        if !sid.is_empty() && sid != "pending" && !session_id_emitted {
                            new_session_id = Some(sid.to_string());
                            session_id_emitted = true;
                            // Emit SessionStarted with real session_id so frontend can update thread ID
                            self.emit_turn_event(
                                turn_id,
                                EngineEvent::SessionStarted {
                                    workspace_id: self.workspace_id.clone(),
                                    session_id: sid.to_string(),
                                    engine: EngineType::Claude,
                                },
                            );
                        }
                    }

                    // Convert and emit event
                    if let Some(unified_event) = self.convert_event(turn_id, &event) {
                        if let EngineEvent::TurnError { ref error, .. } = unified_event {
                            if stream_runtime_error.is_none() {
                                stream_runtime_error = Some(error.clone());
                            }
                            if Self::is_prompt_too_long_error(error) {
                                continue;
                            }
                            stream_error_event_emitted = true;
                        }

                        // Collect text for final response
                        if let EngineEvent::TextDelta { ref text, .. } = unified_event {
                            response_text.push_str(text);
                            saw_text_delta = true;
                        }

                        let is_user_input_request =
                            matches!(&unified_event, EngineEvent::RequestUserInput { .. });

                        self.emit_turn_event(turn_id, unified_event);

                        // When AskUserQuestion is detected, delegate to the
                        // dedicated handler which waits for user input, kills the
                        // current CLI, and restarts with --resume.
                        if is_user_input_request {
                            match self
                                .handle_ask_user_question_resume(turn_id, &params, &new_session_id)
                                .await
                            {
                                Ok(Some(new_lines)) => {
                                    lines = new_lines;
                                    continue;
                                }
                                Ok(None) => {}
                                Err(error) => {
                                    self.emit_turn_event(
                                        turn_id,
                                        EngineEvent::TurnError {
                                            workspace_id: self.workspace_id.clone(),
                                            error: error.clone(),
                                            code: None,
                                        },
                                    );
                                    self.clear_turn_ephemeral_state(turn_id);
                                    return Err(error);
                                }
                            }
                        }
                    }
                }
                Err(_e) => {
                    let trimmed = line.trim();
                    if is_claude_stream_control_line(trimmed) {
                        continue;
                    }
                    // Non-JSON output, might be error
                    error_output.push_str(&line);
                    error_output.push('\n');
                    if stream_runtime_error.is_none() {
                        if looks_like_claude_runtime_error(trimmed) {
                            stream_runtime_error = Some(trimmed.to_string());
                        }
                    }
                }
            }
        }

        // Wait for process to complete
        let mut child = {
            let mut active = self.active_processes.lock().await;
            active.remove(turn_id)
        };
        let status = if let Some(mut child_proc) = child.take() {
            child_proc.wait().await.ok()
        } else {
            None
        };

        // Get stderr
        let stderr_text = stderr_handle.await.unwrap_or_default();
        if !stderr_text.trim().is_empty() {
            error_output.push_str(&stderr_text);
        }

        // Update session ID
        if let Some(sid) = new_session_id {
            self.set_session_id(Some(sid)).await;
        }

        // Check for errors - emit TurnError whenever the process exits with
        // a non-zero status, regardless of whether partial output was received.
        // Previously this only triggered when response_text was empty, which
        // caused silent failures when the CLI produced partial output before crashing.
        if let Some(status) = status {
            if !status.success() {
                let error_msg = if !error_output.is_empty() {
                    error_output.trim().to_string()
                } else {
                    format!("Claude exited with status: {}", status)
                };

                log::error!("Claude process failed: {}", error_msg);

                if Self::is_prompt_too_long_error(&error_msg) {
                    self.clear_turn_ephemeral_state(turn_id);
                    return Err(Self::mark_retryable_prompt_too_long_error(&error_msg));
                }

                self.emit_turn_event(
                    turn_id,
                    EngineEvent::TurnError {
                        workspace_id: self.workspace_id.clone(),
                        error: error_msg.clone(),
                        code: None,
                    },
                );

                self.clear_turn_ephemeral_state(turn_id);
                return Err(error_msg);
            }
        } else {
            // Process handle was taken by interrupt() or missing.
            // Check the interrupted flag to distinguish user-initiated interrupts
            // from unexpected process disappearance.
            let was_interrupted = self.interrupted.swap(false, Ordering::SeqCst);
            if was_interrupted {
                log::info!("Turn {} was interrupted by user", turn_id);
                self.emit_turn_event(
                    turn_id,
                    EngineEvent::TurnError {
                        workspace_id: self.workspace_id.clone(),
                        error: "Session stopped.".to_string(),
                        code: None,
                    },
                );
                self.clear_turn_ephemeral_state(turn_id);
                return Err("Session stopped.".to_string());
            }
            // Not a user interrupt — treat as unexpected termination
            if response_text.is_empty() {
                let error_msg = "Claude process terminated unexpectedly".to_string();
                log::error!("{}", error_msg);
                self.emit_turn_event(
                    turn_id,
                    EngineEvent::TurnError {
                        workspace_id: self.workspace_id.clone(),
                        error: error_msg.clone(),
                        code: None,
                    },
                );
                self.clear_turn_ephemeral_state(turn_id);
                return Err(error_msg);
            }
        }

        // Claude may emit an in-stream error while still exiting with code 0.
        // In that case we must not mark the turn as completed successfully.
        if let Some(stream_error) = stream_runtime_error {
            let error_msg = if !error_output.trim().is_empty() {
                let stderr_text = error_output.trim();
                format!("{}\n{}", stream_error, stderr_text)
            } else {
                stream_error
            };
            log::error!("Claude stream reported runtime error: {}", error_msg);
            if Self::is_prompt_too_long_error(&error_msg) {
                self.clear_turn_ephemeral_state(turn_id);
                return Err(Self::mark_retryable_prompt_too_long_error(&error_msg));
            }
            if !stream_error_event_emitted {
                self.emit_turn_event(
                    turn_id,
                    EngineEvent::TurnError {
                        workspace_id: self.workspace_id.clone(),
                        error: error_msg.clone(),
                        code: None,
                    },
                );
            }
            self.clear_turn_ephemeral_state(turn_id);
            return Err(error_msg);
        }

        // Emit turn completed
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnCompleted {
                workspace_id: self.workspace_id.clone(),
                result: Some(serde_json::json!({
                    "text": response_text,
                })),
            },
        );

        self.clear_turn_ephemeral_state(turn_id);
        Ok(response_text)
    }

    async fn terminate_child_process(
        &self,
        _turn_id: &str,
        child: &mut Child,
    ) -> Result<(), String> {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(pid) = child.id() {
                match crate::utils::async_command("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .status()
                    .await
                {
                    Ok(status) if status.success() => {
                        let _ = child.wait().await;
                        return Ok(());
                    }
                    Ok(status) => {
                        if matches!(child.try_wait(), Ok(Some(_))) {
                            return Ok(());
                        }
                        log::warn!(
                            "[claude] taskkill failed for turn={} pid={} status={}",
                            _turn_id,
                            pid,
                            status
                        );
                    }
                    Err(error) => {
                        log::warn!(
                            "[claude] taskkill errored for turn={} pid={}: {}",
                            _turn_id,
                            pid,
                            error
                        );
                    }
                }
            }
        }

        #[cfg(unix)]
        {
            if let Some(pid) = child.id() {
                let process_group_id = pid as libc::pid_t;
                let terminate_status =
                    unsafe { libc::kill(-process_group_id, libc::SIGTERM) };
                if terminate_status != 0 {
                    let error = std::io::Error::last_os_error();
                    if error.raw_os_error() != Some(libc::ESRCH) {
                        log::warn!(
                            "[claude] killpg(SIGTERM) failed for turn={} pgid={}: {}",
                            _turn_id,
                            process_group_id,
                            error
                        );
                    }
                } else {
                    sleep(Duration::from_millis(150)).await;
                }

                if matches!(child.try_wait(), Ok(Some(_))) {
                    let _ = child.wait().await;
                    return Ok(());
                }

                let kill_status = unsafe { libc::kill(-process_group_id, libc::SIGKILL) };
                if kill_status != 0 {
                    let error = std::io::Error::last_os_error();
                    if error.raw_os_error() != Some(libc::ESRCH) {
                        log::warn!(
                            "[claude] killpg(SIGKILL) failed for turn={} pgid={}: {}",
                            _turn_id,
                            process_group_id,
                            error
                        );
                    }
                }

                if matches!(child.try_wait(), Ok(Some(_))) {
                    let _ = child.wait().await;
                    return Ok(());
                }
            }
        }

        if let Err(error) = child.kill().await {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return Ok(());
            }
            return Err(format!("Failed to kill process: {}", error));
        }
        if matches!(child.try_wait(), Ok(Some(_))) {
            return Ok(());
        }
        let _ = child.wait().await;
        Ok(())
    }

    /// Interrupt the current operation
    pub async fn interrupt(&self) -> Result<(), String> {
        // Set interrupted flag BEFORE killing so send_message() knows this was intentional
        self.interrupted.store(true, Ordering::SeqCst);
        let children: Vec<(String, Child)> = {
            let mut active = self.active_processes.lock().await;
            active.drain().collect()
        };
        let mut first_terminate_error: Option<String> = None;
        for (turn_id, mut child) in children {
            if let Err(error) = self.terminate_child_process(&turn_id, &mut child).await {
                log::warn!(
                    "[claude] interrupt failed to terminate child for turn={}: {}",
                    turn_id,
                    error
                );
                if first_terminate_error.is_none() {
                    first_terminate_error = Some(error);
                }
            }
        }
        // Clean up tool tracking state that would otherwise leak from interrupted turns.
        // Use unwrap_or_else to still clear even if the mutex was poisoned by a panic.
        self.tool_name_by_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.tool_input_by_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.tool_id_by_block_index
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.pending_tools
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.last_emitted_text_by_turn
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.user_input_notify_by_turn
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.user_input_answer_by_turn
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        self.pending_user_inputs
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        if let Some(error) = first_terminate_error {
            return Err(error);
        }
        Ok(())
    }

    /// Interrupt a single turn without affecting other concurrent turns.
    pub async fn interrupt_turn(&self, turn_id: &str) -> Result<(), String> {
        self.interrupted.store(true, Ordering::SeqCst);
        let mut child = {
            let mut active = self.active_processes.lock().await;
            active.remove(turn_id)
        };
        if let Some(child_proc) = child.as_mut() {
            self.terminate_child_process(turn_id, child_proc).await?;
        }
        self.clear_turn_ephemeral_state(turn_id);
        Ok(())
    }

    /// Convert Claude event to unified format
    /// Handles Claude CLI 2.0.52+ event format: system, assistant, result, error
    fn convert_event(&self, turn_id: &str, event: &Value) -> Option<EngineEvent> {
        // Debug: print the full event JSON
        log::debug!(
            "[claude] Received event: {}",
            serde_json::to_string_pretty(event).unwrap_or_else(|_| event.to_string())
        );

        // Check for context_window field in ANY event (Claude statusline/hooks)
        // This provides the most accurate context usage snapshot
        self.try_extract_context_window_usage(turn_id, event);

        let event_type = event.get("type")?.as_str()?;

        match event_type {
            // Legacy stream_event format (kept for backward compatibility)
            "stream_event" => self.convert_stream_event(turn_id, event),

            // Claude CLI 2.0.52+ format: system init event
            "system" => {
                let has_init_payload = event
                    .get("subtype")
                    .and_then(|value| value.as_str())
                    .map(|value| value.eq_ignore_ascii_case("init"))
                    .unwrap_or(false)
                    || event.get("tools").is_some()
                    || event.get("mcp_servers").is_some()
                    || event.get("mcpServers").is_some();

                if has_init_payload {
                    return Some(EngineEvent::Raw {
                        workspace_id: self.workspace_id.clone(),
                        engine: EngineType::Claude,
                        data: event.clone(),
                    });
                }

                // System events contain session_id and initialization info
                // Extract session_id here as a fallback (also checked at top-level parsing)
                // Check both snake_case (session_id) and camelCase (sessionId) field names
                if let Some(sid) = event
                    .get("session_id")
                    .or_else(|| event.get("sessionId"))
                    .and_then(|v| v.as_str())
                {
                    if !sid.is_empty() && sid != "pending" {
                        return Some(EngineEvent::SessionStarted {
                            workspace_id: self.workspace_id.clone(),
                            session_id: sid.to_string(),
                            engine: EngineType::Claude,
                        });
                    }
                }
                if Self::has_compaction_system_signal(event) {
                    return Some(EngineEvent::Raw {
                        workspace_id: self.workspace_id.clone(),
                        engine: EngineType::Claude,
                        data: event.clone(),
                    });
                }
                None
            }

            // Claude CLI 2.0.52+ format: assistant message event
            "assistant" => {
                // Extract text content from the message
                if let Some(message) = event.get("message") {
                    if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                        let reasoning_text = concat_reasoning_blocks(content);

                        if let Some(cumulative_text) = concat_text_blocks(content) {
                            // assistant partial messages contain cumulative text.
                            // Compute the true delta to avoid sending the full text
                            // on every update, which causes excessive re-renders.
                            let delta = self.compute_text_delta(turn_id, &cumulative_text);
                            if !delta.is_empty() {
                                if let Some(reasoning) = reasoning_text.as_deref() {
                                    self.emit_turn_event(
                                        turn_id,
                                        EngineEvent::ReasoningDelta {
                                            workspace_id: self.workspace_id.clone(),
                                            text: reasoning.to_string(),
                                        },
                                    );
                                }
                                return Some(EngineEvent::TextDelta {
                                    workspace_id: self.workspace_id.clone(),
                                    text: delta,
                                });
                            }
                        }

                        for block in content {
                            let block_type = block.get("type").and_then(|t| t.as_str());
                            match block_type {
                                Some("tool_use") => {
                                    let tool_name = extract_claude_tool_name(block)
                                        .unwrap_or_else(|| "unknown".to_string());
                                    let index = block.get("index").and_then(|v| v.as_i64());
                                    let tool_id = self
                                        .resolve_tool_use_id(block, index)
                                        .unwrap_or_else(|| "unknown".to_string());
                                    let input = extract_claude_tool_input(block);

                                    if let Some(index) = index {
                                        self.cache_tool_block_index(turn_id, index, &tool_id);
                                    }
                                    self.cache_tool_name(&tool_id, &tool_name);
                                    if let Some(input) = input.as_ref() {
                                        self.cache_tool_input_value(&tool_id, input);
                                    }
                                    self.register_pending_tool(
                                        turn_id,
                                        &tool_id,
                                        &tool_name,
                                        input.as_ref(),
                                    );

                                    // Intercept AskUserQuestion tool to emit a RequestUserInput event
                                    if tool_name == "AskUserQuestion" {
                                        if let Some(ref input_val) = input {
                                            return self.convert_ask_user_question_to_request(
                                                &tool_id, input_val, turn_id,
                                            );
                                        }
                                    }

                                    return Some(EngineEvent::ToolStarted {
                                        workspace_id: self.workspace_id.clone(),
                                        tool_id: tool_id.to_string(),
                                        tool_name,
                                        input,
                                    });
                                }
                                Some("tool_result") => {
                                    let index = block.get("index").and_then(|v| v.as_i64());
                                    let tool_id = self
                                        .resolve_tool_result_id(turn_id, block, index)
                                        .unwrap_or_default();
                                    if tool_id.is_empty() {
                                        return None;
                                    }
                                    let content =
                                        block.get("content").or_else(|| block.get("tool_output"));
                                    let is_error = block
                                        .get("is_error")
                                        .or_else(|| block.get("isError"))
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    let output = content.and_then(extract_tool_result_text);
                                    let result =
                                        self.build_tool_completed(&tool_id, output, is_error);
                                    self.clear_tool_block_index(turn_id, index);
                                    return result;
                                }
                                _ => {}
                            }
                        }

                        if let Some(reasoning) = reasoning_text {
                            return Some(EngineEvent::ReasoningDelta {
                                workspace_id: self.workspace_id.clone(),
                                text: reasoning,
                            });
                        }
                    }
                }
                None
            }

            // Compatibility: some runtimes emit explicit delta events instead of
            // cumulative assistant snapshots.
            "assistant_message_delta" | "message_delta" | "text_delta" | "output_text_delta" => {
                if let Some(text) =
                    extract_delta_text_from_event(event).or_else(|| extract_result_text(event))
                {
                    if !text.is_empty() {
                        return Some(EngineEvent::TextDelta {
                            workspace_id: self.workspace_id.clone(),
                            text,
                        });
                    }
                }
                None
            }

            // Compatibility: some runtimes emit assistant snapshots as
            // `assistant_message`/`message`.
            "assistant_message" | "message" => {
                let role = event
                    .get("message")
                    .and_then(|m| m.get("role"))
                    .or_else(|| event.get("role"))
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if role == "user" {
                    return None;
                }
                if let Some(cumulative_text) = extract_result_text(event) {
                    let delta = self.compute_text_delta(turn_id, &cumulative_text);
                    if !delta.is_empty() {
                        return Some(EngineEvent::TextDelta {
                            workspace_id: self.workspace_id.clone(),
                            text: delta,
                        });
                    }
                }
                None
            }

            "user" => {
                if let Some(message) = event.get("message") {
                    if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                        for block in content {
                            let block_type = block.get("type").and_then(|t| t.as_str());
                            if block_type != Some("tool_result") {
                                continue;
                            }

                            let index = block.get("index").and_then(|v| v.as_i64());
                            let tool_id = self
                                .resolve_tool_result_id(turn_id, block, index)
                                .unwrap_or_default();
                            if tool_id.is_empty() {
                                continue;
                            }

                            let is_error = block
                                .get("is_error")
                                .or_else(|| block.get("isError"))
                                .or_else(|| event.get("is_error"))
                                .or_else(|| event.get("isError"))
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            let output = extract_tool_result_output(block, event);
                            let result = self.build_tool_completed(&tool_id, output, is_error);
                            self.clear_tool_block_index(turn_id, index);
                            return result;
                        }
                    }
                }

                Some(EngineEvent::Raw {
                    workspace_id: self.workspace_id.clone(),
                    engine: EngineType::Claude,
                    data: event.clone(),
                })
            }

            // Claude CLI 2.0.52+ format: final result event
            "result" => {
                // Note: Usage extraction is handled by try_extract_context_window_usage()
                // which looks for context_window.current_usage (the accurate context snapshot)
                // We don't use result.usage here as it represents cumulative session stats,
                // not the current context window usage

                // Final result event - turn completed
                Some(EngineEvent::TurnCompleted {
                    workspace_id: self.workspace_id.clone(),
                    result: Some(event.clone()),
                })
            }

            "reasoning_delta" | "thinking_delta" => {
                let text = extract_reasoning_fragment(event)
                    .map(|value| value.to_string())
                    .or_else(|| extract_delta_text_from_event(event))?;
                Some(EngineEvent::ReasoningDelta {
                    workspace_id: self.workspace_id.clone(),
                    text,
                })
            }

            "error" => {
                let message = event
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .or_else(|| event.get("message").and_then(|m| m.as_str()))
                    .unwrap_or("Unknown error");
                Some(EngineEvent::TurnError {
                    workspace_id: self.workspace_id.clone(),
                    error: message.to_string(),
                    code: event
                        .get("error")
                        .and_then(|e| e.get("code"))
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string()),
                })
            }
            "tool_use" => {
                let tool_name =
                    extract_claude_tool_name(event).unwrap_or_else(|| "unknown".to_string());
                let index = event.get("index").and_then(|v| v.as_i64());
                let tool_id = self
                    .resolve_tool_use_id(event, index)
                    .unwrap_or_else(|| "unknown".to_string());
                let input = extract_claude_tool_input(event);
                if let Some(index) = index {
                    self.cache_tool_block_index(turn_id, index, &tool_id);
                }
                self.cache_tool_name(&tool_id, &tool_name);
                if let Some(input) = input.as_ref() {
                    self.cache_tool_input_value(&tool_id, input);
                }
                self.register_pending_tool(turn_id, &tool_id, &tool_name, input.as_ref());

                // Intercept AskUserQuestion tool to emit a RequestUserInput event
                if tool_name == "AskUserQuestion" {
                    if let Some(ref input_val) = input {
                        return self
                            .convert_ask_user_question_to_request(&tool_id, input_val, turn_id);
                    }
                }

                Some(EngineEvent::ToolStarted {
                    workspace_id: self.workspace_id.clone(),
                    tool_id: tool_id.to_string(),
                    tool_name,
                    input,
                })
            }
            "tool_result" => {
                let index = event.get("index").and_then(|v| v.as_i64());
                let tool_id = self
                    .resolve_tool_result_id(turn_id, event, index)
                    .unwrap_or_default();
                if tool_id.is_empty() {
                    return None;
                }
                let content = event.get("content").or_else(|| event.get("tool_output"));
                let is_error = event
                    .get("is_error")
                    .or_else(|| event.get("isError"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let output = content.and_then(extract_tool_result_text);
                let result = self.build_tool_completed(&tool_id, output, is_error);
                self.clear_tool_block_index(turn_id, index);
                result
            }

            _ => {
                // Pass through as raw event
                Some(EngineEvent::Raw {
                    workspace_id: self.workspace_id.clone(),
                    engine: EngineType::Claude,
                    data: event.clone(),
                })
            }
        }
    }

    /// Convert stream_event type
    fn convert_stream_event(&self, turn_id: &str, event: &Value) -> Option<EngineEvent> {
        let inner = event.get("event")?;
        let inner_type = inner.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if inner_type == "content_block_start" {
            if let Some(block) = inner.get("content_block") {
                let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match block_type {
                    "tool_use" => {
                        let tool_name = extract_claude_tool_name(block)
                            .unwrap_or_else(|| "unknown".to_string());
                        let index = inner.get("index").and_then(|v| v.as_i64());
                        let tool_id = self
                            .resolve_tool_use_id(block, index)
                            .unwrap_or_else(|| "unknown".to_string());
                        let input = extract_claude_tool_input(block);
                        if let Some(index) = index {
                            self.cache_tool_block_index(turn_id, index, &tool_id);
                        }

                        self.cache_tool_name(&tool_id, &tool_name);
                        if let Some(input) = input.as_ref() {
                            self.cache_tool_input_value(&tool_id, input);
                        }
                        self.register_pending_tool(turn_id, &tool_id, &tool_name, input.as_ref());
                        return Some(EngineEvent::ToolStarted {
                            workspace_id: self.workspace_id.clone(),
                            tool_id: tool_id.to_string(),
                            tool_name,
                            input,
                        });
                    }
                    "tool_result" => {
                        let index = inner.get("index").and_then(|v| v.as_i64());
                        let tool_id = self
                            .resolve_tool_result_id(turn_id, block, index)
                            .unwrap_or_default();
                        if tool_id.is_empty() {
                            return None;
                        }
                        if let Some(index) = index {
                            self.cache_tool_block_index(turn_id, index, &tool_id);
                        }
                        let content = block.get("content").or_else(|| block.get("tool_output"));
                        if content.is_none() {
                            return None;
                        }
                        let is_error = block
                            .get("is_error")
                            .or_else(|| block.get("isError"))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let output = content.and_then(extract_tool_result_text);
                        if let Some(event) = self.build_tool_completed(&tool_id, output, is_error) {
                            self.clear_tool_block_index(turn_id, index);
                            return Some(event);
                        }
                    }
                    _ => {}
                }
            }
        }

        if inner_type == "content_block_delta" {
            let delta = inner.get("delta");
            let delta_type = delta
                .and_then(|d| d.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if delta_type == "input_json_delta" {
                let partial = delta
                    .and_then(|d| d.get("partial_json"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let index = inner.get("index").and_then(|v| v.as_i64());
                if let Some(tool_id) = self.tool_id_for_block_index(turn_id, index) {
                    if let Some(input) = self.append_tool_input(&tool_id, partial) {
                        let tool_name = self.peek_tool_name(&tool_id);
                        return Some(EngineEvent::ToolInputUpdated {
                            workspace_id: self.workspace_id.clone(),
                            tool_id,
                            tool_name,
                            input: Some(input),
                        });
                    }
                }
            }
        }

        let delta = inner.get("delta");
        let delta_type = delta
            .and_then(|d| d.get("type"))
            .and_then(|t| t.as_str())
            .unwrap_or("");

        match delta_type {
            "text_delta" => {
                let text = delta?.get("text")?.as_str()?;
                let index = inner.get("index").and_then(|v| v.as_i64());
                if let Some(tool_id) = self.tool_id_for_block_index(turn_id, index) {
                    if let Some(event) = self.build_tool_output_delta(&tool_id, text) {
                        return Some(event);
                    }
                }
                Some(EngineEvent::TextDelta {
                    workspace_id: self.workspace_id.clone(),
                    text: text.to_string(),
                })
            }
            "thinking_delta" | "reasoning_delta" => {
                let text = extract_reasoning_fragment(delta?)?;
                Some(EngineEvent::ReasoningDelta {
                    workspace_id: self.workspace_id.clone(),
                    text: text.to_string(),
                })
            }
            "tool_use" => {
                let tool_name = delta
                    .and_then(|d| d.get("name"))
                    .or_else(|| inner.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("unknown");
                let index = inner.get("index").and_then(|v| v.as_i64());
                let tool_id = self
                    .resolve_tool_use_id(delta.unwrap_or(inner), index)
                    .unwrap_or_else(|| "unknown".to_string());
                let input = delta
                    .and_then(|d| d.get("input"))
                    .cloned()
                    .or_else(|| inner.get("input").cloned());

                if let Some(index) = index {
                    self.cache_tool_block_index(turn_id, index, &tool_id);
                }
                self.cache_tool_name(&tool_id, tool_name);
                if let Some(input) = input.as_ref() {
                    self.cache_tool_input_value(&tool_id, input);
                }
                self.register_pending_tool(turn_id, &tool_id, tool_name, input.as_ref());
                Some(EngineEvent::ToolStarted {
                    workspace_id: self.workspace_id.clone(),
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    input,
                })
            }
            "tool_result" => {
                let index = inner.get("index").and_then(|v| v.as_i64());
                let block = delta.unwrap_or(inner);
                let tool_id = self
                    .resolve_tool_result_id(turn_id, block, index)
                    .unwrap_or_default();
                if tool_id.is_empty() {
                    return None;
                }
                let content = block.get("content").or_else(|| block.get("tool_output"));
                let is_error = block
                    .get("is_error")
                    .or_else(|| block.get("isError"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let output = content.and_then(extract_tool_result_text);
                let result = self.build_tool_completed(&tool_id, output, is_error);
                self.clear_tool_block_index(turn_id, index);
                result
            }
            _ => None,
        }
    }

    fn resolve_tool_use_id(&self, block: &Value, index: Option<i64>) -> Option<String> {
        if let Some(id) = extract_string_field(
            block,
            &[
                "id",
                "tool_use_id",
                "toolUseId",
                "tool_useId",
                "toolId",
                "tool_id",
            ],
        ) {
            return Some(id);
        }
        index.map(|value| format!("tool-block-{}", value))
    }

    fn resolve_tool_result_id(
        &self,
        turn_id: &str,
        block: &Value,
        index: Option<i64>,
    ) -> Option<String> {
        if let Some(id) = extract_string_field(
            block,
            &["tool_use_id", "toolUseId", "tool_useId", "toolUseID"],
        ) {
            return Some(id);
        }
        if let Some(mapped) = self.tool_id_for_block_index(turn_id, index) {
            return Some(mapped);
        }
        if let Some(id) = extract_string_field(block, &["tool_id", "toolId", "id"]) {
            return Some(id);
        }
        self.match_pending_tool_result(turn_id, block)
            .or_else(|| self.latest_pending_tool_id(turn_id))
    }

    fn cache_tool_name(&self, tool_id: &str, tool_name: &str) {
        if tool_id.is_empty() || tool_name.is_empty() {
            return;
        }
        if let Ok(mut map) = self.tool_name_by_id.lock() {
            map.insert(tool_id.to_string(), tool_name.to_string());
        }
    }

    fn peek_tool_name(&self, tool_id: &str) -> Option<String> {
        if tool_id.is_empty() {
            return None;
        }
        self.tool_name_by_id
            .lock()
            .ok()
            .and_then(|map| map.get(tool_id).cloned())
    }

    fn take_tool_name(&self, tool_id: &str) -> Option<String> {
        if tool_id.is_empty() {
            return None;
        }
        self.tool_name_by_id
            .lock()
            .ok()
            .and_then(|mut map| map.remove(tool_id))
    }

    fn cache_tool_block_index(&self, turn_id: &str, index: i64, tool_id: &str) {
        if tool_id.is_empty() {
            return;
        }
        if let Ok(mut map) = self.tool_id_by_block_index.lock() {
            map.insert((turn_id.to_string(), index), tool_id.to_string());
        }
    }

    fn tool_id_for_block_index(&self, turn_id: &str, index: Option<i64>) -> Option<String> {
        let index = index?;
        self.tool_id_by_block_index
            .lock()
            .ok()
            .and_then(|map| map.get(&(turn_id.to_string(), index)).cloned())
    }

    fn clear_tool_block_index(&self, turn_id: &str, index: Option<i64>) {
        if let Some(index) = index {
            if let Ok(mut map) = self.tool_id_by_block_index.lock() {
                map.remove(&(turn_id.to_string(), index));
            }
        }
    }

    fn register_pending_tool(
        &self,
        turn_id: &str,
        tool_id: &str,
        tool_name: &str,
        input: Option<&Value>,
    ) {
        if tool_id.is_empty() || tool_name.is_empty() {
            return;
        }
        let input_signature = input.and_then(tool_input_signature);
        if let Ok(mut pending) = self.pending_tools.lock() {
            pending.retain(|entry| entry.tool_id != tool_id);
            pending.push(PendingClaudeTool {
                turn_id: turn_id.to_string(),
                tool_id: tool_id.to_string(),
                tool_name: tool_name.to_string(),
                input_signature,
            });
        }
    }

    fn clear_pending_tool(&self, tool_id: &str) {
        if tool_id.is_empty() {
            return;
        }
        if let Ok(mut pending) = self.pending_tools.lock() {
            pending.retain(|entry| entry.tool_id != tool_id);
        }
    }

    fn match_pending_tool_result(&self, turn_id: &str, block: &Value) -> Option<String> {
        let tool_name = extract_claude_tool_name(block)?;
        let input_signature =
            extract_claude_tool_input(block).and_then(|value| tool_input_signature(&value));
        let pending = self.pending_tools.lock().ok()?;

        if let Some(expected_input) = input_signature.as_deref() {
            if let Some(entry) = pending.iter().rev().find(|entry| {
                entry.turn_id == turn_id
                    && entry.tool_name == tool_name
                    && entry.input_signature.as_deref() == Some(expected_input)
            }) {
                return Some(entry.tool_id.clone());
            }
        }

        pending
            .iter()
            .rev()
            .find(|entry| entry.turn_id == turn_id && entry.tool_name == tool_name)
            .map(|entry| entry.tool_id.clone())
    }

    fn latest_pending_tool_id(&self, turn_id: &str) -> Option<String> {
        let pending = self.pending_tools.lock().ok()?;
        pending
            .iter()
            .rev()
            .find(|entry| entry.turn_id == turn_id)
            .map(|entry| entry.tool_id.clone())
    }

    /// Compute the true delta from a cumulative assistant text.
    /// If the cumulative text starts with the previously emitted text,
    /// return only the new portion. Otherwise return the full text
    /// (this handles edge cases like context compaction).
    fn compute_text_delta(&self, turn_id: &str, cumulative: &str) -> String {
        if let Ok(mut map) = self.last_emitted_text_by_turn.lock() {
            let last = map.entry(turn_id.to_string()).or_default();
            if cumulative.starts_with(last.as_str()) {
                let delta = cumulative[last.len()..].to_string();
                *last = cumulative.to_string();
                return delta;
            }
            // Cumulative text doesn't extend the previous — emit full text
            *last = cumulative.to_string();
        }
        cumulative.to_string()
    }

    fn append_tool_input(&self, tool_id: &str, partial: &str) -> Option<Value> {
        if tool_id.is_empty() || partial.is_empty() {
            return None;
        }
        if let Ok(mut map) = self.tool_input_by_id.lock() {
            let entry = map.entry(tool_id.to_string()).or_default();
            entry.push_str(partial);
            if let Ok(value) = serde_json::from_str::<Value>(entry) {
                return Some(value);
            }
        }
        None
    }

    fn cache_tool_input_value(&self, tool_id: &str, input: &Value) {
        if tool_id.is_empty() {
            return;
        }
        if let Ok(mut map) = self.tool_input_value_by_id.lock() {
            map.insert(tool_id.to_string(), input.clone());
        }
    }

    fn take_tool_input_value(&self, tool_id: &str) -> Option<Value> {
        if tool_id.is_empty() {
            return None;
        }
        self.tool_input_value_by_id
            .lock()
            .ok()
            .and_then(|mut map| map.remove(tool_id))
    }

    fn clear_tool_input(&self, tool_id: &str) {
        if tool_id.is_empty() {
            return;
        }
        if let Ok(mut map) = self.tool_input_by_id.lock() {
            map.remove(tool_id);
        }
        if let Ok(mut map) = self.tool_input_value_by_id.lock() {
            map.remove(tool_id);
        }
    }

    fn build_tool_completed(
        &self,
        tool_id: &str,
        output: Option<String>,
        is_error: bool,
    ) -> Option<EngineEvent> {
        if tool_id.is_empty() {
            return None;
        }
        let tool_name = self.take_tool_name(tool_id);
        let cached_input = self.take_tool_input_value(tool_id);
        self.clear_pending_tool(tool_id);
        self.clear_tool_input(tool_id);
        let error = if is_error {
            output.clone().filter(|text| !text.trim().is_empty())
        } else {
            None
        };
        let output = if is_error {
            None
        } else {
            output.map(|text| {
                if let Some(input) = cached_input.clone() {
                    json!({
                        "_input": input,
                        "_output": text,
                    })
                } else {
                    Value::String(text)
                }
            })
        };
        Some(EngineEvent::ToolCompleted {
            workspace_id: self.workspace_id.clone(),
            tool_id: tool_id.to_string(),
            tool_name,
            output,
            error,
        })
    }

    fn build_tool_output_delta(&self, tool_id: &str, delta: &str) -> Option<EngineEvent> {
        let trimmed = delta.trim_end();
        if tool_id.is_empty() || trimmed.is_empty() {
            return None;
        }
        Some(EngineEvent::ToolOutputDelta {
            workspace_id: self.workspace_id.clone(),
            tool_id: tool_id.to_string(),
            tool_name: self.peek_tool_name(tool_id),
            delta: trimmed.to_string(),
        })
    }
}

/// Claude session manager for all workspaces
pub struct ClaudeSessionManager {
    sessions: Mutex<HashMap<String, Arc<ClaudeSession>>>,
    default_config: RwLock<EngineConfig>,
}

impl ClaudeSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            default_config: RwLock::new(EngineConfig::default()),
        }
    }

    /// Set default configuration
    pub async fn set_config(&self, config: EngineConfig) {
        *self.default_config.write().await = config;
    }

    /// Get or create a session for a workspace
    pub async fn get_or_create_session(
        &self,
        workspace_id: &str,
        workspace_path: &Path,
    ) -> Arc<ClaudeSession> {
        let mut sessions = self.sessions.lock().await;

        if let Some(session) = sessions.get(workspace_id) {
            return session.clone();
        }

        let config = self.default_config.read().await.clone();
        let session = Arc::new(ClaudeSession::new(
            workspace_id.to_string(),
            workspace_path.to_path_buf(),
            Some(config),
        ));

        sessions.insert(workspace_id.to_string(), session.clone());
        session
    }

    /// Remove a session
    pub async fn remove_session(&self, workspace_id: &str) -> Option<Arc<ClaudeSession>> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(workspace_id)
    }

    /// Get a session if it exists
    pub async fn get_session(&self, workspace_id: &str) -> Option<Arc<ClaudeSession>> {
        let sessions = self.sessions.lock().await;
        sessions.get(workspace_id).cloned()
    }

    /// Interrupt all active sessions (used during app shutdown)
    pub async fn interrupt_all(&self) {
        let sessions = self.sessions.lock().await;
        for session in sessions.values() {
            let _ = session.interrupt().await;
        }
    }
}

impl Default for ClaudeSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::sync::broadcast::error::TryRecvError;

    #[test]
    fn session_creation() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        assert_eq!(session.workspace_id, "test-workspace");
    }

    #[tokio::test]
    async fn ask_user_question_registers_and_clears_pending_request() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
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
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
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
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        if let Ok(mut pending) = session.pending_user_inputs.lock() {
            pending.insert("42".to_string(), "turn-42".to_string());
        }
        assert!(session.has_pending_user_input(&json!(42)));
        assert!(session.has_pending_user_input(&json!("42")));
    }

    #[test]
    fn has_any_pending_user_input_reports_presence() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        assert!(!session.has_any_pending_user_input());
        if let Ok(mut pending) = session.pending_user_inputs.lock() {
            pending.insert("ask-1".to_string(), "turn-1".to_string());
        }
        assert!(session.has_any_pending_user_input());
    }

    #[tokio::test]
    async fn respond_to_user_input_rejects_mismatched_request_id() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
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
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let mut params = SendMessageParams::default();
        params.text = "hello".to_string();
        params.custom_spec_root = Some(if cfg!(windows) {
            "C:\\tmp\\external-openspec".to_string()
        } else {
            "/tmp/external-openspec".to_string()
        });

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
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
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
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
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

    #[test]
    fn build_command_uses_session_id_for_new_conversation_without_continue() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let mut params = SendMessageParams::default();
        params.text = "hello".to_string();
        params.continue_session = false;
        params.session_id = Some("11111111-1111-4111-8111-111111111111".to_string());

        let command = session.build_command(&params, false);
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
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let mut params = SendMessageParams::default();
        params.text = "hello".to_string();
        params.continue_session = true;
        params.session_id = Some("22222222-2222-4222-8222-222222222222".to_string());

        let command = session.build_command(&params, false);
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

    #[tokio::test]
    async fn session_manager_get_or_create() {
        let manager = ClaudeSessionManager::new();

        let session1 = manager
            .get_or_create_session("ws-1", Path::new("/tmp/ws1"))
            .await;
        let session2 = manager
            .get_or_create_session("ws-1", Path::new("/tmp/ws1"))
            .await;

        // Should return the same session
        assert_eq!(session1.workspace_id, session2.workspace_id);
    }

    #[test]
    fn emit_error_broadcasts_turn_scoped_event() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let mut receiver = session.subscribe();

        session.emit_error("turn-a", "boom".to_string());

        let received = receiver.try_recv().expect("expected one error event");
        assert_eq!(received.turn_id, "turn-a");
        match received.event {
            EngineEvent::TurnError { error, .. } => assert_eq!(error, "boom"),
            other => panic!("unexpected event: {:?}", other),
        }
        assert!(matches!(receiver.try_recv(), Err(TryRecvError::Empty)));
    }

    #[test]
    fn prompt_too_long_detection_matches_common_variants() {
        assert!(ClaudeSession::is_prompt_too_long_error(
            "Prompt is too long"
        ));
        assert!(ClaudeSession::is_prompt_too_long_error(
            "Maximum context length exceeded for this model"
        ));
        assert!(!ClaudeSession::is_prompt_too_long_error(
            "API Error: All providers unavailable"
        ));
    }

    #[test]
    fn prompt_too_long_marker_roundtrip() {
        let marked = ClaudeSession::mark_retryable_prompt_too_long_error("Prompt is too long");
        assert!(marked.starts_with(RETRYABLE_PROMPT_TOO_LONG_PREFIX));
        assert_eq!(
            ClaudeSession::extract_retryable_prompt_too_long_error(&marked),
            Some("Prompt is too long".to_string())
        );
        assert_eq!(
            ClaudeSession::clear_retryable_prompt_too_long_marker(marked),
            "Prompt is too long".to_string()
        );
    }

    #[test]
    fn extract_text_from_content_concatenates_fragmented_blocks() {
        let content = json!([
            {"type": "text", "text": "你"},
            {"type": "text", "text": "好！我"},
            {"type": "text", "text": "是"},
            {"type": "text", "text": "Antigravity"}
        ]);

        let text = extract_text_from_content(&content);
        assert_eq!(text.as_deref(), Some("你好！我是Antigravity"));
    }

    #[test]
    fn convert_event_prefers_combined_text_when_thinking_and_text_coexist() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let mut receiver = session.subscribe();

        let event = json!({
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "thinking", "thinking": "先想一下"},
                    {"type": "text", "text": "你"},
                    {"type": "text", "text": "好"}
                ]
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::TextDelta { text, .. }) => assert_eq!(text, "你好"),
            other => panic!("expected text delta, got {:?}", other),
        }

        let reasoning_event = receiver
            .try_recv()
            .expect("expected reasoning delta to be emitted");
        assert_eq!(reasoning_event.turn_id, "turn-a");
        match reasoning_event.event {
            EngineEvent::ReasoningDelta { text, .. } => assert_eq!(text, "先想一下"),
            other => panic!("expected reasoning delta, got {:?}", other),
        }
        assert!(matches!(receiver.try_recv(), Err(TryRecvError::Empty)));
    }

    #[test]
    fn convert_event_supports_reasoning_block_alias() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        let event = json!({
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "reasoning", "reasoning": "先分析约束条件"}
                ]
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ReasoningDelta { text, .. }) => {
                assert_eq!(text, "先分析约束条件")
            }
            other => panic!("expected reasoning delta, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_supports_assistant_message_delta_aliases() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        let event = json!({
            "type": "assistant_message_delta",
            "delta": "stream chunk",
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::TextDelta { text, .. }) => assert_eq!(text, "stream chunk"),
            other => panic!("expected text delta, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_maps_system_compacting_to_raw() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let event = json!({
            "type": "system",
            "subtype": "compacting",
            "usage_percent": 95,
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::Raw { engine, data, .. }) => {
                assert!(matches!(engine, EngineType::Claude));
                assert_eq!(data["subtype"], Value::String("compacting".to_string()));
            }
            other => panic!("expected raw compaction signal, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_maps_system_compact_boundary_to_raw() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let event = json!({
            "type": "system",
            "event": "compact_boundary",
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::Raw { engine, data, .. }) => {
                assert!(matches!(engine, EngineType::Claude));
                assert_eq!(data["event"], Value::String("compact_boundary".to_string()));
            }
            other => panic!("expected raw compact boundary signal, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_supports_message_snapshot_aliases() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        let first = json!({
            "type": "assistant_message",
            "message": {
                "content": [
                    {"type": "text", "text": "你好"},
                ]
            }
        });
        let second = json!({
            "type": "assistant_message",
            "message": {
                "content": [
                    {"type": "text", "text": "你好，世界"},
                ]
            }
        });

        match session.convert_event("turn-a", &first) {
            Some(EngineEvent::TextDelta { text, .. }) => assert_eq!(text, "你好"),
            other => panic!("expected first text delta, got {:?}", other),
        }
        match session.convert_event("turn-a", &second) {
            Some(EngineEvent::TextDelta { text, .. }) => assert_eq!(text, "，世界"),
            other => panic!("expected second text delta, got {:?}", other),
        }
    }

    #[test]
    fn parse_claude_stream_json_line_supports_data_prefix() {
        let parsed = parse_claude_stream_json_line(
            "data: {\"type\":\"assistant_message_delta\",\"delta\":\"ok\"}",
        )
        .expect("expected parser to accept data: prefix");
        assert_eq!(
            parsed.get("type").and_then(|value| value.as_str()),
            Some("assistant_message_delta"),
        );
    }

    #[test]
    fn convert_stream_event_supports_reasoning_delta_alias() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        let event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_delta",
                "delta": {
                    "type": "reasoning_delta",
                    "reasoning": "先看日志，再定位根因"
                }
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ReasoningDelta { text, .. }) => {
                assert_eq!(text, "先看日志，再定位根因")
            }
            other => panic!("expected reasoning delta, got {:?}", other),
        }
    }

    #[test]
    fn convert_stream_event_maps_tool_result_text_delta_to_tool_output_delta() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-1", "Bash");
        session.cache_tool_block_index("turn-a", 7, "tool-1");

        let event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_delta",
                "index": 7,
                "delta": {
                    "type": "text_delta",
                    "text": "total 12\n"
                }
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolOutputDelta {
                tool_id,
                tool_name,
                delta,
                ..
            }) => {
                assert_eq!(tool_id, "tool-1");
                assert_eq!(tool_name.as_deref(), Some("Bash"));
                assert_eq!(delta, "total 12");
            }
            other => panic!("expected tool output delta, got {:?}", other),
        }
    }

    #[test]
    fn convert_stream_event_caches_tool_result_block_index_before_text_deltas() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-42", "Bash");
        session.register_pending_tool("turn-a", "tool-42", "Bash", None);

        let start_event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_start",
                "index": 11,
                "content_block": {
                    "type": "tool_result",
                    "tool_use_id": "tool-42"
                }
            }
        });
        assert!(session.convert_event("turn-a", &start_event).is_none());

        let delta_event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_delta",
                "index": 11,
                "delta": {
                    "type": "text_delta",
                    "text": "README.md\n"
                }
            }
        });

        let converted = session.convert_event("turn-a", &delta_event);
        match converted {
            Some(EngineEvent::ToolOutputDelta { tool_id, delta, .. }) => {
                assert_eq!(tool_id, "tool-42");
                assert_eq!(delta, "README.md");
            }
            other => panic!("expected tool output delta, got {:?}", other),
        }
    }

    #[test]
    fn convert_stream_event_emits_tool_completed_for_tool_result_delta() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-55", "Edit");
        session.register_pending_tool("turn-a", "tool-55", "Edit", None);

        let event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_delta",
                "index": 5,
                "delta": {
                    "type": "tool_result",
                    "tool_use_id": "tool-55",
                    "content": [{"type": "text", "text": "updated file\n"}]
                }
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                tool_name,
                output,
                error,
                ..
            }) => {
                assert_eq!(tool_id, "tool-55");
                assert_eq!(tool_name.as_deref(), Some("Edit"));
                assert_eq!(output, Some(Value::String("updated file".to_string())));
                assert_eq!(error, None);
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn build_tool_completed_embeds_cached_input_with_output() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-input", "Bash");
        session.cache_tool_input_value(
            "tool-input",
            &json!({
                "command": "pwd",
                "cwd": "/repo",
            }),
        );

        let converted =
            session.build_tool_completed("tool-input", Some("/repo".to_string()), false);
        match converted {
            Some(EngineEvent::ToolCompleted {
                output: Some(Value::Object(payload)),
                ..
            }) => {
                assert_eq!(
                    payload.get("_output"),
                    Some(&Value::String("/repo".to_string()))
                );
                assert_eq!(
                    payload.get("_input").and_then(|value| value.get("command")),
                    Some(&Value::String("pwd".to_string()))
                );
            }
            other => panic!("expected embedded output payload, got {:?}", other),
        }
    }

    #[test]
    fn extract_tool_result_text_reads_preview_and_loaded_entries() {
        let preview = json!({
            "preview": "settings.local.json"
        });
        assert_eq!(
            extract_tool_result_text(&preview),
            Some("settings.local.json".to_string())
        );

        let loaded = json!({
            "loaded": [
                "/repo/README.md",
                "/repo/package.json"
            ]
        });
        assert_eq!(
            extract_tool_result_text(&loaded),
            Some("/repo/README.md\n/repo/package.json".to_string())
        );
    }

    #[test]
    fn convert_stream_event_falls_back_to_latest_pending_tool_when_result_lacks_identifiers() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-latest", "Bash");
        session.register_pending_tool("turn-a", "tool-latest", "Bash", None);

        let start_event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_start",
                "index": 12,
                "content_block": {
                    "type": "tool_result"
                }
            }
        });
        assert!(session.convert_event("turn-a", &start_event).is_none());

        let delta_event = json!({
            "type": "stream_event",
            "event": {
                "type": "content_block_delta",
                "index": 12,
                "delta": {
                    "type": "text_delta",
                    "text": "README.md\n"
                }
            }
        });

        let converted = session.convert_event("turn-a", &delta_event);
        match converted {
            Some(EngineEvent::ToolOutputDelta { tool_id, delta, .. }) => {
                assert_eq!(tool_id, "tool-latest");
                assert_eq!(delta, "README.md");
            }
            other => panic!("expected tool output delta, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_reads_transcript_style_tool_output_payload() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-99", "bash");
        session.register_pending_tool("turn-a", "tool-99", "bash", None);

        let event = json!({
            "type": "tool_result",
            "tool_use_id": "tool-99",
            "tool_output": {
                "output": "commit-a\ncommit-b\n",
                "exit": 0
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                tool_name,
                output,
                error,
                ..
            }) => {
                assert_eq!(tool_id, "tool-99");
                assert_eq!(tool_name.as_deref(), Some("bash"));
                assert_eq!(
                    output,
                    Some(Value::String("commit-a\ncommit-b".to_string()))
                );
                assert_eq!(error, None);
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_matches_transcript_style_tool_result_without_tool_use_id() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        let tool_input = json!({
            "command": "git log --oneline -10",
            "description": "查看最近提交"
        });
        session.cache_tool_name("tool-bash-1", "bash");
        session.register_pending_tool("turn-a", "tool-bash-1", "bash", Some(&tool_input));

        let event = json!({
            "type": "tool_result",
            "tool_name": "bash",
            "tool_input": {
                "command": "git log --oneline -10",
                "description": "查看最近提交"
            },
            "tool_output": {
                "output": "commit-a\ncommit-b\n",
                "exit": 0
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                tool_name,
                output,
                error,
                ..
            }) => {
                assert_eq!(tool_id, "tool-bash-1");
                assert_eq!(tool_name.as_deref(), Some("bash"));
                assert_eq!(
                    output,
                    Some(Value::String("commit-a\ncommit-b".to_string()))
                );
                assert_eq!(error, None);
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_reads_project_jsonl_user_tool_result_content() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-user-1", "Bash");
        session.register_pending_tool("turn-a", "tool-user-1", "Bash", None);

        let event = json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "tool-user-1",
                    "content": "/repo\n",
                    "is_error": false
                }]
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                tool_name,
                output,
                error,
                ..
            }) => {
                assert_eq!(tool_id, "tool-user-1");
                assert_eq!(tool_name.as_deref(), Some("Bash"));
                assert_eq!(output, Some(Value::String("/repo".to_string())));
                assert_eq!(error, None);
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_preserves_read_input_for_project_jsonl_user_tool_result() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        let start_event = json!({
            "type": "assistant",
            "message": {
                "content": [{
                    "type": "tool_use",
                    "id": "read-tool-1",
                    "name": "Read",
                    "input": {
                        "file_path": "/repo/README.md"
                    }
                }]
            }
        });

        match session.convert_event("turn-a", &start_event) {
            Some(EngineEvent::ToolStarted { tool_id, input, .. }) => {
                assert_eq!(tool_id, "read-tool-1");
                assert_eq!(
                    input.as_ref().and_then(|value| value.get("file_path")),
                    Some(&Value::String("/repo/README.md".to_string()))
                );
            }
            other => panic!("expected tool started, got {:?}", other),
        }

        let completed_event = json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "read-tool-1",
                    "content": "     1→hello world\n"
                }]
            }
        });

        match session.convert_event("turn-a", &completed_event) {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                output: Some(Value::Object(payload)),
                ..
            }) => {
                assert_eq!(tool_id, "read-tool-1");
                assert_eq!(
                    payload
                        .get("_input")
                        .and_then(|value| value.get("file_path")),
                    Some(&Value::String("/repo/README.md".to_string()))
                );
                assert_eq!(
                    payload.get("_output"),
                    Some(&Value::String("1→hello world".to_string()))
                );
            }
            other => panic!("expected embedded read payload, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_reads_project_jsonl_user_tool_result_stdout_fallback() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-user-stdout", "Bash");
        session.register_pending_tool("turn-a", "tool-user-stdout", "Bash", None);

        let event = json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "tool-user-stdout",
                    "content": "",
                    "is_error": false
                }]
            },
            "toolUseResult": {
                "stdout": "total 32\n-rw-r--r-- README.md\n",
                "stderr": ""
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                tool_name,
                output,
                error,
                ..
            }) => {
                assert_eq!(tool_id, "tool-user-stdout");
                assert_eq!(tool_name.as_deref(), Some("Bash"));
                assert_eq!(
                    output,
                    Some(Value::String("total 32\n-rw-r--r-- README.md".to_string()))
                );
                assert_eq!(error, None);
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_matches_tool_result_without_id_or_name_to_latest_pending_tool() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-fallback", "bash");
        session.register_pending_tool("turn-a", "tool-fallback", "bash", None);

        let event = json!({
            "type": "tool_result",
            "tool_output": {
                "output": "ok\n",
                "exit": 0
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id,
                tool_name,
                output,
                error,
                ..
            }) => {
                assert_eq!(tool_id, "tool-fallback");
                assert_eq!(tool_name.as_deref(), Some("bash"));
                assert_eq!(output, Some(Value::String("ok".to_string())));
                assert_eq!(error, None);
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_matches_most_recent_same_name_tool_when_input_missing() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );
        session.cache_tool_name("tool-bash-older", "bash");
        session.register_pending_tool(
            "turn-a",
            "tool-bash-older",
            "bash",
            Some(&json!({ "command": "pwd" })),
        );
        session.cache_tool_name("tool-bash-newer", "bash");
        session.register_pending_tool(
            "turn-a",
            "tool-bash-newer",
            "bash",
            Some(&json!({ "command": "find . -name \"*.py\"" })),
        );

        let event = json!({
            "type": "tool_result",
            "tool_name": "bash",
            "tool_output": {
                "output": "42\n",
                "exit": 0
            }
        });

        let converted = session.convert_event("turn-a", &event);
        match converted {
            Some(EngineEvent::ToolCompleted {
                tool_id, output, ..
            }) => {
                assert_eq!(tool_id, "tool-bash-newer");
                assert_eq!(output, Some(Value::String("42".to_string())));
            }
            other => panic!("expected tool completed, got {:?}", other),
        }
    }

    #[test]
    fn convert_event_avoids_duplicate_when_assistant_blocks_repeat_whole_message() {
        let session = ClaudeSession::new(
            "test-workspace".to_string(),
            PathBuf::from("/tmp/test"),
            None,
        );

        let first = json!({
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "你好！很高兴见到你。\n\n有什么我可以帮你的吗"}
                ]
            }
        });
        let second = json!({
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "有什么我可以帮你的吗？"},
                    {"type": "text", "text": "你好！很高兴见到你。\n\n有什么我可以帮你的吗？"}
                ]
            }
        });

        match session.convert_event("turn-a", &first) {
            Some(EngineEvent::TextDelta { text, .. }) => {
                assert_eq!(text, "你好！很高兴见到你。\n\n有什么我可以帮你的吗")
            }
            other => panic!("expected first text delta, got {:?}", other),
        }

        match session.convert_event("turn-a", &second) {
            Some(EngineEvent::TextDelta { text, .. }) => assert_eq!(text, "？"),
            other => panic!("expected punctuation-only delta, got {:?}", other),
        }
    }

    #[test]
    fn looks_like_claude_runtime_error_detects_api_json_eof() {
        assert!(looks_like_claude_runtime_error(
            "API Error: Unexpected end of JSON input"
        ));
        assert!(looks_like_claude_runtime_error(
            "error: transport dropped unexpectedly"
        ));
    }

    #[test]
    fn looks_like_claude_runtime_error_ignores_regular_output() {
        assert!(!looks_like_claude_runtime_error("你好，我继续给你方案"));
        assert!(!looks_like_claude_runtime_error("{\"type\":\"assistant\"}"));
    }
}
