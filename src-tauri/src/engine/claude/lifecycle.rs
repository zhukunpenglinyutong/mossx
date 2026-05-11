use super::*;
use crate::engine::events::{ContextCategoryUsage, ContextToolUsage};

impl ClaudeSession {
    pub(crate) fn is_prompt_too_long_error(error: &str) -> bool {
        let lower = error.to_ascii_lowercase();
        lower.contains("prompt is too long")
            || lower.contains("prompt too long")
            || lower.contains("maximum context length")
            || lower.contains("max context length")
            || lower.contains("context length exceeded")
            || lower.contains("token limit exceeded")
    }

    pub(crate) fn mark_retryable_prompt_too_long_error(error: &str) -> String {
        if error.starts_with(RETRYABLE_PROMPT_TOO_LONG_PREFIX) {
            return error.to_string();
        }
        format!("{RETRYABLE_PROMPT_TOO_LONG_PREFIX}{error}")
    }

    pub(crate) fn extract_retryable_prompt_too_long_error(error: &str) -> Option<String> {
        error
            .strip_prefix(RETRYABLE_PROMPT_TOO_LONG_PREFIX)
            .map(|value| value.to_string())
    }

    pub(crate) fn clear_retryable_prompt_too_long_marker(error: String) -> String {
        Self::extract_retryable_prompt_too_long_error(&error).unwrap_or(error)
    }

