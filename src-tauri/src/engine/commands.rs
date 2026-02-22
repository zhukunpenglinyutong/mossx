//! Tauri commands for engine management
//!
//! Provides frontend-accessible commands for engine detection, switching,
//! and configuration.

use chrono::{
    DateTime, Duration as ChronoDuration, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone,
};
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::state::AppState;

use super::events::{engine_event_to_app_server_event, EngineEvent};
use super::status::detect_opencode_status;
use super::{EngineConfig, EngineStatus, EngineType};

/// Maximum lifetime for an event forwarder task. Prevents orphaned tasks from
/// leaking memory when the underlying process hangs or is killed externally.
const EVENT_FORWARDER_TIMEOUT_SECS: u64 = 30 * 60;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeCommandEntry {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "argumentHint")]
    pub argument_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeAgentEntry {
    pub id: String,
    pub description: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeProviderHealth {
    pub provider: String,
    pub connected: bool,
    pub credential_count: usize,
    pub matched: bool,
    pub authenticated_providers: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeMcpServerState {
    pub name: String,
    pub enabled: bool,
    pub status: Option<String>,
    pub permission_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeStatusSnapshot {
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub agent: Option<String>,
    pub variant: Option<String>,
    pub provider: Option<String>,
    pub provider_health: OpenCodeProviderHealth,
    pub mcp_enabled: bool,
    pub mcp_servers: Vec<OpenCodeMcpServerState>,
    pub mcp_raw: String,
    pub managed_toggles: bool,
    pub token_usage: Option<u64>,
    pub context_window: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSessionEntry {
    pub session_id: String,
    pub title: String,
    pub updated_label: String,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeProviderOption {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub category: String,
    pub recommended: bool,
}

#[derive(Debug, Clone, Default)]
struct OpenCodeMcpToggleState {
    global_enabled: bool,
    server_enabled: HashMap<String, bool>,
}

const OPENCODE_CACHE_TTL: Duration = Duration::from_secs(30);
static OPENCODE_COMMANDS_CACHE: OnceLock<Mutex<Option<(Instant, Vec<OpenCodeCommandEntry>)>>> =
    OnceLock::new();
static OPENCODE_AGENTS_CACHE: OnceLock<Mutex<Option<(Instant, Vec<OpenCodeAgentEntry>)>>> =
    OnceLock::new();
static OPENCODE_MCP_TOGGLE_STATE: OnceLock<Mutex<HashMap<String, OpenCodeMcpToggleState>>> =
    OnceLock::new();

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

fn resolve_opencode_bin(config: Option<&EngineConfig>) -> String {
    if let Some(custom) = config.and_then(|c| c.bin_path.as_ref()) {
        return custom.clone();
    }
    crate::backend::app_server::find_cli_binary("opencode", None)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "opencode".to_string())
}

fn build_opencode_command(config: Option<&EngineConfig>) -> Command {
    let bin = resolve_opencode_bin(config);
    let mut cmd = crate::backend::app_server::build_command_for_binary(&bin);
    if let Some(home) = config.and_then(|c| c.home_dir.as_ref()) {
        cmd.env("OPENCODE_HOME", home);
    }
    cmd
}

fn opencode_session_candidate_paths(
    workspace_path: &Path,
    session_id: &str,
    config: Option<&EngineConfig>,
) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = config.and_then(|item| item.home_dir.as_ref()) {
        roots.push(PathBuf::from(home).join("sessions"));
    }
    if let Some(home) = std::env::var_os("OPENCODE_HOME") {
        roots.push(PathBuf::from(home).join("sessions"));
    }
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".opencode").join("sessions"));
    }
    roots.push(workspace_path.join(".opencode").join("sessions"));

    let mut candidates = Vec::new();
    for root in roots {
        for candidate in [
            root.join(session_id),
            root.join(format!("{session_id}.json")),
        ] {
            if !candidates.contains(&candidate) {
                candidates.push(candidate);
            }
        }
    }
    candidates
}

fn delete_opencode_session_files(
    workspace_path: &Path,
    session_id: &str,
    config: Option<&EngineConfig>,
) -> Result<(), String> {
    let normalized_session_id = session_id.trim();
    if normalized_session_id.is_empty()
        || normalized_session_id.contains('/')
        || normalized_session_id.contains('\\')
        || normalized_session_id.contains("..")
    {
        return Err("[SESSION_NOT_FOUND] Invalid OpenCode session id".to_string());
    }

    let mut deleted_any = false;

    let candidates =
        opencode_session_candidate_paths(workspace_path, normalized_session_id, config);
    for candidate in candidates {
        if !candidate.exists() {
            continue;
        }
        let delete_result = if candidate.is_dir() {
            fs::remove_dir_all(&candidate)
        } else {
            fs::remove_file(&candidate)
        };
        match delete_result {
            Ok(()) => {
                deleted_any = true;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "[IO_ERROR] Failed to delete OpenCode session path {}: {}",
                    candidate.display(),
                    error
                ));
            }
        }
    }

    for data_root in opencode_data_candidate_roots(workspace_path, config) {
        match delete_opencode_session_from_datastore(&data_root, normalized_session_id) {
            Ok(true) => {
                deleted_any = true;
            }
            Ok(false) => {}
            Err(error) => return Err(error),
        }
    }

    if deleted_any {
        return Ok(());
    }

    Err(format!(
        "[SESSION_NOT_FOUND] OpenCode session file not found: {}",
        normalized_session_id
    ))
}

fn opencode_data_candidate_roots(
    workspace_path: &Path,
    config: Option<&EngineConfig>,
) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = config.and_then(|item| item.home_dir.as_ref()) {
        roots.push(PathBuf::from(home));
    }
    if let Some(home) = std::env::var_os("OPENCODE_HOME") {
        roots.push(PathBuf::from(home));
    }
    if let Some(data_home) = dirs::data_local_dir() {
        roots.push(data_home.join("opencode"));
    }
    if let Some(data_dir) = dirs::data_dir() {
        roots.push(data_dir.join("opencode"));
    }
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local").join("share").join("opencode"));
    }
    roots.push(workspace_path.join(".opencode"));

    let mut deduped = Vec::new();
    for root in roots {
        if !deduped.contains(&root) {
            deduped.push(root);
        }
    }
    deduped
}

fn delete_path_if_exists(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    match result {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "[IO_ERROR] Failed to delete OpenCode session path {}: {}",
            path.display(),
            error
        )),
    }
}

fn delete_opencode_session_from_datastore(
    data_root: &Path,
    session_id: &str,
) -> Result<bool, String> {
    let mut deleted_any = false;

    let db_path = data_root.join("opencode.db");
    if db_path.exists() {
        let connection = Connection::open(&db_path).map_err(|error| {
            format!(
                "[IO_ERROR] Failed to open OpenCode datastore {}: {}",
                db_path.display(),
                error
            )
        })?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|error| {
                format!(
                    "[IO_ERROR] Failed to enable OpenCode datastore foreign_keys {}: {}",
                    db_path.display(),
                    error
                )
            })?;
        let deleted_rows = connection
            .execute("DELETE FROM session WHERE id = ?1", params![session_id])
            .map_err(|error| {
                format!(
                    "[IO_ERROR] Failed to delete OpenCode session {} in {}: {}",
                    session_id,
                    db_path.display(),
                    error
                )
            })?;
        if deleted_rows > 0 {
            deleted_any = true;
        }
    }

    let storage_root = data_root.join("storage");
    if storage_root.exists() {
        let reader = fs::read_dir(&storage_root).map_err(|error| {
            format!(
                "[IO_ERROR] Failed to read OpenCode storage directory {}: {}",
                storage_root.display(),
                error
            )
        })?;
        for entry in reader {
            let entry = entry.map_err(|error| {
                format!(
                    "[IO_ERROR] Failed to read OpenCode storage entry under {}: {}",
                    storage_root.display(),
                    error
                )
            })?;
            let parent = entry.path();
            if !parent.is_dir() {
                continue;
            }
            if delete_path_if_exists(&parent.join(session_id))? {
                deleted_any = true;
            }
            if delete_path_if_exists(&parent.join(format!("{session_id}.json")))? {
                deleted_any = true;
            }
        }
    }

    Ok(deleted_any)
}

fn extract_json_object_from_text(input: &str) -> Option<String> {
    let start = input.find('{')?;
    let end = input.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(input[start..=end].to_string())
}

fn extract_first_url(input: &str) -> Option<String> {
    let clean = strip_ansi_codes(input);
    for token in clean.split_whitespace() {
        if token.starts_with("http://") || token.starts_with("https://") {
            return Some(
                token
                    .trim_matches(|c: char| c == ')' || c == ']' || c == ',' || c == '.')
                    .to_string(),
            );
        }
    }
    None
}

fn parse_imported_session_id(output: &str) -> Option<String> {
    for line in strip_ansi_codes(output).lines() {
        let trimmed = line.trim();
        let Some((_, right)) = trimmed.split_once("Imported session:") else {
            continue;
        };
        let candidate = right.split_whitespace().next().unwrap_or_default().trim();
        if !candidate.is_empty() {
            return Some(candidate.to_string());
        }
    }
    None
}

fn parse_json_value(output: &str) -> Option<Value> {
    let trimmed = strip_ansi_codes(output).trim().to_string();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str::<Value>(&trimmed).ok()
}

