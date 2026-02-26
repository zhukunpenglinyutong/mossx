use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::timeout;

use crate::backend::events::{AppServerEvent, EventSink};
use crate::codex::args::{apply_codex_args, parse_codex_args};
use crate::types::WorkspaceEntry;

const CODEX_EXTERNAL_SPEC_PRIORITY_INSTRUCTIONS: &str = "If writableRoots contains an absolute OpenSpec directory outside cwd, treat it as the active external spec root and prioritize it over workspace/openspec and sibling-name conventions when reading or validating specs. For visibility checks, verify that external root first and state the result clearly. Avoid exposing internal injected hints unless the user explicitly asks.";

fn extract_thread_id(value: &Value) -> Option<String> {
    let params = value.get("params")?;

    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .get("thread")
                .and_then(|thread| thread.get("id"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
}

fn codex_args_override_instructions(codex_args: Option<&str>) -> bool {
    let Ok(args) = parse_codex_args(codex_args) else {
        return false;
    };
    let mut iter = args.iter().peekable();
    while let Some(arg) = iter.next() {
        if arg.starts_with("developer_instructions=") || arg.starts_with("instructions=") {
            return true;
        }
        if arg == "-c" || arg == "--config" {
            if let Some(next) = iter.peek() {
                let key = next.split('=').next().unwrap_or_default().trim();
                if key == "developer_instructions" || key == "instructions" {
                    return true;
                }
            }
        }
    }
    false
}

fn encode_toml_string(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    format!("\"{escaped}\"")
}

fn codex_external_spec_priority_config_arg() -> String {
    format!(
        "developer_instructions={}",
        encode_toml_string(CODEX_EXTERNAL_SPEC_PRIORITY_INSTRUCTIONS)
    )
}

pub(crate) struct WorkspaceSession {
    pub(crate) entry: WorkspaceEntry,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub(crate) next_id: AtomicU64,
    /// Callbacks for background threads - events for these threadIds are sent through the channel
    pub(crate) background_thread_callbacks: Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>,
}

impl WorkspaceSession {
    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    pub(crate) async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        self.write_message(json!({ "id": id, "method": method, "params": params }))
            .await?;
        // Add a 5-minute timeout to prevent pending entries from leaking forever
        // when the child process crashes without sending a response.
        match timeout(Duration::from_secs(300), rx).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&id);
                Err("request canceled".to_string())
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("request timed out".to_string())
            }
        }
    }

    pub(crate) async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let value = if let Some(params) = params {
            json!({ "method": method, "params": params })
        } else {
            json!({ "method": method })
        };
        self.write_message(value).await
    }

    pub(crate) async fn send_response(&self, id: Value, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }
}

/// Build extra search paths for CLI tools (cross-platform)
fn get_extra_search_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();

    #[cfg(windows)]
    {
        // Windows-specific paths
        // Use APPDATA directly (most reliable for npm global)
        if let Ok(appdata) = env::var("APPDATA") {
            paths.push(Path::new(&appdata).join("npm"));
        }
        if let Ok(user_profile) = env::var("USERPROFILE") {
            let user_profile = Path::new(&user_profile);
            // Fallback: npm global install path via USERPROFILE
            paths.push(user_profile.join("AppData\\Roaming\\npm"));
            // Cargo bin
            paths.push(user_profile.join(".cargo\\bin"));
            // Bun
            paths.push(user_profile.join(".bun\\bin"));
            // fnm (Fast Node Manager)
            let fnm_root = user_profile.join("AppData\\Local\\fnm\\node-versions");
            if let Ok(entries) = std::fs::read_dir(&fnm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("installation");
                    if bin_path.is_dir() {
                        paths.push(bin_path);
                    }
                }
            }
            // nvm-windows
            let nvm_root = user_profile.join("AppData\\Roaming\\nvm");
            if let Ok(entries) = std::fs::read_dir(&nvm_root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir()
                        && path
                            .file_name()
                            .map_or(false, |n| n.to_string_lossy().starts_with('v'))
                    {
                        paths.push(path);
                    }
                }
            }
        }
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            let local_app_data = Path::new(&local_app_data);
            // Volta
            paths.push(local_app_data.join("Volta\\bin"));
            // pnpm
            paths.push(local_app_data.join("pnpm"));
        }
        if let Ok(program_files) = env::var("ProgramFiles") {
            paths.push(Path::new(&program_files).join("nodejs"));
        }
        if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
            paths.push(Path::new(&program_files_x86).join("nodejs"));
        }
    }

    #[cfg(not(windows))]
    {
        // Unix-specific paths (macOS/Linux)
        paths.extend(vec![
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
            PathBuf::from("/usr/sbin"),
            PathBuf::from("/sbin"),
        ]);
        if let Ok(home) = env::var("HOME") {
            let home = Path::new(&home);
            paths.push(home.join(".local/bin"));
            paths.push(home.join(".local/share/mise/shims"));
            paths.push(home.join(".cargo/bin"));
            paths.push(home.join(".bun/bin"));
            paths.push(home.join(".volta/bin"));
            // nvm
            let nvm_root = home.join(".nvm/versions/node");
            if let Ok(entries) = std::fs::read_dir(nvm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("bin");
                    if bin_path.is_dir() {
                        paths.push(bin_path);
                    }
                }
            }
        }
    }

    paths
}