    fn normalize_compaction_signal_from_text(value: &str) -> Option<&'static str> {
        let normalized = value.trim().to_ascii_lowercase().replace(['-', ' '], "_");
        if normalized.is_empty() {
            return None;
        }
        if normalized.contains("compaction_failed")
            || normalized.contains("compact_failed")
            || normalized.contains("compactfailure")
        {
            return Some("compaction_failed");
        }
        if normalized.contains("compact_boundary") || normalized.contains("compacted") {
            return Some("compact_boundary");
        }
        if normalized.contains("compacting") {
            return Some("compacting");
        }
        None
    }

    pub(super) fn has_compaction_system_signal(event: &Value) -> bool {
        for key in [
            "subtype",
            "subType",
            "event",
            "event_type",
            "eventType",
            "name",
            "kind",
            "status",
            "phase",
            "state",
            "type",
        ] {
            if let Some(raw) = event.get(key).and_then(|value| value.as_str()) {
                if Self::normalize_compaction_signal_from_text(raw).is_some() {
                    return true;
                }
            }
        }
        false
    }

    fn emit_compaction_signal(
        &self,
        turn_id: &str,
        subtype: &str,
        extra_fields: Option<serde_json::Map<String, Value>>,
    ) {
        let mut payload = serde_json::Map::new();
        payload.insert("type".to_string(), Value::String("system".to_string()));
        payload.insert("subtype".to_string(), Value::String(subtype.to_string()));
        payload.insert(
            "source".to_string(),
            Value::String(AUTO_COMPACT_SIGNAL_SOURCE.to_string()),
        );
        if let Some(extra) = extra_fields {
            for (key, value) in extra {
                payload.insert(key, value);
            }
        }
        self.emit_turn_event(
            turn_id,
            EngineEvent::Raw {
                workspace_id: self.workspace_id.clone(),
                engine: EngineType::Claude,
                data: Value::Object(payload),
            },
        );
    }

    pub async fn send_message_with_auto_compact_retry(
        &self,
        params: SendMessageParams,
        turn_id: &str,
    ) -> Result<String, String> {
        let first_attempt = self.send_message(params.clone(), turn_id).await;
        let first_error = match first_attempt {
            Ok(response) => return Ok(response),
            Err(error) => error,
        };

        let trigger_error = match Self::extract_retryable_prompt_too_long_error(&first_error) {
            Some(error) => error,
            None => return Err(Self::clear_retryable_prompt_too_long_marker(first_error)),
        };

        log::warn!(
            "[claude] turn={} hit prompt-too-long boundary, triggering one-time /compact recovery",
            turn_id
        );

        self.emit_compaction_signal(turn_id, "compacting", None);

        let mut compact_params = params.clone();
        compact_params.text = "/compact".to_string();
        compact_params.images = None;
        compact_params.continue_session = true;
        if compact_params.session_id.is_none() {
            compact_params.session_id = self.get_session_id().await;
        }
        let compact_turn_id = format!("{turn_id}::auto-compact");
        if let Err(compact_error) = self.send_message(compact_params, &compact_turn_id).await {
            let compact_error = Self::clear_retryable_prompt_too_long_marker(compact_error);
            let failure_message = format!(
                "Prompt is too long and automatic /compact failed: {}",
                compact_error
            );
            let mut failure_payload = serde_json::Map::new();
            failure_payload.insert("reason".to_string(), Value::String(failure_message.clone()));
            self.emit_compaction_signal(turn_id, "compaction_failed", Some(failure_payload));
            self.emit_error(turn_id, failure_message.clone());
            return Err(failure_message);
        }

        let mut retry_params = params;
        retry_params.continue_session = true;
        if retry_params.session_id.is_none() {
            retry_params.session_id = self.get_session_id().await;
        }
        match self.send_message(retry_params, turn_id).await {
            Ok(response) => Ok(response),
            Err(retry_error) => {
                let retry_error = Self::clear_retryable_prompt_too_long_marker(retry_error);
                let final_message = format!(
                    "Prompt is too long. Retried once after /compact but still failed: {}",
                    retry_error
                );
                log::error!(
                    "[claude] auto /compact retry failed (turn={}): trigger={}, final={}",
                    turn_id,
                    trigger_error,
                    final_message
                );
                self.emit_error(turn_id, final_message.clone());
                Err(final_message)
            }
        }
    }

    /// Try to extract context window usage from any event
    /// Claude CLI may provide usage data in multiple locations:
    /// 1. context_window.current_usage (statusline/hooks - most accurate)
    /// 2. message.usage (assistant events)
    /// 3. usage (top-level usage field)
    pub(super) fn try_extract_context_window_usage(&self, turn_id: &str, event: &Value) {
        let usage_snapshot = self.find_usage_data(event);

        if usage_snapshot.context_used_tokens.is_some()
            || usage_snapshot.model_context_window.is_some()
            || usage_snapshot.input_tokens.is_some()
            || usage_snapshot.output_tokens.is_some()
            || usage_snapshot.cached_tokens.is_some()
            || usage_snapshot.used_percent.is_some()
            || usage_snapshot.remaining_percent.is_some()
        {
            log::debug!(
                "[claude] Emitting UsageUpdate: input={:?}, output={:?}, cached={:?}, window={:?}, context_used={:?}, source={}",
                usage_snapshot.input_tokens,
                usage_snapshot.output_tokens,
                usage_snapshot.cached_tokens,
                usage_snapshot.model_context_window,
                usage_snapshot.context_used_tokens,
                usage_snapshot.source
            );
            self.emit_turn_event(
                turn_id,
                EngineEvent::UsageUpdate {
                    workspace_id: self.workspace_id.clone(),
                    input_tokens: usage_snapshot.input_tokens,
                    output_tokens: usage_snapshot.output_tokens,
                    cached_tokens: usage_snapshot.cached_tokens,
                    model_context_window: usage_snapshot.model_context_window,
                    context_used_tokens: usage_snapshot.context_used_tokens,
                    context_usage_source: Some(usage_snapshot.source.to_string()),
                    context_usage_freshness: Some(usage_snapshot.freshness.to_string()),
                    context_used_percent: usage_snapshot.used_percent,
                    context_remaining_percent: usage_snapshot.remaining_percent,
                    context_tool_usages: None,
                    context_tool_usages_truncated: None,
                    context_category_usages: None,
                },
            );
        }
    }

    pub(super) async fn emit_context_command_usage_update(&self, turn_id: &str, session_id: &str) {
        let Some(snapshot) = self.fetch_context_command_usage_snapshot(session_id).await else {
            return;
        };
        self.emit_turn_event(
            turn_id,
            EngineEvent::UsageUpdate {
                workspace_id: self.workspace_id.clone(),
                input_tokens: None,
                output_tokens: None,
                cached_tokens: None,
                model_context_window: Some(snapshot.context_window),
                context_used_tokens: Some(snapshot.used_tokens),
                context_usage_source: Some("context_command".to_string()),
                context_usage_freshness: Some("estimated".to_string()),
                context_used_percent: Some(snapshot.used_percent),
                context_remaining_percent: Some((100.0 - snapshot.used_percent).max(0.0)),
                context_tool_usages: if snapshot.tool_usages.is_empty() {
                    None
                } else {
                    Some(snapshot.tool_usages)
                },
                context_tool_usages_truncated: Some(snapshot.tool_usages_truncated),
                context_category_usages: if snapshot.category_usages.is_empty() {
                    None
                } else {
                    Some(snapshot.category_usages)
                },
            },
        );
    }

    async fn fetch_context_command_usage_snapshot(
        &self,
        session_id: &str,
    ) -> Option<ClaudeContextCommandUsageSnapshot> {
        let bin = if let Some(ref custom) = self.bin_path {
            custom.clone()
        } else {
            crate::backend::app_server::find_cli_binary("claude", None)
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_else(|| "claude".to_string())
        };
        let mut cmd = crate::backend::app_server::build_command_for_binary(&bin);
        cmd.current_dir(&self.workspace_path)
            .arg("-p")
            .arg("/context")
            .arg("--resume")
            .arg(session_id)
            .arg("--no-session-persistence")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null());
        if let Some(home) = &self.home_dir {
            cmd.env("CLAUDE_HOME", home);
        }

        let output =
            match tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output()).await {
                Ok(Ok(output)) => output,
                Ok(Err(error)) => {
                    log::debug!("[claude] /context probe failed to spawn: {}", error);
                    return None;
                }
                Err(_) => {
                    log::debug!("[claude] /context probe timed out");
                    return None;
                }
            };
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::debug!(
                "[claude] /context probe exited with status {:?}: {}",
                output.status.code(),
                stderr.trim()
            );
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_context_command_usage(&stdout)
    }

    /// Find usage data from various locations in the event
    fn find_usage_data(&self, event: &Value) -> ClaudeUsageSnapshot {
        if let Some(context_window) = find_context_window(event) {
            log::debug!(
                "[claude] Found context_window field: {}",
                serde_json::to_string_pretty(context_window)
                    .unwrap_or_else(|_| context_window.to_string())
            );

            let model_context_window = context_window
                .get("context_window_size")
                .or_else(|| context_window.get("contextWindowSize"))
                .and_then(as_i64)
                .filter(|value| *value > 0);
            let used_percent = context_window
                .get("used_percentage")
                .or_else(|| context_window.get("usedPercentage"))
                .and_then(as_f64);
            let remaining_percent = context_window
                .get("remaining_percentage")
                .or_else(|| context_window.get("remainingPercentage"))
                .and_then(as_f64);

            let current_usage = context_window
                .get("current_usage")
                .or_else(|| context_window.get("currentUsage"));

            if let Some(current_usage) = current_usage {
                let usage = if current_usage.is_object() {
                    Some(current_usage)
                } else {
                    None
                };
                let usage_totals = usage
                    .or_else(|| message_usage(event))
                    .or_else(|| find_usage(event))
                    .map(read_usage_totals)
                    .unwrap_or_default();
                let context_used_tokens = as_i64(current_usage).or_else(|| {
                    if current_usage.is_object() {
                        usage_totals.context_used_tokens()
                    } else {
                        None
                    }
                });
                return ClaudeUsageSnapshot {
                    input_tokens: usage_totals.input_tokens,
                    output_tokens: usage_totals.output_tokens,
                    cached_tokens: usage_totals.cached_tokens,
                    context_used_tokens,
                    model_context_window,
                    source: "context_window",
                    freshness: "live",
                    used_percent,
                    remaining_percent,
                };
            }

            if model_context_window.is_some()
                || used_percent.is_some()
                || remaining_percent.is_some()
            {
                let usage_totals = message_usage(event)
                    .or_else(|| find_usage(event))
                    .map(read_usage_totals)
                    .unwrap_or_default();
                return ClaudeUsageSnapshot {
                    input_tokens: usage_totals.input_tokens,
                    output_tokens: usage_totals.output_tokens,
                    cached_tokens: usage_totals.cached_tokens,
                    context_used_tokens: None,
                    model_context_window,
                    source: "context_window",
                    freshness: "live",
                    used_percent,
                    remaining_percent,
                };
            }
        }

        if let Some(usage) = message_usage(event) {
            log::debug!(
                "[claude] Found message.usage field: {}",
                serde_json::to_string_pretty(usage).unwrap_or_else(|_| usage.to_string())
            );
            let usage_totals = read_usage_totals(usage);
            return ClaudeUsageSnapshot {
                input_tokens: usage_totals.input_tokens,
                output_tokens: usage_totals.output_tokens,
                cached_tokens: usage_totals.cached_tokens,
                context_used_tokens: usage_totals.context_used_tokens(),
                model_context_window: None,
                source: "message_usage",
                freshness: "estimated",
                used_percent: None,
                remaining_percent: None,
            };
        }

        if let Some(usage) = find_usage(event) {
            log::debug!(
                "[claude] Found top-level usage field: {}",
                serde_json::to_string_pretty(usage).unwrap_or_else(|_| usage.to_string())
            );
            let usage_totals = read_usage_totals(usage);
            return ClaudeUsageSnapshot {
                input_tokens: usage_totals.input_tokens,
                output_tokens: usage_totals.output_tokens,
                cached_tokens: usage_totals.cached_tokens,
                context_used_tokens: usage_totals.context_used_tokens(),
                model_context_window: None,
                source: "top_level_usage",
                freshness: "estimated",
                used_percent: None,
                remaining_percent: None,
            };
        }

        log::debug!(
            "[claude] No usage data found in event type: {:?}",
            event.get("type").and_then(|v| v.as_str())
        );
        ClaudeUsageSnapshot {
            input_tokens: None,
            output_tokens: None,
            cached_tokens: None,
            context_used_tokens: None,
            model_context_window: None,
            source: "none",
            freshness: "pending",
            used_percent: None,
            remaining_percent: None,
        }
    }
}

