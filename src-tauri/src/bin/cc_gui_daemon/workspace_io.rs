use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use crate::text_encoding::decode_text_bytes;
use crate::utils::normalize_git_path;

#[derive(Serialize, Deserialize)]
pub(crate) struct WorkspaceFileResponse {
    content: String,
    truncated: bool,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct WorkspaceFilesResponse {
    files: Vec<String>,
    directories: Vec<String>,
    #[serde(default)]
    gitignored_files: Vec<String>,
    #[serde(default)]
    gitignored_directories: Vec<String>,
    #[serde(default = "default_workspace_scan_state")]
    scan_state: WorkspaceScanState,
    #[serde(default)]
    limit_hit: bool,
    #[serde(default)]
    directory_entries: Vec<WorkspaceDirectoryEntry>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkspaceScanState {
    Complete,
    Partial,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkspaceDirectoryChildState {
    Unknown,
    Loaded,
    Empty,
    Partial,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkspaceDirectorySpecialKind {
    Dependency,
    BuildArtifact,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub(crate) struct WorkspaceDirectoryEntry {
    path: String,
    child_state: WorkspaceDirectoryChildState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    special_kind: Option<WorkspaceDirectorySpecialKind>,
    #[serde(default)]
    has_more: bool,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ExternalSpecFileResponse {
    exists: bool,
    content: String,
    truncated: bool,
}

fn should_always_skip(name: &str) -> bool {
    name == ".git"
}

fn is_special_dependency_dir_name(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".pnpm-store"
            | ".yarn"
            | "bower_components"
            | "vendor"
            | ".venv"
            | "venv"
            | "env"
            | "__pypackages__"
            | "Pods"
            | "Carthage"
            | ".m2"
            | ".ivy2"
            | ".cargo"
    )
}

fn is_special_build_artifact_dir_name(name: &str) -> bool {
    matches!(
        name,
        "target"
            | "dist"
            | "build"
            | "out"
            | "coverage"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | ".angular"
            | ".parcel-cache"
            | ".turbo"
            | ".cache"
            | ".gradle"
            | "CMakeFiles"
            | "bin"
            | "obj"
            | "__pycache__"
            | ".pytest_cache"
            | ".mypy_cache"
            | ".tox"
            | ".dart_tool"
    ) || name.starts_with("cmake-build-")
}

fn is_special_directory_path(path: &str) -> bool {
    path.rsplit('/')
        .next()
        .map(|name| {
            is_special_dependency_dir_name(name) || is_special_build_artifact_dir_name(name)
        })
        .unwrap_or(false)
}

fn normalized_relative_to_pathbuf(normalized: &str) -> PathBuf {
    let mut path = PathBuf::new();
    for segment in normalized.split('/') {
        if !segment.is_empty() {
            path.push(segment);
        }
    }
    path
}

fn normalize_workspace_relative_path(
    path: &str,
    empty_message: &str,
    invalid_message: &str,
) -> Result<String, String> {
    let normalized = path.trim().replace('\\', "/");
    let trimmed = normalized.trim_matches('/');
    if trimmed.is_empty() {
        return Err(empty_message.to_string());
    }
    let relative = Path::new(trimmed);
    for component in relative.components() {
        match component {
            Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_)
            | Component::CurDir => {
                return Err(invalid_message.to_string());
            }
            Component::Normal(_) => {}
        }
    }
    if trimmed == ".git"
        || trimmed.starts_with(".git/")
        || trimmed.contains("/.git/")
        || trimmed.ends_with("/.git")
    {
        return Err("Cannot access .git directory.".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_workspace_relative_directory_path(path: &str) -> Result<String, String> {
    normalize_workspace_relative_path(
        path,
        "Directory path cannot be empty.",
        "Invalid directory path.",
    )
}

fn normalize_workspace_relative_file_path(path: &str) -> Result<String, String> {
    normalize_workspace_relative_path(path, "File path cannot be empty.", "Invalid file path.")
}

fn sort_and_dedup_workspace_lists(
    files: &mut Vec<String>,
    directories: &mut Vec<String>,
    gitignored_files: &mut Vec<String>,
    gitignored_directories: &mut Vec<String>,
) {
    files.sort();
    files.dedup();
    directories.sort();
    directories.dedup();
    gitignored_files.sort();
    gitignored_files.dedup();
    gitignored_directories.sort();
    gitignored_directories.dedup();
}

fn sort_and_truncate_named_entries<T>(entries: &mut Vec<(String, T)>, max_entries: usize) {
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    if entries.len() > max_entries {
        entries.truncate(max_entries);
    }
}

fn default_workspace_scan_state() -> WorkspaceScanState {
    WorkspaceScanState::Complete
}

fn workspace_files_response(
    files: Vec<String>,
    directories: Vec<String>,
    gitignored_files: Vec<String>,
    gitignored_directories: Vec<String>,
    scan_state: WorkspaceScanState,
    limit_hit: bool,
    directory_entries: Vec<WorkspaceDirectoryEntry>,
) -> WorkspaceFilesResponse {
    WorkspaceFilesResponse {
        files,
        directories,
        gitignored_files,
        gitignored_directories,
        scan_state,
        limit_hit,
        directory_entries,
    }
}

fn special_directory_kind(path: &str) -> Option<WorkspaceDirectorySpecialKind> {
    let leaf = path.rsplit('/').next().unwrap_or_default();
    if is_special_dependency_dir_name(leaf) {
        return Some(WorkspaceDirectorySpecialKind::Dependency);
    }
    if is_special_build_artifact_dir_name(leaf) {
        return Some(WorkspaceDirectorySpecialKind::BuildArtifact);
    }
    None
}

fn has_known_direct_child(parent: &str, files: &[String], directories: &[String]) -> bool {
    let prefix = format!("{parent}/");
    files.iter().chain(directories.iter()).any(|path| {
        path.strip_prefix(&prefix)
            .is_some_and(|child| !child.is_empty() && !child.contains('/'))
    })
}

fn build_initial_directory_entries(
    files: &[String],
    directories: &[String],
    scan_state: WorkspaceScanState,
) -> Vec<WorkspaceDirectoryEntry> {
    directories
        .iter()
        .map(|path| {
            let special_kind = special_directory_kind(path);
            let child_state = if special_kind.is_some() {
                WorkspaceDirectoryChildState::Unknown
            } else if has_known_direct_child(path, files, directories) {
                match scan_state {
                    WorkspaceScanState::Complete => WorkspaceDirectoryChildState::Loaded,
                    WorkspaceScanState::Partial => WorkspaceDirectoryChildState::Partial,
                }
            } else {
                match scan_state {
                    WorkspaceScanState::Complete => WorkspaceDirectoryChildState::Empty,
                    WorkspaceScanState::Partial => WorkspaceDirectoryChildState::Unknown,
                }
            };
            WorkspaceDirectoryEntry {
                path: path.clone(),
                child_state,
                special_kind,
                has_more: child_state == WorkspaceDirectoryChildState::Partial,
            }
        })
        .collect()
}

fn build_directory_child_entries(
    parent_path: &str,
    files: &[String],
    directories: &[String],
    scan_state: WorkspaceScanState,
) -> Vec<WorkspaceDirectoryEntry> {
    let parent_child_state = match scan_state {
        WorkspaceScanState::Partial => WorkspaceDirectoryChildState::Partial,
        WorkspaceScanState::Complete if files.is_empty() && directories.is_empty() => {
            WorkspaceDirectoryChildState::Empty
        }
        WorkspaceScanState::Complete => WorkspaceDirectoryChildState::Loaded,
    };
    let mut entries = vec![WorkspaceDirectoryEntry {
        path: parent_path.to_string(),
        child_state: parent_child_state,
        special_kind: special_directory_kind(parent_path),
        has_more: scan_state == WorkspaceScanState::Partial,
    }];

    entries.extend(directories.iter().map(|path| WorkspaceDirectoryEntry {
        path: path.clone(),
        child_state: WorkspaceDirectoryChildState::Unknown,
        special_kind: special_directory_kind(path),
        has_more: false,
    }));
    entries
}

const WORKSPACE_SCAN_ENTRY_BUDGET: usize = 30_000;
const WORKSPACE_SCAN_TIME_BUDGET: Duration = Duration::from_millis(1_200);
const WORKSPACE_DIRECTORY_SCAN_BUDGET_MULTIPLIER: usize = 8;

fn workspace_scan_budget_reached(started_at: Instant, scanned_entries: usize) -> bool {
    scanned_entries >= WORKSPACE_SCAN_ENTRY_BUDGET
        || started_at.elapsed() >= WORKSPACE_SCAN_TIME_BUDGET
}

fn normalize_external_spec_root(spec_root: &str) -> Result<PathBuf, String> {
    let trimmed = spec_root.trim();
    if trimmed.is_empty() {
        return Err("Spec root cannot be empty.".to_string());
    }
    let root = PathBuf::from(trimmed);
    if !root.is_absolute() {
        return Err("Spec root must be an absolute path.".to_string());
    }
    let canonical = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve custom spec root: {err}"))?;
    if !canonical.is_dir() {
        return Err("Custom spec root is not a directory.".to_string());
    }
    Ok(canonical)
}

struct ResolvedExternalSpecRoot {
    root: PathBuf,
    exists: bool,
}

fn resolve_external_spec_root(spec_root: &str) -> Result<ResolvedExternalSpecRoot, String> {
    let custom_root = normalize_external_spec_root(spec_root)?;
    let file_name = custom_root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if file_name.eq_ignore_ascii_case("openspec") {
        return Ok(ResolvedExternalSpecRoot {
            root: custom_root,
            exists: true,
        });
    }

    let nested = custom_root.join("openspec");
    if nested.is_dir() {
        let canonical_nested = nested
            .canonicalize()
            .map_err(|err| format!("Failed to resolve custom spec root: {err}"))?;
        return Ok(ResolvedExternalSpecRoot {
            root: canonical_nested,
            exists: true,
        });
    }

    let legacy_root = custom_root.join("changes").is_dir() && custom_root.join("specs").is_dir();
    if legacy_root {
        return Ok(ResolvedExternalSpecRoot {
            root: custom_root,
            exists: true,
        });
    }

    Ok(ResolvedExternalSpecRoot {
        root: nested,
        exists: false,
    })
}

fn resolve_external_spec_logical_path(
    spec_root: &Path,
    logical_path: &str,
) -> Result<PathBuf, String> {
    let normalized = logical_path.trim().replace('\\', "/");
    if normalized == "openspec" {
        return Ok(spec_root.to_path_buf());
    }
    if !normalized.starts_with("openspec/") {
        return Err("External spec path must be under openspec/.".to_string());
    }
    let suffix = normalized["openspec/".len()..].trim();
    if suffix.is_empty() {
        return Ok(spec_root.to_path_buf());
    }
    let relative = Path::new(suffix);
    for component in relative.components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Invalid external spec path.".to_string());
            }
            _ => {}
        }
    }
    Ok(spec_root.join(relative))
}

pub(crate) fn list_external_spec_tree_inner(
    spec_root: &str,
    max_files: usize,
) -> Result<WorkspaceFilesResponse, String> {
    const EXTERNAL_SPEC_TREE_MAX_FILES: usize = 8_000;
    let resolved = resolve_external_spec_root(spec_root)?;
    let effective_max_files = max_files.min(EXTERNAL_SPEC_TREE_MAX_FILES).max(1);
    let max_directories = effective_max_files.saturating_mul(2).max(1_000);
    let scan_started_at = Instant::now();
    let mut scanned_entries = 0usize;
    let mut files = Vec::new();
    let mut directories = vec!["openspec".to_string()];
    let mut limit_hit = false;
    if !resolved.exists {
        let directory_entries = build_initial_directory_entries(
            &files,
            &directories,
            WorkspaceScanState::Complete,
        );
        return Ok(workspace_files_response(
            files,
            directories,
            Vec::new(),
            Vec::new(),
            WorkspaceScanState::Complete,
            false,
            directory_entries,
        ));
    }
    let root = resolved.root;

    let walker = WalkBuilder::new(&root)
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
                return !should_always_skip(&name);
            }
            name != ".DS_Store"
        })
        .build();

    for entry in walker {
        if workspace_scan_budget_reached(scan_started_at, scanned_entries) {
            limit_hit = true;
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        scanned_entries = scanned_entries.saturating_add(1);
        let rel_path = match entry.path().strip_prefix(&root) {
            Ok(path) => path,
            Err(_) => continue,
        };
        let normalized = normalize_git_path(&rel_path.to_string_lossy());
        if normalized.is_empty() {
            continue;
        }
        let logical = format!("openspec/{normalized}");
        if entry.file_type().is_some_and(|ft| ft.is_dir()) {
            if directories.len() < max_directories {
                directories.push(logical);
            } else {
                limit_hit = true;
            }
        } else if entry.file_type().is_some_and(|ft| ft.is_file()) {
            files.push(logical);
            if files.len() >= effective_max_files {
                limit_hit = true;
                break;
            }
        }
    }

    files.sort();
    files.dedup();
    directories.sort();
    directories.dedup();
    let scan_state = if limit_hit {
        WorkspaceScanState::Partial
    } else {
        WorkspaceScanState::Complete
    };
    let directory_entries = build_initial_directory_entries(&files, &directories, scan_state);
    Ok(workspace_files_response(
        files,
        directories,
        Vec::new(),
        Vec::new(),
        scan_state,
        limit_hit,
        directory_entries,
    ))
}

pub(crate) fn list_workspace_files_inner(
    root: &PathBuf,
    max_files: usize,
) -> WorkspaceFilesResponse {
    let scan_started_at = Instant::now();
    let mut scanned_entries = 0usize;
    let max_directories = max_files.saturating_mul(2).max(1_000);
    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut gitignored_files = Vec::new();
    let mut gitignored_directories = Vec::new();
    let mut limit_hit = false;
    let pruned_special_directories: Arc<StdMutex<HashSet<String>>> =
        Arc::new(StdMutex::new(HashSet::new()));

    let repo = git2::Repository::open(root).ok();

    if let Ok(entries) = std::fs::read_dir(root) {
        let mut root_entries = Vec::new();
        for entry in entries {
            if workspace_scan_budget_reached(scan_started_at, scanned_entries) {
                limit_hit = true;
                break;
            }
            scanned_entries += 1;
            if let Ok(entry) = entry {
                root_entries.push(entry);
            }
        }
        root_entries.sort_by(|a, b| {
            a.file_name()
                .to_string_lossy()
                .cmp(&b.file_name().to_string_lossy())
        });
        for entry in root_entries {
            if workspace_scan_budget_reached(scan_started_at, scanned_entries) {
                limit_hit = true;
                break;
            }
            let path = entry.path();
            let rel_path = match path.strip_prefix(root) {
                Ok(path) => path,
                Err(_) => continue,
            };
            let normalized = normalize_git_path(&rel_path.to_string_lossy());
            if normalized.is_empty() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            let is_ignored = repo
                .as_ref()
                .and_then(|r| r.status_should_ignore(rel_path).ok())
                .unwrap_or(false);
            if file_type.is_dir() {
                if should_always_skip(&name) {
                    continue;
                }
                if directories.len() >= max_directories {
                    limit_hit = true;
                    continue;
                }
                directories.push(normalized.clone());
                if is_ignored {
                    gitignored_directories.push(normalized);
                }
            } else if file_type.is_file() {
                if name == ".DS_Store" {
                    continue;
                }
                files.push(normalized.clone());
                if is_ignored {
                    gitignored_files.push(normalized);
                }
                if files.len() >= max_files {
                    sort_and_dedup_workspace_lists(
                        &mut files,
                        &mut directories,
                        &mut gitignored_files,
                        &mut gitignored_directories,
                    );
                    let scan_state = WorkspaceScanState::Partial;
                    let directory_entries =
                        build_initial_directory_entries(&files, &directories, scan_state);
                    return workspace_files_response(
                        files,
                        directories,
                        gitignored_files,
                        gitignored_directories,
                        scan_state,
                        true,
                        directory_entries,
                    );
                }
            }
        }
    }

    let root_for_filter = root.clone();
    let pruned_special_directories_for_filter = Arc::clone(&pruned_special_directories);
    let walker = WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .require_git(false)
        .git_ignore(false)
        .filter_entry(move |entry| {
            if entry.depth() == 0 {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                if should_always_skip(&name) {
                    return false;
                }
                if let Ok(rel_path) = entry.path().strip_prefix(&root_for_filter) {
                    let normalized = normalize_git_path(&rel_path.to_string_lossy());
                    if !normalized.is_empty() && is_special_directory_path(&normalized) {
                        if let Ok(mut special_dirs) = pruned_special_directories_for_filter.lock() {
                            special_dirs.insert(normalized);
                        }
                        return false;
                    }
                }
                return true;
            }
            name != ".DS_Store"
        })
        .build();

    for entry in walker {
        if workspace_scan_budget_reached(scan_started_at, scanned_entries) {
            limit_hit = true;
            break;
        }
        scanned_entries += 1;
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if entry.depth() <= 1 {
            continue;
        }
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
                if directories.len() >= max_directories {
                    limit_hit = true;
                    continue;
                }
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
                    limit_hit = true;
                    break;
                }
            }
        }
    }

    if let Ok(special_dirs) = pruned_special_directories.lock() {
        for normalized in special_dirs.iter() {
            directories.push(normalized.clone());
            let relative_path = normalized_relative_to_pathbuf(normalized);
            let is_ignored = repo
                .as_ref()
                .and_then(|r| r.status_should_ignore(&relative_path).ok())
                .unwrap_or(false);
            if is_ignored {
                gitignored_directories.push(normalized.clone());
            }
        }
    }

    sort_and_dedup_workspace_lists(
        &mut files,
        &mut directories,
        &mut gitignored_files,
        &mut gitignored_directories,
    );
    let scan_state = if limit_hit {
        WorkspaceScanState::Partial
    } else {
        WorkspaceScanState::Complete
    };
    let directory_entries = build_initial_directory_entries(&files, &directories, scan_state);
    workspace_files_response(
        files,
        directories,
        gitignored_files,
        gitignored_directories,
        scan_state,
        limit_hit,
        directory_entries,
    )
}

