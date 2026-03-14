//! Unified event types for engine streaming output
//!
//! All engines emit events that are converted to this unified format
//! before being sent to the frontend.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::backend::events::AppServerEvent;

use super::EngineType;

/// Unified engine event for frontend consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EngineEvent {
    /// Session/conversation started
    #[serde(rename = "session:started")]
    SessionStarted {
        workspace_id: String,
        session_id: String,
        engine: EngineType,
    },

    /// Turn/response started
    #[serde(rename = "turn:started")]
    TurnStarted {
        workspace_id: String,
        turn_id: String,
    },

    /// Text content delta (streaming)
    #[serde(rename = "text:delta")]
    TextDelta { workspace_id: String, text: String },

    /// Reasoning/thinking content (for models that expose it)
    #[serde(rename = "reasoning:delta")]
    ReasoningDelta { workspace_id: String, text: String },

    /// Tool use started
    #[serde(rename = "tool:started")]
    ToolStarted {
        workspace_id: String,
        tool_id: String,
        tool_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<Value>,
    },

    /// Tool use completed
    #[serde(rename = "tool:completed")]
    ToolCompleted {
        workspace_id: String,
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },

    /// Tool input updated (streaming arguments)
    #[serde(rename = "tool:inputUpdated")]
    ToolInputUpdated {
        workspace_id: String,
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<Value>,
    },

    /// Tool output updated while the tool is still running
    #[serde(rename = "tool:outputDelta")]
    ToolOutputDelta {
        workspace_id: String,
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_name: Option<String>,
        delta: String,
    },

    /// Approval request from engine
    #[serde(rename = "approval:request")]
    ApprovalRequest {
        workspace_id: String,
        request_id: Value,
        tool_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },

    /// User input request (AskUserQuestion tool)
    #[serde(rename = "userInput:request")]
    RequestUserInput {
        workspace_id: String,
        request_id: Value,
        questions: Value,
    },

    /// Turn/response completed
    #[serde(rename = "turn:completed")]
    TurnCompleted {
        workspace_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
    },

    /// Turn/response error
    #[serde(rename = "turn:error")]
    TurnError {
        workspace_id: String,
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },

    /// Session ended
    #[serde(rename = "session:ended")]
    SessionEnded {
        workspace_id: String,
        session_id: String,
    },

    /// Usage/token information
    #[serde(rename = "usage:update")]
    UsageUpdate {
        workspace_id: String,
        input_tokens: Option<i64>,
        output_tokens: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cached_tokens: Option<i64>,
        /// Model context window size (from Claude statusline/hooks)
        #[serde(skip_serializing_if = "Option::is_none")]
        model_context_window: Option<i64>,
    },

    /// Processing heartbeat while waiting for first visible output
    #[serde(rename = "processing:heartbeat")]
    ProcessingHeartbeat { workspace_id: String, pulse: u64 },

    /// Raw engine-specific event (passthrough)
    #[serde(rename = "raw")]
    Raw {
        workspace_id: String,
        engine: EngineType,
        data: Value,
    },
}

impl EngineEvent {
    /// Get the workspace ID for this event
    pub fn workspace_id(&self) -> &str {
        match self {
            EngineEvent::SessionStarted { workspace_id, .. } => workspace_id,
            EngineEvent::TurnStarted { workspace_id, .. } => workspace_id,
            EngineEvent::TextDelta { workspace_id, .. } => workspace_id,
            EngineEvent::ReasoningDelta { workspace_id, .. } => workspace_id,
            EngineEvent::ToolStarted { workspace_id, .. } => workspace_id,
            EngineEvent::ToolCompleted { workspace_id, .. } => workspace_id,
            EngineEvent::ToolInputUpdated { workspace_id, .. } => workspace_id,
            EngineEvent::ToolOutputDelta { workspace_id, .. } => workspace_id,
            EngineEvent::ApprovalRequest { workspace_id, .. } => workspace_id,
            EngineEvent::RequestUserInput { workspace_id, .. } => workspace_id,
            EngineEvent::TurnCompleted { workspace_id, .. } => workspace_id,
            EngineEvent::TurnError { workspace_id, .. } => workspace_id,
            EngineEvent::SessionEnded { workspace_id, .. } => workspace_id,
            EngineEvent::UsageUpdate { workspace_id, .. } => workspace_id,
            EngineEvent::ProcessingHeartbeat { workspace_id, .. } => workspace_id,
            EngineEvent::Raw { workspace_id, .. } => workspace_id,
        }
    }

