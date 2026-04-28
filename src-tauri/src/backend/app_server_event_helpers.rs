use super::*;
use std::collections::HashSet;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct RuntimeEndContext {
    pub(super) affected_thread_ids: Vec<String>,
    pub(super) affected_turn_ids: Vec<String>,
    pub(super) affected_active_turns: Vec<(String, String)>,
    pub(super) had_active_lease: bool,
}

impl RuntimeEndContext {
    pub(super) fn has_affected_work(&self) -> bool {
        self.had_active_lease
            || !self.affected_thread_ids.is_empty()
            || !self.affected_turn_ids.is_empty()
            || !self.affected_active_turns.is_empty()
    }
}

pub(super) fn build_turn_stalled_event(
    thread_id: &str,
    turn_id: Option<&str>,
    reason_code: &str,
    stage: &str,
    source: &str,
    message: &str,
    started_at_ms: u64,
    timeout_ms: u64,
    runtime_generation: Option<&str>,
    runtime_process_id: Option<u32>,
    runtime_started_at_ms: Option<u64>,
) -> Value {
    json!({
        "method": "turn/stalled",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": turn_id,
            "turn_id": turn_id,
            "reasonCode": reason_code,
            "reason_code": reason_code,
            "stage": stage,
            "source": source,
            "message": message,
            "startedAtMs": started_at_ms,
            "started_at_ms": started_at_ms,
            "timeoutMs": timeout_ms,
            "timeout_ms": timeout_ms,
            "runtimeGeneration": runtime_generation,
            "runtime_generation": runtime_generation,
            "runtimeProcessId": runtime_process_id,
            "runtime_process_id": runtime_process_id,
            "runtimeStartedAtMs": runtime_started_at_ms,
            "runtime_started_at_ms": runtime_started_at_ms,
        }
    })
}

pub(super) fn build_late_turn_started_event(value: &Value) -> Option<Value> {
    let turn = value
        .get("result")
        .and_then(|result| result.get("turn"))
        .or_else(|| value.get("turn"))?;
    let thread_id = turn
        .get("threadId")
        .or_else(|| turn.get("thread_id"))
        .and_then(Value::as_str)?
        .trim()
        .to_string();
    if thread_id.is_empty() {
        return None;
    }
    let turn_id = turn
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    Some(json!({
        "method": "turn/started",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": turn_id,
            "turn_id": turn_id,
            "turn": turn.clone(),
            "lateResponse": true,
            "late_response": true,
        }
    }))
}

