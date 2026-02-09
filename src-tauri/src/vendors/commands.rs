use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::{CodexProviderConfig, ProviderConfig};

// ==================== Claude Settings Sync ====================

/// Fields in ~/.claude/settings.json that are managed by the system and should NOT be overwritten
const PROTECTED_SYSTEM_FIELDS: &[&str] = &[
    "mcpServers",
    "disabledMcpServers",
    "plugins",
    "trustedDirectories",
    "trustedFiles",
];

/// Fields that a provider's settingsConfig can manage (overwrite) in ~/.claude/settings.json
const PROVIDER_MANAGED_FIELDS: &[&str] = &[
    "env",
    "model",
    "alwaysThinkingEnabled",
    "codemossProviderId",
    "maxContextLengthTokens",
    "temperature",
    "topP",
    "topK",
];

fn claude_settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".claude").join("settings.json"))
}

fn read_claude_settings() -> Result<serde_json::Map<String, Value>, String> {
    let path = claude_settings_path()?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read claude settings: {}", e))?;
    if content.trim().is_empty() {
        return Ok(serde_json::Map::new());
    }
    let val: Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse claude settings: {}", e))?;
    match val {
        Value::Object(map) => Ok(map),
        _ => Ok(serde_json::Map::new()),
    }
}

fn write_claude_settings(settings: &serde_json::Map<String, Value>) -> Result<(), String> {
    let path = claude_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create claude settings dir: {}", e))?;
    }

    // Ensure env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"
    let mut settings = settings.clone();
    let env = settings
        .entry("env")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if let Value::Object(ref mut env_map) = env {
        env_map.insert(
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".into(),
            Value::String("1".into()),
        );
    }

    let content = serde_json::to_string_pretty(&Value::Object(settings))
        .map_err(|e| format!("Failed to serialize claude settings: {}", e))?;

    // Atomic write: write to temp file first, then rename
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, &content)
        .map_err(|e| format!("Failed to write claude settings temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename claude settings temp file: {}", e))
}

/// Apply the active provider's settingsConfig to ~/.claude/settings.json
/// Uses incremental merge: provider-managed fields are overwritten, system fields are preserved
fn apply_provider_to_claude_settings(provider_value: &Value, provider_id: &str) -> Result<(), String> {
    let settings_config = match provider_value.get("settingsConfig") {
        Some(sc) if sc.is_object() => sc,
        _ => return Ok(()), // No settingsConfig, nothing to sync
    };

    let mut claude_settings = read_claude_settings()?;

    if let Value::Object(config_map) = settings_config {
        for (key, value) in config_map {
            if value.is_null() {
                continue;
            }
            if PROTECTED_SYSTEM_FIELDS.contains(&key.as_str()) {
                continue;
            }
            if PROVIDER_MANAGED_FIELDS.contains(&key.as_str()) {
                claude_settings.insert(key.clone(), value.clone());
            }
        }
    }

    // Tag with the provider ID for traceability
    claude_settings.insert(
        "codemossProviderId".into(),
        Value::String(provider_id.to_string()),
    );

    write_claude_settings(&claude_settings)
}

// ==================== Config File Types ====================

/// Represents the ~/.codemoss/config.json file structure shared with idea-claude-code-gui
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct CodemossConfig {
    #[serde(default)]
    version: Option<Value>,
    #[serde(default)]
    claude: ClaudeSection,
    #[serde(default)]
    codex: CodexSection,
    /// Preserve all other top-level fields (mcpServers, agents, ui, etc.)
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct ClaudeSection {
    #[serde(default)]
    providers: HashMap<String, Value>,
    #[serde(default)]
    current: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct CodexSection {
    #[serde(default)]
    providers: HashMap<String, Value>,
    #[serde(default)]
    current: Option<String>,
}

// ==================== Helpers ====================

fn config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".codemoss").join("config.json")
}

fn read_config() -> Result<CodemossConfig, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(CodemossConfig::default());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    if content.trim().is_empty() {
        return Ok(CodemossConfig::default());
    }
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
}

fn write_config(config: &CodemossConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))
}

