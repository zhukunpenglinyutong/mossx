use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use tokio::task;

use crate::engine::EngineType;
use crate::state::AppState;
use crate::types::WorkspaceEntry;

const COMMAND_SOURCE_PROJECT_CLAUDE: &str = "project_claude";
const COMMAND_SOURCE_PROJECT_CODEX: &str = "project_codex";
const COMMAND_SOURCE_GLOBAL_CLAUDE: &str = "global_claude";

#[derive(Serialize, Clone)]
pub(crate) struct ClaudeCommandEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) source: String,
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

fn resolve_workspace_path(entry: &WorkspaceEntry) -> Option<PathBuf> {
    let trimmed = entry.path.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(PathBuf::from(trimmed))
}

fn collect_commands_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let primary = root.join("commands");
    if primary.exists() {
        dirs.push(primary);
    }
    let fallback = root.join("Commands");
    if fallback.exists() {
        dirs.push(fallback);
    }
    dirs
}

fn normalize_command_name(name: &str) -> String {
    name.trim().to_ascii_lowercase()
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

fn discover_commands_in(dir: &Path, root: &Path, source: &str) -> Vec<ClaudeCommandEntry> {
    let mut out: Vec<ClaudeCommandEntry> = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return out,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_dir = fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
        if is_dir {
            out.extend(discover_commands_in(&path, root, source));
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
            source: source.to_string(),
            description,
            argument_hint,
            content: body,
        });
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn merge_commands_by_priority(sources: Vec<Vec<ClaudeCommandEntry>>) -> Vec<ClaudeCommandEntry> {
    let mut merged: Vec<ClaudeCommandEntry> = Vec::new();
    let mut seen_names: HashSet<String> = HashSet::new();

    for source in sources {
        for command in source {
            let normalized_name = normalize_command_name(&command.name);
            if seen_names.contains(&normalized_name) {
                continue;
            }
            seen_names.insert(normalized_name);
            merged.push(command);
        }
    }

    merged.sort_by(|a, b| a.name.cmp(&b.name));
    merged
}

#[tauri::command]
pub(crate) async fn claude_commands_list(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
) -> Result<Vec<ClaudeCommandEntry>, String> {
    let workspace_path = if let Some(workspace_id) = workspace_id.as_deref() {
        let workspaces = state.workspaces.lock().await;
        match workspaces
            .get(workspace_id)
            .and_then(resolve_workspace_path)
        {
            Some(path) => Some(path),
            None => {
                log::warn!(
                    "claude_commands_list received unknown workspace id: {}",
                    workspace_id
                );
                None
            }
        }
    } else {
        None
    };

    let home_dir = resolve_claude_home_dir(&state)
        .await
        .ok_or_else(|| "Unable to resolve CLAUDE_HOME".to_string())?;
    let global_commands_dir = resolve_commands_dir(&home_dir);

    task::spawn_blocking(move || {
        let mut project_claude_commands: Vec<ClaudeCommandEntry> = Vec::new();
        let mut project_codex_commands: Vec<ClaudeCommandEntry> = Vec::new();
        if let Some(workspace_path) = workspace_path.as_ref() {
            let claude_dirs = collect_commands_dirs(&workspace_path.join(".claude"));
            for dir in claude_dirs {
                project_claude_commands.extend(discover_commands_in(
                    &dir,
                    &dir,
                    COMMAND_SOURCE_PROJECT_CLAUDE,
                ));
            }

            let codex_dirs = collect_commands_dirs(&workspace_path.join(".codex"));
            for dir in codex_dirs {
                project_codex_commands.extend(discover_commands_in(
                    &dir,
                    &dir,
                    COMMAND_SOURCE_PROJECT_CODEX,
                ));
            }
        }

        let global_commands = match global_commands_dir {
            Some(dir) => discover_commands_in(&dir, &dir, COMMAND_SOURCE_GLOBAL_CLAUDE),
            None => Vec::new(),
        };

        Ok(merge_commands_by_priority(vec![
            project_claude_commands,
            project_codex_commands,
            global_commands,
        ]))
    })
    .await
    .map_err(|_| "command discovery failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn new_temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time is before unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("mossx-{prefix}-{nonce}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn command(name: &str, source: &str) -> ClaudeCommandEntry {
        ClaudeCommandEntry {
            name: name.to_string(),
            path: format!("/{source}/{name}.md"),
            source: source.to_string(),
            description: None,
            argument_hint: None,
            content: String::new(),
        }
    }

    #[test]
    fn merge_commands_prefers_project_sources_over_global() {
        let merged = merge_commands_by_priority(vec![
            vec![command("shared", COMMAND_SOURCE_PROJECT_CLAUDE)],
            vec![command("shared", COMMAND_SOURCE_PROJECT_CODEX)],
            vec![command("shared", COMMAND_SOURCE_GLOBAL_CLAUDE)],
        ]);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].name, "shared");
        assert_eq!(merged[0].source, COMMAND_SOURCE_PROJECT_CLAUDE);
    }

    #[test]
    fn merge_commands_normalizes_name_for_deduplication() {
        let merged = merge_commands_by_priority(vec![
            vec![command("Open-Spec:Apply", COMMAND_SOURCE_PROJECT_CLAUDE)],
            vec![command("open-spec:apply", COMMAND_SOURCE_GLOBAL_CLAUDE)],
        ]);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, COMMAND_SOURCE_PROJECT_CLAUDE);
    }

    #[test]
    fn collect_commands_dirs_supports_commands_and_commands_caps() {
        let root = new_temp_dir("command-dir-scan");
        let lower = root.join("commands");
        let upper = root.join("Commands");
        fs::create_dir_all(&lower).expect("create lower");
        fs::create_dir_all(&upper).expect("create upper");

        let dirs = collect_commands_dirs(&root);
        assert_eq!(dirs.len(), 2);
        assert!(dirs.contains(&lower));
        assert!(dirs.contains(&upper));

        let _ = fs::remove_dir_all(root);
    }
}
