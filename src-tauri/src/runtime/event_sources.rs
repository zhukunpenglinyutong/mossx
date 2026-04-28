use serde_json::Value;

pub(super) fn event_thread_id(value: &Value) -> Option<String> {
    value.get("params").and_then(|params| {
        params
            .get("threadId")
            .or_else(|| params.get("thread_id"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| {
                params
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
}

pub(super) fn event_turn_id(value: &Value) -> Option<String> {
    value.get("params").and_then(|params| {
        params
            .get("turnId")
            .or_else(|| params.get("turn_id"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| {
                params
                    .get("turn")
                    .and_then(|turn| turn.get("id"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
}

pub(super) fn event_method(value: &Value) -> Option<&str> {
    value.get("method").and_then(Value::as_str)
}

pub(super) fn event_stream_source(value: &Value) -> Option<String> {
    let method = event_method(value)?;
    if !matches!(
        method,
        "item/updated"
            | "item/completed"
            | "item/reasoning/summaryTextDelta"
            | "item/reasoning/textDelta"
            | "item/messageDelta"
            | "item/textDelta"
    ) {
        return None;
    }
    let token = event_turn_id(value)
        .or_else(|| event_thread_id(value))
        .unwrap_or_else(|| "unknown".to_string());
    Some(format!("stream:{token}"))
}

pub(super) fn event_turn_source(value: &Value) -> Option<String> {
    let method = event_method(value)?;
    if !matches!(method, "turn/started" | "turn/completed" | "turn/error") {
        return None;
    }
    let token = event_turn_id(value)
        .or_else(|| event_thread_id(value))
        .unwrap_or_else(|| "unknown".to_string());
    Some(format!("turn:{token}"))
}
