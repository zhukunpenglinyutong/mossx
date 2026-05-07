//! Read Gemini CLI session history from ~/.gemini/{tmp,history}/**/chats/session-*.json

use chrono::DateTime;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::fs;
use tokio::time::timeout;

const LOCAL_SESSION_SCAN_TIMEOUT: Duration = Duration::from_secs(60);

fn normalize_session_id(session_id: &str) -> Result<String, String> {
    let normalized = session_id.trim();
    if normalized.is_empty()
        || normalized == "."
        || normalized.contains('/')
        || normalized.contains('\\')
        || normalized.contains("..")
    {
        return Err("[SESSION_NOT_FOUND] Invalid Gemini session id".to_string());
    }
    Ok(normalized.to_string())
}

async fn resolve_workspace_session_files_with_timeout(
    workspace_path: &Path,
    custom_home: Option<&str>,
) -> Result<Vec<(PathBuf, Value)>, String> {
    timeout(
        LOCAL_SESSION_SCAN_TIMEOUT,
        resolve_workspace_session_files(workspace_path, custom_home),
    )
    .await
    .map_err(|_| "Gemini session scan timed out".to_string())
}

/// Summary of a Gemini session for sidebar display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiSessionSummary {
    pub session_id: String,
    pub first_message: String,
    pub updated_at: i64,
    pub created_at: i64,
    pub message_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attribution_status: Option<String>,
}

/// Single normalized message row used by frontend history parser.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiSessionMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    /// "message", "reasoning", or "tool"
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_output: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GeminiSessionUsage {
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cache_creation_input_tokens: Option<i64>,
    pub cache_read_input_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiSessionLoadResult {
    pub messages: Vec<GeminiSessionMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<GeminiSessionUsage>,
}

fn parse_timestamp_millis(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let truncated: String = value.chars().take(max_chars).collect();
    format!("{}…", truncated)
}

fn normalize_windows_path_for_comparison(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }
    let mut normalized = path.replace('\\', "/");
    if normalized.starts_with("//?/UNC/") {
        normalized = format!("//{}", &normalized["//?/UNC/".len()..]);
    } else if normalized.starts_with("//?/") {
        normalized = normalized["//?/".len()..].to_string();
    }
    while normalized.ends_with('/') && normalized.len() > 1 {
        normalized.pop();
    }
    normalized
}

fn build_path_variants(path: &str) -> Vec<String> {
    let normalized = normalize_windows_path_for_comparison(path.trim());
    if normalized.is_empty() {
        return Vec::new();
    }
    let mut variants = vec![normalized.clone()];
    if normalized.starts_with("/private/") {
        variants.push(normalized["/private".len()..].to_string());
    } else if normalized.starts_with('/') {
        variants.push(format!("/private{}", normalized));
    }
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let mut chars = normalized.chars();
        if let Some(first) = chars.next() {
            variants.push(format!("{}{}", first.to_ascii_lowercase(), chars.as_str()));
        }
        variants.push(normalized.to_ascii_lowercase());
    }
    if normalized.starts_with("//") {
        variants.push(normalized.to_ascii_lowercase());
    }
    variants.sort();
    variants.dedup();
    variants
}

fn build_workspace_path_variants(workspace_path: &Path) -> Vec<String> {
    let workspace_raw = workspace_path.to_string_lossy().to_string();
    let mut workspace_variants = build_path_variants(&workspace_raw);
    if let Ok(canonical_workspace) = std::fs::canonicalize(workspace_path) {
        let canonical_workspace_raw = canonical_workspace.to_string_lossy().to_string();
        workspace_variants.extend(build_path_variants(&canonical_workspace_raw));
    }
    workspace_variants.sort();
    workspace_variants.dedup();
    workspace_variants
}

fn path_is_same_or_child(candidate: &str, base: &str) -> bool {
    if candidate.is_empty() || base.is_empty() {
        return false;
    }
    if candidate == base {
        return true;
    }
    if base == "/" {
        return candidate.starts_with('/');
    }
    candidate.starts_with(base) && candidate.chars().nth(base.len()) == Some('/')
}

