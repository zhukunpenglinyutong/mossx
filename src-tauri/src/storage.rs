use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use crate::types::{AppSettings, WorkspaceEntry};
use uuid::Uuid;

const STORAGE_LOCK_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
const STORAGE_LOCK_RETRY_INTERVAL: Duration = Duration::from_millis(25);
const STORAGE_LOCK_STALE_TIMEOUT: Duration = Duration::from_secs(30);

struct StorageFileLock {
    path: PathBuf,
}

impl Drop for StorageFileLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn lock_file_path(path: &Path) -> PathBuf {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!("{value}.lock"))
        .unwrap_or_else(|| "lock".to_string());
    path.with_extension(extension)
}

fn is_lock_file_stale(lock_path: &Path) -> bool {
    let metadata = match std::fs::metadata(lock_path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };
    let modified_at = match metadata.modified() {
        Ok(modified_at) => modified_at,
        Err(_) => return false,
    };
    match modified_at.elapsed() {
        Ok(elapsed) => elapsed > STORAGE_LOCK_STALE_TIMEOUT,
        Err(_) => false,
    }
}

fn acquire_storage_lock(path: &Path) -> Result<StorageFileLock, String> {
    let lock_path = lock_file_path(path);
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let deadline = Instant::now() + STORAGE_LOCK_WAIT_TIMEOUT;
    loop {
        match std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&lock_path)
        {
            Ok(mut file) => {
                let _ = writeln!(file, "pid={}", std::process::id());
                return Ok(StorageFileLock { path: lock_path });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if is_lock_file_stale(&lock_path) {
                    let _ = std::fs::remove_file(&lock_path);
                    continue;
                }
                if Instant::now() >= deadline {
                    return Err(format!(
                        "Timed out waiting for storage file lock: {}",
                        lock_path.display()
                    ));
                }
                thread::sleep(STORAGE_LOCK_RETRY_INTERVAL);
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn with_storage_lock<T>(path: &Path, op: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _lock_guard = acquire_storage_lock(path)?;
    op()
}

fn write_string_atomically(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| format!("Storage path has no parent: {}", path.display()))?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Storage path has invalid filename: {}", path.display()))?;
    let temp_path = parent.join(format!(".{filename}.{}.tmp", Uuid::new_v4()));
    let mut temp_file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp_path)
        .map_err(|error| error.to_string())?;
    temp_file
        .write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    temp_file.sync_all().map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    if let Err(error) = std::fs::rename(&temp_path, path) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error.to_string());
    }
    Ok(())
}

fn read_workspace_list(path: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

const DEFAULT_WORKSPACE_PATH_SUFFIXES: [&str; 6] = [
    "/.ccgui/workspace",
    "/.mossx/workspace",
    "/.codemoss/workspace",
    "/com.zhukunpenglinyutong.ccgui/workspace",
    "/com.zhukunpenglinyutong.mossx/workspace",
    "/com.zhukunpenglinyutong.codemoss/workspace",
];

fn normalize_workspace_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn default_workspace_path_priority(path: &str) -> Option<usize> {
    let normalized = normalize_workspace_path(path);
    DEFAULT_WORKSPACE_PATH_SUFFIXES
        .iter()
        .position(|suffix| normalized.ends_with(suffix))
}

fn dedupe_default_workspace_entries(entries: Vec<WorkspaceEntry>) -> (Vec<WorkspaceEntry>, bool) {
    let mut default_entries: Vec<(usize, usize)> = entries
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            default_workspace_path_priority(&entry.path).map(|priority| (index, priority))
        })
        .collect();

    if default_entries.len() <= 1 {
        return (entries, false);
    }

    default_entries.sort_by_key(|(index, priority)| (*priority, *index));
    let keep_index = default_entries[0].0;

    let pruned = entries
        .into_iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            if default_workspace_path_priority(&entry.path).is_some() && index != keep_index {
                None
            } else {
                Some(entry)
            }
        })
        .collect::<Vec<_>>();

    (pruned, true)
}

