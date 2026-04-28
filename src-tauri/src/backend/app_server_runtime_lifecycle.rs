use super::*;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{ChildStderr, ChildStdout};

impl WorkspaceSession {
    pub(super) async fn record_timed_out_request(
        &self,
        id: u64,
        method: &str,
        thread_id: Option<String>,
    ) {
        let now = now_millis();
        let mut timed_out_requests = self.timed_out_requests.lock().await;
        timed_out_requests.retain(|_, request| {
            now.saturating_sub(request.timed_out_at_ms) <= TIMED_OUT_REQUEST_GRACE_MS
        });
        timed_out_requests.insert(
            id,
            TimedOutRequest {
                method: method.to_string(),
                thread_id,
                timed_out_at_ms: now,
            },
        );
    }

    pub(super) async fn take_timed_out_request(&self, id: u64) -> Option<TimedOutRequest> {
        let now = now_millis();
        let mut timed_out_requests = self.timed_out_requests.lock().await;
        timed_out_requests.retain(|_, request| {
            now.saturating_sub(request.timed_out_at_ms) <= TIMED_OUT_REQUEST_GRACE_MS
        });
        timed_out_requests.remove(&id)
    }

    pub(super) async fn record_runtime_event_activity(&self, value: &Value) {
        let mut active_turns = self.active_turns.lock().await;
        super::event_helpers::apply_runtime_event_activity(&mut active_turns, value);
    }

    pub(crate) fn mark_shutdown_requested(&self, source: RuntimeShutdownSource) {
        self.manual_shutdown_requested.store(true, Ordering::SeqCst);
        let mut shutdown_source = self
            .shutdown_source
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if shutdown_source.is_none() {
            *shutdown_source = Some(source);
        }
    }

    #[cfg(test)]
    pub(crate) fn mark_manual_shutdown(&self) {
        self.mark_shutdown_requested(RuntimeShutdownSource::CompatibilityManual);
    }

    pub(crate) fn has_manual_shutdown_requested(&self) -> bool {
        self.manual_shutdown_requested.load(Ordering::SeqCst)
    }

    pub(crate) fn mark_shutdown_had_active_work_protection(&self) {
        self.shutdown_had_active_work_protection
            .store(true, Ordering::SeqCst);
    }

    fn had_active_work_protection_when_shutdown_started(&self) -> bool {
        self.shutdown_had_active_work_protection
            .load(Ordering::SeqCst)
    }

    pub(crate) fn shutdown_source(&self) -> Option<RuntimeShutdownSource> {
        *self
            .shutdown_source
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn has_runtime_end_emitted(&self) -> bool {
        self.runtime_end_emitted.load(Ordering::SeqCst)
    }

    pub(crate) fn stale_reuse_reason(&self) -> Option<&'static str> {
        if let Some(source) = self.shutdown_source() {
            Some(source.stale_reuse_reason())
        } else if self.has_manual_shutdown_requested() {
            Some(RuntimeShutdownSource::CompatibilityManual.stale_reuse_reason())
        } else if self.has_runtime_end_emitted() {
            Some("runtime-end-emitted")
        } else {
            None
        }
    }

    async fn collect_runtime_end_context(&self) -> RuntimeEndContext {
        let active_turns = self.active_turns.lock().await.clone();
        let timed_out_requests = self.timed_out_requests.lock().await.clone();
        let callback_threads = self
            .background_thread_callbacks
            .lock()
            .await
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        super::event_helpers::collect_runtime_end_context(
            &active_turns,
            &timed_out_requests,
            &callback_threads,
        )
    }

