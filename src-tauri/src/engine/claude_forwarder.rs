use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::backend::events::AppServerEvent;
use crate::runtime::RuntimeManager;
use crate::types::WorkspaceEntry;

use super::super::claude::{ClaudeSession, ClaudeStreamTiming};
use super::super::events::{
    engine_event_to_app_server_event_with_turn_context, resolve_claude_realtime_item_id,
    EngineEvent,
};
use super::super::EngineType;
use super::{extract_turn_result_text, should_prefer_turn_result_text};

pub(crate) const CLAUDE_RUNTIME_SYNC_HEARTBEAT_SECS: u64 = 2;

pub(crate) type ClaudeForwarderFuture<'a> = Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

pub(crate) trait ClaudeForwarderRuntimeOps: Send + Sync {
    fn touch_turn_activity<'a>(&'a self) -> ClaudeForwarderFuture<'a>;
    fn touch_stream_activity<'a>(&'a self) -> ClaudeForwarderFuture<'a>;
    fn release_terminal<'a>(&'a self) -> ClaudeForwarderFuture<'a>;
    fn queue_runtime_sync(&self, reason: &'static str);
}

#[derive(Clone)]
pub(crate) struct ClaudeForwarderRuntimeContext {
    pub(crate) runtime_manager: Arc<RuntimeManager>,
    pub(crate) workspace_entry: WorkspaceEntry,
    pub(crate) session: Arc<ClaudeSession>,
    pub(crate) turn_source: String,
    pub(crate) stream_source: String,
}

impl ClaudeForwarderRuntimeContext {
    fn spawn_runtime_sync(&self, reason: &'static str) {
        let runtime_manager = Arc::clone(&self.runtime_manager);
        let workspace_entry = self.workspace_entry.clone();
        let session = Arc::clone(&self.session);
        let turn_source = self.turn_source.clone();
        tokio::spawn(async move {
            let pids = session.active_process_ids().await;
            runtime_manager
                .sync_claude_runtime_if_source_active(&workspace_entry, &pids, &turn_source)
                .await;
            log::debug!(
                "[claude-forwarder] runtime sync completed reason={} workspace_id={} source={} pid_count={}",
                reason,
                workspace_entry.id,
                turn_source,
                pids.len()
            );
        });
    }
}

impl ClaudeForwarderRuntimeOps for ClaudeForwarderRuntimeContext {
    fn touch_turn_activity<'a>(&'a self) -> ClaudeForwarderFuture<'a> {
        Box::pin(async move {
            self.runtime_manager
                .touch_claude_turn_activity(&self.workspace_entry, &self.turn_source)
                .await;
        })
    }

    fn touch_stream_activity<'a>(&'a self) -> ClaudeForwarderFuture<'a> {
        Box::pin(async move {
            self.runtime_manager
                .touch_claude_stream_activity(&self.workspace_entry, &self.stream_source)
                .await;
        })
    }

    fn release_terminal<'a>(&'a self) -> ClaudeForwarderFuture<'a> {
        Box::pin(async move {
            self.runtime_manager
                .release_claude_terminal_activity(
                    &self.workspace_entry.id,
                    &self.turn_source,
                    &self.stream_source,
                )
                .await;
        })
    }

    fn queue_runtime_sync(&self, reason: &'static str) {
        self.spawn_runtime_sync(reason);
    }
}

pub(crate) struct ClaudeForwarderState {
    current_thread_id: String,
    assistant_item_id: String,
    reasoning_item_id: String,
    turn_id: String,
    accumulated_agent_text: String,
    pub(crate) last_runtime_sync_queued_at: Option<Instant>,
    event_count: u64,
    pub(crate) delta_count: u64,
    burst_delta_count: u64,
    pub(crate) max_forwarding_gap_ms: u128,
    pub(crate) last_emit_at: Option<Instant>,
}

impl ClaudeForwarderState {
    pub(crate) fn new(
        current_thread_id: String,
        assistant_item_id: String,
        reasoning_item_id: String,
        turn_id: String,
    ) -> Self {
        Self {
            current_thread_id,
            assistant_item_id,
            reasoning_item_id,
            turn_id,
            accumulated_agent_text: String::new(),
            last_runtime_sync_queued_at: None,
            event_count: 0,
            delta_count: 0,
            burst_delta_count: 0,
            max_forwarding_gap_ms: 0,
            last_emit_at: None,
        }
    }

