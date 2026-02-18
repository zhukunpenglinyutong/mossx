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
/// OpenCode model listing can be significantly slower than version probes.
const OPENCODE_MODELS_TIMEOUT: Duration = Duration::from_secs(30);

/// Build a tokio Command that correctly handles .cmd/.bat files on Windows.
/// Uses CREATE_NO_WINDOW to prevent visible console windows.
#[allow(unused_variables)]
fn build_async_command(bin: &str) -> Command {
    #[cfg(windows)]
    {
        // On Windows, .cmd/.bat files need to be run through cmd.exe
        let bin_lower = bin.to_lowercase();
        if bin_lower.ends_with(".cmd") || bin_lower.ends_with(".bat") {
            let mut cmd = crate::utils::async_command("cmd");
            cmd.arg("/c");
            cmd.arg(bin);
            return cmd;
        }
    }
    crate::utils::async_command(bin)
}

fn resolve_bin_path(name: &str, custom_bin: Option<&str>) -> Option<PathBuf> {
    if let Some(custom) = custom_bin.filter(|v| !v.trim().is_empty()) {
        let custom_path = PathBuf::from(custom);
        if custom_path.exists() {
            return Some(custom_path);
        }
    }
    find_cli_binary(name, None)
}

/// Detect Claude Code CLI installation status
pub async fn detect_claude_status(custom_bin: Option<&str>) -> EngineStatus {
    let bin_path = resolve_bin_path("claude", custom_bin);

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
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
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
        Err(_) => (
            false,
            None,
            Some("Timeout detecting Claude CLI".to_string()),
        ),
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
    let bin_path = resolve_bin_path("codex", custom_bin);

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
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
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

    let models = get_codex_models();
    let default_model = models.iter().find(|m| m.default).map(|m| m.id.clone());

    EngineStatus {
        engine_type: EngineType::Codex,
        installed: true,
        version,
        bin_path: Some(bin.to_string()),
        home_dir: home_dir.map(|p| p.to_string_lossy().to_string()),
        models,
        default_model,
        features: EngineFeatures::codex(),
        error: None,
    }
}

/// Detect OpenCode CLI installation status
pub async fn detect_opencode_status(custom_bin: Option<&str>) -> EngineStatus {
    let bin_path = resolve_bin_path("opencode", custom_bin);

    let bin = bin_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "opencode".to_string());

    let path_env = build_codex_path_env(custom_bin);

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
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(version)
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err(format!("opencode --version failed: {}", stderr.trim()))
            }
            Err(e) => Err(format!("Failed to execute opencode: {}", e)),
        }
    })
    .await;

    let (mut installed, mut version, mut error) = match version_result {
        Ok(Ok(v)) => (true, Some(v), None),
        Ok(Err(e)) => (false, None, Some(e)),
        Err(_) => (
            false,
            None,
            Some("Timeout detecting OpenCode CLI".to_string()),
        ),
    };

    // OpenCode CLI in GUI-launched environments can intermittently fail `--version`
    // due to startup env quirks. Use a lightweight second probe to avoid false
    // "not installed" states in engine selector.
    if !installed {
        let help_probe = timeout(DETECTION_TIMEOUT, async {
            let mut cmd = build_async_command(&bin);
            if let Some(ref path) = path_env {
                cmd.env("PATH", path);
            }
            cmd.arg("--help")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
                .await
        })
        .await;

        if let Ok(Ok(output)) = help_probe {
            if output.status.success() {
                installed = true;
                if version.is_none() {
                    version = Some("unknown".to_string());
                }
                error = None;
            }
        }
    }

    if !installed {
        return EngineStatus {
            engine_type: EngineType::OpenCode,
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

    let home_dir = get_opencode_home_dir();
    let (models, models_error) = match get_opencode_models(&bin, path_env.as_ref()).await {
        Ok(models) => (models, None),
        Err(err) => (Vec::new(), Some(err)),
    };
    let default_model = models.iter().find(|m| m.default).map(|m| m.id.clone());

    EngineStatus {
        engine_type: EngineType::OpenCode,
        installed: true,
        version,
        bin_path: Some(bin.to_string()),
        home_dir: home_dir.map(|p| p.to_string_lossy().to_string()),
        models,
        default_model,
        features: EngineFeatures::opencode(),
        error: models_error,
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

/// Get OpenCode home directory
fn get_opencode_home_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".opencode"))
}

