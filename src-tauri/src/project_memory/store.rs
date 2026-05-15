use chrono::Utc;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::app_paths;

use super::{ProjectMemoryItem, ProjectMemorySettings};

const DATE_FILE_SHARD_BYTES: u64 = 2 * 1024 * 1024;

static FILE_LOCK: Mutex<()> = Mutex::new(());

fn with_file_lock<T>(op: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = FILE_LOCK
        .lock()
        .map_err(|e| format!("file lock poisoned: {e}"))?;
    op()
}

pub(super) async fn run_project_memory_io<T>(
    op: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(move || with_file_lock(op))
        .await
        .map_err(|err| format!("project memory task failed: {err}"))?
}

pub(super) fn storage_dir() -> Result<PathBuf, String> {
    app_paths::project_memory_dir()
}

pub(super) fn settings_path() -> Result<PathBuf, String> {
    Ok(storage_dir()?.join("settings.json"))
}

// ── S2: 路径辅助函数 ──────────────────────────────────────────

/// 项目名 → 合法目录名 slug（小写、空格转 `-`、去特殊字符、截取前 50 字符）
pub(super) fn slugify_workspace_name(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c == ' ' || c == '/' || c == '\\' {
                '-'
            } else {
                '_'
            }
        })
        .collect();
    // 合并连续的 '-' 和 '_'，去掉首尾
    let trimmed: String = slug
        .split(|c: char| c == '-' || c == '_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-");
    let truncated: String = trimmed.chars().take(50).collect();
    if truncated.is_empty() {
        "unnamed".to_string()
    } else {
        truncated
    }
}

/// 构造 workspace 目录路径：`{slug}--{workspace_id 前 8 位}/`
pub(super) fn workspace_dir_path(
    base: &std::path::Path,
    workspace_id: &str,
    workspace_name: Option<&str>,
) -> PathBuf {
    let uuid_prefix = &workspace_id[..workspace_id.len().min(8)];
    let slug = workspace_name
        .map(slugify_workspace_name)
        .unwrap_or_else(|| "unnamed".to_string());
    base.join(format!("{slug}--{uuid_prefix}"))
}

/// 扫描 storage_dir 找到 `*--{workspace_id 前 8 位}` 目录（项目改名也能找到）
pub(super) fn resolve_workspace_dir(workspace_id: &str) -> Result<Option<PathBuf>, String> {
    let base = storage_dir()?;
    if !base.exists() {
        return Ok(None);
    }
    let uuid_prefix = &workspace_id[..workspace_id.len().min(8)];
    let suffix = format!("--{uuid_prefix}");
    let entries = std::fs::read_dir(&base).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(&suffix) {
                    return Ok(Some(path));
                }
            }
        }
    }
    Ok(None)
}

/// 日期文件路径，如 `ws_dir/2026-02-10.json`
pub(super) fn date_file_path(ws_dir: &std::path::Path, date_str: &str) -> PathBuf {
    ws_dir.join(format!("{date_str}.json"))
}

fn date_shard_file_path(ws_dir: &std::path::Path, date_str: &str, shard_index: u32) -> PathBuf {
    if shard_index == 0 {
        return date_file_path(ws_dir, date_str);
    }
    ws_dir.join(format!("{date_str}.{shard_index:03}.json"))
}

fn date_file_shard_index(file_name: &str, date_str: &str) -> Option<u32> {
    if file_name == format!("{date_str}.json") {
        return Some(0);
    }
    let prefix = format!("{date_str}.");
    let suffix = ".json";
    if !file_name.starts_with(&prefix) || !file_name.ends_with(suffix) {
        return None;
    }
    let shard = &file_name[prefix.len()..file_name.len() - suffix.len()];
    if shard.len() != 3 || !shard.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    shard.parse::<u32>().ok().filter(|value| *value > 0)
}

fn is_memory_date_file(path: &std::path::Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let Some((date_str, _)) = file_name.split_once('.') else {
        return false;
    };
    date_str.len() == 10
        && date_str.as_bytes().get(4) == Some(&b'-')
        && date_str.as_bytes().get(7) == Some(&b'-')
        && date_str
            .chars()
            .enumerate()
            .all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit())
        && date_file_shard_index(file_name, date_str).is_some()
}

