use super::*;

async fn ensure_opencode_enabled(state: &State<'_, AppState>) -> Result<(), String> {
    let settings = state.app_settings.lock().await.clone();
    ensure_engine_enabled(&settings, EngineType::OpenCode)
}

/// List available OpenCode commands (cached for a short TTL).
#[tauri::command]
pub async fn opencode_commands_list(
    refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeCommandEntry>, String> {
    ensure_opencode_enabled(&state).await?;
    let force_refresh = refresh.unwrap_or(false);
    let cache = OPENCODE_COMMANDS_CACHE.get_or_init(|| Mutex::new(None));
    if !force_refresh {
        let cached = cache
            .lock()
            .map_err(|_| "commands cache lock poisoned".to_string())?;
        if let Some((updated_at, data)) = cached.as_ref() {
            if updated_at.elapsed() < OPENCODE_CACHE_TTL {
                return Ok(data.clone());
            }
        }
    }

    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.arg("--help");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode --help: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("opencode --help failed: {}", stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_opencode_help_commands(&stdout);
    let mut cached = cache
        .lock()
        .map_err(|_| "commands cache lock poisoned".to_string())?;
    *cached = Some((Instant::now(), parsed.clone()));
    Ok(parsed)
}

/// List available OpenCode agents (cached for a short TTL).
#[tauri::command]
pub async fn opencode_agents_list(
    refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeAgentEntry>, String> {
    ensure_opencode_enabled(&state).await?;
    let force_refresh = refresh.unwrap_or(false);
    let cache = OPENCODE_AGENTS_CACHE.get_or_init(|| Mutex::new(None));
    if !force_refresh {
        let cached = cache
            .lock()
            .map_err(|_| "agents cache lock poisoned".to_string())?;
        if let Some((updated_at, data)) = cached.as_ref() {
            if updated_at.elapsed() < OPENCODE_CACHE_TTL {
                return Ok(data.clone());
            }
        }
    }

    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.arg("agent");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode agent list: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("opencode agent list failed: {}", stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_opencode_agent_list(&stdout);

    // Some plugin ecosystems expose extra agents in resolved config but not in `agent list`.
    // Merge config-derived agents so UI remains aligned with the actual runtime.
    let mut debug_cmd = build_opencode_command(config.as_ref())?;
    debug_cmd.arg("debug");
    debug_cmd.arg("config");
    let merged = match debug_cmd.output().await {
        Ok(debug_output) if debug_output.status.success() => {
            let debug_stdout = String::from_utf8_lossy(&debug_output.stdout);
            let config_agents = parse_opencode_debug_config_agents(&debug_stdout);
            merge_opencode_agents(parsed, config_agents)
        }
        _ => parsed,
    };

    let mut cached = cache
        .lock()
        .map_err(|_| "agents cache lock poisoned".to_string())?;
    *cached = Some((Instant::now(), merged.clone()));
    Ok(merged)
}

#[tauri::command]
pub async fn opencode_session_list(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeSessionEntry>, String> {
    ensure_opencode_enabled(&state).await?;
    opencode_session_list_core(&state.workspaces, &state.engine_manager, &workspace_id).await
}

pub(crate) async fn opencode_session_list_core(
    workspaces: &tokio::sync::Mutex<HashMap<String, WorkspaceEntry>>,
    manager: &crate::engine::manager::EngineManager,
    workspace_id: &str,
) -> Result<Vec<OpenCodeSessionEntry>, String> {
    let workspace_path = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("session");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode session list: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode session list failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries = parse_opencode_session_list(&stdout);
    entries.iter().for_each(|entry| {
        if !entry.updated_label.trim().is_empty() && entry.updated_at.is_none() {
            log::warn!(
                "OpenCode session timestamp parse failed: session_id={}, updated_label={}",
                entry.session_id,
                entry.updated_label
            );
        }
    });
    Ok(entries)
}

#[tauri::command]
pub async fn opencode_delete_session(
    workspace_id: String,
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    opencode_delete_session_core(
        &state.workspaces,
        &state.engine_manager,
        &workspace_id,
        &session_id,
    )
    .await
}

pub(crate) async fn opencode_delete_session_core(
    workspaces: &tokio::sync::Mutex<HashMap<String, WorkspaceEntry>>,
    manager: &crate::engine::manager::EngineManager,
    workspace_id: &str,
    session_id: &str,
) -> Result<Value, String> {
    let workspace_path = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "[WORKSPACE_NOT_CONNECTED] Workspace not found".to_string())?
    };
    let config = manager.get_engine_config(EngineType::OpenCode).await;

    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(&workspace_path);
    cmd.arg("session");
    cmd.arg("delete");
    cmd.arg(session_id);

    match cmd.output().await {
        Ok(output) if output.status.success() => {
            return Ok(json!({
                "deleted": true,
                "method": "cli",
            }));
        }
        Ok(output) => {
            let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
            log::warn!(
                "opencode session delete failed, fallback to filesystem delete: session_id={}, stderr={}",
                session_id,
                stderr.trim()
            );
        }
        Err(error) => {
            log::warn!(
                "opencode session delete command unavailable, fallback to filesystem delete: session_id={}, error={}",
                session_id,
                error
            );
        }
    }

    delete_opencode_session_files(&workspace_path, session_id, config.as_ref())?;

    Ok(json!({
        "deleted": true,
        "method": "filesystem",
    }))
}

#[tauri::command]
pub async fn opencode_stats(
    workspace_id: String,
    days: Option<u32>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("stats");
    if let Some(days) = days {
        cmd.arg("--days");
        cmd.arg(days.to_string());
    }
    cmd.arg("--project");
    cmd.arg("");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode stats: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode stats failed: {}", stderr.trim()));
    }
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let trimmed = stdout.trim().to_string();
    if trimmed.is_empty() {
        return Err("opencode stats returned empty output".to_string());
    }
    Ok(trimmed)
}

#[tauri::command]
pub async fn opencode_export_session(
    workspace_id: String,
    session_id: String,
    output_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("export");
    cmd.arg(&session_id);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode export: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode export failed: {}", stderr.trim()));
    }
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let json_text = extract_json_object_from_text(&stdout)
        .ok_or_else(|| "opencode export did not return JSON payload".to_string())?;
    let target_path = if let Some(path) = output_path {
        PathBuf::from(path)
    } else if let Some(downloads) = dirs::download_dir() {
        downloads.join(format!("opencode-{}.json", session_id))
    } else {
        PathBuf::from(format!("opencode-{}.json", session_id))
    };
    fs::write(&target_path, json_text.as_bytes())
        .map_err(|e| format!("Failed to write export file: {}", e))?;
    Ok(json!({
        "sessionId": session_id,
        "filePath": target_path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub async fn opencode_share_session(
    workspace_id: String,
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("run");
    cmd.arg("--session");
    cmd.arg(&session_id);
    cmd.arg("--share");
    cmd.arg("--format");
    cmd.arg("json");
    cmd.arg("share this session");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode share: {}", e))?;
    if !output.status.success() {
        let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("opencode share failed: {}", stderr.trim()));
    }
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    let combined = format!("{}\n{}", stdout, stderr);
    let url = extract_first_url(&combined)
        .ok_or_else(|| "Share URL not found in opencode output".to_string())?;
    Ok(json!({
        "sessionId": session_id,
        "url": url,
    }))
}

#[tauri::command]
pub async fn opencode_import_session(
    workspace_id: String,
    source: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("import");
    cmd.arg(&source);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode import: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!("opencode import failed: {}", stderr.trim()));
    }
    let merged = format!("{}\n{}", stdout, stderr);
    let session_id = parse_imported_session_id(&merged);
    Ok(json!({
        "sessionId": session_id,
        "source": source,
        "output": merged.trim(),
    }))
}

#[tauri::command]
pub async fn opencode_mcp_status(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("mcp");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode mcp list: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!("opencode mcp list failed: {}", stderr.trim()));
    }
    Ok(json!({
        "text": stdout.trim(),
    }))
}

