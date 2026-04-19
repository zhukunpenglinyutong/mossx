use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::engine;
use crate::local_usage;
use crate::shared::codex_core;
use crate::state::AppState;
use crate::storage::{read_json_file, write_json_file};
use crate::types::WorkspaceEntry;

const SESSION_CATALOG_DEFAULT_LIMIT: usize = 50;
const SESSION_CATALOG_MAX_LIMIT: usize = 200;
const SESSION_CATALOG_ARCHIVE_TIMEOUT_MS: u64 = 1_500;
const SESSION_CATALOG_CURSOR_PREFIX: &str = "offset:";
const SESSION_CATALOG_PARTIAL_CODEX: &str = "codex-history-unavailable";
const SESSION_CATALOG_PARTIAL_CLAUDE: &str = "claude-history-unavailable";
const SESSION_CATALOG_PARTIAL_GEMINI: &str = "gemini-history-unavailable";
const SESSION_CATALOG_PARTIAL_OPENCODE: &str = "opencode-history-unavailable";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSessionCatalogEntry {
    pub(crate) session_id: String,
    pub(crate) workspace_id: String,
    pub(crate) engine: String,
    pub(crate) title: String,
    pub(crate) updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) archived_at: Option<i64>,
    pub(crate) thread_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSessionCatalogQuery {
    #[serde(default)]
    pub(crate) keyword: Option<String>,
    #[serde(default)]
    pub(crate) engine: Option<String>,
    #[serde(default)]
    pub(crate) status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSessionCatalogPage {
    pub(crate) data: Vec<WorkspaceSessionCatalogEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next_cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) partial_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSessionBatchMutationResult {
    pub(crate) session_id: String,
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) archived_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSessionBatchMutationResponse {
    pub(crate) results: Vec<WorkspaceSessionBatchMutationResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSessionCatalogMetadata {
    #[serde(default)]
    archived_at_by_session_id: HashMap<String, i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionCatalogStatusFilter {
    Active,
    Archived,
    All,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum SessionCatalogIdentity {
    Codex { session_id: String },
    Claude { session_id: String },
    Gemini { session_id: String },
    OpenCode { session_id: String },
    Shared { session_id: String },
}

#[tauri::command]
pub(crate) async fn list_workspace_sessions(
    workspace_id: String,
    query: Option<WorkspaceSessionCatalogQuery>,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<WorkspaceSessionCatalogPage, String> {
    list_workspace_sessions_core(
        &state.workspaces,
        &state.sessions,
        &state.engine_manager,
        state.storage_path.as_path(),
        workspace_id,
        query,
        cursor,
        limit,
    )
    .await
}

#[tauri::command]
pub(crate) async fn archive_workspace_sessions(
    workspace_id: String,
    session_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<WorkspaceSessionBatchMutationResponse, String> {
    archive_workspace_sessions_core(
        &state.workspaces,
        &state.sessions,
        state.storage_path.as_path(),
        workspace_id,
        session_ids,
    )
    .await
}

#[tauri::command]
pub(crate) async fn unarchive_workspace_sessions(
    workspace_id: String,
    session_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<WorkspaceSessionBatchMutationResponse, String> {
    unarchive_workspace_sessions_core(
        &state.workspaces,
        state.storage_path.as_path(),
        workspace_id,
        session_ids,
    )
    .await
}

#[tauri::command]
pub(crate) async fn delete_workspace_sessions(
    workspace_id: String,
    session_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<WorkspaceSessionBatchMutationResponse, String> {
    delete_workspace_sessions_core(
        &state.workspaces,
        &state.sessions,
        &state.engine_manager,
        state.storage_path.as_path(),
        workspace_id,
        session_ids,
    )
    .await
}

pub(crate) async fn list_workspace_sessions_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    _sessions: &Mutex<HashMap<String, std::sync::Arc<crate::codex::WorkspaceSession>>>,
    engine_manager: &engine::EngineManager,
    storage_path: &Path,
    workspace_id: String,
    query: Option<WorkspaceSessionCatalogQuery>,
    cursor: Option<String>,
    limit: Option<u32>,
) -> Result<WorkspaceSessionCatalogPage, String> {
    let workspace_id = normalize_workspace_id(&workspace_id)?;
    let workspace_path = workspace_path_for_id(workspaces, &workspace_id).await?;
    let metadata = read_catalog_metadata(storage_path, &workspace_id)?;
    let mut partial_sources = Vec::new();
    let mut entries = Vec::new();

    match local_usage::list_codex_session_summaries_for_workspace(workspaces, &workspace_id, usize::MAX).await {
        Ok((_, sessions)) => {
            entries.extend(sessions.into_iter().map(|summary| {
                let session_id = summary.session_id.clone();
                let archived_at = metadata.archived_at_by_session_id.get(&session_id).copied();
                let source_label = build_source_label(summary.source.as_deref(), summary.provider.as_deref());
                WorkspaceSessionCatalogEntry {
                    session_id,
                    workspace_id: workspace_id.clone(),
                    engine: "codex".to_string(),
                    title: summary.summary.unwrap_or_else(|| "Codex Session".to_string()),
                    updated_at: summary.timestamp.max(0),
                    archived_at,
                    thread_kind: "native".to_string(),
                    source: summary.source,
                    source_label,
                    size_bytes: summary.file_size_bytes,
                }
            }));
        }
        Err(error) => {
            log::warn!(
                "[session_management.list_workspace_sessions] codex history unavailable for workspace {}: {}",
                workspace_id,
                error
            );
            partial_sources.push(SESSION_CATALOG_PARTIAL_CODEX.to_string());
        }
    }

    match engine::claude_history::list_claude_sessions(&workspace_path, None).await {
        Ok(claude_sessions) => {
            entries.extend(claude_sessions.into_iter().map(|session| {
                let session_id = format!("claude:{}", session.session_id);
                WorkspaceSessionCatalogEntry {
                    archived_at: metadata.archived_at_by_session_id.get(&session_id).copied(),
                    session_id,
                    workspace_id: workspace_id.clone(),
                    engine: "claude".to_string(),
                    title: session.first_message,
                    updated_at: session.updated_at.max(0),
                    thread_kind: "native".to_string(),
                    source: None,
                    source_label: None,
                    size_bytes: session.file_size_bytes,
                }
            }));
        }
        Err(error) => {
            log::warn!(
                "[session_management.list_workspace_sessions] claude history unavailable for workspace {}: {}",
                workspace_id,
                error
            );
            partial_sources.push(SESSION_CATALOG_PARTIAL_CLAUDE.to_string());
        }
    }

    let gemini_config = engine_manager.get_engine_config(engine::EngineType::Gemini).await;
    match engine::gemini_history::list_gemini_sessions(
        &workspace_path,
        None,
        gemini_config.as_ref().and_then(|item| item.home_dir.as_deref()),
    )
    .await
    {
        Ok(gemini_sessions) => {
            entries.extend(gemini_sessions.into_iter().map(|session| {
                let session_id = format!("gemini:{}", session.session_id);
                WorkspaceSessionCatalogEntry {
                    archived_at: metadata.archived_at_by_session_id.get(&session_id).copied(),
                    session_id,
                    workspace_id: workspace_id.clone(),
                    engine: "gemini".to_string(),
                    title: session.first_message,
                    updated_at: session.updated_at.max(0),
                    thread_kind: "native".to_string(),
                    source: None,
                    source_label: None,
                    size_bytes: session.file_size_bytes,
                }
            }));
        }
        Err(error) => {
            log::warn!(
                "[session_management.list_workspace_sessions] gemini history unavailable for workspace {}: {}",
                workspace_id,
                error
            );
            partial_sources.push(SESSION_CATALOG_PARTIAL_GEMINI.to_string());
        }
    }

    match engine::commands::opencode_session_list_core(workspaces, engine_manager, &workspace_id).await {
        Ok(opencode_sessions) => {
            entries.extend(opencode_sessions.into_iter().map(|session| {
                let session_id = format!("opencode:{}", session.session_id);
                WorkspaceSessionCatalogEntry {
                    archived_at: metadata.archived_at_by_session_id.get(&session_id).copied(),
                    session_id,
                    workspace_id: workspace_id.clone(),
                    engine: "opencode".to_string(),
                    title: session.title,
                    updated_at: session.updated_at.unwrap_or(0).max(0),
                    thread_kind: "native".to_string(),
                    source: None,
                    source_label: None,
                    size_bytes: None,
                }
            }));
        }
        Err(error) => {
            log::warn!(
                "[session_management.list_workspace_sessions] opencode history unavailable for workspace {}: {}",
                workspace_id,
                error
            );
            partial_sources.push(SESSION_CATALOG_PARTIAL_OPENCODE.to_string());
        }
    }

    let normalized_query = query.unwrap_or_default();
    let status_filter = parse_status_filter(normalized_query.status.as_deref());
    let keyword = normalized_query
        .keyword
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase());
    let engine_filter = normalized_query
        .engine
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase());

    let mut deduped = Vec::new();
    let mut seen_ids = HashSet::new();
    for entry in entries {
        if !seen_ids.insert(entry.session_id.clone()) {
            continue;
        }
        if let Some(filter) = engine_filter.as_deref() {
            if entry.engine != filter {
                continue;
            }
        }
        match status_filter {
            SessionCatalogStatusFilter::Active if entry.archived_at.is_some() => continue,
            SessionCatalogStatusFilter::Archived if entry.archived_at.is_none() => continue,
            _ => {}
        }
        if let Some(keyword) = keyword.as_deref() {
            if !entry_matches_keyword(&entry, keyword) {
                continue;
            }
        }
        deduped.push(entry);
    }

    deduped.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.session_id.cmp(&right.session_id))
    });

    let limit = limit
        .unwrap_or(SESSION_CATALOG_DEFAULT_LIMIT as u32)
        .clamp(1, SESSION_CATALOG_MAX_LIMIT as u32) as usize;
    let offset = parse_catalog_cursor(cursor.as_deref());
    let data: Vec<WorkspaceSessionCatalogEntry> = deduped
        .iter()
        .skip(offset)
        .take(limit)
        .cloned()
        .collect();
    let next_cursor = if offset + data.len() < deduped.len() {
        Some(build_catalog_cursor(offset + data.len()))
    } else {
        None
    };

    Ok(WorkspaceSessionCatalogPage {
        data,
        next_cursor,
        partial_source: join_partial_sources(partial_sources),
    })
}

pub(crate) async fn archive_workspace_sessions_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, std::sync::Arc<crate::codex::WorkspaceSession>>>,
    storage_path: &Path,
    workspace_id: String,
    session_ids: Vec<String>,
) -> Result<WorkspaceSessionBatchMutationResponse, String> {
    let workspace_id = normalize_workspace_id(&workspace_id)?;
    let _workspace_path = workspace_path_for_id(workspaces, &workspace_id).await?;
    let mut metadata = read_catalog_metadata(storage_path, &workspace_id)?;
    let archived_at = now_millis();
    let mut results = Vec::new();

    for session_id in normalize_session_ids(session_ids)? {
        match parse_catalog_identity(&session_id) {
            SessionCatalogIdentity::Shared { .. } => {
                results.push(batch_error(
                    session_id,
                    "UNSUPPORTED_SHARED_SESSION",
                    "Shared sessions are not supported in phase-one archive management",
                ));
            }
            SessionCatalogIdentity::Codex { session_id: raw_id } => {
                let _ = codex_core::archive_thread_best_effort_core(
                    sessions,
                    workspace_id.clone(),
                    raw_id,
                    Duration::from_millis(SESSION_CATALOG_ARCHIVE_TIMEOUT_MS),
                )
                .await;
                metadata
                    .archived_at_by_session_id
                    .insert(session_id.clone(), archived_at);
                results.push(batch_success(session_id, Some(archived_at)));
            }
            _ => {
                metadata
                    .archived_at_by_session_id
                    .insert(session_id.clone(), archived_at);
                results.push(batch_success(session_id, Some(archived_at)));
            }
        }
    }

    write_catalog_metadata(storage_path, &workspace_id, &metadata)?;
    Ok(WorkspaceSessionBatchMutationResponse { results })
}

pub(crate) async fn unarchive_workspace_sessions_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    storage_path: &Path,
    workspace_id: String,
    session_ids: Vec<String>,
) -> Result<WorkspaceSessionBatchMutationResponse, String> {
    let workspace_id = normalize_workspace_id(&workspace_id)?;
    let _workspace_path = workspace_path_for_id(workspaces, &workspace_id).await?;
    let mut metadata = read_catalog_metadata(storage_path, &workspace_id)?;
    let mut results = Vec::new();

    for session_id in normalize_session_ids(session_ids)? {
        if metadata.archived_at_by_session_id.remove(&session_id).is_some() {
            results.push(batch_success(session_id, None));
        } else {
            results.push(batch_error(
                session_id,
                "NOT_ARCHIVED",
                "Session is not archived",
            ));
        }
    }

    write_catalog_metadata(storage_path, &workspace_id, &metadata)?;
    Ok(WorkspaceSessionBatchMutationResponse { results })
}