pub(super) fn date_file_path_for_append_with_limit(
    ws_dir: &std::path::Path,
    date_str: &str,
    max_bytes: u64,
) -> Result<PathBuf, String> {
    if !ws_dir.exists() {
        return Ok(date_file_path(ws_dir, date_str));
    }
    let mut candidates: Vec<(u32, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(ws_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(shard_index) = date_file_shard_index(file_name, date_str) else {
            continue;
        };
        candidates.push((shard_index, path));
    }
    candidates.sort_by_key(|(index, _)| *index);
    let Some((last_index, last_path)) = candidates.last() else {
        return Ok(date_file_path(ws_dir, date_str));
    };
    let last_size = std::fs::metadata(last_path)
        .map_err(|e| e.to_string())?
        .len();
    if last_size < max_bytes {
        return Ok(last_path.clone());
    }
    Ok(date_shard_file_path(ws_dir, date_str, last_index + 1))
}

pub(super) fn date_file_path_for_append(
    ws_dir: &std::path::Path,
    date_str: &str,
) -> Result<PathBuf, String> {
    date_file_path_for_append_with_limit(ws_dir, date_str, DATE_FILE_SHARD_BYTES)
}

/// 当前 UTC 日期字符串，格式 `YYYY-MM-DD`
pub(super) fn today_str() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

/// 从 `created_at` 毫秒时间戳提取日期字符串
pub(super) fn date_str_from_ms(timestamp_ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(timestamp_ms)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| today_str())
}

// ── S3: 日期文件读写 ──────────────────────────────────────────

/// 读取单个日期文件，不存在时返回空 Vec
pub(super) fn read_date_file(path: &std::path::Path) -> Result<Vec<ProjectMemoryItem>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub(super) fn write_json_file_atomic(path: &std::path::Path, raw: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| "target path has no parent directory".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "target path has invalid file name".to_string())?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));
    {
        let mut temp_file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|e| e.to_string())?;
        temp_file
            .write_all(raw.as_bytes())
            .map_err(|e| e.to_string())?;
        temp_file.sync_all().map_err(|e| e.to_string())?;
    }
    replace_with_temp_file(&temp_path, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&temp_path);
    })
}

#[cfg(not(target_os = "windows"))]
fn replace_with_temp_file(
    temp_path: &std::path::Path,
    target_path: &std::path::Path,
) -> Result<(), String> {
    std::fs::rename(temp_path, target_path).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn replace_with_temp_file(
    temp_path: &std::path::Path,
    target_path: &std::path::Path,
) -> Result<(), String> {
    let parent = target_path
        .parent()
        .ok_or_else(|| "target path has no parent directory".to_string())?;
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "target path has invalid file name".to_string())?;
    let backup_path = parent.join(format!(".{file_name}.{}.bak", uuid::Uuid::new_v4()));
    let had_existing = target_path.exists();
    if had_existing {
        std::fs::rename(target_path, &backup_path).map_err(|e| e.to_string())?;
    }
    match std::fs::rename(temp_path, target_path) {
        Ok(()) => {
            if had_existing {
                let _ = std::fs::remove_file(&backup_path);
            }
            Ok(())
        }
        Err(err) => {
            if had_existing && !target_path.exists() && backup_path.exists() {
                let _ = std::fs::rename(&backup_path, target_path);
            }
            Err(err.to_string())
        }
    }
}

/// 写入单个日期文件（整体覆盖）
pub(super) fn write_date_file(
    path: &std::path::Path,
    items: &[ProjectMemoryItem],
) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    write_json_file_atomic(path, &raw)
}

/// 聚合 workspace 目录下全部 `*.json` 的记忆（排除非日期文件）
pub(super) fn read_workspace_memories(
    ws_dir: &std::path::Path,
) -> Result<Vec<ProjectMemoryItem>, String> {
    if !ws_dir.exists() {
        return Ok(Vec::new());
    }
    let mut all: Vec<ProjectMemoryItem> = Vec::new();
    let entries = std::fs::read_dir(ws_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if is_memory_date_file(&path) {
            match read_date_file(&path) {
                Ok(items) => all.extend(items),
                Err(err) => {
                    log::warn!(
                        "Skipping unreadable project memory file {:?}: {}",
                        path,
                        err
                    );
                }
            }
        }
    }
    Ok(all)
}

