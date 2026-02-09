use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tokio::task;

use crate::codex::home::{resolve_default_codex_home, resolve_workspace_codex_home};
use crate::state::AppState;
use crate::types::WorkspaceEntry;

/// Maximum file size to read (1 MB).
const MAX_SKILL_FILE_SIZE: u64 = 1_048_576;

/// Maximum number of lines to read for description extraction.
const MAX_FRONTMATTER_LINES: usize = 30;

#[derive(Serialize, Clone, Debug)]
pub(crate) struct SkillEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) description: Option<String>,
}

/// Error type for skill scanning operations.
#[derive(Debug)]
pub(crate) enum SkillScanError {
    /// Workspace not found in state.
    WorkspaceNotFound(String),
    /// IO error reading a skills directory.
    Io(std::io::Error),
    /// tokio spawn_blocking join error.
    Join,
}

impl std::fmt::Display for SkillScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SkillScanError::WorkspaceNotFound(id) => write!(f, "workspace not found: {}", id),
            SkillScanError::Io(err) => write!(f, "skill scan IO error: {}", err),
            SkillScanError::Join => write!(f, "skill scan task join failed"),
        }
    }
}

impl From<SkillScanError> for String {
    fn from(err: SkillScanError) -> String {
        err.to_string()
    }
}

fn resolve_codex_home_for_workspace(
    workspaces: &HashMap<String, WorkspaceEntry>,
    entry: &WorkspaceEntry,
) -> Option<PathBuf> {
    let parent_entry = entry
        .parent_id
        .as_ref()
        .and_then(|parent_id| workspaces.get(parent_id));
    resolve_workspace_codex_home(entry, parent_entry).or_else(resolve_default_codex_home)
}

fn default_skills_dir_for_workspace(
    workspaces: &HashMap<String, WorkspaceEntry>,
    entry: &WorkspaceEntry,
) -> Option<PathBuf> {
    resolve_codex_home_for_workspace(workspaces, entry).map(|home| home.join("skills"))
}

fn workspace_skills_dir(state: &AppState, entry: &WorkspaceEntry) -> Result<PathBuf, String> {
    let data_dir = state
        .settings_path
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "Unable to resolve app data dir.".to_string())?;
    Ok(data_dir
        .join("workspaces")
        .join(&entry.id)
        .join("skills"))
}

/// Extract description from YAML frontmatter of a .md file.
/// Only reads the first MAX_FRONTMATTER_LINES lines using BufRead.
fn extract_description(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let first_line = lines.next()?.ok()?;
    if first_line.trim() != "---" {
        return None;
    }

    let mut description: Option<String> = None;
    let mut lines_read = 1;

    for line_result in lines {
        if lines_read >= MAX_FRONTMATTER_LINES {
            break;
        }
        lines_read += 1;

        let line = match line_result {
            Ok(l) => l,
            Err(_) => break,
        };
        let trimmed = line.trim();

        if trimmed == "---" {
            return description;
        }

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some((key, value)) = trimmed.split_once(':') {
            if key.trim().eq_ignore_ascii_case("description") {
                let mut val = value.trim().to_string();
                if val.len() >= 2 {
                    let bytes = val.as_bytes();
                    let first = bytes[0];
                    let last = bytes[bytes.len() - 1];
                    if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
                        val = val[1..val.len() - 1].to_string();
                    }
                }
                if !val.is_empty() {
                    description = Some(val);
                }
            }
        }
    }

    // Frontmatter never closed
    None
}

/// Scan a single directory for .md skill files.
/// Returns Ok(vec) on success. Individual file failures are logged and skipped.
/// Directory not existing is Ok(empty), not an error.
fn discover_skills_in(dir: &Path) -> Result<Vec<SkillEntry>, SkillScanError> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(dir).map_err(SkillScanError::Io)?;

    let mut out: Vec<SkillEntry> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                log::warn!("Failed to read dir entry in {:?}: {}", dir, err);
                continue;
            }
        };

        let path = entry.path();

        // Use symlink_metadata to skip symlinks (won't follow links)
        let metadata = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(err) => {
                log::warn!("Failed to stat {:?}: {}", path, err);
                continue;
            }
        };
        if !metadata.is_file() {
            continue;
        }

        if metadata.len() > MAX_SKILL_FILE_SIZE {
            log::warn!(
                "Skipping oversized skill file {:?} ({} bytes)",
                path,
                metadata.len()
            );
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

        let name = match path.file_stem().and_then(|s| s.to_str()).map(str::to_string) {
            Some(n) if !n.is_empty() => n,
            _ => continue,
        };

        let description = extract_description(&path);

        out.push(SkillEntry {
            name,
            path: path.to_string_lossy().to_string(),
            description,
        });
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Scan local skills directories for a specific workspace.
/// Workspace skills override global skills with the same name.
pub(crate) async fn skills_list_local_for_workspace(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<SkillEntry>, SkillScanError> {
    let (workspace_dir, global_dir) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(workspace_id)
            .ok_or_else(|| SkillScanError::WorkspaceNotFound(workspace_id.to_string()))?;
        let ws_dir = workspace_skills_dir(state, entry).ok();
        let gl_dir = default_skills_dir_for_workspace(&workspaces, entry);
        (ws_dir, gl_dir)
    };

    task::spawn_blocking(move || {
        let mut workspace_skills = match &workspace_dir {
            Some(dir) => discover_skills_in(dir)?,
            None => Vec::new(),
        };

        let global_skills = match &global_dir {
            Some(dir) => discover_skills_in(dir)?,
            None => Vec::new(),
        };

        // Dedup: workspace skills override global skills with the same name
        let workspace_names: HashSet<String> =
            workspace_skills.iter().map(|s| s.name.clone()).collect();

        let filtered_global: Vec<SkillEntry> = global_skills
            .into_iter()
            .filter(|s| !workspace_names.contains(&s.name))
            .collect();

        workspace_skills.extend(filtered_global);
        workspace_skills.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(workspace_skills)
    })
    .await
    .map_err(|_| SkillScanError::Join)?
}