pub(crate) fn list_workspace_directory_children_inner(
    root: &PathBuf,
    directory_path: &str,
    max_entries: usize,
) -> Result<WorkspaceFilesResponse, String> {
    let normalized_path = normalize_workspace_relative_directory_path(directory_path)?;
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(normalized_relative_to_pathbuf(&normalized_path));
    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve directory path: {err}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid directory path.".to_string());
    }
    let metadata = std::fs::metadata(&canonical_path)
        .map_err(|err| format!("Failed to read directory metadata: {err}"))?;
    if !metadata.is_dir() {
        return Err("Path is not a directory.".to_string());
    }

    let repo = git2::Repository::open(&canonical_root).ok();
    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut gitignored_files = Vec::new();
    let mut gitignored_directories = Vec::new();

    let entries = std::fs::read_dir(&canonical_path)
        .map_err(|err| format!("Failed to read directory: {err}"))?;
    let scan_started_at = Instant::now();
    let max_scanned_entries = max_entries
        .saturating_mul(WORKSPACE_DIRECTORY_SCAN_BUDGET_MULTIPLIER)
        .max(max_entries);
    let mut sorted_entries = Vec::new();
    let mut limit_hit = false;
    for entry in entries {
        if scan_started_at.elapsed() >= WORKSPACE_SCAN_TIME_BUDGET {
            limit_hit = true;
            break;
        }
        if sorted_entries.len() >= max_scanned_entries {
            limit_hit = true;
            break;
        }
        if let Ok(entry) = entry {
            sorted_entries.push((entry.file_name().to_string_lossy().to_string(), entry));
        }
    }
    sort_and_truncate_named_entries(&mut sorted_entries, max_scanned_entries);

    for (_, entry) in sorted_entries {
        let path = entry.path();
        let rel_path = match path.strip_prefix(&canonical_root) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let normalized = normalize_git_path(&rel_path.to_string_lossy());
        if normalized.is_empty() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let is_ignored = repo
            .as_ref()
            .and_then(|r| r.status_should_ignore(rel_path).ok())
            .unwrap_or(false);

        if file_type.is_dir() {
            if should_always_skip(&name) {
                continue;
            }
            directories.push(normalized.clone());
            if is_ignored {
                gitignored_directories.push(normalized);
            }
        } else if file_type.is_file() {
            if name == ".DS_Store" {
                continue;
            }
            files.push(normalized.clone());
            if is_ignored {
                gitignored_files.push(normalized);
            }
        }

        if files.len() + directories.len() >= max_entries {
            limit_hit = true;
            break;
        }
    }

    sort_and_dedup_workspace_lists(
        &mut files,
        &mut directories,
        &mut gitignored_files,
        &mut gitignored_directories,
    );
    let scan_state = if limit_hit {
        WorkspaceScanState::Partial
    } else {
        WorkspaceScanState::Complete
    };
    let directory_entries =
        build_directory_child_entries(&normalized_path, &files, &directories, scan_state);
    Ok(workspace_files_response(
        files,
        directories,
        gitignored_files,
        gitignored_directories,
        scan_state,
        limit_hit,
        directory_entries,
    ))
}