#[tauri::command]
pub async fn opencode_provider_health(
    workspace_id: String,
    provider: Option<String>,
    state: State<'_, AppState>,
) -> Result<OpenCodeProviderHealth, String> {
    ensure_opencode_enabled(&state).await?;
    load_opencode_provider_health(&workspace_id, provider, &state).await
}

#[tauri::command]
pub async fn opencode_provider_catalog(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeProviderOption>, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut providers =
        fetch_opencode_provider_catalog_from_auth_picker(&workspace_path, config.as_ref()).await;
    if providers.is_empty() {
        providers = fetch_opencode_provider_catalog_preview(&workspace_path, config.as_ref()).await;
    }
    let dynamic_provider_ids =
        fetch_opencode_provider_ids_from_models(&workspace_path, config.as_ref()).await;
    for provider_id in dynamic_provider_ids {
        let normalized_id = slugify_provider_label(&provider_id);
        if normalized_id.is_empty() {
            continue;
        }
        if let Some(existing) = providers.iter_mut().find(|item| item.id == normalized_id) {
            if existing.label.is_empty() {
                existing.label = provider_label_from_id(&provider_id);
            }
            continue;
        }
        providers.push(OpenCodeProviderOption {
            id: normalized_id,
            label: provider_label_from_id(&provider_id),
            description: None,
            category: "other".to_string(),
            recommended: false,
        });
    }
    let fallback = fallback_opencode_provider_catalog();
    for item in fallback {
        if let Some(existing) = providers.iter_mut().find(|p| p.id == item.id) {
            if existing.category != "popular" && item.category == "popular" {
                existing.category = "popular".to_string();
            }
            existing.recommended = existing.recommended || item.recommended;
            if existing.description.is_none() && item.description.is_some() {
                existing.description = item.description;
            }
        } else {
            providers.push(item);
        }
    }
    providers.sort_by(|a, b| {
        let score_a = if a.category == "popular" { 0 } else { 1 };
        let score_b = if b.category == "popular" { 0 } else { 1 };
        score_a
            .cmp(&score_b)
            .then_with(|| b.recommended.cmp(&a.recommended))
            .then_with(|| a.label.cmp(&b.label))
    });
    providers.dedup_by(|a, b| a.id == b.id);
    Ok(providers)
}

