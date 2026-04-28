use super::*;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn cli_cache_test_root(prefix: &str) -> (PathBuf, PathBuf) {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_root = std::env::temp_dir().join(format!("{prefix}-{unique}"));
    let plugin_root = temp_root
        .join("plugins")
        .join("cache")
        .join("openai-bundled")
        .join("computer-use")
        .join("1.0.755");

    (temp_root, plugin_root)
}

#[test]
fn discover_official_parent_handoff_treats_cli_cache_descriptor_as_candidate() {
    let (temp_root, root) = cli_cache_test_root("computer-use-cli-cache");
    let service_app = root.join("Codex Computer Use.app");
    let helper_app = service_app
        .join("Contents")
        .join("SharedSupport")
        .join("SkyComputerUseClient.app");
    let helper_macos = helper_app.join("Contents").join("MacOS");
    fs::create_dir_all(&helper_macos).expect("create helper layout");
    fs::create_dir_all(helper_app.join("Contents").join("Resources"))
        .expect("create helper resources");
    fs::create_dir_all(root.join(".codex-plugin")).expect("create manifest directory");
    let helper_path = helper_macos.join("SkyComputerUseClient");
    fs::write(&helper_path, "").expect("write helper file");
    fs::write(
        service_app.join("Contents").join("Info.plist"),
        r#"<plist><dict><key>CFBundleIdentifier</key><string>com.openai.sky.CUAService</string></dict></plist>"#,
    )
    .expect("write service plist");
    fs::write(
        helper_app.join("Contents").join("Info.plist"),
        r#"<plist><dict><key>CFBundleIdentifier</key><string>com.openai.sky.CUAService.cli</string></dict></plist>"#,
    )
    .expect("write helper plist");
    fs::write(root.join(".codex-plugin").join("plugin.json"), "{}").expect("write manifest");
    let descriptor_path = root.join(".mcp.json");
    fs::write(
        &descriptor_path,
        r#"{"mcpServers":{"computer-use":{"command":"./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient","args":["mcp"],"cwd":"."}}}"#,
    )
    .expect("write descriptor");

    let snapshot = ComputerUseDetectionSnapshot {
        helper_path: path_to_string(helper_path),
        helper_descriptor_path: path_to_string(descriptor_path),
        plugin_manifest_path: path_to_string(root.join(".codex-plugin").join("plugin.json")),
        ..ComputerUseDetectionSnapshot::default()
    };

    let discovery = discover_official_parent_handoff(&snapshot);

    assert_eq!(
        discovery.kind,
        ComputerUseOfficialParentHandoffKind::HandoffCandidateFound
    );
    assert_eq!(discovery.methods.len(), 1);
    assert_eq!(discovery.methods[0].method, "mcp_descriptor");
    assert_eq!(discovery.methods[0].confidence, "high");

    let _ = fs::remove_dir_all(temp_root);
}

#[test]
fn activation_verification_merges_only_for_matching_helper_identity() {
    let mut snapshot = ComputerUseDetectionSnapshot {
        codex_app_detected: true,
        plugin_detected: true,
        plugin_enabled: true,
        helper_present: true,
        helper_bridge_verified: false,
        permission_verified: false,
        approval_verified: false,
        helper_path: Some("/tmp/helper-a".to_string()),
        helper_descriptor_path: Some("/tmp/.mcp.json".to_string()),
        plugin_manifest_path: Some("/tmp/plugin.json".to_string()),
        ..ComputerUseDetectionSnapshot::default()
    };
    let verification =
        ComputerUseActivationVerification::from_snapshot(&snapshot).expect("verification");

    apply_activation_verification(&mut snapshot, Some(&verification));
    assert!(snapshot.helper_bridge_verified);

    let mut changed_snapshot = ComputerUseDetectionSnapshot {
        helper_bridge_verified: false,
        helper_path: Some("/tmp/helper-b".to_string()),
        helper_descriptor_path: Some("/tmp/.mcp.json".to_string()),
        plugin_manifest_path: Some("/tmp/plugin.json".to_string()),
        ..snapshot.clone()
    };

    apply_activation_verification(&mut changed_snapshot, Some(&verification));
    assert!(!changed_snapshot.helper_bridge_verified);
}