fn merge_workspace_entries(
    existing: Vec<WorkspaceEntry>,
    incoming: &[WorkspaceEntry],
) -> Vec<WorkspaceEntry> {
    let mut merged = existing;
    let mut index_by_id = HashMap::new();
    for (index, entry) in merged.iter().enumerate() {
        index_by_id.insert(entry.id.clone(), index);
    }

    for entry in incoming {
        if let Some(index) = index_by_id.get(&entry.id).copied() {
            merged[index] = entry.clone();
        } else {
            index_by_id.insert(entry.id.clone(), merged.len());
            merged.push(entry.clone());
        }
    }
    merged
}

pub(crate) fn read_workspaces(path: &PathBuf) -> Result<HashMap<String, WorkspaceEntry>, String> {
    let list = read_workspace_list(path)?;
    let (list, changed) = dedupe_default_workspace_entries(list);
    if changed {
        if let Err(error) = write_workspaces(path, &list) {
            eprintln!(
                "[storage] failed to persist default workspace dedupe for {}: {}",
                path.display(),
                error
            );
        }
    }
    Ok(list
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect())
}

pub(crate) fn write_workspaces(path: &PathBuf, entries: &[WorkspaceEntry]) -> Result<(), String> {
    with_storage_lock(path, || {
        let data = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
        write_string_atomically(path, &data)
    })
}

pub(crate) fn write_workspaces_preserving_existing(
    path: &PathBuf,
    entries: &[WorkspaceEntry],
) -> Result<Vec<WorkspaceEntry>, String> {
    with_storage_lock(path, || {
        let existing = read_workspace_list(path)?;
        let merged = merge_workspace_entries(existing, entries);
        let data = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
        write_string_atomically(path, &data)?;
        Ok(merged)
    })
}

pub(crate) fn read_settings(path: &PathBuf) -> Result<AppSettings, String> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut settings: AppSettings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    settings.normalize_unified_exec_policy();
    settings.upgrade_runtime_pool_settings_for_startup();
    settings.sanitize_engine_gates();
    Ok(settings)
}

pub(crate) fn write_settings(path: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    with_storage_lock(path, || {
        let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        write_string_atomically(path, &data)
    })
}

pub(crate) fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let data = std::fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let parsed = serde_json::from_str::<T>(&data)
        .map_err(|error| format!("failed to parse {}: {error}", path.display()))?;
    Ok(Some(parsed))
}

pub(crate) fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    with_storage_lock(path, || {
        let data = serde_json::to_string_pretty(value)
            .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?;
        write_string_atomically(path, &data)
    })
}

#[cfg(test)]
mod tests {
    use super::{
        read_settings, read_workspaces, write_workspaces, write_workspaces_preserving_existing,
    };
    use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
    use std::sync::{Arc, Barrier};
    use std::thread;
    use uuid::Uuid;

    #[test]
    fn write_read_workspaces_persists_sort_and_group() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let mut settings = WorkspaceSettings::default();
        settings.sort_order = Some(5);
        settings.group_id = Some("group-42".to_string());
        settings.sidebar_collapsed = true;
        settings.git_root = Some("/tmp".to_string());
        settings.codex_args = Some("--profile personal".to_string());

        let entry = WorkspaceEntry {
            id: "w1".to_string(),
            name: "Workspace".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: settings.clone(),
        };

