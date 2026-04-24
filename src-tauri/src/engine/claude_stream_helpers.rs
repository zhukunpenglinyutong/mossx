use serde_json::Value;

pub(super) fn concat_text_blocks(blocks: &[Value]) -> Option<String> {
    let mut combined = String::new();
    for block in blocks {
        let kind = block.get("type").and_then(|t| t.as_str());
        if kind == Some("text") {
            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                combined = merge_text_chunks(&combined, text);
            }
        }
    }

    if combined.trim().is_empty() {
        return None;
    }

    Some(combined)
}

pub(super) fn extract_reasoning_fragment(block: &Value) -> Option<&str> {
    block
        .get("thinking")
        .and_then(|t| t.as_str())
        .or_else(|| block.get("reasoning").and_then(|t| t.as_str()))
        .or_else(|| block.get("text").and_then(|t| t.as_str()))
}

pub(super) fn concat_reasoning_blocks(blocks: &[Value]) -> Option<String> {
    let mut combined = String::new();
    for block in blocks {
        let kind = block.get("type").and_then(|t| t.as_str());
        if kind == Some("thinking") || kind == Some("reasoning") {
            if let Some(text) = extract_reasoning_fragment(block) {
                combined = merge_text_chunks(&combined, text);
            }
        }
    }

    if combined.trim().is_empty() {
        return None;
    }

    Some(combined)
}

pub(super) fn merge_text_chunks(existing: &str, incoming: &str) -> String {
    if incoming.is_empty() {
        return existing.to_string();
    }
    if existing.is_empty() {
        return incoming.to_string();
    }
    if incoming == existing || existing.contains(incoming) {
        return existing.to_string();
    }
    if incoming.starts_with(existing) || incoming.contains(existing) {
        return incoming.to_string();
    }
    if existing.starts_with(incoming) {
        return existing.to_string();
    }

    let mut boundaries: Vec<usize> = incoming.char_indices().map(|(idx, _)| idx).collect();
    boundaries.push(incoming.len());
    for boundary in boundaries.into_iter().rev() {
        if boundary == 0 {
            continue;
        }
        let prefix = &incoming[..boundary];
        if existing.ends_with(prefix) {
            return format!("{}{}", existing, &incoming[boundary..]);
        }
    }

    format!("{}{}", existing, incoming)
}

pub(super) fn parse_claude_stream_json_line(line: &str) -> Result<Value, serde_json::Error> {
    let trimmed = line.trim();
    if let Some(payload) = trimmed.strip_prefix("data:") {
        return serde_json::from_str(payload.trim());
    }
    serde_json::from_str(trimmed)
}

pub(super) fn is_claude_stream_control_line(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed == "[DONE]"
        || trimmed.eq_ignore_ascii_case("data: [DONE]")
        || trimmed.starts_with("event:")
}

pub(super) fn extract_delta_text_from_event(event: &Value) -> Option<String> {
    let part = event.get("part");
    for value in [
        event.get("delta").and_then(|value| value.as_str()),
        event.get("text").and_then(|value| value.as_str()),
        part.and_then(|value| value.get("delta"))
            .and_then(|value| value.as_str()),
        part.and_then(|value| value.get("text"))
            .and_then(|value| value.as_str()),
        part.and_then(|value| value.get("content"))
            .and_then(|value| value.as_str()),
    ] {
        if let Some(text) = value {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
    }
    None
}

pub(super) fn extract_tool_result_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
        return None;
    }
    if let Some(obj) = value.as_object() {
        for key in [
            "output",
            "stdout",
            "stderr",
            "text",
            "preview",
            "message",
            "error",
            "response",
            "result",
            "content",
            "tool_output",
            "file",
            "loaded",
            "todos",
        ] {
            if let Some(nested) = obj.get(key).and_then(extract_tool_result_text) {
                return Some(nested);
            }
        }
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
        if !obj.is_empty() {
            let rendered = serde_json::to_string_pretty(obj).ok()?;
            if !rendered.trim().is_empty() {
                return Some(rendered);
            }
        }
    }
    if let Some(arr) = value.as_array() {
        let parts: Vec<String> = arr
            .iter()
            .filter_map(extract_tool_result_text)
            .filter(|text| !text.trim().is_empty())
            .collect();
        if !parts.is_empty() {
            return Some(parts.join("\n"));
        }
    }
    None
}

fn explicit_error_flag(value: &Value) -> Option<bool> {
    value
        .get("is_error")
        .or_else(|| value.get("isError"))
        .and_then(|field| field.as_bool())
}

fn has_error_payload(value: &Value) -> bool {
    let Some(error) = value.get("error") else {
        return false;
    };

    match error {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
        Value::Number(_) => true,
    }
}

pub(super) fn tool_result_is_error(block: &Value, event: &Value) -> bool {
    explicit_error_flag(block)
        .or_else(|| explicit_error_flag(event))
        .unwrap_or_else(|| {
            has_error_payload(block)
                || event
                    .get("toolUseResult")
                    .or_else(|| event.get("tool_use_result"))
                    .map(has_error_payload)
                    .unwrap_or(false)
        })
}

pub(super) fn extract_tool_result_output(block: &Value, event: &Value) -> Option<String> {
    block
        .get("content")
        .or_else(|| block.get("tool_output"))
        .or_else(|| block.get("output"))
        .or_else(|| block.get("result"))
        .and_then(extract_tool_result_text)
        .or_else(|| {
            event
                .get("toolUseResult")
                .and_then(extract_tool_result_text)
        })
        .or_else(|| {
            event
                .get("tool_use_result")
                .and_then(extract_tool_result_text)
        })
}

pub(super) fn tool_input_signature(value: &Value) -> Option<String> {
    serde_json::to_string(value).ok()
}

pub(super) fn extract_claude_tool_name(value: &Value) -> Option<String> {
    value
        .get("name")
        .or_else(|| value.get("tool_name"))
        .and_then(|field| field.as_str())
        .map(str::trim)
        .filter(|field| !field.is_empty())
        .map(ToString::to_string)
}

pub(super) fn extract_claude_tool_input(value: &Value) -> Option<Value> {
    value
        .get("input")
        .cloned()
        .or_else(|| value.get("tool_input").cloned())
}

pub(super) fn extract_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(raw) = value.get(*key).and_then(|v| v.as_str()) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

pub(super) fn extract_text_from_content(value: &Value) -> Option<String> {
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
        return concat_text_blocks(arr);
    }
    None
}

pub(super) fn extract_result_text(event: &Value) -> Option<String> {
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

pub(super) fn looks_like_claude_runtime_error(line: &str) -> bool {
    let text = line.trim();
    if text.is_empty() {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    lower.starts_with("api error:")
        || lower.contains("unexpected end of json input")
        || lower.starts_with("error:")
}
