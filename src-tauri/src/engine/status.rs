//! Engine status detection
//!
//! Detects installed CLI tools and their capabilities.

use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

use super::{EngineFeatures, EngineStatus, EngineType, ModelInfo};
use crate::app_paths;
use crate::backend::app_server::{build_codex_path_env, find_cli_binary};
use crate::backend::app_server_cli::resolve_safe_opencode_binary;

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

/// Probe a CLI binary for its version using `--version`.
/// Returns `(installed, version, error)`.
async fn probe_cli_version(
    bin: &str,
    cli_name: &str,
    path_env: Option<&String>,
) -> (bool, Option<String>, Option<String>) {
    let version_result = timeout(DETECTION_TIMEOUT, async {
        let mut cmd = build_async_command(bin);
        if let Some(path) = path_env {
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
                Err(format!("{} --version failed: {}", cli_name, stderr.trim()))
            }
            Err(e) => Err(format!("Failed to execute {}: {}", cli_name, e)),
        }
    })
    .await;

    match version_result {
        Ok(Ok(v)) => (true, Some(v), None),
        Ok(Err(e)) => (false, None, Some(e)),
        Err(_) => (
            false,
            None,
            Some(format!("Timeout detecting {} CLI", cli_name)),
        ),
    }
}

async fn probe_cli_help(bin: &str, path_env: Option<&String>) -> bool {
    let help_result = timeout(DETECTION_TIMEOUT, async {
        let mut cmd = build_async_command(bin);
        if let Some(path) = path_env {
            cmd.env("PATH", path);
        }
        cmd.arg("--help")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output()
            .await
    })
    .await;

    matches!(help_result, Ok(Ok(output)) if output.status.success())
}

/// Build an uninstalled EngineStatus stub.
fn not_installed_status(engine_type: EngineType, error: Option<String>) -> EngineStatus {
    EngineStatus {
        engine_type,
        installed: false,
        version: None,
        bin_path: None,
        home_dir: None,
        models: Vec::new(),
        default_model: None,
        features: EngineFeatures::default(),
        error,
    }
}

/// Detect Claude Code CLI installation status
pub async fn detect_claude_status(custom_bin: Option<&str>) -> EngineStatus {
    let bin_path = resolve_bin_path("claude", custom_bin);
    let bin = bin_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "claude".to_string());
    let path_env = build_codex_path_env(custom_bin);

    let (mut installed, mut version, mut error) =
        probe_cli_version(&bin, "claude", path_env.as_ref()).await;

    if !installed && probe_cli_help(&bin, path_env.as_ref()).await {
        installed = true;
        if version.is_none() {
            version = Some("unknown".to_string());
        }
        error = None;
    }

    if !installed {
        return not_installed_status(EngineType::Claude, error);
    }

    let home_dir = get_claude_home_dir();
    let models = get_claude_models(&bin, path_env.as_ref()).await;
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
    let path_env = build_codex_path_env(custom_bin);

    let (mut installed, mut version, mut error) =
        probe_cli_version(&bin, "codex", path_env.as_ref()).await;

    if !installed && probe_cli_help(&bin, path_env.as_ref()).await {
        installed = true;
        if version.is_none() {
            version = Some("unknown".to_string());
        }
        error = None;
    }

    if !installed {
        return not_installed_status(EngineType::Codex, error);
    }

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