/// Convert a raw JSON Value from config.json providers map into ProviderConfig for frontend
fn value_to_claude_provider(
    id: &str,
    value: &Value,
    is_active: bool,
) -> Result<ProviderConfig, String> {
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let remark = value.get("remark").and_then(|v| v.as_str()).map(String::from);
    let website_url = value
        .get("websiteUrl")
        .and_then(|v| v.as_str())
        .map(String::from);
    let category = value
        .get("category")
        .and_then(|v| v.as_str())
        .map(String::from);
    let created_at = value.get("createdAt").and_then(|v| v.as_i64());
    let source = value.get("source").and_then(|v| v.as_str()).map(String::from);
    let is_local_provider = value.get("isLocalProvider").and_then(|v| v.as_bool());
    let settings_config = value.get("settingsConfig").cloned();

    Ok(ProviderConfig {
        id: id.to_string(),
        name,
        remark,
        website_url: website_url,
        category,
        created_at,
        is_active,
        source,
        is_local_provider,
        settings_config,
    })
}

/// Convert a ProviderConfig back to JSON Value for storage in config.json
fn claude_provider_to_value(provider: &ProviderConfig) -> Value {
    let mut map = serde_json::Map::new();
    map.insert("id".into(), Value::String(provider.id.clone()));
    map.insert("name".into(), Value::String(provider.name.clone()));
    if let Some(ref remark) = provider.remark {
        map.insert("remark".into(), Value::String(remark.clone()));
    }
    if let Some(ref url) = provider.website_url {
        map.insert("websiteUrl".into(), Value::String(url.clone()));
    }
    if let Some(ref cat) = provider.category {
        map.insert("category".into(), Value::String(cat.clone()));
    }
    if let Some(ts) = provider.created_at {
        map.insert("createdAt".into(), Value::Number(ts.into()));
    }
    if let Some(ref src) = provider.source {
        map.insert("source".into(), Value::String(src.clone()));
    }
    if let Some(local) = provider.is_local_provider {
        map.insert("isLocalProvider".into(), Value::Bool(local));
    }
    if let Some(ref sc) = provider.settings_config {
        map.insert("settingsConfig".into(), sc.clone());
    }
    Value::Object(map)
}

fn value_to_codex_provider(
    id: &str,
    value: &Value,
    is_active: bool,
) -> Result<CodexProviderConfig, String> {
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let remark = value.get("remark").and_then(|v| v.as_str()).map(String::from);
    let created_at = value.get("createdAt").and_then(|v| v.as_i64());
    let config_toml = value
        .get("configToml")
        .and_then(|v| v.as_str())
        .map(String::from);
    let auth_json = value
        .get("authJson")
        .and_then(|v| v.as_str())
        .map(String::from);
    let custom_models = value.get("customModels").and_then(|v| {
        serde_json::from_value(v.clone()).ok()
    });

    Ok(CodexProviderConfig {
        id: id.to_string(),
        name,
        remark,
        created_at,
        is_active,
        config_toml,
        auth_json,
        custom_models,
    })
}

fn codex_provider_to_value(provider: &CodexProviderConfig) -> Value {
    let mut map = serde_json::Map::new();
    map.insert("id".into(), Value::String(provider.id.clone()));
    map.insert("name".into(), Value::String(provider.name.clone()));
    if let Some(ref remark) = provider.remark {
        map.insert("remark".into(), Value::String(remark.clone()));
    }
    if let Some(ts) = provider.created_at {
        map.insert("createdAt".into(), Value::Number(ts.into()));
    }
    if let Some(ref toml) = provider.config_toml {
        map.insert("configToml".into(), Value::String(toml.clone()));
    }
    if let Some(ref auth) = provider.auth_json {
        map.insert("authJson".into(), Value::String(auth.clone()));
    }
    if let Some(ref models) = provider.custom_models {
        if let Ok(v) = serde_json::to_value(models) {
            map.insert("customModels".into(), v);
        }
    }
    Value::Object(map)
}

// ==================== Claude Provider Commands ====================

#[tauri::command]
pub(crate) async fn vendor_get_claude_providers() -> Result<Vec<ProviderConfig>, String> {
    let config = read_config()?;
    let current = config.claude.current.as_deref();
    let mut providers: Vec<ProviderConfig> = config
        .claude
        .providers
        .iter()
        .filter_map(|(id, value)| {
            let is_active = current == Some(id.as_str());
            value_to_claude_provider(id, value, is_active).ok()
        })
        .collect();
    providers.sort_by(|a, b| {
        let ta = a.created_at.unwrap_or(0);
        let tb = b.created_at.unwrap_or(0);
        ta.cmp(&tb)
    });
    Ok(providers)
}