fn matches_workspace_path(project_root: &str, workspace_variants: &[String]) -> bool {
    if workspace_variants.is_empty() {
        return false;
    }
    let project_variants = build_path_variants(project_root);
    for candidate in project_variants {
        for workspace in workspace_variants {
            if path_is_same_or_child(&candidate, workspace)
                || path_is_same_or_child(workspace, &candidate)
            {
                return true;
            }
        }
    }
    false
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

fn resolve_gemini_base_dir(custom_home: Option<&str>) -> PathBuf {
    if let Some(home) = custom_home.map(str::trim).filter(|value| !value.is_empty()) {
        if let Some(expanded) = expand_home_prefixed_path(home) {
            return expanded;
        }
        return PathBuf::from(home);
    }
    if let Some(home) = std::env::var_os("GEMINI_CLI_HOME").filter(|value| !value.is_empty()) {
        let configured = PathBuf::from(home);
        let configured_text = configured.to_string_lossy();
        if let Some(expanded) = expand_home_prefixed_path(&configured_text) {
            return expanded;
        }
        return configured;
    }
    dirs::home_dir().unwrap_or_default().join(".gemini")
}

fn is_chat_file(path: &Path) -> bool {
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

fn collect_chat_files_sync(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if !root.exists() {
        return files;
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let read_dir = match std::fs::read_dir(&path) {
            Ok(reader) => reader,
            Err(_) => continue,
        };
        for entry in read_dir.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            if is_chat_file(&entry_path) {
                files.push(entry_path);
            }
        }
    }
    files.sort();
    files.dedup();
    files
}

async fn collect_chat_files(base_dir: &Path) -> Vec<PathBuf> {
    let roots = vec![base_dir.join("tmp"), base_dir.join("history")];
    let mut all = Vec::new();
    for root in roots {
        let root_clone = root.clone();
        let mut found = tokio::task::spawn_blocking(move || collect_chat_files_sync(&root_clone))
            .await
            .unwrap_or_default();
        all.append(&mut found);
    }
    all.sort();
    all.dedup();
    all
}

fn project_alias_from_chat_path(path: &Path) -> Option<String> {
    path.parent()?
        .parent()?
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
}

fn read_project_root_file(path: PathBuf) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn load_projects_alias_map(base_dir: &Path) -> HashMap<String, String> {
    let path = base_dir.join("projects.json");
    let raw = match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return HashMap::new(),
    };
    let value: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => return HashMap::new(),
    };
    let mut map = HashMap::new();
    let Some(projects) = value.get("projects").and_then(|v| v.as_object()) else {
        return map;
    };
    for (project_path, alias_value) in projects {
        let Some(alias) = alias_value.as_str() else {
            continue;
        };
        let trimmed_alias = alias.trim();
        if trimmed_alias.is_empty() {
            continue;
        }
        map.insert(trimmed_alias.to_string(), project_path.to_string());
    }
    map
}

fn resolve_project_root(
    base_dir: &Path,
    alias: &str,
    projects_map: &HashMap<String, String>,
) -> Option<String> {
    let tmp_candidate = base_dir.join("tmp").join(alias).join(".project_root");
    if let Some(path) = read_project_root_file(tmp_candidate) {
        return Some(path);
    }
    let history_candidate = base_dir.join("history").join(alias).join(".project_root");
    if let Some(path) = read_project_root_file(history_candidate) {
        return Some(path);
    }
    projects_map.get(alias).cloned()
}

fn first_non_empty_text<'a>(candidates: &[Option<&'a str>]) -> Option<&'a str> {
    for candidate in candidates {
        if let Some(text) = candidate {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn extract_text_from_value_inner(value: &Value, depth: usize) -> Option<String> {
    if depth > 6 {
        return None;
    }
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Array(items) => {
            let mut parts = Vec::new();
            for item in items {
                if let Some(text) = extract_text_from_value_inner(item, depth + 1) {
                    parts.push(text);
                }
            }
            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
        Value::Object(map) => {
            if let Some(text) = first_non_empty_text(&[
                map.get("delta").and_then(|value| value.as_str()),
                map.get("text").and_then(|value| value.as_str()),
                map.get("message").and_then(|value| value.as_str()),
                map.get("content").and_then(|value| value.as_str()),
                map.get("output").and_then(|value| value.as_str()),
                map.get("result").and_then(|value| value.as_str()),
                map.get("response").and_then(|value| value.as_str()),
            ]) {
                return Some(text.to_string());
            }
            for key in [
                "content", "message", "part", "parts", "result", "output", "response", "data",
                "payload", "item", "items",
            ] {
                if let Some(nested) = map.get(key) {
                    if let Some(text) = extract_text_from_value_inner(nested, depth + 1) {
                        return Some(text);
                    }
                }
            }
            None
        }
        _ => None,
    }
}

fn extract_text_from_value(value: &Value) -> Option<String> {
    extract_text_from_value_inner(value, 0)
}

fn extract_message_text(message: &Value) -> Option<String> {
    message
        .get("content")
        .and_then(extract_text_from_value)
        .or_else(|| message.get("message").and_then(extract_text_from_value))
        .or_else(|| message.get("output").and_then(extract_text_from_value))
        .or_else(|| message.get("result").and_then(extract_text_from_value))
        .or_else(|| message.get("response").and_then(extract_text_from_value))
        .or_else(|| message.get("payload").and_then(extract_text_from_value))
        .or_else(|| message.get("data").and_then(extract_text_from_value))
}

fn extract_display_text(message: &Value) -> Option<String> {
    message
        .get("displayContent")
        .and_then(extract_text_from_value)
        .or_else(|| {
            message
                .get("display_content")
                .and_then(extract_text_from_value)
        })
}

fn is_image_path_candidate(path: &str) -> bool {
    let normalized = path
        .split('?')
        .next()
        .unwrap_or(path)
        .split('#')
        .next()
        .unwrap_or(path)
        .trim()
        .to_ascii_lowercase();
    [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".heic", ".heif",
    ]
    .iter()
    .any(|suffix| normalized.ends_with(suffix))
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn percent_decode_path(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = String::with_capacity(value.len());
    let mut cursor = 0usize;
    while cursor < bytes.len() {
        if bytes[cursor] == b'%' && cursor + 2 < bytes.len() {
            let hi = hex_value(bytes[cursor + 1]);
            let lo = hex_value(bytes[cursor + 2]);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                output.push((hi * 16 + lo) as char);
                cursor += 3;
                continue;
            }
        }
        output.push(bytes[cursor] as char);
        cursor += 1;
    }
    output
}

fn has_windows_drive_prefix(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && (bytes[1] == b':' || bytes[1] == b'|')
        && (bytes[2] == b'/' || bytes[2] == b'\\')
}

fn has_windows_drive_host(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && (bytes[1] == b':' || bytes[1] == b'|')
}

fn normalize_file_uri_path(file_uri: &str) -> Option<String> {
    if !file_uri
        .get(..7)
        .map(|value| value.eq_ignore_ascii_case("file://"))
        .unwrap_or(false)
    {
        return None;
    }
    let mut remainder = file_uri[7..].trim();
    if remainder.is_empty() {
        return None;
    }

    if remainder.to_ascii_lowercase().starts_with("localhost/") {
        remainder = &remainder["localhost/".len()..];
    } else if !remainder.starts_with('/')
        && !has_windows_drive_prefix(remainder)
        && !has_windows_drive_host(remainder)
    {
        let (host, tail) = remainder
            .split_once('/')
            .map(|(lhs, rhs)| (lhs, format!("/{}", rhs)))
            .unwrap_or((remainder, String::new()));
        if tail.is_empty() {
            return Some(format!("//{}", host));
        } else {
            return Some(format!("//{}{}", host, percent_decode_path(&tail)));
        }
    }

    let mut normalized = remainder.replace('|', ":");
    if normalized.len() >= 3
        && normalized.starts_with('/')
        && normalized.as_bytes()[1].is_ascii_alphabetic()
        && normalized.as_bytes()[2] == b':'
    {
        normalized = normalized[1..].to_string();
    }
    Some(percent_decode_path(&normalized))
}

fn normalize_history_image_source(value: &str) -> String {
    let trimmed = value.trim();
    normalize_file_uri_path(trimmed).unwrap_or_else(|| trimmed.to_string())
}

fn is_local_image_path(path: &str) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return false;
    }
    if has_windows_drive_prefix(trimmed) {
        return true;
    }
    if trimmed.starts_with('/') || trimmed.starts_with("\\\\") || trimmed.starts_with("//") {
        return true;
    }
    !trimmed.contains("://") && !trimmed.starts_with("data:")
}

