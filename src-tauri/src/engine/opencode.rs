//! OpenCode engine implementation
//!
//! Handles OpenCode CLI execution via `opencode run --format json`.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio::time::{sleep, timeout, Instant};

use super::events::EngineEvent;
use super::{EngineConfig, EngineType, SendMessageParams};

const OPENCODE_OPENAI_IDLE_TIMEOUT: Duration = Duration::from_secs(300);
const OPENCODE_POST_RESPONSE_IDLE_TIMEOUT: Duration = Duration::from_secs(15);
const OPENCODE_TOTAL_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const OPENCODE_PREFLIGHT_TIMEOUT: Duration = Duration::from_secs(3);
const OPENCODE_IO_POLL_INTERVAL: Duration = Duration::from_secs(5);
const OPENCODE_SYNTHETIC_STREAM_DELAY: Duration = Duration::from_millis(24);
const OPENCODE_SYNTHETIC_STREAM_MIN_CHARS: usize = 180;

#[derive(Debug, Clone)]
pub struct OpenCodeTurnEvent {
    pub turn_id: String,
    pub event: EngineEvent,
}

/// OpenCode session for a workspace
pub struct OpenCodeSession {
    pub workspace_id: String,
    pub workspace_path: PathBuf,
    session_id: RwLock<Option<String>>,
    event_sender: broadcast::Sender<OpenCodeTurnEvent>,
    bin_path: Option<String>,
    home_dir: Option<String>,
    custom_args: Option<String>,
    active_processes: Mutex<HashMap<String, Child>>,
    session_model_hints: Mutex<HashMap<String, String>>,
    interrupted: AtomicBool,
}

