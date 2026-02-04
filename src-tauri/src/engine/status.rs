//! Engine status detection
//!
//! Detects installed CLI tools and their capabilities.

use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

use super::{EngineFeatures, EngineStatus, EngineType, ModelInfo};
use crate::backend::app_server::{build_codex_path_env, find_cli_binary};

/// Timeout for CLI commands
const DETECTION_TIMEOUT: Duration = Duration::from_secs(10);

/// Build a tokio Command that correctly handles .cmd/.bat files on Windows
#[allow(unused_variables)]
fn build_async_command(bin: &str) -> Command {
    #[cfg(windows)]
    {
        // On Windows, .cmd/.bat files need to be run through cmd.exe
        let bin_lower = bin.to_lowercase();
        if bin_lower.ends_with(".cmd") || bin_lower.ends_with(".bat") {
            let mut cmd = Command::new("cmd");
            cmd.arg("/c");
            cmd.arg(bin);
            return cmd;
        }
    }
    Command::new(bin)
}

/// Detect Claude Code CLI installation status
pub async fn detect_claude_status(custom_bin: Option<&str>) -> EngineStatus {
    // Try to find the binary using which crate
    let bin_path = if let Some(custom) = custom_bin.filter(|v| !v.trim().is_empty()) {
        Some(PathBuf::from(custom))
    } else {
        find_cli_binary("claude", None)
    };

    let bin = bin_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "claude".to_string());

    // Build PATH env for command execution
    let path_env = build_codex_path_env(custom_bin);

    // Check version
    let version_result = timeout(DETECTION_TIMEOUT, async {
        let mut cmd = build_async_command(&bin);
        if let Some(ref path) = path_env {
            cmd.env("PATH", path);
        }
        let output = cmd
            .arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .to_string();
                Ok(version)
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err(format!("claude --version failed: {}", stderr.trim()))
            }
            Err(e) => Err(format!("Failed to execute claude: {}", e)),
        }
    })
    .await;

    let (installed, version, error) = match version_result {
        Ok(Ok(v)) => (true, Some(v), None),
        Ok(Err(e)) => (false, None, Some(e)),
        Err(_) => (false, None, Some("Timeout detecting Claude CLI".to_string())),
    };

    if !installed {
        return EngineStatus {
            engine_type: EngineType::Claude,
            installed: false,
            version: None,
            bin_path: None,
            home_dir: None,
            models: Vec::new(),
            default_model: None,
            features: EngineFeatures::default(),
            error,
        };
    }

    // Get home directory
    let home_dir = get_claude_home_dir();

    // Get models - Claude has fixed models
    let models = get_claude_models();
    let default_model = models.iter().find(|m| m.default).map(|m| m.id.clone());

    EngineStatus {
        engine_type: EngineType::Claude,
        installed: true,
        version,
        bin_path: Some(bin.to_string()),
        home_dir: home_dir.map(|p| p.to_string_lossy().to_string()),
        models,
        default_model,
        features: EngineFeatures::claude(),
        error: None,
    }
}

/// Detect Codex CLI installation status
pub async fn detect_codex_status(custom_bin: Option<&str>) -> EngineStatus {
    // Try to find the binary using which crate
    let bin_path = if let Some(custom) = custom_bin.filter(|v| !v.trim().is_empty()) {
        Some(PathBuf::from(custom))
    } else {
        find_cli_binary("codex", None)
    };

    let bin = bin_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "codex".to_string());

    // Build PATH env for command execution
    let path_env = build_codex_path_env(custom_bin);

    // Check version
    let version_result = timeout(DETECTION_TIMEOUT, async {
        let mut cmd = build_async_command(&bin);
        if let Some(ref path) = path_env {
            cmd.env("PATH", path);
        }
        let output = cmd
            .arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .to_string();
                Ok(version)
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err(format!("codex --version failed: {}", stderr.trim()))
            }
            Err(e) => Err(format!("Failed to execute codex: {}", e)),
        }
    })
    .await;

    let (installed, version, error) = match version_result {
        Ok(Ok(v)) => (true, Some(v), None),
        Ok(Err(e)) => (false, None, Some(e)),
        Err(_) => (false, None, Some("Timeout detecting Codex CLI".to_string())),
    };

    if !installed {
        return EngineStatus {
            engine_type: EngineType::Codex,
            installed: false,
            version: None,
            bin_path: None,
            home_dir: None,
            models: Vec::new(),
            default_model: None,
            features: EngineFeatures::default(),
            error,
        };
    }

    // Get home directory
    let home_dir = get_codex_home_dir();

    // Models will be fetched dynamically via app-server
    // For now, return empty and let the frontend fetch via model_list command
    EngineStatus {
        engine_type: EngineType::Codex,
        installed: true,
        version,
        bin_path: Some(bin.to_string()),
        home_dir: home_dir.map(|p| p.to_string_lossy().to_string()),
        models: Vec::new(), // Fetched dynamically
        default_model: None,
        features: EngineFeatures::codex(),
        error: None,
    }
}