    fn should_queue_runtime_sync(&mut self, now: Instant) -> bool {
        let should_queue = self
            .last_runtime_sync_queued_at
            .map(|last_queued_at| {
                now.duration_since(last_queued_at)
                    >= Duration::from_secs(CLAUDE_RUNTIME_SYNC_HEARTBEAT_SECS)
            })
            .unwrap_or(true);
        if should_queue {
            self.last_runtime_sync_queued_at = Some(now);
        }
        should_queue
    }

    fn note_emit_gap(&mut self, now: Instant) {
        if let Some(last_emit_at) = self.last_emit_at {
            let gap_ms = now.duration_since(last_emit_at).as_millis();
            self.max_forwarding_gap_ms = self.max_forwarding_gap_ms.max(gap_ms);
            if gap_ms >= 1_000 {
                self.burst_delta_count = 0;
            }
        }
        self.last_emit_at = Some(now);
    }
}

fn is_claude_realtime_delta(event: &EngineEvent) -> bool {
    matches!(
        event,
        EngineEvent::TextDelta { .. }
            | EngineEvent::ReasoningDelta { .. }
            | EngineEvent::ToolOutputDelta { .. }
    )
}

fn unix_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn saturating_gap_ms(later: u64, earlier: Option<u64>) -> Option<u64> {
    earlier.map(|earlier_ms| later.saturating_sub(earlier_ms))
}

fn attach_claude_stream_timing(
    payload: &mut AppServerEvent,
    stream_timing: Option<&ClaudeStreamTiming>,
    forwarder_received_at_ms: u64,
    app_server_emitted_at_ms: u64,
) {
    let Some(stream_timing) = stream_timing else {
        return;
    };
    let Some(params) = payload
        .message
        .get_mut("params")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    params.insert(
        "ccguiTiming".to_string(),
        json!({
            "source": "claude-stream",
            "stdoutReceivedAtMs": stream_timing.stdout_received_at_ms,
            "processSpawnStartedAtMs": stream_timing.process_spawn_started_at_ms,
            "processSpawnedAtMs": stream_timing.process_spawned_at_ms,
            "stdinWriteStartedAtMs": stream_timing.stdin_write_started_at_ms,
            "stdinClosedAtMs": stream_timing.stdin_closed_at_ms,
            "turnStartedAtMs": stream_timing.turn_started_at_ms,
            "firstStdoutLineAtMs": stream_timing.first_stdout_line_at_ms,
            "firstValidStreamEventAtMs": stream_timing.first_valid_stream_event_at_ms,
            "firstTextDeltaAtMs": stream_timing.first_text_delta_at_ms,
            "sessionEmittedAtMs": stream_timing.session_emitted_at_ms,
            "forwarderReceivedAtMs": forwarder_received_at_ms,
            "appServerEmittedAtMs": app_server_emitted_at_ms,
            "spawnToStdinClosedMs": saturating_gap_ms(
                stream_timing.stdin_closed_at_ms.unwrap_or(stream_timing.session_emitted_at_ms),
                stream_timing.process_spawn_started_at_ms,
            ),
            "stdinClosedToFirstStdoutMs": stream_timing.first_stdout_line_at_ms.and_then(
                |first_stdout_line_at_ms| saturating_gap_ms(
                    first_stdout_line_at_ms,
                    stream_timing.stdin_closed_at_ms,
                ),
            ),
            "firstStdoutToFirstValidEventMs": stream_timing.first_valid_stream_event_at_ms.and_then(
                |first_valid_stream_event_at_ms| saturating_gap_ms(
                    first_valid_stream_event_at_ms,
                    stream_timing.first_stdout_line_at_ms,
                ),
            ),
            "firstValidEventToFirstTextDeltaMs": stream_timing.first_text_delta_at_ms.and_then(
                |first_text_delta_at_ms| saturating_gap_ms(
                    first_text_delta_at_ms,
                    stream_timing.first_valid_stream_event_at_ms,
                ),
            ),
            "stdinClosedToFirstTextDeltaMs": stream_timing.first_text_delta_at_ms.and_then(
                |first_text_delta_at_ms| saturating_gap_ms(
                    first_text_delta_at_ms,
                    stream_timing.stdin_closed_at_ms,
                ),
            ),
            "stdoutToSessionEmitMs": saturating_gap_ms(
                stream_timing.session_emitted_at_ms,
                stream_timing.stdout_received_at_ms,
            ),
            "sessionEmitToForwarderMs": forwarder_received_at_ms
                .saturating_sub(stream_timing.session_emitted_at_ms),
            "forwarderToAppServerEmitMs": app_server_emitted_at_ms
                .saturating_sub(forwarder_received_at_ms),
            "stdoutToAppServerEmitMs": saturating_gap_ms(
                app_server_emitted_at_ms,
                stream_timing.stdout_received_at_ms,
            ),
        }),
    );
}