    /// Check if this is a terminal event (turn completed or error)
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            EngineEvent::TurnCompleted { .. } | EngineEvent::TurnError { .. }
        )
    }
}

/// Wrapper for sending events via Tauri
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineEventPayload {
    pub workspace_id: String,
    pub engine: EngineType,
    pub event: EngineEvent,
}

impl EngineEventPayload {
    pub fn new(engine: EngineType, event: EngineEvent) -> Self {
        Self {
            workspace_id: event.workspace_id().to_string(),
            engine,
            event,
        }
    }
}

#[derive(Clone, Copy)]
enum ToolItemKind {
    MpcToolCall,
    CommandExecution,
    FileChange,
}

impl ToolItemKind {
    fn item_type(self) -> &'static str {
        match self {
            ToolItemKind::MpcToolCall => "mcpToolCall",
            ToolItemKind::CommandExecution => "commandExecution",
            ToolItemKind::FileChange => "fileChange",
        }
    }
}

fn resolve_tool_item_kind(tool_name: Option<&str>) -> ToolItemKind {
    let lower = tool_name.unwrap_or_default().trim().to_ascii_lowercase();
    if lower.is_empty() {
        return ToolItemKind::MpcToolCall;
    }
    // Command-like tools can contain "write" in their name (for example write_stdin).
    // Classify these first to avoid misreporting terminal interaction as file changes.
    if lower.contains("exec")
        || lower.contains("bash")
        || lower.contains("shell")
        || lower.contains("terminal")
        || lower.contains("command")
        || lower.contains("stdin")
    {
        return ToolItemKind::CommandExecution;
    }
    if lower.contains("apply")
        || lower.contains("patch")
        || lower.contains("write")
        || lower.contains("edit")
    {
        return ToolItemKind::FileChange;
    }
    ToolItemKind::MpcToolCall
}

