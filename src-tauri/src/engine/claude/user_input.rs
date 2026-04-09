use super::*;

impl ClaudeSession {
    async fn stop_child_after_resume_failure(
        &self,
        turn_id: &str,
        mut child: Child,
        message: String,
    ) -> String {
        log::error!("{}", message);
        if let Err(error) = self.terminate_child_process(turn_id, &mut child).await {
            log::debug!(
                "[claude] Failed to terminate resume child after AskUserQuestion error (turn={}): {}",
                turn_id,
                error
            );
        }
        message
    }

    fn get_or_create_user_input_notify(&self, turn_id: &str) -> Arc<Notify> {
        if let Ok(mut map) = self.user_input_notify_by_turn.lock() {
            if let Some(existing) = map.get(turn_id) {
                return existing.clone();
            }
            let notify = Arc::new(Notify::new());
            map.insert(turn_id.to_string(), notify.clone());
            return notify;
        }
        Arc::new(Notify::new())
    }

    fn clear_pending_user_inputs_for_turn(&self, turn_id: &str) {
        if let Ok(mut pending) = self.pending_user_inputs.lock() {
            pending.retain(|_, value| value != turn_id);
        }
        if let Ok(mut notifies) = self.user_input_notify_by_turn.lock() {
            notifies.remove(turn_id);
        }
        if let Ok(mut answers) = self.user_input_answer_by_turn.lock() {
            answers.remove(turn_id);
        }
    }

    pub(super) fn clear_turn_ephemeral_state(&self, turn_id: &str) {
        if let Ok(mut map) = self.last_emitted_text_by_turn.lock() {
            map.remove(turn_id);
        }
        self.clear_pending_user_inputs_for_turn(turn_id);
    }