pub(crate) async fn delete_workspace_sessions_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, std::sync::Arc<crate::codex::WorkspaceSession>>>,
    engine_manager: &engine::EngineManager,
    storage_path: &Path,
    workspace_id: String,
    session_ids: Vec<String>,
) -> Result<WorkspaceSessionBatchMutationResponse, String> {
    let workspace_id = normalize_workspace_id(&workspace_id)?;
    let workspace_path = workspace_path_for_id(workspaces, &workspace_id).await?;
    let mut metadata = read_catalog_metadata(storage_path, &workspace_id)?;
    let normalized_session_ids = normalize_session_ids(session_ids)?;
    let ordered_session_ids = normalized_session_ids.clone();
    let mut results = Vec::new();

    let mut codex_session_ids = Vec::new();
    let mut other_identities = Vec::new();

    for session_id in normalized_session_ids {
        match parse_catalog_identity(&session_id) {
            SessionCatalogIdentity::Codex { session_id: raw_id } => {
                codex_session_ids.push((session_id, raw_id));
            }
            identity => other_identities.push((session_id, identity)),
        }
    }

    let mut results_by_session_id: HashMap<String, WorkspaceSessionBatchMutationResult> = HashMap::new();

    if !codex_session_ids.is_empty() {
        let raw_ids: Vec<String> = codex_session_ids
            .iter()
            .map(|(_, raw_id)| raw_id.clone())
            .collect();
        let delete_results =
            local_usage::delete_codex_sessions_for_workspace(workspaces, &workspace_id, &raw_ids)
                .await?;
        let results_by_raw_id: HashMap<_, _> = delete_results
            .into_iter()
            .map(|result| (result.session_id.clone(), result))
            .collect();

        for (session_id, raw_id) in codex_session_ids {
            match results_by_raw_id.get(&raw_id) {
                Some(result) if result.deleted => {
                    metadata.archived_at_by_session_id.remove(&session_id);
                    results_by_session_id
                        .insert(session_id.clone(), batch_success(session_id, None));
                }
                Some(result) => {
                    results_by_session_id.insert(
                        session_id.clone(),
                        batch_error(
                            session_id,
                            "DELETE_FAILED",
                            result
                                .error
                                .as_deref()
                                .unwrap_or("Failed to delete Codex session"),
                        ),
                    );
                }
                None => {
                    results_by_session_id.insert(
                        session_id.clone(),
                        batch_error(session_id, "DELETE_FAILED", "Missing Codex delete result"),
                    );
                }
            }
        }
    }

    let gemini_home_dir = engine_manager
        .get_engine_config(engine::EngineType::Gemini)
        .await
        .and_then(|item| item.home_dir);
    let mut async_delete_handles: Vec<(String, JoinHandle<Result<(), String>>)> = Vec::new();

    for (session_id, identity) in other_identities {
        match identity {
            SessionCatalogIdentity::Claude { session_id: raw_id } => {
                let workspace_path = workspace_path.clone();
                let session_id_for_handle = session_id.clone();
                let handle = tokio::spawn(async move {
                    engine::claude_history::delete_claude_session(&workspace_path, &raw_id)
                        .await
                        .map(|_| ())
                });
                async_delete_handles.push((session_id_for_handle, handle));
            }
            SessionCatalogIdentity::Gemini { session_id: raw_id } => {
                let workspace_path = workspace_path.clone();
                let gemini_home_dir = gemini_home_dir.clone();
                let session_id_for_handle = session_id.clone();
                let handle = tokio::spawn(async move {
                    engine::gemini_history::delete_gemini_session(
                        &workspace_path,
                        &raw_id,
                        gemini_home_dir.as_deref(),
                    )
                    .await
                });
                async_delete_handles.push((session_id_for_handle, handle));
            }
            SessionCatalogIdentity::OpenCode { session_id: raw_id } => {
                let deletion = engine::commands::opencode_delete_session_core(
                    workspaces,
                    engine_manager,
                    &workspace_id,
                    &raw_id,
                )
                .await
                .map(|_| ());
                match deletion {
                    Ok(()) => {
                        metadata.archived_at_by_session_id.remove(&session_id);
                        results_by_session_id
                            .insert(session_id.clone(), batch_success(session_id, None));
                    }
                    Err(error) => {
                        results_by_session_id.insert(
                            session_id.clone(),
                            batch_error(session_id, "DELETE_FAILED", &error),
                        );
                    }
                }
            }
            SessionCatalogIdentity::Shared { .. } => {
                results_by_session_id.insert(
                    session_id.clone(),
                    batch_error(
                        session_id,
                        "DELETE_FAILED",
                        "Shared sessions are not supported in phase-one delete management",
                    ),
                );
            }
            SessionCatalogIdentity::Codex { .. } => unreachable!(),
        }
    }

    for (session_id, handle) in async_delete_handles {
        match handle.await {
            Ok(Ok(())) => {
                metadata.archived_at_by_session_id.remove(&session_id);
                results_by_session_id.insert(session_id.clone(), batch_success(session_id, None));
            }
            Ok(Err(error)) => {
                results_by_session_id.insert(
                    session_id.clone(),
                    batch_error(session_id, "DELETE_FAILED", &error),
                );
            }
            Err(error) => {
                log::warn!(
                    "[session_management.delete_workspace_sessions] async delete task join error for workspace {}: {}",
                    workspace_id,
                    error
                );
                results_by_session_id.insert(
                    session_id.clone(),
                    batch_error(session_id, "DELETE_FAILED", "Async delete task join error"),
                );
            }
        }
    }

    for session_id in ordered_session_ids {
        if let Some(result) = results_by_session_id.remove(&session_id) {
            results.push(result);
        }
    }

    write_catalog_metadata(storage_path, &workspace_id, &metadata)?;
    let _ = sessions;
    Ok(WorkspaceSessionBatchMutationResponse { results })
}