/// Convert an EngineEvent to an AppServerEvent using Codex-compatible JSON-RPC format.
/// This allows the frontend's existing useAppServerEvents hook to handle Claude events
/// identically to Codex events.
pub fn engine_event_to_app_server_event(
    event: &EngineEvent,
    thread_id: &str,
    item_id: &str,
) -> Option<AppServerEvent> {
    let workspace_id = event.workspace_id().to_string();

    fn stringify_value(value: &Value) -> String {
        if let Some(text) = value.as_str() {
            return text.to_string();
        }
        serde_json::to_string_pretty(value).unwrap_or_default()
    }

    let message = match event {
        EngineEvent::SessionStarted {
            session_id, engine, ..
        } => json!({
            "method": "thread/started",
            "params": {
                "threadId": thread_id,
                "sessionId": session_id,
                "engine": match engine {
                    EngineType::Claude => "claude",
                    EngineType::Codex => "codex",
                    EngineType::Gemini => "gemini",
                    EngineType::OpenCode => "opencode",
                },
            }
        }),
        EngineEvent::TurnStarted { turn_id, .. } => json!({
            "method": "turn/started",
            "params": {
                "turnId": turn_id,
                "threadId": thread_id,
            }
        }),
        EngineEvent::TextDelta { text, .. } => json!({
            "method": "item/agentMessage/delta",
            "params": {
                "threadId": thread_id,
                "itemId": item_id,
                "delta": text,
            }
        }),
        EngineEvent::ReasoningDelta { text, .. } => json!({
            "method": "item/reasoning/textDelta",
            "params": {
                "threadId": thread_id,
                "itemId": item_id,
                "delta": text,
            }
        }),
        EngineEvent::ToolStarted {
            tool_id,
            tool_name,
            input,
            ..
        } => {
            let item_kind = resolve_tool_item_kind(Some(tool_name.as_str()));
            let item = match item_kind {
                ToolItemKind::CommandExecution => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "input": input,
                    "arguments": input,
                    "status": "started",
                }),
                ToolItemKind::FileChange => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "input": input,
                    "arguments": input,
                    "status": "started",
                }),
                ToolItemKind::MpcToolCall => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "server": "claude",
                    "tool": tool_name,
                    "arguments": input,
                    "status": "started",
                }),
            };
            json!({
                "method": "item/started",
                "params": {
                    "threadId": thread_id,
                    "item": item,
                }
            })
        }
        EngineEvent::ToolCompleted {
            tool_id,
            tool_name,
            output,
            error,
            ..
        } => {
            let embedded_args = output
                .as_ref()
                .and_then(|value| value.get("_input"))
                .cloned();
            let normalized_output = output
                .as_ref()
                .and_then(|value| value.get("_output"))
                .cloned()
                .or_else(|| output.clone());
            let normalized_output_text = normalized_output.as_ref().map(stringify_value);
            let item_kind = resolve_tool_item_kind(tool_name.as_deref());
            let item = match item_kind {
                ToolItemKind::CommandExecution => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "input": embedded_args,
                    "arguments": embedded_args,
                    "aggregatedOutput": normalized_output_text.clone(),
                    "output": normalized_output_text.clone(),
                    "error": error.clone(),
                    "status": if error.is_some() { "failed" } else { "completed" },
                }),
                ToolItemKind::FileChange => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "input": embedded_args,
                    "arguments": embedded_args,
                    "output": normalized_output_text.clone(),
                    "error": error.clone(),
                    "status": if error.is_some() { "failed" } else { "completed" },
                }),
                ToolItemKind::MpcToolCall => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "server": "claude",
                    "tool": tool_name.clone().unwrap_or_else(|| tool_id.clone()),
                    "arguments": embedded_args,
                    "result": normalized_output_text.clone(),
                    "error": error.clone(),
                    "status": if error.is_some() { "failed" } else { "completed" },
                }),
            };
            json!({
                "method": "item/completed",
                "params": {
                    "threadId": thread_id,
                    "item": item,
                    "output": normalized_output_text,
                    "error": error,
                }
            })
        }
        EngineEvent::ToolInputUpdated {
            tool_id,
            tool_name,
            input,
            ..
        } => {
            let item_kind = resolve_tool_item_kind(tool_name.as_deref());
            let item = match item_kind {
                ToolItemKind::CommandExecution | ToolItemKind::FileChange => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "input": input,
                    "arguments": input,
                    "status": "started",
                }),
                ToolItemKind::MpcToolCall => json!({
                    "id": tool_id,
                    "type": item_kind.item_type(),
                    "server": "claude",
                    "tool": tool_name.clone().unwrap_or_else(|| tool_id.clone()),
                    "arguments": input,
                    "status": "started",
                }),
            };
            json!({
                "method": "item/updated",
                "params": {
                    "threadId": thread_id,
                    "item": item,
                }
            })
        }
        EngineEvent::ToolOutputDelta {
            tool_id,
            tool_name,
            delta,
            ..
        } => {
            let method = match resolve_tool_item_kind(tool_name.as_deref()) {
                ToolItemKind::FileChange => "item/fileChange/outputDelta",
                _ => "item/commandExecution/outputDelta",
            };
            json!({
                "method": method,
                "params": {
                    "threadId": thread_id,
                    "itemId": tool_id,
                    "delta": delta,
                }
            })
        }
        EngineEvent::TurnCompleted { result, .. } => json!({
            "method": "turn/completed",
            "params": {
                "threadId": thread_id,
                "result": result,
            }
        }),
        EngineEvent::TurnError { error, code, .. } => json!({
            "method": "turn/error",
            "params": {
                "threadId": thread_id,
                "error": error,
                "code": code,
            }
        }),
        EngineEvent::UsageUpdate {
            input_tokens,
            output_tokens,
            cached_tokens,
            model_context_window,
            ..
        } => json!({
            "method": "thread/tokenUsage/updated",
            "params": {
                "threadId": thread_id,
                "tokenUsage": {
                    "total": {
                        "inputTokens": input_tokens,
                        "outputTokens": output_tokens,
                        "cachedInputTokens": cached_tokens,
                        "totalTokens": input_tokens.unwrap_or(0) + output_tokens.unwrap_or(0),
                    },
                    "last": {
                        "inputTokens": input_tokens,
                        "outputTokens": output_tokens,
                        "cachedInputTokens": cached_tokens,
                        "totalTokens": input_tokens.unwrap_or(0) + output_tokens.unwrap_or(0),
                    },
                    "modelContextWindow": model_context_window.unwrap_or(200000),
                }
            }
        }),
        EngineEvent::ProcessingHeartbeat { pulse, .. } => json!({
            "method": "processing/heartbeat",
            "params": {
                "threadId": thread_id,
                "pulse": pulse,
            }
        }),
        EngineEvent::ApprovalRequest {
            request_id,
            tool_name,
            input,
            message,
            ..
        } => {
            let tool_name_lower = tool_name.to_ascii_lowercase();
            let method = if tool_name_lower.contains("apply")
                || tool_name_lower.contains("patch")
                || tool_name_lower.contains("write")
                || tool_name_lower.contains("edit")
            {
                "item/fileChange/requestApproval"
            } else if tool_name_lower.contains("exec")
                || tool_name_lower.contains("bash")
                || tool_name_lower.contains("command")
            {
                "item/commandExecution/requestApproval"
            } else {
                "approval/request"
            };

            let mut merged_params = if let Some(Value::Object(map)) = input.clone() {
                map
            } else {
                serde_json::Map::new()
            };
            merged_params.insert("threadId".to_string(), Value::String(thread_id.to_string()));
            merged_params.insert("turnId".to_string(), Value::String(item_id.to_string()));
            merged_params.insert("itemId".to_string(), Value::String(item_id.to_string()));
            merged_params.insert("toolName".to_string(), Value::String(tool_name.clone()));
            if let Some(message_text) = message.clone() {
                merged_params.insert("message".to_string(), Value::String(message_text));
            }
            if let Some(raw_input) = input.clone() {
                merged_params.insert("input".to_string(), raw_input);
            }

            json!({
                "method": method,
                "params": Value::Object(merged_params),
                "id": request_id,
            })
        }
        EngineEvent::RequestUserInput {
            request_id,
            questions,
            ..
        } => json!({
            "method": "item/tool/requestUserInput",
            "params": {
                "threadId": thread_id,
                "turnId": item_id,
                "itemId": item_id,
                "questions": questions,
            },
            "id": request_id,
        }),
        EngineEvent::Raw { data, engine, .. } => json!({
            "method": format!("{}/raw", engine.icon()),
            "params": data,
        }),
        _ => return None,
    };

    Some(AppServerEvent {
        workspace_id,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_serialization() {
        let event = EngineEvent::TextDelta {
            workspace_id: "ws-1".to_string(),
            text: "Hello".to_string(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"text:delta\""));
        // Note: serde's rename_all with internally tagged enums doesn't
        // automatically rename fields within variants
        assert!(json.contains("\"workspace_id\":\"ws-1\""));
    }

    #[test]
    fn event_workspace_id() {
        let event = EngineEvent::TurnStarted {
            workspace_id: "ws-test".to_string(),
            turn_id: "turn-1".to_string(),
        };

        assert_eq!(event.workspace_id(), "ws-test");
    }

    #[test]
    fn event_is_terminal() {
        let completed = EngineEvent::TurnCompleted {
            workspace_id: "ws-1".to_string(),
            result: None,
        };
        assert!(completed.is_terminal());

        let delta = EngineEvent::TextDelta {
            workspace_id: "ws-1".to_string(),
            text: "test".to_string(),
        };
        assert!(!delta.is_terminal());
    }

    #[test]
    fn approval_request_maps_to_app_server_event() {
        let event = EngineEvent::ApprovalRequest {
            workspace_id: "ws-approval".to_string(),
            request_id: json!("req-42"),
            tool_name: "exec".to_string(),
            input: Some(json!({
                "argv": ["git", "status"]
            })),
            message: Some("git status".to_string()),
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(mapped.workspace_id, "ws-approval");
        assert_eq!(
            mapped.message["method"],
            Value::String("item/commandExecution/requestApproval".to_string())
        );
        assert_eq!(mapped.message["id"], Value::String("req-42".to_string()));
        assert_eq!(
            mapped.message["params"]["threadId"],
            Value::String("thread-1".to_string())
        );
        assert_eq!(mapped.message["params"]["argv"], json!(["git", "status"]));
    }

    #[test]
    fn tool_output_delta_maps_to_command_execution_output_delta() {
        let event = EngineEvent::ToolOutputDelta {
            workspace_id: "ws-live".to_string(),
            tool_id: "tool-7".to_string(),
            tool_name: Some("exec_command".to_string()),
            delta: "line 1\n".to_string(),
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(
            mapped.message["method"],
            Value::String("item/commandExecution/outputDelta".to_string())
        );
        assert_eq!(
            mapped.message["params"]["itemId"],
            Value::String("tool-7".to_string())
        );
        assert_eq!(
            mapped.message["params"]["delta"],
            Value::String("line 1\n".to_string())
        );
    }

    #[test]
    fn tool_started_maps_exec_command_to_command_execution_item() {
        let event = EngineEvent::ToolStarted {
            workspace_id: "ws-live".to_string(),
            tool_id: "tool-8".to_string(),
            tool_name: "exec_command".to_string(),
            input: Some(json!({
                "command": "git log --oneline -10",
                "cwd": "/repo",
            })),
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(
            mapped.message["method"],
            Value::String("item/started".to_string())
        );
        assert_eq!(
            mapped.message["params"]["item"]["type"],
            Value::String("commandExecution".to_string())
        );
        assert_eq!(
            mapped.message["params"]["item"]["input"]["command"],
            Value::String("git log --oneline -10".to_string())
        );
    }

    #[test]
    fn tool_started_maps_write_stdin_to_command_execution_item() {
        let event = EngineEvent::ToolStarted {
            workspace_id: "ws-live".to_string(),
            tool_id: "tool-stdin".to_string(),
            tool_name: "write_stdin".to_string(),
            input: Some(json!({
                "chars": "y\n",
            })),
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(
            mapped.message["params"]["item"]["type"],
            Value::String("commandExecution".to_string())
        );
    }

    #[test]
    fn tool_completed_maps_exec_command_to_command_execution_item() {
        let event = EngineEvent::ToolCompleted {
            workspace_id: "ws-live".to_string(),
            tool_id: "tool-9".to_string(),
            tool_name: Some("exec_command".to_string()),
            output: Some(Value::String("commit-a\ncommit-b".to_string())),
            error: None,
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(
            mapped.message["method"],
            Value::String("item/completed".to_string())
        );
        assert_eq!(
            mapped.message["params"]["item"]["type"],
            Value::String("commandExecution".to_string())
        );
        assert_eq!(
            mapped.message["params"]["item"]["aggregatedOutput"],
            Value::String("commit-a\ncommit-b".to_string())
        );
        assert_eq!(
            mapped.message["params"]["item"]["output"],
            Value::String("commit-a\ncommit-b".to_string())
        );
        assert_eq!(
            mapped.message["params"]["output"],
            Value::String("commit-a\ncommit-b".to_string())
        );
    }

    #[test]
    fn tool_input_updated_maps_to_item_updated() {
        let event = EngineEvent::ToolInputUpdated {
            workspace_id: "ws-live".to_string(),
            tool_id: "tool-10".to_string(),
            tool_name: Some("exec_command".to_string()),
            input: Some(json!({
                "command": "pwd",
            })),
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(
            mapped.message["method"],
            Value::String("item/updated".to_string())
        );
        assert_eq!(
            mapped.message["params"]["item"]["input"]["command"],
            Value::String("pwd".to_string())
        );
    }

    #[test]
    fn tool_output_delta_maps_apply_patch_to_file_change_output_delta() {
        let event = EngineEvent::ToolOutputDelta {
            workspace_id: "ws-live".to_string(),
            tool_id: "tool-patch".to_string(),
            tool_name: Some("apply_patch".to_string()),
            delta: "*** Update File: src/App.tsx".to_string(),
        };

        let mapped =
            engine_event_to_app_server_event(&event, "thread-1", "item-1").expect("mapped event");
        assert_eq!(
            mapped.message["method"],
            Value::String("item/fileChange/outputDelta".to_string())
        );
    }
}
