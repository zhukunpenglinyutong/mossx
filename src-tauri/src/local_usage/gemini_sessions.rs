use chrono::DateTime;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::types::{LocalUsageSessionSummary, LocalUsageUsageData};

use super::{
    calculate_usage_cost, normalize_non_empty_string, path_matches_workspace, read_i64,
    truncate_summary, CostRates,
};

const MAX_GEMINI_TEXT_PREVIEW_CHARS: usize = 512;

fn resolve_gemini_base_dir() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("GEMINI_CLI_HOME").filter(|value| !value.is_empty()) {
        let configured = PathBuf::from(home);
        let configured_text = configured.to_string_lossy();
        if let Some(expanded) = expand_home_prefixed_path(&configured_text) {
            return Some(expanded);
        }
        if configured_text == "~"
            || configured_text.starts_with("~/")
            || configured_text.starts_with("~\\")
        {
            return None;
        }
        return Some(configured);
    }
    dirs::home_dir().map(|home| home.join(".gemini"))
}

fn is_gemini_chat_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    if path.extension().and_then(|value| value.to_str()) != Some("json") {
        return false;
    }
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    if !file_name.starts_with("session-") {
        return false;
    }
    path.parent()
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        == Some("chats")
}

fn collect_gemini_chat_files(root: &Path, output: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>) {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            collect_gemini_chat_files(&path, output, seen);
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if !is_gemini_chat_file(&path) {
            continue;
        }
        if seen.insert(path.clone()) {
            output.push(path);
        }
    }
}

fn parse_gemini_timestamp_millis(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.timestamp_millis())
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    value.chars().take(max_chars).collect::<String>()
}

fn extract_gemini_text_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 6 {
        return None;
    }
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(truncate_chars(trimmed, MAX_GEMINI_TEXT_PREVIEW_CHARS))
            }
        }
        Value::Array(items) => {
            let mut parts = Vec::new();
            let mut total_chars = 0_usize;
            for item in items {
                if let Some(text) = extract_gemini_text_from_value(item, depth + 1) {
                    total_chars += text.chars().count();
                    parts.push(text);
                    if total_chars >= MAX_GEMINI_TEXT_PREVIEW_CHARS {
                        break;
                    }
                }
            }
            if parts.is_empty() {
                None
            } else {
                Some(truncate_chars(
                    parts.join("\n").as_str(),
                    MAX_GEMINI_TEXT_PREVIEW_CHARS,
                ))
            }
        }
        Value::Object(map) => {
            for key in [
                "displayContent",
                "display_content",
                "text",
                "message",
                "content",
                "output",
                "result",
                "response",
            ] {
                if let Some(text) = map
                    .get(key)
                    .and_then(|node| extract_gemini_text_from_value(node, depth + 1))
                {
                    return Some(text);
                }
            }
            for key in [
                "content", "message", "output", "result", "response", "data", "payload", "parts",
                "part", "item", "items",
            ] {
                if let Some(text) = map
                    .get(key)
                    .and_then(|node| extract_gemini_text_from_value(node, depth + 1))
                {
                    return Some(text);
                }
            }
            None
        }
        _ => None,
    }
}

fn read_gemini_project_root_file(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn load_gemini_projects_alias_map(base_dir: &Path) -> HashMap<String, String> {
    let path = base_dir.join("projects.json");
    let raw = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return HashMap::new(),
    };
    let value: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => return HashMap::new(),
    };
    let mut map = HashMap::new();
    let Some(projects) = value.get("projects").and_then(Value::as_object) else {
        return map;
    };
    for (project_path, alias_value) in projects {
        let Some(alias) = alias_value.as_str().map(str::trim) else {
            continue;
        };
        if alias.is_empty() {
            continue;
        }
        map.insert(alias.to_string(), project_path.to_string());
    }
    map
}

fn gemini_project_alias_from_chat_path(path: &Path) -> Option<String> {
    path.parent()?
        .parent()?
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
}