fn batch_success(
    session_id: String,
    archived_at: Option<i64>,
) -> WorkspaceSessionBatchMutationResult {
    WorkspaceSessionBatchMutationResult {
        session_id,
        ok: true,
        archived_at,
        error: None,
        code: None,
    }
}

fn batch_error(
    session_id: String,
    code: &str,
    error: &str,
) -> WorkspaceSessionBatchMutationResult {
    WorkspaceSessionBatchMutationResult {
        session_id,
        ok: false,
        archived_at: None,
        error: Some(error.to_string()),
        code: Some(code.to_string()),
    }
}

fn normalize_workspace_id(workspace_id: &str) -> Result<String, String> {
    let normalized = workspace_id.trim();
    if normalized.is_empty() {
        return Err("workspace_id is required".to_string());
    }
    Ok(normalized.to_string())
}

fn normalize_session_ids(session_ids: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();
    for session_id in session_ids {
        let trimmed = session_id.trim();
        if trimmed.is_empty() {
            return Err("session_ids must not contain empty values".to_string());
        }
        if seen.insert(trimmed.to_string()) {
            normalized.push(trimmed.to_string());
        }
    }
    Ok(normalized)
}

async fn workspace_path_for_id(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    workspaces
        .get(workspace_id)
        .map(|entry| PathBuf::from(&entry.path))
        .ok_or_else(|| "workspace not found".to_string())
}