    /// Convert an AskUserQuestion tool_use input into a RequestUserInput engine event.
    /// The input from AskUserQuestion contains a `questions` array with `question`, `header`,
    /// `options` (each with `label` and `description`), and optional `multiSelect` flag.
    /// We transform this into the `item/tool/requestUserInput` format that the frontend expects.
    pub(super) fn convert_ask_user_question_to_request(
        &self,
        tool_id: &str,
        input: &Value,
        turn_id: &str,
    ) -> Option<EngineEvent> {
        let raw_questions = input.get("questions").and_then(|q| q.as_array())?;
        let mut questions = Vec::new();
        for (idx, raw_q) in raw_questions.iter().enumerate() {
            let question_text = raw_q.get("question").and_then(|v| v.as_str()).unwrap_or("");
            let header = raw_q.get("header").and_then(|v| v.as_str()).unwrap_or("");
            let multi_select = raw_q
                .get("multiSelect")
                .or_else(|| raw_q.get("multi_select"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            // AskUserQuestion always allows a free-text "Other" option
            let is_other = true;
            let raw_options = raw_q
                .get("options")
                .and_then(|o| o.as_array())
                .cloned()
                .unwrap_or_default();
            let options: Vec<Value> = raw_options
                .into_iter()
                .filter_map(|opt| {
                    let label = opt.get("label")?.as_str()?.to_string();
                    let desc = opt
                        .get("description")
                        .and_then(|d| d.as_str())
                        .unwrap_or("")
                        .to_string();
                    if label.is_empty() {
                        return None;
                    }
                    Some(json!({ "label": label, "description": desc }))
                })
                .collect();
            questions.push(json!({
                "id": format!("q-{}", idx),
                "header": header,
                "question": question_text,
                "isOther": is_other,
                "isSecret": false,
                "multiSelect": multi_select,
                "options": if options.is_empty() { Value::Null } else { Value::Array(options) },
            }));
        }

        if questions.is_empty() {
            return None;
        }

        // Use a string request_id derived from the tool_id via DefaultHasher.
        // A numeric i64 can lose precision when transported through JS.
        use std::hash::{Hash, Hasher};
        let request_id = {
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            tool_id.hash(&mut hasher);
            format!("ask-{:016x}", hasher.finish())
        };

        if let Ok(mut pending) = self.pending_user_inputs.lock() {
            pending.insert(request_id.clone(), turn_id.to_string());
        }

        Some(EngineEvent::RequestUserInput {
            workspace_id: self.workspace_id.clone(),
            request_id: Value::String(request_id),
            questions: Value::Array(questions),
        })
    }

    fn normalize_request_id_key(request_id: &Value) -> Option<String> {
        if let Some(text) = request_id.as_str() {
            let normalized = text.trim();
            if !normalized.is_empty() {
                return Some(normalized.to_string());
            }
        }
        if let Some(value) = request_id.as_i64() {
            return Some(value.to_string());
        }
        if let Some(value) = request_id.as_u64() {
            return Some(value.to_string());
        }
        None
    }

    pub fn has_pending_user_input(&self, request_id: &Value) -> bool {
        let request_id_key = match Self::normalize_request_id_key(request_id) {
            Some(value) => value,
            None => return false,
        };
        self.pending_user_inputs
            .lock()
            .ok()
            .map(|pending| pending.contains_key(&request_id_key))
            .unwrap_or(false)
    }

    pub fn has_any_pending_user_input(&self) -> bool {
        self.pending_user_inputs
            .lock()
            .ok()
            .map(|pending| !pending.is_empty())
            .unwrap_or(false)
    }

    /// Handle the AskUserQuestion flow: wait for user response, then kill the
    /// current CLI process and restart it with `--resume` carrying the user's
    /// actual answer.
    ///
    /// Returns the new stdout `Lines` reader if successfully resumed.
    /// `Ok(None)` means we should continue reading from the current process.
    /// `Err` means resume failed after the original process was already terminated.
    pub(super) async fn handle_ask_user_question_resume(
        &self,
        turn_id: &str,
        params: &SendMessageParams,
        new_session_id: &Option<String>,
    ) -> Result<Option<tokio::io::Lines<BufReader<tokio::process::ChildStdout>>>, String> {
        let notify = self.get_or_create_user_input_notify(turn_id);
        log::info!("AskUserQuestion detected, waiting for user (up to 5 min)…");
        let user_answered = tokio::select! {
            _ = notify.notified() => true,
            _ = tokio::time::sleep(
                std::time::Duration::from_secs(300)
            ) => false,
        };

        if !user_answered {
            log::info!("AskUserQuestion timed out (5 min), resuming original");
            self.clear_pending_user_inputs_for_turn(turn_id);
            return Ok(None);
        }

        // Grab the formatted answer for this turn only.
        let answer_text = self
            .user_input_answer_by_turn
            .lock()
            .ok()
            .and_then(|mut map| map.remove(turn_id));

        let answer = match answer_text {
            Some(a) => a,
            None => return Ok(None),
        };

        // We need a session_id for --resume
        let sid = match new_session_id.clone() {
            Some(s) => s,
            None => {
                log::warn!(
                    "No session_id available for --resume, \
                     continuing with original output"
                );
                return Ok(None);
            }
        };

        log::info!(
            "Killing current CLI and restarting with --resume \
             to deliver user's answer"
        );

        // Kill the current process
        {
            let mut active = self.active_processes.lock().await;
            if let Some(mut child) = active.remove(turn_id) {
                if let Err(error) = self.terminate_child_process(turn_id, &mut child).await {
                    log::debug!(
                        "[claude] Failed to terminate AskUserQuestion parent process (turn={}): {}",
                        turn_id,
                        error
                    );
                }
            }
        }

        // Build a resume command with the user's answer
        let mut resume_params = params.clone();
        resume_params.text = answer;
        resume_params.continue_session = true;
        resume_params.session_id = Some(sid);
        resume_params.images = None;
        let use_stream_json_input = Self::should_use_stream_json_input(&resume_params);

        let mut cmd = self.build_command(&resume_params, use_stream_json_input);
        match cmd.spawn() {
            Ok(mut new_child) => {
                if use_stream_json_input {
                    if let Some(mut stdin) = new_child.stdin.take() {
                        let message = match build_message_content(&resume_params) {
                            Ok(value) => value,
                            Err(error) => {
                                let failure = self
                                    .stop_child_after_resume_failure(
                                        turn_id,
                                        new_child,
                                        format!(
                                            "Failed to build AskUserQuestion resume message: {}",
                                            error
                                        ),
                                    )
                                    .await;
                                return Err(failure);
                            }
                        };
                        let message_str = match serde_json::to_string(&message) {
                            Ok(value) => value,
                            Err(error) => {
                                let failure = self
                                    .stop_child_after_resume_failure(
                                        turn_id,
                                        new_child,
                                        format!(
                                            "Failed to serialize AskUserQuestion resume message: {}",
                                            error
                                        ),
                                    )
                                    .await;
                                return Err(failure);
                            }
                        };
                        if let Err(error) = stdin.write_all(message_str.as_bytes()).await {
                            let failure = self
                                .stop_child_after_resume_failure(
                                    turn_id,
                                    new_child,
                                    format!(
                                        "Failed to write AskUserQuestion resume message to stdin: {}",
                                        error
                                    ),
                                )
                                .await;
                            return Err(failure);
                        }
                        if let Err(error) = stdin.write_all(b"\n").await {
                            let failure = self
                                .stop_child_after_resume_failure(
                                    turn_id,
                                    new_child,
                                    format!(
                                        "Failed to write AskUserQuestion resume newline to stdin: {}",
                                        error
                                    ),
                                )
                                .await;
                            return Err(failure);
                        }
                        drop(stdin);
                    } else {
                        let failure = self
                            .stop_child_after_resume_failure(
                                turn_id,
                                new_child,
                                "Resume process missing stdin in stream-json mode".to_string(),
                            )
                            .await;
                        return Err(failure);
                    }
                } else {
                    // Drop stdin immediately for non-stream-json resume requests.
                    drop(new_child.stdin.take());
                }

                let new_lines = new_child
                    .stdout
                    .take()
                    .map(|stdout| BufReader::new(stdout).lines());

                // Capture stderr of new process
                // (old stderr task will finish on its own)
                if let Some(new_stderr) = new_child.stderr.take() {
                    let _ws = self.workspace_id.clone();
                    tokio::spawn(async move {
                        let mut r = BufReader::new(new_stderr).lines();
                        while let Ok(Some(_)) = r.next_line().await {}
                    });
                }

                // Store new child for interruption
                {
                    let mut active = self.active_processes.lock().await;
                    active.insert(turn_id.to_string(), new_child);
                }

                log::info!("Resumed Claude with user's answer");
                Ok(new_lines)
            }
            Err(e) => Err(format!(
                "Failed to spawn AskUserQuestion resume process: {}",
                e
            )),
        }
    }

    /// Handle a user's response to an AskUserQuestion dialog.
    ///
    /// The answer is formatted into a human-readable message and stored.
    /// The stdout reading loop will then kill the current CLI process
    /// (whose output is based on a default/empty AskUserQuestion result)
    /// and restart it with `--resume` carrying the user's actual answer.
    pub async fn respond_to_user_input(
        &self,
        request_id: Value,
        result: Value,
    ) -> Result<(), String> {
        let normalized_request_id = Self::normalize_request_id_key(&request_id);
        if normalized_request_id.is_none() {
            return Err("invalid request_id for AskUserQuestion".to_string());
        }

        // Strict request_id matching prevents cross-turn answer routing
        // when multiple AskUserQuestion prompts are pending.
        let request_id_key = normalized_request_id.unwrap_or_default();
        let turn_id = {
            let mut pending = self
                .pending_user_inputs
                .lock()
                .map_err(|_| "pending_user_inputs lock poisoned".to_string())?;
            pending.remove(&request_id_key).ok_or_else(|| {
                format!("unknown request_id for AskUserQuestion: {}", request_id_key)
            })?
        };

        // Format the answer and store it for the target turn only.
        let answer_text = format_ask_user_answer(&result);
        log::info!(
            "Claude engine: AskUserQuestion response (request_id={}, turn_id={}): {}",
            request_id_key,
            turn_id,
            answer_text
        );
        if let Ok(mut map) = self.user_input_answer_by_turn.lock() {
            map.insert(turn_id.clone(), answer_text);
        }

        // Signal only the matching turn's stdout loop to resume.
        self.get_or_create_user_input_notify(&turn_id).notify_one();

        Ok(())
    }
}
