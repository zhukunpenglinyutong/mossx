use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::{
    apply_conversation_turn_projection, is_conversation_turn_record, read_date_file,
    read_workspace_memories, write_date_file, ProjectMemoryBadFile,
    ProjectMemoryDiagnosticsResult, ProjectMemoryDuplicateTurnGroup, ProjectMemoryHealthCounts,
    ProjectMemoryItem, ProjectMemoryReconcileResult,
};

fn is_memory_date_file_for_diagnostics(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let Some((date_str, suffix)) = file_name.split_once('.') else {
        return false;
    };
    if date_str.len() != 10
        || date_str.as_bytes().get(4) != Some(&b'-')
        || date_str.as_bytes().get(7) != Some(&b'-')
        || !date_str
            .chars()
            .enumerate()
            .all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit())
    {
        return false;
    }
    suffix == "json"
        || (
            suffix.len() == 8
                && suffix.ends_with(".json")
                && suffix[..3].chars().all(|ch| ch.is_ascii_digit())
        )
}

fn workspace_memory_files(ws_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !ws_dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in std::fs::read_dir(ws_dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if is_memory_date_file_for_diagnostics(&path) {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn file_name_for_display(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown.json")
        .to_string()
}

fn health_state(item: &ProjectMemoryItem) -> &'static str {
    if !is_conversation_turn_record(item) {
        return "complete";
    }
    let has_user_input = item
        .user_input
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let has_assistant_response = item
        .assistant_response
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    match (has_user_input, has_assistant_response) {
        (true, true) => "complete",
        (true, false) => "input_only",
        (false, true) => "assistant_only",
        (false, false) => "capture_failed",
    }
}

fn increment_health_count(counts: &mut ProjectMemoryHealthCounts, item: &ProjectMemoryItem) {
    match health_state(item) {
        "complete" => counts.complete += 1,
        "input_only" => counts.input_only += 1,
        "assistant_only" => counts.assistant_only += 1,
        "pending_fusion" => counts.pending_fusion += 1,
        _ => counts.capture_failed += 1,
    }
}

fn duplicate_turn_groups(items: &[ProjectMemoryItem]) -> Vec<ProjectMemoryDuplicateTurnGroup> {
    let mut grouped: HashMap<(String, String, String), Vec<String>> = HashMap::new();
    for item in items {
        if item.deleted_at.is_some() {
            continue;
        }
        let Some(thread_id) = item.thread_id.as_ref().filter(|value| !value.trim().is_empty()) else {
            continue;
        };
        let Some(turn_id) = item.turn_id.as_ref().filter(|value| !value.trim().is_empty()) else {
            continue;
        };
        grouped
            .entry((item.workspace_id.clone(), thread_id.clone(), turn_id.clone()))
            .or_default()
            .push(item.id.clone());
    }
    let mut duplicates = grouped
        .into_iter()
        .filter_map(|((workspace_id, thread_id, turn_id), memory_ids)| {
            if memory_ids.len() <= 1 {
                return None;
            }
            Some(ProjectMemoryDuplicateTurnGroup {
                workspace_id,
                thread_id,
                turn_id,
                memory_ids,
            })
        })
        .collect::<Vec<_>>();
    duplicates.sort_by(|a, b| {
        a.thread_id
            .cmp(&b.thread_id)
            .then_with(|| a.turn_id.cmp(&b.turn_id))
    });
    duplicates
}

pub(super) fn diagnose_workspace_memories(
    workspace_id: &str,
    ws_dir: &Path,
) -> Result<ProjectMemoryDiagnosticsResult, String> {
    let files = workspace_memory_files(ws_dir)?;
    let mut all_items = Vec::new();
    let mut bad_files = Vec::new();
    for file in files {
        match read_date_file(&file) {
            Ok(items) => all_items.extend(items),
            Err(error) => bad_files.push(ProjectMemoryBadFile {
                file_name: file_name_for_display(&file),
                error,
            }),
        }
    }
    let items = all_items
        .into_iter()
        .filter(|item| item.workspace_id == workspace_id && item.deleted_at.is_none())
        .collect::<Vec<_>>();
    let mut health_counts = ProjectMemoryHealthCounts::default();
    for item in &items {
        increment_health_count(&mut health_counts, item);
    }
    Ok(ProjectMemoryDiagnosticsResult {
        workspace_id: workspace_id.to_string(),
        total: items.len(),
        health_counts,
        duplicate_turn_groups: duplicate_turn_groups(&items),
        bad_files,
    })
}

fn merge_turn_item(target: &mut ProjectMemoryItem, source: &ProjectMemoryItem) -> bool {
    let mut changed = false;
    if target.user_input.as_deref().unwrap_or("").trim().is_empty()
        && source
            .user_input
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        target.user_input = source.user_input.clone();
        changed = true;
    }
    if target.assistant_response.as_deref().unwrap_or("").trim().is_empty()
        && source
            .assistant_response
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        target.assistant_response = source.assistant_response.clone();
        target.assistant_message_id = target
            .assistant_message_id
            .clone()
            .or_else(|| source.assistant_message_id.clone());
        changed = true;
    }
    if target
        .assistant_thinking_summary
        .as_deref()
        .unwrap_or("")
        .trim()
        .is_empty()
        && source
            .assistant_thinking_summary
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        target.assistant_thinking_summary = source.assistant_thinking_summary.clone();
        changed = true;
    }
    changed
}