pub(crate) fn list_external_absolute_directory_children_inner(
    absolute_directory_path: &str,
    allowed_roots: &[PathBuf],
    max_entries: usize,
) -> Result<WorkspaceFilesResponse, String> {
    let canonical_path = resolve_allowed_external_absolute_path(
        absolute_directory_path,
        allowed_roots,
        "directory",
        "Invalid directory path.",
    )?;

    let entries = std::fs::read_dir(&canonical_path)
        .map_err(|err| format!("Failed to read directory: {err}"))?;
    let scan_started_at = Instant::now();
    let max_scanned_entries = max_entries
        .saturating_mul(WORKSPACE_DIRECTORY_SCAN_BUDGET_MULTIPLIER)
        .max(max_entries);
    let mut sorted_entries = Vec::new();
    let mut limit_hit = false;
    for entry in entries {
        if scan_started_at.elapsed() >= WORKSPACE_SCAN_TIME_BUDGET {
            limit_hit = true;
            break;
        }
        if sorted_entries.len() >= max_scanned_entries {
            limit_hit = true;
            break;
        }
        if let Ok(entry) = entry {
            sorted_entries.push((entry.file_name().to_string_lossy().to_string(), entry));
        }
    }
    sort_and_truncate_named_entries(&mut sorted_entries, max_scanned_entries);

    let mut files = Vec::new();
    let mut directories = Vec::new();
    for (name, entry) in sorted_entries {
        let path = entry.path();
        let normalized = normalize_git_path(&path.to_string_lossy());
        if normalized.is_empty() {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            if should_always_skip(&name) {
                continue;
            }
            directories.push(normalized);
        } else if file_type.is_file() {
            if name == ".DS_Store" {
                continue;
            }
            files.push(normalized);
        }

        if files.len() + directories.len() >= max_entries {
            limit_hit = true;
            break;
        }
    }

    files.sort();
    files.dedup();
    directories.sort();
    directories.dedup();
    let scan_state = if limit_hit {
        WorkspaceScanState::Partial
    } else {
        WorkspaceScanState::Complete
    };
    Ok(workspace_files_response(
        files,
        directories,
        Vec::new(),
        Vec::new(),
        scan_state,
        limit_hit,
        Vec::new(),
    ))
}