#[derive(Debug, Clone)]
struct AtImageReference {
    start: usize,
    end: usize,
    path: String,
}

fn unescape_at_path(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut escaping = false;
    for ch in value.chars() {
        if escaping {
            output.push(ch);
            escaping = false;
            continue;
        }
        if ch == '\\' {
            escaping = true;
            continue;
        }
        output.push(ch);
    }
    if escaping {
        output.push('\\');
    }
    output
}

fn extract_image_at_references(text: &str) -> Vec<AtImageReference> {
    let pattern = Regex::new(r#"@"((?:\\.|[^"\\])+?)"|@((?:\\.|[^\s])+)"#)
        .expect("at-reference regex should be valid");
    let mut references = Vec::new();
    for capture in pattern.captures_iter(text) {
        let Some(matched) = capture.get(0) else {
            continue;
        };
        let path = if let Some(quoted) = capture.get(1) {
            unescape_at_path(quoted.as_str())
        } else if let Some(unquoted) = capture.get(2) {
            unescape_at_path(unquoted.as_str())
        } else {
            continue;
        };
        if !is_image_path_candidate(&path) {
            continue;
        }
        references.push(AtImageReference {
            start: matched.start(),
            end: matched.end(),
            path,
        });
    }
    references
}

fn strip_image_at_references(text: &str) -> String {
    let references = extract_image_at_references(text);
    if references.is_empty() {
        return text.trim().to_string();
    }
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0usize;
    for reference in references {
        if reference.start > cursor {
            output.push_str(&text[cursor..reference.start]);
        }
        cursor = reference.end;
    }
    if cursor < text.len() {
        output.push_str(&text[cursor..]);
    }
    output
        .split('\n')
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn collect_content_image_sources(value: &Value, output: &mut Vec<String>) {
    if let Some(array) = value.as_array() {
        for item in array {
            collect_content_image_sources(item, output);
        }
        return;
    }
    let Some(object) = value.as_object() else {
        return;
    };

    if let Some(inline_data) = object
        .get("inlineData")
        .or_else(|| object.get("inline_data"))
        .and_then(|node| node.as_object())
    {
        let data = inline_data
            .get("data")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let mime_type = inline_data
            .get("mimeType")
            .or_else(|| inline_data.get("mime_type"))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(data) = data {
            let mime = mime_type.unwrap_or("image/png");
            if mime.to_ascii_lowercase().starts_with("image/") && data.len() <= 3_000_000 {
                output.push(format!("data:{};base64,{}", mime, data));
            }
        }
    }

    if let Some(file_data) = object
        .get("fileData")
        .or_else(|| object.get("file_data"))
        .and_then(|node| node.as_object())
    {
        let file_uri = file_data
            .get("fileUri")
            .or_else(|| file_data.get("file_uri"))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(file_uri) = file_uri {
            let mime_type = file_data
                .get("mimeType")
                .or_else(|| file_data.get("mime_type"))
                .or_else(|| file_data.get("mimeData"))
                .or_else(|| file_data.get("mime_data"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            if mime_type
                .map(|value| value.to_ascii_lowercase().starts_with("image/"))
                .unwrap_or_else(|| is_image_path_candidate(file_uri))
            {
                output.push(normalize_history_image_source(file_uri));
            }
        }
    }

    for nested in object.values() {
        collect_content_image_sources(nested, output);
    }
}

fn dedupe_string_list(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            deduped.push(trimmed.to_string());
        }
    }
    deduped
}

fn extract_message_images(message: &Value) -> Vec<String> {
    let mut display_images = Vec::new();
    if let Some(display_text) = extract_display_text(message) {
        for reference in extract_image_at_references(&display_text) {
            display_images.push(normalize_history_image_source(&reference.path));
        }
    }
    let mut content_images = Vec::new();
    if let Some(content) = message.get("content") {
        collect_content_image_sources(content, &mut content_images);
    }

    if content_images
        .iter()
        .any(|value| value.to_ascii_lowercase().starts_with("data:image/"))
    {
        return dedupe_string_list(content_images);
    }

    if !display_images.is_empty() {
        let existing_display_images = display_images
            .iter()
            .filter(|value| !is_local_image_path(value) || Path::new(value).exists())
            .cloned()
            .collect::<Vec<_>>();
        if !existing_display_images.is_empty() {
            return dedupe_string_list(existing_display_images);
        }
    }

    if !content_images.is_empty() {
        return dedupe_string_list(content_images);
    }
    if !display_images.is_empty() {
        return dedupe_string_list(display_images);
    }
    Vec::new()
}

fn count_inline_images(value: &Value) -> usize {
    if let Some(array) = value.as_array() {
        return array.iter().map(count_inline_images).sum();
    }
    if let Some(object) = value.as_object() {
        let inline_count = if object
            .get("inlineData")
            .or_else(|| object.get("inline_data"))
            .and_then(|node| node.get("data"))
            .and_then(|value| value.as_str())
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
        {
            1
        } else {
            0
        };
        let file_count = if object
            .get("fileData")
            .or_else(|| object.get("file_data"))
            .and_then(|node| node.get("fileUri").or_else(|| node.get("file_uri")))
            .and_then(|value| value.as_str())
            .map(is_image_path_candidate)
            .unwrap_or(false)
        {
            1
        } else {
            0
        };
        return inline_count + file_count + object.values().map(count_inline_images).sum::<usize>();
    }
    0
}

fn extract_usage(message: &Value) -> Option<GeminiSessionUsage> {
    let tokens = message.get("tokens")?;
    Some(GeminiSessionUsage {
        input_tokens: tokens.get("input").and_then(|v| v.as_i64()),
        output_tokens: tokens.get("output").and_then(|v| v.as_i64()),
        cache_creation_input_tokens: None,
        cache_read_input_tokens: tokens.get("cached").and_then(|v| v.as_i64()),
    })
}

fn tool_call_is_error(call: &Value, output_preview: Option<&str>) -> bool {
    if call
        .get("status")
        .and_then(|v| v.as_str())
        .map(|status| {
            matches!(
                status.to_ascii_lowercase().as_str(),
                "error" | "failed" | "failure" | "cancelled" | "canceled"
            )
        })
        .unwrap_or(false)
    {
        return true;
    }
    output_preview
        .map(|output| {
            output
                .trim_start()
                .to_ascii_lowercase()
                .starts_with("error")
        })
        .unwrap_or(false)
}

fn parse_summary_from_value(path: &Path, value: &Value) -> Option<GeminiSessionSummary> {
    let session_id = value.get("sessionId").and_then(|v| v.as_str())?.to_string();
    let messages = value
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    let first_message_ts = messages
        .first()
        .and_then(|m| m.get("timestamp"))
        .and_then(|v| v.as_str())
        .and_then(parse_timestamp_millis);
    let last_message_ts = messages.iter().rev().find_map(|m| {
        m.get("timestamp")
            .and_then(|v| v.as_str())
            .and_then(parse_timestamp_millis)
    });

    let started_at = value
        .get("startTime")
        .and_then(|v| v.as_str())
        .and_then(parse_timestamp_millis)
        .or(first_message_ts)
        .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
    let updated_at = value
        .get("lastUpdated")
        .and_then(|v| v.as_str())
        .and_then(parse_timestamp_millis)
        .or(last_message_ts)
        .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

    let first_message = messages
        .iter()
        .filter(|message| message.get("type").and_then(|v| v.as_str()) == Some("user"))
        .find_map(|message| extract_display_text(message).or_else(|| extract_message_text(message)))
        .map(|text| truncate_chars(&text, 60))
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("Gemini Session")
                .to_string()
        });

    Some(GeminiSessionSummary {
        canonical_session_id: Some(session_id.clone()),
        session_id,
        first_message,
        updated_at,
        created_at: started_at,
        message_count: messages.len(),
        file_size_bytes: std::fs::metadata(path).ok().map(|metadata| metadata.len()),
        engine: Some("gemini".to_string()),
        attribution_status: Some("strict-match".to_string()),
    })
}

