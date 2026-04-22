use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::codex::{config as codex_config, home as codex_home};

mod platform;

const COMPUTER_USE_BRIDGE_ENABLED: bool = true;
const COMPUTER_USE_PLUGIN_ID: &str = "computer-use@openai-bundled";
const COMPUTER_USE_PLUGIN_NAME: &str = "computer-use";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ComputerUseAvailabilityStatus {
    Ready,
    Blocked,
    Unavailable,
    Unsupported,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ComputerUseBlockedReason {
    PlatformUnsupported,
    CodexAppMissing,
    PluginMissing,
    PluginDisabled,
    HelperMissing,
    HelperBridgeUnverified,
    PermissionRequired,
    ApprovalRequired,
    UnknownPrerequisite,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ComputerUseGuidanceCode {
    UnsupportedPlatform,
    InstallCodexApp,
    InstallOfficialPlugin,
    EnableOfficialPlugin,
    VerifyHelperInstallation,
    VerifyHelperBridge,
    GrantSystemPermissions,
    ReviewAllowedApps,
    InspectOfficialCodexSetup,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUseBridgeStatus {
    pub(crate) feature_enabled: bool,
    pub(crate) status: ComputerUseAvailabilityStatus,
    pub(crate) platform: String,
    pub(crate) codex_app_detected: bool,
    pub(crate) plugin_detected: bool,
    pub(crate) plugin_enabled: bool,
    pub(crate) blocked_reasons: Vec<ComputerUseBlockedReason>,
    pub(crate) guidance_codes: Vec<ComputerUseGuidanceCode>,
    pub(crate) codex_config_path: Option<String>,
    pub(crate) plugin_manifest_path: Option<String>,
    pub(crate) helper_path: Option<String>,
    pub(crate) helper_descriptor_path: Option<String>,
    pub(crate) marketplace_path: Option<String>,
    pub(crate) diagnostic_message: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ComputerUseDetectionSnapshot {
    codex_app_detected: bool,
    plugin_detected: bool,
    plugin_enabled: bool,
    helper_present: bool,
    helper_bridge_verified: bool,
    permission_verified: bool,
    approval_verified: bool,
    codex_config_path: Option<String>,
    plugin_manifest_path: Option<String>,
    helper_path: Option<String>,
    helper_descriptor_path: Option<String>,
    marketplace_path: Option<String>,
    diagnostic_message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlatformAvailability {
    Supported,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PlatformAdapterResult {
    platform: &'static str,
    availability: PlatformAvailability,
    snapshot: ComputerUseDetectionSnapshot,
}

#[tauri::command]
pub(crate) async fn get_computer_use_bridge_status() -> Result<ComputerUseBridgeStatus, String> {
    tokio::task::spawn_blocking(resolve_computer_use_bridge_status)
        .await
        .map_err(|error| format!("failed to join computer use bridge status task: {error}"))
}

pub(crate) fn resolve_computer_use_bridge_status() -> ComputerUseBridgeStatus {
    if !COMPUTER_USE_BRIDGE_ENABLED {
        return ComputerUseBridgeStatus {
            feature_enabled: false,
            status: ComputerUseAvailabilityStatus::Unavailable,
            platform: platform::platform_name().to_string(),
            codex_app_detected: false,
            plugin_detected: false,
            plugin_enabled: false,
            blocked_reasons: Vec::new(),
            guidance_codes: Vec::new(),
            codex_config_path: codex_config::config_toml_path().and_then(path_to_string),
            plugin_manifest_path: None,
            helper_path: None,
            helper_descriptor_path: None,
            marketplace_path: None,
            diagnostic_message: Some("computer use bridge is disabled by host flag".to_string()),
        };
    }

    let adapter_result = platform::detect_platform_state(detect_computer_use_snapshot());
    build_bridge_status(adapter_result)
}

fn detect_computer_use_snapshot() -> ComputerUseDetectionSnapshot {
    let mut snapshot = ComputerUseDetectionSnapshot {
        codex_config_path: codex_config::config_toml_path().and_then(path_to_string),
        ..ComputerUseDetectionSnapshot::default()
    };

    let config_path = snapshot
        .codex_config_path
        .as_ref()
        .map(PathBuf::from)
        .or_else(codex_config::config_toml_path);

    if let Some(path) = config_path.as_ref() {
        match read_plugin_enabled_from_config(path) {
            Ok(Some(enabled)) => {
                snapshot.plugin_detected = true;
                snapshot.plugin_enabled = enabled;
            }
            Ok(None) => {}
            Err(error) => {
                snapshot.diagnostic_message = Some(error);
            }
        }
    }

    let cache_root = resolve_computer_use_cache_root();
    if let Some(manifest_path) = detect_plugin_manifest_path(cache_root.as_deref()) {
        snapshot.plugin_detected = true;
        snapshot.plugin_manifest_path = path_to_string(manifest_path);
    }

    snapshot
}

fn build_bridge_status(adapter_result: PlatformAdapterResult) -> ComputerUseBridgeStatus {
    let snapshot = adapter_result.snapshot;
    let (status, blocked_reasons, guidance_codes) =
        classify_status(adapter_result.availability, &snapshot);

    ComputerUseBridgeStatus {
        feature_enabled: COMPUTER_USE_BRIDGE_ENABLED,
        status,
        platform: adapter_result.platform.to_string(),
        codex_app_detected: snapshot.codex_app_detected,
        plugin_detected: snapshot.plugin_detected,
        plugin_enabled: snapshot.plugin_enabled,
        blocked_reasons,
        guidance_codes,
        codex_config_path: snapshot.codex_config_path,
        plugin_manifest_path: snapshot.plugin_manifest_path,
        helper_path: snapshot.helper_path,
        helper_descriptor_path: snapshot.helper_descriptor_path,
        marketplace_path: snapshot.marketplace_path,
        diagnostic_message: snapshot.diagnostic_message,
    }
}

fn classify_status(
    availability: PlatformAvailability,
    snapshot: &ComputerUseDetectionSnapshot,
) -> (
    ComputerUseAvailabilityStatus,
    Vec<ComputerUseBlockedReason>,
    Vec<ComputerUseGuidanceCode>,
) {
    if availability == PlatformAvailability::Unsupported {
        return (
            ComputerUseAvailabilityStatus::Unsupported,
            vec![ComputerUseBlockedReason::PlatformUnsupported],
            vec![ComputerUseGuidanceCode::UnsupportedPlatform],
        );
    }

    if !snapshot.codex_app_detected {
        return (
            ComputerUseAvailabilityStatus::Unavailable,
            vec![ComputerUseBlockedReason::CodexAppMissing],
            vec![ComputerUseGuidanceCode::InstallCodexApp],
        );
    }

    if !snapshot.plugin_detected {
        return (
            ComputerUseAvailabilityStatus::Unavailable,
            vec![ComputerUseBlockedReason::PluginMissing],
            vec![ComputerUseGuidanceCode::InstallOfficialPlugin],
        );
    }

    if !snapshot.plugin_enabled {
        return (
            ComputerUseAvailabilityStatus::Blocked,
            vec![ComputerUseBlockedReason::PluginDisabled],
            vec![ComputerUseGuidanceCode::EnableOfficialPlugin],
        );
    }

    if !snapshot.helper_present {
        return (
            ComputerUseAvailabilityStatus::Blocked,
            vec![ComputerUseBlockedReason::HelperMissing],
            vec![ComputerUseGuidanceCode::VerifyHelperInstallation],
        );
    }

    let mut blocked_reasons = Vec::new();
    let mut guidance_codes = Vec::new();

    if !snapshot.helper_bridge_verified {
        blocked_reasons.push(ComputerUseBlockedReason::HelperBridgeUnverified);
        guidance_codes.push(ComputerUseGuidanceCode::VerifyHelperBridge);
    }

    if !snapshot.permission_verified {
        blocked_reasons.push(ComputerUseBlockedReason::PermissionRequired);
        guidance_codes.push(ComputerUseGuidanceCode::GrantSystemPermissions);
    }

    if !snapshot.approval_verified {
        blocked_reasons.push(ComputerUseBlockedReason::ApprovalRequired);
        guidance_codes.push(ComputerUseGuidanceCode::ReviewAllowedApps);
    }

    if !blocked_reasons.is_empty() {
        return (
            ComputerUseAvailabilityStatus::Blocked,
            blocked_reasons,
            dedupe_guidance_codes(guidance_codes),
        );
    }

    (ComputerUseAvailabilityStatus::Ready, Vec::new(), Vec::new())
}

fn dedupe_guidance_codes(
    guidance_codes: Vec<ComputerUseGuidanceCode>,
) -> Vec<ComputerUseGuidanceCode> {
    let mut deduped = Vec::new();
    for code in guidance_codes {
        if !deduped.contains(&code) {
            deduped.push(code);
        }
    }
    deduped
}

fn resolve_computer_use_cache_root() -> Option<PathBuf> {
    codex_home::resolve_default_codex_home().map(|root| {
        root.join("plugins")
            .join("cache")
            .join("openai-bundled")
            .join(COMPUTER_USE_PLUGIN_NAME)
    })
}

fn detect_plugin_manifest_path(cache_root: Option<&Path>) -> Option<PathBuf> {
    let root = cache_root?;
    let entries = fs::read_dir(root).ok()?;
    let mut manifests = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }
            let manifest_path = entry.path().join(".codex-plugin").join("plugin.json");
            manifest_path.is_file().then_some(manifest_path)
        })
        .collect::<Vec<_>>();

    manifests.sort();
    manifests.pop()
}

fn read_plugin_enabled_from_config(path: &Path) -> Result<Option<bool>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("failed to read codex config {}: {error}", path.display()))?;
    let parsed: toml::Value = toml::from_str(&contents)
        .map_err(|error| format!("failed to parse codex config {}: {error}", path.display()))?;

    Ok(parsed
        .get("plugins")
        .and_then(|value| value.as_table())
        .and_then(|plugins| plugins.get(COMPUTER_USE_PLUGIN_ID))
        .and_then(|plugin| plugin.as_table())
        .and_then(|plugin| plugin.get("enabled"))
        .and_then(|value| value.as_bool()))
}

fn path_to_string(path: PathBuf) -> Option<String> {
    path.to_str().map(|value| value.to_string())
}

pub(crate) fn parse_helper_command_path(path: &Path) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let server = payload
        .get("mcpServers")
        .and_then(|value| value.as_object())
        .and_then(|servers| servers.values().next())?;

    let command = PathBuf::from(server.get("command").and_then(|value| value.as_str())?);
    let resolved_path = if command.is_absolute() {
        command
    } else {
        let descriptor_dir = path.parent()?;
        let working_directory = server
            .get("cwd")
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .map(|cwd| {
                if cwd.is_absolute() {
                    cwd
                } else {
                    descriptor_dir.join(cwd)
                }
            })
            .unwrap_or_else(|| descriptor_dir.to_path_buf());

        normalize_path(working_directory.join(command))
    };

    path_to_string(resolved_path)
}

