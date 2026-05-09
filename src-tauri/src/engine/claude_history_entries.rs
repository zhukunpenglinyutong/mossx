use serde_json::Value;

pub(crate) const CLAUDE_CONTROL_EVENT_TOOL_TYPE: &str = "claudeControlEvent";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ClaudeLocalControlEventType {
    ResumeFailed,
    ModelChanged,
    Interrupted,
    LocalCommandOutput,
}

impl ClaudeLocalControlEventType {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::ResumeFailed => "resumeFailed",
            Self::ModelChanged => "modelChanged",
            Self::Interrupted => "interrupted",
            Self::LocalCommandOutput => "localCommandOutput",
        }
    }

    pub(crate) fn title(&self) -> &'static str {
        match self {
            Self::ResumeFailed => "Resume failed",
            Self::ModelChanged => "Model changed",
            Self::Interrupted => "Interrupted",
            Self::LocalCommandOutput => "Local command output",
        }
    }

    pub(crate) fn status(&self) -> &'static str {
        match self {
            Self::ResumeFailed => "failed",
            Self::ModelChanged | Self::Interrupted | Self::LocalCommandOutput => "completed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ClaudeLocalControlEvent {
    pub(crate) event_type: ClaudeLocalControlEventType,
    pub(crate) detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ClaudeHistoryEntryClassification {
    Normal,
    Hidden(ClaudeHistoryHiddenReason),
    Displayable(ClaudeLocalControlEvent),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ClaudeHistoryHiddenReason {
    ControlPlane,
    SyntheticRuntime,
    InternalRecord,
    Quarantine,
}

pub(crate) fn extract_text_from_content(content: &Value) -> Option<String> {
    match content {
        Value::String(s) => {
            let text = s.trim();
            if text.is_empty() {
                None
            } else {
                Some(text.to_string())
            }
        }
        Value::Array(arr) => {
            for block in arr {
                if let Some(block_type) = block.get("type").and_then(|v| v.as_str()) {
                    if block_type == "text" {
                        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                return Some(trimmed.to_string());
                            }
                        }
                    }
                }
            }
            None
        }
        _ => None,
    }
}

fn unwrap_tagged_text<'a>(text: &'a str, tag: &str) -> Option<&'a str> {
    let trimmed = text.trim();
    let open = format!("<{}>", tag);
    let inner = trimmed.strip_prefix(&open)?;
    let close = format!("</{}>", tag);
    Some(inner.strip_suffix(&close).unwrap_or(inner).trim())
}

fn strip_ansi_escape_sequences(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(character) = chars.next() {
        if character != '\u{1b}' {
            output.push(character);
            continue;
        }
        if chars.peek() != Some(&'[') {
            continue;
        }
        chars.next();
        for sequence_character in chars.by_ref() {
            let codepoint = sequence_character as u32;
            if (0x40..=0x7e).contains(&codepoint) {
                break;
            }
        }
    }
    output
}

fn sanitize_claude_local_control_text(text: &str) -> String {
    let mut cleaned = text.trim().to_string();
    for tag in [
        "command-name",
        "command-message",
        "command-args",
        "local-command-stdout",
        "local-command-stderr",
        "local-command-caveat",
    ] {
        if let Some(unwrapped) = unwrap_tagged_text(&cleaned, tag) {
            cleaned = unwrapped.to_string();
            break;
        }
    }
    strip_ansi_escape_sequences(&cleaned).trim().to_string()
}

fn is_internal_only_claude_entry_type(value: &str) -> bool {
    matches!(
        value.trim(),
        "permission-mode"
            | "file-history-snapshot"
            | "last-prompt"
            | "queue-operation"
            | "attachment"
            | "mcp_instructions_delta"
            | "skill_listing"
            | "stop_hook_summary"
            | "turn_duration"
            | "local_command"
    )
}

fn is_internal_only_claude_entry(entry: &Value) -> bool {
    for key in ["type", "subtype", "event", "kind"] {
        if entry
            .get(key)
            .and_then(Value::as_str)
            .map(is_internal_only_claude_entry_type)
            .unwrap_or(false)
        {
            return true;
        }
    }

    if entry.get("type").and_then(Value::as_str) == Some("system")
        && entry.get("subtype").and_then(Value::as_str) == Some("local_command")
    {
        return true;
    }

    if let Some(message) = entry.get("message") {
        if message
            .get("type")
            .and_then(Value::as_str)
            .map(|value| value == "system")
            .unwrap_or(false)
            && message
                .get("subtype")
                .and_then(Value::as_str)
                .map(|value| value == "local_command")
                .unwrap_or(false)
        {
            return true;
        }

        return ["type", "subtype", "event", "kind"].iter().any(|key| {
            message
                .get(*key)
                .and_then(Value::as_str)
                .map(is_internal_only_claude_entry_type)
                .unwrap_or(false)
        });
    }

    false
}