struct ClaudeUsageSnapshot {
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cached_tokens: Option<i64>,
    context_used_tokens: Option<i64>,
    model_context_window: Option<i64>,
    source: &'static str,
    freshness: &'static str,
    used_percent: Option<f64>,
    remaining_percent: Option<f64>,
}

pub(super) struct ClaudeContextCommandUsageSnapshot {
    pub(super) used_tokens: i64,
    pub(super) context_window: i64,
    pub(super) used_percent: f64,
    pub(super) category_usages: Vec<ContextCategoryUsage>,
    pub(super) tool_usages: Vec<ContextToolUsage>,
    pub(super) tool_usages_truncated: bool,
}

#[derive(Default)]
struct ClaudeUsageTotals {
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cached_tokens: Option<i64>,
}

impl ClaudeUsageTotals {
    fn context_used_tokens(&self) -> Option<i64> {
        match (self.input_tokens, self.cached_tokens) {
            (Some(input), Some(cached)) => input.checked_add(cached),
            (Some(input), None) => Some(input),
            (None, Some(cached)) => Some(cached),
            (None, None) => None,
        }
    }
}

pub(super) fn parse_context_command_usage(
    markdown: &str,
) -> Option<ClaudeContextCommandUsageSnapshot> {
    let mut used_tokens = None;
    let mut context_window = None;
    let mut used_percent = None;
    let mut category_usages = Vec::new();
    let mut tool_usages = Vec::new();
    let mut section = "";

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("**Tokens:**") {
            if let Some((used, window, percent)) = parse_context_tokens_line(trimmed) {
                used_tokens = Some(used);
                context_window = Some(window);
                used_percent = Some(percent);
            }
            continue;
        }
        if trimmed.starts_with("### ") {
            section = trimmed.trim_start_matches("### ").trim();
            continue;
        }
        if !trimmed.starts_with('|') || trimmed.contains("---") {
            continue;
        }
        match section {
            "Estimated usage by category" => {
                if let Some(category) = parse_context_category_row(trimmed) {
                    category_usages.push(category);
                }
            }
            "MCP Tools" => {
                if let Some(tool) = parse_context_tool_row(trimmed) {
                    tool_usages.push(tool);
                }
            }
            _ => {}
        }
    }

    tool_usages.sort_by(|left, right| right.tokens.cmp(&left.tokens));
    let tool_usages_truncated = tool_usages.len() > 3;
    let tool_usages = tool_usages.into_iter().take(3).collect();

    Some(ClaudeContextCommandUsageSnapshot {
        used_tokens: used_tokens?,
        context_window: context_window?,
        used_percent: used_percent?,
        category_usages,
        tool_usages,
        tool_usages_truncated,
    })
}