pub(super) fn reconcile_workspace_memories(
    workspace_id: &str,
    ws_dir: &Path,
    dry_run: bool,
) -> Result<ProjectMemoryReconcileResult, String> {
    let initial_items = read_workspace_memories(ws_dir)?
        .into_iter()
        .filter(|item| item.workspace_id == workspace_id && item.deleted_at.is_none())
        .collect::<Vec<_>>();
    let duplicate_groups = duplicate_turn_groups(&initial_items);
    let mut fixable_count = 0;
    let mut fixed_count = 0;
    let mut skipped_count = 0;
    let mut changed_memory_ids: Vec<String> = Vec::new();
    let mut fix_targets: HashMap<String, Vec<String>> = HashMap::new();

    for group in &duplicate_groups {
        let group_items = initial_items
            .iter()
            .filter(|item| group.memory_ids.iter().any(|id| id == &item.id))
            .collect::<Vec<_>>();
        let Some(target) = group_items
            .iter()
            .max_by_key(|item| {
                let completeness = usize::from(
                    item.user_input
                        .as_deref()
                        .is_some_and(|value| !value.trim().is_empty()),
                ) + usize::from(
                    item.assistant_response
                        .as_deref()
                        .is_some_and(|value| !value.trim().is_empty()),
                );
                (completeness, item.updated_at)
            })
            .copied()
        else {
            continue;
        };
        let mut simulated = target.clone();
        for candidate in &group_items {
            if candidate.id == target.id {
                continue;
            }
            let before = simulated.clone();
            if merge_turn_item(&mut simulated, candidate) {
                fixable_count += 1;
                fix_targets
                    .entry(target.id.clone())
                    .or_default()
                    .push(candidate.id.clone());
            } else if before.id != candidate.id {
                skipped_count += 1;
            }
        }
    }

    if !dry_run && !fix_targets.is_empty() {
        for file in workspace_memory_files(ws_dir)? {
            let mut items = match read_date_file(&file) {
                Ok(items) => items,
                Err(_) => continue,
            };
            let mut changed_file = false;
            let snapshot = items.clone();
            for item in &mut items {
                let Some(source_ids) = fix_targets.get(&item.id).cloned() else {
                    continue;
                };
                for source_id in source_ids {
                    if let Some(source) = snapshot.iter().find(|entry| entry.id == source_id) {
                        if merge_turn_item(item, source) {
                            apply_conversation_turn_projection(item);
                            changed_file = true;
                            fixed_count += 1;
                            changed_memory_ids.push(item.id.clone());
                        }
                    }
                }
            }
            if changed_file {
                write_date_file(&file, &items)?;
            }
        }
        changed_memory_ids.sort();
        changed_memory_ids.dedup();
    }

    Ok(ProjectMemoryReconcileResult {
        workspace_id: workspace_id.to_string(),
        dry_run,
        fixable_count,
        fixed_count,
        skipped_count,
        duplicate_groups: duplicate_groups.len(),
        changed_memory_ids,
    })
}