impl OpenCodeSession {
    fn with_external_spec_hint(text: &str, custom_spec_root: Option<&str>) -> String {
        let Some(spec_root) = custom_spec_root
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return text.to_string();
        };
        if !Path::new(spec_root).is_absolute() {
            return text.to_string();
        }
        format!(
            "[External OpenSpec Root]\n- Path: {spec_root}\n- Treat this as the active spec root when checking or reading project specs.\n[/External OpenSpec Root]\n\n{text}"
        )
    }

    fn has_proxy_env() -> bool {
        std::env::var("HTTPS_PROXY")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .is_some()
            || std::env::var("https_proxy")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .is_some()
            || std::env::var("HTTP_PROXY")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .is_some()
            || std::env::var("http_proxy")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .is_some()
            || std::env::var("ALL_PROXY")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .is_some()
            || std::env::var("all_proxy")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .is_some()
    }

    fn requires_openai_connectivity_probe(_model: Option<&str>) -> bool {
        // Unified policy: apply the same preflight/timeout behavior to all OpenCode models.
        true
    }

    async fn run_connectivity_preflight(model: Option<&str>) -> Result<(), String> {
        // Direct TCP probe is not reliable in proxy networks; let CLI handle connectivity.
        if Self::has_proxy_env() {
            return Ok(());
        }
        if !Self::requires_openai_connectivity_probe(model) {
            return Ok(());
        }
        match timeout(OPENCODE_PREFLIGHT_TIMEOUT, TcpStream::connect(("api.openai.com", 443))).await
        {
            Ok(Ok(_)) => Ok(()),
            Ok(Err(err)) => Err(format!(
                "Error: Unable to connect. Is the computer able to access the url? ({})",
                err
            )),
            Err(_) => Err(
                "Error: Unable to connect. Is the computer able to access the url? (preflight timeout)"
                    .to_string(),
            ),
        }
    }

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
            session_model_hints: Mutex::new(HashMap::new()),
            interrupted: AtomicBool::new(false),
        }
    }

    fn normalize_model_key(model: Option<&str>) -> Option<String> {
        let value = model?.trim();
        if value.is_empty() {
            return None;
        }
        Some(value.to_lowercase())
    }

    fn idle_timeout_for_model(_model: Option<&str>) -> Duration {
        // Unified policy: all models use the longer timeout window.
        OPENCODE_OPENAI_IDLE_TIMEOUT
    }

    pub fn subscribe(&self) -> broadcast::Receiver<OpenCodeTurnEvent> {
        self.event_sender.subscribe()
    }

    pub async fn get_session_id(&self) -> Option<String> {
        self.session_id.read().await.clone()
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

    async fn set_session_id(&self, id: Option<String>) {
        *self.session_id.write().await = id;
    }

    fn emit_turn_event(&self, turn_id: &str, event: EngineEvent) {
        let _ = self.event_sender.send(OpenCodeTurnEvent {
            turn_id: turn_id.to_string(),
            event,
        });
    }

    fn build_command(&self, params: &SendMessageParams) -> Command {
        let bin = if let Some(ref custom) = self.bin_path {
            custom.clone()
        } else {
            crate::backend::app_server::find_cli_binary("opencode", None)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "opencode".to_string())
        };

        let mut cmd = crate::backend::app_server::build_command_for_binary(&bin);
        cmd.current_dir(&self.workspace_path);
        cmd.arg("run");
        cmd.arg("--format");
        cmd.arg("json");

        if let Some(ref model) = params.model {
            cmd.arg("--model");
            cmd.arg(model);
        }
        if let Some(ref agent) = params.agent {
            cmd.arg("--agent");
            cmd.arg(agent);
        }
        if let Some(ref variant) = params.variant {
            cmd.arg("--variant");
            cmd.arg(variant);
        }

        if params.continue_session {
            if let Some(ref sid) = params.session_id {
                cmd.arg("--session");
                cmd.arg(sid);
            } else {
                cmd.arg("--continue");
            }
        }

        if let Some(ref args) = self.custom_args {
            for arg in args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // OpenCode 1.1.62 has a CLI regression with `-- <message>` in `run` mode:
        // it can crash with `arg.includes is not a function`.
        // Keep message positional and apply a safe leading space for dash-prefixed text.
        let message_text =
            Self::with_external_spec_hint(&params.text, params.custom_spec_root.as_deref());
        let safe_text = if message_text.starts_with('-') {
            format!(" {}", message_text)
        } else {
            message_text
        };
        cmd.arg(safe_text);

        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        if let Some(ref home) = self.home_dir {
            cmd.env("OPENCODE_HOME", home);
        }

        cmd
    }

    pub async fn send_message(
        &self,
        params: SendMessageParams,
        turn_id: &str,
    ) -> Result<String, String> {
        let mut effective_params = params;
        let requested_model_key = Self::normalize_model_key(effective_params.model.as_deref());
        if effective_params.continue_session {
            if let (Some(session_id), Some(model_key)) = (
                effective_params.session_id.as_deref(),
                requested_model_key.as_deref(),
            ) {
                let known_model_for_session = {
                    let hints = self.session_model_hints.lock().await;
                    hints.get(session_id).cloned()
                };
                if let Some(known) = known_model_for_session {
                    if known != *model_key {
                        log::info!(
                            "OpenCode model switched for session {} ({} -> {}), forcing new session",
                            session_id,
                            known,
                            model_key
                        );
                        effective_params.continue_session = false;
                        effective_params.session_id = None;
                    }
                }
            }
        }

        if let Err(preflight_error) =
            Self::run_connectivity_preflight(effective_params.model.as_deref()).await
        {
            // Keep preflight advisory only. Blocking here can cause false negatives
            // in constrained or transient network environments.
            log::warn!(
                "OpenCode connectivity preflight warning: {}",
                preflight_error
            );
        }

        let mut cmd = self.build_command(&effective_params);
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn opencode: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture stderr".to_string())?;

        {
            let mut active = self.active_processes.lock().await;
            active.insert(turn_id.to_string(), child);
        }

        self.emit_turn_event(
            turn_id,
            EngineEvent::SessionStarted {
                workspace_id: self.workspace_id.clone(),
                session_id: "pending".to_string(),
                engine: EngineType::OpenCode,
            },
        );
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnStarted {
                workspace_id: self.workspace_id.clone(),
                turn_id: turn_id.to_string(),
            },
        );

        let stderr_reader = BufReader::new(stderr);
        let last_io_activity = Arc::new(Mutex::new(Instant::now()));
        let stderr_activity = Arc::clone(&last_io_activity);
        let stderr_task = tokio::spawn(async move {
            let mut lines = stderr_reader.lines();
            let mut text = String::new();
            while let Ok(Some(line)) = lines.next_line().await {
                {
                    let mut last = stderr_activity.lock().await;
                    *last = Instant::now();
                }
                text.push_str(&line);
                text.push('\n');
            }
            text
        });

        let mut response_text = String::new();
        let mut saw_turn_completed = false;
        let mut error_output = String::new();
        let mut new_session_id: Option<String> = None;
        let mut session_id_emitted = false;
        let mut timed_out = false;
        let mut quiesced_without_terminal = false;
        let mut active_tool_calls: i32 = 0;
        let mut text_delta_count: usize = 0;
        let mut heartbeat_pulse: u64 = 0;
        let started_at = Instant::now();
        let model_idle_timeout = Self::idle_timeout_for_model(effective_params.model.as_deref());

        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        loop {
            if started_at.elapsed() >= OPENCODE_TOTAL_TIMEOUT {
                timed_out = true;
                error_output.push_str(&format!(
                    "OpenCode timed out after {}s with no terminal event.\n",
                    OPENCODE_TOTAL_TIMEOUT.as_secs()
                ));
                break;
            }

            let idle_timeout =
                if !saw_turn_completed && !response_text.is_empty() && active_tool_calls <= 0 {
                    OPENCODE_POST_RESPONSE_IDLE_TIMEOUT
                } else {
                    model_idle_timeout
                };
            let next_line = timeout(OPENCODE_IO_POLL_INTERVAL, lines.next_line()).await;
            let line = match next_line {
                Ok(Ok(Some(line))) => line,
                Ok(Ok(None)) => break,
                Ok(Err(err)) => {
                    error_output.push_str(&format!("Failed reading OpenCode output: {}\n", err));
                    break;
                }
                Err(_) => {
                    let inactivity = {
                        let last = *last_io_activity.lock().await;
                        last.elapsed()
                    };
                    if inactivity < idle_timeout {
                        if response_text.is_empty() && !saw_turn_completed {
                            heartbeat_pulse += 1;
                            self.emit_turn_event(
                                turn_id,
                                EngineEvent::ProcessingHeartbeat {
                                    workspace_id: self.workspace_id.clone(),
                                    pulse: heartbeat_pulse,
                                },
                            );
                        }
                        continue;
                    }
                    if !response_text.is_empty() && !saw_turn_completed && active_tool_calls <= 0 {
                        quiesced_without_terminal = true;
                        break;
                    }
                    timed_out = true;
                    error_output.push_str(&format!(
                        "OpenCode output idle timeout ({}s). No stdout/stderr activity; activeToolCalls={}, sawTurnCompleted={}, responseChars={}.\n",
                        idle_timeout.as_secs(),
                        active_tool_calls,
                        saw_turn_completed,
                        response_text.len()
                    ));
                    break;
                }
            };

            {
                let mut last = last_io_activity.lock().await;
                *last = Instant::now();
            }
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<Value>(&line) {
                Ok(event) => {
                    if let Some(sid) = extract_session_id(&event) {
                        if !session_id_emitted {
                            new_session_id = Some(sid.clone());
                            session_id_emitted = true;
                            self.emit_turn_event(
                                turn_id,
                                EngineEvent::SessionStarted {
                                    workspace_id: self.workspace_id.clone(),
                                    session_id: sid,
                                    engine: EngineType::OpenCode,
                                },
                            );
                        }
                    }

                    if let Some(unified_event) = parse_opencode_event(&self.workspace_id, &event) {
                        if matches!(unified_event, EngineEvent::ToolStarted { .. }) {
                            active_tool_calls += 1;
                        }
                        if matches!(unified_event, EngineEvent::ToolCompleted { .. }) {
                            active_tool_calls = (active_tool_calls - 1).max(0);
                        }
                        if let EngineEvent::TextDelta { workspace_id, text } = &unified_event {
                            let chunks = if text_delta_count == 0 {
                                split_text_for_progressive_stream(text)
                            } else {
                                vec![text.clone()]
                            };
                            for (index, chunk) in chunks.into_iter().enumerate() {
                                response_text.push_str(&chunk);
                                text_delta_count += 1;
                                self.emit_turn_event(
                                    turn_id,
                                    EngineEvent::TextDelta {
                                        workspace_id: workspace_id.clone(),
                                        text: chunk,
                                    },
                                );
                                if index > 0 {
                                    sleep(OPENCODE_SYNTHETIC_STREAM_DELAY).await;
                                }
                            }
                            continue;
                        }
                        if matches!(unified_event, EngineEvent::TurnCompleted { .. }) {
                            saw_turn_completed = true;
                        }
                        self.emit_turn_event(turn_id, unified_event);
                    }
                }
                Err(_) => {
                    error_output.push_str(&line);
                    error_output.push('\n');
                }
            }
        }

        let mut child = {
            let mut active = self.active_processes.lock().await;
            active.remove(turn_id)
        };

        if timed_out || quiesced_without_terminal {
            if let Some(child_proc) = child.as_mut() {
                let _ = child_proc.kill().await;
            }
        }

        let status = if let Some(mut child_proc) = child.take() {
            child_proc.wait().await.ok()
        } else {
            None
        };

        let stderr_text = stderr_task.await.unwrap_or_default();
        if !stderr_text.trim().is_empty() {
            error_output.push_str(&stderr_text);
        }

        if let Some(status) = status {
            if !status.success() && !quiesced_without_terminal {
                let error_msg = if self.interrupted.swap(false, Ordering::SeqCst) {
                    "Session stopped.".to_string()
                } else if !error_output.trim().is_empty() {
                    error_output.trim().to_string()
                } else {
                    format!("OpenCode exited with status: {}", status)
                };
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
        } else if self.interrupted.swap(false, Ordering::SeqCst) && !quiesced_without_terminal {
            let error_msg = "Session stopped.".to_string();
            self.emit_error(turn_id, error_msg.clone());
            return Err(error_msg);
        }

        if let Some(ref sid) = new_session_id {
            self.set_session_id(Some(sid.clone())).await;
        }

        if let Some(model_key) = requested_model_key {
            let mut hints = self.session_model_hints.lock().await;
            if let Some(new_sid) = new_session_id.as_ref() {
                hints.insert(new_sid.clone(), model_key.clone());
            } else if let Some(existing_sid) = effective_params.session_id.as_ref() {
                hints.insert(existing_sid.clone(), model_key.clone());
            }
        }

        if !saw_turn_completed {
            self.emit_turn_event(
                turn_id,
                EngineEvent::TurnCompleted {
                    workspace_id: self.workspace_id.clone(),
                    result: Some(json!({
                        "text": response_text,
                    })),
                },
            );
        }

        Ok(response_text)
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        self.interrupted.store(true, Ordering::SeqCst);
        let mut active = self.active_processes.lock().await;
        for child in active.values_mut() {
            child
                .kill()
                .await
                .map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        active.clear();
        Ok(())
    }
}

fn extract_session_id(event: &Value) -> Option<String> {
    fn find_session_id(node: &Value) -> Option<String> {
        match node {
            Value::Object(map) => {
                for key in ["session_id", "sessionId", "sessionID"] {
                    if let Some(raw) = map.get(key).and_then(|value| value.as_str()) {
                        let trimmed = raw.trim();
                        if !trimmed.is_empty() && trimmed != "pending" {
                            return Some(trimmed.to_string());
                        }
                    }
                }
                for value in map.values() {
                    if let Some(found) = find_session_id(value) {
                        return Some(found);
                    }
                }
                None
            }
            Value::Array(items) => {
                for item in items {
                    if let Some(found) = find_session_id(item) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    find_session_id(event)
}

fn first_non_empty_str<'a>(candidates: &[Option<&'a str>]) -> Option<&'a str> {
    for value in candidates {
        if let Some(text) = value {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn extract_text_delta(event: &Value) -> Option<String> {
    let part = event.get("part");
    let text = first_non_empty_str(&[
        event.get("delta").and_then(|v| v.as_str()),
        event.get("text").and_then(|v| v.as_str()),
        part.and_then(|v| v.get("delta")).and_then(|v| v.as_str()),
        part.and_then(|v| v.get("text")).and_then(|v| v.as_str()),
        part.and_then(|v| v.get("content")).and_then(|v| v.as_str()),
    ])?;
    Some(text.to_string())
}

fn extract_text_from_message(event: &Value) -> Option<String> {
    let text = first_non_empty_str(&[
        event
            .get("message")
            .and_then(|v| v.get("text"))
            .and_then(|v| v.as_str()),
        event
            .get("message")
            .and_then(|v| v.get("content"))
            .and_then(|v| v.as_str()),
        event
            .get("output")
            .and_then(|v| v.get("text"))
            .and_then(|v| v.as_str()),
        event
            .get("result")
            .and_then(|v| v.get("text"))
            .and_then(|v| v.as_str()),
    ]);
    if let Some(text) = text {
        return Some(text.to_string());
    }

    let content_parts = event
        .get("message")
        .and_then(|v| v.get("content"))
        .and_then(|v| v.as_array());
    let mut merged = String::new();
    if let Some(parts) = content_parts {
        for part in parts {
            if let Some(segment) = first_non_empty_str(&[
                part.get("text").and_then(|v| v.as_str()),
                part.get("delta").and_then(|v| v.as_str()),
                part.get("content").and_then(|v| v.as_str()),
            ]) {
                merged.push_str(segment);
            }
        }
    }
    let merged = merged.trim();
    if merged.is_empty() {
        None
    } else {
        Some(merged.to_string())
    }
}

fn extract_text_from_nested_payload(event: &Value, depth: usize) -> Option<String> {
    if depth > 3 {
        return None;
    }
    if let Some(text) = extract_text_delta(event).or_else(|| extract_text_from_message(event)) {
        return Some(text);
    }
    for key in [
        "event", "payload", "data", "output", "result", "message", "part",
    ] {
        if let Some(nested) = event.get(key) {
            if let Some(text) = extract_text_from_nested_payload(nested, depth + 1) {
                return Some(text);
            }
        }
    }
    if let Some(items) = event.as_array() {
        for item in items {
            if let Some(text) = extract_text_from_nested_payload(item, depth + 1) {
                return Some(text);
            }
        }
    }
    None
}

fn split_text_for_progressive_stream(text: &str) -> Vec<String> {
    if text.chars().count() < OPENCODE_SYNTHETIC_STREAM_MIN_CHARS {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_len = 0usize;
    let soft_limit = 64usize;
    let hard_limit = 140usize;
    let break_chars = ['。', '！', '？', '.', '!', '?', '\n'];

    for ch in text.chars() {
        current.push(ch);
        current_len += 1;
        let should_break =
            (current_len >= soft_limit && break_chars.contains(&ch)) || current_len >= hard_limit;
        if should_break {
            chunks.push(current.clone());
            current.clear();
            current_len = 0;
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    if chunks.len() <= 1 {
        vec![text.to_string()]
    } else {
        chunks
    }
}

pub(crate) fn parse_opencode_event(workspace_id: &str, event: &Value) -> Option<EngineEvent> {
    let event_type = event.get("type").and_then(|v| v.as_str())?;
    match event_type {
        "text" => {
            let text = extract_text_delta(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "content_delta" => {
            let text = extract_text_delta(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "reasoning_delta" => {
            let text = extract_text_delta(event)?;
            Some(EngineEvent::ReasoningDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "text_delta" | "output_text_delta" | "assistant_message_delta" | "message_delta" => {
            let text = extract_text_delta(event).or_else(|| extract_text_from_message(event))?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "assistant_message" | "message" => {
            let text = extract_text_from_message(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "tool_use" => {
            let part = event.get("part");
            let state = part.and_then(|v| v.get("state"));
            let status = first_non_empty_str(&[
                event.get("status").and_then(|v| v.as_str()),
                state.and_then(|v| v.get("status")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("status")).and_then(|v| v.as_str()),
            ])
            .unwrap_or("started")
            .to_ascii_lowercase();
            let tool_name = first_non_empty_str(&[
                event.get("name").and_then(|v| v.as_str()),
                event.get("tool_name").and_then(|v| v.as_str()),
                part.and_then(|v| v.get("name")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("tool_name"))
                    .and_then(|v| v.as_str()),
                part.and_then(|v| v.get("tool")).and_then(|v| v.as_str()),
                state.and_then(|v| v.get("name")).and_then(|v| v.as_str()),
            ])
            .unwrap_or("unknown");
            let tool_id = first_non_empty_str(&[
                event.get("tool_id").and_then(|v| v.as_str()),
                event.get("id").and_then(|v| v.as_str()),
                part.and_then(|v| v.get("id")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("callID")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("callId")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("call_id")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("toolCallID"))
                    .and_then(|v| v.as_str()),
                state.and_then(|v| v.get("id")).and_then(|v| v.as_str()),
            ])
            .unwrap_or("tool-1");
            let input = event
                .get("input")
                .cloned()
                .or_else(|| part.and_then(|v| v.get("input")).cloned())
                .or_else(|| state.and_then(|v| v.get("input")).cloned());
            let raw_output = event
                .get("output")
                .or_else(|| event.get("result"))
                .cloned()
                .or_else(|| part.and_then(|v| v.get("output")).cloned())
                .or_else(|| state.and_then(|v| v.get("output")).cloned());
            let error = event
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    part.and_then(|v| v.get("error"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .or_else(|| {
                    state
                        .and_then(|v| v.get("error"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                });
            if status.contains("complete")
                || status.contains("success")
                || status.contains("done")
                || status.contains("fail")
                || status.contains("error")
                || status.contains("cancel")
                || status.contains("timeout")
            {
                let output = if input.is_some() {
                    Some(json!({
                        "_input": input,
                        "_output": raw_output,
                    }))
                } else {
                    raw_output
                };
                Some(EngineEvent::ToolCompleted {
                    workspace_id: workspace_id.to_string(),
                    tool_id: tool_id.to_string(),
                    tool_name: Some(tool_name.to_string()),
                    output,
                    error,
                })
            } else {
                Some(EngineEvent::ToolStarted {
                    workspace_id: workspace_id.to_string(),
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    input,
                })
            }
        }
        "tool_result" => {
            let part = event.get("part");
            let state = part.and_then(|v| v.get("state"));
            let tool_id = first_non_empty_str(&[
                event.get("tool_id").and_then(|v| v.as_str()),
                event.get("id").and_then(|v| v.as_str()),
                part.and_then(|v| v.get("id")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("callID")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("callId")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("call_id")).and_then(|v| v.as_str()),
                part.and_then(|v| v.get("toolCallID"))
                    .and_then(|v| v.as_str()),
                state.and_then(|v| v.get("id")).and_then(|v| v.as_str()),
            ])
            .unwrap_or("tool-1");
            let error = event
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    part.and_then(|v| v.get("error"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                });
            let output = event
                .get("output")
                .or_else(|| event.get("result"))
                .cloned()
                .or_else(|| part.and_then(|v| v.get("output")).cloned())
                .or_else(|| state.and_then(|v| v.get("output")).cloned());
            Some(EngineEvent::ToolCompleted {
                workspace_id: workspace_id.to_string(),
                tool_id: tool_id.to_string(),
                tool_name: first_non_empty_str(&[
                    event.get("name").and_then(|v| v.as_str()),
                    event.get("tool_name").and_then(|v| v.as_str()),
                    part.and_then(|v| v.get("name")).and_then(|v| v.as_str()),
                    state.and_then(|v| v.get("name")).and_then(|v| v.as_str()),
                ])
                .map(|s| s.to_string()),
                output,
                error,
            })
        }
        "step_finish" => {
            let reason = event
                .get("reason")
                .or_else(|| event.get("part").and_then(|v| v.get("reason")))
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            if matches!(reason, "stop" | "complete" | "completed" | "done") {
                return Some(EngineEvent::TurnCompleted {
                    workspace_id: workspace_id.to_string(),
                    result: Some(event.clone()),
                });
            }
            let input_tokens = event
                .get("part")
                .and_then(|v| v.get("tokens"))
                .and_then(|v| v.get("input"))
                .and_then(|v| v.as_i64());
            let output_tokens = event
                .get("part")
                .and_then(|v| v.get("tokens"))
                .and_then(|v| v.get("output"))
                .and_then(|v| v.as_i64());
            let cached_tokens = event
                .get("part")
                .and_then(|v| v.get("tokens"))
                .and_then(|v| v.get("cache"))
                .and_then(|v| v.get("read"))
                .and_then(|v| v.as_i64());

            if input_tokens.is_none() && output_tokens.is_none() && cached_tokens.is_none() {
                return None;
            }

            Some(EngineEvent::UsageUpdate {
                workspace_id: workspace_id.to_string(),
                input_tokens,
                output_tokens,
                cached_tokens,
                model_context_window: None,
            })
        }
        "turn_complete" | "turn_completed" | "turn_done" | "done" | "completed" => {
            Some(EngineEvent::TurnCompleted {
                workspace_id: workspace_id.to_string(),
                result: Some(event.clone()),
            })
        }
        "result" => {
            if event.get("result").is_some() || event.get("text").is_some() {
                Some(EngineEvent::TurnCompleted {
                    workspace_id: workspace_id.to_string(),
                    result: Some(event.clone()),
                })
            } else {
                Some(EngineEvent::Raw {
                    workspace_id: workspace_id.to_string(),
                    engine: EngineType::OpenCode,
                    data: event.clone(),
                })
            }
        }
        "error" => {
            let message = extract_opencode_error_message(event)
                .unwrap_or_else(|| "Unknown OpenCode error".to_string());
            let code = event
                .get("code")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            Some(EngineEvent::TurnError {
                workspace_id: workspace_id.to_string(),
                error: message,
                code,
            })
        }
        "usage" => Some(EngineEvent::UsageUpdate {
            workspace_id: workspace_id.to_string(),
            input_tokens: event
                .get("input_tokens")
                .or_else(|| event.get("inputTokens"))
                .and_then(|v| v.as_i64()),
            output_tokens: event
                .get("output_tokens")
                .or_else(|| event.get("outputTokens"))
                .and_then(|v| v.as_i64()),
            cached_tokens: event
                .get("cached_tokens")
                .or_else(|| event.get("cachedTokens"))
                .and_then(|v| v.as_i64()),
            model_context_window: event
                .get("model_context_window")
                .or_else(|| event.get("modelContextWindow"))
                .and_then(|v| v.as_i64()),
        }),
        _ => {
            if event_type.contains("turn") && event_type.contains("complete") {
                return Some(EngineEvent::TurnCompleted {
                    workspace_id: workspace_id.to_string(),
                    result: Some(event.clone()),
                });
            }
            let lower = event_type.to_ascii_lowercase();
            if (lower.contains("delta") || lower.contains("message") || lower.contains("text"))
                && !lower.contains("tool")
            {
                if let Some(text) =
                    extract_text_delta(event).or_else(|| extract_text_from_message(event))
                {
                    return Some(EngineEvent::TextDelta {
                        workspace_id: workspace_id.to_string(),
                        text,
                    });
                }
            }
            if !lower.contains("tool") {
                if let Some(text) = extract_text_from_nested_payload(event, 0) {
                    return Some(EngineEvent::TextDelta {
                        workspace_id: workspace_id.to_string(),
                        text,
                    });
                }
            }
            Some(EngineEvent::Raw {
                workspace_id: workspace_id.to_string(),
                engine: EngineType::OpenCode,
                data: event.clone(),
            })
        }
    }
}

fn extract_opencode_error_message(event: &Value) -> Option<String> {
    let nested_error = event.get("error");
    let message = nested_error
        .and_then(|v| v.as_str())
        .or_else(|| event.get("message").and_then(|v| v.as_str()))
        .or_else(|| {
            nested_error.and_then(|err| {
                err.get("message").and_then(|v| v.as_str()).or_else(|| {
                    err.get("data")
                        .and_then(|data| data.get("message"))
                        .and_then(|v| v.as_str())
                })
            })
        })
        .map(str::trim)
        .filter(|text| !text.is_empty())?;
    Some(message.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_command_contains_required_flags() {
        let session = OpenCodeSession::new(
            "ws-1".to_string(),
            PathBuf::from("/tmp"),
            Some(EngineConfig::default()),
        );
        let mut params = SendMessageParams::default();
        params.text = "hello".to_string();
        params.model = Some("openai/gpt-5.3-codex".to_string());

        let command = session.build_command(&params);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(args.contains(&"run".to_string()));
        assert!(args.contains(&"--format".to_string()));
        assert!(args.contains(&"json".to_string()));
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"openai/gpt-5.3-codex".to_string()));
        assert!(args.contains(&"hello".to_string()));
    }

    #[test]
    fn build_command_supports_dash_prefixed_prompt() {
        let session = OpenCodeSession::new(
            "ws-1".to_string(),
            PathBuf::from("/tmp"),
            Some(EngineConfig::default()),
        );
        let mut params = SendMessageParams::default();
        params.text = "-free 是什么意思".to_string();

        let command = session.build_command(&params);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(args.contains(&" -free 是什么意思".to_string()));
        assert!(!args.contains(&"--".to_string()));
    }

    #[test]
    fn build_command_supports_agent_and_variant() {
        let session = OpenCodeSession::new(
            "ws-1".to_string(),
            PathBuf::from("/tmp"),
            Some(EngineConfig::default()),
        );
        let mut params = SendMessageParams::default();
        params.text = "hello".to_string();
        params.agent = Some("build".to_string());
        params.variant = Some("high".to_string());

        let command = session.build_command(&params);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(args.contains(&"--agent".to_string()));
        assert!(args.contains(&"build".to_string()));
        assert!(args.contains(&"--variant".to_string()));
        assert!(args.contains(&"high".to_string()));
    }

    #[test]
    fn build_command_includes_external_spec_hint_when_configured() {
        let session = OpenCodeSession::new(
            "ws-1".to_string(),
            PathBuf::from("/tmp"),
            Some(EngineConfig::default()),
        );
        let mut params = SendMessageParams::default();
        params.text = "hello".to_string();
        params.custom_spec_root = Some("/tmp/external-openspec".to_string());

        let command = session.build_command(&params);
        let args: Vec<String> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(args
            .iter()
            .any(|arg| arg.contains("[External OpenSpec Root]")
                && arg.contains("/tmp/external-openspec")));
    }

    #[test]
    fn parse_json_text_event() {
        let event = json!({
            "type": "text",
            "part": {
                "text": "hello"
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TextDelta { workspace_id, text }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(text, "hello");
            }
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_content_delta_event() {
        let event = json!({
            "type": "content_delta",
            "text": "func"
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TextDelta { workspace_id, text }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(text, "func");
            }
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_output_text_delta_event() {
        let event = json!({
            "type": "output_text_delta",
            "delta": "hello"
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TextDelta { workspace_id, text }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(text, "hello");
            }
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_message_event_with_content_parts() {
        let event = json!({
            "type": "message",
            "message": {
                "content": [
                    { "type": "text", "text": "hello " },
                    { "type": "text", "text": "world" }
                ]
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TextDelta { workspace_id, text }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(text, "helloworld");
            }
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_background_output_event_with_nested_delta() {
        let event = json!({
            "type": "background_output",
            "event": {
                "type": "assistant_message_delta",
                "delta": "nested-stream"
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TextDelta { workspace_id, text }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(text, "nested-stream");
            }
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_tool_use_completed_state_as_tool_completed_with_call_id() {
        let event = json!({
            "type": "tool_use",
            "part": {
                "tool": "task",
                "callID": "call_abc123",
                "state": {
                    "status": "completed",
                    "output": {
                        "ok": true
                    }
                }
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::ToolCompleted {
                workspace_id,
                tool_id,
                tool_name,
                output,
                error,
            }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(tool_id, "call_abc123");
                assert_eq!(tool_name.as_deref(), Some("task"));
                assert!(output.is_some());
                assert!(error.is_none());
            }
            _ => panic!("expected ToolCompleted"),
        }
    }

    #[test]
    fn parse_content_delta_event_from_part_delta() {
        let event = json!({
            "type": "content_delta",
            "part": { "delta": "stream-chunk" }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TextDelta { workspace_id, text }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(text, "stream-chunk");
            }
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_tool_use_event() {
        let event = json!({
            "type": "tool_use",
            "id": "tool-1",
            "name": "read_file",
            "input": { "path": "src/main.rs" }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::ToolStarted {
                workspace_id,
                tool_id,
                tool_name,
                input,
            }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(tool_id, "tool-1");
                assert_eq!(tool_name, "read_file");
                assert!(input.is_some());
            }
            _ => panic!("expected ToolStarted"),
        }
    }

    #[test]
    fn parse_tool_use_event_from_part_state() {
        let event = json!({
            "type": "tool_use",
            "part": {
                "state": {
                    "id": "tool-42",
                    "name": "read_file",
                    "input": { "path": "README.md" }
                }
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::ToolStarted {
                workspace_id,
                tool_id,
                tool_name,
                input,
            }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(tool_id, "tool-42");
                assert_eq!(tool_name, "read_file");
                assert_eq!(
                    input.and_then(|v| v
                        .get("path")
                        .and_then(|p| p.as_str())
                        .map(ToOwned::to_owned)),
                    Some("README.md".to_string())
                );
            }
            _ => panic!("expected ToolStarted"),
        }
    }

    #[test]
    fn parse_step_finish_stop_as_turn_completed() {
        let event = json!({
            "type": "step_finish",
            "part": {
                "reason": "stop",
                "tokens": { "input": 10, "output": 20 }
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        assert!(matches!(parsed, Some(EngineEvent::TurnCompleted { .. })));
    }

    #[test]
    fn parse_turn_complete_event() {
        let event = json!({
            "type": "turn_complete",
            "session_id": "sess-123"
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TurnCompleted {
                workspace_id,
                result,
            }) => {
                assert_eq!(workspace_id, "ws-1");
                assert!(result.is_some());
            }
            _ => panic!("expected TurnCompleted"),
        }
    }

    #[test]
    fn parse_turn_completed_alias_event() {
        let event = json!({
            "type": "turn_completed",
            "session_id": "sess-456"
        });
        let parsed = parse_opencode_event("ws-1", &event);
        assert!(matches!(parsed, Some(EngineEvent::TurnCompleted { .. })));
    }

    #[test]
    fn parse_error_event_supports_nested_message() {
        let event = json!({
            "type": "error",
            "error": {
                "name": "UnknownError",
                "data": {
                    "message": "Model not found: anthropic/claude-opus-4-6."
                }
            }
        });
        let parsed = parse_opencode_event("ws-1", &event);
        match parsed {
            Some(EngineEvent::TurnError {
                workspace_id,
                error,
                ..
            }) => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(error, "Model not found: anthropic/claude-opus-4-6.");
            }
            _ => panic!("expected TurnError"),
        }
    }

    #[test]
    fn extract_session_id_supports_nested_arrays_and_objects() {
        let event = json!({
            "type": "turn_update",
            "parts": [
                { "meta": { "ignored": true } },
                { "payload": { "sessionId": "ses_nested_123" } }
            ]
        });
        let parsed = extract_session_id(&event);
        assert_eq!(parsed.as_deref(), Some("ses_nested_123"));
    }
}
