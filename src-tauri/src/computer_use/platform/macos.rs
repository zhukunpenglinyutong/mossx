use std::path::{Path, PathBuf};

use crate::computer_use::{parse_helper_command_path, ComputerUseDetectionSnapshot};

use super::{PlatformAdapterResult, PlatformAvailability};

const CODEX_APP_CANDIDATES: &[&str] = &["/Applications/Codex.app", "~/Applications/Codex.app"];

pub(super) fn detect(mut snapshot: ComputerUseDetectionSnapshot) -> PlatformAdapterResult {
    let codex_app_path = detect_codex_app_path();
    snapshot.codex_app_detected = codex_app_path.is_some();

    if let Some(app_path) = codex_app_path.as_ref() {
        let marketplace_path = app_path
            .join("Contents")
            .join("Resources")
            .join("plugins")
            .join("openai-bundled")
            .join(".agents")
            .join("plugins")
            .join("marketplace.json");
        if marketplace_path.is_file() {
            snapshot.marketplace_path = path_to_string(&marketplace_path);
        }

        let helper_descriptor_path = app_path
            .join("Contents")
            .join("Resources")
            .join("plugins")
            .join("openai-bundled")
            .join("plugins")
            .join("computer-use")
            .join(".mcp.json");
        if snapshot.helper_descriptor_path.is_none() && helper_descriptor_path.is_file() {
            snapshot.helper_descriptor_path = path_to_string(&helper_descriptor_path);
            snapshot.helper_path = parse_helper_command_path(&helper_descriptor_path);
            snapshot.helper_present = snapshot
                .helper_path
                .as_ref()
                .map(PathBuf::from)
                .is_some_and(|path| path.is_file());
        }
    }

    PlatformAdapterResult {
        platform: "macos",
        availability: PlatformAvailability::Supported,
        snapshot,
    }
}

fn detect_codex_app_path() -> Option<PathBuf> {
    CODEX_APP_CANDIDATES
        .iter()
        .filter_map(|candidate| expand_tilde(candidate))
        .find(|path| path.is_dir())
}

fn expand_tilde(value: &str) -> Option<PathBuf> {
    if let Some(rest) = value.strip_prefix("~/") {
        let home = dirs::home_dir()?;
        return Some(home.join(rest));
    }
    Some(PathBuf::from(value))
}

fn path_to_string(path: &Path) -> Option<String> {
    path.to_str().map(|value| value.to_string())
}