/// Get Claude Code home directory
fn get_claude_home_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude"))
}

/// Get Codex home directory
fn get_codex_home_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".codex"))
}

/// Get Claude Code available models (hardcoded as they don't change frequently)
fn get_claude_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo::new("claude-sonnet-4-5-20250929", "Claude Sonnet 4.5")
            .with_alias("sonnet")
            .as_default()
            .with_provider("anthropic"),
        ModelInfo::new("claude-opus-4-5-20251101", "Claude Opus 4.5")
            .with_alias("opus")
            .with_provider("anthropic"),
        ModelInfo::new("claude-haiku-3-5-20240307", "Claude Haiku 3.5")
            .with_alias("haiku")
            .with_provider("anthropic"),
    ]
}

/// Detect all supported engines
pub async fn detect_all_engines(
    claude_bin: Option<&str>,
    codex_bin: Option<&str>,
) -> Vec<EngineStatus> {
    // Run detections in parallel
    let (claude_status, codex_status) = tokio::join!(
        detect_claude_status(claude_bin),
        detect_codex_status(codex_bin),
    );

    vec![claude_status, codex_status]
}

/// Detect available engines and return the preferred default engine.
/// Priority: Claude > Codex (user can override in settings)
pub async fn detect_preferred_engine(
    claude_bin: Option<&str>,
    codex_bin: Option<&str>,
) -> EngineType {
    let (claude_status, codex_status) = tokio::join!(
        detect_claude_status(claude_bin),
        detect_codex_status(codex_bin),
    );

    // Priority: Claude first (more users have it installed)
    if claude_status.installed {
        return EngineType::Claude;
    }
    if codex_status.installed {
        return EngineType::Codex;
    }

    // Default to Claude so error message is helpful
    EngineType::Claude
}

/// Resolve the engine type from user settings or auto-detect.
/// Priority:
/// 1. Workspace-specific setting (entry.settings.engine_type)
/// 2. App default setting (app_settings.default_engine)
/// 3. Auto-detect based on installed CLIs
pub async fn resolve_engine_type(
    workspace_engine: Option<&str>,
    app_default_engine: Option<&str>,
    claude_bin: Option<&str>,
    codex_bin: Option<&str>,
) -> EngineType {
    // 1. Check workspace-specific setting
    if let Some(engine) = workspace_engine.filter(|s| !s.is_empty()) {
        match engine.to_lowercase().as_str() {
            "claude" => return EngineType::Claude,
            "codex" => return EngineType::Codex,
            _ => {} // Invalid value, fall through
        }
    }

    // 2. Check app default setting
    if let Some(engine) = app_default_engine.filter(|s| !s.is_empty()) {
        match engine.to_lowercase().as_str() {
            "claude" => return EngineType::Claude,
            "codex" => return EngineType::Codex,
            _ => {} // Invalid value, fall through
        }
    }

    // 3. Auto-detect based on installed CLIs
    detect_preferred_engine(claude_bin, codex_bin).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_models_have_defaults() {
        let models = get_claude_models();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.default));
        assert!(models.iter().any(|m| m.alias == Some("sonnet".to_string())));
    }

    #[test]
    fn home_dir_detection() {
        // These should not panic
        let _ = get_claude_home_dir();
        let _ = get_codex_home_dir();
    }
}
