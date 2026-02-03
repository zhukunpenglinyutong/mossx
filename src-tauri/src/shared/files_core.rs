use std::collections::HashMap;
use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::home as codex_home;
use crate::files::io::TextFileResponse;
use crate::files::ops::{read_with_policy, write_with_policy};
use crate::files::policy::{policy_for, FileKind, FileScope};
use crate::types::WorkspaceEntry;

fn resolve_default_codex_home() -> Result<PathBuf, String> {
    codex_home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
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

pub(crate) async fn resolve_root_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    scope: FileScope,
    workspace_id: Option<&str>,
) -> Result<PathBuf, String> {
    match scope {
        FileScope::Global => resolve_default_codex_home(),
        FileScope::Workspace => {
            let workspace_id =
                workspace_id.ok_or_else(|| "workspaceId is required".to_string())?;
            resolve_workspace_root(workspaces, workspace_id).await
        }
    }
}

/// For CLAUDE.md in workspace scope, check both root and .claude/ subdirectory
fn read_claude_md_with_fallback(root: &PathBuf) -> Result<TextFileResponse, String> {
    let policy = policy_for(FileScope::Workspace, FileKind::Claude)?;

    // First try root/CLAUDE.md
    let root_result = read_with_policy(root, policy);
    if let Ok(ref response) = root_result {
        if response.exists {
            return root_result;
        }
    }

    // Fallback to root/.claude/CLAUDE.md
    let claude_dir = root.join(".claude");
    if claude_dir.exists() {
        let subdir_result = read_with_policy(&claude_dir, policy);
        if let Ok(ref response) = subdir_result {
            if response.exists {
                return subdir_result;
            }
        }
    }

    // Return the root result (not found)
    root_result
}

/// For CLAUDE.md writes, prefer .claude/ if it exists, otherwise use root
fn write_claude_md_with_fallback(root: &PathBuf, content: &str) -> Result<(), String> {
    let policy = policy_for(FileScope::Workspace, FileKind::Claude)?;

    // Check if .claude/CLAUDE.md exists - if so, write there
    let claude_dir = root.join(".claude");
    let claude_file = claude_dir.join("CLAUDE.md");
    if claude_file.exists() {
        return write_with_policy(&claude_dir, policy, content);
    }

    // Otherwise write to root/CLAUDE.md
    write_with_policy(root, policy, content)
}

pub(crate) async fn file_read_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
) -> Result<TextFileResponse, String> {
    let root = resolve_root_core(workspaces, scope, workspace_id.as_deref()).await?;

    // Special handling for CLAUDE.md in workspace scope
    if scope == FileScope::Workspace && kind == FileKind::Claude {
        return read_claude_md_with_fallback(&root);
    }

    let policy = policy_for(scope, kind)?;
    read_with_policy(&root, policy)
}

pub(crate) async fn file_write_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
) -> Result<(), String> {
    let root = resolve_root_core(workspaces, scope, workspace_id.as_deref()).await?;

    // Special handling for CLAUDE.md in workspace scope
    if scope == FileScope::Workspace && kind == FileKind::Claude {
        return write_claude_md_with_fallback(&root, &content);
    }

    let policy = policy_for(scope, kind)?;
    write_with_policy(&root, policy, &content)
}