fn parse_context_tokens_line(line: &str) -> Option<(i64, i64, f64)> {
    let content = line
        .strip_prefix("**Tokens:**")?
        .trim()
        .trim_end_matches("**")
        .trim();
    let (tokens_part, percent_part) = content.rsplit_once('(')?;
    let percent = parse_percent(percent_part.trim_end_matches(')').trim())?;
    let (used_text, window_text) = tokens_part.split_once('/')?;
    let used = parse_token_count(used_text.trim())?;
    let window = parse_token_count(window_text.trim().trim_end_matches("tokens").trim())?;
    if window <= 0 {
        return None;
    }
    Some((used, window, percent))
}

fn parse_context_category_row(line: &str) -> Option<ContextCategoryUsage> {
    let cells = markdown_row_cells(line);
    if cells.len() < 3 || cells[0].eq_ignore_ascii_case("category") {
        return None;
    }
    Some(ContextCategoryUsage {
        name: cells[0].to_string(),
        tokens: parse_token_count(cells[1])?,
        percent: parse_percent(cells[2]),
    })
}

fn parse_context_tool_row(line: &str) -> Option<ContextToolUsage> {
    let cells = markdown_row_cells(line);
    if cells.len() < 3 || cells[0].eq_ignore_ascii_case("tool") {
        return None;
    }
    Some(ContextToolUsage {
        name: cells[0].to_string(),
        server: Some(cells[1].to_string()).filter(|value| !value.trim().is_empty()),
        tokens: parse_token_count(cells[2])?,
    })
}