#[test]
fn parse_helper_command_path_resolves_relative_command_against_descriptor_cwd() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("computer-use-helper-{unique}"));
    let descriptor_dir = root.join("plugins").join("computer-use");
    fs::create_dir_all(&descriptor_dir).expect("create descriptor directory");

    let descriptor_path = descriptor_dir.join(".mcp.json");
    fs::write(
        &descriptor_path,
        r#"{
  "mcpServers": {
    "computer-use": {
      "command": "./Codex Computer Use.app/Contents/MacOS/Client",
      "args": ["mcp"],
      "cwd": "."
    }
  }
}"#,
    )
    .expect("write descriptor");

    let descriptor = parse_helper_descriptor(&descriptor_path).expect("helper descriptor");
    assert_eq!(descriptor.args, vec!["mcp"]);
    let resolved = parse_helper_command_path(&descriptor_path).expect("helper path");
    assert_eq!(
        PathBuf::from(resolved),
        descriptor_dir
            .join("Codex Computer Use.app")
            .join("Contents")
            .join("MacOS")
            .join("Client")
    );

    let _ = fs::remove_dir_all(root);
}

#[test]
fn parse_helper_descriptor_prefers_named_computer_use_server() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("computer-use-named-server-{unique}"));
    let descriptor_dir = root.join("plugins").join("computer-use");
    fs::create_dir_all(&descriptor_dir).expect("create descriptor directory");

    let descriptor_path = descriptor_dir.join(".mcp.json");
    fs::write(
        &descriptor_path,
        r#"{
  "mcpServers": {
    "other": {
      "command": "./Wrong.app/Contents/MacOS/Wrong",
      "args": ["wrong"],
      "cwd": "."
    },
    "computer-use": {
      "command": "./Codex Computer Use.app/Contents/MacOS/Client",
      "args": ["mcp"],
      "cwd": "."
    }
  }
}"#,
    )
    .expect("write descriptor");

    let descriptor = parse_helper_descriptor(&descriptor_path).expect("helper descriptor");
    assert_eq!(descriptor.args, vec!["mcp"]);
    assert_eq!(
        descriptor.command_path,
        descriptor_dir
            .join("Codex Computer Use.app")
            .join("Contents")
            .join("MacOS")
            .join("Client")
    );

    let _ = fs::remove_dir_all(root);
}

#[test]
fn parse_helper_descriptor_rejects_ambiguous_or_invalid_launch_contracts() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("computer-use-invalid-contract-{unique}"));
    let descriptor_dir = root.join("plugins").join("computer-use");
    fs::create_dir_all(&descriptor_dir).expect("create descriptor directory");
    let descriptor_path = descriptor_dir.join(".mcp.json");

    fs::write(
        &descriptor_path,
        r#"{
  "mcpServers": {
    "other": { "command": "./Other", "args": [], "cwd": "." },
    "another": { "command": "./Another", "args": [], "cwd": "." }
  }
}"#,
    )
    .expect("write ambiguous descriptor");
    assert!(parse_helper_descriptor(&descriptor_path).is_none());

    fs::write(
        &descriptor_path,
        r#"{
  "mcpServers": {
    "computer-use": { "command": "  ", "args": ["mcp"], "cwd": "." }
  }
}"#,
    )
    .expect("write empty command descriptor");
    assert!(parse_helper_descriptor(&descriptor_path).is_none());

    fs::write(
        &descriptor_path,
        r#"{
  "mcpServers": {
    "computer-use": { "command": "./Client", "args": ["mcp", 1], "cwd": "." }
  }
}"#,
    )
    .expect("write invalid args descriptor");
    assert!(parse_helper_descriptor(&descriptor_path).is_none());

    let _ = fs::remove_dir_all(root);
}

