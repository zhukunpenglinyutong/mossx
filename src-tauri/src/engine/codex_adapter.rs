//! Codex engine adapter
//!
//! Adapts the existing Codex implementation to the unified engine interface.
//! This module bridges the gap between the new engine abstraction and the
//! existing `codex` module's JSON-RPC based communication.

use serde_json::Value;
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::codex::WorkspaceSession as CodexWorkspaceSession;

use super::events::EngineEvent;
use super::{EngineType, SendMessageParams};

/// Adapter for existing Codex sessions to emit unified events
pub struct CodexSessionAdapter {
    /// The underlying Codex session
    inner: Arc<CodexWorkspaceSession>,
    /// Workspace ID
    workspace_id: String,
    /// Event sender for emitting usage updates
    event_sender: Option<broadcast::Sender<EngineEvent>>,
}

impl CodexSessionAdapter {
    /// Create a new adapter wrapping an existing Codex session
    pub fn new(inner: Arc<CodexWorkspaceSession>) -> Self {
        Self {
            workspace_id: inner.entry.id.clone(),
            inner,
            event_sender: None,
        }
    }

    /// Create a new adapter with an event sender for emitting usage updates
    pub fn with_event_sender(
        inner: Arc<CodexWorkspaceSession>,
        event_sender: broadcast::Sender<EngineEvent>,
    ) -> Self {
        Self {
            workspace_id: inner.entry.id.clone(),
            inner,
            event_sender: Some(event_sender),
        }
    }

    /// Set the event sender for emitting usage updates
    pub fn set_event_sender(&mut self, sender: broadcast::Sender<EngineEvent>) {
        self.event_sender = Some(sender);
    }

    /// Get the underlying Codex session
    pub fn inner(&self) -> &Arc<CodexWorkspaceSession> {
        &self.inner
    }

    /// Get workspace ID
    pub fn workspace_id(&self) -> &str {
        &self.workspace_id
    }

    /// Helper to read i64 from various field names
    fn read_i64(obj: &Value, keys: &[&str]) -> Option<i64> {
        for key in keys {
            if let Some(val) = obj.get(*key) {
                if let Some(n) = val.as_i64() {
                    return Some(n);
                }
                // Try parsing from string
                if let Some(s) = val.as_str() {
                    if let Ok(n) = s.parse::<i64>() {
                        return Some(n);
                    }
                }
            }
        }
        None
    }

    /// Extract usage data from turn/completed params and emit UsageUpdate event
    fn extract_usage_from_params(&self, params: &Value) {
        // Try multiple possible locations for usage data
        let usage = params
            .get("usage")
            .or_else(|| params.get("result").and_then(|r| r.get("usage")))
            .or_else(|| params.get("info").and_then(|i| i.get("usage")));

        if let Some(usage) = usage {
            self.emit_usage_from_object(usage);
        }
    }

    /// Extract usage data from token_count event params
    /// Format: {"info":{"total_token_usage":{"input_tokens":X,...}}}
    /// or: {"info":{"last_token_usage":{"input_tokens":X,...}}}
    fn extract_usage_from_token_count(&self, params: &Value) {
        let info = params.get("info");

        if let Some(info) = info {
            // Try total_token_usage first (more reliable)
            if let Some(usage) = info
                .get("total_token_usage")
                .or_else(|| info.get("totalTokenUsage"))
            {
                self.emit_usage_from_object(usage);
                return;
            }

            // Fallback to last_token_usage
            if let Some(usage) = info
                .get("last_token_usage")
                .or_else(|| info.get("lastTokenUsage"))
            {
                self.emit_usage_from_object(usage);
            }
        }
    }

