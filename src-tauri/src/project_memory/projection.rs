use super::{
    build_summary, build_title, calculate_fingerprint, classify_importance, classify_kind,
    extract_auto_tags, is_conversation_turn_record, normalize_text, ProjectMemoryItem,
};

pub(super) fn normalized_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(text)
        }
    })
}

pub(super) fn normalized_review_state(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_string();
    match normalized.as_str() {
        "unreviewed" | "kept" | "converted" | "obsolete" | "dismissed" => Some(normalized),
        _ => None,
    }
}

pub(super) fn build_conversation_turn_detail(
    user_input: Option<&str>,
    assistant_response: Option<&str>,
    assistant_thinking_summary: Option<&str>,
) -> String {
    let mut sections: Vec<String> = Vec::new();
    if let Some(input) = user_input.map(str::trim).filter(|text| !text.is_empty()) {
        sections.push(format!("用户输入：\n{input}"));
    }
    if let Some(response) = assistant_response
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        sections.push(format!("AI 回复：\n{response}"));
    }
    if let Some(thinking) = assistant_thinking_summary
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        sections.push(format!("思考摘要：\n{thinking}"));
    }
    sections.join("\n\n")
}

pub(super) fn build_conversation_turn_clean_text(
    user_input: Option<&str>,
    assistant_response: Option<&str>,
    assistant_thinking_summary: Option<&str>,
) -> String {
    [user_input, assistant_response, assistant_thinking_summary]
        .into_iter()
        .flatten()
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<&str>>()
        .join("\n\n")
}

pub(super) fn apply_conversation_turn_projection(item: &mut ProjectMemoryItem) {
    if item.record_kind.as_deref() != Some("conversation_turn") {
        return;
    }
    let clean_source = build_conversation_turn_clean_text(
        item.user_input.as_deref(),
        item.assistant_response.as_deref(),
        item.assistant_thinking_summary.as_deref(),
    );
    if clean_source.trim().is_empty() {
        return;
    }
    let clean_text = normalize_text(&clean_source, false);
    let detail = build_conversation_turn_detail(
        item.user_input.as_deref(),
        item.assistant_response.as_deref(),
        item.assistant_thinking_summary.as_deref(),
    );
    item.clean_text = clean_text.clone();
    item.detail = if detail.trim().is_empty() {
        None
    } else {
        Some(detail.clone())
    };
    item.raw_text = Some(clean_source);
    item.title = if item.title.trim().is_empty() || item.title == "Untitled Memory" {
        item.assistant_response
            .as_deref()
            .map(|text| normalize_text(text, false))
            .filter(|text| !text.trim().is_empty())
            .map(|text| build_title(&text))
            .or_else(|| {
                item.user_input
                    .as_deref()
                    .map(|text| normalize_text(text, false))
                    .filter(|text| !text.trim().is_empty())
                    .map(|text| build_title(&text))
            })
            .unwrap_or_else(|| build_title(&clean_text))
    } else {
        item.title.clone()
    };
    item.summary = item
        .assistant_response
        .as_deref()
        .map(|text| normalize_text(text, false))
        .filter(|text| !text.trim().is_empty())
        .map(|text| build_summary(&text))
        .unwrap_or_else(|| build_summary(&clean_text));
    item.fingerprint = calculate_fingerprint(&item.workspace_id, &clean_text);
    if item.kind == "note" {
        item.kind = classify_kind(&clean_text);
        if item.kind == "note" {
            item.kind = "conversation".to_string();
        }
    }
    if item.tags.is_empty() {
        item.tags = extract_auto_tags(&clean_text);
    }
    if item.importance.trim().is_empty() {
        item.importance = classify_importance(&clean_text);
    }
}

pub(super) fn apply_delete_semantics(
    items: &mut Vec<ProjectMemoryItem>,
    memory_id: &str,
    current_ms: i64,
) -> bool {
    let Some(index) = items
        .iter()
        .position(|item| item.id == memory_id && item.deleted_at.is_none())
    else {
        return false;
    };
    if is_conversation_turn_record(&items[index]) {
        items.remove(index);
        return true;
    }
    let item = &mut items[index];
    item.deleted_at = Some(current_ms);
    item.updated_at = current_ms;
    true
}
