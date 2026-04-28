use serde_json::Value;

pub(super) fn extract_json_value(raw: &str) -> Option<Value> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Value>(&raw[start..=end]).ok()
}

pub(super) fn sanitize_run_worktree_name(value: &str) -> String {
    let normalized = value.trim().to_ascii_lowercase().replace('\\', "/");
    let mut segments = Vec::new();
    for raw_segment in normalized.split('/') {
        let segment = sanitize_worktree_name_segment(raw_segment);
        if !segment.is_empty() {
            segments.push(segment);
        }
    }
    let cleaned = segments.join("/");
    let allowed_types = [
        "feat", "fix", "chore", "test", "docs", "refactor", "perf", "build", "ci", "style",
    ];
    for allowed_type in allowed_types.iter() {
        if cleaned == *allowed_type {
            return format!("{allowed_type}/task");
        }
        let slash_prefix = format!("{allowed_type}/");
        if cleaned.starts_with(&slash_prefix) {
            return cleaned;
        }
        let dash_prefix = format!("{allowed_type}-");
        if let Some(suffix) = cleaned.strip_prefix(&dash_prefix) {
            let suffix = suffix.trim_matches('-');
            if suffix.is_empty() {
                return format!("{allowed_type}/task");
            }
            return format!("{allowed_type}/{suffix}");
        }
    }
    if cleaned.is_empty() {
        return "feat/task".to_string();
    }
    format!("feat/{}", cleaned.trim_start_matches('/'))
}

fn sanitize_worktree_name_segment(value: &str) -> String {
    let trimmed = value.trim();
    let mut cleaned = String::new();
    let mut last_dash = false;
    for ch in trimmed.chars() {
        let next = if ch.is_ascii_alphanumeric() {
            last_dash = false;
            Some(ch)
        } else if ch == '-' || ch.is_whitespace() || ch == '_' {
            if last_dash || cleaned.is_empty() {
                None
            } else {
                last_dash = true;
                Some('-')
            }
        } else {
            None
        };
        if let Some(ch) = next {
            cleaned.push(ch);
        }
    }
    while cleaned.ends_with('-') {
        cleaned.pop();
    }
    cleaned
}

#[cfg(test)]
mod tests {
    use super::sanitize_run_worktree_name;

    #[test]
    fn sanitize_run_worktree_name_keeps_valid_type_prefix() {
        assert_eq!(
            sanitize_run_worktree_name("fix/windows Path Bug"),
            "fix/windows-path-bug"
        );
    }

    #[test]
    fn sanitize_run_worktree_name_converts_dash_prefix() {
        assert_eq!(
            sanitize_run_worktree_name("refactor-large-files"),
            "refactor/large-files"
        );
    }

    #[test]
    fn sanitize_run_worktree_name_falls_back_for_empty_or_type_only_values() {
        assert_eq!(sanitize_run_worktree_name("   "), "feat/task");
        assert_eq!(sanitize_run_worktree_name("feat"), "feat/task");
        assert_eq!(sanitize_run_worktree_name("feat-"), "feat/task");
    }

    #[test]
    fn sanitize_run_worktree_name_collapses_escaped_or_empty_segments() {
        assert_eq!(sanitize_run_worktree_name("feat/../demo"), "feat/demo");
        assert_eq!(
            sanitize_run_worktree_name("docs\\\\api plan"),
            "docs/api-plan"
        );
    }
}