/// Get Codex CLI available models (hardcoded as they don't change frequently)
fn get_codex_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo::new("gpt-5.3-codex", "GPT-5.3 Codex")
            .as_default()
            .with_provider("openai"),
        ModelInfo::new("gpt-5.2-codex", "GPT-5.2 Codex").with_provider("openai"),
        ModelInfo::new("gpt-5.2", "GPT-5.2").with_provider("openai"),
        ModelInfo::new("gpt-5.1-codex-max", "GPT-5.1 Codex Max").with_provider("openai"),
        ModelInfo::new("gpt-5.1-codex-mini", "GPT-5.1 Codex Mini").with_provider("openai"),
    ]
}

/// Get Claude Code available models (hardcoded as they don't change frequently)
fn get_claude_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo::new("claude-sonnet-4-5-20250929", "Sonnet 4.5")
            .with_alias("sonnet")
            .as_default()
            .with_provider("anthropic")
            .with_description("Sonnet default recommended model"),
        ModelInfo::new("claude-opus-4-6", "Opus 4.6")
            .with_alias("opus")
            .with_provider("anthropic")
            .with_description("Opus 4.6 · Latest and most capable"),
        ModelInfo::new("claude-opus-4-6-1m", "Opus (1M context)")
            .with_provider("anthropic")
            .with_description("Opus 4.6 long-session mode"),
        ModelInfo::new("claude-opus-4-5-20251101", "Opus 4.5")
            .with_provider("anthropic")
            .with_description("Opus most capable for complex work"),
        ModelInfo::new("claude-haiku-4-5", "Haiku 4.5")
            .with_alias("haiku")
            .with_provider("anthropic")
            .with_description("Haiku fastest for quick answers"),
    ]
}

