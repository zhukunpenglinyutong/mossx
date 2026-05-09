use std::collections::HashMap;

use crate::shared::workspaces_core::normalize_visible_thread_root_count;
use crate::types::{WorkspaceEntry, WorkspaceSettings};

pub(crate) fn apply_workspace_settings_update(
    workspaces: &mut HashMap<String, WorkspaceEntry>,
    id: &str,
    mut settings: WorkspaceSettings,
) -> Result<WorkspaceEntry, String> {
    settings.visible_thread_root_count =
        normalize_visible_thread_root_count(settings.visible_thread_root_count);

    match workspaces.get_mut(id) {
        Some(entry) => {
            entry.settings = settings.clone();
            Ok(entry.clone())
        }
        None => Err("workspace not found".to_string()),
    }
}
