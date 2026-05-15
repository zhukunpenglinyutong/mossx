use chrono::Utc;

use super::*;

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[tauri::command]
pub(crate) async fn project_memory_get_settings() -> Result<ProjectMemorySettings, String> {
    run_project_memory_io(read_settings).await
}

#[tauri::command]
pub(crate) async fn project_memory_update_settings(
    settings: ProjectMemorySettings,
) -> Result<ProjectMemorySettings, String> {
    run_project_memory_io(move || {
        write_settings(&settings)?;
        Ok(settings)
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_list(
    workspace_id: String,
    query: Option<String>,
    kind: Option<String>,
    importance: Option<String>,
    tag: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<ProjectMemoryListResult, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let ws_dir = match resolve_workspace_dir(&workspace_id)? {
            Some(dir) => dir,
            None => {
                return Ok(ProjectMemoryListResult {
                    items: Vec::new(),
                    total: 0,
                })
            }
        };
        let data = read_workspace_memories(&ws_dir)?;
        let mut items = filter_project_memory_items(
            data,
            &workspace_id,
            query.as_deref(),
            kind.as_deref(),
            importance.as_deref(),
            tag.as_deref(),
        );

        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        let total = items.len();
        let page_index = page.unwrap_or(0);
        let page_limit = page_size.unwrap_or(50).clamp(1, 200);
        let start = page_index.saturating_mul(page_limit);
        let paged = if start >= items.len() {
            Vec::new()
        } else {
            let end = (start + page_limit).min(items.len());
            items[start..end].to_vec()
        };
        Ok(ProjectMemoryListResult {
            items: paged,
            total,
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_get(
    memory_id: String,
    workspace_id: String,
) -> Result<Option<ProjectMemoryItem>, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let ws_dir = match resolve_workspace_dir(&workspace_id)? {
            Some(dir) => dir,
            None => return Ok(None),
        };
        let data = read_workspace_memories(&ws_dir)?;
        Ok(data
            .into_iter()
            .find(|item| item.id == memory_id && item.deleted_at.is_none()))
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_create(
    input: CreateProjectMemoryInput,
) -> Result<ProjectMemoryItem, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let base = storage_dir()?;
        let current_ms = now_ms();
        let record_kind = input.record_kind.clone().or_else(|| {
            if input
                .turn_id
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
                || input.user_input.is_some()
                || input.assistant_response.is_some()
            {
                Some("conversation_turn".to_string())
            } else {
                None
            }
        });
        let is_conversation_turn = record_kind.as_deref() == Some("conversation_turn");
        let turn_id = input
            .turn_id
            .clone()
            .or_else(|| input.message_id.clone())
            .and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(value)
                }
            });
        let ws_dir =
            workspace_dir_path(&base, &input.workspace_id, input.workspace_name.as_deref());
        let existing_ws_dir = resolve_workspace_dir(&input.workspace_id)?;
        let effective_ws_dir = existing_ws_dir.as_deref().unwrap_or(&ws_dir);
        if is_conversation_turn {
            if let (Some(thread_id), Some(turn_id_value)) =
                (input.thread_id.as_deref(), turn_id.as_deref())
            {
                if let Some((file_path, mut items, index)) = find_turn_memory_in_workspace(
                    effective_ws_dir,
                    &input.workspace_id,
                    thread_id,
                    turn_id_value,
                )? {
                    let item = &mut items[index];
                    if let Some(schema_version) = input.schema_version {
                        item.schema_version = Some(schema_version);
                    } else {
                        item.schema_version = Some(2);
                    }
                    item.record_kind = Some("conversation_turn".to_string());
                    item.kind = input
                        .kind
                        .clone()
                        .unwrap_or_else(|| "conversation".to_string());
                    item.thread_id = input.thread_id.clone();
                    item.turn_id = Some(turn_id_value.to_string());
                    item.message_id = input
                        .message_id
                        .clone()
                        .or_else(|| Some(turn_id_value.to_string()));
                    item.assistant_message_id = input.assistant_message_id.clone();
                    if let Some(user_input) = normalized_optional_text(input.user_input.clone()) {
                        item.user_input = Some(user_input);
                    }
                    if let Some(assistant_response) =
                        normalized_optional_text(input.assistant_response.clone())
                    {
                        item.assistant_response = Some(assistant_response);
                    }
                    if input.assistant_thinking_summary.is_some() {
                        item.assistant_thinking_summary =
                            normalized_optional_text(input.assistant_thinking_summary.clone());
                    }
                    if let Some(review_state) = normalized_review_state(input.review_state.clone()) {
                        item.review_state = Some(review_state);
                    }
                    if let Some(source) = input.source.clone() {
                        item.source = source;
                    }
                    if input.workspace_name.is_some() {
                        item.workspace_name = input.workspace_name.clone();
                    }
                    if input.workspace_path.is_some() {
                        item.workspace_path = input.workspace_path.clone();
                    }
                    if input.engine.is_some() {
                        item.engine = input.engine.clone();
                    }
                    item.updated_at = current_ms;
                    apply_conversation_turn_projection(item);
                    let updated = item.clone();
                    write_date_file(&file_path, &items)?;
                    return Ok(updated);
                }
            }
        }

        let raw_text = if is_conversation_turn {
            build_conversation_turn_clean_text(
                input.user_input.as_deref(),
                input.assistant_response.as_deref(),
                input.assistant_thinking_summary.as_deref(),
            )
        } else {
            input.detail.clone().unwrap_or_default()
        };
        let clean_text = normalize_text(&raw_text, false);
        let fingerprint = calculate_fingerprint(&input.workspace_id, &clean_text);
        let mut item = ProjectMemoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: input.workspace_id.clone(),
            schema_version: if is_conversation_turn {
                Some(input.schema_version.unwrap_or(2))
            } else {
                input.schema_version
            },
            record_kind,
            kind: input.kind.clone().unwrap_or_else(|| "note".to_string()),
            title: input
                .title
                .clone()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| build_title(&clean_text)),
            summary: input
                .summary
                .clone()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| build_summary(&clean_text)),
            detail: input.detail.clone(),
            raw_text: if raw_text.trim().is_empty() {
                None
            } else {
                Some(raw_text)
            },
            clean_text,
            tags: normalize_tags(input.tags.clone()),
            importance: input
                .importance
                .clone()
                .unwrap_or_else(|| "medium".to_string()),
            thread_id: input.thread_id.clone(),
            turn_id,
            message_id: input.message_id.clone(),
            assistant_message_id: input.assistant_message_id.clone(),
            user_input: normalized_optional_text(input.user_input.clone()),
            assistant_response: normalized_optional_text(input.assistant_response.clone()),
            assistant_thinking_summary: normalized_optional_text(
                input.assistant_thinking_summary.clone(),
            ),
            review_state: normalized_review_state(input.review_state.clone()),
            source: input.source.clone().unwrap_or_else(|| "manual".to_string()),
            fingerprint,
            created_at: current_ms,
            updated_at: current_ms,
            deleted_at: None,
            workspace_name: input.workspace_name.clone(),
            workspace_path: input.workspace_path.clone(),
            engine: input.engine.clone(),
        };
        apply_conversation_turn_projection(&mut item);
        // 写入当天日期文件
        let ws_dir = existing_ws_dir.unwrap_or(ws_dir);
        let today = today_str();
        let file = date_file_path_for_append(&ws_dir, &today)?;
        let mut items = read_date_file(&file)?;
        items.push(item.clone());
        write_date_file(&file, &items)?;
        Ok(item)
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_update(
    memory_id: String,
    workspace_id: String,
    patch: UpdateProjectMemoryInput,
) -> Result<ProjectMemoryItem, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let ws_dir = resolve_workspace_dir(&workspace_id)?
            .ok_or_else(|| "workspace directory not found".to_string())?;
        let (file_path, mut items) = find_memory_in_workspace(&ws_dir, &memory_id)?
            .ok_or_else(|| "memory not found".to_string())?;
        let current_ms = now_ms();
        let mut found: Option<ProjectMemoryItem> = None;
        for item in &mut items {
            if item.id != memory_id || item.deleted_at.is_some() {
                continue;
            }
            if let Some(kind) = patch.kind.clone() {
                item.kind = kind;
            }
            if let Some(schema_version) = patch.schema_version {
                item.schema_version = Some(schema_version);
            }
            if let Some(record_kind) = patch.record_kind.clone() {
                item.record_kind = Some(record_kind);
            }
            if let Some(title) = patch.title.clone() {
                item.title = title;
            }
            if let Some(summary) = patch.summary.clone() {
                item.summary = summary;
            }
            if patch.detail.is_some() {
                let detail_value = patch.detail.clone().unwrap_or_default();
                item.detail = Some(detail_value.clone());
                item.raw_text = Some(detail_value.clone());
                let clean_text = normalize_text(&detail_value, false);
                item.clean_text = clean_text.clone();
                item.fingerprint = calculate_fingerprint(&item.workspace_id, &clean_text);
            }
            if let Some(tags) = patch.tags.clone() {
                item.tags = normalize_tags(Some(tags));
            }
            if let Some(importance) = patch.importance.clone() {
                item.importance = importance;
            }
            if let Some(thread_id) = patch.thread_id.clone() {
                item.thread_id = Some(thread_id);
            }
            if let Some(turn_id) = patch.turn_id.clone() {
                item.turn_id = Some(turn_id);
            }
            if let Some(message_id) = patch.message_id.clone() {
                item.message_id = Some(message_id);
            }
            if let Some(assistant_message_id) = patch.assistant_message_id.clone() {
                item.assistant_message_id = Some(assistant_message_id);
            }
            if patch.user_input.is_some() {
                item.user_input = normalized_optional_text(patch.user_input.clone());
            }
            if patch.assistant_response.is_some() {
                item.assistant_response =
                    normalized_optional_text(patch.assistant_response.clone());
            }
            if patch.assistant_thinking_summary.is_some() {
                item.assistant_thinking_summary =
                    normalized_optional_text(patch.assistant_thinking_summary.clone());
            }
            if patch.review_state.is_some() {
                item.review_state = normalized_review_state(patch.review_state.clone());
            }
            if let Some(source) = patch.source.clone() {
                item.source = source;
            }
            if patch.workspace_name.is_some() {
                item.workspace_name = patch.workspace_name.clone();
            }
            if patch.workspace_path.is_some() {
                item.workspace_path = patch.workspace_path.clone();
            }
            if patch.engine.is_some() {
                item.engine = patch.engine.clone();
            }
            apply_conversation_turn_projection(item);
            item.updated_at = current_ms;
            found = Some(item.clone());
            break;
        }
        if let Some(item) = found {
            write_date_file(&file_path, &items)?;
            Ok(item)
        } else {
            Err("memory not found".to_string())
        }
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_delete(
    memory_id: String,
    workspace_id: String,
) -> Result<(), String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let ws_dir = resolve_workspace_dir(&workspace_id)?
            .ok_or_else(|| "workspace directory not found".to_string())?;
        let (file_path, mut items) = find_memory_in_workspace(&ws_dir, &memory_id)?
            .ok_or_else(|| "memory not found".to_string())?;
        let current_ms = now_ms();
        let _ = apply_delete_semantics(&mut items, &memory_id, current_ms);
        write_date_file(&file_path, &items)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_diagnostics(
    workspace_id: String,
) -> Result<ProjectMemoryDiagnosticsResult, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let ws_dir = match resolve_workspace_dir(&workspace_id)? {
            Some(dir) => dir,
            None => {
                return Ok(ProjectMemoryDiagnosticsResult {
                    workspace_id,
                    total: 0,
                    health_counts: ProjectMemoryHealthCounts::default(),
                    duplicate_turn_groups: Vec::new(),
                    bad_files: Vec::new(),
                })
            }
        };
        diagnose_workspace_memories(&workspace_id, &ws_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_reconcile(
    workspace_id: String,
    dry_run: bool,
) -> Result<ProjectMemoryReconcileResult, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let ws_dir = match resolve_workspace_dir(&workspace_id)? {
            Some(dir) => dir,
            None => {
                return Ok(ProjectMemoryReconcileResult {
                    workspace_id,
                    dry_run,
                    fixable_count: 0,
                    fixed_count: 0,
                    skipped_count: 0,
                    duplicate_groups: 0,
                    changed_memory_ids: Vec::new(),
                })
            }
        };
        reconcile_workspace_memories(&workspace_id, &ws_dir, dry_run)
    })
    .await
}