fn parse_opencode_help_commands(stdout: &str) -> Vec<OpenCodeCommandEntry> {
    let clean = strip_ansi_codes(stdout);
    let mut entries = Vec::new();
    let mut in_commands = false;
    for raw in clean.lines() {
        let line = raw.trim_end();
        if line.trim() == "Commands:" {
            in_commands = true;
            continue;
        }
        if in_commands && line.trim().is_empty() {
            break;
        }
        if !in_commands {
            continue;
        }
        let trimmed = line.trim_start();
        if !trimmed.starts_with("opencode ") {
            continue;
        }
        let without_prefix = trimmed.trim_start_matches("opencode ").trim();
        if without_prefix.is_empty() {
            continue;
        }
        let mut chunks = without_prefix.splitn(2, "  ");
        let command_name = chunks.next().unwrap_or_default().trim();
        let description = chunks.next().map(str::trim).filter(|s| !s.is_empty());
        let name = command_name
            .split_whitespace()
            .take_while(|token| !token.starts_with('[') && !token.starts_with('<'))
            .collect::<Vec<_>>()
            .join(" ");
        if name.is_empty() {
            continue;
        }
        entries.push(OpenCodeCommandEntry {
            name: name.replace(' ', ":"),
            description: description.map(ToOwned::to_owned),
            argument_hint: None,
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    entries.dedup_by(|a, b| a.name == b.name);
    entries
}

fn parse_opencode_agent_list(stdout: &str) -> Vec<OpenCodeAgentEntry> {
    let clean = strip_ansi_codes(stdout);
    let mut entries = Vec::new();
    for raw in clean.lines() {
        let line = raw.trim();
        if line.is_empty()
            || line.starts_with('[')
            || line.starts_with('{')
            || line.starts_with('"')
        {
            continue;
        }
        if let Some(first) = line.chars().next() {
            if matches!(first, '{' | '}' | '[' | ']' | ',') {
                continue;
            }
        }
        if line.contains(':') || line.starts_with(']') {
            continue;
        }
        let (id, flag_part) = if let Some((left, right)) = line.split_once('(') {
            (left.trim(), Some(right.trim_end_matches(')').trim()))
        } else {
            (line, None)
        };
        if id.is_empty() || !id.chars().any(|ch| ch.is_alphanumeric()) {
            continue;
        }
        let is_primary = flag_part
            .map(|flag| flag.eq_ignore_ascii_case("primary"))
            .unwrap_or(false);
        entries.push(OpenCodeAgentEntry {
            id: id.to_string(),
            description: flag_part
                .filter(|flag| !flag.eq_ignore_ascii_case("primary"))
                .map(ToOwned::to_owned),
            is_primary,
        });
    }
    entries.sort_by(|a, b| a.id.cmp(&b.id));
    entries.dedup_by(|a, b| a.id == b.id);
    entries
}

fn parse_opencode_debug_config_agents(stdout: &str) -> Vec<OpenCodeAgentEntry> {
    let clean = strip_ansi_codes(stdout);
    let Ok(value) = serde_json::from_str::<Value>(clean.trim()) else {
        return Vec::new();
    };
    let Some(agent_map) = value.get("agent").and_then(|item| item.as_object()) else {
        return Vec::new();
    };

    let mut entries = Vec::new();
    for (id, config) in agent_map {
        let trimmed_id = id.trim();
        if trimmed_id.is_empty() || !trimmed_id.chars().any(|ch| ch.is_alphanumeric()) {
            continue;
        }
        let mode = config
            .get("mode")
            .and_then(|item| item.as_str())
            .map(|item| item.trim().to_lowercase())
            .unwrap_or_default();
        let is_primary = mode == "primary";
        let description = config
            .get("description")
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned);
        entries.push(OpenCodeAgentEntry {
            id: trimmed_id.to_string(),
            description,
            is_primary,
        });
    }
    entries.sort_by(|a, b| a.id.cmp(&b.id));
    entries.dedup_by(|a, b| a.id == b.id);
    entries
}

fn merge_opencode_agents(
    mut primary: Vec<OpenCodeAgentEntry>,
    supplemental: Vec<OpenCodeAgentEntry>,
) -> Vec<OpenCodeAgentEntry> {
    let mut merged: HashMap<String, OpenCodeAgentEntry> = HashMap::new();
    for item in primary.drain(..) {
        merged.insert(item.id.clone(), item);
    }
    for item in supplemental {
        merged
            .entry(item.id.clone())
            .and_modify(|existing| {
                existing.is_primary = existing.is_primary || item.is_primary;
                if existing.description.is_none() {
                    existing.description = item.description.clone();
                }
            })
            .or_insert(item);
    }
    let mut out = merged.into_values().collect::<Vec<_>>();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn derive_provider_from_model(model: Option<&str>) -> Option<String> {
    let raw = model?.trim();
    if raw.is_empty() {
        return None;
    }
    if let Some((provider, _)) = raw.split_once('/') {
        let key = provider.trim().to_lowercase();
        return if key.is_empty() { None } else { Some(key) };
    }

    let key = raw.to_lowercase();
    if key.starts_with("gpt-")
        || key.starts_with("o1")
        || key.starts_with("o3")
        || key.starts_with("o4")
        || key.starts_with("codex")
    {
        return Some("openai".to_string());
    }
    if key.starts_with("claude-") {
        return Some("anthropic".to_string());
    }
    if key.starts_with("gemini-") {
        return Some("google".to_string());
    }
    if key.contains("minimax") {
        return Some("minimax-cn-coding-plan".to_string());
    }
    None
}

fn normalize_provider_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

fn tokenize_provider_key(value: &str) -> Vec<String> {
    value
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter_map(|token| {
            let trimmed = token.trim().to_lowercase();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .collect()
}

fn is_provider_noise_token(token: &str) -> bool {
    matches!(
        token,
        "cn" | "us" | "eu" | "jp" | "uk" | "ap" | "sg" | "global"
    )
}

fn provider_keys_match(target: &str, candidate: &str) -> bool {
    let target_key = normalize_provider_key(target);
    let candidate_key = normalize_provider_key(candidate);
    if target_key == candidate_key
        || target_key.contains(&candidate_key)
        || candidate_key.contains(&target_key)
    {
        return true;
    }

    let target_tokens = tokenize_provider_key(target)
        .into_iter()
        .filter(|token| !is_provider_noise_token(token))
        .collect::<Vec<_>>();
    let candidate_tokens = tokenize_provider_key(candidate)
        .into_iter()
        .filter(|token| !is_provider_noise_token(token))
        .collect::<Vec<_>>();
    if target_tokens.is_empty() || candidate_tokens.is_empty() {
        return false;
    }
    candidate_tokens
        .iter()
        .all(|token| target_tokens.iter().any(|item| item == token))
        || target_tokens
            .iter()
            .all(|token| candidate_tokens.iter().any(|item| item == token))
}

fn parse_opencode_auth_providers(stdout: &str) -> Vec<String> {
    let clean = strip_ansi_codes(stdout);
    let mut providers: Vec<String> = Vec::new();
    for raw in clean.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('┌')
            || trimmed.starts_with('│')
            || trimmed.starts_with('└')
            || trimmed.starts_with("Credentials")
        {
            continue;
        }
        let line = trimmed
            .trim_start_matches(|c: char| matches!(c, '●' | '○' | '•' | '-' | '*'))
            .trim();
        if line.is_empty() || line.starts_with('~') {
            continue;
        }
        let mut name_parts = Vec::new();
        for token in line.split_whitespace() {
            let token_lower = token.to_lowercase();
            if token_lower == "oauth" || token_lower == "api" {
                break;
            }
            if token.starts_with('(') {
                break;
            }
            name_parts.push(token);
        }
        if name_parts.is_empty() {
            continue;
        }
        providers.push(name_parts.join(" ").to_lowercase());
    }
    providers.sort();
    providers.dedup();
    providers
}

fn parse_opencode_mcp_servers(stdout: &str) -> Vec<OpenCodeMcpServerState> {
    let clean = strip_ansi_codes(stdout);
    if clean.to_lowercase().contains("no mcp servers configured") {
        return Vec::new();
    }
    let mut servers = Vec::new();
    for raw in clean.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty()
            || trimmed.starts_with('┌')
            || trimmed.starts_with('│')
            || trimmed.starts_with('└')
            || trimmed.to_lowercase().contains("mcp servers")
        {
            continue;
        }
        let line = trimmed
            .trim_start_matches(|c: char| matches!(c, '●' | '○' | '•' | '-' | '*'))
            .trim();
        if line.is_empty() {
            continue;
        }
        let mut tokens = line.split_whitespace();
        let name = tokens.next().unwrap_or_default().trim().to_string();
        if name.is_empty() {
            continue;
        }
        let lower_line = line.to_lowercase();
        let status = if lower_line.contains("connected") {
            Some("connected".to_string())
        } else if lower_line.contains("auth") {
            Some("auth-required".to_string())
        } else if lower_line.contains("error") || lower_line.contains("failed") {
            Some("error".to_string())
        } else if lower_line.contains("running") {
            Some("running".to_string())
        } else {
            Some("unknown".to_string())
        };
        let permission_hint = if lower_line.contains("file") {
            Some("filesystem".to_string())
        } else if lower_line.contains("web") || lower_line.contains("network") {
            Some("network".to_string())
        } else if lower_line.contains("git") {
            Some("git".to_string())
        } else {
            None
        };
        let enabled = !lower_line.contains("disabled");
        servers.push(OpenCodeMcpServerState {
            name,
            enabled,
            status,
            permission_hint,
        });
    }
    servers.sort_by(|a, b| a.name.cmp(&b.name));
    servers.dedup_by(|a, b| a.name == b.name);
    servers
}

fn resolve_session_id_from_thread(thread_id: Option<&str>) -> Option<String> {
    let raw = thread_id?.trim();
    if raw.starts_with("opencode:") {
        let session = raw.trim_start_matches("opencode:").trim();
        if !session.is_empty() {
            return Some(session.to_string());
        }
    }
    None
}

fn parse_opencode_date_token(input: &str) -> Option<NaiveDate> {
    let token = input.trim();
    if token.is_empty() {
        return None;
    }
    NaiveDate::parse_from_str(token, "%m/%d/%Y")
        .ok()
        .or_else(|| NaiveDate::parse_from_str(token, "%-m/%-d/%Y").ok())
        .or_else(|| NaiveDate::parse_from_str(token, "%Y-%m-%d").ok())
}

fn parse_opencode_time_token(input: &str) -> Option<NaiveTime> {
    let token = input.trim();
    if token.is_empty() {
        return None;
    }
    NaiveTime::parse_from_str(token, "%I:%M %p")
        .ok()
        .or_else(|| NaiveTime::parse_from_str(token, "%-I:%M %p").ok())
        .or_else(|| NaiveTime::parse_from_str(token, "%H:%M").ok())
}

fn parse_relative_updated_at_millis(input: &str, now: DateTime<Local>) -> Option<i64> {
    let label = input.trim().to_lowercase();
    if label.is_empty() {
        return None;
    }
    if label == "just now" || label == "刚刚" {
        return Some(now.timestamp_millis());
    }

    let parse_amount = |text: &str, suffix: &str| -> Option<i64> {
        text.strip_suffix(suffix)?.trim().parse::<i64>().ok()
    };
    let apply_seconds = |seconds: i64| -> Option<i64> {
        Some((now - ChronoDuration::seconds(seconds.max(0))).timestamp_millis())
    };

    if let Some(value) = parse_amount(&label, "秒前") {
        return apply_seconds(value);
    }
    if let Some(value) = parse_amount(&label, "分钟前").or_else(|| parse_amount(&label, "分前"))
    {
        return apply_seconds(value * 60);
    }
    if let Some(value) = parse_amount(&label, "小时前").or_else(|| parse_amount(&label, "小時前"))
    {
        return apply_seconds(value * 3600);
    }
    if let Some(value) = parse_amount(&label, "天前") {
        return apply_seconds(value * 86_400);
    }
    if let Some(value) = parse_amount(&label, "周前") {
        return apply_seconds(value * 604_800);
    }

    let mut compact_value: Option<i64> = None;
    let mut compact_unit: Option<String> = None;
    let mut number_chars = String::new();
    for ch in label.chars() {
        if ch.is_ascii_digit() {
            number_chars.push(ch);
            continue;
        }
        compact_value = number_chars.parse::<i64>().ok();
        compact_unit = Some(label[number_chars.len()..].trim().to_string());
        break;
    }
    if let (Some(value), Some(unit)) = (compact_value, compact_unit) {
        if unit.starts_with("s") {
            return apply_seconds(value);
        }
        if unit.starts_with('m') {
            return apply_seconds(value * 60);
        }
        if unit.starts_with('h') {
            return apply_seconds(value * 3600);
        }
        if unit.starts_with('d') {
            return apply_seconds(value * 86_400);
        }
        if unit.starts_with('w') {
            return apply_seconds(value * 604_800);
        }
    }
    None
}

fn parse_opencode_updated_at(updated_label: &str, now: DateTime<Local>) -> Option<i64> {
    let trimmed = updated_label.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(parsed) = DateTime::parse_from_rfc3339(trimmed) {
        return Some(parsed.with_timezone(&Local).timestamp_millis());
    }

    let normalized = trimmed.replace('•', "·");
    let mut parts = normalized
        .split('·')
        .map(str::trim)
        .filter(|part| !part.is_empty());
    let first = parts.next();
    let second = parts.next();

    if let (Some(time_part), Some(date_part)) = (first, second) {
        if let (Some(time), Some(date)) = (
            parse_opencode_time_token(time_part),
            parse_opencode_date_token(date_part),
        ) {
            let local_result = Local.from_local_datetime(&NaiveDateTime::new(date, time));
            if let Some(value) = local_result.single().or_else(|| local_result.earliest()) {
                return Some(value.timestamp_millis());
            }
        }
    }

    if let Some(single_part) = first {
        if let Some(time) = parse_opencode_time_token(single_part) {
            let today = now.date_naive();
            let local_result = Local.from_local_datetime(&NaiveDateTime::new(today, time));
            if let Some(mut value) = local_result.single().or_else(|| local_result.earliest()) {
                if value > now + ChronoDuration::minutes(5) {
                    value = value - ChronoDuration::days(1);
                }
                return Some(value.timestamp_millis());
            }
        }
        if let Some(date) = parse_opencode_date_token(single_part) {
            let local_result = Local.from_local_datetime(&NaiveDateTime::new(date, NaiveTime::MIN));
            if let Some(value) = local_result.single().or_else(|| local_result.earliest()) {
                return Some(value.timestamp_millis());
            }
        }
    }

    parse_relative_updated_at_millis(trimmed, now)
}

fn parse_opencode_session_list(stdout: &str) -> Vec<OpenCodeSessionEntry> {
    let clean = strip_ansi_codes(stdout);
    let now = Local::now();
    let mut entries = Vec::new();
    for raw in clean.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with("Session ID") || trimmed.starts_with('─') {
            continue;
        }
        let Some(session_id_end) = trimmed.find(char::is_whitespace) else {
            continue;
        };
        let session_id = trimmed[..session_id_end].trim();
        if session_id.is_empty() || !session_id.starts_with("ses_") {
            continue;
        }
        let rest = trimmed[session_id_end..].trim_start();
        if rest.is_empty() {
            continue;
        }
        let split_idx = rest.rfind("  ");
        let (title, updated) = if let Some(index) = split_idx {
            let title_text = rest[..index].trim();
            let updated_text = rest[index..].trim();
            (
                if title_text.is_empty() {
                    "Untitled"
                } else {
                    title_text
                },
                updated_text,
            )
        } else {
            (rest, "")
        };
        entries.push(OpenCodeSessionEntry {
            session_id: session_id.to_string(),
            title: title.to_string(),
            updated_label: updated.to_string(),
            updated_at: parse_opencode_updated_at(updated, now),
        });
    }
    entries
}

fn slugify_provider_label(value: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
            continue;
        }
        if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn parse_provider_option_line(line: &str, category: &str) -> Option<OpenCodeProviderOption> {
    let trimmed = line
        .trim_start_matches(|ch: char| matches!(ch, '●' | '○' | '◆' | '◇' | '│'))
        .trim();
    if trimmed.is_empty() || trimmed.starts_with("Search:") || trimmed == "..." {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower == "select provider"
        || lower == "add credential"
        || lower == "login method"
        || lower.contains("to select")
        || lower.contains("enter: confirm")
        || lower.contains("type: to search")
        || lower.starts_with("search:")
        || trimmed.starts_with('┌')
        || trimmed.starts_with('└')
        || trimmed.starts_with('■')
        || trimmed.starts_with('│')
    {
        return None;
    }
    let (label, description) = if let Some((left, right)) = trimmed.split_once('(') {
        (
            left.trim().to_string(),
            Some(right.trim_end_matches(')').trim().to_string()),
        )
    } else {
        (trimmed.to_string(), None)
    };
    if label.is_empty() {
        return None;
    }
    let id = slugify_provider_label(&label);
    if id.is_empty() {
        return None;
    }
    let recommended = description
        .as_ref()
        .map(|text| text.to_ascii_lowercase().contains("recommended"))
        .unwrap_or(false);
    Some(OpenCodeProviderOption {
        id,
        label,
        description,
        category: category.to_string(),
        recommended,
    })
}

fn fallback_opencode_provider_catalog() -> Vec<OpenCodeProviderOption> {
    let popular = vec![
        ("opencode-zen", "OpenCode Zen", Some("recommended")),
        ("anthropic", "Anthropic", Some("Claude Max or API key")),
        ("github-copilot", "GitHub Copilot", None),
        ("openai", "OpenAI", Some("ChatGPT Plus/Pro or API key")),
        ("google", "Google", None),
    ];
    let other = vec![
        ("z-ai", "Z.AI"),
        ("zenmux", "ZenMux"),
        ("io-net", "IO.NET"),
        ("nvidia", "Nvidia"),
        ("fastrouter", "FastRouter"),
        ("iflow", "iFlow"),
        ("modelscope", "ModelScope"),
        ("llama", "Llama"),
    ];

    let mut out = Vec::new();
    for (id, label, description) in popular {
        out.push(OpenCodeProviderOption {
            id: id.to_string(),
            label: label.to_string(),
            description: description.map(ToOwned::to_owned),
            category: "popular".to_string(),
            recommended: description
                .map(|text| text.to_ascii_lowercase().contains("recommended"))
                .unwrap_or(false),
        });
    }
    for (id, label) in other {
        out.push(OpenCodeProviderOption {
            id: id.to_string(),
            label: label.to_string(),
            description: None,
            category: "other".to_string(),
            recommended: false,
        });
    }
    out
}

async fn fetch_opencode_provider_catalog_preview(
    workspace_path: &PathBuf,
    config: Option<&EngineConfig>,
) -> Vec<OpenCodeProviderOption> {
    let mut cmd = build_opencode_command(config);
    cmd.current_dir(workspace_path);
    cmd.arg("auth");
    cmd.arg("login");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());
    let mut child = match cmd.spawn() {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    tokio::time::sleep(Duration::from_millis(900)).await;
    let _ = child.start_kill();
    let output = match tokio::time::timeout(Duration::from_secs(2), child.wait_with_output()).await
    {
        Ok(Ok(value)) => value,
        _ => return Vec::new(),
    };
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let mut providers: Vec<OpenCodeProviderOption> = Vec::new();
    let mut category = "popular".to_string();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("Popular") {
            category = "popular".to_string();
            continue;
        }
        if trimmed.eq_ignore_ascii_case("Other") {
            category = "other".to_string();
            continue;
        }
        if let Some(option) = parse_provider_option_line(line, &category) {
            providers.push(option);
        }
    }
    providers.sort_by(|a, b| a.label.cmp(&b.label));
    providers.dedup_by(|a, b| a.id == b.id);
    providers
}

async fn fetch_opencode_provider_catalog_from_auth_picker(
    workspace_path: &PathBuf,
    config: Option<&EngineConfig>,
) -> Vec<OpenCodeProviderOption> {
    let mut cmd = build_opencode_command(config);
    cmd.current_dir(workspace_path);
    cmd.arg("auth");
    cmd.arg("login");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    if let Some(stdin) = child.stdin.as_mut() {
        let mut payload = String::new();
        for _ in 0..520 {
            payload.push_str("\u{1b}[B");
        }
        payload.push('\u{3}');
        if stdin.write_all(payload.as_bytes()).await.is_err() {
            let _ = child.start_kill();
            return Vec::new();
        }
        let _ = stdin.flush().await;
    }

    let output = match tokio::time::timeout(Duration::from_secs(12), child.wait_with_output()).await
    {
        Ok(Ok(value)) => value,
        _ => return Vec::new(),
    };
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let mut providers: Vec<OpenCodeProviderOption> = Vec::new();
    let mut category = "popular".to_string();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("Popular") {
            category = "popular".to_string();
            continue;
        }
        if trimmed.eq_ignore_ascii_case("Other") {
            category = "other".to_string();
            continue;
        }
        if let Some(option) = parse_provider_option_line(line, &category) {
            if let Some(existing) = providers.iter_mut().find(|item| item.id == option.id) {
                if option.category == "popular" {
                    existing.category = "popular".to_string();
                }
                if existing.description.is_none() && option.description.is_some() {
                    existing.description = option.description.clone();
                }
                existing.recommended = existing.recommended || option.recommended;
                continue;
            }
            providers.push(option);
        }
    }
    providers.sort_by(|a, b| {
        let score_a = if a.category == "popular" { 0 } else { 1 };
        let score_b = if b.category == "popular" { 0 } else { 1 };
        score_a
            .cmp(&score_b)
            .then_with(|| b.recommended.cmp(&a.recommended))
            .then_with(|| a.label.cmp(&b.label))
    });
    providers.dedup_by(|a, b| a.id == b.id);
    providers
}

fn parse_opencode_models_provider_ids(stdout: &str) -> Vec<String> {
    let mut providers = Vec::new();
    for raw in strip_ansi_codes(stdout).lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('{') || line.starts_with('[') {
            continue;
        }
        if line.starts_with("http://") || line.starts_with("https://") {
            continue;
        }
        let Some((provider, _model)) = line.split_once('/') else {
            continue;
        };
        let provider = provider.trim().to_lowercase();
        if provider.is_empty() {
            continue;
        }
        providers.push(provider);
    }
    providers.sort();
    providers.dedup();
    providers
}