pub(crate) async fn handle_claude_forwarder_event<R, E>(
    event: EngineEvent,
    stream_timing: Option<&ClaudeStreamTiming>,
    state: &mut ClaudeForwarderState,
    runtime_ops: &R,
    emit: &mut E,
) -> bool
where
    R: ClaudeForwarderRuntimeOps,
    E: FnMut(AppServerEvent),
{
    let event_ingress_at = Instant::now();
    let forwarder_received_at_ms = unix_timestamp_ms();
    state.event_count = state.event_count.saturating_add(1);
    let is_terminal = event.is_terminal();

    if matches!(event, EngineEvent::TurnStarted { .. }) {
        runtime_ops.touch_turn_activity().await;
    }

    if let EngineEvent::TextDelta { text, .. } = &event {
        state.accumulated_agent_text.push_str(text);
    }

    if let EngineEvent::TurnCompleted { result, .. } = &event {
        let fallback_text = extract_turn_result_text(result.as_ref()).unwrap_or_default();
        let completed_text = if should_prefer_turn_result_text(result.as_ref()) {
            fallback_text
        } else if state.accumulated_agent_text.trim().is_empty() {
            fallback_text
        } else {
            state.accumulated_agent_text.clone()
        };
        if !completed_text.trim().is_empty() {
            emit(AppServerEvent {
                workspace_id: event.workspace_id().to_string(),
                message: json!({
                    "method": "item/completed",
                    "params": {
                        "threadId": &state.current_thread_id,
                        "item": {
                            "id": &state.assistant_item_id,
                            "type": "agentMessage",
                            "text": completed_text,
                            "status": "completed",
                        }
                    }
                }),
            });
        }
    }

    if let Some(mut payload) = engine_event_to_app_server_event_with_turn_context(
        &event,
        &state.current_thread_id,
        resolve_claude_realtime_item_id(&event, &state.assistant_item_id, &state.reasoning_item_id),
        Some(&state.turn_id),
    ) {
        let emitted_at = Instant::now();
        let app_server_emitted_at_ms = unix_timestamp_ms();
        attach_claude_stream_timing(
            &mut payload,
            stream_timing,
            forwarder_received_at_ms,
            app_server_emitted_at_ms,
        );
        emit(payload);
        state.note_emit_gap(emitted_at);
        if is_claude_realtime_delta(&event) {
            state.delta_count = state.delta_count.saturating_add(1);
            state.burst_delta_count = state.burst_delta_count.saturating_add(1);
            let forwarding_ms = emitted_at.duration_since(event_ingress_at).as_millis();
            if forwarding_ms >= 500 {
                log::warn!(
                    "[claude-forwarder] backend-forwarder-stall workspace_id={} thread_id={} forwarding_ms={} event_count={} delta_count={}",
                    event.workspace_id(),
                    state.current_thread_id,
                    forwarding_ms,
                    state.event_count,
                    state.delta_count
                );
            }
        }
    }

    if let EngineEvent::SessionStarted {
        session_id, engine, ..
    } = &event
    {
        if !session_id.is_empty() && session_id != "pending" {
            match engine {
                EngineType::Claude => state.current_thread_id = format!("claude:{}", session_id),
                EngineType::OpenCode => {
                    state.current_thread_id = format!("opencode:{}", session_id)
                }
                _ => {}
            }
        }
    }

    if matches!(event, EngineEvent::TurnStarted { .. })
        && state.should_queue_runtime_sync(event_ingress_at)
    {
        runtime_ops.queue_runtime_sync("turn-start");
    }

    if is_claude_realtime_delta(&event) {
        runtime_ops.touch_stream_activity().await;
        if state.should_queue_runtime_sync(event_ingress_at) {
            runtime_ops.queue_runtime_sync("stream-heartbeat");
        }
    }

    if is_terminal {
        log::debug!(
            "[claude-forwarder] terminal summary workspace_id={} thread_id={} events={} deltas={} max_forwarding_gap_ms={} burst_delta_count={}",
            event.workspace_id(),
            state.current_thread_id,
            state.event_count,
            state.delta_count,
            state.max_forwarding_gap_ms,
            state.burst_delta_count
        );
        runtime_ops.release_terminal().await;
        return true;
    }

    false
}