#[test]
fn apply_helper_descriptor_prefers_cli_cache_launch_contract() {
    let (temp_root, root) = cli_cache_test_root("computer-use-cache-contract");
    let descriptor_path = root.join(".mcp.json");
    let helper_path = root
        .join("Codex Computer Use.app")
        .join("Contents")
        .join("SharedSupport")
        .join("SkyComputerUseClient.app")
        .join("Contents")
        .join("MacOS")
        .join("SkyComputerUseClient");
    fs::create_dir_all(helper_path.parent().expect("helper parent")).expect("create helper parent");
    fs::create_dir_all(root.join(".codex-plugin")).expect("create manifest parent");
    fs::write(&helper_path, "").expect("write helper");
    fs::write(root.join(".codex-plugin").join("plugin.json"), "{}").expect("write manifest");
    fs::write(
        &descriptor_path,
        r#"{"mcpServers":{"computer-use":{"command":"./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient","args":["mcp"],"cwd":"."}}}"#,
    )
    .expect("write descriptor");

    let manifest_path = root.join(".codex-plugin").join("plugin.json");
    assert_eq!(
        plugin_root_from_manifest_path(&manifest_path),
        Some(root.clone())
    );

    let mut snapshot = ComputerUseDetectionSnapshot::default();
    apply_helper_descriptor_path(&mut snapshot, &descriptor_path);

    assert_eq!(
        snapshot.helper_descriptor_path,
        path_to_string(descriptor_path)
    );
    assert_eq!(snapshot.helper_path, path_to_string(helper_path));
    assert!(snapshot.helper_present);

    let _ = fs::remove_dir_all(temp_root);
}

#[tokio::test]
async fn activation_probe_static_verifies_cli_cache_contract_without_exec() {
    let (temp_root, root) = cli_cache_test_root("computer-use-static-probe");
    let descriptor_path = root.join(".mcp.json");
    let helper_path = root
        .join("Codex Computer Use.app")
        .join("Contents")
        .join("SharedSupport")
        .join("SkyComputerUseClient.app")
        .join("Contents")
        .join("MacOS")
        .join("SkyComputerUseClient");
    fs::create_dir_all(helper_path.parent().expect("helper parent")).expect("create helper parent");
    fs::write(&helper_path, "").expect("write helper");
    fs::write(
        &descriptor_path,
        r#"{"mcpServers":{"computer-use":{"command":"./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient","args":["mcp"],"cwd":"."}}}"#,
    )
    .expect("write descriptor");

    let helper_path_string = path_to_string(helper_path.clone()).expect("helper path");
    let descriptor_path_string = path_to_string(descriptor_path.clone()).expect("descriptor path");
    let execution =
        run_helper_bridge_probe(&helper_path_string, Some(descriptor_path_string.as_str())).await;

    assert!(execution.succeeded);
    assert_eq!(execution.failure_kind, None);
    assert_eq!(execution.exit_code, None);
    assert!(execution
        .diagnostic_message
        .contains("Codex CLI Computer Use plugin cache launch contract verified"));

    let _ = fs::remove_dir_all(temp_root);
}

#[test]
fn diagnostics_only_probe_detects_nested_app_binary() {
    let path = PathBuf::from(
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
    );

    assert!(path_looks_like_nested_app_binary(&path));
}

#[test]
fn detect_plugin_manifest_path_prefers_highest_semver_directory() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("computer-use-cache-{unique}"));
    let lower = root.join("1.9.0").join(".codex-plugin");
    let higher = root.join("1.10.0").join(".codex-plugin");
    fs::create_dir_all(&lower).expect("create lower version directory");
    fs::create_dir_all(&higher).expect("create higher version directory");
    fs::write(lower.join("plugin.json"), "{}").expect("write lower plugin manifest");
    fs::write(higher.join("plugin.json"), "{}").expect("write higher plugin manifest");

    let detected = detect_plugin_manifest_path(Some(&root)).expect("manifest path");
    assert_eq!(detected, higher.join("plugin.json"));

    let _ = fs::remove_dir_all(root);
}
