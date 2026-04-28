use super::{EngineEvent, GeminiSessionMessage, GeminiSnapshotToolState};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

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

pub(super) fn extract_text_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 4 {
        return None;
    }
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    if let Some(array) = value.as_array() {
        let mut merged = String::new();
        for item in array {
            if let Some(text) = extract_text_from_value(item, depth + 1) {
                if !merged.is_empty() {
                    merged.push('\n');
                }
                merged.push_str(&text);
            }
        }
        return if merged.trim().is_empty() {
            None
        } else {
            Some(merged)
        };
    }
    if let Some(object) = value.as_object() {
        let direct = first_non_empty_str(&[
            object.get("delta").and_then(|v| v.as_str()),
            object.get("text").and_then(|v| v.as_str()),
            object.get("message").and_then(|v| v.as_str()),
            object.get("content").and_then(|v| v.as_str()),
        ]);
        if let Some(text) = direct {
            return Some(text.to_string());
        }
        for key in [
            "content", "message", "part", "parts", "result", "output", "response", "data",
            "payload",
        ] {
            if let Some(nested) = object.get(key) {
                if let Some(text) = extract_text_from_value(nested, depth + 1) {
                    return Some(text);
                }
            }
        }
    }
    None
}

fn normalize_session_id_candidate(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("pending") {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return None;
    }
    if trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    Some(trimmed.to_string())
}

fn extract_session_id_from_object(object: &Map<String, Value>, depth: usize) -> Option<String> {
    let direct = first_non_empty_str(&[
        object.get("session_id").and_then(|value| value.as_str()),
        object.get("sessionId").and_then(|value| value.as_str()),
    ])
    .and_then(normalize_session_id_candidate);
    if direct.is_some() {
        return direct;
    }

    if let Some(session) = object.get("session").and_then(|value| value.as_object()) {
        let nested = first_non_empty_str(&[
            session.get("session_id").and_then(|value| value.as_str()),
            session.get("sessionId").and_then(|value| value.as_str()),
            session.get("id").and_then(|value| value.as_str()),
        ])
        .and_then(normalize_session_id_candidate);
        if nested.is_some() {
            return nested;
        }
    }

    if depth >= 3 {
        return None;
    }

    for key in [
        "result", "payload", "data", "message", "event", "metadata", "thread", "turn",
    ] {
        if let Some(nested) = object.get(key) {
            if let Some(session_id) = extract_session_id_from_value(nested, depth + 1) {
                return Some(session_id);
            }
        }
    }
    None
}

fn extract_session_id_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 3 {
        return None;
    }
    if let Some(object) = value.as_object() {
        return extract_session_id_from_object(object, depth);
    }
    if let Some(items) = value.as_array() {
        for item in items {
            if let Some(session_id) = extract_session_id_from_value(item, depth + 1) {
                return Some(session_id);
            }
        }
    }
    None
}

pub(super) fn extract_session_id(event: &Value) -> Option<String> {
    extract_session_id_from_value(event, 0)
}

fn extract_result_error_message(event: &Value) -> Option<String> {
    if let Some(error) = event.get("error") {
        if let Some(message) = extract_text_from_value(error, 0) {
            return Some(message);
        }
        if let Some(message) = error
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(message.to_string());
        }
    }
    first_non_empty_str(&[event.get("message").and_then(|value| value.as_str())])
        .map(|value| value.to_string())
}

fn extract_thought_entry_text(thought: &Value) -> Option<String> {
    let subject = first_non_empty_str(&[
        thought.get("subject").and_then(|value| value.as_str()),
        thought.get("title").and_then(|value| value.as_str()),
    ]);
    let description = first_non_empty_str(&[
        thought.get("description").and_then(|value| value.as_str()),
        thought.get("detail").and_then(|value| value.as_str()),
        thought.get("text").and_then(|value| value.as_str()),
        thought.get("message").and_then(|value| value.as_str()),
    ]);
    match (subject, description) {
        (Some(sub), Some(desc)) => Some(format!("{}: {}", sub, desc)),
        (Some(sub), None) => Some(sub.to_string()),
        (None, Some(desc)) => Some(desc.to_string()),
        (None, None) => None,
    }
}