/// Query OpenCode CLI for available models.
async fn get_opencode_models(
    bin: &str,
    path_env: Option<&String>,
) -> Result<Vec<ModelInfo>, String> {
    let output_result = timeout(OPENCODE_MODELS_TIMEOUT, async {
        let mut cmd = build_async_command(bin);
        if let Some(path) = path_env {
            cmd.env("PATH", path);
        }
        cmd.arg("models")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await
    })
    .await;

    let output = match output_result {
        Ok(Ok(out)) => out,
        Ok(Err(err)) => return Err(format!("Failed to execute opencode models: {}", err)),
        Err(_) => return Err("Timeout listing OpenCode models".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("opencode models failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_opencode_models_output(&stdout))
}

fn parse_opencode_models_output(stdout: &str) -> Vec<ModelInfo> {
    fn strip_ansi_codes(input: &str) -> String {
        let mut out = String::with_capacity(input.len());
        let mut chars = input.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '\u{1b}' {
                if let Some('[') = chars.peek().copied() {
                    let _ = chars.next();
                    for c in chars.by_ref() {
                        if ('@'..='~').contains(&c) {
                            break;
                        }
                    }
                    continue;
                }
            }
            out.push(ch);
        }
        out
    }

    let clean = strip_ansi_codes(stdout);
    let mut models: Vec<ModelInfo> = clean
        .lines()
        .map(str::trim)
        .filter_map(|line| {
            if line.is_empty() {
                return None;
            }
            line.split_whitespace().find(|token| token.contains('/'))
        })
        .map(|full_id| {
            let (provider, model_id) = full_id.split_once('/').unwrap_or(("opencode", full_id));
            ModelInfo::new(full_id, format_opencode_model_name(provider, model_id))
                .with_provider(provider)
        })
        .collect();

    if models.is_empty() {
        return models;
    }

    let default_index = models
        .iter()
        .position(|m| m.id == "openai/gpt-5.3-codex")
        .or_else(|| models.iter().position(|m| m.id.starts_with("openai/")))
        .unwrap_or(0);

    if let Some(model) = models.get_mut(default_index) {
        model.default = true;
    }

    models
}

fn format_opencode_model_name(provider: &str, model_id: &str) -> String {
    let provider_name = match provider {
        "openai" => "OpenAI",
        "opencode" => "OpenCode",
        _ => provider,
    };
    let model_name = model_id
        .split('-')
        .map(|part| {
            if part.chars().all(|c| c.is_ascii_digit()) {
                part.to_string()
            } else {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => {
                        let mut chunk = first.to_uppercase().to_string();
                        chunk.push_str(chars.as_str());
                        chunk
                    }
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join("-");
    format!("{}/{}", provider_name, model_name)
}

/// Detect all supported engines
pub async fn detect_all_engines(
    claude_bin: Option<&str>,
    codex_bin: Option<&str>,
    opencode_bin: Option<&str>,
) -> Vec<EngineStatus> {
    // Run detections in parallel
    let (claude_status, codex_status, opencode_status) = tokio::join!(
        detect_claude_status(claude_bin),
        detect_codex_status(codex_bin),
        detect_opencode_status(opencode_bin),
    );

    vec![claude_status, codex_status, opencode_status]
}

/// Detect available engines and return the preferred default engine.
/// Priority: Claude > Codex > OpenCode (user can override in settings)
pub async fn detect_preferred_engine(
    claude_bin: Option<&str>,
    codex_bin: Option<&str>,
    opencode_bin: Option<&str>,
) -> EngineType {
    let (claude_status, codex_status, opencode_status) = tokio::join!(
        detect_claude_status(claude_bin),
        detect_codex_status(codex_bin),
        detect_opencode_status(opencode_bin),
    );

    // Priority: Claude first (more users have it installed)
    if claude_status.installed {
        return EngineType::Claude;
    }
    if codex_status.installed {
        return EngineType::Codex;
    }
    if opencode_status.installed {
        return EngineType::OpenCode;
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
    opencode_bin: Option<&str>,
) -> EngineType {
    // 1. Check workspace-specific setting
    if let Some(engine) = workspace_engine.filter(|s| !s.is_empty()) {
        match engine.to_lowercase().as_str() {
            "claude" => return EngineType::Claude,
            "codex" => return EngineType::Codex,
            "opencode" => return EngineType::OpenCode,
            _ => {} // Invalid value, fall through
        }
    }

    // 2. Check app default setting
    if let Some(engine) = app_default_engine.filter(|s| !s.is_empty()) {
        match engine.to_lowercase().as_str() {
            "claude" => return EngineType::Claude,
            "codex" => return EngineType::Codex,
            "opencode" => return EngineType::OpenCode,
            _ => {} // Invalid value, fall through
        }
    }

    // 3. Auto-detect based on installed CLIs
    detect_preferred_engine(claude_bin, codex_bin, opencode_bin).await
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
        assert!(models.iter().any(|m| m.id == "claude-opus-4-6-1m"));
        assert!(models.iter().any(|m| m.id == "claude-haiku-4-5"));
    }

    #[test]
    fn home_dir_detection() {
        // These should not panic
        let _ = get_claude_home_dir();
        let _ = get_codex_home_dir();
        let _ = get_opencode_home_dir();
    }

    #[tokio::test]
    async fn resolve_engine_type_supports_opencode() {
        let resolved =
            resolve_engine_type(Some("opencode"), Some("claude"), None, None, None).await;
        assert_eq!(resolved, EngineType::OpenCode);
    }

    #[test]
    fn opencode_models_have_defaults() {
        let output = r#"
openai/gpt-5.3-codex
openai/gpt-5.2
opencode/gpt-5-nano
"#;
        let models = parse_opencode_models_output(output);
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.default));
        assert!(models.iter().any(|m| m.id == "openai/gpt-5.3-codex"));
    }

    #[test]
    fn opencode_model_name_formatting() {
        let name = format_opencode_model_name("openai", "gpt-5.3-codex");
        assert_eq!(name, "OpenAI/Gpt-5.3-Codex");
    }

    #[test]
    fn parse_opencode_models_output_handles_ansi_and_extra_columns() {
        let output = "\u{1b}[32mopenai/gpt-5.3-codex\u{1b}[0m  default\nminimax-cn-coding-plan/MiniMax-M2.5 available\n";
        let models = parse_opencode_models_output(output);
        assert_eq!(models.len(), 2);
        assert!(models.iter().any(|m| m.id == "openai/gpt-5.3-codex"));
        assert!(models
            .iter()
            .any(|m| m.id == "minimax-cn-coding-plan/MiniMax-M2.5"));
    }
}