const MAX_WORKSPACE_FILE_BYTES: u64 = 400_000;

pub(crate) fn read_external_spec_file_inner(
    spec_root: &str,
    logical_path: &str,
) -> Result<ExternalSpecFileResponse, String> {
    let resolved = resolve_external_spec_root(spec_root)?;
    if !resolved.exists {
        return Ok(ExternalSpecFileResponse {
            exists: false,
            content: String::new(),
            truncated: false,
        });
    }
    let root = resolved.root;
    let candidate = resolve_external_spec_logical_path(&root, logical_path)?;
    if !candidate.exists() {
        return Ok(ExternalSpecFileResponse {
            exists: false,
            content: String::new(),
            truncated: false,
        });
    }

    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve external spec file: {err}"))?;
    if !canonical_path.starts_with(&root) {
        return Err("Invalid external spec file path.".to_string());
    }
    let metadata = std::fs::metadata(&canonical_path)
        .map_err(|err| format!("Failed to read external spec file metadata: {err}"))?;
    if !metadata.is_file() {
        return Ok(ExternalSpecFileResponse {
            exists: false,
            content: String::new(),
            truncated: false,
        });
    }

    let file = File::open(&canonical_path)
        .map_err(|err| format!("Failed to open external spec file: {err}"))?;
    let mut buffer = Vec::new();
    file.take(MAX_WORKSPACE_FILE_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|err| format!("Failed to read external spec file: {err}"))?;

    let truncated = buffer.len() > MAX_WORKSPACE_FILE_BYTES as usize;
    if truncated {
        buffer.truncate(MAX_WORKSPACE_FILE_BYTES as usize);
    }
    let content = decode_text_bytes(&buffer, "External spec file")?;
    Ok(ExternalSpecFileResponse {
        exists: true,
        content,
        truncated,
    })
}