fn extract_latest_thought_text_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 6 {
        return None;
    }
    if let Some(thoughts) = value
        .get("thoughts")
        .and_then(|candidate| candidate.as_array())
    {
        if let Some(latest) = thoughts.iter().rev().find_map(extract_thought_entry_text) {
            return Some(latest);
        }
    }

    if let Some(text) = value
        .get("thought")
        .and_then(extract_thought_entry_text)
        .or_else(|| {
            value
                .get("currentThought")
                .and_then(extract_thought_entry_text)
        })
        .or_else(|| {
            value
                .get("latestThought")
                .and_then(extract_thought_entry_text)
        })
    {
        return Some(text);
    }

    if let Some(array) = value.as_array() {
        for item in array.iter().rev() {
            if let Some(latest) = extract_latest_thought_text_from_value(item, depth + 1) {
                return Some(latest);
            }
        }
        return None;
    }

    let Some(object) = value.as_object() else {
        return None;
    };

    for key in [
        "message", "messages", "item", "items", "content", "data", "payload", "result", "response",
        "event", "turn",
    ] {
        if let Some(nested) = object.get(key) {
            if let Some(latest) = extract_latest_thought_text_from_value(nested, depth + 1) {
                return Some(latest);
            }
        }
    }

    for nested in object.values() {
        if let Some(latest) = extract_latest_thought_text_from_value(nested, depth + 1) {
            return Some(latest);
        }
    }
    None
}

pub(super) fn extract_latest_thought_text(event: &Value) -> Option<String> {
    extract_latest_thought_text_from_value(event, 0)
}

fn extract_reasoning_event_text(event: &Value) -> Option<String> {
    extract_event_text(event)
        .or_else(|| extract_thought_entry_text(event))
        .or_else(|| event.get("thought").and_then(extract_thought_entry_text))
        .or_else(|| {
            event
                .get("currentThought")
                .and_then(extract_thought_entry_text)
        })
        .or_else(|| {
            event
                .get("latestThought")
                .and_then(extract_thought_entry_text)
        })
        .or_else(|| extract_latest_thought_text(event))
}

fn parse_completion_event(workspace_id: &str, event: &Value) -> Option<EngineEvent> {
    let status = event
        .get("status")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let is_error_status = status
        .as_deref()
        .is_some_and(|value| matches!(value, "error" | "failed" | "cancelled" | "canceled"));
    let has_error_payload = event.get("error").is_some_and(|value| !value.is_null());
    if is_error_status || has_error_payload {
        let message = extract_result_error_message(event).unwrap_or_else(|| {
            if let Some(value) = status.as_deref() {
                format!("Gemini result status: {}", value)
            } else {
                "Gemini returned an error result.".to_string()
            }
        });
        return Some(EngineEvent::TurnError {
            workspace_id: workspace_id.to_string(),
            error: message,
            code: None,
        });
    }

    let result_text = event
        .get("text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            event
                .get("response")
                .and_then(|value| extract_text_from_value(value, 0))
        })
        .or_else(|| {
            event
                .get("result")
                .and_then(|value| extract_text_from_value(value, 0))
        });
    let result_payload = if let Some(text) = result_text {
        Some(json!({
            "text": text,
            "raw": event,
        }))
    } else {
        Some(event.clone())
    };
    Some(EngineEvent::TurnCompleted {
        workspace_id: workspace_id.to_string(),
        result: result_payload,
    })
}

pub(super) fn collect_latest_turn_reasoning_texts(
    messages: &[GeminiSessionMessage],
) -> Vec<String> {
    let mut collected_reversed: Vec<String> = Vec::new();
    for message in messages.iter().rev() {
        if message.role.eq_ignore_ascii_case("user") {
            break;
        }
        if !message.kind.eq_ignore_ascii_case("reasoning") {
            continue;
        }
        let trimmed = message.text.trim();
        if trimmed.is_empty() {
            continue;
        }
        collected_reversed.push(trimmed.to_string());
    }
    collected_reversed.reverse();
    collected_reversed
}

fn extract_event_text(event: &Value) -> Option<String> {
    first_non_empty_str(&[
        event.get("delta").and_then(|v| v.as_str()),
        event.get("text").and_then(|v| v.as_str()),
        event.get("message").and_then(|v| v.as_str()),
    ])
    .map(|s| s.to_string())
    .or_else(|| {
        event
            .get("content")
            .and_then(|value| extract_text_from_value(value, 0))
    })
    .or_else(|| extract_text_from_value(event, 0))
    .filter(|value| !value.trim().is_empty())
}

fn contains_reasoning_keyword(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    normalized.contains("reason") || normalized.contains("think") || normalized.contains("thought")
}

fn is_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number.as_i64().is_some_and(|n| n != 0),
        Some(Value::String(raw)) => {
            let normalized = raw.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        }
        _ => false,
    }
}

