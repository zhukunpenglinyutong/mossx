use super::ProjectMemoryItem;

pub(super) fn is_conversation_turn_record(item: &ProjectMemoryItem) -> bool {
    item.record_kind.as_deref() == Some("conversation_turn")
        || item.source == "conversation_turn"
        || item.turn_id.as_deref().is_some_and(|turn_id| {
            !turn_id.trim().is_empty()
                && (item
                    .user_input
                    .as_deref()
                    .is_some_and(|text| !text.trim().is_empty())
                    || item
                        .assistant_response
                        .as_deref()
                        .is_some_and(|text| !text.trim().is_empty()))
        })
}