pub(crate) fn write_external_spec_file_inner(
    spec_root: &str,
    logical_path: &str,
    content: &str,
) -> Result<(), String> {
    if content.len() > MAX_WORKSPACE_FILE_BYTES as usize {
        return Err("File content exceeds maximum allowed size".to_string());
    }
    let resolved = resolve_external_spec_root(spec_root)?;
    let root = resolved.root;
    let candidate = resolve_external_spec_logical_path(&root, logical_path)?;
    if candidate == root {
        return Err("Cannot write to external spec root directory directly.".to_string());
    }

    let normalized = logical_path.replace('\\', "/");
    if normalized == ".git"
        || normalized.starts_with(".git/")
        || normalized.contains("/.git/")
        || normalized.ends_with("/.git")
    {
        return Err("Cannot write to .git directory".to_string());
    }

    if let Some(parent) = candidate.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create external spec parent directory: {err}"))?;
        let canonical_root = root
            .canonicalize()
            .map_err(|err| format!("Failed to resolve external spec root: {err}"))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|err| format!("Failed to resolve external spec parent directory: {err}"))?;
        if !canonical_parent.starts_with(&canonical_root) {
            return Err("Invalid external spec file path.".to_string());
        }
        if let Ok(metadata) = std::fs::symlink_metadata(&candidate) {
            if metadata.file_type().is_symlink() {
                return Err("Cannot write to symlinked external spec file.".to_string());
            }
            if !metadata.is_file() {
                return Err("External spec path is not a file.".to_string());
            }
            let canonical_candidate = candidate
                .canonicalize()
                .map_err(|err| format!("Failed to resolve external spec file: {err}"))?;
            if !canonical_candidate.starts_with(&canonical_root) {
                return Err("Invalid external spec file path.".to_string());
            }
        }
    } else {
        return Err("Invalid external spec file path.".to_string());
    }

    std::fs::write(&candidate, content)
        .map_err(|err| format!("Failed to write external spec file: {err}"))?;
    Ok(())
}