fn should_treat_message_as_reasoning(event: &Value, role: &str) -> bool {
    if contains_reasoning_keyword(role) {
        return true;
    }
    let kind = event
        .get("kind")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if contains_reasoning_keyword(kind) {
        return true;
    }
    let channel = event
        .get("channel")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if contains_reasoning_keyword(channel) {
        return true;
    }
    is_truthy(event.get("isThought").or_else(|| event.get("is_thought")))
        || is_truthy(
            event
                .get("isReasoning")
                .or_else(|| event.get("is_reasoning")),
        )
}

fn is_reasoning_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "reasoning"
            | "reasoning_delta"
            | "thinking"
            | "thinking_delta"
            | "thought"
            | "thought_delta"
    ) || contains_reasoning_keyword(&normalized)
}

fn is_text_like_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "text"
            | "content_delta"
            | "text_delta"
            | "output_text_delta"
            | "assistant_message_delta"
            | "message_delta"
            | "assistant_message"
    ) || normalized.contains("message")
        || normalized.contains("text")
}

fn is_completion_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "result"
            | "done"
            | "complete"
            | "completed"
            | "final"
            | "turn_completed"
            | "turn.complete"
            | "response_complete"
            | "response.completed"
    )
}

fn is_response_item_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "response_item"
            | "response.item"
            | "response_item_added"
            | "response.output_item.added"
            | "response_output_item_added"
            | "response.output_item.delta"
            | "response_output_item_delta"
            | "response.output_item.done"
            | "response_output_item_done"
    ) || (normalized.contains("response") && normalized.contains("item"))
}

fn extract_response_item_payload<'a>(event: &'a Value) -> Option<&'a Value> {
    for key in [
        "payload",
        "item",
        "output_item",
        "outputItem",
        "message",
        "part",
        "data",
        "response",
    ] {
        if let Some(value) = event.get(key) {
            return Some(value);
        }
    }
    None
}

fn parse_response_item_event(
    workspace_id: &str,
    event_type: &str,
    event: &Value,
) -> Option<EngineEvent> {
    let payload = extract_response_item_payload(event).unwrap_or(event);
    if let Some(payload_type) = payload.get("type").and_then(|value| value.as_str()) {
        let normalized_event_type = event_type.trim().to_ascii_lowercase();
        let normalized_payload_type = payload_type.trim().to_ascii_lowercase();
        if !normalized_payload_type.is_empty() && normalized_payload_type != normalized_event_type {
            if let Some(parsed) = parse_gemini_event(workspace_id, payload) {
                return Some(parsed);
            }
        }
    }

    let role = payload
        .get("role")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if role == "user" || role == "system" {
        return None;
    }
    if should_treat_message_as_reasoning(payload, &role) {
        let text = extract_reasoning_event_text(payload)?;
        return Some(EngineEvent::ReasoningDelta {
            workspace_id: workspace_id.to_string(),
            text,
        });
    }
    let text = extract_event_text(payload)?;
    Some(EngineEvent::TextDelta {
        workspace_id: workspace_id.to_string(),
        text,
    })
}

pub(super) fn should_extract_thought_fallback(parsed_event: Option<&EngineEvent>) -> bool {
    !matches!(parsed_event, Some(EngineEvent::ReasoningDelta { .. }))
}

fn find_tool_calls_array<'a>(value: &'a Value, depth: usize) -> Option<&'a Vec<Value>> {
    if depth > 6 {
        return None;
    }

    if let Some(calls) = value.get("toolCalls").and_then(Value::as_array) {
        if !calls.is_empty() {
            return Some(calls);
        }
    }
    if let Some(calls) = value.get("tool_calls").and_then(Value::as_array) {
        if !calls.is_empty() {
            return Some(calls);
        }
    }

    if let Some(array) = value.as_array() {
        for item in array.iter().rev() {
            if let Some(calls) = find_tool_calls_array(item, depth + 1) {
                return Some(calls);
            }
        }
        return None;
    }

    let Some(object) = value.as_object() else {
        return None;
    };

    for key in [
        "message", "messages", "item", "items", "content", "data", "payload", "result", "response",
        "event", "turn",
    ] {
        if let Some(nested) = object.get(key) {
            if let Some(calls) = find_tool_calls_array(nested, depth + 1) {
                return Some(calls);
            }
        }
    }

    for nested in object.values() {
        if let Some(calls) = find_tool_calls_array(nested, depth + 1) {
            return Some(calls);
        }
    }

    None
}

