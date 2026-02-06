use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::types::WorkspaceEntry;

const THREAD_TITLES_VERSION: u8 = 1;
const MAX_THREAD_TITLE_CHARS: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ThreadTitlesStore {
    #[serde(default = "default_version")]
    version: u8,
    #[serde(default)]
    titles: HashMap<String, String>,
}

fn default_version() -> u8 {
    THREAD_TITLES_VERSION
}

impl Default for ThreadTitlesStore {
    fn default() -> Self {
        Self {
            version: THREAD_TITLES_VERSION,
            titles: HashMap::new(),
        }
    }
}

fn normalize_title(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim();
    let mut normalized = String::new();
    for ch in trimmed.chars().take(MAX_THREAD_TITLE_CHARS) {
        normalized.push(ch);
    }
    normalized.trim().to_string()
}

fn thread_titles_path(workspace_root: &PathBuf) -> PathBuf {
    workspace_root
        .join(".codemoss")
        .join("client")
        .join("thread_titles.json")
}

fn parse_store(raw: &str) -> Result<ThreadTitlesStore, String> {
    if raw.trim().is_empty() {
        return Ok(ThreadTitlesStore::default());
    }

    if let Ok(parsed) = serde_json::from_str::<ThreadTitlesStore>(raw) {
        return Ok(parsed);
    }

    if let Ok(flat_map) = serde_json::from_str::<HashMap<String, String>>(raw) {
        return Ok(ThreadTitlesStore {
            version: THREAD_TITLES_VERSION,
            titles: flat_map,
        });
    }

    Err("Failed to parse thread title mappings file".to_string())
}

fn read_store(path: &PathBuf) -> Result<ThreadTitlesStore, String> {
    if !path.exists() {
        return Ok(ThreadTitlesStore::default());
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|error| format!("Failed to read thread titles: {error}"))?;
    parse_store(&raw)
}

fn write_store(path: &PathBuf, store: &ThreadTitlesStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create thread title directory: {error}"))?;
    }
    let serialized = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize thread titles: {error}"))?;
    std::fs::write(path, serialized)
        .map_err(|error| format!("Failed to write thread titles: {error}"))
}

async fn resolve_workspace_root(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(&entry.path))
}

pub(crate) async fn list_thread_titles_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<HashMap<String, String>, String> {
    let workspace_root = resolve_workspace_root(workspaces, &workspace_id).await?;
    let path = thread_titles_path(&workspace_root);
    let store = read_store(&path)?;
    Ok(store
        .titles
        .into_iter()
        .filter_map(|(thread_id, title)| {
            let normalized = normalize_title(&title);
            if normalized.is_empty() || thread_id.trim().is_empty() {
                None
            } else {
                Some((thread_id, normalized))
            }
        })
        .collect())
}

pub(crate) async fn upsert_thread_title_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    thread_id: String,
    title: String,
) -> Result<String, String> {
    let normalized_thread_id = thread_id.trim().to_string();
    if normalized_thread_id.is_empty() {
        return Err("threadId is required".to_string());
    }
    let normalized_title = normalize_title(&title);
    if normalized_title.is_empty() {
        return Err("title is required".to_string());
    }

    let workspace_root = resolve_workspace_root(workspaces, &workspace_id).await?;
    let path = thread_titles_path(&workspace_root);
    let mut store = read_store(&path)?;
    store
        .titles
        .insert(normalized_thread_id, normalized_title.clone());
    write_store(&path, &store)?;
    Ok(normalized_title)
}

pub(crate) async fn rename_thread_title_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    old_thread_id: String,
    new_thread_id: String,
) -> Result<(), String> {
    let from = old_thread_id.trim().to_string();
    let to = new_thread_id.trim().to_string();
    if from.is_empty() || to.is_empty() || from == to {
        return Ok(());
    }

    let workspace_root = resolve_workspace_root(workspaces, &workspace_id).await?;
    let path = thread_titles_path(&workspace_root);
    if !path.exists() {
        return Ok(());
    }

    let mut store = read_store(&path)?;
    let Some(previous) = store.titles.remove(&from) else {
        return Ok(());
    };
    if !store.titles.contains_key(&to) {
        store.titles.insert(to, previous);
    }
    write_store(&path, &store)
}

#[cfg(test)]
mod tests {
    use super::{
        list_thread_titles_core, rename_thread_title_core, thread_titles_path,
        upsert_thread_title_core,
    };
    use crate::types::{WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
    use std::collections::HashMap;
    use std::path::PathBuf;
    use tokio::sync::Mutex;
    use uuid::Uuid;

    fn workspace_entry(workspace_id: &str, workspace_path: &PathBuf) -> WorkspaceEntry {
        WorkspaceEntry {
            id: workspace_id.to_string(),
            name: "workspace".to_string(),
            path: workspace_path.to_string_lossy().to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        }
    }

    #[tokio::test]
    async fn upsert_and_list_thread_titles_roundtrip() {
        let root = std::env::temp_dir().join(format!("code-moss-thread-titles-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create temp workspace root");

        let mut workspace_map = HashMap::new();
        workspace_map.insert("ws-1".to_string(), workspace_entry("ws-1", &root));
        let workspaces = Mutex::new(workspace_map);

        let saved = upsert_thread_title_core(
            &workspaces,
            "ws-1".to_string(),
            "thread-1".to_string(),
            "  Fix   login   flow  ".to_string(),
        )
        .await
        .expect("save thread title");

        assert_eq!(saved, "Fix login flow");

        let listed = list_thread_titles_core(&workspaces, "ws-1".to_string())
            .await
            .expect("list thread titles");
        assert_eq!(listed.get("thread-1"), Some(&"Fix login flow".to_string()));

        let path = thread_titles_path(&root);
        assert!(path.exists());
    }

    #[tokio::test]
    async fn rename_thread_title_moves_existing_mapping() {
        let root = std::env::temp_dir().join(format!("code-moss-thread-title-rename-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create temp workspace root");

        let mut workspace_map = HashMap::new();
        workspace_map.insert("ws-2".to_string(), workspace_entry("ws-2", &root));
        let workspaces = Mutex::new(workspace_map);

        upsert_thread_title_core(
            &workspaces,
            "ws-2".to_string(),
            "claude-pending-1".to_string(),
            "Initial title".to_string(),
        )
        .await
        .expect("save pending title");

        rename_thread_title_core(
            &workspaces,
            "ws-2".to_string(),
            "claude-pending-1".to_string(),
            "claude:session-1".to_string(),
        )
        .await
        .expect("rename thread title key");

        let listed = list_thread_titles_core(&workspaces, "ws-2".to_string())
            .await
            .expect("list thread titles");
        assert_eq!(listed.get("claude-pending-1"), None);
        assert_eq!(listed.get("claude:session-1"), Some(&"Initial title".to_string()));
    }
}