pub(crate) fn read_workspace_file_inner(
    root: &PathBuf,
    relative_path: &str,
) -> Result<WorkspaceFileResponse, String> {
    let normalized_path = normalize_workspace_relative_file_path(relative_path)?;
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(normalized_relative_to_pathbuf(&normalized_path));
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

    let content = decode_text_bytes(&buffer, "File")?;
    Ok(WorkspaceFileResponse { content, truncated })
}

pub(crate) fn read_external_absolute_file_inner(
    absolute_path: &str,
    allowed_roots: &[PathBuf],
) -> Result<WorkspaceFileResponse, String> {
    let canonical_path = resolve_allowed_external_absolute_path(
        absolute_path,
        allowed_roots,
        "file",
        "Invalid file path",
    )?;

    let file = File::open(&canonical_path).map_err(|err| format!("Failed to open file: {err}"))?;
    let mut buffer = Vec::new();
    file.take(MAX_WORKSPACE_FILE_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|err| format!("Failed to read file: {err}"))?;

    let truncated = buffer.len() > MAX_WORKSPACE_FILE_BYTES as usize;
    if truncated {
        buffer.truncate(MAX_WORKSPACE_FILE_BYTES as usize);
    }

    let content = decode_text_bytes(&buffer, "File")?;
    Ok(WorkspaceFileResponse { content, truncated })
}