fn parse_catalog_identity(session_id: &str) -> SessionCatalogIdentity {
    if let Some(raw_id) = session_id.strip_prefix("claude:") {
        return SessionCatalogIdentity::Claude {
            session_id: raw_id.to_string(),
        };
    }
    if let Some(raw_id) = session_id.strip_prefix("gemini:") {
        return SessionCatalogIdentity::Gemini {
            session_id: raw_id.to_string(),
        };
    }
    if let Some(raw_id) = session_id.strip_prefix("opencode:") {
        return SessionCatalogIdentity::OpenCode {
            session_id: raw_id.to_string(),
        };
    }
    if let Some(raw_id) = session_id.strip_prefix("shared:") {
        return SessionCatalogIdentity::Shared {
            session_id: raw_id.to_string(),
        };
    }
    SessionCatalogIdentity::Codex {
        session_id: session_id.to_string(),
    }
}

fn catalog_metadata_path(storage_path: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    let data_dir = storage_path
        .parent()
        .ok_or_else(|| format!("storage path has no parent: {}", storage_path.display()))?;
    Ok(data_dir
        .join("session-management")
        .join("workspaces")
        .join(format!("{workspace_id}.json")))
}

fn read_catalog_metadata(
    storage_path: &Path,
    workspace_id: &str,
) -> Result<WorkspaceSessionCatalogMetadata, String> {
    let path = catalog_metadata_path(storage_path, workspace_id)?;
    Ok(read_json_file::<WorkspaceSessionCatalogMetadata>(&path)?.unwrap_or_default())
}