/// 按 id 在 workspace 目录中查找记忆，返回 (日期文件路径, 该文件全部 items)
pub(super) fn find_memory_in_workspace(
    ws_dir: &std::path::Path,
    memory_id: &str,
) -> Result<Option<(PathBuf, Vec<ProjectMemoryItem>)>, String> {
    if !ws_dir.exists() {
        return Ok(None);
    }
    let entries = std::fs::read_dir(ws_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if is_memory_date_file(&path) {
            let items = match read_date_file(&path) {
                Ok(items) => items,
                Err(err) => {
                    log::warn!(
                        "Skipping unreadable project memory file {:?}: {}",
                        path,
                        err
                    );
                    continue;
                }
            };
            if items.iter().any(|item| item.id == memory_id) {
                return Ok(Some((path, items)));
            }
        }
    }
    Ok(None)
}

pub(super) fn find_turn_memory_in_workspace(
    ws_dir: &std::path::Path,
    workspace_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> Result<Option<(PathBuf, Vec<ProjectMemoryItem>, usize)>, String> {
    if !ws_dir.exists() {
        return Ok(None);
    }
    let entries = std::fs::read_dir(ws_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !is_memory_date_file(&path) {
            continue;
        }
        let items = match read_date_file(&path) {
            Ok(items) => items,
            Err(err) => {
                log::warn!(
                    "Skipping unreadable project memory file {:?}: {}",
                    path,
                    err
                );
                continue;
            }
        };
        if let Some(index) = items.iter().position(|item| {
            item.workspace_id == workspace_id
                && item.deleted_at.is_none()
                && item.thread_id.as_deref() == Some(thread_id)
                && item.turn_id.as_deref() == Some(turn_id)
        }) {
            return Ok(Some((path, items, index)));
        }
    }
    Ok(None)
}

// ── S4: 迁移逻辑 ─────────────────────────────────────────────

/// 旧 `memories.json` → 新结构的迁移。幂等 + 可重试。
fn migrate_legacy_flat_file() -> Result<(), String> {
    let base = storage_dir()?;
    let legacy_path = base.join("memories.json");
    if !legacy_path.exists() {
        return Ok(());
    }
    let raw = std::fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        // 空文件直接备份
        let bak = base.join("memories.json.bak");
        std::fs::rename(&legacy_path, &bak).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let items: Vec<ProjectMemoryItem> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    // 按 (workspace_id, date) 分桶
    let mut buckets: HashMap<(String, String), Vec<ProjectMemoryItem>> = HashMap::new();
    for item in &items {
        let date = date_str_from_ms(item.created_at);
        buckets
            .entry((item.workspace_id.clone(), date))
            .or_default()
            .push(item.clone());
    }

    // 写入新结构
    for ((ws_id, date), bucket_items) in &buckets {
        let ws_dir = workspace_dir_path(
            &base,
            ws_id,
            bucket_items
                .first()
                .and_then(|item| item.workspace_name.as_deref()),
        );
        let file_path = date_file_path(&ws_dir, date);
        // 幂等：如果目标文件已存在，合并而非覆盖（防止半迁移后重试丢数据）
        let mut existing = read_date_file(&file_path)?;
        for new_item in bucket_items {
            if !existing.iter().any(|e| e.id == new_item.id) {
                existing.push(new_item.clone());
            }
        }
        write_date_file(&file_path, &existing)?;
    }

    // 校验：新结构记忆总数 >= 旧文件
    let total_migrated: usize = buckets
        .keys()
        .map(|(ws_id, _)| ws_id.clone())
        .collect::<std::collections::HashSet<String>>()
        .iter()
        .filter_map(|ws_id| resolve_workspace_dir(ws_id).ok().flatten())
        .map(|ws_dir| read_workspace_memories(&ws_dir).unwrap_or_default().len())
        .sum();
    if total_migrated < items.len() {
        return Err(format!(
            "Migration verification failed: expected >= {} items, found {}",
            items.len(),
            total_migrated
        ));
    }

    // 备份旧文件
    let bak = base.join("memories.json.bak");
    std::fs::rename(&legacy_path, &bak).map_err(|e| e.to_string())?;
    Ok(())
}

/// 迁移入口：检查并执行。幂等——旧文件不存在即短路。
pub(super) fn ensure_migrated() -> Result<(), String> {
    let base = storage_dir()?;
    let legacy_path = base.join("memories.json");
    if legacy_path.exists() {
        migrate_legacy_flat_file()?;
    }
    Ok(())
}

pub(super) fn read_settings() -> Result<ProjectMemorySettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(ProjectMemorySettings::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&raw).map_err(|err| err.to_string())
}

pub(super) fn write_settings(settings: &ProjectMemorySettings) -> Result<(), String> {
    let dir = storage_dir()?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    write_json_file_atomic(&path, &raw)
}