pub(super) fn build_runtime_ended_event(
    workspace_id: &str,
    reason_code: &str,
    message: &str,
    exit_code: Option<i32>,
    exit_signal: Option<&str>,
    shutdown_source: Option<&str>,
    runtime_generation: Option<&str>,
    runtime_process_id: Option<u32>,
    runtime_started_at_ms: Option<u64>,
    context: &RuntimeEndContext,
    pending_request_count: u32,
) -> Value {
    let affected_active_turns_payload = context
        .affected_active_turns
        .iter()
        .map(|(thread_id, turn_id)| {
            json!({
                "threadId": thread_id,
                "thread_id": thread_id,
                "turnId": turn_id,
                "turn_id": turn_id,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "method": "runtime/ended",
        "params": {
            "workspaceId": workspace_id,
            "workspace_id": workspace_id,
            "reasonCode": reason_code,
            "reason_code": reason_code,
            "message": message,
            "exitCode": exit_code,
            "exit_code": exit_code,
            "exitSignal": exit_signal,
            "exit_signal": exit_signal,
            "shutdownSource": shutdown_source,
            "shutdown_source": shutdown_source,
            "runtimeGeneration": runtime_generation,
            "runtime_generation": runtime_generation,
            "runtimeProcessId": runtime_process_id,
            "runtime_process_id": runtime_process_id,
            "runtimeStartedAtMs": runtime_started_at_ms,
            "runtime_started_at_ms": runtime_started_at_ms,
            "affectedThreadIds": context.affected_thread_ids,
            "affected_thread_ids": context.affected_thread_ids,
            "affectedTurnIds": context.affected_turn_ids,
            "affected_turn_ids": context.affected_turn_ids,
            "affectedActiveTurns": affected_active_turns_payload,
            "affected_active_turns": affected_active_turns_payload,
            "pendingRequestCount": pending_request_count,
            "pending_request_count": pending_request_count,
            "hadActiveLease": context.had_active_lease,
            "had_active_lease": context.had_active_lease,
        }
    })
}

pub(super) fn apply_runtime_event_activity(
    active_turns: &mut HashMap<String, String>,
    value: &Value,
) {
    let Some(method) = extract_event_method(value) else {
        return;
    };
    let Some(thread_id_value) = extract_thread_id(value) else {
        return;
    };
    match method {
        "turn/started" => {
            let turn_id = extract_turn_id(value).unwrap_or_default();
            active_turns.insert(thread_id_value, turn_id);
        }
        "turn/completed" | "turn/error" => {
            active_turns.remove(&thread_id_value);
        }
        _ => {}
    }
}

pub(super) fn collect_runtime_end_context(
    active_turns: &HashMap<String, String>,
    timed_out_requests: &HashMap<u64, TimedOutRequest>,
    callback_threads: &[String],
) -> RuntimeEndContext {
    let had_active_lease = !active_turns.is_empty();
    let mut thread_ids = HashSet::new();
    thread_ids.extend(active_turns.keys().cloned());
    thread_ids.extend(callback_threads.iter().cloned());
    for request in timed_out_requests.values() {
        if let Some(thread_id) = &request.thread_id {
            thread_ids.insert(thread_id.clone());
        }
    }

    let mut affected_active_turns = active_turns
        .iter()
        .filter_map(|(thread_id, turn_id)| {
            let normalized_turn_id = turn_id.trim();
            if normalized_turn_id.is_empty() {
                return None;
            }
            Some((thread_id.clone(), normalized_turn_id.to_string()))
        })
        .collect::<Vec<_>>();
    affected_active_turns.sort_by(|left, right| left.0.cmp(&right.0));

    let mut affected_thread_ids = thread_ids.into_iter().collect::<Vec<_>>();
    affected_thread_ids.sort();

    let affected_turn_ids = affected_active_turns
        .iter()
        .map(|(_, turn_id)| turn_id.clone())
        .collect::<Vec<_>>();

    RuntimeEndContext {
        affected_thread_ids,
        affected_turn_ids,
        affected_active_turns,
        had_active_lease,
    }
}

fn extract_response_error_payload(value: &Value) -> Option<Value> {
    value.get("error").cloned().or_else(|| {
        value
            .get("result")
            .and_then(|result| result.get("error"))
            .cloned()
    })
}

pub(super) fn build_late_turn_error_event(
    value: &Value,
    request: &TimedOutRequest,
) -> Option<Value> {
    let thread_id = request.thread_id.as_deref()?.trim();
    if thread_id.is_empty() {
        return None;
    }

    let late_error = match extract_response_error_payload(value) {
        Some(Value::Object(object)) => {
            let mut payload = object.clone();
            let message_missing = payload
                .get("message")
                .and_then(Value::as_str)
                .map(|message| message.trim().is_empty())
                .unwrap_or(true);
            if message_missing {
                payload.insert(
                    "message".to_string(),
                    Value::String("Turn failed to start".to_string()),
                );
            }
            payload.insert("lateResponse".to_string(), Value::Bool(true));
            payload.insert("late_response".to_string(), Value::Bool(true));
            Value::Object(payload)
        }
        Some(Value::String(message)) => json!({
            "message": message,
            "lateResponse": true,
            "late_response": true,
        }),
        Some(other) => json!({
            "message": other.to_string(),
            "lateResponse": true,
            "late_response": true,
        }),
        None => json!({
            "message": "Turn failed to start",
            "lateResponse": true,
            "late_response": true,
        }),
    };

    Some(json!({
        "method": "turn/error",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": Value::Null,
            "turn_id": Value::Null,
            "error": late_error,
            "willRetry": false,
            "will_retry": false,
            "lateResponse": true,
            "late_response": true,
        }
    }))
}

pub(super) fn response_error_message(value: &Value) -> Option<String> {
    value
        .get("error")
        .and_then(|error| {
            error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.as_str())
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("error"))
                .and_then(|error| {
                    error
                        .get("message")
                        .and_then(Value::as_str)
                        .or_else(|| error.as_str())
                })
        })
        .map(ToString::to_string)
}