    pub(super) async fn handle_runtime_end<E: EventSink>(
        &self,
        event_sink: &E,
        reason_code: &str,
        message: String,
        exit_code: Option<i32>,
        exit_signal: Option<String>,
    ) {
        if self
            .runtime_end_emitted
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let runtime_end_context = self.collect_runtime_end_context().await;

        let mut pending = self.pending.lock().await;
        let pending_count = pending.len() as u32;
        for sender in pending.drain().map(|(_, sender)| sender) {
            let _ = sender.send(Err(message.clone()));
        }
        drop(pending);

        let mut timed_out_requests = self.timed_out_requests.lock().await;
        let timed_out_count = timed_out_requests.len() as u32;
        timed_out_requests.clear();
        drop(timed_out_requests);

        self.resume_pending_turns.lock().await.clear();
        self.background_thread_callbacks.lock().await.clear();
        let total_pending_request_count = pending_count.saturating_add(timed_out_count);
        let runtime_work_active = if let Some(runtime_manager) = self.runtime_manager() {
            runtime_manager
                .has_active_work_protection_for_session("codex", &self.entry.id, self.process_id)
                .await
        } else {
            false
        } || self.had_active_work_protection_when_shutdown_started();

        if let Some(runtime_manager) = self.runtime_manager() {
            runtime_manager
                .record_runtime_ended_for_session(
                    "codex",
                    &self.entry.id,
                    self.process_id,
                    RuntimeEndedRecord {
                        reason_code: reason_code.to_string(),
                        message: Some(message.clone()),
                        exit_code,
                        exit_signal: exit_signal.clone(),
                        pending_request_count: total_pending_request_count,
                    },
                )
                .await;
        }

        if runtime_end_context.has_affected_work()
            || total_pending_request_count > 0
            || runtime_work_active
        {
            event_sink.emit_app_server_event(AppServerEvent {
                workspace_id: self.entry.id.clone(),
                message: build_runtime_ended_event(
                    &self.entry.id,
                    reason_code,
                    &message,
                    exit_code,
                    exit_signal.as_deref(),
                    self.shutdown_source()
                        .map(RuntimeShutdownSource::as_str)
                        .as_deref(),
                    &runtime_end_context,
                    total_pending_request_count,
                ),
            });
        }
    }
}

fn runtime_shutdown_message(source: Option<RuntimeShutdownSource>) -> String {
    let source = source.unwrap_or(RuntimeShutdownSource::CompatibilityManual);
    format!(
        "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown (source: {}).",
        source.as_str()
    )
}

fn runtime_end_from_stdout_close_without_status(
    session: &WorkspaceSession,
) -> (&'static str, String) {
    let reason_code = if session.manual_shutdown_requested.load(Ordering::SeqCst) {
        "manual_shutdown"
    } else {
        "stdout_eof"
    };
    let message = if reason_code == "manual_shutdown" {
        runtime_shutdown_message(session.shutdown_source())
    } else {
        "[RUNTIME_ENDED] Managed runtime stdout closed before the turn reached a terminal lifecycle event."
            .to_string()
    };
    (reason_code, message)
}

fn runtime_end_from_process_status(
    session: &WorkspaceSession,
    status: &std::process::ExitStatus,
) -> (&'static str, String, Option<i32>, Option<String>) {
    let reason_code = if session.manual_shutdown_requested.load(Ordering::SeqCst) {
        "manual_shutdown"
    } else {
        "process_exit"
    };
    let exit_code = status.code();
    #[cfg(unix)]
    let exit_signal =
        std::os::unix::process::ExitStatusExt::signal(status).map(|signal| signal.to_string());
    #[cfg(not(unix))]
    let exit_signal: Option<String> = None;
    let message = if reason_code == "manual_shutdown" {
        runtime_shutdown_message(session.shutdown_source())
    } else if let Some(code) = exit_code {
        format!("[RUNTIME_ENDED] Managed runtime process exited unexpectedly with code {code}.")
    } else if let Some(signal) = exit_signal.as_deref() {
        format!("[RUNTIME_ENDED] Managed runtime process exited unexpectedly with signal {signal}.")
    } else {
        "[RUNTIME_ENDED] Managed runtime process exited unexpectedly.".to_string()
    };
    (reason_code, message, exit_code, exit_signal)
}