fn resolve_gemini_project_root(
    base_dir: &Path,
    alias: &str,
    projects_map: &HashMap<String, String>,
) -> Option<String> {
    let tmp_candidate = base_dir.join("tmp").join(alias).join(".project_root");
    if let Some(path) = read_gemini_project_root_file(tmp_candidate.as_path()) {
        return Some(path);
    }
    let history_candidate = base_dir.join("history").join(alias).join(".project_root");
    if let Some(path) = read_gemini_project_root_file(history_candidate.as_path()) {
        return Some(path);
    }
    projects_map.get(alias).cloned()
}

fn expand_home_prefixed_path(path: &str) -> Option<PathBuf> {
    if path == "~" {
        return dirs::home_dir();
    }
    let relative = path
        .strip_prefix("~/")
        .or_else(|| path.strip_prefix("~\\"))
        .filter(|value| !value.is_empty())?;
    dirs::home_dir().map(|home| home.join(relative))
}

fn build_project_root_match_candidates(project_root: &str) -> Vec<PathBuf> {
    fn push_unique(candidates: &mut Vec<PathBuf>, seen: &mut HashSet<String>, candidate: PathBuf) {
        let key = candidate.to_string_lossy().to_string();
        if !key.is_empty() && seen.insert(key) {
            candidates.push(candidate);
        }
    }

    let trimmed = project_root.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    let raw = PathBuf::from(trimmed);
    push_unique(&mut candidates, &mut seen, raw.clone());

    if let Some(expanded_home) = expand_home_prefixed_path(trimmed) {
        push_unique(&mut candidates, &mut seen, expanded_home);
    }

    if let Ok(canonical) = raw.canonicalize() {
        push_unique(&mut candidates, &mut seen, canonical);
    }

    candidates
}

fn paths_match_workspace_scope(path_a: &Path, path_b: &Path) -> bool {
    let path_a_text = path_a.to_string_lossy();
    if path_matches_workspace(&path_a_text, path_b) {
        return true;
    }
    let path_b_text = path_b.to_string_lossy();
    path_matches_workspace(&path_b_text, path_a)
}

fn build_workspace_match_candidates(workspace_path: &Path) -> Vec<PathBuf> {
    fn push_unique_path(candidates: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
        let key = path.to_string_lossy().to_string();
        if !key.is_empty() && seen.insert(key) {
            candidates.push(path);
        }
    }

    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    push_unique_path(&mut candidates, &mut seen, workspace_path.to_path_buf());
    if let Ok(canonical) = workspace_path.canonicalize() {
        push_unique_path(&mut candidates, &mut seen, canonical);
    }

    #[cfg(not(windows))]
    {
        let existing = candidates.clone();
        for candidate in existing {
            let text = candidate.to_string_lossy();
            if let Some(stripped) = text.strip_prefix("/private/") {
                push_unique_path(
                    &mut candidates,
                    &mut seen,
                    PathBuf::from(format!("/{}", stripped)),
                );
            } else if text.starts_with('/') {
                push_unique_path(
                    &mut candidates,
                    &mut seen,
                    PathBuf::from(format!("/private{}", text)),
                );
            }
        }
    }

    candidates
}

pub(super) fn gemini_project_matches_workspace(project_root: &str, workspace_path: &Path) -> bool {
    let workspace_candidates = build_workspace_match_candidates(workspace_path);
    if workspace_candidates.is_empty() {
        return false;
    }

    build_project_root_match_candidates(project_root)
        .iter()
        .any(|project_candidate| {
            workspace_candidates.iter().any(|workspace_candidate| {
                paths_match_workspace_scope(project_candidate, workspace_candidate)
            })
        })
}

fn gemini_cost_rates() -> CostRates {
    CostRates {
        input: 0.0,
        output: 0.0,
        cache_write: 0.0,
        cache_read: 0.0,
    }
}