        write_workspaces(&path, &[entry]).expect("write workspaces");
        let read = read_workspaces(&path).expect("read workspaces");
        let stored = read.get("w1").expect("stored workspace");
        assert_eq!(stored.settings.sort_order, Some(5));
        assert_eq!(stored.settings.group_id.as_deref(), Some("group-42"));
        assert!(stored.settings.sidebar_collapsed);
        assert_eq!(stored.settings.git_root.as_deref(), Some("/tmp"));
        assert_eq!(
            stored.settings.codex_args.as_deref(),
            Some("--profile personal")
        );
    }

    #[test]
    fn write_workspaces_preserving_existing_merges_concurrent_import_snapshots() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let base_settings = WorkspaceSettings::default();
        let entry_a = WorkspaceEntry {
            id: "workspace-a".to_string(),
            name: "Workspace A".to_string(),
            path: "/tmp/workspace-a".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: base_settings.clone(),
        };
        let entry_b = WorkspaceEntry {
            id: "workspace-b".to_string(),
            name: "Workspace B".to_string(),
            path: "/tmp/workspace-b".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: base_settings,
        };

        write_workspaces_preserving_existing(&path, &[entry_a]).expect("write first snapshot");
        write_workspaces_preserving_existing(&path, &[entry_b]).expect("write second snapshot");

        let read = read_workspaces(&path).expect("read merged list");
        assert_eq!(read.len(), 2);
        assert!(read.contains_key("workspace-a"));
        assert!(read.contains_key("workspace-b"));
    }

    #[test]
    fn write_workspaces_preserving_existing_serializes_parallel_writes() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = Arc::new(temp_dir.join("workspaces.json"));
        let barrier = Arc::new(Barrier::new(2));

        let path_a = path.clone();
        let barrier_a = barrier.clone();
        let thread_a = thread::spawn(move || {
            let entry = WorkspaceEntry {
                id: "workspace-a".to_string(),
                name: "Workspace A".to_string(),
                path: "/tmp/workspace-a".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            };
            barrier_a.wait();
            write_workspaces_preserving_existing(&path_a, &[entry]).expect("thread a write");
        });

        let path_b = path.clone();
        let barrier_b = barrier.clone();
        let thread_b = thread::spawn(move || {
            let entry = WorkspaceEntry {
                id: "workspace-b".to_string(),
                name: "Workspace B".to_string(),
                path: "/tmp/workspace-b".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            };
            barrier_b.wait();
            write_workspaces_preserving_existing(&path_b, &[entry]).expect("thread b write");
        });

        thread_a.join().expect("thread a join");
        thread_b.join().expect("thread b join");

        let read = read_workspaces(path.as_ref()).expect("read merged list");
        assert_eq!(read.len(), 2);
        assert!(read.contains_key("workspace-a"));
        assert!(read.contains_key("workspace-b"));
    }

    #[test]
    fn write_workspaces_replace_mode_still_allows_pruning() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let entry_a = WorkspaceEntry {
            id: "workspace-a".to_string(),
            name: "Workspace A".to_string(),
            path: "/tmp/workspace-a".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let entry_b = WorkspaceEntry {
            id: "workspace-b".to_string(),
            name: "Workspace B".to_string(),
            path: "/tmp/workspace-b".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        write_workspaces(&path, &[entry_a.clone(), entry_b]).expect("write initial workspaces");
        write_workspaces(&path, &[entry_a]).expect("write pruned workspace list");

        let read = read_workspaces(&path).expect("read pruned list");
        assert_eq!(read.len(), 1);
        assert!(read.contains_key("workspace-a"));
    }

    #[test]
    fn read_workspaces_prunes_duplicate_default_workspace_entries() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let entries = vec![
            WorkspaceEntry {
                id: "default-codemoss".to_string(),
                name: "workspace".to_string(),
                path: "/Users/demo/.codemoss/workspace".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
            WorkspaceEntry {
                id: "project-main".to_string(),
                name: "project-main".to_string(),
                path: "/Users/demo/project-main".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
            WorkspaceEntry {
                id: "default-ccgui".to_string(),
                name: "workspace".to_string(),
                path: "/Users/demo/.ccgui/workspace".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
        ];

        write_workspaces(&path, &entries).expect("write duplicated defaults");

        let read = read_workspaces(&path).expect("read pruned defaults");
        assert_eq!(read.len(), 2);
        assert!(read.contains_key("project-main"));
        assert!(read.contains_key("default-ccgui"));
        assert!(!read.contains_key("default-codemoss"));
    }

    #[test]
    fn read_workspaces_prunes_duplicate_default_workspace_entries_windows_style_paths() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let entries = vec![
            WorkspaceEntry {
                id: "default-codemoss".to_string(),
                name: "workspace".to_string(),
                path: "C:\\Users\\Demo\\.CodeMoss\\Workspace".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
            WorkspaceEntry {
                id: "default-ccgui".to_string(),
                name: "workspace".to_string(),
                path: " C:\\Users\\Demo\\.CCGUI\\Workspace\\ ".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
        ];

        write_workspaces(&path, &entries).expect("write duplicated defaults");

        let read = read_workspaces(&path).expect("read pruned defaults");
        assert_eq!(read.len(), 1);
        assert!(read.contains_key("default-ccgui"));
        assert!(!read.contains_key("default-codemoss"));
    }

    #[cfg(unix)]
    #[test]
    fn read_workspaces_succeeds_even_when_dedupe_writeback_fails() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let entries = vec![
            WorkspaceEntry {
                id: "default-codemoss".to_string(),
                name: "workspace".to_string(),
                path: "/Users/demo/.codemoss/workspace".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
            WorkspaceEntry {
                id: "default-ccgui".to_string(),
                name: "workspace".to_string(),
                path: "/Users/demo/.ccgui/workspace".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            },
        ];

        write_workspaces(&path, &entries).expect("write duplicated defaults");

        let mut readonly_perms = std::fs::metadata(&temp_dir)
            .expect("read temp dir metadata")
            .permissions();
        readonly_perms.set_mode(0o555);
        std::fs::set_permissions(&temp_dir, readonly_perms).expect("set temp dir readonly");

        let read_result = read_workspaces(&path);

        let mut writable_perms = std::fs::metadata(&temp_dir)
            .expect("read temp dir metadata")
            .permissions();
        writable_perms.set_mode(0o755);
        std::fs::set_permissions(&temp_dir, writable_perms).expect("restore temp dir writable");

        let read = read_result.expect("read should still succeed when writeback fails");
        assert_eq!(read.len(), 1);
        assert!(read.contains_key("default-ccgui"));
        assert!(!read.contains_key("default-codemoss"));

        // Writeback failed due to readonly dir, so on-disk data should remain unchanged.
        let raw_after = std::fs::read_to_string(&path).expect("read original file");
        let persisted: Vec<WorkspaceEntry> =
            serde_json::from_str(&raw_after).expect("parse unchanged file");
        assert_eq!(persisted.len(), 2);
    }

    #[test]
    fn read_settings_sanitizes_runtime_pool_budget_fields() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        let mut settings = AppSettings::default();
        settings.codex_max_hot_runtimes = 42;
        settings.codex_max_warm_runtimes = 88;
        settings.codex_warm_ttl_seconds = 1;
        std::fs::write(
            &path,
            serde_json::to_string(&settings).expect("serialize settings"),
        )
        .expect("write settings");

        let read = read_settings(&path).expect("read settings");
        assert_eq!(read.codex_max_hot_runtimes, 8);
        assert_eq!(read.codex_max_warm_runtimes, 16);
        assert_eq!(read.codex_warm_ttl_seconds, 7200);
    }

    #[test]
    fn read_settings_upgrades_legacy_warm_ttl_to_startup_default() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        let mut settings = AppSettings::default();
        settings.codex_warm_ttl_seconds = 300;
        std::fs::write(
            &path,
            serde_json::to_string(&settings).expect("serialize settings"),
        )
        .expect("write settings");

        let read = read_settings(&path).expect("read settings");
        assert_eq!(read.codex_warm_ttl_seconds, 7200);
    }
}