fn write_catalog_metadata(
    storage_path: &Path,
    workspace_id: &str,
    metadata: &WorkspaceSessionCatalogMetadata,
) -> Result<(), String> {
    let path = catalog_metadata_path(storage_path, workspace_id)?;
    write_json_file(&path, metadata)
}

fn parse_status_filter(value: Option<&str>) -> SessionCatalogStatusFilter {
    match value.map(str::trim).unwrap_or("").to_ascii_lowercase().as_str() {
        "archived" => SessionCatalogStatusFilter::Archived,
        "all" => SessionCatalogStatusFilter::All,
        _ => SessionCatalogStatusFilter::Active,
    }
}

fn parse_catalog_cursor(cursor: Option<&str>) -> usize {
    let Some(raw_cursor) = cursor.map(str::trim).filter(|value| !value.is_empty()) else {
        return 0;
    };
    if let Some(raw_offset) = raw_cursor.strip_prefix(SESSION_CATALOG_CURSOR_PREFIX) {
        return raw_offset.parse::<usize>().unwrap_or(0);
    }
    raw_cursor.parse::<usize>().unwrap_or(0)
}

fn build_catalog_cursor(offset: usize) -> String {
    format!("{SESSION_CATALOG_CURSOR_PREFIX}{offset}")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis() as i64
}