async fn wait_for_process_status_after_stdout_close(
    session: &WorkspaceSession,
) -> Option<std::process::ExitStatus> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(150);
    loop {
        let status_result = {
            let mut child = session.child.lock().await;
            child.try_wait()
        };
        match status_result {
            Ok(Some(status)) => return Some(status),
            Ok(None) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            Ok(None) | Err(_) => return None,
        }
    }
}

async fn runtime_end_from_stdout_close(
    session: &WorkspaceSession,
) -> (&'static str, String, Option<i32>, Option<String>) {
    if let Some(status) = wait_for_process_status_after_stdout_close(session).await {
        return runtime_end_from_process_status(session, &status);
    }
    let (reason_code, message) = runtime_end_from_stdout_close_without_status(session);
    (reason_code, message, None, None)
}

async fn emit_workspace_event<E: EventSink>(
    session: &Arc<WorkspaceSession>,
    event_sink: &E,
    workspace_id: &str,
    value: Value,
) {
    let thread_id = extract_thread_id(&value);
    let mut sent_to_background = false;
    if let Some(ref tid) = thread_id {
        let callbacks = session.background_thread_callbacks.lock().await;
        if let Some(tx) = callbacks.get(tid) {
            let _ = tx.send(value.clone());
            sent_to_background = true;
        }
    }
    if !sent_to_background {
        event_sink.emit_app_server_event(AppServerEvent {
            workspace_id: workspace_id.to_string(),
            message: value,
        });
    }
}

fn parse_app_server_message_id(value: &Value) -> Option<u64> {
    value.get("id").and_then(|id| {
        id.as_u64()
            .or_else(|| id.as_i64().and_then(|i| u64::try_from(i).ok()))
            .or_else(|| id.as_str().and_then(|s| s.parse::<u64>().ok()))
    })
}

async fn dispatch_workspace_stdout_value<E: EventSink>(
    session: &Arc<WorkspaceSession>,
    event_sink: &E,
    workspace_id: &str,
    value: Value,
) {
    let maybe_id = parse_app_server_message_id(&value);
    let has_method = value.get("method").is_some();
    let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();

    if let Some(id) = maybe_id {
        if has_result_or_error {
            if let Some(tx) = session.pending.lock().await.remove(&id) {
                let _ = tx.send(Ok(value));
            } else if let Some(timed_out_request) = session.take_timed_out_request(id).await {
                if timed_out_request.method == "turn/start" {
                    let synthetic_event = if response_error_message(&value).is_some() {
                        build_late_turn_error_event(&value, &timed_out_request)
                    } else {
                        build_late_turn_started_event(&value)
                    };
                    if let Some(synthetic_event) = synthetic_event {
                        emit_workspace_event(session, event_sink, workspace_id, synthetic_event)
                            .await;
                    }
                }
            }
            return;
        }

        if has_method {
            emit_workspace_event(session, event_sink, workspace_id, value).await;
            return;
        }

        if let Some(tx) = session.pending.lock().await.remove(&id) {
            let _ = tx.send(Ok(value));
        }
        return;
    }

    if has_method {
        emit_workspace_event(session, event_sink, workspace_id, value).await;
    }
}