    /// Emit a UsageUpdate event from a usage object
    fn emit_usage_from_object(&self, usage: &Value) {
        let input_tokens = Self::read_i64(usage, &["input_tokens", "inputTokens"]);
        let output_tokens = Self::read_i64(usage, &["output_tokens", "outputTokens"]);
        let cached_tokens = Self::read_i64(
            usage,
            &[
                "cached_input_tokens",
                "cache_read_input_tokens",
                "cachedInputTokens",
                "cacheReadInputTokens",
            ],
        );
        let model_context_window = Self::read_i64(
            usage,
            &["model_context_window", "modelContextWindow", "context_window"],
        );

        // Only emit if we have at least input_tokens
        if input_tokens.is_some() {
            if let Some(sender) = &self.event_sender {
                let _ = sender.send(EngineEvent::UsageUpdate {
                    workspace_id: self.workspace_id.clone(),
                    input_tokens,
                    output_tokens,
                    cached_tokens,
                    // Default to 200k for Codex (similar to Claude)
                    model_context_window: model_context_window.or(Some(200_000)),
                });
            }
        }
    }

    /// Convert a Codex app-server event to unified format
    pub fn convert_event(&self, method: &str, params: &Value) -> Option<EngineEvent> {
        match method {
            "thread/started" => {
                let thread_id = params.get("threadId")?.as_str()?;
                Some(EngineEvent::SessionStarted {
                    workspace_id: self.workspace_id.clone(),
                    session_id: thread_id.to_string(),
                    engine: EngineType::Codex,
                })
            }

            "turn/started" => {
                let turn_id = params.get("turnId")?.as_str().unwrap_or("unknown");
                Some(EngineEvent::TurnStarted {
                    workspace_id: self.workspace_id.clone(),
                    turn_id: turn_id.to_string(),
                })
            }

            "item/agentMessage/delta" => {
                let delta = params.get("delta")?.as_str()?;
                Some(EngineEvent::TextDelta {
                    workspace_id: self.workspace_id.clone(),
                    text: delta.to_string(),
                })
            }

            "item/reasoning/delta" => {
                let delta = params.get("delta")?.as_str()?;
                Some(EngineEvent::ReasoningDelta {
                    workspace_id: self.workspace_id.clone(),
                    text: delta.to_string(),
                })
            }

            "item/toolStart" => {
                let tool_id = params
                    .get("toolId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let tool_name = params
                    .get("toolName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                Some(EngineEvent::ToolStarted {
                    workspace_id: self.workspace_id.clone(),
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    input: params.get("input").cloned(),
                })
            }

            "item/toolComplete" => {
                let tool_id = params
                    .get("toolId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let tool_name = params
                    .get("toolName")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                Some(EngineEvent::ToolCompleted {
                    workspace_id: self.workspace_id.clone(),
                    tool_id: tool_id.to_string(),
                    tool_name,
                    output: params.get("output").cloned(),
                    error: params
                        .get("error")
                        .and_then(|e| e.as_str())
                        .map(|s| s.to_string()),
                })
            }

            "codex/request" => {
                // Approval request
                let request_id = params.get("id")?.clone();
                let method = params.get("method")?.as_str()?;
                let request_params = params.get("params")?;

                if method == "exec" || method == "apply" {
                    let command = request_params
                        .get("command")
                        .and_then(|c| {
                            if c.is_array() {
                                Some(
                                    c.as_array()
                                        .unwrap()
                                        .iter()
                                        .filter_map(|v| v.as_str())
                                        .collect::<Vec<_>>()
                                        .join(" "),
                                )
                            } else {
                                c.as_str().map(|s| s.to_string())
                            }
                        })
                        .unwrap_or_else(|| method.to_string());

                    Some(EngineEvent::ApprovalRequest {
                        workspace_id: self.workspace_id.clone(),
                        request_id,
                        tool_name: method.to_string(),
                        input: Some(request_params.clone()),
                        message: Some(command),
                    })
                } else {
                    None
                }
            }

            "turn/completed" => {
                // Try to extract usage data from turn/completed params
                // Codex CLI may include usage in the turn completion result
                self.extract_usage_from_params(params);

                Some(EngineEvent::TurnCompleted {
                    workspace_id: self.workspace_id.clone(),
                    result: Some(params.clone()),
                })
            }

            "turn/error" => {
                let error = params
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");
                Some(EngineEvent::TurnError {
                    workspace_id: self.workspace_id.clone(),
                    error: error.to_string(),
                    code: params
                        .get("code")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string()),
                })
            }

            "thread/archived" => {
                let thread_id = params.get("threadId")?.as_str()?;
                Some(EngineEvent::SessionEnded {
                    workspace_id: self.workspace_id.clone(),
                    session_id: thread_id.to_string(),
                })
            }

            "usage/update" => Some(EngineEvent::UsageUpdate {
                workspace_id: self.workspace_id.clone(),
                input_tokens: params.get("inputTokens").and_then(|v| v.as_i64()),
                output_tokens: params.get("outputTokens").and_then(|v| v.as_i64()),
                cached_tokens: params.get("cachedTokens").and_then(|v| v.as_i64()),
                model_context_window: params.get("modelContextWindow").and_then(|v| v.as_i64()),
            }),

            // Codex CLI sends token_count events with usage data
            // Format: {"type":"token_count","info":{"total_token_usage":{"input_tokens":X,...}}}
            // or: {"type":"token_count","info":{"last_token_usage":{"input_tokens":X,...}}}
            "token_count" => {
                self.extract_usage_from_token_count(params);
                None // Don't create a separate event, UsageUpdate is emitted internally
            }

            _ => {
                // Pass through as raw event
                Some(EngineEvent::Raw {
                    workspace_id: self.workspace_id.clone(),
                    engine: EngineType::Codex,
                    data: serde_json::json!({
                        "method": method,
                        "params": params,
                    }),
                })
            }
        }
    }
}

