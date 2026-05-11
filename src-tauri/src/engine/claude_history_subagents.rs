use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

pub(crate) const CLAUDE_SUBAGENT_SESSION_PREFIX: &str = "subagent:";

#[derive(Debug, Clone)]
pub(crate) struct ClaudeSubagentSessionId {
    pub(crate) parent_session_id: String,
    pub(crate) agent_id: String,
}

impl ClaudeSubagentSessionId {
    pub(crate) fn parse(session_id: &str) -> Option<Self> {
        let payload = session_id.strip_prefix(CLAUDE_SUBAGENT_SESSION_PREFIX)?;
        let (parent_session_id, agent_id) = payload.split_once(':')?;
        Self::from_path_segments(parent_session_id, agent_id)
    }

    pub(crate) fn from_path_segments(parent_session_id: &str, agent_id: &str) -> Option<Self> {
        if is_invalid_claude_session_path_segment(parent_session_id)
            || is_invalid_claude_session_path_segment(agent_id)
        {
            return None;
        }
        Some(Self {
            parent_session_id: parent_session_id.to_string(),
            agent_id: agent_id.to_string(),
        })
    }

    pub(crate) fn to_session_id(&self) -> String {
        format!(
            "{}{}:{}",
            CLAUDE_SUBAGENT_SESSION_PREFIX, self.parent_session_id, self.agent_id
        )
    }

    pub(crate) fn transcript_path(&self, project_dir: &Path) -> PathBuf {
        project_dir
            .join(&self.parent_session_id)
            .join("subagents")
            .join(format!("agent-{}.jsonl", self.agent_id))
    }

    pub(crate) fn meta_path(&self, project_dir: &Path) -> PathBuf {
        project_dir
            .join(&self.parent_session_id)
            .join("subagents")
            .join(format!("agent-{}.meta.json", self.agent_id))
    }
}

pub(crate) fn normalize_claude_session_id(session_id: &str) -> Result<String, String> {
    let normalized = session_id.trim();
    if normalized.starts_with(CLAUDE_SUBAGENT_SESSION_PREFIX) {
        return ClaudeSubagentSessionId::parse(normalized)
            .map(|_| normalized.to_string())
            .ok_or_else(|| "[SESSION_NOT_FOUND] Invalid Claude session id".to_string());
    }

    if is_invalid_claude_session_path_segment(normalized) {
        return Err("[SESSION_NOT_FOUND] Invalid Claude session id".to_string());
    }
    Ok(normalized.to_string())
}

fn is_invalid_claude_session_path_segment(value: &str) -> bool {
    value.is_empty()
        || value == "."
        || value.contains("..")
        || value.chars().any(is_invalid_path_segment_char)
}

fn is_invalid_path_segment_char(ch: char) -> bool {
    matches!(ch, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*') || ch.is_control()
}

fn first_subagent_meta_string(meta: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| super::claude_history::first_non_empty_string(meta.get(*key)))
}

pub(crate) async fn read_subagent_meta(meta_path: &Path) -> (Option<String>, Option<String>) {
    let Ok(contents) = fs::read_to_string(meta_path).await else {
        return (None, None);
    };
    let Ok(meta) = serde_json::from_str::<Value>(&contents) else {
        return (None, None);
    };
    let description = first_subagent_meta_string(&meta, &["description", "agentName", "name"]);
    let agent_type = first_subagent_meta_string(&meta, &["agentType", "subagentType", "type"]);
    (description, agent_type)
}

#[cfg(test)]
mod tests {
    use super::{normalize_claude_session_id, ClaudeSubagentSessionId};

    #[test]
    fn rejects_invalid_subagent_path_segments() {
        for session_id in [
            "subagent:.:agent",
            "subagent:parent:.",
            "subagent:parent:agent/child",
            "subagent:parent:agent\\child",
            "subagent:parent:agent..child",
            "subagent:parent:agent*child",
            "subagent::agent",
            "subagent:parent:",
        ] {
            let error = normalize_claude_session_id(session_id)
                .expect_err("invalid subagent path segment should fail");
            assert!(error.contains("Invalid Claude session id"));
            assert!(ClaudeSubagentSessionId::parse(session_id).is_none());
        }
    }

    #[test]
    fn accepts_valid_subagent_compound_id() {
        let session_id = "subagent:parent-session:a5e6403f261113239";
        assert_eq!(
            normalize_claude_session_id(session_id).expect("valid subagent id"),
            session_id
        );
        let parsed = ClaudeSubagentSessionId::parse(session_id).expect("parse subagent id");
        assert_eq!(parsed.parent_session_id, "parent-session");
        assert_eq!(parsed.agent_id, "a5e6403f261113239");
        assert_eq!(parsed.to_session_id(), session_id);
    }

    #[test]
    fn rejects_invalid_regular_session_path_segments() {
        for session_id in [
            "",
            ".",
            "../escape",
            "folder/session",
            "folder\\session",
            "bad:name",
        ] {
            let error = normalize_claude_session_id(session_id)
                .expect_err("invalid session path segment should fail");
            assert!(error.contains("Invalid Claude session id"));
        }
    }
}
