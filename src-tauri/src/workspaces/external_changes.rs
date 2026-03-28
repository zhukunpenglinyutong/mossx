use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::{Config as NotifyConfig, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Mutex};

const DETACHED_EXTERNAL_FILE_CHANGE_EVENT: &str = "detached-external-file-change";
const POLLING_INTERVAL_MS: u64 = 1200;
const TRANSIENT_RETRY_ATTEMPTS: usize = 3;
const TRANSIENT_RETRY_BASE_DELAY_MS: u64 = 60;
const WATCHER_DUPLICATE_DEBOUNCE_MS: u64 = 280;
const MONITOR_MODE_WATCHER: &str = "watcher";
const MONITOR_MODE_POLLING: &str = "polling";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetachedExternalMonitorStatus {
    pub(crate) mode: String,
    pub(crate) fallback_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetachedExternalFileChangeEvent {
    #[serde(rename = "workspaceId")]
    pub(crate) workspace_id: String,
    #[serde(rename = "normalizedPath")]
    pub(crate) normalized_path: String,
    #[serde(rename = "mtimeMs")]
    pub(crate) mtime_ms: Option<u64>,
    pub(crate) size: Option<u64>,
    #[serde(rename = "detectedAtMs")]
    pub(crate) detected_at_ms: u64,
    pub(crate) source: String,
    #[serde(rename = "eventKind")]
    pub(crate) event_kind: String,
    pub(crate) platform: String,
    #[serde(rename = "fallbackReason")]
    pub(crate) fallback_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileSignature {
    mtime_ms: Option<u64>,
    size: Option<u64>,
}

#[derive(Debug, Clone)]
struct MonitorConfig {
    workspace_root: PathBuf,
    active_file_relative: Option<String>,
}

struct WorkspaceExternalMonitor {
    stop_tx: Option<oneshot::Sender<()>>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub(crate) struct DetachedExternalChangeRuntime {
    monitors: HashMap<String, WorkspaceExternalMonitor>,
}

fn now_epoch_ms() -> u64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    if millis > u64::MAX as u128 {
        u64::MAX
    } else {
        millis as u64
    }
}

fn normalize_rel_path(input: &str) -> String {
    input
        .trim()
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string()
}

fn dedupe_key(path: &str) -> String {
    let normalized = normalize_rel_path(path);
    if cfg!(target_os = "windows") {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn resolve_active_relative_path(
    workspace_root: &Path,
    raw_file_path: &str,
) -> Result<String, String> {
    let trimmed = raw_file_path.trim();
    if trimmed.is_empty() {
        return Err("Active file path cannot be empty.".to_string());
    }
    let normalized_trimmed = trimmed.replace('\\', "/");
    let candidate = PathBuf::from(&normalized_trimmed);
    let relative = if candidate.is_absolute() {
        candidate
            .strip_prefix(workspace_root)
            .map_err(|_| "Active file path is outside workspace root.".to_string())?
            .to_path_buf()
    } else {
        candidate
    };
    let normalized = normalize_rel_path(&relative.to_string_lossy());
    if normalized.is_empty() {
        return Err("Active file path is invalid.".to_string());
    }
    Ok(normalized)
}

fn is_path_inside_root(path: &Path, root: &Path) -> bool {
    path.starts_with(root)
}

fn resolve_relative_event_path(workspace_root: &Path, path: &Path) -> Option<String> {
    let relative = if path.is_absolute() {
        if !is_path_inside_root(path, workspace_root) {
            return None;
        }
        path.strip_prefix(workspace_root).ok()?.to_path_buf()
    } else {
        path.to_path_buf()
    };
    let normalized = normalize_rel_path(&relative.to_string_lossy());
    if normalized.is_empty() {
        return None;
    }
    Some(normalized)
}

fn is_active_file_match(active_file_relative: Option<&str>, candidate_path: &str) -> bool {
    let Some(active) = active_file_relative else {
        return true;
    };
    dedupe_key(active) == dedupe_key(candidate_path)
}

fn event_kind_label(event: &Event) -> String {
    format!("{:?}", event.kind).to_lowercase()
}

fn normalize_workspace_root(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Workspace path cannot be empty.".to_string());
    }
    let raw = PathBuf::from(trimmed);
    if !raw.is_absolute() {
        return Err("Workspace path must be absolute.".to_string());
    }
    let canonical = raw
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace path: {err}"))?;
    if !canonical.is_dir() {
        return Err("Workspace path is not a directory.".to_string());
    }
    Ok(canonical)
}

fn is_transient_fs_error(error: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    matches!(
        error.kind(),
        ErrorKind::PermissionDenied
            | ErrorKind::WouldBlock
            | ErrorKind::Interrupted
            | ErrorKind::TimedOut
    ) || error
        .to_string()
        .to_lowercase()
        .contains("sharing violation")
}

async fn read_signature_with_retry(path: &Path) -> Result<Option<FileSignature>, std::io::Error> {
    let mut delay_ms = TRANSIENT_RETRY_BASE_DELAY_MS;
    for attempt in 0..TRANSIENT_RETRY_ATTEMPTS {
        match tokio::fs::metadata(path).await {
            Ok(metadata) => {
                if metadata.is_dir() {
                    return Ok(None);
                }
                let mtime_ms = metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| {
                        let millis = duration.as_millis();
                        if millis > u64::MAX as u128 {
                            u64::MAX
                        } else {
                            millis as u64
                        }
                    });
                return Ok(Some(FileSignature {
                    mtime_ms,
                    size: Some(metadata.len()),
                }));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None);
            }
            Err(error)
                if attempt + 1 < TRANSIENT_RETRY_ATTEMPTS && is_transient_fs_error(&error) =>
            {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                delay_ms = delay_ms.saturating_mul(2);
            }
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

fn build_event(
    workspace_id: &str,
    normalized_path: String,
    signature: Option<&FileSignature>,
    source: &str,
    event_kind: &str,
    fallback_reason: Option<String>,
) -> DetachedExternalFileChangeEvent {
    DetachedExternalFileChangeEvent {
        workspace_id: workspace_id.to_string(),
        normalized_path,
        mtime_ms: signature.and_then(|value| value.mtime_ms),
        size: signature.and_then(|value| value.size),
        detected_at_ms: now_epoch_ms(),
        source: source.to_string(),
        event_kind: event_kind.to_string(),
        platform: std::env::consts::OS.to_string(),
        fallback_reason,
    }
}

fn emit_external_change_event(app: &AppHandle, event: &DetachedExternalFileChangeEvent) {
    let _ = app.emit(DETACHED_EXTERNAL_FILE_CHANGE_EVENT, event.clone());
    eprintln!(
        "[external_changes] workspace_id={} source={} event_kind={} path={} fallback_reason={}",
        event.workspace_id,
        event.source,
        event.event_kind,
        event.normalized_path,
        event.fallback_reason.as_deref().unwrap_or("")
    );
}

async fn update_status(
    status: &Arc<Mutex<DetachedExternalMonitorStatus>>,
    mode: &str,
    reason: Option<String>,
) {
    let mut guard = status.lock().await;
    guard.mode = mode.to_string();
    guard.fallback_reason = reason;
}

fn create_workspace_watcher(
    workspace_root: &Path,
) -> Result<
    (
        RecommendedWatcher,
        mpsc::UnboundedReceiver<notify::Result<Event>>,
    ),
    String,
> {
    let (event_tx, event_rx) = mpsc::unbounded_channel::<notify::Result<Event>>();
    let mut watcher = RecommendedWatcher::new(
        move |result| {
            let _ = event_tx.send(result);
        },
        NotifyConfig::default(),
    )
    .map_err(|err| format!("Failed to initialize watcher: {err}"))?;
    watcher
        .watch(workspace_root, RecursiveMode::Recursive)
        .map_err(|err| format!("Failed to watch workspace path: {err}"))?;
    Ok((watcher, event_rx))
}

async fn handle_watcher_event(
    app: &AppHandle,
    workspace_id: &str,
    workspace_root: &Path,
    active_file_relative: Option<&str>,
    event: Event,
    snapshots: &mut HashMap<String, Option<FileSignature>>,
    last_emit_at: &mut HashMap<String, u64>,
) {
    let event_kind = event_kind_label(&event);
    for path in &event.paths {
        let Some(normalized_path) = resolve_relative_event_path(workspace_root, path) else {
            continue;
        };
        if !is_active_file_match(active_file_relative, &normalized_path) {
            continue;
        }
        let absolute_path = workspace_root.join(&normalized_path);
        let signature = match read_signature_with_retry(&absolute_path).await {
            Ok(value) => value,
            Err(error) => {
                eprintln!(
                    "[external_changes] workspace_id={} source=watcher event_kind={} path={} read_error={}",
                    workspace_id, event_kind, normalized_path, error
                );
                continue;
            }
        };
        let key = dedupe_key(&normalized_path);
        let previous = snapshots.get(&key).cloned();
        let now_ms = now_epoch_ms();
        let emitted_recently = last_emit_at
            .get(&key)
            .map(|value| now_ms.saturating_sub(*value) <= WATCHER_DUPLICATE_DEBOUNCE_MS)
            .unwrap_or(false);
        if previous == Some(signature.clone()) && emitted_recently {
            continue;
        }
        if previous == Some(signature.clone()) {
            continue;
        }
        snapshots.insert(key.clone(), signature.clone());
        last_emit_at.insert(key, now_ms);
        let payload = build_event(
            workspace_id,
            normalized_path,
            signature.as_ref(),
            MONITOR_MODE_WATCHER,
            &event_kind,
            None,
        );
        emit_external_change_event(app, &payload);
    }
}

async fn handle_polling_tick(
    app: &AppHandle,
    workspace_id: &str,
    config: &Arc<Mutex<MonitorConfig>>,
    snapshots: &mut HashMap<String, Option<FileSignature>>,
) {
    let current = config.lock().await.clone();
    let Some(active_file_relative) = current.active_file_relative else {
        return;
    };
    let key = dedupe_key(&active_file_relative);
    let absolute_path = current.workspace_root.join(&active_file_relative);
    let signature = match read_signature_with_retry(&absolute_path).await {
        Ok(value) => value,
        Err(error) => {
            eprintln!(
                "[external_changes] workspace_id={} source=polling event_kind=read-error path={} read_error={}",
                workspace_id, active_file_relative, error
            );
            return;
        }
    };
    let previous = snapshots.get(&key).cloned();
    if previous.is_none() {
        snapshots.insert(key, signature);
        return;
    }
    if previous == Some(signature.clone()) {
        return;
    }
    snapshots.insert(key, signature.clone());
    let payload = build_event(
        workspace_id,
        active_file_relative,
        signature.as_ref(),
        MONITOR_MODE_POLLING,
        "polling-detected",
        None,
    );
    emit_external_change_event(app, &payload);
}

fn emit_watcher_fallback(
    app: &AppHandle,
    workspace_id: &str,
    normalized_path: String,
    fallback_reason: String,
) {
    let payload = build_event(
        workspace_id,
        normalized_path,
        None,
        MONITOR_MODE_POLLING,
        "watcher-fallback",
        Some(fallback_reason),
    );
    emit_external_change_event(app, &payload);
}

async fn run_workspace_monitor_loop(
    app: AppHandle,
    workspace_id: String,
    config: Arc<Mutex<MonitorConfig>>,
    status: Arc<Mutex<DetachedExternalMonitorStatus>>,
    mut stop_rx: oneshot::Receiver<()>,
    mut watcher: Option<RecommendedWatcher>,
    mut watcher_rx: Option<mpsc::UnboundedReceiver<notify::Result<Event>>>,
) {
    let mut snapshots: HashMap<String, Option<FileSignature>> = HashMap::new();
    let mut last_emit_at: HashMap<String, u64> = HashMap::new();
    let mut interval = tokio::time::interval(Duration::from_millis(POLLING_INTERVAL_MS));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        let mode = status.lock().await.mode.clone();
        if mode == MONITOR_MODE_WATCHER {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                maybe_event = async {
                    if let Some(rx) = watcher_rx.as_mut() {
                        rx.recv().await
                    } else {
                        None
                    }
                } => {
                    match maybe_event {
                        Some(Ok(event)) => {
                            let current_config = config.lock().await.clone();
                            handle_watcher_event(
                                &app,
                                &workspace_id,
                                &current_config.workspace_root,
                                current_config.active_file_relative.as_deref(),
                                event,
                                &mut snapshots,
                                &mut last_emit_at,
                            ).await;
                        }
                        Some(Err(error)) => {
                            let fallback_reason = format!("watcher-delivery-error: {error}");
                            let active_path = config
                                .lock()
                                .await
                                .active_file_relative
                                .clone()
                                .unwrap_or_default();
                            update_status(&status, MONITOR_MODE_POLLING, Some(fallback_reason.clone()))
                                .await;
                            emit_watcher_fallback(&app, &workspace_id, active_path, fallback_reason);
                            watcher = None;
                            watcher_rx = None;
                        }
                        None => {
                            let fallback_reason = "watcher-channel-closed".to_string();
                            let active_path = config
                                .lock()
                                .await
                                .active_file_relative
                                .clone()
                                .unwrap_or_default();
                            update_status(&status, MONITOR_MODE_POLLING, Some(fallback_reason.clone()))
                                .await;
                            emit_watcher_fallback(&app, &workspace_id, active_path, fallback_reason);
                            watcher = None;
                            watcher_rx = None;
                        }
                    }
                }
            }
        } else {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                _ = interval.tick() => {
                    handle_polling_tick(
                        &app,
                        &workspace_id,
                        &config,
                        &mut snapshots,
                    ).await;
                }
            }
        }
    }
    drop(watcher);
}

async fn shutdown_monitor(monitor: WorkspaceExternalMonitor) {
    if let Some(stop_tx) = monitor.stop_tx {
        let _ = stop_tx.send(());
    }
    monitor.task.abort();
    let _ = monitor.task.await;
}

pub(crate) async fn configure_detached_external_change_monitor_inner(
    app: AppHandle,
    runtime: &Mutex<DetachedExternalChangeRuntime>,
    workspace_id: String,
    workspace_path: String,
    active_file_path: String,
    watcher_enabled: bool,
) -> Result<DetachedExternalMonitorStatus, String> {
    let workspace_root = normalize_workspace_root(&workspace_path)?;
    let active_file_relative = resolve_active_relative_path(&workspace_root, &active_file_path)?;

    let removed = {
        let mut runtime_guard = runtime.lock().await;
        runtime_guard.monitors.remove(workspace_id.as_str())
    };
    if let Some(monitor) = removed {
        shutdown_monitor(monitor).await;
    }

    let (watcher, watcher_rx, status) = if watcher_enabled {
        match create_workspace_watcher(&workspace_root) {
            Ok((watcher, watcher_rx)) => (
                Some(watcher),
                Some(watcher_rx),
                DetachedExternalMonitorStatus {
                    mode: MONITOR_MODE_WATCHER.to_string(),
                    fallback_reason: None,
                },
            ),
            Err(error) => (
                None,
                None,
                DetachedExternalMonitorStatus {
                    mode: MONITOR_MODE_POLLING.to_string(),
                    fallback_reason: Some(format!("watcher-init-failed: {error}")),
                },
            ),
        }
    } else {
        (
            None,
            None,
            DetachedExternalMonitorStatus {
                mode: MONITOR_MODE_POLLING.to_string(),
                fallback_reason: Some("watcher-disabled-by-setting".to_string()),
            },
        )
    };

    let monitor_config = Arc::new(Mutex::new(MonitorConfig {
        workspace_root,
        active_file_relative: Some(active_file_relative.clone()),
    }));
    let monitor_status = Arc::new(Mutex::new(status.clone()));
    let (stop_tx, stop_rx) = oneshot::channel();
    let task = tokio::spawn(run_workspace_monitor_loop(
        app.clone(),
        workspace_id.clone(),
        monitor_config,
        monitor_status.clone(),
        stop_rx,
        watcher,
        watcher_rx,
    ));

    {
        let mut runtime_guard = runtime.lock().await;
        runtime_guard.monitors.insert(
            workspace_id.clone(),
            WorkspaceExternalMonitor {
                stop_tx: Some(stop_tx),
                task,
            },
        );
    }

    if let Some(reason) = status.fallback_reason.clone() {
        emit_watcher_fallback(&app, &workspace_id, active_file_relative, reason);
    }

    Ok(status)
}

pub(crate) async fn clear_detached_external_change_monitor_inner(
    runtime: &Mutex<DetachedExternalChangeRuntime>,
    workspace_id: String,
) -> Result<(), String> {
    let removed = {
        let mut runtime_guard = runtime.lock().await;
        runtime_guard.monitors.remove(workspace_id.as_str())
    };
    if let Some(monitor) = removed {
        shutdown_monitor(monitor).await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        dedupe_key, is_active_file_match, normalize_rel_path, resolve_active_relative_path,
    };
    use std::path::Path;

    #[test]
    fn external_changes_normalize_rel_path_basic() {
        assert_eq!(normalize_rel_path("./src\\main.ts"), "src/main.ts");
        assert_eq!(normalize_rel_path("src/main.ts"), "src/main.ts");
    }

    #[test]
    fn external_changes_resolve_active_relative_path() {
        let workspace = Path::new("/repo/demo");
        let result = resolve_active_relative_path(workspace, "src/main.ts").expect("relative path");
        assert_eq!(result, "src/main.ts");
    }

    #[test]
    fn external_changes_active_file_match_normalizes_path_shape() {
        assert!(is_active_file_match(Some("src\\main.ts"), "src/main.ts"));
        assert!(!is_active_file_match(Some("src/main.ts"), "src/other.ts"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn external_changes_dedupe_key_is_case_insensitive_on_windows() {
        assert_eq!(dedupe_key("SRC/Main.ts"), "src/main.ts");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn external_changes_dedupe_key_preserves_case_on_non_windows() {
        assert_eq!(dedupe_key("SRC/Main.ts"), "SRC/Main.ts");
    }
}