fn markdown_row_cells(line: &str) -> Vec<&str> {
    line.trim()
        .trim_matches('|')
        .split('|')
        .map(str::trim)
        .collect()
}

fn parse_percent(value: &str) -> Option<f64> {
    let percent = value.trim().trim_end_matches('%').parse::<f64>().ok()?;
    (percent.is_finite() && percent >= 0.0).then_some(percent)
}

fn parse_token_count(value: &str) -> Option<i64> {
    let normalized = value
        .trim()
        .trim_end_matches("tokens")
        .trim()
        .replace(',', "");
    let (number_text, multiplier) = match normalized
        .chars()
        .last()
        .map(|value| value.to_ascii_lowercase())
    {
        Some('k') => (&normalized[..normalized.len() - 1], 1_000.0),
        Some('m') => (&normalized[..normalized.len() - 1], 1_000_000.0),
        _ => (normalized.as_str(), 1.0),
    };
    let number = number_text.trim().parse::<f64>().ok()?;
    if !number.is_finite() || number < 0.0 {
        return None;
    }
    let tokens = number * multiplier;
    if !tokens.is_finite() || tokens > i64::MAX as f64 {
        return None;
    }
    Some(tokens.round() as i64)
}

fn message_usage(event: &Value) -> Option<&Value> {
    event
        .get("message")
        .and_then(|message| {
            message
                .get("usage")
                .or_else(|| message.get("usage_delta"))
                .or_else(|| message.get("usageDelta"))
        })
        .or_else(|| {
            event
                .get("payload")
                .and_then(|payload| message_usage(payload))
        })
        .or_else(|| event.get("data").and_then(|data| message_usage(data)))
}

fn find_context_window(event: &Value) -> Option<&Value> {
    event
        .get("context_window")
        .or_else(|| event.get("contextWindow"))
        .or_else(|| {
            event
                .get("payload")
                .and_then(|payload| find_context_window(payload))
        })
        .or_else(|| event.get("data").and_then(|data| find_context_window(data)))
        .or_else(|| event.get("hook").and_then(|hook| find_context_window(hook)))
}

fn find_usage(event: &Value) -> Option<&Value> {
    event
        .get("usage")
        .or_else(|| event.get("usage_delta"))
        .or_else(|| event.get("usageDelta"))
        .or_else(|| event.get("payload").and_then(|payload| find_usage(payload)))
        .or_else(|| event.get("data").and_then(|data| find_usage(data)))
}

fn read_usage_totals(usage: &Value) -> ClaudeUsageTotals {
    let input_tokens = usage
        .get("input_tokens")
        .or_else(|| usage.get("inputTokens"))
        .and_then(as_i64);

    let output_tokens = usage
        .get("output_tokens")
        .or_else(|| usage.get("outputTokens"))
        .and_then(as_i64);

    let cache_creation = usage
        .get("cache_creation_input_tokens")
        .or_else(|| usage.get("cacheCreationInputTokens"))
        .or_else(|| usage.get("cache_creation_tokens"))
        .and_then(as_i64)
        .unwrap_or(0);

    let cache_read = usage
        .get("cache_read_input_tokens")
        .or_else(|| usage.get("cacheReadInputTokens"))
        .or_else(|| usage.get("cache_read_tokens"))
        .and_then(as_i64)
        .unwrap_or(0);

    let cached_tokens = if cache_creation > 0 || cache_read > 0 {
        cache_creation.checked_add(cache_read)
    } else {
        None
    };

    ClaudeUsageTotals {
        input_tokens,
        output_tokens,
        cached_tokens,
    }
}

fn as_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return (number >= 0).then_some(number);
    }
    value
        .as_str()
        .and_then(|text| text.parse::<i64>().ok())
        .filter(|number| *number >= 0)
}

fn as_f64(value: &Value) -> Option<f64> {
    if let Some(number) = value.as_f64() {
        return (number.is_finite() && number >= 0.0).then_some(number);
    }
    value
        .as_str()
        .and_then(|text| text.parse::<f64>().ok())
        .filter(|number| number.is_finite() && *number >= 0.0)
}
