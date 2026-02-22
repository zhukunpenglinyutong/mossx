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
            EngineEvent::ApprovalRequest { workspace_id, .. } => workspace_id,
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
        } => json!({
            "method": "item/started",
            "params": {
                "threadId": thread_id,
                "item": {
                    "id": tool_id,
                    "type": "mcpToolCall",
                    "server": "claude",
                    "tool": tool_name,
                    "arguments": input,
                    "status": "started",
                }
            }
        }),
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
            json!({
                "method": "item/completed",
                "params": {
                    "threadId": thread_id,
                    "item": {
                        "id": tool_id,
                        "type": "mcpToolCall",
                        "server": "claude",
                        "tool": tool_name.clone().unwrap_or_else(|| tool_id.clone()),
                        "arguments": embedded_args,
                        "result": normalized_output.as_ref().map(stringify_value),
                        "error": error,
                        "status": if error.is_some() { "failed" } else { "completed" },
                    }
                }
            })
        }
        EngineEvent::ToolInputUpdated {
            tool_id,
            tool_name,
            input,
            ..
        } => json!({
            "method": "item/completed",
            "params": {
                "threadId": thread_id,
                "item": {
                    "id": tool_id,
                    "type": "mcpToolCall",
                    "server": "claude",
                    "tool": tool_name.clone().unwrap_or_else(|| tool_id.clone()),
                    "arguments": input,
                    "status": "started",
                }
            }
        }),
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
}