async fn process_workspace_stdout_value<E: EventSink>(
    session: &Arc<WorkspaceSession>,
    event_sink: &E,
    workspace_id: &str,
    mut value: Value,
) {
    if let Some(blocked_event) = session.intercept_request_user_input_if_needed(&value).await {
        value = blocked_event;
    }
    if let Some(blocked_event) = session.intercept_plan_repo_mutation_if_needed(&value).await {
        value = blocked_event;
    }

    session.track_plan_turn_state(&value).await;
    session.record_runtime_event_activity(&value).await;
    session
        .clear_resume_pending_watch(
            extract_thread_id(&value).as_deref(),
            extract_turn_id(&value).as_deref(),
            extract_event_method(&value),
        )
        .await;
    if let Some(runtime_manager) = session.runtime_manager() {
        runtime_manager
            .handle_codex_runtime_event(&session.entry, &value)
            .await;
    }

    let synthetic_plan_event = session.maybe_emit_plan_blocker_user_input(&value).await;
    let synthetic_plan_apply_event = session.maybe_emit_plan_apply_user_input(&value).await;
    if session
        .should_suppress_after_synthetic_plan_block(&value)
        .await
    {
        let suppressed_thread_id = extract_thread_id(&value);
        let suppressed_method = extract_event_method(&value);
        session
            .clear_terminal_plan_turn_state(suppressed_thread_id.as_deref(), suppressed_method)
            .await;
        return;
    }

    let event_method = extract_event_method(&value).map(ToString::to_string);
    let thread_id = extract_thread_id(&value);

    dispatch_workspace_stdout_value(session, event_sink, workspace_id, value).await;

    if let Some(extra_event) = synthetic_plan_event {
        emit_workspace_event(session, event_sink, workspace_id, extra_event).await;
    }
    if let Some(extra_event) = synthetic_plan_apply_event {
        emit_workspace_event(session, event_sink, workspace_id, extra_event).await;
    }
    session
        .clear_terminal_plan_turn_state(thread_id.as_deref(), event_method.as_deref())
        .await;
}

pub(super) fn spawn_workspace_session_runtime_tasks<E: EventSink>(
    session: Arc<WorkspaceSession>,
    stdout: ChildStdout,
    stderr: ChildStderr,
    workspace_id: String,
    event_sink: E,
) {
    let stdout_session = Arc::clone(&session);
    let stdout_sink = event_sink.clone();
    let stdout_workspace_id = workspace_id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            let next_line = lines.next_line().await;
            let Some(line) = (match next_line {
                Ok(Some(line)) => Some(line),
                Ok(None) => {
                    let (reason_code, message, exit_code, exit_signal) =
                        runtime_end_from_stdout_close(&stdout_session).await;
                    stdout_session
                        .handle_runtime_end(
                            &stdout_sink,
                            reason_code,
                            message,
                            exit_code,
                            exit_signal,
                        )
                        .await;
                    break;
                }
                Err(error) => {
                    stdout_session
                        .handle_runtime_end(
                            &stdout_sink,
                            "stdout_read_failed",
                            format!(
                                "[RUNTIME_ENDED] Managed runtime stdout reader failed: {error}"
                            ),
                            None,
                            None,
                        )
                        .await;
                    break;
                }
            }) else {
                break;
            };
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    stdout_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: stdout_workspace_id.clone(),
                        message: json!({
                                    "method": "codex/parseError",
                                    "params": { "error": err.to_string(), "raw": line },
                        }),
                    });
                    continue;
                }
            };
            process_workspace_stdout_value(
                &stdout_session,
                &stdout_sink,
                &stdout_workspace_id,
                value,
            )
            .await;
        }
    });

    let wait_session = Arc::clone(&session);
    let wait_sink = event_sink.clone();
    tokio::spawn(async move {
        loop {
            let try_wait_result = {
                let mut child = wait_session.child.lock().await;
                child.try_wait()
            };
            match try_wait_result {
                Ok(Some(status)) => {
                    let (reason_code, message, exit_code, exit_signal) =
                        runtime_end_from_process_status(&wait_session, &status);
                    wait_session
                        .handle_runtime_end(
                            &wait_sink,
                            reason_code,
                            message,
                            exit_code,
                            exit_signal,
                        )
                        .await;
                    break;
                }
                Ok(None) => {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                Err(error) => {
                    wait_session
                        .handle_runtime_end(
                            &wait_sink,
                            "process_wait_failed",
                            format!(
                                "[RUNTIME_ENDED] Failed to read managed runtime process status: {error}"
                            ),
                            None,
                            None,
                        )
                        .await;
                    break;
                }
            }
        }
    });

    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if should_skip_codex_stderr_line(&line) {
                continue;
            }
            event_sink.emit_app_server_event(AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "codex/stderr",
                    "params": { "message": line },
                }),
            });
        }
    });
}
