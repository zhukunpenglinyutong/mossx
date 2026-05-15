use super::ProjectMemorySettings;

pub(super) fn memory_auto_enabled_for_workspace(
    settings: &ProjectMemorySettings,
    workspace_id: &str,
) -> bool {
    if let Some(override_item) = settings.workspace_overrides.get(workspace_id) {
        if let Some(enabled) = override_item.auto_enabled {
            return enabled;
        }
    }
    settings.auto_enabled
}