pub(crate) fn write_external_absolute_file_inner(
    absolute_path: &str,
    allowed_roots: &[PathBuf],
    content: &str,
) -> Result<(), String> {
    if content.len() > MAX_WORKSPACE_FILE_BYTES as usize {
        return Err("File content exceeds maximum allowed size".to_string());
    }

    let canonical_path = resolve_allowed_external_absolute_path(
        absolute_path,
        allowed_roots,
        "file",
        "Invalid file path",
    )?;

    std::fs::write(&canonical_path, content)
        .map_err(|err| format!("Failed to write file: {err}"))?;
    Ok(())
}

fn resolve_allowed_external_absolute_path(
    absolute_path: &str,
    allowed_roots: &[PathBuf],
    expected_kind: &str,
    invalid_path_message: &str,
) -> Result<PathBuf, String> {
    let trimmed = absolute_path.trim();
    if trimmed.is_empty() {
        return Err(invalid_path_message.to_string());
    }

    let raw_path = PathBuf::from(trimmed);
    if !raw_path.is_absolute() {
        return Err(invalid_path_message.to_string());
    }

    let canonical_path = raw_path
        .canonicalize()
        .map_err(|err| format!("Failed to open file: {err}"))?;

    let mut within_allowed_root = false;
    for root in allowed_roots {
        if let Ok(canonical_root) = root.canonicalize() {
            if canonical_path.starts_with(&canonical_root) {
                within_allowed_root = true;
                break;
            }
        }
    }
    if !within_allowed_root {
        return Err("Path is not within allowed directories.".to_string());
    }

    let metadata = std::fs::metadata(&canonical_path)
        .map_err(|err| format!("Failed to read file metadata: {err}"))?;
    let kind_matches = match expected_kind {
        "file" => metadata.is_file(),
        "directory" => metadata.is_dir(),
        _ => false,
    };
    if !kind_matches {
        return Err(format!("Path is not a {expected_kind}."));
    }
    Ok(canonical_path)
}

