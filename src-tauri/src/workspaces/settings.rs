use std::collections::HashMap;

use crate::types::{WorkspaceEntry, WorkspaceSettings};

pub(crate) fn apply_workspace_settings_update(
    workspaces: &mut HashMap<String, WorkspaceEntry>,
    id: &str,
    settings: WorkspaceSettings,
) -> Result<WorkspaceEntry, String> {
    match workspaces.get_mut(id) {
        Some(entry) => {
            entry.settings = settings.clone();
            Ok(entry.clone())
        }
        None => Err("workspace not found".to_string()),
    }
}