#[tauri::command]
pub(crate) async fn project_memory_capture_auto(
    input: AutoCaptureInput,
) -> Result<Option<ProjectMemoryItem>, String> {
    run_project_memory_io(move || {
        ensure_migrated()?;
        let settings = read_settings()?;
        if !memory_auto_enabled_for_workspace(&settings, &input.workspace_id) {
            return Ok(None);
        }
        let turn_id = input
            .turn_id
            .clone()
            .or_else(|| input.message_id.clone())
            .and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(value)
                }
            });
        let clean_text = normalize_text(&input.text, settings.desensitize_enabled);
        if is_noise(&clean_text) {
            return Ok(None);
        }
        let fingerprint = calculate_fingerprint(&input.workspace_id, &clean_text);
        let legacy_fingerprint = calculate_legacy_fingerprint(&input.workspace_id, &clean_text);
        let base = storage_dir()?;
        // 去重：扫描 workspace 目录全部记忆
        let ws_dir =
            workspace_dir_path(&base, &input.workspace_id, input.workspace_name.as_deref());
        // 优先用 resolve 找到已存在目录（项目改名场景）
        let existing_ws_dir = resolve_workspace_dir(&input.workspace_id)?;
        let effective_ws_dir = existing_ws_dir.as_deref().unwrap_or(&ws_dir);
        if let (Some(thread_id), Some(turn_id_value)) =
            (input.thread_id.as_deref(), turn_id.as_deref())
        {
            if let Some((file_path, mut items, index)) = find_turn_memory_in_workspace(
                effective_ws_dir,
                &input.workspace_id,
                thread_id,
                turn_id_value,
            )? {
                let current_ms = now_ms();
                let item = &mut items[index];
                item.schema_version = Some(2);
                item.record_kind = Some("conversation_turn".to_string());
                item.kind = "conversation".to_string();
                item.thread_id = input.thread_id.clone();
                item.turn_id = Some(turn_id_value.to_string());
                item.message_id = input
                    .message_id
                    .clone()
                    .or_else(|| Some(turn_id_value.to_string()));
                item.user_input = Some(input.text.clone());
                item.source = input
                    .source
                    .clone()
                    .unwrap_or_else(|| "conversation_turn".to_string());
                item.workspace_name = input.workspace_name.clone();
                item.workspace_path = input.workspace_path.clone();
                item.engine = input.engine.clone();
                item.updated_at = current_ms;
                apply_conversation_turn_projection(item);
                let updated = item.clone();
                write_date_file(&file_path, &items)?;
                return Ok(Some(updated));
            }
        }
        let existing_data = read_workspace_memories(effective_ws_dir)?;
        if turn_id.is_none()
            && settings.dedupe_enabled
            && existing_data.iter().any(|entry| {
                entry.workspace_id == input.workspace_id
                    && entry.deleted_at.is_none()
                    && (entry.fingerprint == fingerprint || entry.fingerprint == legacy_fingerprint)
            })
        {
            return Ok(None);
        }
        let current_ms = now_ms();
        let is_conversation_turn = turn_id.is_some();
        let mut item = ProjectMemoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: input.workspace_id.clone(),
            schema_version: if is_conversation_turn { Some(2) } else { None },
            record_kind: if is_conversation_turn {
                Some("conversation_turn".to_string())
            } else {
                None
            },
            kind: if is_conversation_turn {
                "conversation".to_string()
            } else {
                classify_kind(&clean_text)
            },
            title: build_title(&clean_text),
            summary: build_summary(&clean_text),
            detail: Some(clean_text.clone()),
            raw_text: Some(input.text.clone()),
            clean_text: clean_text.clone(),
            tags: extract_auto_tags(&clean_text),
            importance: classify_importance(&clean_text),
            thread_id: input.thread_id.clone(),
            turn_id,
            message_id: input.message_id.clone(),
            assistant_message_id: None,
            user_input: if is_conversation_turn {
                Some(input.text.clone())
            } else {
                None
            },
            assistant_response: None,
            assistant_thinking_summary: None,
            review_state: None,
            source: input.source.clone().unwrap_or_else(|| {
                if is_conversation_turn {
                    "conversation_turn".to_string()
                } else {
                    "auto".to_string()
                }
            }),
            fingerprint,
            created_at: current_ms,
            updated_at: current_ms,
            deleted_at: None,
            workspace_name: input.workspace_name.clone(),
            workspace_path: input.workspace_path.clone(),
            engine: input.engine.clone(),
        };
        apply_conversation_turn_projection(&mut item);
        // 写入当天日期文件（使用已 resolve 或新建的目录）
        let target_ws_dir = existing_ws_dir.unwrap_or(ws_dir);
        let today = today_str();
        let file = date_file_path_for_append(&target_ws_dir, &today)?;
        let mut day_items = read_date_file(&file)?;
        day_items.push(item.clone());
        write_date_file(&file, &day_items)?;
        Ok(Some(item))
    })
    .await
}