pub(super) fn extract_tool_events_from_snapshot(
    workspace_id: &str,
    event: &Value,
    tool_states: &mut HashMap<String, GeminiSnapshotToolState>,
) -> Vec<EngineEvent> {
    let Some(tool_calls) = find_tool_calls_array(event, 0) else {
        return Vec::new();
    };
    let mut events: Vec<EngineEvent> = Vec::new();

    for (index, call) in tool_calls.iter().enumerate() {
        let Some(call_object) = call.as_object() else {
            continue;
        };

        let tool_id = first_non_empty_str(&[
            call_object.get("id").and_then(|value| value.as_str()),
            call_object.get("toolId").and_then(|value| value.as_str()),
            call_object
                .get("tool_use_id")
                .and_then(|value| value.as_str()),
            call_object
                .get("toolUseId")
                .and_then(|value| value.as_str()),
            call_object.get("callId").and_then(|value| value.as_str()),
            call_object.get("call_id").and_then(|value| value.as_str()),
        ])
        .map(str::to_string)
        .unwrap_or_else(|| format!("gemini-tool-call-{}", index + 1));

        let tool_name = first_non_empty_str(&[
            call_object
                .get("displayName")
                .and_then(|value| value.as_str()),
            call_object.get("name").and_then(|value| value.as_str()),
            call_object.get("toolName").and_then(|value| value.as_str()),
            call_object.get("tool").and_then(|value| value.as_str()),
        ])
        .unwrap_or("tool")
        .to_string();

        let input = call_object
            .get("args")
            .cloned()
            .or_else(|| call_object.get("input").cloned())
            .or_else(|| call_object.get("parameters").cloned())
            .or_else(|| call_object.get("arguments").cloned());

        let mut output = call_object
            .get("result")
            .cloned()
            .filter(|value| !value.is_null())
            .or_else(|| call_object.get("output").cloned())
            .or_else(|| call_object.get("response").cloned());

        let result_display = first_non_empty_str(&[
            call_object
                .get("resultDisplay")
                .and_then(|value| value.as_str()),
            call_object
                .get("result_display")
                .and_then(|value| value.as_str()),
            call_object.get("display").and_then(|value| value.as_str()),
        ])
        .map(str::to_string);
        if output.is_none() {
            if let Some(display) = result_display.clone() {
                output = Some(Value::String(display));
            }
        }

        let status = first_non_empty_str(&[
            call_object.get("status").and_then(|value| value.as_str()),
            call_object.get("phase").and_then(|value| value.as_str()),
            call_object.get("state").and_then(|value| value.as_str()),
        ])
        .map(|value| value.trim().to_ascii_lowercase());
        let status_is_completed = status.as_deref().is_some_and(|value| {
            matches!(
                value,
                "done"
                    | "completed"
                    | "complete"
                    | "success"
                    | "succeeded"
                    | "failed"
                    | "failure"
                    | "error"
                    | "cancelled"
                    | "canceled"
            )
        });
        let status_is_failed = status
            .as_deref()
            .is_some_and(|value| value.contains("fail") || value.contains("error"));
        let explicit_completion = call_object.get("endedAt").is_some()
            || call_object.get("completedAt").is_some()
            || is_truthy(
                call_object
                    .get("completed")
                    .or_else(|| call_object.get("isCompleted"))
                    .or_else(|| call_object.get("done")),
            );
        let has_completion = output.is_some() || status_is_completed || explicit_completion;

        let error_text = first_non_empty_str(&[
            call_object.get("error").and_then(|value| value.as_str()),
            call_object.get("message").and_then(|value| value.as_str()),
        ])
        .map(str::to_string)
        .or_else(|| {
            if status_is_failed {
                Some("Tool execution failed".to_string())
            } else {
                None
            }
        });

        let completion_output = match (input.clone(), output.clone()) {
            (Some(input_value), Some(output_value)) => Some(json!({
                "_input": input_value,
                "_output": output_value,
            })),
            (None, Some(output_value)) => Some(output_value),
            (Some(input_value), None) if error_text.is_some() => Some(json!({
                "_input": input_value,
            })),
            _ => None,
        };

        let state = tool_states.entry(tool_id.clone()).or_default();
        if !state.started_emitted {
            events.push(EngineEvent::ToolStarted {
                workspace_id: workspace_id.to_string(),
                tool_id: tool_id.clone(),
                tool_name: tool_name.clone(),
                input: input.clone(),
            });
            state.started_emitted = true;
        }

        if !has_completion {
            continue;
        }

        let completion_signature = serde_json::to_string(&json!({
            "output": completion_output,
            "error": error_text,
            "status": status,
        }))
        .unwrap_or_default();
        if state.completed_signature.as_deref() == Some(completion_signature.as_str()) {
            continue;
        }
        state.completed_signature = Some(completion_signature);
        events.push(EngineEvent::ToolCompleted {
            workspace_id: workspace_id.to_string(),
            tool_id,
            tool_name: Some(tool_name),
            output: completion_output,
            error: error_text,
        });
    }

    events
}