fn parse_messages_from_value(value: &Value) -> GeminiSessionLoadResult {
    #[derive(Debug)]
    struct TimelineEntry {
        sort_index: usize,
        timestamp_millis: Option<i64>,
        message: GeminiSessionMessage,
    }

    fn resolve_timestamp_text(raw: Option<&Value>) -> Option<String> {
        raw.and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| text.to_string())
    }

    let mut messages: Vec<GeminiSessionMessage> = Vec::new();
    let mut usage: Option<GeminiSessionUsage> = None;
    let mut counter = 0usize;
    let raw_messages = value
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    for raw in raw_messages {
        let msg_type = raw
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let timestamp = raw
            .get("timestamp")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let base_id = raw
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                counter += 1;
                format!("gemini-msg-{}", counter)
            });

        match msg_type.as_str() {
            "user" => {
                let images = extract_message_images(&raw);
                let mut text = extract_display_text(&raw)
                    .or_else(|| extract_message_text(&raw))
                    .unwrap_or_default();
                if !images.is_empty() {
                    text = strip_image_at_references(&text);
                }
                let image_count = raw.get("content").map(count_inline_images).unwrap_or(0);
                if images.is_empty() && image_count > 0 {
                    let image_marker = if image_count == 1 {
                        "[image]".to_string()
                    } else {
                        format!("[image x{}]", image_count)
                    };
                    if text.trim().is_empty() {
                        text = image_marker;
                    } else {
                        text = format!("{}\n{}", text, image_marker);
                    }
                }
                if text.trim().is_empty() && images.is_empty() {
                    continue;
                }
                messages.push(GeminiSessionMessage {
                    id: base_id,
                    role: "user".to_string(),
                    text,
                    images: if images.is_empty() {
                        None
                    } else {
                        Some(images)
                    },
                    timestamp,
                    kind: "message".to_string(),
                    tool_type: None,
                    title: None,
                    tool_input: None,
                    tool_output: None,
                });
            }
            "gemini" | "assistant" | "model" => {
                let base_timestamp_millis = timestamp.as_deref().and_then(parse_timestamp_millis);
                let mut timeline_entries: Vec<TimelineEntry> = Vec::new();
                let mut timeline_sort_index = 0usize;
                let mut push_timeline_message =
                    |mut message: GeminiSessionMessage, timestamp_override: Option<String>| {
                        let resolved_timestamp = timestamp_override.or_else(|| timestamp.clone());
                        let resolved_timestamp_millis = resolved_timestamp
                            .as_deref()
                            .and_then(parse_timestamp_millis)
                            .or(base_timestamp_millis);
                        message.timestamp = resolved_timestamp;
                        timeline_entries.push(TimelineEntry {
                            sort_index: timeline_sort_index,
                            timestamp_millis: resolved_timestamp_millis,
                            message,
                        });
                        timeline_sort_index += 1;
                    };

                if let Some(thoughts) = raw.get("thoughts").and_then(|v| v.as_array()) {
                    for thought in thoughts {
                        let subject = thought
                            .get("subject")
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|s| !s.is_empty());
                        let description = thought
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|s| !s.is_empty());
                        let text = match (subject, description) {
                            (Some(sub), Some(desc)) => format!("{}: {}", sub, desc),
                            (Some(sub), None) => sub.to_string(),
                            (None, Some(desc)) => desc.to_string(),
                            (None, None) => continue,
                        };
                        let thought_timestamp = resolve_timestamp_text(
                            thought
                                .get("timestamp")
                                .or_else(|| thought.get("createdAt"))
                                .or_else(|| thought.get("updatedAt")),
                        );
                        counter += 1;
                        push_timeline_message(
                            GeminiSessionMessage {
                                id: format!("{}-reasoning-{}", base_id, counter),
                                role: "assistant".to_string(),
                                text,
                                images: None,
                                timestamp: None,
                                kind: "reasoning".to_string(),
                                tool_type: None,
                                title: None,
                                tool_input: None,
                                tool_output: None,
                            },
                            thought_timestamp,
                        );
                    }
                }

                if let Some(tool_calls) = raw.get("toolCalls").and_then(|v| v.as_array()) {
                    for call in tool_calls {
                        counter += 1;
                        let tool_use_id = call
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("{}-tool-{}", base_id, counter));
                        let tool_name = call
                            .get("displayName")
                            .or_else(|| call.get("name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("tool")
                            .to_string();
                        let input_value = call
                            .get("args")
                            .cloned()
                            .or_else(|| call.get("input").cloned());
                        let input_text = input_value
                            .as_ref()
                            .and_then(|v| serde_json::to_string_pretty(v).ok())
                            .unwrap_or_default();
                        let tool_start_timestamp = resolve_timestamp_text(
                            call.get("timestamp")
                                .or_else(|| call.get("startedAt"))
                                .or_else(|| call.get("createdAt")),
                        );
                        push_timeline_message(
                            GeminiSessionMessage {
                                id: tool_use_id.clone(),
                                role: "assistant".to_string(),
                                text: input_text,
                                images: None,
                                timestamp: None,
                                kind: "tool".to_string(),
                                tool_type: Some(tool_name.clone()),
                                title: Some(tool_name),
                                tool_input: input_value,
                                tool_output: None,
                            },
                            tool_start_timestamp,
                        );

                        let output_preview = call
                            .get("resultDisplay")
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string())
                            .or_else(|| {
                                call.get("result")
                                    .and_then(|v| serde_json::to_string(v).ok())
                            });
                        if let Some(output) = output_preview {
                            let is_error = tool_call_is_error(call, Some(output.as_str()));
                            let tool_result_timestamp = resolve_timestamp_text(
                                call.get("endedAt")
                                    .or_else(|| call.get("timestamp"))
                                    .or_else(|| call.get("updatedAt")),
                            );
                            push_timeline_message(
                                GeminiSessionMessage {
                                    id: format!("{}-result", tool_use_id),
                                    role: "assistant".to_string(),
                                    text: output,
                                    images: None,
                                    timestamp: None,
                                    kind: "tool".to_string(),
                                    tool_type: Some(if is_error {
                                        "error".to_string()
                                    } else {
                                        "result".to_string()
                                    }),
                                    title: Some(if is_error {
                                        "Error".to_string()
                                    } else {
                                        "Result".to_string()
                                    }),
                                    tool_input: None,
                                    tool_output: call.get("result").cloned(),
                                },
                                tool_result_timestamp,
                            );
                        }
                    }
                }

                if let Some(text) =
                    extract_display_text(&raw).or_else(|| extract_message_text(&raw))
                {
                    if !text.trim().is_empty() {
                        push_timeline_message(
                            GeminiSessionMessage {
                                id: base_id.clone(),
                                role: "assistant".to_string(),
                                text,
                                images: None,
                                timestamp: None,
                                kind: "message".to_string(),
                                tool_type: None,
                                title: None,
                                tool_input: None,
                                tool_output: None,
                            },
                            None,
                        );
                    }
                }

                timeline_entries.sort_by(|left, right| {
                    match (left.timestamp_millis, right.timestamp_millis) {
                        (Some(left_ts), Some(right_ts)) => left_ts
                            .cmp(&right_ts)
                            .then(left.sort_index.cmp(&right.sort_index)),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (None, None) => left.sort_index.cmp(&right.sort_index),
                    }
                });
                messages.extend(timeline_entries.into_iter().map(|entry| entry.message));

                if let Some(extracted_usage) = extract_usage(&raw) {
                    usage = Some(extracted_usage);
                }
            }
            _ => {}
        }
    }

    GeminiSessionLoadResult { messages, usage }
}