fn provider_label_from_id(provider_id: &str) -> String {
    match provider_id {
        "z-ai" => "Z.AI".to_string(),
        "io-net" => "IO.NET".to_string(),
        "iflow" => "iFlow".to_string(),
        "zenmux" => "ZenMux".to_string(),
        "fastrouter" => "FastRouter".to_string(),
        "modelscope" => "ModelScope".to_string(),
        "minimax-cn-coding-plan" => "MiniMax Coding Plan (minimaxi.com)".to_string(),
        "minimax-cn" => "MiniMax (minimaxi.com)".to_string(),
        "opencode" => "OpenCode Zen".to_string(),
        "github-copilot" => "GitHub Copilot".to_string(),
        "openai" => "OpenAI".to_string(),
        "google" => "Google".to_string(),
        "anthropic" => "Anthropic".to_string(),
        _ => provider_id
            .split('-')
            .filter(|segment| !segment.is_empty())
            .map(|segment| {
                let mut chars = segment.chars();
                let Some(first) = chars.next() else {
                    return String::new();
                };
                format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

async fn fetch_opencode_provider_ids_from_models(
    workspace_path: &PathBuf,
    config: Option<&EngineConfig>,
) -> Vec<String> {
    let mut cmd = build_opencode_command(config);
    cmd.current_dir(workspace_path);
    cmd.arg("models");
    let output = match cmd.output().await {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_opencode_models_provider_ids(&stdout)
}

fn build_provider_prefill_query(provider_id: &str) -> Option<String> {
    let normalized = slugify_provider_label(provider_id);
    if normalized.is_empty() {
        return None;
    }
    let query = match normalized.as_str() {
        "minimax-cn-coding-plan" | "minimax-coding-plan" | "minimax-cn" => "minimax",
        "z-ai" | "zhipuai-coding-plan" | "zhipu-ai-coding-plan" => "zhipu",
        "github-models" | "github-token" => "github",
        other => other,
    };
    Some(query.to_string())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(target_os = "macos")]
fn open_terminal_with_command(command: &str) -> Result<(), String> {
    let script = format!(
        "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
        command.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|e| format!("Failed to launch Terminal auth flow: {}", e))?;
    if !status.success() {
        return Err("Terminal auth flow returned non-zero exit code".to_string());
    }
    Ok(())
}

fn apply_mcp_toggle_state(
    workspace_id: &str,
    servers: Vec<OpenCodeMcpServerState>,
) -> (bool, Vec<OpenCodeMcpServerState>, HashMap<String, bool>) {
    let cache = OPENCODE_MCP_TOGGLE_STATE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = match cache.lock() {
        Ok(value) => value,
        Err(_) => return (true, servers, HashMap::new()),
    };
    let entry = guard
        .entry(workspace_id.to_string())
        .or_insert_with(|| OpenCodeMcpToggleState {
            global_enabled: true,
            server_enabled: HashMap::new(),
        });
    let global_enabled = entry.global_enabled;
    let server_enabled_map = entry.server_enabled.clone();
    let merged = servers
        .into_iter()
        .map(|mut item| {
            let override_enabled = server_enabled_map.get(&item.name).copied();
            let effective_enabled = global_enabled && override_enabled.unwrap_or(item.enabled);
            item.enabled = effective_enabled;
            item
        })
        .collect::<Vec<_>>();
    (global_enabled, merged, server_enabled_map)
}

/// Detect all installed engines and their capabilities
#[tauri::command]
pub async fn detect_engines(state: State<'_, AppState>) -> Result<Vec<EngineStatus>, String> {
    let manager = &state.engine_manager;
    Ok(manager.detect_engines().await)
}

/// Get the currently active engine
#[tauri::command]
pub async fn get_active_engine(state: State<'_, AppState>) -> Result<EngineType, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_active_engine().await)
}

/// Switch to a different engine
#[tauri::command]
pub async fn switch_engine(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.engine_manager;
    manager.set_active_engine(engine_type).await
}

/// Get cached status for a specific engine
#[tauri::command]
pub async fn get_engine_status(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<Option<EngineStatus>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_engine_status(engine_type).await)
}

/// Get all cached engine statuses
#[tauri::command]
pub async fn get_all_engine_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<EngineStatus>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_all_statuses().await)
}

/// Set engine configuration
#[tauri::command]
pub async fn set_engine_config(
    engine_type: EngineType,
    config: EngineConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.engine_manager;
    manager.set_engine_config(engine_type, config).await;
    Ok(())
}

/// Get engine configuration
#[tauri::command]
pub async fn get_engine_config(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<Option<EngineConfig>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_engine_config(engine_type).await)
}

/// Check if an engine is available
#[tauri::command]
pub async fn is_engine_available(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let manager = &state.engine_manager;
    Ok(manager.is_engine_available(engine_type).await)
}

/// Get list of available engines
#[tauri::command]
pub async fn get_available_engines(state: State<'_, AppState>) -> Result<Vec<EngineType>, String> {
    let manager = &state.engine_manager;
    Ok(manager.get_available_engines().await)
}

/// Get models for a specific engine
#[tauri::command]
pub async fn get_engine_models(
    engine_type: EngineType,
    state: State<'_, AppState>,
) -> Result<Vec<super::ModelInfo>, String> {
    let manager = &state.engine_manager;

    match engine_type {
        EngineType::OpenCode => {
            let config = manager.get_engine_config(EngineType::OpenCode).await;
            let custom_bin = config
                .as_ref()
                .and_then(|cfg| cfg.bin_path.as_ref())
                .map(|s| s.as_str());
            let fresh_status = detect_opencode_status(custom_bin).await;

            if !fresh_status.models.is_empty() {
                return Ok(fresh_status.models);
            }

            if let Some(cached) = manager.get_engine_status(EngineType::OpenCode).await {
                if !cached.models.is_empty() {
                    return Ok(cached.models);
                }
            }

            Ok(fresh_status.models)
        }
        EngineType::Claude | EngineType::Codex => {
            if let Some(status) = manager.get_engine_status(engine_type).await {
                if !status.models.is_empty() {
                    return Ok(status.models);
                }
            }

            let statuses = manager.detect_engines().await;
            let detected = statuses.into_iter().find(|s| s.engine_type == engine_type);

            if let Some(status) = detected {
                Ok(status.models)
            } else {
                Err(format!("{} not detected", engine_type.display_name()))
            }
        }
        _ => Err(format!(
            "{} is not supported yet",
            engine_type.display_name()
        )),
    }
}

/// List available OpenCode commands (cached for a short TTL).
#[tauri::command]
pub async fn opencode_commands_list(
    refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeCommandEntry>, String> {
    let force_refresh = refresh.unwrap_or(false);
    let cache = OPENCODE_COMMANDS_CACHE.get_or_init(|| Mutex::new(None));
    if !force_refresh {
        let cached = cache
            .lock()
            .map_err(|_| "commands cache lock poisoned".to_string())?;
        if let Some((updated_at, data)) = cached.as_ref() {
            if updated_at.elapsed() < OPENCODE_CACHE_TTL {
                return Ok(data.clone());
            }
        }
    }

    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.arg("--help");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode --help: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("opencode --help failed: {}", stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_opencode_help_commands(&stdout);
    let mut cached = cache
        .lock()
        .map_err(|_| "commands cache lock poisoned".to_string())?;
    *cached = Some((Instant::now(), parsed.clone()));
    Ok(parsed)
}

/// List available OpenCode agents (cached for a short TTL).
#[tauri::command]
pub async fn opencode_agents_list(
    refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeAgentEntry>, String> {
    let force_refresh = refresh.unwrap_or(false);
    let cache = OPENCODE_AGENTS_CACHE.get_or_init(|| Mutex::new(None));
    if !force_refresh {
        let cached = cache
            .lock()
            .map_err(|_| "agents cache lock poisoned".to_string())?;
        if let Some((updated_at, data)) = cached.as_ref() {
            if updated_at.elapsed() < OPENCODE_CACHE_TTL {
                return Ok(data.clone());
            }
        }
    }

    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.arg("agent");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode agent list: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("opencode agent list failed: {}", stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_opencode_agent_list(&stdout);

    // Some plugin ecosystems expose extra agents in resolved config but not in `agent list`.
    // Merge config-derived agents so UI remains aligned with the actual runtime.
    let mut debug_cmd = build_opencode_command(config.as_ref());
    debug_cmd.arg("debug");
    debug_cmd.arg("config");
    let merged = match debug_cmd.output().await {
        Ok(debug_output) if debug_output.status.success() => {
            let debug_stdout = String::from_utf8_lossy(&debug_output.stdout);
            let config_agents = parse_opencode_debug_config_agents(&debug_stdout);
            merge_opencode_agents(parsed, config_agents)
        }
        _ => parsed,
    };

    let mut cached = cache
        .lock()
        .map_err(|_| "agents cache lock poisoned".to_string())?;
    *cached = Some((Instant::now(), merged.clone()));
    Ok(merged)
}

#[tauri::command]
pub async fn opencode_session_list(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeSessionEntry>, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("session");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode session list: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode session list failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries = parse_opencode_session_list(&stdout);
    entries.iter().for_each(|entry| {
        if !entry.updated_label.trim().is_empty() && entry.updated_at.is_none() {
            log::warn!(
                "OpenCode session timestamp parse failed: session_id={}, updated_label={}",
                entry.session_id,
                entry.updated_label
            );
        }
    });
    Ok(entries)
}

#[tauri::command]
pub async fn opencode_delete_session(
    workspace_id: String,
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "[WORKSPACE_NOT_CONNECTED] Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;

    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(&workspace_path);
    cmd.arg("session");
    cmd.arg("delete");
    cmd.arg(&session_id);

    match cmd.output().await {
        Ok(output) if output.status.success() => {
            return Ok(json!({
                "deleted": true,
                "method": "cli",
            }));
        }
        Ok(output) => {
            let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
            log::warn!(
                "opencode session delete failed, fallback to filesystem delete: session_id={}, stderr={}",
                session_id,
                stderr.trim()
            );
        }
        Err(error) => {
            log::warn!(
                "opencode session delete command unavailable, fallback to filesystem delete: session_id={}, error={}",
                session_id,
                error
            );
        }
    }

    delete_opencode_session_files(&workspace_path, &session_id, config.as_ref())?;

    Ok(json!({
        "deleted": true,
        "method": "filesystem",
    }))
}

#[tauri::command]
pub async fn opencode_stats(
    workspace_id: String,
    days: Option<u32>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("stats");
    if let Some(days) = days {
        cmd.arg("--days");
        cmd.arg(days.to_string());
    }
    cmd.arg("--project");
    cmd.arg("");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode stats: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode stats failed: {}", stderr.trim()));
    }
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let trimmed = stdout.trim().to_string();
    if trimmed.is_empty() {
        return Err("opencode stats returned empty output".to_string());
    }
    Ok(trimmed)
}

#[tauri::command]
pub async fn opencode_export_session(
    workspace_id: String,
    session_id: String,
    output_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("export");
    cmd.arg(&session_id);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode export: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode export failed: {}", stderr.trim()));
    }
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let json_text = extract_json_object_from_text(&stdout)
        .ok_or_else(|| "opencode export did not return JSON payload".to_string())?;
    let target_path = if let Some(path) = output_path {
        PathBuf::from(path)
    } else if let Some(downloads) = dirs::download_dir() {
        downloads.join(format!("opencode-{}.json", session_id))
    } else {
        PathBuf::from(format!("opencode-{}.json", session_id))
    };
    fs::write(&target_path, json_text.as_bytes())
        .map_err(|e| format!("Failed to write export file: {}", e))?;
    Ok(json!({
        "sessionId": session_id,
        "filePath": target_path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub async fn opencode_share_session(
    workspace_id: String,
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("run");
    cmd.arg("--session");
    cmd.arg(&session_id);
    cmd.arg("--share");
    cmd.arg("--format");
    cmd.arg("json");
    cmd.arg("share this session");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode share: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode share failed: {}", stderr.trim()));
    }
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    let combined = format!("{}\n{}", stdout, stderr);
    let url = extract_first_url(&combined)
        .ok_or_else(|| "Share URL not found in opencode output".to_string())?;
    Ok(json!({
        "sessionId": session_id,
        "url": url,
    }))
}

#[tauri::command]
pub async fn opencode_import_session(
    workspace_id: String,
    source: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("import");
    cmd.arg(&source);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode import: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!("opencode import failed: {}", stderr.trim()));
    }
    let merged = format!("{}\n{}", stdout, stderr);
    let session_id = parse_imported_session_id(&merged);
    Ok(json!({
        "sessionId": session_id,
        "source": source,
        "output": merged.trim(),
    }))
}

#[tauri::command]
pub async fn opencode_mcp_status(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("mcp");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode mcp list: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!("opencode mcp list failed: {}", stderr.trim()));
    }
    Ok(json!({
        "text": stdout.trim(),
    }))
}

#[tauri::command]
pub async fn opencode_provider_health(
    workspace_id: String,
    provider: Option<String>,
    state: State<'_, AppState>,
) -> Result<OpenCodeProviderHealth, String> {
    load_opencode_provider_health(&workspace_id, provider, &state).await
}

#[tauri::command]
pub async fn opencode_provider_catalog(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeProviderOption>, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut providers =
        fetch_opencode_provider_catalog_from_auth_picker(&workspace_path, config.as_ref()).await;
    if providers.is_empty() {
        providers = fetch_opencode_provider_catalog_preview(&workspace_path, config.as_ref()).await;
    }
    let dynamic_provider_ids =
        fetch_opencode_provider_ids_from_models(&workspace_path, config.as_ref()).await;
    for provider_id in dynamic_provider_ids {
        let normalized_id = slugify_provider_label(&provider_id);
        if normalized_id.is_empty() {
            continue;
        }
        if let Some(existing) = providers.iter_mut().find(|item| item.id == normalized_id) {
            if existing.label.is_empty() {
                existing.label = provider_label_from_id(&provider_id);
            }
            continue;
        }
        providers.push(OpenCodeProviderOption {
            id: normalized_id,
            label: provider_label_from_id(&provider_id),
            description: None,
            category: "other".to_string(),
            recommended: false,
        });
    }
    let fallback = fallback_opencode_provider_catalog();
    for item in fallback {
        if let Some(existing) = providers.iter_mut().find(|p| p.id == item.id) {
            if existing.category != "popular" && item.category == "popular" {
                existing.category = "popular".to_string();
            }
            existing.recommended = existing.recommended || item.recommended;
            if existing.description.is_none() && item.description.is_some() {
                existing.description = item.description;
            }
        } else {
            providers.push(item);
        }
    }
    providers.sort_by(|a, b| {
        let score_a = if a.category == "popular" { 0 } else { 1 };
        let score_b = if b.category == "popular" { 0 } else { 1 };
        score_a
            .cmp(&score_b)
            .then_with(|| b.recommended.cmp(&a.recommended))
            .then_with(|| a.label.cmp(&b.label))
    });
    providers.dedup_by(|a, b| a.id == b.id);
    Ok(providers)
}

#[tauri::command]
pub async fn opencode_provider_connect(
    workspace_id: String,
    provider_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let opencode_bin = resolve_opencode_bin(config.as_ref());
    let quoted_opencode_bin = shell_quote(&opencode_bin);
    let prefill = provider_id
        .as_ref()
        .and_then(|id| build_provider_prefill_query(id));
    let auth_command = if let Some(prefill_query) = prefill {
        let quoted_query = shell_quote(&prefill_query);
        format!(
            "{{ printf \"%s\\r\" {}; cat; }} | {} auth login",
            quoted_query, quoted_opencode_bin
        )
    } else {
        format!("{} auth login", quoted_opencode_bin)
    };
    let full_command = format!(
        "cd {} && {}",
        shell_quote(&workspace_path.to_string_lossy()),
        auth_command
    );

    #[cfg(target_os = "macos")]
    {
        open_terminal_with_command(&full_command)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut cmd = build_opencode_command(config.as_ref());
        cmd.current_dir(workspace_path);
        cmd.arg("auth");
        cmd.arg("login");
        let _child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start opencode auth login: {}", e))?;
    }

    Ok(json!({
        "started": true,
        "providerId": provider_id,
        "command": full_command,
    }))
}

async fn load_opencode_provider_health(
    workspace_id: &str,
    provider: Option<String>,
    state: &State<'_, AppState>,
) -> Result<OpenCodeProviderHealth, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("auth");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode auth list: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Ok(OpenCodeProviderHealth {
            provider: provider.unwrap_or_else(|| "unknown".to_string()),
            connected: false,
            credential_count: 0,
            matched: false,
            authenticated_providers: Vec::new(),
            error: Some(stderr.trim().to_string()),
        });
    }

    let providers = parse_opencode_auth_providers(&stdout);
    let normalized_target = provider
        .as_ref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    let resolved_provider = normalized_target
        .clone()
        .or_else(|| providers.first().cloned());
    let matched = resolved_provider
        .as_ref()
        .map(|target| {
            providers
                .iter()
                .any(|name| provider_keys_match(target, name))
        })
        .unwrap_or(false);
    let connected = if normalized_target.is_some() {
        matched
    } else {
        !providers.is_empty()
    };

    Ok(OpenCodeProviderHealth {
        provider: resolved_provider.unwrap_or_else(|| "unknown".to_string()),
        connected,
        credential_count: providers.len(),
        matched,
        authenticated_providers: providers,
        error: None,
    })
}

