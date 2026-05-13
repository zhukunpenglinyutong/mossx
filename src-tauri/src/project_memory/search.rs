use super::ProjectMemoryItem;

struct MemorySearchEntry {
    item: ProjectMemoryItem,
    kind: String,
    importance: String,
    tags: Vec<String>,
    haystack: String,
}

impl MemorySearchEntry {
    fn new(item: ProjectMemoryItem) -> Self {
        let kind = item.kind.to_lowercase();
        let importance = item.importance.to_lowercase();
        let tags = item
            .tags
            .iter()
            .map(|entry| entry.to_lowercase())
            .collect::<Vec<String>>();
        let haystack = format!(
            "{} {} {}",
            item.title.to_lowercase(),
            item.summary.to_lowercase(),
            item.clean_text.to_lowercase()
        );
        Self {
            item,
            kind,
            importance,
            tags,
            haystack,
        }
    }
}

pub(super) fn parse_tag_filters(input: Option<&str>) -> Vec<String> {
    input
        .unwrap_or_default()
        .split(|c| c == ',' || c == '，')
        .map(|entry| entry.trim().to_lowercase())
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<String>>()
}

pub(super) fn filter_project_memory_items(
    data: Vec<ProjectMemoryItem>,
    workspace_id: &str,
    query: Option<&str>,
    kind: Option<&str>,
    importance: Option<&str>,
    tag: Option<&str>,
) -> Vec<ProjectMemoryItem> {
    let normalized_query = query.unwrap_or("").trim().to_lowercase();
    let normalized_kind = kind.unwrap_or("").trim().to_lowercase();
    let normalized_importance = importance.unwrap_or("").trim().to_lowercase();
    let normalized_tags = parse_tag_filters(tag);

    data.into_iter()
        .filter(|item| item.deleted_at.is_none() && item.workspace_id == workspace_id)
        .map(MemorySearchEntry::new)
        .filter(|entry| normalized_kind.is_empty() || entry.kind == normalized_kind)
        .filter(|entry| {
            normalized_importance.is_empty() || entry.importance == normalized_importance
        })
        .filter(|entry| {
            normalized_tags.is_empty()
                || normalized_tags
                    .iter()
                    .any(|needle| entry.tags.iter().any(|tag| tag == needle))
        })
        .filter(|entry| normalized_query.is_empty() || entry.haystack.contains(&normalized_query))
        .map(|entry| entry.item)
        .collect()
}