#[tauri::command]
pub(crate) async fn vendor_add_claude_provider(provider: ProviderConfig) -> Result<(), String> {
    let mut config = read_config()?;
    if config.claude.providers.contains_key(&provider.id) {
        return Err(format!("Provider with id {} already exists", provider.id));
    }
    config
        .claude
        .providers
        .insert(provider.id.clone(), claude_provider_to_value(&provider));
    write_config(&config)
}

#[tauri::command]
pub(crate) async fn vendor_update_claude_provider(
    id: String,
    updates: ProviderConfig,
) -> Result<(), String> {
    let mut config = read_config()?;
    if !config.claude.providers.contains_key(&id) {
        return Err(format!("Provider {} not found", id));
    }
    config
        .claude
        .providers
        .insert(id, claude_provider_to_value(&updates));
    write_config(&config)
}

#[tauri::command]
pub(crate) async fn vendor_delete_claude_provider(id: String) -> Result<(), String> {
    let mut config = read_config()?;
    if config.claude.providers.remove(&id).is_none() {
        return Err(format!("Provider {} not found", id));
    }
    if config.claude.current.as_ref() == Some(&id) {
        config.claude.current = None;
    }
    write_config(&config)
}

#[tauri::command]
pub(crate) async fn vendor_switch_claude_provider(id: String) -> Result<(), String> {
    let mut config = read_config()?;
    let provider_value = config
        .claude
        .providers
        .get(&id)
        .ok_or_else(|| format!("Provider {} not found", id))?
        .clone();
    config.claude.current = Some(id.clone());
    write_config(&config)?;

    // Sync the provider's settingsConfig to ~/.claude/settings.json
    apply_provider_to_claude_settings(&provider_value, &id)?;

    Ok(())
}

// ==================== Codex Provider Commands ====================

#[tauri::command]
pub(crate) async fn vendor_get_codex_providers() -> Result<Vec<CodexProviderConfig>, String> {
    let config = read_config()?;
    let current = config.codex.current.as_deref();
    let mut providers: Vec<CodexProviderConfig> = config
        .codex
        .providers
        .iter()
        .filter_map(|(id, value)| {
            let is_active = current == Some(id.as_str());
            value_to_codex_provider(id, value, is_active).ok()
        })
        .collect();
    providers.sort_by(|a, b| {
        let ta = a.created_at.unwrap_or(0);
        let tb = b.created_at.unwrap_or(0);
        ta.cmp(&tb)
    });
    Ok(providers)
}

#[tauri::command]
pub(crate) async fn vendor_add_codex_provider(provider: CodexProviderConfig) -> Result<(), String> {
    let mut config = read_config()?;
    if config.codex.providers.contains_key(&provider.id) {
        return Err(format!(
            "Codex provider with id {} already exists",
            provider.id
        ));
    }
    config
        .codex
        .providers
        .insert(provider.id.clone(), codex_provider_to_value(&provider));
    write_config(&config)
}

#[tauri::command]
pub(crate) async fn vendor_update_codex_provider(
    id: String,
    updates: CodexProviderConfig,
) -> Result<(), String> {
    let mut config = read_config()?;
    if !config.codex.providers.contains_key(&id) {
        return Err(format!("Codex provider {} not found", id));
    }
    config
        .codex
        .providers
        .insert(id, codex_provider_to_value(&updates));
    write_config(&config)
}

#[tauri::command]
pub(crate) async fn vendor_delete_codex_provider(id: String) -> Result<(), String> {
    let mut config = read_config()?;
    if config.codex.providers.remove(&id).is_none() {
        return Err(format!("Codex provider {} not found", id));
    }
    if config.codex.current.as_ref() == Some(&id) {
        config.codex.current = None;
    }
    write_config(&config)
}

#[tauri::command]
pub(crate) async fn vendor_switch_codex_provider(id: String) -> Result<(), String> {
    let mut config = read_config()?;
    if !config.codex.providers.contains_key(&id) {
        return Err(format!("Codex provider {} not found", id));
    }
    config.codex.current = Some(id);
    write_config(&config)
}