async fn detect_opencode_status_with_options(
    custom_bin: Option<&str>,
    include_models: bool,
) -> EngineStatus {
    let safe_bin = resolve_safe_opencode_binary(custom_bin);
    let bin_path = match safe_bin {
        Ok(path) => Some(path),
        Err(error) if error == "OpenCode CLI not found" => None,
        Err(error) => {
            return not_installed_status(EngineType::OpenCode, Some(error));
        }
    };
    let bin = bin_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "opencode".to_string());
    let path_env = build_codex_path_env(custom_bin);

    let (mut installed, mut version, mut error) =
        probe_cli_version(&bin, "opencode", path_env.as_ref()).await;

    // OpenCode CLI in GUI-launched environments can intermittently fail `--version`
    // due to startup env quirks. Use a lightweight second probe to avoid false
    // "not installed" states in engine selector.
    if !installed {
        let help_probe = timeout(DETECTION_TIMEOUT, async {
            let mut cmd = build_async_command(&bin);
            if let Some(ref path) = &path_env {
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
        return not_installed_status(EngineType::OpenCode, error);
    }

    let home_dir = get_opencode_home_dir();
    let (models, models_error) = if include_models {
        match get_opencode_models(&bin, path_env.as_ref()).await {
            Ok(models) => (models, None),
            Err(err) => (Vec::new(), Some(err)),
        }
    } else {
        (Vec::new(), None)
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

/// Detect OpenCode CLI installation status using lightweight startup probes only.
pub async fn detect_opencode_status(custom_bin: Option<&str>) -> EngineStatus {
    detect_opencode_status_with_options(custom_bin, false).await
}

/// Query OpenCode CLI for available models on demand.
pub async fn load_opencode_models(custom_bin: Option<&str>) -> Result<Vec<ModelInfo>, String> {
    let safe_bin = resolve_safe_opencode_binary(custom_bin)?;
    let bin = safe_bin.to_string_lossy().to_string();
    let path_env = build_codex_path_env(custom_bin);
    get_opencode_models(&bin, path_env.as_ref()).await
}

/// Detect Gemini CLI installation status
pub async fn detect_gemini_status(custom_bin: Option<&str>) -> EngineStatus {
    let bin_path = resolve_bin_path("gemini", custom_bin);
    let bin = bin_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "gemini".to_string());
    let path_env = build_codex_path_env(custom_bin);

    let (installed, version, error) = probe_cli_version(&bin, "gemini", path_env.as_ref()).await;

    if !installed {
        return not_installed_status(EngineType::Gemini, error);
    }

    let home_dir = get_gemini_home_dir();
    let models = get_gemini_models();
    let default_model = models.iter().find(|m| m.default).map(|m| m.id.clone());

    EngineStatus {
        engine_type: EngineType::Gemini,
        installed: true,
        version,
        bin_path: Some(bin.to_string()),
        home_dir: home_dir.map(|p| p.to_string_lossy().to_string()),
        models,
        default_model,
        features: EngineFeatures::gemini(),
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

/// Get OpenCode home directory
fn get_opencode_home_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".opencode"))
}

/// Get Gemini home directory
fn get_gemini_home_dir() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("GEMINI_CLI_HOME").filter(|v| !v.is_empty()) {
        let configured = PathBuf::from(home);
        let configured_text = configured.to_string_lossy();
        if configured_text == "~" {
            return dirs::home_dir();
        }
        if let Some(relative) = configured_text
            .strip_prefix("~/")
            .or_else(|| configured_text.strip_prefix("~\\"))
            .filter(|value| !value.is_empty())
        {
            return dirs::home_dir().map(|home| home.join(relative));
        }
        return Some(configured);
    }
    dirs::home_dir().map(|home| home.join(".gemini"))
}

/// Get Codex CLI available models (hardcoded as they don't change frequently)
fn get_codex_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo::new("gpt-5.3-codex", "GPT-5.3 Codex")
            .as_default()
            .with_provider("openai"),
        ModelInfo::new("gpt-5.2-codex", "GPT-5.2 Codex").with_provider("openai"),
        ModelInfo::new("gpt-5.4", "GPT-5.4").with_provider("openai"),
        ModelInfo::new("gpt-5.1-codex-max", "GPT-5.1 Codex Max").with_provider("openai"),
        ModelInfo::new("gpt-5.1-codex-mini", "GPT-5.1 Codex Mini").with_provider("openai"),
    ]
}

