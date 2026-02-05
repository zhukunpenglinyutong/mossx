//! Claude Code engine implementation
//!
//! Handles Claude Code CLI execution via `claude -p` (print mode) with
//! streaming JSON output.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex, RwLock};

use super::events::EngineEvent;
use super::{EngineConfig, EngineType, SendMessageParams};
use crate::backend::app_server::{build_codex_path_env, find_cli_binary};

/// Claude Code session for a workspace
pub struct ClaudeSession {
    /// Workspace identifier
    pub workspace_id: String,
    /// Workspace directory path
    pub workspace_path: PathBuf,
    /// Current Claude session ID (for --resume)
    session_id: RwLock<Option<String>>,
    /// Event broadcaster
    event_sender: broadcast::Sender<EngineEvent>,
    /// Custom binary path
    bin_path: Option<String>,
    /// Custom home directory
    home_dir: Option<String>,
    /// Additional CLI arguments
    custom_args: Option<String>,
    /// Active child process (if any)
    active_process: Mutex<Option<Child>>,
    /// Track tool names for completion events
    tool_name_by_id: StdMutex<HashMap<String, String>>,
    /// Track tool input buffers for streaming input_json_delta
    tool_input_by_id: StdMutex<HashMap<String, String>>,
    /// Map content block index to tool id
    tool_id_by_block_index: StdMutex<HashMap<i64, String>>,
}

