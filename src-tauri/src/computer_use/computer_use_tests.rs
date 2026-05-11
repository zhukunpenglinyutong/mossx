use super::*;
use std::fs;
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

fn blocked_bridge_status(
    blocked_reasons: Vec<ComputerUseBlockedReason>,
) -> ComputerUseBridgeStatus {
    ComputerUseBridgeStatus {
            feature_enabled: true,
            activation_enabled: true,
            status: if blocked_reasons.is_empty() {
                ComputerUseAvailabilityStatus::Ready
            } else {
                ComputerUseAvailabilityStatus::Blocked
            },
            platform: "macos".to_string(),
            codex_app_detected: true,
            plugin_detected: true,
            plugin_enabled: true,
            blocked_reasons,
            guidance_codes: Vec::new(),
            codex_config_path: Some("/Users/demo/.codex/config.toml".to_string()),
            plugin_manifest_path: Some(
                "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.codex-plugin/plugin.json"
                    .to_string(),
            ),
            helper_path: Some(
                "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
                    .to_string(),
            ),
            helper_descriptor_path: Some(
                "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/.mcp.json"
                    .to_string(),
            ),
            marketplace_path: Some(
                "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.agents/plugins/marketplace.json"
                    .to_string(),
            ),
            diagnostic_message: None,
            authorization_continuity: ComputerUseAuthorizationContinuityStatus {
                kind: ComputerUseAuthorizationContinuityKind::NoSuccessfulHost,
                diagnostic_message: None,
                current_host: None,
                last_successful_host: None,
                drift_fields: Vec::new(),
            },
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
    let (status, reasons, guidance) = classify_status(PlatformAvailability::Supported, &snapshot);

    assert_eq!(status, ComputerUseAvailabilityStatus::Blocked);
    assert_eq!(
        reasons,
        vec![
            ComputerUseBlockedReason::HelperBridgeUnverified,
            ComputerUseBlockedReason::PermissionRequired,
            ComputerUseBlockedReason::ApprovalRequired,
        ]
    );
    assert_eq!(
        guidance,
        vec![
            ComputerUseGuidanceCode::VerifyHelperBridge,
            ComputerUseGuidanceCode::GrantSystemPermissions,
            ComputerUseGuidanceCode::ReviewAllowedApps,
        ]
    );
}

#[test]
fn activation_probe_requires_helper_bridge_unverified() {
    let status = blocked_bridge_status(vec![
        ComputerUseBlockedReason::HelperBridgeUnverified,
        ComputerUseBlockedReason::PermissionRequired,
        ComputerUseBlockedReason::ApprovalRequired,
    ]);

    assert!(is_activation_probe_eligible(&status));

    let verified_status = blocked_bridge_status(vec![
        ComputerUseBlockedReason::PermissionRequired,
        ComputerUseBlockedReason::ApprovalRequired,
    ]);

    assert!(!is_activation_probe_eligible(&verified_status));
}

#[test]
fn activation_probe_requires_enabled_kill_switch() {
    let mut status = blocked_bridge_status(vec![
        ComputerUseBlockedReason::HelperBridgeUnverified,
        ComputerUseBlockedReason::PermissionRequired,
        ComputerUseBlockedReason::ApprovalRequired,
    ]);
    status.activation_enabled = false;

    assert!(!is_activation_probe_eligible(&status));
}

#[test]
fn activation_disabled_env_accepts_common_truthy_values() {
    assert!(activation_disabled_env_value(Some("1".to_string())));
    assert!(activation_disabled_env_value(Some("true".to_string())));
    assert!(activation_disabled_env_value(Some(" YES ".to_string())));
    assert!(activation_disabled_env_value(Some("on".to_string())));
    assert!(!activation_disabled_env_value(None));
    assert!(!activation_disabled_env_value(Some("false".to_string())));
    assert!(!activation_disabled_env_value(Some("0".to_string())));
}

#[test]
fn host_contract_classifies_nested_helper_as_requiring_official_parent() {
    let status = blocked_bridge_status(vec![
        ComputerUseBlockedReason::HelperBridgeUnverified,
        ComputerUseBlockedReason::PermissionRequired,
        ComputerUseBlockedReason::ApprovalRequired,
    ]);

    let kind = classify_host_contract_diagnostics(
        &status,
        status.helper_path.as_deref(),
        Some("/Applications/ThirdPartyHost.app/Contents/MacOS/third-party-host"),
    );

    assert_eq!(
        kind,
        ComputerUseHostContractDiagnosticsKind::RequiresOfficialParent
    );
    assert_eq!(
        host_contract_handoff_method(kind, status.helper_path.as_deref()),
        "direct_exec_skipped_nested_app_bundle"
    );
}

#[test]
fn host_contract_can_report_official_parent_or_manual_permission_state() {
    let nested_status =
        blocked_bridge_status(vec![ComputerUseBlockedReason::HelperBridgeUnverified]);
    let verified_kind = classify_host_contract_diagnostics(
        &nested_status,
        nested_status.helper_path.as_deref(),
        Some("/Applications/Codex.app/Contents/MacOS/Codex"),
    );
    assert_eq!(
        verified_kind,
        ComputerUseHostContractDiagnosticsKind::HandoffVerified
    );

    let permission_status = blocked_bridge_status(vec![
        ComputerUseBlockedReason::PermissionRequired,
        ComputerUseBlockedReason::ApprovalRequired,
    ]);
    let permission_kind = classify_host_contract_diagnostics(
        &permission_status,
        permission_status.helper_path.as_deref(),
        Some("/Applications/ThirdPartyHost.app/Contents/MacOS/third-party-host"),
    );
    assert_eq!(
        permission_kind,
        ComputerUseHostContractDiagnosticsKind::ManualPermissionRequired
    );
}

#[test]
fn host_contract_classifies_cli_cache_helper_as_handoff_verified() {
    let status = ComputerUseBridgeStatus {
            helper_path: Some(
                "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1.0.755/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
                    .to_string(),
            ),
            helper_descriptor_path: Some(
                "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1.0.755/.mcp.json"
                    .to_string(),
            ),
            ..blocked_bridge_status(vec![ComputerUseBlockedReason::HelperBridgeUnverified])
        };

    let kind = classify_host_contract_diagnostics(
        &status,
        status.helper_path.as_deref(),
        Some("/Applications/ccgui.app/Contents/MacOS/ccgui"),
    );

    assert_eq!(
        kind,
        ComputerUseHostContractDiagnosticsKind::HandoffVerified
    );
    assert_eq!(
        host_contract_handoff_method(kind, status.helper_path.as_deref()),
        "codex_cli_plugin_cache_mcp_descriptor"
    );
}

#[test]
fn host_contract_keeps_unsupported_platform_non_executable() {
    let mut status = blocked_bridge_status(vec![ComputerUseBlockedReason::PlatformUnsupported]);
    status.platform = "windows".to_string();
    status.status = ComputerUseAvailabilityStatus::Unsupported;

    let kind = classify_host_contract_diagnostics(
        &status,
        status.helper_path.as_deref(),
        Some("C:\\Program Files\\ThirdPartyHost\\third-party-host.exe"),
    );

    assert_eq!(kind, ComputerUseHostContractDiagnosticsKind::Unknown);
    assert_eq!(host_contract_handoff_method(kind, None), "not_applicable");
}

#[test]
fn host_contract_result_serializes_snake_and_camel_case_contract() {
    let status = blocked_bridge_status(vec![
        ComputerUseBlockedReason::HelperBridgeUnverified,
        ComputerUseBlockedReason::PermissionRequired,
    ]);
    let evidence = ComputerUseHostContractEvidence {
        helper_path: status.helper_path.clone(),
        helper_descriptor_path: status.helper_descriptor_path.clone(),
        current_host_path: Some(
            "/Applications/ThirdPartyHost.app/Contents/MacOS/third-party-host".to_string(),
        ),
        handoff_method: "direct_exec_skipped_nested_app_bundle".to_string(),
        codesign_summary: Some("codesign exited with status 0".to_string()),
        spctl_summary: Some("spctl exited with status 0".to_string()),
        duration_ms: 4,
        stdout_snippet: None,
        stderr_snippet: Some("Authority=Developer ID Application".to_string()),
        official_parent_handoff: skipped_official_parent_handoff_discovery("test", 4),
    };
    let result = build_host_contract_result(
        ComputerUseHostContractDiagnosticsKind::RequiresOfficialParent,
        status,
        evidence,
        4,
        "diagnostic".to_string(),
    );

    let payload = serde_json::to_value(result).expect("serialize host contract result");
    assert_eq!(payload["kind"], "requires_official_parent");
    assert_eq!(
        payload["evidence"]["handoffMethod"],
        "direct_exec_skipped_nested_app_bundle"
    );
    assert_eq!(payload["evidence"]["durationMs"], 4);
    assert_eq!(
        payload["evidence"]["officialParentHandoff"]["kind"],
        "unknown"
    );
}

#[test]
fn official_parent_handoff_classifies_parent_contract_without_public_method() {
    let kind = classify_official_parent_handoff(
        false,
        Some("2DC432GLL2"),
        Some("com.openai.sky.CUAService.cli"),
        Some("com.openai.sky.CUAService"),
    );

    assert_eq!(
        kind,
        ComputerUseOfficialParentHandoffKind::RequiresOfficialParent
    );
}

#[test]
fn official_parent_handoff_candidate_found_takes_precedence() {
    let kind = classify_official_parent_handoff(
        true,
        Some("2DC432GLL2"),
        Some("com.openai.sky.CUAService.cli"),
        Some("com.openai.sky.CUAService"),
    );

    assert_eq!(
        kind,
        ComputerUseOfficialParentHandoffKind::HandoffCandidateFound
    );
}

#[test]
fn plist_helpers_extract_strings_and_arrays() {
    let plist = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.openai.sky.CUAService.cli</string>
  <key>CFBundleURLSchemes</key>
  <array>
    <string>codex</string>
    <string>codex-computer-use</string>
  </array>
</dict>
</plist>"#;

    assert_eq!(
        plist_string(plist, "CFBundleIdentifier"),
        Some("com.openai.sky.CUAService.cli".to_string())
    );
    assert_eq!(
        plist_array_strings(plist, "CFBundleURLSchemes"),
        vec!["codex".to_string(), "codex-computer-use".to_string()]
    );
}

#[test]
fn discover_official_parent_handoff_reads_read_only_metadata() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("computer-use-handoff-{unique}"));
    let codex_app = root.join("Codex.app");
    let plugin_root = codex_app
        .join("Contents")
        .join("Resources")
        .join("plugins")
        .join("openai-bundled")
        .join("plugins")
        .join("computer-use");
    let service_app = plugin_root.join("Codex Computer Use.app");
    let helper_app = service_app
        .join("Contents")
        .join("SharedSupport")
        .join("SkyComputerUseClient.app");
    let helper_macos = helper_app.join("Contents").join("MacOS");
    fs::create_dir_all(&helper_macos).expect("create helper layout");
    fs::create_dir_all(helper_app.join("Contents").join("Resources"))
        .expect("create helper resources");
    fs::create_dir_all(service_app.join("Contents").join("Resources")).expect("create resources");
    fs::create_dir_all(plugin_root.join(".codex-plugin")).expect("create manifest directory");

    fs::write(
            codex_app.join("Contents").join("Info.plist"),
            r#"<plist><dict><key>CFBundleURLSchemes</key><array><string>codex</string></array></dict></plist>"#,
        )
        .expect("write codex plist");
    fs::write(
            service_app.join("Contents").join("Info.plist"),
            r#"<plist><dict><key>CFBundleIdentifier</key><string>com.openai.sky.CUAService</string><key>com.apple.security.application-groups</key><array><string>2DC432GLL2.com.openai.sky.CUAService</string></array></dict></plist>"#,
        )
        .expect("write service plist");
    fs::write(
            helper_app.join("Contents").join("Info.plist"),
            r#"<plist><dict><key>CFBundleIdentifier</key><string>com.openai.sky.CUAService.cli</string><key>com.apple.security.application-groups</key><array><string>2DC432GLL2.com.openai.sky.CUAService</string></array></dict></plist>"#,
        )
        .expect("write helper plist");
    fs::write(
        helper_app
            .join("Contents")
            .join("Resources")
            .join(COMPUTER_USE_PARENT_CODE_REQUIREMENT_FILENAME),
        r#"<plist><dict><key>team-identifier</key><string>2DC432GLL2</string></dict></plist>"#,
    )
    .expect("write parent requirement");
    fs::write(plugin_root.join(".codex-plugin").join("plugin.json"), "{}").expect("write manifest");
    let descriptor_path = plugin_root.join(".mcp.json");
    fs::write(
            &descriptor_path,
            r#"{"mcpServers":{"computer-use":{"command":"./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient","args":["mcp"],"cwd":"."}}}"#,
        )
        .expect("write descriptor");

    let snapshot = ComputerUseDetectionSnapshot {
        helper_path: path_to_string(
            helper_app
                .join("Contents")
                .join("MacOS")
                .join("SkyComputerUseClient"),
        ),
        helper_descriptor_path: path_to_string(descriptor_path),
        plugin_manifest_path: path_to_string(plugin_root.join(".codex-plugin").join("plugin.json")),
        marketplace_path: path_to_string(
            codex_app
                .join("Contents")
                .join("Resources")
                .join("plugins")
                .join("openai-bundled")
                .join(".agents")
                .join("plugins")
                .join("marketplace.json"),
        ),
        ..ComputerUseDetectionSnapshot::default()
    };

    let discovery = discover_official_parent_handoff(&snapshot);

    assert_eq!(
        discovery.kind,
        ComputerUseOfficialParentHandoffKind::RequiresOfficialParent
    );
    assert_eq!(
        discovery.evidence.parent_team_identifier,
        Some("2DC432GLL2".to_string())
    );
    assert_eq!(
        discovery.evidence.application_groups,
        vec!["2DC432GLL2.com.openai.sky.CUAService".to_string()]
    );
    assert!(discovery.methods.is_empty());

    let _ = fs::remove_dir_all(root);
}