fn is_synthetic_no_response(entry: &Value, msg: &Value, text: &str) -> bool {
    let is_no_response = sanitize_claude_local_control_text(text) == "No response requested.";
    is_no_response
        && ((msg.get("role").and_then(Value::as_str) == Some("assistant")
            && msg.get("model").and_then(Value::as_str) == Some("<synthetic>"))
            || entry.get("model").and_then(Value::as_str) == Some("<synthetic>"))
}

fn is_synthetic_continuation_summary_text(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.starts_with(
        "This session is being continued from a previous conversation that ran out of context.",
    ) && trimmed.contains("Summary:")
        && trimmed.contains("Primary Request and Intent")
}

fn bool_field(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn has_synthetic_continuation_type_marker(value: &Value) -> bool {
    ["type", "subtype", "event", "kind"].iter().any(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(|raw| {
                matches!(
                    raw.trim(),
                    "summary"
                        | "synthetic_summary"
                        | "synthetic-runtime"
                        | "synthetic_runtime"
                        | "continuation_summary"
                        | "compaction_summary"
                        | "resume_summary"
                )
            })
            .unwrap_or(false)
    })
}

fn has_synthetic_continuation_provenance(entry: &Value, msg: &Value) -> bool {
    bool_field(entry, "isMeta")
        || bool_field(msg, "isMeta")
        || bool_field(entry, "isSynthetic")
        || bool_field(msg, "isSynthetic")
        || bool_field(entry, "isVisibleInTranscriptOnly")
        || bool_field(msg, "isVisibleInTranscriptOnly")
        || bool_field(entry, "isCompactSummary")
        || bool_field(msg, "isCompactSummary")
        || entry.get("model").and_then(Value::as_str) == Some("<synthetic>")
        || msg.get("model").and_then(Value::as_str) == Some("<synthetic>")
        || has_synthetic_continuation_type_marker(entry)
        || has_synthetic_continuation_type_marker(msg)
}

fn is_synthetic_continuation_summary(entry: &Value, msg: &Value, text: &str) -> bool {
    if !is_synthetic_continuation_summary_text(text) {
        return false;
    }
    let role = msg.get("role").and_then(Value::as_str).unwrap_or("");
    role == "user" && has_synthetic_continuation_provenance(entry, msg)
}

fn classify_claude_local_control_text(
    entry: &Value,
    msg: &Value,
    text: &str,
) -> ClaudeHistoryEntryClassification {
    let trimmed = text.trim();
    let sanitized = sanitize_claude_local_control_text(trimmed);
    if sanitized.is_empty() {
        return ClaudeHistoryEntryClassification::Hidden(ClaudeHistoryHiddenReason::Quarantine);
    }

    if is_synthetic_no_response(entry, msg, trimmed) {
        return ClaudeHistoryEntryClassification::Hidden(
            ClaudeHistoryHiddenReason::SyntheticRuntime,
        );
    }

    if is_synthetic_continuation_summary(entry, msg, trimmed) {
        return ClaudeHistoryEntryClassification::Hidden(
            ClaudeHistoryHiddenReason::SyntheticRuntime,
        );
    }

    if trimmed == "[Request interrupted by user]" {
        return ClaudeHistoryEntryClassification::Displayable(ClaudeLocalControlEvent {
            event_type: ClaudeLocalControlEventType::Interrupted,
            detail: sanitized,
        });
    }

    if trimmed.starts_with("<command-name>")
        || trimmed.starts_with("<command-message>")
        || trimmed.starts_with("<command-args>")
        || trimmed.starts_with("<local-command-caveat>")
    {
        return ClaudeHistoryEntryClassification::Hidden(ClaudeHistoryHiddenReason::InternalRecord);
    }

    if sanitized.contains(
        "Caveat: The messages below were generated by the user while running local commands",
    ) || sanitized.contains("Warmup")
    {
        return ClaudeHistoryEntryClassification::Hidden(ClaudeHistoryHiddenReason::InternalRecord);
    }

    let is_local_stdout = trimmed.starts_with("<local-command-stdout>");
    let is_local_stderr = trimmed.starts_with("<local-command-stderr>");
    if is_local_stdout || is_local_stderr {
        let lower = sanitized.to_ascii_lowercase();
        let event_type = if lower.contains("session ") && lower.contains(" was not found") {
            ClaudeLocalControlEventType::ResumeFailed
        } else if lower.starts_with("set model to ") || lower.contains(" set model to ") {
            ClaudeLocalControlEventType::ModelChanged
        } else if sanitized.chars().count() <= 240 {
            ClaudeLocalControlEventType::LocalCommandOutput
        } else {
            return ClaudeHistoryEntryClassification::Hidden(
                ClaudeHistoryHiddenReason::InternalRecord,
            );
        };
        return ClaudeHistoryEntryClassification::Displayable(ClaudeLocalControlEvent {
            event_type,
            detail: sanitized,
        });
    }

    ClaudeHistoryEntryClassification::Normal
}