/// Remove MCP toggle state for a workspace to free memory.
pub(crate) fn clear_mcp_toggle_state(workspace_id: &str) {
    if let Some(cache) = OPENCODE_MCP_TOGGLE_STATE.get() {
        if let Ok(mut guard) = cache.lock() {
            guard.remove(workspace_id);
        }
    }
}

#[tauri::command]
pub async fn opencode_mcp_toggle(
    workspace_id: String,
    server_name: Option<String>,
    enabled: Option<bool>,
    global_enabled: Option<bool>,
) -> Result<Value, String> {
    let cache = OPENCODE_MCP_TOGGLE_STATE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = cache
        .lock()
        .map_err(|_| "opencode mcp toggle lock poisoned".to_string())?;
    let entry = guard
        .entry(workspace_id.clone())
        .or_insert_with(|| OpenCodeMcpToggleState {
            global_enabled: true,
            server_enabled: HashMap::new(),
        });
    if let Some(global) = global_enabled {
        entry.global_enabled = global;
    }
    if let Some(name) = server_name {
        let normalized = name.trim().to_string();
        if !normalized.is_empty() {
            entry
                .server_enabled
                .insert(normalized, enabled.unwrap_or(true));
        }
    }
    Ok(json!({
        "workspaceId": workspace_id,
        "mcpEnabled": entry.global_enabled,
        "serverStates": entry.server_enabled,
        "managedToggles": true,
    }))
}