async fn read_json(path: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(path).await.map_err(|error| {
        format!(
            "Failed to read Gemini session file {}: {}",
            path.display(),
            error
        )
    })?;
    serde_json::from_str(&raw).map_err(|error| {
        format!(
            "Failed to parse Gemini session file {}: {}",
            path.display(),
            error
        )
    })
}

async fn resolve_workspace_session_files(
    workspace_path: &Path,
    custom_home: Option<&str>,
) -> Vec<(PathBuf, Value)> {
    let base_dir = resolve_gemini_base_dir(custom_home);
    let workspace_variants = build_workspace_path_variants(workspace_path);
    if workspace_variants.is_empty() {
        return Vec::new();
    }
    let files = collect_chat_files(&base_dir).await;
    let projects_map = load_projects_alias_map(&base_dir);
    let mut matched = Vec::new();

    for file in files {
        let Some(alias) = project_alias_from_chat_path(&file) else {
            continue;
        };
        let Some(project_root) = resolve_project_root(&base_dir, &alias, &projects_map) else {
            continue;
        };
        if !matches_workspace_path(&project_root, &workspace_variants) {
            continue;
        }
        let Ok(value) = read_json(&file).await else {
            continue;
        };
        matched.push((file, value));
    }
    matched
}

/// List Gemini sessions for a workspace path.
pub async fn list_gemini_sessions(
    workspace_path: &Path,
    limit: Option<usize>,
    custom_home: Option<&str>,
) -> Result<Vec<GeminiSessionSummary>, String> {
    timeout(LOCAL_SESSION_SCAN_TIMEOUT, async {
        let matched_files = resolve_workspace_session_files(workspace_path, custom_home).await;
        let mut sessions = Vec::new();
        for (path, value) in matched_files {
            if let Some(summary) = parse_summary_from_value(&path, &value) {
                sessions.push(summary);
            }
        }
        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        sessions.truncate(limit.unwrap_or(200));
        Ok(sessions)
    })
    .await
    .map_err(|_| "Gemini session scan timed out".to_string())?
}

