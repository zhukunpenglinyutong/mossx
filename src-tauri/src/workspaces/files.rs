use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use git2::Repository;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::utils::normalize_git_path;

fn should_always_skip(name: &str) -> bool {
    name == ".git"
}

/// Dependency / build-output directories whose deep contents create
/// excessive noise. We still list the directory itself in the response
/// (so the frontend can show it grayed out) but we do NOT recurse into it.
fn is_heavy_directory(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".pnpm"
            | "bower_components"
            | "__pycache__"
            | ".tox"
            | ".mypy_cache"
            | ".pytest_cache"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".nuxt"
            | ".output"
            | ".turbo"
            | ".svelte-kit"
            | ".parcel-cache"
            | ".cache"
            | ".gradle"
    )
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceFilesResponse {
    pub(crate) files: Vec<String>,
    pub(crate) directories: Vec<String>,
    #[serde(default)]
    pub(crate) gitignored_files: Vec<String>,
    #[serde(default)]
    pub(crate) gitignored_directories: Vec<String>,
}

pub(crate) fn list_workspace_files_inner(
    root: &PathBuf,
    max_files: usize,
) -> WorkspaceFilesResponse {
    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut gitignored_files = Vec::new();
    let mut gitignored_directories = Vec::new();

    // Always open the repo so we can tag gitignored files for dimmed styling.
    let repo = Repository::open(root).ok();

    let walker = WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .require_git(false)
        .git_ignore(false)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                return !should_always_skip(&name) && !is_heavy_directory(&name);
            }
            // Skip OS metadata files
            name != ".DS_Store"
        })
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if let Ok(rel_path) = entry.path().strip_prefix(root) {
            let normalized = normalize_git_path(&rel_path.to_string_lossy());
            if normalized.is_empty() {
                continue;
            }
            let is_ignored = repo
                .as_ref()
                .and_then(|r| r.status_should_ignore(rel_path).ok())
                .unwrap_or(false);
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                directories.push(normalized.clone());
                if is_ignored {
                    gitignored_directories.push(normalized);
                }
            } else if entry.file_type().is_some_and(|ft| ft.is_file()) {
                files.push(normalized.clone());
                if is_ignored {
                    gitignored_files.push(normalized);
                }
                if files.len() >= max_files {
                    break;
                }
            }
        }
    }

    // Re-add heavy directories that were skipped by filter_entry so
    // they still appear in the tree (grayed out) without their contents.
    if let Ok(entries) = std::fs::read_dir(root) {
        for dir_entry in entries.flatten() {
            if dir_entry.file_type().is_ok_and(|ft| ft.is_dir()) {
                let name = dir_entry.file_name();
                let name_str = name.to_string_lossy();
                if is_heavy_directory(&name_str) {
                    let normalized = normalize_git_path(&name_str);
                    if !directories.contains(&normalized) {
                        let is_ignored = repo
                            .as_ref()
                            .and_then(|r| {
                                r.status_should_ignore(std::path::Path::new(&*name_str))
                                    .ok()
                            })
                            .unwrap_or(false);
                        directories.push(normalized.clone());
                        if is_ignored {
                            gitignored_directories.push(normalized);
                        }
                    }
                }
            }
        }
    }

    files.sort();
    directories.sort();
    gitignored_files.sort();
    gitignored_directories.sort();
    WorkspaceFilesResponse {
        files,
        directories,
        gitignored_files,
        gitignored_directories,
    }
}

const MAX_WORKSPACE_FILE_BYTES: u64 = 400_000;

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceFileResponse {
    content: String,
    truncated: bool,
}

pub(crate) fn read_workspace_file_inner(
    root: &PathBuf,
    relative_path: &str,
) -> Result<WorkspaceFileResponse, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(relative_path);
    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to open file: {err}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }
    let metadata = std::fs::metadata(&canonical_path)
        .map_err(|err| format!("Failed to read file metadata: {err}"))?;
    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    let file = File::open(&canonical_path).map_err(|err| format!("Failed to open file: {err}"))?;
    let mut buffer = Vec::new();
    file.take(MAX_WORKSPACE_FILE_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|err| format!("Failed to read file: {err}"))?;

    let truncated = buffer.len() > MAX_WORKSPACE_FILE_BYTES as usize;
    if truncated {
        buffer.truncate(MAX_WORKSPACE_FILE_BYTES as usize);
    }

    let content = String::from_utf8(buffer).map_err(|_| "File is not valid UTF-8".to_string())?;
    Ok(WorkspaceFileResponse { content, truncated })
}