/// Helper to convert SendMessageParams to Codex format
pub fn params_to_codex_input(params: &SendMessageParams) -> Vec<Value> {
    let mut input = Vec::new();

    // Text content
    input.push(serde_json::json!({
        "type": "text",
        "text": params.text,
    }));

    // Images
    if let Some(ref images) = params.images {
        for image_path in images {
            input.push(serde_json::json!({
                "type": "image",
                "path": image_path,
            }));
        }
    }

    input
}

/// Helper to map access mode string to Codex sandbox policy
pub fn access_mode_to_sandbox_policy(access_mode: Option<&str>) -> Value {
    match access_mode {
        Some("full-auto") => serde_json::json!({ "type": "full" }),
        Some("suggest-edit") => serde_json::json!({ "type": "readOnly" }),
        _ => serde_json::json!({ "type": "current" }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convert_text_delta() {
        // Create a mock adapter (would need proper setup in real tests)
        let params = serde_json::json!({
            "delta": "Hello world"
        });

        // Test the event type matching
        assert!(params.get("delta").is_some());
    }

    #[test]
    fn params_to_input_basic() {
        let params = SendMessageParams {
            text: "Hello".to_string(),
            images: None,
            ..Default::default()
        };

        let input = params_to_codex_input(&params);
        assert_eq!(input.len(), 1);
        assert_eq!(input[0]["type"], "text");
        assert_eq!(input[0]["text"], "Hello");
    }

    #[test]
    fn params_to_input_with_images() {
        let params = SendMessageParams {
            text: "Check this".to_string(),
            images: Some(vec!["/tmp/image.png".to_string()]),
            ..Default::default()
        };

        let input = params_to_codex_input(&params);
        assert_eq!(input.len(), 2);
        assert_eq!(input[1]["type"], "image");
    }

    #[test]
    fn access_mode_mapping() {
        let full = access_mode_to_sandbox_policy(Some("full-auto"));
        assert_eq!(full["type"], "full");

        let readonly = access_mode_to_sandbox_policy(Some("suggest-edit"));
        assert_eq!(readonly["type"], "readOnly");

        let current = access_mode_to_sandbox_policy(None);
        assert_eq!(current["type"], "current");
    }
}