#[tauri::command]
pub async fn opencode_provider_connect(
    workspace_id: String,
    provider_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let opencode_bin = resolve_opencode_bin(config.as_ref())?;
    let quoted_opencode_bin = shell_quote(&opencode_bin);
    let prefill = provider_id
        .as_ref()
        .and_then(|id| build_provider_prefill_query(id));
    let auth_command = if let Some(prefill_query) = prefill {
        let quoted_query = shell_quote(&prefill_query);
        format!(
            "{{ printf \"%s\\r\" {}; cat; }} | {} auth login",
            quoted_query, quoted_opencode_bin
        )
    } else {
        format!("{} auth login", quoted_opencode_bin)
    };
    let full_command = format!(
        "cd {} && {}",
        shell_quote(&workspace_path.to_string_lossy()),
        auth_command
    );

    #[cfg(target_os = "macos")]
    {
        open_terminal_with_command(&full_command)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut cmd = build_opencode_command(config.as_ref())?;
        cmd.current_dir(workspace_path);
        cmd.arg("auth");
        cmd.arg("login");
        let _child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start opencode auth login: {}", e))?;
    }

    Ok(json!({
        "started": true,
        "providerId": provider_id,
        "command": full_command,
    }))
}

async fn load_opencode_provider_health(
    workspace_id: &str,
    provider: Option<String>,
    state: &State<'_, AppState>,
) -> Result<OpenCodeProviderHealth, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("auth");
    cmd.arg("list");
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode auth list: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Ok(OpenCodeProviderHealth {
            provider: provider.unwrap_or_else(|| "unknown".to_string()),
            connected: false,
            credential_count: 0,
            matched: false,
            authenticated_providers: Vec::new(),
            error: Some(stderr.trim().to_string()),
        });
    }

    let providers = parse_opencode_auth_providers(&stdout);
    let normalized_target = provider
        .as_ref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    let resolved_provider = normalized_target
        .clone()
        .or_else(|| providers.first().cloned());
    let matched = resolved_provider
        .as_ref()
        .map(|target| {
            providers
                .iter()
                .any(|name| provider_keys_match(target, name))
        })
        .unwrap_or(false);
    let connected = if normalized_target.is_some() {
        matched
    } else {
        !providers.is_empty()
    };

    Ok(OpenCodeProviderHealth {
        provider: resolved_provider.unwrap_or_else(|| "unknown".to_string()),
        connected,
        credential_count: providers.len(),
        matched,
        authenticated_providers: providers,
        error: None,
    })
}

/// Remove MCP toggle state for a workspace to free memory.
pub(crate) fn clear_mcp_toggle_state(workspace_id: &str) {
    if let Some(cache) = OPENCODE_MCP_TOGGLE_STATE.get() {
        if let Ok(mut guard) = cache.lock() {
            guard.remove(workspace_id);
        }
    }
}

