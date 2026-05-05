use super::*;

pub(super) fn parse_opencode_models_provider_ids(stdout: &str) -> Vec<String> {
    let mut providers = Vec::new();
    for raw in strip_ansi_codes(stdout).lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('{') || line.starts_with('[') {
            continue;
        }
        if line.starts_with("http://") || line.starts_with("https://") {
            continue;
        }
        let Some((provider, _model)) = line.split_once('/') else {
            continue;
        };
        let provider = provider.trim().to_lowercase();
        if provider.is_empty() {
            continue;
        }
        providers.push(provider);
    }
    providers.sort();
    providers.dedup();
    providers
}

pub(super) fn provider_label_from_id(provider_id: &str) -> String {
    match provider_id {
        "z-ai" => "Z.AI".to_string(),
        "io-net" => "IO.NET".to_string(),
        "iflow" => "iFlow".to_string(),
        "zenmux" => "ZenMux".to_string(),
        "fastrouter" => "FastRouter".to_string(),
        "modelscope" => "ModelScope".to_string(),
        "minimax-cn-coding-plan" => "MiniMax Coding Plan (minimaxi.com)".to_string(),
        "minimax-cn" => "MiniMax (minimaxi.com)".to_string(),
        "opencode" => "OpenCode Zen".to_string(),
        "github-copilot" => "GitHub Copilot".to_string(),
        "openai" => "OpenAI".to_string(),
        "google" => "Google".to_string(),
        "anthropic" => "Anthropic".to_string(),
        _ => provider_id
            .split('-')
            .filter(|segment| !segment.is_empty())
            .map(|segment| {
                let mut chars = segment.chars();
                let Some(first) = chars.next() else {
                    return String::new();
                };
                format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

pub(super) async fn fetch_opencode_provider_ids_from_models(
    workspace_path: &PathBuf,
    config: Option<&EngineConfig>,
) -> Vec<String> {
    let mut cmd = match build_opencode_command(config) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    cmd.current_dir(workspace_path);
    cmd.arg("models");
    let output = match cmd.output().await {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_opencode_models_provider_ids(&stdout)
}

pub(super) fn build_provider_prefill_query(provider_id: &str) -> Option<String> {
    let normalized = slugify_provider_label(provider_id);
    if normalized.is_empty() {
        return None;
    }
    let query = match normalized.as_str() {
        "minimax-cn-coding-plan" | "minimax-coding-plan" | "minimax-cn" => "minimax",
        "z-ai" | "zhipuai-coding-plan" | "zhipu-ai-coding-plan" => "zhipu",
        "github-models" | "github-token" => "github",
        other => other,
    };
    Some(query.to_string())
}

pub(super) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(target_os = "macos")]
pub(super) fn open_terminal_with_command(command: &str) -> Result<(), String> {
    let script = format!(
        "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
        command.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|e| format!("Failed to launch Terminal auth flow: {}", e))?;
    if !status.success() {
        return Err("Terminal auth flow returned non-zero exit code".to_string());
    }
    Ok(())
}

pub(super) fn apply_mcp_toggle_state(
    workspace_id: &str,
    servers: Vec<OpenCodeMcpServerState>,
) -> (bool, Vec<OpenCodeMcpServerState>, HashMap<String, bool>) {
    let cache = OPENCODE_MCP_TOGGLE_STATE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = match cache.lock() {
        Ok(value) => value,
        Err(_) => return (true, servers, HashMap::new()),
    };
    let entry = guard
        .entry(workspace_id.to_string())
        .or_insert_with(|| OpenCodeMcpToggleState {
            global_enabled: true,
            server_enabled: HashMap::new(),
        });
    let global_enabled = entry.global_enabled;
    let server_enabled_map = entry.server_enabled.clone();
    let merged = servers
        .into_iter()
        .map(|mut item| {
            let override_enabled = server_enabled_map.get(&item.name).copied();
            let effective_enabled = global_enabled && override_enabled.unwrap_or(item.enabled);
            item.enabled = effective_enabled;
            item
        })
        .collect::<Vec<_>>();
    (global_enabled, merged, server_enabled_map)
}