pub(crate) fn classify_claude_history_entry(entry: &Value) -> ClaudeHistoryEntryClassification {
    if is_claude_control_plane_entry(entry) {
        return ClaudeHistoryEntryClassification::Hidden(ClaudeHistoryHiddenReason::ControlPlane);
    }
    if is_internal_only_claude_entry(entry) {
        return ClaudeHistoryEntryClassification::Hidden(ClaudeHistoryHiddenReason::InternalRecord);
    }

    let Some(msg) = entry.get("message") else {
        return ClaudeHistoryEntryClassification::Normal;
    };
    let Some(content) = msg.get("content") else {
        return ClaudeHistoryEntryClassification::Normal;
    };
    let Some(text) = extract_text_from_content(content) else {
        return ClaudeHistoryEntryClassification::Normal;
    };

    classify_claude_local_control_text(entry, msg, &text)
}

fn value_contains_key_recursive(value: &Value, target_key: &str) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, nested)| {
            key == target_key || value_contains_key_recursive(nested, target_key)
        }),
        Value::Array(items) => items
            .iter()
            .any(|nested| value_contains_key_recursive(nested, target_key)),
        _ => false,
    }
}

fn value_contains_string_recursive(value: &Value, needle: &str) -> bool {
    match value {
        Value::String(text) => text.contains(needle),
        Value::Object(map) => map
            .values()
            .any(|nested| value_contains_string_recursive(nested, needle)),
        Value::Array(items) => items
            .iter()
            .any(|nested| value_contains_string_recursive(nested, needle)),
        _ => false,
    }
}

fn is_ccgui_client_info(value: &Value) -> bool {
    let Some(client_info) = value.get("clientInfo").and_then(Value::as_object) else {
        return false;
    };
    ["name", "title"].iter().any(|key| {
        client_info
            .get(*key)
            .and_then(Value::as_str)
            .map(|text| text.eq_ignore_ascii_case("ccgui"))
            .unwrap_or(false)
    })
}

fn has_experimental_api_capability(value: &Value) -> bool {
    value
        .get("capabilities")
        .and_then(|capabilities| capabilities.get("experimentalApi"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn is_codex_app_server_text(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed == "app-server"
        || trimmed.ends_with(" app-server")
        || trimmed.contains("codex app-server")
        || trimmed.contains("developer_instructions=")
}

fn content_contains_codex_app_server_control_plane(content: &Value) -> bool {
    match content {
        Value::String(text) => is_codex_app_server_text(text),
        Value::Array(blocks) => blocks.iter().any(|block| {
            block
                .get("text")
                .and_then(Value::as_str)
                .map(is_codex_app_server_text)
                .unwrap_or(false)
        }),
        _ => false,
    }
}

pub(crate) fn is_claude_control_plane_entry(entry: &Value) -> bool {
    let method = entry.get("method").and_then(Value::as_str).or_else(|| {
        entry
            .get("message")
            .and_then(|message| message.get("method"))
            .and_then(Value::as_str)
    });
    if method == Some("initialize") {
        return true;
    }

    let params = entry
        .get("params")
        .or_else(|| entry.get("payload"))
        .or_else(|| {
            entry
                .get("message")
                .and_then(|message| message.get("params"))
        });
    if let Some(params) = params {
        if is_ccgui_client_info(params) && has_experimental_api_capability(params) {
            return true;
        }
    }

    if value_contains_key_recursive(entry, "developer_instructions")
        || value_contains_string_recursive(entry, "developer_instructions=")
    {
        return true;
    }

    entry
        .get("message")
        .and_then(|message| message.get("content"))
        .map(content_contains_codex_app_server_control_plane)
        .unwrap_or(false)
}