#[tauri::command]
pub async fn opencode_status_snapshot(
    workspace_id: String,
    thread_id: Option<String>,
    model: Option<String>,
    agent: Option<String>,
    variant: Option<String>,
    state: State<'_, AppState>,
) -> Result<OpenCodeStatusSnapshot, String> {
    let provider = derive_provider_from_model(model.as_deref());
    let provider_health =
        load_opencode_provider_health(&workspace_id, provider.clone(), &state).await?;
    let mcp = opencode_mcp_status(workspace_id.clone(), state).await?;
    let raw_mcp = mcp
        .get("text")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let parsed_servers = parse_opencode_mcp_servers(&raw_mcp);
    let (mcp_enabled, mcp_servers, _server_states) =
        apply_mcp_toggle_state(&workspace_id, parsed_servers);

    Ok(OpenCodeStatusSnapshot {
        session_id: resolve_session_id_from_thread(thread_id.as_deref()),
        model,
        agent,
        variant,
        provider,
        provider_health,
        mcp_enabled,
        mcp_servers,
        mcp_raw: raw_mcp,
        managed_toggles: true,
        token_usage: None,
        context_window: None,
    })
}

#[tauri::command]
pub async fn opencode_lsp_diagnostics(
    workspace_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("diagnostics");
    cmd.arg(&file_path);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode debug lsp diagnostics: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp diagnostics failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "filePath": file_path,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

#[tauri::command]
pub async fn opencode_lsp_symbols(
    workspace_id: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("symbols");
    cmd.arg(&query);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode debug lsp symbols: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp symbols failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "query": query,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

#[tauri::command]
pub async fn opencode_lsp_document_symbols(
    workspace_id: String,
    file_uri: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref());
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("document-symbols");
    cmd.arg(&file_uri);
    let output = cmd.output().await.map_err(|e| {
        format!(
            "Failed to execute opencode debug lsp document-symbols: {}",
            e
        )
    })?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp document-symbols failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "fileUri": file_uri,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

/// Send a message using the active engine
/// For Claude: spawns async tasks for streaming events to the frontend
/// via app-server-event, returns immediately with turn ID.
#[tauri::command]
pub async fn engine_send_message(
    workspace_id: String,
    text: String,
    engine: Option<EngineType>,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    continue_session: bool,
    thread_id: Option<String>,
    session_id: Option<String>,
    agent: Option<String>,
    variant: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let manager = &state.engine_manager;
    let active_engine = manager.get_active_engine().await;
    let requested_engine = engine;
    let effective_engine = requested_engine.unwrap_or(active_engine);
    log::info!(
        "[engine_send_message] engine={:?} active_engine={:?} workspace_id={} model={:?} continue_session={} thread_id={:?} session_id={:?} agent={:?} variant={:?}",
        effective_engine,
        active_engine,
        workspace_id,
        model,
        continue_session,
        thread_id,
        session_id,
        agent,
        variant
    );
    if let Some(explicit_engine) = requested_engine {
        if explicit_engine != active_engine {
            log::warn!(
                "[engine_send_message] explicit engine {:?} overrides active engine {:?}",
                explicit_engine,
                active_engine
            );
        }
    }

    match effective_engine {
        EngineType::Claude => {
            // Get workspace path
            let workspace_path = {
                let workspaces = state.workspaces.lock().await;
                workspaces
                    .get(&workspace_id)
                    .map(|w| std::path::PathBuf::from(&w.path))
                    .ok_or_else(|| "Workspace not found".to_string())?
            };

            let session = manager
                .get_claude_session(&workspace_id, &workspace_path)
                .await;

            // Use explicit session_id from frontend (for Claude history resume),
            // or fall back to the session's tracked session_id ONLY when continuing
            // BUG FIX: When creating a new agent (continue_session=false), we must NOT
            // auto-use the old session_id, otherwise the new conversation inherits
            // the old conversation's context!
            let resolved_session_id = if session_id.is_some() {
                // Frontend explicitly provided a session_id (resuming from history)
                session_id
            } else if continue_session {
                // Frontend wants to continue the current session
                session.get_session_id().await
            } else {
                // New agent/conversation - do NOT reuse old session_id
                None
            };

            let sanitized_model = model
                .as_ref()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .and_then(|value| {
                    if value.starts_with("claude-") {
                        Some(value.to_string())
                    } else {
                        None
                    }
                });
            if model.is_some() && sanitized_model.is_none() {
                log::warn!(
                    "[engine_send_message] dropped invalid claude model={:?}, fallback to default",
                    model
                );
            }

            let params = super::SendMessageParams {
                text,
                model: sanitized_model,
                effort,
                access_mode,
                images,
                continue_session: resolved_session_id.is_some(),
                session_id: resolved_session_id,
                agent: None,
                variant: None,
                collaboration_mode: None,
            };

            // Generate a unique turn ID and item ID for this turn
            let turn_id = format!("claude-turn-{}", uuid::Uuid::new_v4());
            let thread_id = thread_id.unwrap_or_else(|| turn_id.clone());
            let item_id = format!("claude-item-{}", uuid::Uuid::new_v4());

            // Subscribe to session events BEFORE spawning send_message
            let mut receiver = session.subscribe();
            let app_clone = app.clone();
            let mut current_thread_id = thread_id.clone();
            let item_id_clone = item_id.clone();
            let turn_id_for_forwarder = turn_id.clone();

            // Spawn event forwarder: reads from broadcast channel and emits Tauri events.
            tokio::spawn(async move {
                let deadline = tokio::time::Instant::now()
                    + std::time::Duration::from_secs(EVENT_FORWARDER_TIMEOUT_SECS);
                loop {
                    let recv_result = tokio::time::timeout_at(deadline, receiver.recv()).await;
                    let turn_event = match recv_result {
                        Ok(Ok(event)) => event,
                        Ok(Err(_)) => break, // channel closed
                        Err(_) => break,     // timeout reached
                    };
                    if turn_event.turn_id != turn_id_for_forwarder {
                        continue;
                    }

                    let event = turn_event.event;
                    let is_terminal = event.is_terminal();

                    // Emit event with CURRENT thread_id (for SessionStarted, this is the OLD pending id)
                    // Frontend uses this to rename claude-pending-xxx to claude:{sessionId}
                    if let Some(payload) =
                        engine_event_to_app_server_event(&event, &current_thread_id, &item_id_clone)
                    {
                        let _ = app_clone.emit("app-server-event", payload);
                    }

                    // Update thread_id AFTER emitting SessionStarted so subsequent events use new id
                    if let EngineEvent::SessionStarted {
                        session_id, engine, ..
                    } = &event
                    {
                        if !session_id.is_empty() && session_id != "pending" {
                            match engine {
                                EngineType::Claude => {
                                    current_thread_id = format!("claude:{}", session_id)
                                }
                                EngineType::OpenCode => {
                                    current_thread_id = format!("opencode:{}", session_id)
                                }
                                _ => {}
                            }
                        }
                    }

                    if is_terminal {
                        break;
                    }
                }
            });

            // Spawn the message sender: drives the Claude CLI process
            let session_clone = session.clone();
            let turn_id_clone = turn_id.clone();
            tokio::spawn(async move {
                if let Err(e) = session_clone.send_message(params, &turn_id_clone).await {
                    log::error!("Claude send_message failed: {}", e);
                    // Emit TurnError so the frontend event forwarder receives a terminal
                    // event and the user sees the error instead of an infinite loading state.
                    session_clone.emit_error(&turn_id_clone, e);
                }
            });

            // Return immediately with turn info (frontend will receive streaming events)
            Ok(json!({
                "engine": "claude",
                "result": {
                    "turn": {
                        "id": turn_id,
                        "status": "started"
                    },
                },
                "turn": {
                    "id": turn_id,
                    "status": "started"
                }
            }))
        }
        EngineType::Codex => {
            // For Codex, delegate to existing send_user_message command
            // The frontend should use the existing command for now
            Ok(json!({
                "delegateTo": "send_user_message",
                "engine": "codex",
            }))
        }
        EngineType::OpenCode => {
            let workspace_path = {
                let workspaces = state.workspaces.lock().await;
                workspaces
                    .get(&workspace_id)
                    .map(|w| std::path::PathBuf::from(&w.path))
                    .ok_or_else(|| "Workspace not found".to_string())?
            };

            let session = manager
                .get_or_create_opencode_session(&workspace_id, &workspace_path)
                .await;

            let resolved_session_id = if session_id.is_some() {
                session_id
            } else if continue_session {
                session.get_session_id().await
            } else {
                None
            };

            let sanitized_model = model
                .as_ref()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .and_then(|value| {
                    if value.starts_with("claude-") {
                        None
                    } else {
                        Some(value.to_string())
                    }
                });
            if model.is_some() && sanitized_model.is_none() {
                log::warn!(
                    "[engine_send_message] dropped invalid opencode model={:?}, fallback to default",
                    model
                );
            }
            let model_for_send =
                sanitized_model.or_else(|| Some("openai/gpt-5.3-codex".to_string()));

            let params = super::SendMessageParams {
                text,
                model: model_for_send,
                effort,
                access_mode,
                images,
                continue_session: resolved_session_id.is_some(),
                session_id: resolved_session_id,
                agent,
                variant,
                collaboration_mode: None,
            };

            let turn_id = format!("opencode-turn-{}", uuid::Uuid::new_v4());
            let thread_id = thread_id.unwrap_or_else(|| turn_id.clone());
            let item_id = format!("opencode-item-{}", uuid::Uuid::new_v4());

            let mut receiver = session.subscribe();
            let app_clone = app.clone();
            let mut current_thread_id = thread_id.clone();
            let item_id_clone = item_id.clone();
            let turn_id_for_forwarder = turn_id.clone();
            // Spawn event forwarder (same pattern as Claude forwarder above).
            tokio::spawn(async move {
                let deadline = tokio::time::Instant::now()
                    + std::time::Duration::from_secs(EVENT_FORWARDER_TIMEOUT_SECS);
                loop {
                    let recv_result = tokio::time::timeout_at(deadline, receiver.recv()).await;
                    let turn_event = match recv_result {
                        Ok(Ok(event)) => event,
                        Ok(Err(_)) => break,
                        Err(_) => break,
                    };
                    if turn_event.turn_id != turn_id_for_forwarder {
                        continue;
                    }

                    let event = turn_event.event;
                    let is_terminal = event.is_terminal();

                    if let Some(payload) =
                        engine_event_to_app_server_event(&event, &current_thread_id, &item_id_clone)
                    {
                        let _ = app_clone.emit("app-server-event", payload);
                    }

                    if let EngineEvent::SessionStarted {
                        session_id, engine, ..
                    } = &event
                    {
                        if !session_id.is_empty() && session_id != "pending" {
                            if matches!(engine, EngineType::OpenCode) {
                                current_thread_id = format!("opencode:{}", session_id);
                            }
                        }
                    }

                    if is_terminal {
                        break;
                    }
                }
            });

            let session_clone = session.clone();
            let turn_id_clone = turn_id.clone();
            tokio::spawn(async move {
                if let Err(e) = session_clone.send_message(params, &turn_id_clone).await {
                    log::error!("OpenCode send_message failed: {}", e);
                    session_clone.emit_error(&turn_id_clone, e);
                }
            });

            Ok(json!({
                "engine": "opencode",
                "result": {
                    "turn": {
                        "id": turn_id,
                        "status": "started"
                    },
                },
                "turn": {
                    "id": turn_id,
                    "status": "started"
                }
            }))
        }
        _ => Err(format!(
            "{} is not supported yet",
            effective_engine.display_name()
        )),
    }
}

/// Interrupt the current operation for the active engine
#[tauri::command]
pub async fn engine_interrupt(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.engine_manager;
    let active_engine = manager.get_active_engine().await;

    match active_engine {
        EngineType::Claude => {
            if let Some(session) = manager.claude_manager.get_session(&workspace_id).await {
                session.interrupt().await?;
            }
            Ok(())
        }
        EngineType::Codex => {
            // Codex interrupts are handled via turn_interrupt RPC from the frontend.
            // This path is a fallback; log for diagnostic visibility.
            log::info!(
                "engine_interrupt called for Codex workspace: {}",
                workspace_id
            );
            Ok(())
        }
        EngineType::OpenCode => {
            if let Some(session) = manager.get_opencode_session(&workspace_id).await {
                session.interrupt().await?;
            }
            Ok(())
        }
        _ => Err(format!(
            "{} is not supported yet",
            active_engine.display_name()
        )),
    }
}

/// List Claude Code session history for a workspace path.
/// Reads JSONL files from ~/.claude/projects/{encoded-path}/.
#[tauri::command]
pub async fn list_claude_sessions(
    workspace_path: String,
    limit: Option<usize>,
) -> Result<Value, String> {
    let path = std::path::PathBuf::from(&workspace_path);
    let sessions = super::claude_history::list_claude_sessions(&path, limit).await?;
    serde_json::to_value(sessions).map_err(|e| e.to_string())
}

/// Load full message history for a specific Claude Code session.
#[tauri::command]
pub async fn load_claude_session(
    workspace_path: String,
    session_id: String,
) -> Result<Value, String> {
    let path = std::path::PathBuf::from(&workspace_path);
    let result = super::claude_history::load_claude_session(&path, &session_id).await?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

/// Fork a Claude Code session by cloning its JSONL history into a new session id.
#[tauri::command]
pub async fn fork_claude_session(
    workspace_path: String,
    session_id: String,
) -> Result<Value, String> {
    let path = std::path::PathBuf::from(&workspace_path);
    let forked_session_id = super::claude_history::fork_claude_session(&path, &session_id).await?;
    Ok(json!({
        "thread": {
            "id": format!("claude:{}", forked_session_id)
        },
        "sessionId": forked_session_id
    }))
}

/// Delete a Claude Code session (remove JSONL file from disk).
#[tauri::command]
pub async fn delete_claude_session(
    workspace_path: String,
    session_id: String,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(&workspace_path);
    super::claude_history::delete_claude_session(&path, &session_id).await
}

#[cfg(test)]
mod tests {
    use super::{
        build_provider_prefill_query, delete_opencode_session_files,
        delete_opencode_session_from_datastore, merge_opencode_agents, normalize_provider_key,
        opencode_data_candidate_roots, opencode_session_candidate_paths, parse_imported_session_id,
        parse_json_value, parse_opencode_agent_list, parse_opencode_auth_providers,
        parse_opencode_debug_config_agents, parse_opencode_help_commands,
        parse_opencode_mcp_servers, parse_opencode_session_list, parse_opencode_updated_at,
        provider_keys_match, EngineConfig, OpenCodeAgentEntry,
    };
    use chrono::{Local, TimeZone};
    use rusqlite::{params, Connection};
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    fn parse_opencode_commands_from_help() {
        let help = r#"
Commands:
  opencode run [message..]     run opencode with a message
  opencode agent               manage agents

Options:
  -h, --help                   show help
"#;
        let commands = parse_opencode_help_commands(help);
        assert!(commands.iter().any(|entry| entry.name == "run"));
        assert!(commands.iter().any(|entry| entry.name == "agent"));
    }

    #[test]
    fn parse_opencode_agents_from_list() {
        let output = r#"
build (primary)
reviewer
"#;
        let agents = parse_opencode_agent_list(output);
        assert!(agents
            .iter()
            .any(|entry| entry.id == "build" && entry.is_primary));
        assert!(agents
            .iter()
            .any(|entry| entry.id == "reviewer" && !entry.is_primary));
    }

    #[test]
    fn parse_opencode_agents_ignores_json_like_noise() {
        let output = r#"
build (primary)
}
},
{
"#;
        let agents = parse_opencode_agent_list(output);
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].id, "build");
    }

    #[test]
    fn parse_opencode_debug_config_agents_extracts_all_agent_ids() {
        let output = r#"
{
  "agent": {
    "build": { "mode": "primary", "description": "Build things" },
    "prometheus": { "mode": "all" },
    "hephaestus": { "mode": "primary" },
    "oracle": { "mode": "subagent", "description": "Read-only consultant" }
  }
}
"#;
        let agents = parse_opencode_debug_config_agents(output);
        assert!(agents
            .iter()
            .any(|entry| entry.id == "build" && entry.is_primary));
        assert!(agents
            .iter()
            .any(|entry| entry.id == "prometheus" && !entry.is_primary));
        assert!(agents
            .iter()
            .any(|entry| entry.id == "hephaestus" && entry.is_primary));
        assert!(agents
            .iter()
            .any(|entry| entry.id == "oracle" && !entry.is_primary));
    }

    #[test]
    fn merge_opencode_agents_adds_plugin_agents_and_preserves_primary_flags() {
        let base = vec![OpenCodeAgentEntry {
            id: "build".to_string(),
            description: None,
            is_primary: true,
        }];
        let supplemental = vec![
            OpenCodeAgentEntry {
                id: "prometheus".to_string(),
                description: Some("planner".to_string()),
                is_primary: false,
            },
            OpenCodeAgentEntry {
                id: "build".to_string(),
                description: Some("builder".to_string()),
                is_primary: false,
            },
        ];
        let merged = merge_opencode_agents(base, supplemental);
        assert!(merged.iter().any(|entry| entry.id == "prometheus"));
        assert!(merged
            .iter()
            .any(|entry| entry.id == "build" && entry.is_primary));
        let build = merged
            .iter()
            .find(|entry| entry.id == "build")
            .expect("build should exist");
        assert_eq!(build.description.as_deref(), Some("builder"));
    }

    #[test]
    fn parse_imported_session_id_from_output() {
        let output = "Imported session: ses_12345abc\nExporting session: ses_12345abc";
        assert_eq!(
            parse_imported_session_id(output),
            Some("ses_12345abc".to_string())
        );
    }

    #[test]
    fn parse_json_value_accepts_valid_json() {
        let parsed = parse_json_value("{\"ok\":true,\"items\":[]}");
        assert_eq!(parsed, Some(json!({ "ok": true, "items": [] })));
    }

    #[test]
    fn parse_opencode_auth_list_providers() {
        let output = r#"
┌  Credentials ~/.local/share/opencode/auth.json
│
●  OpenAI oauth
│
●  MiniMax Coding Plan (minimaxi.com) api
│
└  2 credentials
"#;
        let providers = parse_opencode_auth_providers(output);
        assert!(providers.iter().any(|item| item == "openai"));
        assert!(providers.iter().any(|item| item == "minimax coding plan"));
    }

    #[test]
    fn parse_opencode_mcp_servers_empty() {
        let output = r#"
┌  MCP Servers
│
▲  No MCP servers configured
│
└  Add servers with: opencode mcp add
"#;
        let servers = parse_opencode_mcp_servers(output);
        assert!(servers.is_empty());
    }

    #[test]
    fn parse_opencode_session_list_rows() {
        let output = r#"
Session ID                      Title                                            Updated
────────────────────────────────────────────────────────────────────────────────────────
ses_3aab47663ffegTpCFd6UN8ri40  Health check 3 status review                     11:27 AM · 2/13/2026
ses_3aaf6e47cffesEP8ro2EePcJAQ  New session - 2026-02-13T02:24:24.582Z           10:24 AM · 2/13/2026
"#;
        let entries = parse_opencode_session_list(output);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].session_id, "ses_3aab47663ffegTpCFd6UN8ri40");
        assert_eq!(entries[0].title, "Health check 3 status review");
        assert!(entries[0].updated_at.is_some());
    }

    #[test]
    fn parse_opencode_updated_at_with_date_and_time() {
        let now = Local
            .with_ymd_and_hms(2026, 2, 15, 0, 0, 0)
            .single()
            .expect("valid now");
        let parsed = parse_opencode_updated_at("11:27 AM · 2/13/2026", now)
            .expect("updated_at should parse");
        let expected = Local
            .with_ymd_and_hms(2026, 2, 13, 11, 27, 0)
            .single()
            .expect("valid expected")
            .timestamp_millis();
        assert_eq!(parsed, expected);
    }

    #[test]
    fn normalize_provider_key_handles_hyphen_and_spaces() {
        let left = normalize_provider_key("minimax-cn-coding-plan");
        let right = normalize_provider_key("MiniMax Coding Plan");
        assert_ne!(left, right);
        assert!(provider_keys_match(
            "minimax-cn-coding-plan",
            "MiniMax Coding Plan"
        ));
    }

    #[test]
    fn build_provider_prefill_query_uses_search_keywords() {
        assert_eq!(
            build_provider_prefill_query("minimax-cn-coding-plan"),
            Some("minimax".to_string())
        );
        assert_eq!(
            build_provider_prefill_query("z-ai"),
            Some("zhipu".to_string())
        );
        assert_eq!(
            build_provider_prefill_query("openai"),
            Some("openai".to_string())
        );
    }

    #[test]
    fn opencode_session_candidates_include_home_and_workspace() {
        let workspace = PathBuf::from("/tmp/workspace");
        let config = EngineConfig {
            home_dir: Some("/tmp/opencode-home".to_string()),
            ..Default::default()
        };

        let candidates = opencode_session_candidate_paths(&workspace, "ses_123", Some(&config));

        assert!(candidates
            .iter()
            .any(|path| path == &PathBuf::from("/tmp/opencode-home/sessions/ses_123")));
        assert!(candidates
            .iter()
            .any(|path| path == &workspace.join(".opencode").join("sessions").join("ses_123")));
    }

    #[test]
    fn delete_opencode_session_files_rejects_invalid_session_id() {
        let workspace = PathBuf::from("/tmp/workspace");
        let result = delete_opencode_session_files(&workspace, "../bad-id", None);
        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("[SESSION_NOT_FOUND]"));
    }

    #[test]
    fn delete_opencode_session_files_removes_workspace_fallback_path() {
        let base = std::env::temp_dir().join(format!(
            "code-moss-opencode-delete-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        ));
        let workspace = base.join("workspace");
        let target = workspace
            .join(".opencode")
            .join("sessions")
            .join("ses_test_for_delete");
        std::fs::create_dir_all(&target).expect("should create session directory");

        let result = delete_opencode_session_files(&workspace, "ses_test_for_delete", None);
        assert!(result.is_ok());
        assert!(!target.exists());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn opencode_data_candidate_roots_include_xdg_data_path() {
        let workspace = PathBuf::from("/tmp/workspace");
        let config = EngineConfig {
            home_dir: Some("/tmp/opencode-home".to_string()),
            ..Default::default()
        };

        let roots = opencode_data_candidate_roots(&workspace, Some(&config));

        assert!(roots
            .iter()
            .any(|path| path == &PathBuf::from("/tmp/opencode-home")));
        assert!(roots
            .iter()
            .any(|path| path == &workspace.join(".opencode")));
    }

    #[test]
    fn delete_opencode_session_from_datastore_removes_session_and_storage_json() {
        let base = std::env::temp_dir().join(format!(
            "code-moss-opencode-datastore-delete-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&base).expect("should create temp base");
        let db_path = base.join("opencode.db");
        {
            let connection = Connection::open(&db_path).expect("should create sqlite database");
            connection
                .execute_batch(
                    r#"
                    PRAGMA foreign_keys = ON;
                    CREATE TABLE session (
                        id TEXT PRIMARY KEY
                    );
                    INSERT INTO session (id) VALUES ('ses_test_for_datastore_delete');
                    "#,
                )
                .expect("should create session table and seed row");
        }

        let reminder_dir = base.join("storage").join("agent-usage-reminder");
        std::fs::create_dir_all(&reminder_dir).expect("should create storage subdir");
        let reminder_file = reminder_dir.join("ses_test_for_datastore_delete.json");
        std::fs::write(&reminder_file, "{}").expect("should write reminder file");

        let result = delete_opencode_session_from_datastore(&base, "ses_test_for_datastore_delete");
        assert!(result.is_ok());
        assert_eq!(result.ok(), Some(true));

        let remaining = Connection::open(&db_path)
            .expect("should reopen sqlite database")
            .query_row(
                "SELECT COUNT(*) FROM session WHERE id = ?1",
                params!["ses_test_for_datastore_delete"],
                |row| row.get::<_, i64>(0),
            )
            .expect("should count remaining rows");
        assert_eq!(remaining, 0);
        assert!(!reminder_file.exists());

        let _ = std::fs::remove_dir_all(&base);
    }
}