fn parse_gemini_session_summary(path: &Path) -> Result<Option<LocalUsageSessionSummary>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return Ok(None),
    };
    let reader = BufReader::new(file);
    let value: Value = match serde_json::from_reader(reader) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    let session_id = normalize_non_empty_string(value.get("sessionId").and_then(Value::as_str))
        .or_else(|| {
            path.file_stem()
                .and_then(|name| name.to_str())
                .map(ToString::to_string)
        });
    let Some(session_id) = session_id else {
        return Ok(None);
    };

    let messages = value.get("messages").and_then(Value::as_array);
    let mut usage = LocalUsageUsageData::default();
    let mut model = "gemini".to_string();
    let mut summary: Option<String> = None;
    let mut first_timestamp = 0_i64;
    let mut last_timestamp = 0_i64;

    for message in messages.into_iter().flatten() {
        let message_type = message
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_ascii_lowercase();

        if summary.is_none() && message_type == "user" {
            summary = extract_gemini_text_from_value(&message, 0)
                .and_then(|text| truncate_summary(text.as_str()));
        }

        if matches!(message_type.as_str(), "gemini" | "assistant" | "model") {
            if let Some(candidate) = normalize_non_empty_string(
                message
                    .get("model")
                    .or_else(|| message.get("modelId"))
                    .or_else(|| message.get("modelName"))
                    .and_then(Value::as_str),
            ) {
                model = candidate;
            }
        }

        if let Some(tokens) = message.get("tokens").and_then(Value::as_object) {
            usage.input_tokens += read_i64(tokens, &["input"]);
            usage.output_tokens += read_i64(tokens, &["output"]);
            usage.cache_read_tokens += read_i64(tokens, &["cached"]);
        }

        let timestamp = message
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(parse_gemini_timestamp_millis);
        if let Some(timestamp) = timestamp {
            if first_timestamp == 0 {
                first_timestamp = timestamp;
            }
            if timestamp > last_timestamp {
                last_timestamp = timestamp;
            }
        }
    }

    usage.total_tokens = usage.input_tokens
        + usage.output_tokens
        + usage.cache_write_tokens
        + usage.cache_read_tokens;
    let cost = if usage.total_tokens > 0 {
        calculate_usage_cost(&usage, gemini_cost_rates())
    } else {
        0.0
    };

    let timestamp = value
        .get("lastUpdated")
        .and_then(Value::as_str)
        .and_then(parse_gemini_timestamp_millis)
        .or_else(|| {
            value
                .get("startTime")
                .and_then(Value::as_str)
                .and_then(parse_gemini_timestamp_millis)
        })
        .or_else(|| (last_timestamp > 0).then_some(last_timestamp))
        .or_else(|| (first_timestamp > 0).then_some(first_timestamp))
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64
        });

    Ok(Some(LocalUsageSessionSummary {
        session_id,
        session_id_aliases: Vec::new(),
        timestamp,
        cwd: None,
        model,
        usage,
        cost,
        summary,
        source: Some("gemini".to_string()),
        provider: Some("google".to_string()),
        file_size_bytes: fs::metadata(path).ok().map(|metadata| metadata.len()),
        modified_lines: 0,
    }))
}

pub(super) fn scan_gemini_session_summaries(
    workspace_path: Option<&Path>,
) -> Result<Vec<LocalUsageSessionSummary>, String> {
    let Some(base_dir) = resolve_gemini_base_dir() else {
        return Ok(Vec::new());
    };
    scan_gemini_session_summaries_from_base(workspace_path, base_dir.as_path())
}

pub(super) fn scan_gemini_session_summaries_from_base(
    workspace_path: Option<&Path>,
    base_dir: &Path,
) -> Result<Vec<LocalUsageSessionSummary>, String> {
    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let mut seen = HashSet::new();
    collect_gemini_chat_files(&base_dir.join("tmp"), &mut files, &mut seen);
    collect_gemini_chat_files(&base_dir.join("history"), &mut files, &mut seen);

    let projects_map = if workspace_path.is_some() {
        load_gemini_projects_alias_map(base_dir)
    } else {
        HashMap::new()
    };

    let mut sessions = Vec::new();
    for path in files {
        if let Some(workspace_path) = workspace_path {
            let Some(alias) = gemini_project_alias_from_chat_path(&path) else {
                continue;
            };
            let Some(project_root) =
                resolve_gemini_project_root(base_dir, alias.as_str(), &projects_map)
            else {
                continue;
            };
            if !gemini_project_matches_workspace(project_root.as_str(), workspace_path) {
                continue;
            }
        }

        if let Some(summary) = parse_gemini_session_summary(path.as_path())? {
            sessions.push(summary);
        }
    }
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(sessions)
}