/// Get Gemini CLI available models (stable defaults + preview model).
fn get_gemini_models() -> Vec<ModelInfo> {
    let mut models = vec![
        ModelInfo::new("gemini-2.5-pro", "Gemini 2.5 Pro")
            .as_default()
            .with_provider("google"),
        ModelInfo::new("gemini-2.5-flash", "Gemini 2.5 Flash").with_provider("google"),
    ];

    if let Some(configured_model) = read_configured_gemini_model() {
        for model in &mut models {
            model.default = false;
        }
        if let Some(existing_index) = models.iter().position(|model| model.id == configured_model) {
            let mut existing = models.remove(existing_index);
            existing.default = true;
            models.insert(0, existing);
        } else {
            models.insert(
                0,
                ModelInfo::new(configured_model.clone(), configured_model)
                    .as_default()
                    .with_provider("google")
                    .with_description("Configured in Gemini vendor settings"),
            );
        }
    }

    models
}

fn read_configured_gemini_model() -> Option<String> {
    if let Some(from_config) = read_gemini_model_from_ccgui_config() {
        return Some(from_config);
    }
    std::env::var("GEMINI_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_gemini_model_from_ccgui_config() -> Option<String> {
    let config_path = app_paths::config_file_path().ok()?;
    let content = std::fs::read_to_string(config_path).ok()?;
    let root = serde_json::from_str::<Value>(&content).ok()?;
    parse_gemini_model_from_config_json(&root)
}

fn parse_gemini_model_from_config_json(root: &Value) -> Option<String> {
    root.get("gemini")?
        .get("env")?
        .get("GEMINI_MODEL")?
        .as_str()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Get Claude Code fallback model set.
fn get_claude_fallback_models() -> Vec<ModelInfo> {
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
        ModelInfo::new("claude-opus-4-6[1m]", "Opus (1M context)")
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

/// Build Claude model list from CLI-visible sources with fallback.
///
/// Priority:
/// 1. Local Claude settings (`~/.claude/settings.json`) model env overrides
/// 2. IDs discovered from `claude --help` examples
/// 3. Built-in fallback list
async fn get_claude_models(bin: &str, path_env: Option<&String>) -> Vec<ModelInfo> {
    let mut models = get_claude_fallback_models();
    apply_claude_model_overrides(&mut models, read_claude_model_overrides());
    apply_cli_help_model_discovery(
        &mut models,
        get_claude_models_from_help(bin, path_env).await,
    );
    ensure_default_model(&mut models);
    dedupe_models_preserve_order(models)
}

#[derive(Default, Clone)]
struct ClaudeModelOverrides {
    main: Option<String>,
    sonnet: Option<String>,
    opus: Option<String>,
    haiku: Option<String>,
}

fn normalize_non_empty(input: Option<String>) -> Option<String> {
    input.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn read_claude_model_overrides() -> ClaudeModelOverrides {
    let mut overrides = ClaudeModelOverrides {
        main: normalize_non_empty(std::env::var("ANTHROPIC_MODEL").ok()),
        sonnet: normalize_non_empty(std::env::var("ANTHROPIC_DEFAULT_SONNET_MODEL").ok()),
        opus: normalize_non_empty(std::env::var("ANTHROPIC_DEFAULT_OPUS_MODEL").ok()),
        haiku: normalize_non_empty(std::env::var("ANTHROPIC_DEFAULT_HAIKU_MODEL").ok()),
    };

    if let Some(file_overrides) = read_claude_model_overrides_from_settings() {
        if file_overrides.main.is_some() {
            overrides.main = file_overrides.main;
        }
        if file_overrides.sonnet.is_some() {
            overrides.sonnet = file_overrides.sonnet;
        }
        if file_overrides.opus.is_some() {
            overrides.opus = file_overrides.opus;
        }
        if file_overrides.haiku.is_some() {
            overrides.haiku = file_overrides.haiku;
        }
    }

    overrides
}

fn read_claude_model_overrides_from_settings() -> Option<ClaudeModelOverrides> {
    let path = get_claude_home_dir()?.join("settings.json");
    let content = std::fs::read_to_string(path).ok()?;
    let root = serde_json::from_str::<Value>(&content).ok()?;
    let env = root.get("env")?;
    Some(ClaudeModelOverrides {
        main: normalize_non_empty(
            env.get("ANTHROPIC_MODEL")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        ),
        sonnet: normalize_non_empty(
            env.get("ANTHROPIC_DEFAULT_SONNET_MODEL")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        ),
        opus: normalize_non_empty(
            env.get("ANTHROPIC_DEFAULT_OPUS_MODEL")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        ),
        haiku: normalize_non_empty(
            env.get("ANTHROPIC_DEFAULT_HAIKU_MODEL")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        ),
    })
}

fn apply_claude_model_overrides(models: &mut Vec<ModelInfo>, overrides: ClaudeModelOverrides) {
    if let Some(sonnet) = overrides.sonnet {
        if let Some(model) = models
            .iter_mut()
            .find(|model| model.alias.as_deref() == Some("sonnet"))
        {
            model.id = sonnet;
            model.description = "Configured in ~/.claude/settings.json".to_string();
        }
    }
    if let Some(opus) = overrides.opus {
        if let Some(model) = models
            .iter_mut()
            .find(|model| model.alias.as_deref() == Some("opus"))
        {
            model.id = opus;
            model.description = "Configured in ~/.claude/settings.json".to_string();
        }
    }
    if let Some(haiku) = overrides.haiku {
        if let Some(model) = models
            .iter_mut()
            .find(|model| model.alias.as_deref() == Some("haiku"))
        {
            model.id = haiku;
            model.description = "Configured in ~/.claude/settings.json".to_string();
        }
    }
    if let Some(main) = overrides.main {
        for model in models.iter_mut() {
            model.default = false;
        }
        models.insert(
            0,
            ModelInfo::new(main.clone(), main)
                .as_default()
                .with_provider("anthropic")
                .with_description("Configured in ~/.claude/settings.json"),
        );
    }
}

async fn get_claude_models_from_help(bin: &str, path_env: Option<&String>) -> Option<Vec<String>> {
    let output_result = timeout(DETECTION_TIMEOUT, async {
        let mut cmd = build_async_command(bin);
        if let Some(path) = path_env {
            cmd.env("PATH", path);
        }
        cmd.arg("--help")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await
    })
    .await
    .ok()?
    .ok()?;

    if !output_result.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output_result.stdout);
    let stderr = String::from_utf8_lossy(&output_result.stderr);
    let mut discovered = extract_claude_model_ids_from_text(&stdout);
    discovered.extend(extract_claude_model_ids_from_text(&stderr));
    if discovered.is_empty() {
        None
    } else {
        Some(discovered)
    }
}

fn extract_claude_model_ids_from_text(text: &str) -> Vec<String> {
    let mut discovered = Vec::new();
    for token in text.split_whitespace() {
        let candidate = token
            .trim_matches(|ch: char| {
                ch == '\''
                    || ch == '"'
                    || ch == '('
                    || ch == ')'
                    || ch == ','
                    || ch == '.'
                    || ch == ';'
                    || ch == ':'
            })
            .trim();
        if candidate.starts_with("claude-")
            && candidate
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '[' || ch == ']')
        {
            discovered.push(candidate.to_string());
        }
    }
    discovered
}

fn apply_cli_help_model_discovery(models: &mut Vec<ModelInfo>, discovered: Option<Vec<String>>) {
    let Some(ids) = discovered else {
        return;
    };
    for id in ids {
        if models.iter().any(|model| model.id == id) {
            continue;
        }
        models.push(
            ModelInfo::new(id.clone(), id)
                .with_provider("anthropic")
                .with_description("Discovered from claude --help"),
        );
    }
}

fn ensure_default_model(models: &mut [ModelInfo]) {
    if models.is_empty() {
        return;
    }
    if models.iter().any(|model| model.default) {
        return;
    }
    if let Some(first) = models.first_mut() {
        first.default = true;
    }
}

fn dedupe_models_preserve_order(models: Vec<ModelInfo>) -> Vec<ModelInfo> {
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::with_capacity(models.len());
    for model in models {
        if seen.insert(model.id.clone()) {
            deduped.push(model);
        }
    }
    deduped
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
    gemini_bin: Option<&str>,
    opencode_bin: Option<&str>,
) -> Vec<EngineStatus> {
    // Run detections in parallel
    let (claude_status, codex_status, gemini_status, opencode_status) = tokio::join!(
        detect_claude_status(claude_bin),
        detect_codex_status(codex_bin),
        detect_gemini_status(gemini_bin),
        detect_opencode_status(opencode_bin),
    );

    vec![claude_status, codex_status, gemini_status, opencode_status]
}

/// Detect available engines and return the preferred default engine.
/// Priority: Claude > Codex > OpenCode (user can override in settings)
pub async fn detect_preferred_engine(
    claude_bin: Option<&str>,
    codex_bin: Option<&str>,
    gemini_bin: Option<&str>,
    opencode_bin: Option<&str>,
) -> EngineType {
    let (claude_status, codex_status, gemini_status, opencode_status) = tokio::join!(
        detect_claude_status(claude_bin),
        detect_codex_status(codex_bin),
        detect_gemini_status(gemini_bin),
        detect_opencode_status(opencode_bin),
    );

    // Priority: Claude first (more users have it installed)
    if claude_status.installed {
        return EngineType::Claude;
    }
    if codex_status.installed {
        return EngineType::Codex;
    }
    if gemini_status.installed {
        return EngineType::Gemini;
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
    gemini_bin: Option<&str>,
    opencode_bin: Option<&str>,
) -> EngineType {
    // 1. Check workspace-specific setting
    if let Some(engine) = workspace_engine.filter(|s| !s.is_empty()) {
        match engine.to_lowercase().as_str() {
            "claude" => return EngineType::Claude,
            "codex" => return EngineType::Codex,
            "gemini" => return EngineType::Gemini,
            "opencode" => return EngineType::OpenCode,
            _ => {} // Invalid value, fall through
        }
    }

    // 2. Check app default setting
    if let Some(engine) = app_default_engine.filter(|s| !s.is_empty()) {
        match engine.to_lowercase().as_str() {
            "claude" => return EngineType::Claude,
            "codex" => return EngineType::Codex,
            "gemini" => return EngineType::Gemini,
            "opencode" => return EngineType::OpenCode,
            _ => {} // Invalid value, fall through
        }
    }

    // 3. Auto-detect based on installed CLIs
    detect_preferred_engine(claude_bin, codex_bin, gemini_bin, opencode_bin).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn claude_models_have_defaults() {
        let models = get_claude_fallback_models();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.default));
        assert!(models.iter().any(|m| m.alias == Some("sonnet".to_string())));
        assert!(models.iter().any(|m| m.id == "claude-opus-4-6[1m]"));
        assert!(models.iter().any(|m| m.id == "claude-haiku-4-5"));
    }

    #[test]
    fn home_dir_detection() {
        // These should not panic
        let _ = get_claude_home_dir();
        let _ = get_codex_home_dir();
        let _ = get_gemini_home_dir();
        let _ = get_opencode_home_dir();
    }

    #[tokio::test]
    async fn resolve_engine_type_supports_opencode() {
        let resolved =
            resolve_engine_type(Some("opencode"), Some("claude"), None, None, None, None).await;
        assert_eq!(resolved, EngineType::OpenCode);
    }

    #[tokio::test]
    async fn resolve_engine_type_supports_gemini() {
        let resolved =
            resolve_engine_type(Some("gemini"), Some("claude"), None, None, None, None).await;
        assert_eq!(resolved, EngineType::Gemini);
    }

    #[test]
    fn opencode_models_have_defaults() {
        let output = r#"
openai/gpt-5.3-codex
openai/gpt-5.4
opencode/gpt-5-nano
"#;
        let models = parse_opencode_models_output(output);
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.default));
        assert!(models.iter().any(|m| m.id == "openai/gpt-5.3-codex"));
        assert!(models.iter().any(|m| m.id == "openai/gpt-5.4"));
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

    #[test]
    fn parse_gemini_model_from_config_json_extracts_trimmed_model() {
        let config = json!({
            "gemini": {
                "env": {
                    "GEMINI_MODEL": "  [L]gemini-3-pro-preview  "
                }
            }
        });
        let model = parse_gemini_model_from_config_json(&config);
        assert_eq!(model.as_deref(), Some("[L]gemini-3-pro-preview"));
    }

    #[cfg(unix)]
    fn write_unix_test_cli(script_body: &str) -> PathBuf {
        let unique = format!(
            "ccgui-engine-status-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(unique);
        fs::create_dir_all(&dir).expect("create temp cli dir");
        let script_path = dir.join("codex-status-cli");
        fs::write(&script_path, script_body).expect("write temp cli script");
        let mut permissions = fs::metadata(&script_path)
            .expect("stat temp cli script")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions).expect("chmod temp cli script");
        script_path
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn detect_codex_status_uses_help_fallback_when_version_probe_fails() {
        let script_path = write_unix_test_cli(
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n  echo 'broken version' >&2\n  exit 1\nfi\nif [ \"$1\" = \"--help\" ]; then\n  echo 'usage'\n  exit 0\nfi\nexit 1\n",
        );

        let status = detect_codex_status(Some(script_path.to_string_lossy().as_ref())).await;
        assert!(status.installed);
        assert_eq!(status.version.as_deref(), Some("unknown"));
        assert_eq!(status.engine_type, EngineType::Codex);

        let _ = fs::remove_file(&script_path);
        let _ = fs::remove_dir_all(script_path.parent().unwrap_or(std::path::Path::new("")));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn detect_opencode_status_lightweight_skips_models_probe() {
        let unique = format!(
            "ccgui-opencode-light-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(unique);
        fs::create_dir_all(&dir).expect("create temp cli dir");
        let script_path = dir.join("opencode-status-cli");
        let script_body =
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n  echo '1.2.3'\n  exit 0\nfi\nif [ \"$1\" = \"--help\" ]; then\n  echo 'usage'\n  exit 0\nfi\nif [ \"$1\" = \"models\" ]; then\n  echo 'models should not run' >&2\n  exit 7\nfi\nexit 0\n";
        fs::write(&script_path, script_body).expect("write temp cli script");
        let mut permissions = fs::metadata(&script_path)
            .expect("stat temp cli script")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions).expect("chmod temp cli script");

        let status = detect_opencode_status(Some(script_path.to_string_lossy().as_ref())).await;
        assert!(status.installed);
        assert!(status.models.is_empty());
        assert!(status.error.is_none());

        let _ = fs::remove_file(&script_path);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn detect_opencode_status_rejects_launcher_like_windows_candidate() {
        let unique = format!(
            "ccgui-opencode-launcher-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let bin_path = root
            .join("AppData")
            .join("Local")
            .join("Programs")
            .join("OpenCode")
            .join("opencode.exe");
        fs::create_dir_all(bin_path.parent().expect("launcher dir")).expect("create launcher dir");
        fs::write(&bin_path, []).expect("create fake launcher");

        let status = detect_opencode_status(Some(bin_path.to_string_lossy().as_ref())).await;
        assert!(!status.installed);
        assert!(status
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("[OPENCODE_CLI_UNSAFE]"));

        let _ = fs::remove_file(&bin_path);
        let _ = fs::remove_dir_all(&root);
    }
}