#[cfg(test)]
mod tests {
    use super::{read_workspace_file_inner, write_external_spec_file_inner};
    use std::fs;
    use std::path::{Path, PathBuf};
    use uuid::Uuid;

    fn temp_dir(prefix: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    #[test]
    fn read_workspace_file_rejects_git_directory_access() {
        let root = temp_dir("ccgui-workspace-io");
        fs::create_dir_all(root.join(".git")).expect("create git dir");
        fs::write(root.join(".git").join("config"), "[core]\n").expect("write git config");

        let result = read_workspace_file_inner(&root, ".git/config");

        assert!(result.is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_workspace_file_accepts_windows_style_relative_path() {
        let root = temp_dir("ccgui-workspace-io");
        fs::create_dir_all(root.join("nested").join("dir")).expect("create nested dir");
        fs::write(root.join("nested").join("dir").join("file.txt"), "hello").expect("write file");

        let result = read_workspace_file_inner(&root, "nested\\dir\\file.txt")
            .expect("read windows-style relative path");

        assert_eq!(result.content, "hello");
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn write_external_spec_file_rejects_existing_symlink_target() {
        use std::os::unix::fs::symlink;

        let project_root = temp_dir("ccgui-external-spec");
        let openspec_root = project_root.join("openspec");
        let outside_root = temp_dir("ccgui-external-outside");
        fs::create_dir_all(openspec_root.join("changes")).expect("create changes");
        fs::create_dir_all(openspec_root.join("specs")).expect("create specs");
        let outside_file = outside_root.join("outside.md");
        fs::write(&outside_file, "outside").expect("write outside");
        symlink(
            &outside_file,
            openspec_root.join("changes").join("linked.md"),
        )
        .expect("create symlink");

        let result = write_external_spec_file_inner(
            project_root.to_string_lossy().as_ref(),
            "openspec/changes/linked.md",
            "modified",
        );

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(Path::new(&outside_file)).expect("read outside"),
            "outside"
        );
        let _ = fs::remove_dir_all(project_root);
        let _ = fs::remove_dir_all(outside_root);
    }
}