pub(super) fn parse_gemini_event(workspace_id: &str, event: &Value) -> Option<EngineEvent> {
    let event_type = event.get("type").and_then(|v| v.as_str())?;
    if is_response_item_event_type(event_type) {
        if let Some(parsed) = parse_response_item_event(workspace_id, event_type, event) {
            return Some(parsed);
        }
    }
    match event_type {
        "text"
        | "content_delta"
        | "text_delta"
        | "output_text_delta"
        | "assistant_message_delta"
        | "message_delta"
        | "assistant_message" => {
            let text = extract_event_text(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "reasoning" | "reasoning_delta" | "thinking" | "thinking_delta" | "thought"
        | "thought_delta" => {
            let text = extract_reasoning_event_text(event)?;
            Some(EngineEvent::ReasoningDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "message" => {
            let role = event
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if role == "user" || role == "system" {
                return None;
            }
            if should_treat_message_as_reasoning(event, &role) {
                let text = extract_reasoning_event_text(event)?;
                return Some(EngineEvent::ReasoningDelta {
                    workspace_id: workspace_id.to_string(),
                    text,
                });
            }
            let text = extract_event_text(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "gemini" => {
            let role = event
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if role == "user" || role == "system" {
                return None;
            }
            let text = extract_event_text(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "tool_use" => {
            let tool_id = first_non_empty_str(&[
                event.get("tool_id").and_then(|v| v.as_str()),
                event.get("toolId").and_then(|v| v.as_str()),
                event.get("id").and_then(|v| v.as_str()),
            ])?
            .to_string();
            let tool_name = first_non_empty_str(&[
                event.get("tool_name").and_then(|v| v.as_str()),
                event.get("toolName").and_then(|v| v.as_str()),
                event.get("name").and_then(|v| v.as_str()),
            ])
            .unwrap_or("tool")
            .to_string();
            let input = event
                .get("parameters")
                .cloned()
                .or_else(|| event.get("args").cloned())
                .or_else(|| event.get("input").cloned());
            Some(EngineEvent::ToolStarted {
                workspace_id: workspace_id.to_string(),
                tool_id,
                tool_name,
                input,
            })
        }
        "tool_result" => {
            let tool_id = first_non_empty_str(&[
                event.get("tool_id").and_then(|v| v.as_str()),
                event.get("toolId").and_then(|v| v.as_str()),
                event.get("id").and_then(|v| v.as_str()),
            ])?
            .to_string();
            let status = event
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let error = first_non_empty_str(&[
                event.get("error").and_then(|v| v.as_str()),
                event.get("message").and_then(|v| v.as_str()),
            ])
            .map(|s| s.to_string())
            .or_else(|| {
                if status.contains("fail") || status.contains("error") {
                    Some("Tool execution failed".to_string())
                } else {
                    None
                }
            });
            let output = event
                .get("output")
                .cloned()
                .or_else(|| event.get("result").cloned())
                .or_else(|| event.get("response").cloned());
            Some(EngineEvent::ToolCompleted {
                workspace_id: workspace_id.to_string(),
                tool_id,
                tool_name: event
                    .get("tool_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                output,
                error,
            })
        }
        "error" => {
            let message = first_non_empty_str(&[
                event.get("error").and_then(|v| v.as_str()),
                event.get("message").and_then(|v| v.as_str()),
            ])
            .map(|s| s.to_string())
            .unwrap_or_else(|| serde_json::to_string(event).unwrap_or_default());
            Some(EngineEvent::TurnError {
                workspace_id: workspace_id.to_string(),
                error: message,
                code: None,
            })
        }
        "result" => parse_completion_event(workspace_id, event),
        _ => {
            if is_completion_event_type(event_type) {
                return parse_completion_event(workspace_id, event);
            }
            if is_reasoning_event_type(event_type) {
                let text = extract_reasoning_event_text(event)?;
                return Some(EngineEvent::ReasoningDelta {
                    workspace_id: workspace_id.to_string(),
                    text,
                });
            }
            if is_text_like_event_type(event_type) {
                let text = extract_event_text(event)?;
                return Some(EngineEvent::TextDelta {
                    workspace_id: workspace_id.to_string(),
                    text,
                });
            }
            None
        }
    }
}