impl ClaudeSession {
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
            active_process: Mutex::new(None),
            tool_name_by_id: StdMutex::new(HashMap::new()),
            tool_input_by_id: StdMutex::new(HashMap::new()),
            tool_id_by_block_index: StdMutex::new(HashMap::new()),
        }
    }

    /// Get a receiver for engine events
    pub fn subscribe(&self) -> broadcast::Receiver<EngineEvent> {
        self.event_sender.subscribe()
    }

    /// Get current session ID
    pub async fn get_session_id(&self) -> Option<String> {
        self.session_id.read().await.clone()
    }

    /// Set session ID (after successful execution)
    pub async fn set_session_id(&self, id: Option<String>) {
        *self.session_id.write().await = id;
    }

    /// Build the Claude CLI command
    fn build_command(&self, params: &SendMessageParams, has_images: bool) -> Command {
        // Resolve the binary path using find_cli_binary (handles extended PATH on Windows)
        let resolved = if let Some(ref custom) = self.bin_path {
            if !custom.trim().is_empty() {
                custom.clone()
            } else {
                find_cli_binary("claude", None)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "claude".to_string())
            }
        } else {
            find_cli_binary("claude", None)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "claude".to_string())
        };

        // On Windows, .cmd/.bat files must be run through cmd.exe
        #[cfg(windows)]
        let mut cmd = {
            let bin_lower = resolved.to_lowercase();
            if bin_lower.ends_with(".cmd") || bin_lower.ends_with(".bat") {
                let mut c = Command::new("cmd");
                c.arg("/c");
                c.arg(&resolved);
                c
            } else {
                Command::new(&resolved)
            }
        };
        #[cfg(not(windows))]
        let mut cmd = Command::new(&resolved);

        // Set extended PATH so child process can find node, etc.
        if let Some(path_env) = build_codex_path_env(self.bin_path.as_deref()) {
            cmd.env("PATH", path_env);
        }

        // Set working directory
        cmd.current_dir(&self.workspace_path);

        // Print mode (non-interactive)
        cmd.arg("-p");

        if has_images {
            // When images are present, use stream-json input format
            // The actual content will be sent via stdin
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
        // When "full-access" mode is selected, bypass permission checks
        // This is necessary because -p (print mode) cannot handle interactive permission requests
        match params.access_mode.as_deref() {
            Some("full-access") => {
                // Full access: bypass all permission checks
                cmd.arg("--dangerously-skip-permissions");
            }
            Some("read-only") => {
                // Read-only mode: only allow planning, no execution
                cmd.arg("--permission-mode");
                cmd.arg("plan");
            }
            _ => {
                // "current" mode (default): auto-accept edits but still prompt for dangerous ops
                // Since -p mode cannot handle interactive prompts, we use acceptEdits to allow
                // common operations like file edits while maintaining some safety for shell commands
                cmd.arg("--permission-mode");
                cmd.arg("acceptEdits");
            }
        }

        // Model selection
        if let Some(ref model) = params.model {
            cmd.arg("--model");
            cmd.arg(model);
        }

        // Session continuation
        if params.continue_session {
            if let Some(ref session_id) = params.session_id {
                cmd.arg("--resume");
                cmd.arg(session_id);
            } else {
                cmd.arg("--continue");
            }
        }

        // Custom arguments
        if let Some(ref args) = self.custom_args {
            for arg in args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // Set up stdio
        if has_images {
            cmd.stdin(Stdio::piped()); // Enable stdin for image data
        } else {
            cmd.stdin(Stdio::null());
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Environment
        if let Some(ref home) = self.home_dir {
            cmd.env("CLAUDE_HOME", home);
        }

        cmd
    }

    /// Send a message and stream the response
    pub async fn send_message(&self, params: SendMessageParams, turn_id: &str) -> Result<String, String> {
        // Detect if there are images
        let has_images = params.images.as_ref().map_or(false, |imgs| {
            imgs.iter().any(|s| !s.trim().is_empty())
        });

        let mut cmd = self.build_command(&params, has_images);

        // Spawn the process
        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude: {}", e))?;

        // If there are images, write the message content to stdin
        if has_images {
            if let Some(mut stdin) = child.stdin.take() {
                let message = build_message_content(&params)?;
                let message_str = serde_json::to_string(&message)
                    .map_err(|e| format!("Failed to serialize message: {}", e))?;

                stdin.write_all(message_str.as_bytes()).await
                    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
                stdin.write_all(b"\n").await
                    .map_err(|e| format!("Failed to write newline: {}", e))?;
                // Drop stdin to signal EOF
                drop(stdin);
            }
        }

        // Store the process handle for potential interruption
        {
            let mut active = self.active_process.lock().await;
            *active = None; // Clear any previous
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture stdout".to_string())?;

        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture stderr".to_string())?;

        // Store child for interruption
        {
            let mut active = self.active_process.lock().await;
            *active = Some(child);
        }

        // Emit session started event
        let _ = self.event_sender.send(EngineEvent::SessionStarted {
            workspace_id: self.workspace_id.clone(),
            session_id: "pending".to_string(),
            engine: EngineType::Claude,
        });

        // Emit turn started event
        let _ = self.event_sender.send(EngineEvent::TurnStarted {
            workspace_id: self.workspace_id.clone(),
            turn_id: turn_id.to_string(),
        });

        // Read stdout line by line
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut response_text = String::new();
        let mut saw_text_delta = false;
        let mut new_session_id: Option<String> = None;
        let mut error_output = String::new();

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

            match serde_json::from_str::<Value>(&line) {
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
                                        let _ = self.event_sender.send(EngineEvent::TextDelta {
                                            workspace_id: self.workspace_id.clone(),
                                            text,
                                        });
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
                            let _ = self.event_sender.send(EngineEvent::SessionStarted {
                                workspace_id: self.workspace_id.clone(),
                                session_id: sid.to_string(),
                                engine: EngineType::Claude,
                            });
                        }
                    }

                    // Convert and emit event
                    if let Some(unified_event) = self.convert_event(&event) {
                        // Collect text for final response
                        if let EngineEvent::TextDelta { ref text, .. } = unified_event {
                            response_text.push_str(text);
                            saw_text_delta = true;
                        }

                        let _ = self.event_sender.send(unified_event);
                    }
                }
                Err(_e) => {
                    // Non-JSON output, might be error
                    error_output.push_str(&line);
                    error_output.push('\n');
                }
            }
        }

        // Wait for process to complete
        let status = {
            let mut active = self.active_process.lock().await;
            if let Some(mut child) = active.take() {
                child.wait().await.ok()
            } else {
                None
            }
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

        // Check for errors
        if let Some(status) = status {
            if !status.success() && response_text.is_empty() {
                let error_msg = if !error_output.is_empty() {
                    error_output.trim().to_string()
                } else {
                    format!("Claude exited with status: {}", status)
                };

                let _ = self.event_sender.send(EngineEvent::TurnError {
                    workspace_id: self.workspace_id.clone(),
                    error: error_msg.clone(),
                    code: None,
                });

                return Err(error_msg);
            }
        }

        // Emit turn completed
        let _ = self.event_sender.send(EngineEvent::TurnCompleted {
            workspace_id: self.workspace_id.clone(),
            result: Some(serde_json::json!({
                "text": response_text,
            })),
        });

        Ok(response_text)
    }

    /// Interrupt the current operation
    pub async fn interrupt(&self) -> Result<(), String> {
        let mut active = self.active_process.lock().await;
        if let Some(ref mut child) = *active {
            child
                .kill()
                .await
                .map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        Ok(())
    }

    /// Convert Claude event to unified format
    /// Handles Claude CLI 2.0.52+ event format: system, assistant, result, error
    fn convert_event(&self, event: &Value) -> Option<EngineEvent> {
        // Debug: print the full event JSON
        log::debug!("[claude] Received event: {}", serde_json::to_string_pretty(event).unwrap_or_else(|_| event.to_string()));

        // Check for context_window field in ANY event (Claude statusline/hooks)
        // This provides the most accurate context usage snapshot
        self.try_extract_context_window_usage(event);

        let event_type = event.get("type")?.as_str()?;

        match event_type {
            // Legacy stream_event format (kept for backward compatibility)
            "stream_event" => self.convert_stream_event(event),

            // Claude CLI 2.0.52+ format: system init event
            "system" => {
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
                None
            }

            // Claude CLI 2.0.52+ format: assistant message event
            "assistant" => {
                // Extract text content from the message
                if let Some(message) = event.get("message") {
                    if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                        for block in content {
                            let block_type = block.get("type").and_then(|t| t.as_str());
                            match block_type {
                                Some("text") => {
                                    if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                        return Some(EngineEvent::TextDelta {
                                            workspace_id: self.workspace_id.clone(),
                                            text: text.to_string(),
                                        });
                                    }
                                }
                                Some("tool_use") => {
                                    let tool_name = block
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or("unknown");
                                    let tool_id = block
                                        .get("id")
                                        .and_then(|i| i.as_str())
                                        .unwrap_or("unknown");
                                    let input = block.get("input").cloned();

                                    self.cache_tool_name(tool_id, tool_name);
                                    return Some(EngineEvent::ToolStarted {
                                        workspace_id: self.workspace_id.clone(),
                                        tool_id: tool_id.to_string(),
                                        tool_name: tool_name.to_string(),
                                        input,
                                    });
                                }
                                Some("tool_result") => {
                                    let tool_id = block
                                        .get("tool_use_id")
                                        .or_else(|| block.get("toolUseId"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    let content = block.get("content");
                                    let is_error = block
                                        .get("is_error")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    let output = content.and_then(extract_tool_result_text);
                                    return self.build_tool_completed(tool_id, output, is_error);
                                }
                                Some("thinking") => {
                                    if let Some(text) = block.get("thinking").and_then(|t| t.as_str()) {
                                        return Some(EngineEvent::ReasoningDelta {
                                            workspace_id: self.workspace_id.clone(),
                                            text: text.to_string(),
                                        });
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                None
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

    /// Try to extract context window usage from any event
    /// Claude CLI may provide usage data in multiple locations:
    /// 1. context_window.current_usage (statusline/hooks - most accurate)
    /// 2. message.usage (assistant events)
    /// 3. usage (top-level usage field)
    fn try_extract_context_window_usage(&self, event: &Value) {
        // Try to find usage data from multiple sources
        let (usage, model_context_window) = self.find_usage_data(event);

        if let Some(usage) = usage {
            // Extract token counts
            let input_tokens = usage
                .get("input_tokens")
                .or_else(|| usage.get("inputTokens"))
                .and_then(|v| v.as_i64());

            let output_tokens = usage
                .get("output_tokens")
                .or_else(|| usage.get("outputTokens"))
                .and_then(|v| v.as_i64());

            // Claude provides separate cache_creation and cache_read tokens
            // Sum them for the total cached tokens (both occupy context window)
            let cache_creation = usage
                .get("cache_creation_input_tokens")
                .or_else(|| usage.get("cacheCreationInputTokens"))
                .or_else(|| usage.get("cache_creation_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let cache_read = usage
                .get("cache_read_input_tokens")
                .or_else(|| usage.get("cacheReadInputTokens"))
                .or_else(|| usage.get("cache_read_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let cached_tokens = if cache_creation > 0 || cache_read > 0 {
                Some(cache_creation + cache_read)
            } else {
                None
            };

            // Only emit if we have at least input_tokens
            if input_tokens.is_some() {
                log::debug!(
                    "[claude] Emitting UsageUpdate: input={:?}, output={:?}, cached={:?}, window={:?}",
                    input_tokens, output_tokens, cached_tokens, model_context_window
                );
                let _ = self.event_sender.send(EngineEvent::UsageUpdate {
                    workspace_id: self.workspace_id.clone(),
                    input_tokens,
                    output_tokens,
                    cached_tokens,
                    model_context_window,
                });
            }
        }
    }

    /// Find usage data from various locations in the event
    /// Returns (usage_data, model_context_window)
    fn find_usage_data<'a>(&self, event: &'a Value) -> (Option<&'a Value>, Option<i64>) {
        // 1. First priority: context_window.current_usage (most accurate snapshot)
        if let Some(context_window) = event.get("context_window") {
            log::debug!("[claude] Found context_window field: {}",
                serde_json::to_string_pretty(context_window).unwrap_or_else(|_| context_window.to_string()));

            let model_context_window = context_window
                .get("context_window_size")
                .or_else(|| context_window.get("contextWindowSize"))
                .and_then(|v| v.as_i64());

            if let Some(current_usage) = context_window
                .get("current_usage")
                .or_else(|| context_window.get("currentUsage"))
            {
                return (Some(current_usage), model_context_window);
            }
        }

        // 2. Second priority: message.usage (assistant events)
        if let Some(message) = event.get("message") {
            if let Some(usage) = message.get("usage") {
                log::debug!("[claude] Found message.usage field: {}",
                    serde_json::to_string_pretty(usage).unwrap_or_else(|_| usage.to_string()));
                return (Some(usage), None);
            }
        }

        // 3. Third priority: top-level usage field
        if let Some(usage) = event.get("usage") {
            log::debug!("[claude] Found top-level usage field: {}",
                serde_json::to_string_pretty(usage).unwrap_or_else(|_| usage.to_string()));
            return (Some(usage), None);
        }

        log::debug!("[claude] No usage data found in event type: {:?}",
            event.get("type").and_then(|v| v.as_str()));
        (None, None)
    }

    /// Convert stream_event type
    fn convert_stream_event(&self, event: &Value) -> Option<EngineEvent> {
        let inner = event.get("event")?;
        let inner_type = inner.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if inner_type == "content_block_start" {
            if let Some(block) = inner.get("content_block") {
                let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match block_type {
                    "tool_use" => {
                        let tool_name = block
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown");
                        let tool_id = block
                            .get("id")
                            .and_then(|i| i.as_str())
                            .unwrap_or("unknown");
                        let input = block.get("input").cloned();
                        if let Some(index) = inner.get("index").and_then(|v| v.as_i64()) {
                            self.cache_tool_block_index(index, tool_id);
                        }

                        self.cache_tool_name(tool_id, tool_name);
                        return Some(EngineEvent::ToolStarted {
                            workspace_id: self.workspace_id.clone(),
                            tool_id: tool_id.to_string(),
                            tool_name: tool_name.to_string(),
                            input,
                        });
                    }
                    "tool_result" => {
                        let tool_id = block
                            .get("tool_use_id")
                            .or_else(|| block.get("toolUseId"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let content = block.get("content");
                        let is_error = block
                            .get("is_error")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let output = content.and_then(extract_tool_result_text);
                        if let Some(event) =
                            self.build_tool_completed(tool_id, output, is_error)
                        {
                            self.clear_tool_block_index(inner.get("index").and_then(|v| v.as_i64()));
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
                if let Some(tool_id) = self.tool_id_for_block_index(index) {
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
                Some(EngineEvent::TextDelta {
                    workspace_id: self.workspace_id.clone(),
                    text: text.to_string(),
                })
            }
            "thinking_delta" => {
                let text = delta?.get("thinking")?.as_str()?;
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
                let tool_id = delta
                    .and_then(|d| d.get("id"))
                    .or_else(|| inner.get("id"))
                    .and_then(|i| i.as_str())
                    .unwrap_or("unknown");
                let input = delta
                    .and_then(|d| d.get("input"))
                    .cloned()
                    .or_else(|| inner.get("input").cloned());

                if let Some(index) = inner.get("index").and_then(|v| v.as_i64()) {
                    self.cache_tool_block_index(index, tool_id);
                }
                self.cache_tool_name(tool_id, tool_name);
                Some(EngineEvent::ToolStarted {
                    workspace_id: self.workspace_id.clone(),
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    input,
                })
            }
            "tool_result" => {
                let tool_id = delta
                    .and_then(|d| d.get("tool_use_id"))
                    .or_else(|| delta.and_then(|d| d.get("toolUseId")))
                    .or_else(|| inner.get("tool_use_id"))
                    .or_else(|| inner.get("toolUseId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let content = delta
                    .and_then(|d| d.get("content"))
                    .or_else(|| inner.get("content"));
                let is_error = delta
                    .and_then(|d| d.get("is_error"))
                    .or_else(|| inner.get("is_error"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let output = content.and_then(extract_tool_result_text);
                let result = self.build_tool_completed(tool_id, output, is_error);
                self.clear_tool_block_index(inner.get("index").and_then(|v| v.as_i64()));
                result
            }
            _ => None,
        }
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

    fn cache_tool_block_index(&self, index: i64, tool_id: &str) {
        if tool_id.is_empty() {
            return;
        }
        if let Ok(mut map) = self.tool_id_by_block_index.lock() {
            map.insert(index, tool_id.to_string());
        }
    }

    fn tool_id_for_block_index(&self, index: Option<i64>) -> Option<String> {
        let index = index?;
        self.tool_id_by_block_index
            .lock()
            .ok()
            .and_then(|map| map.get(&index).cloned())
    }

    fn clear_tool_block_index(&self, index: Option<i64>) {
        if let Some(index) = index {
            if let Ok(mut map) = self.tool_id_by_block_index.lock() {
                map.remove(&index);
            }
        }
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

    fn clear_tool_input(&self, tool_id: &str) {
        if tool_id.is_empty() {
            return;
        }
        if let Ok(mut map) = self.tool_input_by_id.lock() {
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
        self.clear_tool_input(tool_id);
        let error = if is_error {
            output.clone().filter(|text| !text.trim().is_empty())
        } else {
            None
        };
        let output = if is_error {
            None
        } else {
            output.map(Value::String)
        };
        Some(EngineEvent::ToolCompleted {
            workspace_id: self.workspace_id.clone(),
            tool_id: tool_id.to_string(),
            tool_name,
            output,
            error,
        })
    }
}

fn extract_tool_result_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
        return None;
    }
    if let Some(obj) = value.as_object() {
        if obj
            .get("type")
            .and_then(|t| t.as_str())
            .map(|t| t == "text")
            .unwrap_or(false)
        {
            if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    if let Some(arr) = value.as_array() {
        let parts: Vec<String> = arr
            .iter()
            .filter_map(|item| {
                let kind = item.get("type").and_then(|t| t.as_str());
                if kind == Some("text") {
                    item.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            })
            .filter(|text| !text.trim().is_empty())
            .collect();
        if !parts.is_empty() {
            return Some(parts.join("\n"));
        }
    }
    None
}

fn extract_text_from_content(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
        return None;
    }
    if let Some(obj) = value.as_object() {
        if obj
            .get("type")
            .and_then(|t| t.as_str())
            .map(|t| t == "text")
            .unwrap_or(false)
        {
            if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    if let Some(arr) = value.as_array() {
        let parts: Vec<String> = arr
            .iter()
            .filter_map(|item| {
                let kind = item.get("type").and_then(|t| t.as_str());
                if kind == Some("text") {
                    item.get("text")
                        .and_then(|t| t.as_str())
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                } else {
                    None
                }
            })
            .collect();
        if !parts.is_empty() {
            return Some(parts.join("\n"));
        }
    }
    None
}

fn extract_result_text(event: &Value) -> Option<String> {
    let content = event
        .get("message")
        .and_then(|m| m.get("content"))
        .or_else(|| event.get("content"))
        .or_else(|| {
            event
                .get("result")
                .and_then(|r| r.get("message"))
                .and_then(|m| m.get("content"))
        })
        .or_else(|| event.get("result").and_then(|r| r.get("content")));
    content.and_then(extract_text_from_content)
}

/// Build message content with images for stream-json input
fn build_message_content(params: &SendMessageParams) -> Result<Value, String> {
    let mut content = Vec::new();

    // Process images
    if let Some(ref images) = params.images {
        for image_path in images {
            let trimmed = image_path.trim();
            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with("data:") {
                // Base64 data URL format: data:image/png;base64,<data>
                let parts: Vec<&str> = trimmed.splitn(2, ',').collect();
                if parts.len() == 2 {
                    let media_type = parts[0]
                        .strip_prefix("data:")
                        .and_then(|s| s.strip_suffix(";base64"))
                        .unwrap_or("image/png");
                    content.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": parts[1]
                        }
                    }));
                }
            } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                // URL image
                content.push(json!({
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": trimmed
                    }
                }));
            } else {
                // Local file path - read and convert to base64
                let path = std::path::Path::new(trimmed);
                if let Ok(data) = std::fs::read(path) {
                    let base64_data = STANDARD.encode(&data);
                    let media_type = match path.extension().and_then(|e| e.to_str()) {
                        Some("png") => "image/png",
                        Some("jpg") | Some("jpeg") => "image/jpeg",
                        Some("gif") => "image/gif",
                        Some("webp") => "image/webp",
                        _ => "image/png",
                    };
                    content.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64_data
                        }
                    }));
                }
            }
        }
    }

    // Add text content
    if !params.text.trim().is_empty() {
        content.push(json!({
            "type": "text",
            "text": params.text.trim()
        }));
    }

    // Claude CLI stream-json format requires:
    // {"type":"user","message":{"role":"user","content":[...]}}
    Ok(json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": content
        }
    }))
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
}

impl Default for ClaudeSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