fn normalize_path(path: PathBuf) -> PathBuf {
    path.components()
        .fold(PathBuf::new(), |mut normalized, component| {
            normalized.push(component.as_os_str());
            normalized
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn supported_snapshot() -> ComputerUseDetectionSnapshot {
        ComputerUseDetectionSnapshot {
            codex_app_detected: true,
            plugin_detected: true,
            plugin_enabled: true,
            helper_present: true,
            helper_bridge_verified: true,
            permission_verified: true,
            approval_verified: true,
            ..ComputerUseDetectionSnapshot::default()
        }
    }

    #[test]
    fn unsupported_takes_precedence() {
        let (status, reasons, guidance) =
            classify_status(PlatformAvailability::Unsupported, &supported_snapshot());

        assert_eq!(status, ComputerUseAvailabilityStatus::Unsupported);
        assert_eq!(reasons, vec![ComputerUseBlockedReason::PlatformUnsupported]);
        assert_eq!(guidance, vec![ComputerUseGuidanceCode::UnsupportedPlatform]);
    }

    #[test]
    fn missing_codex_app_is_unavailable() {
        let (status, reasons, _) = classify_status(
            PlatformAvailability::Supported,
            &ComputerUseDetectionSnapshot::default(),
        );

        assert_eq!(status, ComputerUseAvailabilityStatus::Unavailable);
        assert_eq!(reasons, vec![ComputerUseBlockedReason::CodexAppMissing]);
    }

    #[test]
    fn missing_plugin_is_unavailable() {
        let snapshot = ComputerUseDetectionSnapshot {
            codex_app_detected: true,
            ..ComputerUseDetectionSnapshot::default()
        };
        let (status, reasons, _) = classify_status(PlatformAvailability::Supported, &snapshot);

        assert_eq!(status, ComputerUseAvailabilityStatus::Unavailable);
        assert_eq!(reasons, vec![ComputerUseBlockedReason::PluginMissing]);
    }

    #[test]
    fn disabled_plugin_is_blocked() {
        let snapshot = ComputerUseDetectionSnapshot {
            codex_app_detected: true,
            plugin_detected: true,
            plugin_enabled: false,
            ..ComputerUseDetectionSnapshot::default()
        };
        let (status, reasons, _) = classify_status(PlatformAvailability::Supported, &snapshot);

        assert_eq!(status, ComputerUseAvailabilityStatus::Blocked);
        assert_eq!(reasons, vec![ComputerUseBlockedReason::PluginDisabled]);
    }

    #[test]
    fn missing_helper_is_blocked() {
        let snapshot = ComputerUseDetectionSnapshot {
            codex_app_detected: true,
            plugin_detected: true,
            plugin_enabled: true,
            helper_present: false,
            ..ComputerUseDetectionSnapshot::default()
        };
        let (status, reasons, _) = classify_status(PlatformAvailability::Supported, &snapshot);

        assert_eq!(status, ComputerUseAvailabilityStatus::Blocked);
        assert_eq!(reasons, vec![ComputerUseBlockedReason::HelperMissing]);
    }

    #[test]
    fn unverified_helper_is_blocked_instead_of_ready() {
        let snapshot = ComputerUseDetectionSnapshot {
            helper_bridge_verified: false,
            permission_verified: false,
            approval_verified: false,
            ..supported_snapshot()
        };
        let (status, reasons, guidance) =
            classify_status(PlatformAvailability::Supported, &snapshot);

        assert_eq!(status, ComputerUseAvailabilityStatus::Blocked);
        assert_eq!(
            reasons,
            vec![
                ComputerUseBlockedReason::HelperBridgeUnverified,
                ComputerUseBlockedReason::PermissionRequired,
                ComputerUseBlockedReason::ApprovalRequired,
            ]
        );
        assert!(guidance.contains(&ComputerUseGuidanceCode::VerifyHelperBridge));
        assert!(guidance.contains(&ComputerUseGuidanceCode::GrantSystemPermissions));
        assert!(guidance.contains(&ComputerUseGuidanceCode::ReviewAllowedApps));
    }

    #[test]
    fn ready_requires_all_minimum_prerequisites() {
        let (status, reasons, guidance) =
            classify_status(PlatformAvailability::Supported, &supported_snapshot());

        assert_eq!(status, ComputerUseAvailabilityStatus::Ready);
        assert!(reasons.is_empty());
        assert!(guidance.is_empty());
    }

    #[test]
    fn parse_helper_command_path_resolves_relative_command_against_descriptor_cwd() {
        let test_root = std::env::temp_dir().join(format!(
            "cc-gui-computer-use-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos()
        ));
        let helper_directory = test_root.join("plugin").join("helpers");
        let descriptor_path = test_root.join("plugin").join(".mcp.json");
        let helper_path = helper_directory.join("SkyComputerUseClient");

        fs::create_dir_all(&helper_directory).expect("helper directory should be created");
        fs::write(&helper_path, "").expect("helper binary placeholder should be created");
        fs::write(
            &descriptor_path,
            r#"{
  "mcpServers": {
    "computer-use": {
      "command": "./helpers/SkyComputerUseClient",
      "cwd": "."
    }
  }
}"#,
        )
        .expect("descriptor should be written");

        let parsed_path =
            parse_helper_command_path(&descriptor_path).expect("helper path should resolve");

        assert_eq!(
            PathBuf::from(parsed_path),
            normalize_path(
                test_root
                    .join("plugin")
                    .join("helpers")
                    .join("SkyComputerUseClient")
            )
        );

        fs::remove_dir_all(&test_root).expect("temp directory should be removed");
    }
}
