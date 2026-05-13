use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMemoryItem {
    pub id: String,
    pub workspace_id: String,
    #[serde(default)]
    pub schema_version: Option<u32>,
    #[serde(default)]
    pub record_kind: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub detail: Option<String>,
    pub raw_text: Option<String>,
    pub clean_text: String,
    pub tags: Vec<String>,
    pub importance: String,
    pub thread_id: Option<String>,
    #[serde(default)]
    pub turn_id: Option<String>,
    pub message_id: Option<String>,
    #[serde(default)]
    pub assistant_message_id: Option<String>,
    #[serde(default)]
    pub user_input: Option<String>,
    #[serde(default)]
    pub assistant_response: Option<String>,
    #[serde(default)]
    pub assistant_thinking_summary: Option<String>,
    pub source: String,
    pub fingerprint: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceMemoryOverride {
    pub auto_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMemorySettings {
    pub auto_enabled: bool,
    pub capture_mode: String,
    pub dedupe_enabled: bool,
    pub desensitize_enabled: bool,
    pub workspace_overrides: HashMap<String, WorkspaceMemoryOverride>,
}

impl Default for ProjectMemorySettings {
    fn default() -> Self {
        Self {
            auto_enabled: true,
            capture_mode: "balanced".to_string(),
            dedupe_enabled: true,
            desensitize_enabled: true,
            workspace_overrides: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMemoryListResult {
    pub items: Vec<ProjectMemoryItem>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectMemoryInput {
    pub workspace_id: String,
    pub schema_version: Option<u32>,
    pub record_kind: Option<String>,
    pub kind: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub detail: Option<String>,
    pub tags: Option<Vec<String>>,
    pub importance: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub message_id: Option<String>,
    pub assistant_message_id: Option<String>,
    pub user_input: Option<String>,
    pub assistant_response: Option<String>,
    pub assistant_thinking_summary: Option<String>,
    pub source: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_path: Option<String>,
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateProjectMemoryInput {
    pub schema_version: Option<u32>,
    pub record_kind: Option<String>,
    pub kind: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub detail: Option<String>,
    pub tags: Option<Vec<String>>,
    pub importance: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub message_id: Option<String>,
    pub assistant_message_id: Option<String>,
    pub user_input: Option<String>,
    pub assistant_response: Option<String>,
    pub assistant_thinking_summary: Option<String>,
    pub source: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_path: Option<String>,
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutoCaptureInput {
    pub workspace_id: String,
    pub text: String,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub message_id: Option<String>,
    pub source: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_path: Option<String>,
    pub engine: Option<String>,
}