/// Load full Gemini session messages by session id.
pub async fn load_gemini_session(
    workspace_path: &Path,
    session_id: &str,
    custom_home: Option<&str>,
) -> Result<GeminiSessionLoadResult, String> {
    let normalized_session_id = normalize_session_id(session_id)?;
    let matched_files =
        resolve_workspace_session_files_with_timeout(workspace_path, custom_home).await?;
    for (_path, value) in matched_files {
        let current_session_id = value
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if current_session_id == normalized_session_id {
            return Ok(parse_messages_from_value(&value));
        }
    }
    Err(format!(
        "Gemini session not found: {}",
        normalized_session_id
    ))
}

/// Delete Gemini session file by session id.
pub async fn delete_gemini_session(
    workspace_path: &Path,
    session_id: &str,
    custom_home: Option<&str>,
) -> Result<(), String> {
    let normalized_session_id = normalize_session_id(session_id)?;
    let matched_files =
        resolve_workspace_session_files_with_timeout(workspace_path, custom_home).await?;
    for (path, value) in matched_files {
        let current_session_id = value
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if current_session_id != normalized_session_id {
            continue;
        }
        fs::remove_file(&path).await.map_err(|error| {
            format!(
                "[IO_ERROR] Failed to delete Gemini session file {}: {}",
                path.display(),
                error
            )
        })?;
        return Ok(());
    }

    Err(format!(
        "[SESSION_NOT_FOUND] Gemini session file not found: {}",
        normalized_session_id
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        matches_workspace_path, parse_messages_from_value, parse_summary_from_value,
        resolve_gemini_base_dir,
    };
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn parse_summary_emits_best_effort_unified_identity() {
        let value = json!({
            "sessionId": "gemini-session-1",
            "startTime": "2026-04-12T12:00:00.000Z",
            "messages": [
                {
                    "type": "user",
                    "timestamp": "2026-04-12T12:00:01.000Z",
                    "displayContent": "hello gemini"
                }
            ]
        });

        let summary = parse_summary_from_value(Path::new("/tmp/session-gemini-session-1.json"), &value)
            .expect("parse gemini summary");

        assert_eq!(summary.engine.as_deref(), Some("gemini"));
        assert_eq!(summary.canonical_session_id.as_deref(), Some("gemini-session-1"));
        assert_eq!(summary.attribution_status.as_deref(), Some("strict-match"));
    }

    #[test]
    fn parse_messages_orders_assistant_timeline_by_timestamp() {
        let value = json!({
            "messages": [
                {
                    "type": "gemini",
                    "id": "assistant-1",
                    "timestamp": "2026-03-24T05:28:35.530Z",
                    "thoughts": [
                        {
                            "subject": "第二阶段",
                            "description": "补充计划",
                            "timestamp": "2026-03-24T05:28:33.567Z"
                        },
                        {
                            "subject": "第一阶段",
                            "description": "先分析约束",
                            "timestamp": "2026-03-24T05:28:32.384Z"
                        }
                    ],
                    "toolCalls": [
                        {
                            "id": "tool-1",
                            "displayName": "ReadFile",
                            "timestamp": "2026-03-24T05:28:34.100Z",
                            "args": {
                                "path": "README.md"
                            },
                            "resultDisplay": "ok"
                        }
                    ],
                    "content": "最终答复"
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 5);

        assert_eq!(entries[0].kind, "reasoning");
        assert!(entries[0].text.contains("第一阶段"));
        assert_eq!(entries[1].kind, "reasoning");
        assert!(entries[1].text.contains("第二阶段"));
        assert_eq!(entries[2].kind, "tool");
        assert_eq!(entries[2].id, "tool-1");
        assert_eq!(entries[3].kind, "tool");
        assert_eq!(entries[3].id, "tool-1-result");
        assert_eq!(entries[4].kind, "message");
        assert_eq!(entries[4].text, "最终答复");
    }

    #[test]
    fn parse_messages_keeps_fallback_stage_order_without_timestamps() {
        let value = json!({
            "messages": [
                {
                    "type": "gemini",
                    "id": "assistant-1",
                    "thoughts": [
                        {
                            "subject": "先思考",
                            "description": "没有时间戳"
                        }
                    ],
                    "toolCalls": [
                        {
                            "id": "tool-1",
                            "displayName": "ReadFile",
                            "args": {
                                "path": "README.md"
                            },
                            "resultDisplay": "ok"
                        }
                    ],
                    "content": "最终答复"
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].kind, "reasoning");
        assert_eq!(entries[1].kind, "tool");
        assert_eq!(entries[1].id, "tool-1");
        assert_eq!(entries[2].kind, "tool");
        assert_eq!(entries[2].id, "tool-1-result");
        assert_eq!(entries[3].kind, "message");
        assert_eq!(entries[3].text, "最终答复");
    }

    #[test]
    fn parse_messages_extracts_user_image_path_from_display_content() {
        let value = json!({
            "messages": [
                {
                    "type": "user",
                    "id": "user-1",
                    "content": [
                        {
                            "text": "@\"/tmp/a b.png\" 描述一下"
                        },
                        {
                            "inlineData": {
                                "data": "AAAA",
                                "mimeType": "image/png"
                            }
                        }
                    ],
                    "displayContent": [
                        {
                            "text": "@\"/tmp/a b.png\" 描述一下"
                        }
                    ]
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "message");
        assert_eq!(entries[0].role, "user");
        assert_eq!(entries[0].text, "描述一下");
        assert_eq!(
            entries[0].images,
            Some(vec!["data:image/png;base64,AAAA".to_string()])
        );
    }

    #[test]
    fn parse_messages_extracts_user_image_path_from_unquoted_display_content() {
        let value = json!({
            "messages": [
                {
                    "type": "user",
                    "id": "user-1",
                    "content": [
                        {
                            "text": "@/tmp/a\\ b.png 描述一下"
                        }
                    ],
                    "displayContent": [
                        {
                            "text": "@/tmp/a\\ b.png 描述一下"
                        }
                    ]
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "message");
        assert_eq!(entries[0].role, "user");
        assert_eq!(entries[0].text, "描述一下");
        assert_eq!(entries[0].images, Some(vec!["/tmp/a b.png".to_string()]));
    }

    #[test]
    fn parse_messages_extracts_user_inline_data_image_when_path_missing() {
        let value = json!({
            "messages": [
                {
                    "type": "user",
                    "id": "user-1",
                    "content": [
                        {
                            "text": "请描述图片"
                        },
                        {
                            "inlineData": {
                                "data": "AAAA",
                                "mimeType": "image/png"
                            }
                        }
                    ]
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "message");
        assert_eq!(entries[0].role, "user");
        assert_eq!(entries[0].text, "请描述图片");
        assert_eq!(
            entries[0].images,
            Some(vec!["data:image/png;base64,AAAA".to_string()])
        );
    }

    #[test]
    fn parse_messages_extracts_assistant_text_from_nested_parts_payload() {
        let value = json!({
            "messages": [
                {
                    "type": "gemini",
                    "id": "assistant-1",
                    "content": {
                        "parts": [
                            {
                                "type": "output_text",
                                "text": "第一段正文"
                            },
                            {
                                "type": "output_text",
                                "text": "第二段正文"
                            }
                        ]
                    }
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "message");
        assert_eq!(entries[0].role, "assistant");
        assert_eq!(entries[0].text, "第一段正文\n第二段正文");
    }

    #[test]
    fn parse_messages_extracts_assistant_text_from_nested_message_payload() {
        let value = json!({
            "messages": [
                {
                    "type": "assistant",
                    "id": "assistant-2",
                    "message": {
                        "payload": {
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": "短正文片段"
                                }
                            ]
                        }
                    }
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "message");
        assert_eq!(entries[0].role, "assistant");
        assert_eq!(entries[0].text, "短正文片段");
    }

    #[test]
    fn parse_messages_normalizes_file_uri_image_sources() {
        let value = json!({
            "messages": [
                {
                    "type": "user",
                    "id": "user-1",
                    "content": [
                        {
                            "fileData": {
                                "fileUri": "file:///tmp/a%20b.png",
                                "mimeType": "image/png"
                            }
                        }
                    ]
                },
                {
                    "type": "user",
                    "id": "user-2",
                    "content": [
                        {
                            "fileData": {
                                "fileUri": "file:///C:/Users/Chen/Pictures/a%20b.png",
                                "mimeType": "image/png"
                            }
                        }
                    ]
                }
            ]
        });

        let parsed = parse_messages_from_value(&value);
        let entries = parsed.messages;
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].images, Some(vec!["/tmp/a b.png".to_string()]));
        assert_eq!(
            entries[1].images,
            Some(vec!["C:/Users/Chen/Pictures/a b.png".to_string()])
        );
    }

    #[test]
    fn matches_workspace_path_accepts_canonical_workspace_variant() {
        let workspace_variants = vec![
            "/Users/demo/codeg".to_string(),
            "/Users/demo/code/AI/github".to_string(),
        ];
        assert!(matches_workspace_path(
            "/Users/demo/code/AI/github/mossx",
            &workspace_variants
        ));
        assert!(!matches_workspace_path(
            "/Users/demo/code/AI/githubish/mossx",
            &workspace_variants
        ));
    }

    #[test]
    fn matches_workspace_path_accepts_parent_project_root() {
        let workspace_variants =
            vec!["/Users/demo/code/AI/github/mossx/packages/desktop".to_string()];
        assert!(matches_workspace_path(
            "/Users/demo/code/AI/github/mossx",
            &workspace_variants
        ));
    }

    #[cfg(not(windows))]
    #[test]
    fn matches_workspace_path_handles_root_workspace_variant() {
        let workspace_variants = vec!["/".to_string()];
        assert!(matches_workspace_path(
            "/Users/demo/code/AI/github/mossx",
            &workspace_variants
        ));
        assert!(!matches_workspace_path(
            "relative/path",
            &workspace_variants
        ));
    }

    #[cfg(not(windows))]
    #[test]
    fn resolve_gemini_base_dir_expands_custom_home_tilde() {
        let Some(home) = dirs::home_dir() else {
            return;
        };
        let resolved = resolve_gemini_base_dir(Some("~/mossx-gemini-home"));
        assert_eq!(resolved, home.join("mossx-gemini-home"));
    }

    #[tokio::test]
    async fn load_gemini_session_rejects_current_directory_session_id() {
        let workspace_path = std::env::temp_dir();
        let error = super::load_gemini_session(&workspace_path, ".", None)
            .await
            .expect_err("dot session id should fail");
        assert!(error.contains("Invalid Gemini session id"));
    }

    #[tokio::test]
    async fn delete_gemini_session_rejects_current_directory_session_id() {
        let workspace_path = std::env::temp_dir();
        let error = super::delete_gemini_session(&workspace_path, ".", None)
            .await
            .expect_err("dot session id should fail");
        assert!(error.contains("Invalid Gemini session id"));
    }
}