/// Build combined search paths (system PATH + extra paths)
fn build_search_paths(custom_bin: Option<&str>) -> OsString {
    let mut all_paths: Vec<PathBuf> = Vec::new();

    // Add custom binary's parent directory first (highest priority)
    if let Some(bin_path) = custom_bin.filter(|v| !v.trim().is_empty()) {
        if let Some(parent) = Path::new(bin_path).parent() {
            all_paths.push(parent.to_path_buf());
        }
    }

    // Add system PATH
    if let Ok(system_path) = env::var("PATH") {
        for p in env::split_paths(&system_path) {
            if !all_paths.iter().any(|existing| paths_equal(existing, &p)) {
                all_paths.push(p);
            }
        }
    }

    // Add extra search paths
    for extra in get_extra_search_paths() {
        if extra.is_dir()
            && !all_paths
                .iter()
                .any(|existing| paths_equal(existing, &extra))
        {
            all_paths.push(extra);
        }
    }

    env::join_paths(all_paths).unwrap_or_else(|_| OsString::from(""))
}

/// Compare paths (case-insensitive on Windows)
fn paths_equal(a: &Path, b: &Path) -> bool {
    #[cfg(windows)]
    {
        a.to_string_lossy()
            .eq_ignore_ascii_case(&b.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

/// Find a CLI binary using the `which` crate with extended search paths
/// On Windows, also directly checks for .cmd files in common locations
pub fn find_cli_binary(name: &str, custom_bin: Option<&str>) -> Option<PathBuf> {
    // If custom binary is specified, check if it exists
    if let Some(bin) = custom_bin.filter(|v| !v.trim().is_empty()) {
        let bin_path = Path::new(bin);
        if bin_path.exists() {
            return Some(bin_path.to_path_buf());
        }
    }

    // On Windows, directly check for .cmd files in known locations first
    // This is more reliable than relying on PATH/PATHEXT
    #[cfg(windows)]
    {
        let extensions = ["cmd", "exe", "ps1", "bat"];
        for search_path in get_extra_search_paths() {
            // Try with various extensions
            for ext in &extensions {
                let cmd_path = search_path.join(format!("{}.{}", name, ext));
                if cmd_path.exists() {
                    return Some(cmd_path);
                }
            }
            // Also try without extension
            let bare_path = search_path.join(name);
            if bare_path.exists() {
                return Some(bare_path);
            }
        }
    }

    // Build extended search paths for which crate
    let search_paths = build_search_paths(custom_bin);

    // Use which crate to find the binary
    if let Some(cwd) = std::env::current_dir().ok() {
        if let Ok(found) = which::which_in(name, Some(&search_paths), &cwd) {
            return Some(found);
        }
    }

    // Fallback: try standard which (uses system PATH only)
    which::which(name).ok()
}

pub(crate) fn build_codex_path_env(codex_bin: Option<&str>) -> Option<String> {
    let paths = build_search_paths(codex_bin);
    let path_str = paths.to_string_lossy().to_string();
    if path_str.is_empty() {
        None
    } else {
        Some(path_str)
    }
}

/// Get debug information for CLI detection (useful for troubleshooting on Windows)
pub fn get_cli_debug_info(custom_bin: Option<&str>) -> serde_json::Value {
    use serde_json::json;

    let mut debug = serde_json::Map::new();

    // Platform info
    debug.insert("platform".to_string(), json!(std::env::consts::OS));
    debug.insert("arch".to_string(), json!(std::env::consts::ARCH));

    // Environment variables (Windows-specific)
    let env_vars: Vec<(&str, Option<String>)> = vec![
        ("PATH", env::var("PATH").ok()),
        ("USERPROFILE", env::var("USERPROFILE").ok()),
        ("APPDATA", env::var("APPDATA").ok()),
        ("LOCALAPPDATA", env::var("LOCALAPPDATA").ok()),
        ("ProgramFiles", env::var("ProgramFiles").ok()),
        ("HOME", env::var("HOME").ok()),
    ];
    let env_info: serde_json::Map<String, serde_json::Value> = env_vars
        .into_iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    debug.insert("envVars".to_string(), json!(env_info));

    // Extra search paths and their existence
    let extra_paths = get_extra_search_paths();
    let extra_paths_info: Vec<serde_json::Value> = extra_paths
        .iter()
        .map(|p| {
            // Also check if CLI files exist in this path
            let codex_cmd = p.join("codex.cmd");
            let claude_cmd = p.join("claude.cmd");
            json!({
                "path": p.to_string_lossy(),
                "exists": p.exists(),
                "isDir": p.is_dir(),
                "hasCodexCmd": codex_cmd.exists(),
                "hasClaudeCmd": claude_cmd.exists()
            })
        })
        .collect();
    debug.insert("extraSearchPaths".to_string(), json!(extra_paths_info));

    // Try to find claude and codex binaries
    let claude_found = find_cli_binary("claude", custom_bin);
    let codex_found = find_cli_binary("codex", custom_bin);
    debug.insert(
        "claudeFound".to_string(),
        json!(claude_found.map(|p| p.to_string_lossy().to_string())),
    );
    debug.insert(
        "codexFound".to_string(),
        json!(codex_found.map(|p| p.to_string_lossy().to_string())),
    );

    // Also try standard which without extra paths
    let claude_standard = which::which("claude").ok();
    let codex_standard = which::which("codex").ok();
    debug.insert(
        "claudeStandardWhich".to_string(),
        json!(claude_standard.map(|p| p.to_string_lossy().to_string())),
    );
    debug.insert(
        "codexStandardWhich".to_string(),
        json!(codex_standard.map(|p| p.to_string_lossy().to_string())),
    );

    // Custom binary info
    debug.insert("customBin".to_string(), json!(custom_bin));

    // Combined search paths
    let search_paths = build_search_paths(custom_bin);
    debug.insert(
        "combinedSearchPaths".to_string(),
        json!(search_paths.to_string_lossy()),
    );

    serde_json::Value::Object(debug)
}

/// Build a command that correctly handles .cmd files on Windows.
/// Uses CREATE_NO_WINDOW to prevent visible console windows.
pub fn build_command_for_binary(bin: &str) -> Command {
    #[cfg(windows)]
    {
        // On Windows, .cmd files need to be run through cmd.exe
        let bin_lower = bin.to_lowercase();
        if bin_lower.ends_with(".cmd") || bin_lower.ends_with(".bat") {
            let mut cmd = crate::utils::async_command("cmd");
            cmd.arg("/c");
            cmd.arg(bin);
            return cmd;
        }
    }
    crate::utils::async_command(bin)
}

pub(crate) fn build_codex_command_with_bin(codex_bin: Option<String>) -> Command {
    // Try to find the actual binary path
    let bin = if let Some(ref custom) = codex_bin {
        if !custom.trim().is_empty() {
            custom.clone()
        } else {
            // Try to find codex first (supports app-server), then claude as fallback
            find_cli_binary("codex", None)
                .or_else(|| find_cli_binary("claude", None))
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "codex".into())
        }
    } else {
        // Try to find codex first (supports app-server), then claude as fallback
        find_cli_binary("codex", None)
            .or_else(|| find_cli_binary("claude", None))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "codex".into())
    };

    let mut command = build_command_for_binary(&bin);
    if let Some(path_env) = build_codex_path_env(codex_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

/// Check if a specific CLI binary is available and return its version
async fn check_cli_binary(bin: &str, path_env: Option<String>) -> Result<Option<String>, String> {
    let mut command = build_command_for_binary(bin);
    if let Some(path) = path_env {
        command.env("PATH", path);
    }
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => match result {
            Ok(out) => out,
            Err(e) => {
                if e.kind() == ErrorKind::NotFound {
                    return Err("not_found".to_string());
                }
                return Err(e.to_string());
            }
        },
        Err(_) => {
            return Err("timeout".to_string());
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("failed".to_string());
        }
        return Err(format!("failed: {detail}"));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() {
        None
    } else {
        Some(version)
    })
}

pub(crate) async fn check_codex_installation(
    codex_bin: Option<String>,
) -> Result<Option<String>, String> {
    let path_env = build_codex_path_env(codex_bin.as_deref());

    // If user specified a custom binary path, use it directly
    if let Some(ref bin) = codex_bin {
        if !bin.trim().is_empty() {
            return match check_cli_binary(bin, path_env).await {
                Ok(version) => Ok(version),
                Err(e) if e == "not_found" => Err(format!(
                    "CLI not found at '{}'. Please check the path is correct.",
                    bin
                )),
                Err(e) if e == "timeout" => Err(format!(
                    "Timed out while checking CLI at '{}'. Make sure it runs in Terminal.",
                    bin
                )),
                Err(e) if e == "failed" => Err(format!(
                    "CLI at '{}' failed to start. Try running it in Terminal.",
                    bin
                )),
                Err(e) => Err(format!("CLI at '{}' failed: {}", bin, e)),
            };
        }
    }

    // Try to find Codex CLI first using our enhanced search (supports app-server)
    if let Some(codex_path) = find_cli_binary("codex", None) {
        let codex_bin = codex_path.to_string_lossy().to_string();
        if let Ok(version) = check_cli_binary(&codex_bin, path_env.clone()).await {
            return Ok(version);
        }
    }

    // Try Claude Code CLI as fallback using our enhanced search
    if let Some(claude_path) = find_cli_binary("claude", None) {
        let claude_bin = claude_path.to_string_lossy().to_string();
        if let Ok(version) = check_cli_binary(&claude_bin, path_env.clone()).await {
            return Ok(version);
        }
    }

    // Last resort: try simple command names (relies on PATH)
    let codex_result = check_cli_binary("codex", path_env.clone()).await;
    if let Ok(version) = codex_result {
        return Ok(version);
    }

    let claude_result = check_cli_binary("claude", path_env).await;
    if let Ok(version) = claude_result {
        return Ok(version);
    }

    // Both CLIs not found - return helpful error message
    Err(
        "CLI_NOT_FOUND: Neither Claude Code CLI nor Codex CLI was found. Please install one of them:\n\
         - Claude Code: npm install -g @anthropic-ai/claude-code\n\
         - Codex: npm install -g @openai/codex"
            .to_string(),
    )
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let codex_bin = entry
        .codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_codex_bin);
    let _ = check_codex_installation(codex_bin.clone()).await?;

    let mut command = build_codex_command_with_bin(codex_bin);
    let skip_spec_hint_injection = codex_args_override_instructions(codex_args.as_deref());
    apply_codex_args(&mut command, codex_args.as_deref())?;
    if !skip_spec_hint_injection {
        command.arg("-c");
        command.arg(codex_external_spec_priority_config_arg());
    }
    command.current_dir(&entry.path);
    command.arg("app-server");
    if let Some(codex_home) = codex_home {
        command.env("CODEX_HOME", codex_home);
    }
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(WorkspaceSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
    });

    let session_clone = Arc::clone(&session);
    let workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "codex/parseError",
                            "params": { "error": err.to_string(), "raw": line },
                        }),
                    };
                    event_sink_clone.emit_app_server_event(payload);
                    continue;
                }
            };

            // Parse the response ID flexibly: the app-server may return it as
            // u64, i64, or even a string representation of a number.
            let maybe_id = value.get("id").and_then(|id| {
                id.as_u64()
                    .or_else(|| id.as_i64().and_then(|i| u64::try_from(i).ok()))
                    .or_else(|| id.as_str().and_then(|s| s.parse::<u64>().ok()))
            });
            let has_method = value.get("method").is_some();
            let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();

            // Check if this event is for a background thread
            let thread_id = extract_thread_id(&value);

            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                } else if has_method {
                    // Check for background thread callback
                    let mut sent_to_background = false;
                    if let Some(ref tid) = thread_id {
                        let callbacks = session_clone.background_thread_callbacks.lock().await;
                        if let Some(tx) = callbacks.get(tid) {
                            let _ = tx.send(value.clone());
                            sent_to_background = true;
                        }
                    }
                    // Don't emit to frontend if this is a background thread event
                    if !sent_to_background {
                        let payload = AppServerEvent {
                            workspace_id: workspace_id.clone(),
                            message: value,
                        };
                        event_sink_clone.emit_app_server_event(payload);
                    }
                } else if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                    let _ = tx.send(value);
                }
            } else if has_method {
                // Check for background thread callback
                let mut sent_to_background = false;
                if let Some(ref tid) = thread_id {
                    let callbacks = session_clone.background_thread_callbacks.lock().await;
                    if let Some(tx) = callbacks.get(tid) {
                        let _ = tx.send(value.clone());
                        sent_to_background = true;
                    }
                }
                // Don't emit to frontend if this is a background thread event
                if !sent_to_background {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: value,
                    };
                    event_sink_clone.emit_app_server_event(payload);
                }
            }
        }
    });

    let workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let payload = AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "codex/stderr",
                    "params": { "message": line },
                }),
            };
            event_sink_clone.emit_app_server_event(payload);
        }
    });

    let init_params = json!({
        "clientInfo": {
            "name": "mossx",
            "title": "MossX",
            "version": client_version
        }
    });
    let init_result = timeout(
        Duration::from_secs(15),
        session.send_request("initialize", init_params),
    )
    .await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
            return Err(
                "Codex app-server did not respond to initialize. Check that `codex app-server` works in Terminal."
                    .to_string(),
            );
        }
    };
    init_response?;
    session.send_notification("initialized", None).await?;

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id.clone() }
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::{
        codex_args_override_instructions, codex_external_spec_priority_config_arg,
        extract_thread_id,
    };
    use serde_json::json;

    #[test]
    fn extract_thread_id_reads_camel_case() {
        let value = json!({ "params": { "threadId": "thread-123" } });
        assert_eq!(extract_thread_id(&value), Some("thread-123".to_string()));
    }

    #[test]
    fn extract_thread_id_reads_snake_case() {
        let value = json!({ "params": { "thread_id": "thread-456" } });
        assert_eq!(extract_thread_id(&value), Some("thread-456".to_string()));
    }

    #[test]
    fn extract_thread_id_returns_none_when_missing() {
        let value = json!({ "params": {} });
        assert_eq!(extract_thread_id(&value), None);
    }

    #[test]
    fn codex_args_override_instructions_detects_developer_instructions() {
        assert!(codex_args_override_instructions(Some(
            r#"-c developer_instructions="follow workspace policy""#
        )));
        assert!(codex_args_override_instructions(Some(
            r#"--config instructions="be concise""#
        )));
    }

    #[test]
    fn codex_args_override_instructions_ignores_unrelated_configs() {
        assert!(!codex_args_override_instructions(Some(
            r#"-c model="gpt-5.3-codex" --search"#
        )));
        assert!(!codex_args_override_instructions(None));
    }

    #[test]
    fn codex_external_spec_priority_config_arg_is_toml_quoted() {
        let arg = codex_external_spec_priority_config_arg();
        assert!(arg.starts_with("developer_instructions=\""));
        assert!(arg.ends_with('"'));
        assert!(arg.contains("writableRoots"));
    }
}