pub(crate) fn write_workspace_file_inner(
    root: &PathBuf,
    relative_path: &str,
    content: &str,
) -> Result<(), String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(relative_path);

    // Ensure the parent directory exists so we can canonicalize safely.
    if let Some(parent) = candidate.parent() {
        let canonical_parent = parent
            .canonicalize()
            .map_err(|err| format!("Failed to resolve parent directory: {err}"))?;
        if !canonical_parent.starts_with(&canonical_root) {
            return Err("Invalid file path".to_string());
        }
    }

    // Block writes into .git directories.
    let normalized = relative_path.replace('\\', "/");
    if normalized == ".git"
        || normalized.starts_with(".git/")
        || normalized.contains("/.git/")
        || normalized.contains("/.git")
    {
        return Err("Cannot write to .git directory".to_string());
    }

    if content.len() > MAX_WORKSPACE_FILE_BYTES as usize {
        return Err("File content exceeds maximum allowed size".to_string());
    }

    std::fs::write(&candidate, content).map_err(|err| format!("Failed to write file: {err}"))?;
    Ok(())
}

pub(crate) fn trash_workspace_item_inner(
    root: &PathBuf,
    relative_path: &str,
) -> Result<(), String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(relative_path);
    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve path: {err}"))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }

    let normalized = relative_path.replace('\\', "/");
    if normalized == ".git"
        || normalized.starts_with(".git/")
        || normalized.contains("/.git/")
        || normalized.contains("/.git")
    {
        return Err("Cannot delete items in .git directory".to_string());
    }

    if !canonical_path.exists() {
        return Err("Path does not exist".to_string());
    }

    trash::delete(&canonical_path).map_err(|err| format!("Failed to move to trash: {err}"))?;

    Ok(())
}

/// Copy a file or directory within the workspace, appending " copy" (or " copy N")
/// to avoid name collisions.
pub(crate) fn copy_workspace_item_inner(
    root: &PathBuf,
    relative_path: &str,
) -> Result<String, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(relative_path);
    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve path: {err}"))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }

    let normalized = relative_path.replace('\\', "/");
    if normalized == ".git"
        || normalized.starts_with(".git/")
        || normalized.contains("/.git/")
        || normalized.contains("/.git")
    {
        return Err("Cannot copy items in .git directory".to_string());
    }

    if !canonical_path.exists() {
        return Err("Path does not exist".to_string());
    }

    // Build destination path with " copy" suffix
    let parent = canonical_path
        .parent()
        .ok_or_else(|| "Invalid file path".to_string())?;

    let stem = canonical_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let ext = canonical_path.extension().and_then(|s| s.to_str());

    let mut dest;
    let mut counter = 0u32;
    loop {
        let suffix = if counter == 0 {
            " copy".to_string()
        } else {
            format!(" copy {counter}")
        };
        let new_name = if canonical_path.is_dir() {
            format!("{stem}{suffix}")
        } else if let Some(e) = ext {
            format!("{stem}{suffix}.{e}")
        } else {
            format!("{stem}{suffix}")
        };
        dest = parent.join(&new_name);
        if !dest.exists() {
            break;
        }
        counter += 1;
        if counter > 999 {
            return Err("Too many copies exist".to_string());
        }
    }

    if canonical_path.is_dir() {
        copy_dir_recursive(&canonical_path, &dest)?;
    } else {
        std::fs::copy(&canonical_path, &dest)
            .map_err(|err| format!("Failed to copy file: {err}"))?;
    }

    // Return the relative path of the new copy
    let new_relative = dest
        .strip_prefix(&canonical_root)
        .map_err(|_| "Failed to compute relative path".to_string())?;
    Ok(normalize_git_path(&new_relative.to_string_lossy()))
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|err| format!("Failed to create directory: {err}"))?;
    for entry in std::fs::read_dir(src).map_err(|err| format!("Failed to read directory: {err}"))? {
        let entry = entry.map_err(|err| format!("Failed to read entry: {err}"))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|err| format!("Failed to copy file: {err}"))?;
        }
    }
    Ok(())
}