fn join_partial_sources(partial_sources: Vec<String>) -> Option<String> {
    let mut deduped = partial_sources;
    deduped.sort();
    deduped.dedup();
    if deduped.is_empty() {
        None
    } else {
        Some(deduped.join(","))
    }
}

fn build_source_label(source: Option<&str>, provider: Option<&str>) -> Option<String> {
    match (
        source.map(str::trim).filter(|value| !value.is_empty()),
        provider.map(str::trim).filter(|value| !value.is_empty()),
    ) {
        (Some(source), Some(provider)) => Some(format!("{source}/{provider}")),
        (Some(source), None) => Some(source.to_string()),
        (None, Some(provider)) => Some(provider.to_string()),
        (None, None) => None,
    }
}

fn entry_matches_keyword(entry: &WorkspaceSessionCatalogEntry, keyword: &str) -> bool {
    let title = entry.title.to_lowercase();
    let session_id = entry.session_id.to_lowercase();
    let source = entry
        .source
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_default();
    let source_label = entry
        .source_label
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_default();
    title.contains(keyword)
        || session_id.contains(keyword)
        || source.contains(keyword)
        || source_label.contains(keyword)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn parses_prefixed_cursor() {
        assert_eq!(parse_catalog_cursor(Some("offset:25")), 25);
        assert_eq!(parse_catalog_cursor(Some("bad")), 0);
    }

    #[test]
    fn parses_catalog_identity_by_engine_prefix() {
        assert_eq!(
            parse_catalog_identity("claude:abc"),
            SessionCatalogIdentity::Claude {
                session_id: "abc".to_string()
            }
        );
        assert_eq!(
            parse_catalog_identity("plain-codex-id"),
            SessionCatalogIdentity::Codex {
                session_id: "plain-codex-id".to_string()
            }
        );
    }

    #[test]
    fn writes_and_reads_catalog_metadata_roundtrip() {
        let base = std::env::temp_dir().join(format!("session-catalog-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&base).expect("create temp dir");
        let storage_path = base.join("workspaces.json");
        std::fs::write(&storage_path, "[]").expect("seed storage path");

        let metadata = WorkspaceSessionCatalogMetadata {
            archived_at_by_session_id: HashMap::from([("claude:1".to_string(), 42_i64)]),
        };

        write_catalog_metadata(&storage_path, "ws-1", &metadata).expect("write metadata");
        let loaded = read_catalog_metadata(&storage_path, "ws-1").expect("read metadata");
        assert_eq!(loaded.archived_at_by_session_id.get("claude:1").copied(), Some(42));

        std::fs::remove_dir_all(base).ok();
    }

    #[test]
    fn keyword_match_includes_source_fields() {
        let entry = WorkspaceSessionCatalogEntry {
            session_id: "codex:abc".to_string(),
            workspace_id: "ws-1".to_string(),
            engine: "codex".to_string(),
            title: "Example session".to_string(),
            updated_at: 1,
            archived_at: None,
            thread_kind: "native".to_string(),
            source: Some("cli".to_string()),
            source_label: Some("cli/codex".to_string()),
            size_bytes: None,
        };

        assert!(entry_matches_keyword(&entry, "example"));
        assert!(entry_matches_keyword(&entry, "codex"));
        assert!(entry_matches_keyword(&entry, "cli/codex"));
    }
}
