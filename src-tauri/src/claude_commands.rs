use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use tokio::task;

use crate::engine::EngineType;
use crate::state::AppState;

#[derive(Serialize, Clone)]
pub(crate) struct ClaudeCommandEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) description: Option<String>,
    #[serde(rename = "argumentHint")]
    pub(crate) argument_hint: Option<String>,
    pub(crate) content: String,
}

fn normalize_home_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "~" {
        return dirs::home_dir();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    if trimmed == "$HOME" || trimmed == "${HOME}" {
        return dirs::home_dir();
    }
    if let Some(rest) = trimmed.strip_prefix("$HOME/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    if let Some(rest) = trimmed.strip_prefix("${HOME}/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    Some(PathBuf::from(trimmed))
}

async fn resolve_claude_home_dir(state: &State<'_, AppState>) -> Option<PathBuf> {
    if let Some(config) = state
        .engine_manager
        .get_engine_config(EngineType::Claude)
        .await
    {
        if let Some(home_dir) = config.home_dir.as_deref() {
            if let Some(path) = normalize_home_path(home_dir) {
                return Some(path);
            }
        }
    }
    if let Ok(value) = std::env::var("CLAUDE_HOME") {
        if let Some(path) = normalize_home_path(&value) {
            return Some(path);
        }
    }
    dirs::home_dir().map(|home| home.join(".claude"))
}

fn resolve_commands_dir(home_dir: &Path) -> Option<PathBuf> {
    let primary = home_dir.join("commands");
    if primary.exists() {
        return Some(primary);
    }
    let fallback = home_dir.join("Commands");
    if fallback.exists() {
        return Some(fallback);
    }
    None
}

fn sanitize_meta_value(value: &str) -> Option<String> {
    let mut val = value.trim().to_string();
    if val.len() >= 2 {
        let bytes = val.as_bytes();
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            val = val[1..val.len().saturating_sub(1)].to_string();
        }
    }
    let trimmed = val.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_meta_line(
    line: &str,
    name: &mut Option<String>,
    description: &mut Option<String>,
    argument_hint: &mut Option<String>,
) {
    let Some((key, value)) = line.split_once(':') else {
        return;
    };
    let key = key.trim().to_ascii_lowercase();
    let value = sanitize_meta_value(value);
    match key.as_str() {
        "name" => {
            if let Some(value) = value {
                *name = Some(value);
            }
        }
        "description" => {
            if let Some(value) = value {
                *description = Some(value);
            }
        }
        "argument-hint" | "argument_hint" | "argumenthint" => {
            if let Some(value) = value {
                *argument_hint = Some(value);
            }
        }
        _ => {}
    }
}

fn parse_command_frontmatter(
    content: &str,
) -> (Option<String>, Option<String>, Option<String>, String) {
    let mut segments = content.split_inclusive('\n');
    let Some(first_segment) = segments.next() else {
        return (None, None, None, String::new());
    };
    let first_line = first_segment.trim_end_matches(['\r', '\n']);

    let mut name: Option<String> = None;
    let mut description: Option<String> = None;
    let mut argument_hint: Option<String> = None;
    let mut consumed = 0;
    let mut frontmatter_closed = false;

    if first_line.trim() == "---" {
        consumed += first_segment.len();
        for segment in segments {
            let line = segment.trim_end_matches(['\r', '\n']);
            let trimmed = line.trim();
            if trimmed == "---" {
                frontmatter_closed = true;
                consumed += segment.len();
                break;
            }
            if trimmed.is_empty() || trimmed.starts_with('#') {
                consumed += segment.len();
                continue;
            }
            parse_meta_line(trimmed, &mut name, &mut description, &mut argument_hint);
            consumed += segment.len();
        }
        if !frontmatter_closed {
            return (None, None, None, content.to_string());
        }
    } else {
        if !first_line.contains(':') {
            return (None, None, None, content.to_string());
        }
        parse_meta_line(first_line, &mut name, &mut description, &mut argument_hint);
        consumed += first_segment.len();
        for segment in segments {
            let line = segment.trim_end_matches(['\r', '\n']);
            let trimmed = line.trim();
            if trimmed == "---" {
                frontmatter_closed = true;
                consumed += segment.len();
                break;
            }
            if trimmed.is_empty() || trimmed.starts_with('#') {
                consumed += segment.len();
                continue;
            }
            parse_meta_line(trimmed, &mut name, &mut description, &mut argument_hint);
            consumed += segment.len();
        }
        if !frontmatter_closed {
            return (None, None, None, content.to_string());
        }
    }

    let body = if consumed >= content.len() {
        String::new()
    } else {
        content[consumed..].to_string()
    };

    (name, description, argument_hint, body)
}

fn derive_command_name(path: &Path, root: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts: Vec<String> = relative
        .components()
        .filter_map(|component| {
            component
                .as_os_str()
                .to_str()
                .map(|value| value.to_string())
        })
        .collect();
    if parts.is_empty() {
        return None;
    }
    let file_name = parts.pop()?;
    let stem = Path::new(&file_name)
        .file_stem()
        .and_then(|value| value.to_str())?;
    if stem.eq_ignore_ascii_case("readme") {
        return None;
    }
    parts.push(stem.to_string());
    Some(parts.join(":"))
}

fn discover_commands_in(dir: &Path, root: &Path) -> Vec<ClaudeCommandEntry> {
    let mut out: Vec<ClaudeCommandEntry> = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return out,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_dir = fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
        if is_dir {
            out.extend(discover_commands_in(&path, root));
            continue;
        }
        let is_md = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false);
        if !is_md {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            if stem.eq_ignore_ascii_case("readme") {
                continue;
            }
        }
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let (name, description, argument_hint, body) = parse_command_frontmatter(&content);
        let resolved_name = name.or_else(|| derive_command_name(&path, root));
        let Some(resolved_name) = resolved_name else {
            continue;
        };
        let normalized = resolved_name.trim().trim_start_matches('/').to_string();
        if normalized.is_empty() {
            continue;
        }
        out.push(ClaudeCommandEntry {
            name: normalized,
            path: path.to_string_lossy().to_string(),
            description,
            argument_hint,
            content: body,
        });
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

#[tauri::command]
pub(crate) async fn claude_commands_list(
    state: State<'_, AppState>,
) -> Result<Vec<ClaudeCommandEntry>, String> {
    let home_dir = resolve_claude_home_dir(&state)
        .await
        .ok_or_else(|| "Unable to resolve CLAUDE_HOME".to_string())?;
    let Some(commands_dir) = resolve_commands_dir(&home_dir) else {
        return Ok(Vec::new());
    };

    task::spawn_blocking(move || Ok(discover_commands_in(&commands_dir, &commands_dir)))
        .await
        .map_err(|_| "command discovery failed".to_string())?
}