#[tauri::command]
pub async fn opencode_mcp_toggle(
    workspace_id: String,
    server_name: Option<String>,
    enabled: Option<bool>,
    global_enabled: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let cache = OPENCODE_MCP_TOGGLE_STATE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = cache
        .lock()
        .map_err(|_| "opencode mcp toggle lock poisoned".to_string())?;
    let entry = guard
        .entry(workspace_id.clone())
        .or_insert_with(|| OpenCodeMcpToggleState {
            global_enabled: true,
            server_enabled: HashMap::new(),
        });
    if let Some(global) = global_enabled {
        entry.global_enabled = global;
    }
    if let Some(name) = server_name {
        let normalized = name.trim().to_string();
        if !normalized.is_empty() {
            entry
                .server_enabled
                .insert(normalized, enabled.unwrap_or(true));
        }
    }
    Ok(json!({
        "workspaceId": workspace_id,
        "mcpEnabled": entry.global_enabled,
        "serverStates": entry.server_enabled,
        "managedToggles": true,
    }))
}

#[tauri::command]
pub async fn opencode_status_snapshot(
    workspace_id: String,
    thread_id: Option<String>,
    model: Option<String>,
    agent: Option<String>,
    variant: Option<String>,
    state: State<'_, AppState>,
) -> Result<OpenCodeStatusSnapshot, String> {
    ensure_opencode_enabled(&state).await?;
    let provider = derive_provider_from_model(model.as_deref());
    let provider_health =
        load_opencode_provider_health(&workspace_id, provider.clone(), &state).await?;
    let mcp = opencode_mcp_status(workspace_id.clone(), state).await?;
    let raw_mcp = mcp
        .get("text")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let parsed_servers = parse_opencode_mcp_servers(&raw_mcp);
    let (mcp_enabled, mcp_servers, _server_states) =
        apply_mcp_toggle_state(&workspace_id, parsed_servers);

    Ok(OpenCodeStatusSnapshot {
        session_id: resolve_session_id_from_thread(thread_id.as_deref()),
        model,
        agent,
        variant,
        provider,
        provider_health,
        mcp_enabled,
        mcp_servers,
        mcp_raw: raw_mcp,
        managed_toggles: true,
        token_usage: None,
        context_window: None,
    })
}

#[tauri::command]
pub async fn opencode_lsp_diagnostics(
    workspace_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("diagnostics");
    cmd.arg(&file_path);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode debug lsp diagnostics: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp diagnostics failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "filePath": file_path,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

#[tauri::command]
pub async fn opencode_lsp_symbols(
    workspace_id: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("symbols");
    cmd.arg(&query);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode debug lsp symbols: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp symbols failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "query": query,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

#[tauri::command]
pub async fn opencode_lsp_document_symbols(
    workspace_id: String,
    file_uri: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("document-symbols");
    cmd.arg(&file_uri);
    let output = cmd.output().await.map_err(|e| {
        format!(
            "Failed to execute opencode debug lsp document-symbols: {}",
            e
        )
    })?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp document-symbols failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "fileUri": file_uri,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

#[tauri::command]
pub async fn opencode_lsp_definition(
    workspace_id: String,
    file_uri: String,
    line: u32,
    character: u32,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("definition");
    cmd.arg(&file_uri);
    cmd.arg(line.to_string());
    cmd.arg(character.to_string());
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode debug lsp definition: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp definition failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "fileUri": file_uri,
        "line": line,
        "character": character,
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}

#[tauri::command]
pub async fn opencode_lsp_references(
    workspace_id: String,
    file_uri: String,
    line: u32,
    character: u32,
    include_declaration: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    ensure_opencode_enabled(&state).await?;
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|w| PathBuf::from(&w.path))
            .ok_or_else(|| "Workspace not found".to_string())?
    };
    let manager = &state.engine_manager;
    let config = manager.get_engine_config(EngineType::OpenCode).await;
    let mut cmd = build_opencode_command(config.as_ref())?;
    cmd.current_dir(workspace_path);
    cmd.arg("debug");
    cmd.arg("lsp");
    cmd.arg("references");
    cmd.arg(&file_uri);
    cmd.arg(line.to_string());
    cmd.arg(character.to_string());
    if include_declaration.unwrap_or(false) {
        cmd.arg("--include-declaration");
    }
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute opencode debug lsp references: {}", e))?;
    let stdout = strip_ansi_codes(&String::from_utf8_lossy(&output.stdout));
    let stderr = strip_ansi_codes(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "opencode debug lsp references failed: {}",
            stderr.trim()
        ));
    }
    Ok(json!({
        "fileUri": file_uri,
        "line": line,
        "character": character,
        "includeDeclaration": include_declaration.unwrap_or(false),
        "result": parse_json_value(&stdout).unwrap_or_else(|| json!({ "raw": stdout.trim() })),
    }))
}
