use std::collections::HashSet;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;
use tokio::time::{sleep, Duration};

use crate::state::AppState;

const DEFAULT_REMOTE_HOST: &str = "127.0.0.1:4732";
const STARTUP_RETRY_TIMES: usize = 20;
const STARTUP_RETRY_INTERVAL_MS: u64 = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DaemonControlStatus {
    pub(crate) running: bool,
    pub(crate) host: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_error: Option<String>,
}

pub(crate) async fn maybe_start_local_daemon_for_remote(
    state: &AppState,
    app: &AppHandle,
) -> Result<bool, String> {
    let (resolved_host, token) = read_remote_host_and_token(state).await;

    if !is_local_loopback_host(&resolved_host) {
        return Ok(false);
    }

    if is_host_reachable(&resolved_host).await {
        return Ok(true);
    }

    let daemon_binary = resolve_or_build_daemon_binary(app).await?;

    let mut command = crate::utils::async_command(&daemon_binary);
    command.arg("--listen").arg(&resolved_host);
    if let Some(token) = token.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }) {
        command.arg("--token").arg(token);
    } else {
        command.arg("--insecure-no-auth");
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        command.arg("--data-dir").arg(data_dir);
    }

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command.spawn().map_err(|error| {
        format!(
            "Failed to spawn daemon binary at '{}': {error}",
            daemon_binary.display()
        )
    })?;

    for _ in 0..STARTUP_RETRY_TIMES {
        sleep(Duration::from_millis(STARTUP_RETRY_INTERVAL_MS)).await;
        if is_host_reachable(&resolved_host).await {
            return Ok(true);
        }
    }

    Err(format!(
        "Daemon started but endpoint '{resolved_host}' is still unreachable."
    ))
}

pub(crate) async fn get_local_daemon_status(state: &AppState) -> DaemonControlStatus {
    let (host, _) = read_remote_host_and_token(state).await;
    let running = if is_local_loopback_host(&host) {
        is_host_reachable(&host).await
    } else {
        false
    };
    DaemonControlStatus {
        running,
        host,
        last_error: None,
    }
}

pub(crate) async fn start_local_daemon_for_remote(
    state: &AppState,
    app: &AppHandle,
) -> Result<DaemonControlStatus, String> {
    let (host, _) = read_remote_host_and_token(state).await;
    if !is_local_loopback_host(&host) {
        return Err(format!(
            "Only loopback remote host is supported for daemon control: {host}"
        ));
    }

    maybe_start_local_daemon_for_remote(state, app).await?;
    let running = is_host_reachable(&host).await;
    Ok(DaemonControlStatus {
        running,
        host,
        last_error: None,
    })
}

pub(crate) async fn stop_local_daemon_for_remote(
    state: &AppState,
) -> Result<DaemonControlStatus, String> {
    let (host, _) = read_remote_host_and_token(state).await;
    if !is_local_loopback_host(&host) {
        return Err(format!(
            "Only loopback remote host is supported for daemon control: {host}"
        ));
    }

    if !is_host_reachable(&host).await {
        return Ok(DaemonControlStatus {
            running: false,
            host,
            last_error: None,
        });
    }

    let port = parse_port_from_host(&host)
        .ok_or_else(|| format!("Failed to parse daemon port from host: {host}"))?;
    let listener_pids = collect_listener_pids(port)?;
    if listener_pids.is_empty() {
        return Err(format!(
            "Daemon is reachable at {host}, but no LISTEN process was found on port {port}."
        ));
    }
    let daemon_pids = filter_moss_daemon_pids(&listener_pids)?;
    if daemon_pids.is_empty() {
        return Err(format!(
            "Refusing to stop port {port}: no moss daemon process matched listener PIDs {:?}.",
            listener_pids
        ));
    }
    terminate_pids(&daemon_pids)?;

    for _ in 0..STARTUP_RETRY_TIMES {
        sleep(Duration::from_millis(STARTUP_RETRY_INTERVAL_MS)).await;
        if !is_host_reachable(&host).await {
            return Ok(DaemonControlStatus {
                running: false,
                host,
                last_error: None,
            });
        }
    }

    Err(format!(
        "Daemon stop timeout: endpoint '{host}' is still reachable after kill attempts."
    ))
}

async fn read_remote_host_and_token(state: &AppState) -> (String, Option<String>) {
    let settings = state.app_settings.lock().await;
    let host = settings.remote_backend_host.trim().to_string();
    (
        if host.is_empty() {
            DEFAULT_REMOTE_HOST.to_string()
        } else {
            host
        },
        settings.remote_backend_token.clone(),
    )
}

async fn is_host_reachable(host: &str) -> bool {
    TcpStream::connect(host).await.is_ok()
}

fn is_local_loopback_host(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();
    lower.starts_with("127.0.0.1:")
        || lower.starts_with("localhost:")
        || lower.starts_with("[::1]:")
}

fn parse_port_from_host(host: &str) -> Option<u16> {
    if let Ok(addr) = host.parse::<std::net::SocketAddr>() {
        return Some(addr.port());
    }
    host.rsplit_once(':')
        .and_then(|(_, value)| value.parse::<u16>().ok())
}

#[cfg(unix)]
fn collect_listener_pids(port: u16) -> Result<Vec<u32>, String> {
    let target = format!("-iTCP:{port}");
    let output = crate::utils::std_command("lsof")
        .arg("-n")
        .arg("-P")
        .arg("-t")
        .arg(target)
        .arg("-sTCP:LISTEN")
        .output()
        .map_err(|error| format!("failed to execute lsof: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let pids = stdout
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect::<Vec<_>>();
    Ok(pids)
}

#[cfg(windows)]
fn collect_listener_pids(port: u16) -> Result<Vec<u32>, String> {
    let output = crate::utils::std_command("netstat")
        .arg("-ano")
        .arg("-p")
        .arg("tcp")
        .output()
        .map_err(|error| format!("failed to execute netstat: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let needle_ipv4 = format!(":{port}");
    let needle_ipv6 = format!("]:{port}");

    let mut pids = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let cols = line.split_whitespace().collect::<Vec<_>>();
        if cols.len() < 5 {
            continue;
        }
        let local_addr = cols[1];
        let state = cols[3];
        let pid = cols[4];
        if !state.eq_ignore_ascii_case("LISTENING") {
            continue;
        }
        if !(local_addr.ends_with(&needle_ipv4) || local_addr.ends_with(&needle_ipv6)) {
            continue;
        }
        if let Ok(parsed) = pid.parse::<u32>() {
            pids.push(parsed);
        }
    }
    Ok(pids)
}

#[cfg(unix)]
fn filter_moss_daemon_pids(pids: &[u32]) -> Result<Vec<u32>, String> {
    let mut matches = Vec::new();
    for pid in pids {
        if let Some(identity) = read_process_identity(*pid)? {
            if is_moss_daemon_identity(&identity) {
                matches.push(*pid);
            }
        }
    }
    Ok(matches)
}

#[cfg(windows)]
fn filter_moss_daemon_pids(pids: &[u32]) -> Result<Vec<u32>, String> {
    let mut matches = Vec::new();
    for pid in pids {
        if let Some(identity) = read_process_identity(*pid)? {
            if is_moss_daemon_identity(&identity) {
                matches.push(*pid);
            }
        }
    }
    Ok(matches)
}

#[cfg(not(any(unix, windows)))]
fn filter_moss_daemon_pids(_pids: &[u32]) -> Result<Vec<u32>, String> {
    Err("daemon stop is not supported on this platform".to_string())
}

#[cfg(unix)]
fn read_process_identity(pid: u32) -> Result<Option<String>, String> {
    let output = crate::utils::std_command("ps")
        .arg("-p")
        .arg(pid.to_string())
        .arg("-o")
        .arg("command=")
        .output()
        .map_err(|error| format!("failed to inspect process identity for pid {pid}: {error}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let identity = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if identity.is_empty() {
        Ok(None)
    } else {
        Ok(Some(identity))
    }
}

#[cfg(windows)]
fn read_process_identity(pid: u32) -> Result<Option<String>, String> {
    let output = crate::utils::std_command("tasklist")
        .arg("/FI")
        .arg(format!("PID eq {pid}"))
        .arg("/FO")
        .arg("CSV")
        .arg("/NH")
        .output()
        .map_err(|error| format!("failed to inspect process identity for pid {pid}: {error}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().next().map(str::trim).unwrap_or_default();
    if line.is_empty() || line.starts_with("INFO:") {
        return Ok(None);
    }
    let image_name = line
        .split(',')
        .next()
        .map(|value| value.trim_matches('"').trim())
        .unwrap_or_default()
        .to_string();
    if image_name.is_empty() {
        Ok(None)
    } else {
        Ok(Some(image_name))
    }
}

fn is_moss_daemon_identity(identity: &str) -> bool {
    let lower_identity = identity.to_ascii_lowercase();
    daemon_binary_names()
        .iter()
        .any(|name| lower_identity.contains(&name.to_ascii_lowercase()))
}

#[cfg(not(any(unix, windows)))]
fn collect_listener_pids(_port: u16) -> Result<Vec<u32>, String> {
    Err("daemon stop is not supported on this platform".to_string())
}

fn terminate_pids(pids: &[u32]) -> Result<(), String> {
    let mut seen = HashSet::new();
    for pid in pids {
        if !seen.insert(*pid) {
            continue;
        }
        terminate_pid(*pid)?;
    }
    Ok(())
}

#[cfg(unix)]
fn terminate_pid(pid: u32) -> Result<(), String> {
    let status = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .map_err(|error| format!("failed to terminate pid {pid}: {error}"))?;
    if !status.success() {
        let _ = Command::new("kill")
            .arg("-KILL")
            .arg(pid.to_string())
            .status();
    }
    Ok(())
}

#[cfg(windows)]
fn terminate_pid(pid: u32) -> Result<(), String> {
    let status = crate::utils::std_command("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/T")
        .arg("/F")
        .status()
        .map_err(|error| format!("failed to terminate pid {pid}: {error}"))?;
    if !status.success() {
        return Err(format!("taskkill failed for pid {pid}"));
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn terminate_pid(_pid: u32) -> Result<(), String> {
    Err("daemon stop is not supported on this platform".to_string())
}

fn resolve_daemon_binary(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            append_daemon_candidates(parent, &mut candidates);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        append_daemon_candidates(&resource_dir, &mut candidates);
    }

    for binary_name in daemon_binary_names() {
        if let Some(path) = find_in_path(binary_name) {
            candidates.push(path);
        }
    }

    let mut seen = HashSet::new();
    for candidate in candidates {
        let key = candidate.to_string_lossy().to_string();
        if seen.insert(key) && candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

async fn resolve_or_build_daemon_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = resolve_daemon_binary(app) {
        return Ok(path);
    }

    // Dev-only fallback: tauri dev usually doesn't build secondary bin targets
    // unless explicitly requested. Build moss_x_daemon once, then retry resolve.
    if cfg!(debug_assertions) {
        if let Some(manifest_path) = find_dev_manifest_path() {
            build_dev_daemon_binary(&manifest_path).await?;
            if let Some(path) = resolve_daemon_binary(app) {
                return Ok(path);
            }
        }
    }

    Err("Failed to locate moss_x_daemon binary for local auto-start.".to_string())
}

fn find_dev_manifest_path() -> Option<PathBuf> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    // compile-time source path, usually valid for local debug builds.
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"));

    if let Ok(current_exe) = env::current_exe() {
        for ancestor in current_exe.ancestors() {
            candidates.push(ancestor.join("Cargo.toml"));
            candidates.push(ancestor.join("src-tauri").join("Cargo.toml"));
        }
    }

    if let Ok(cwd) = env::current_dir() {
        for ancestor in cwd.ancestors() {
            candidates.push(ancestor.join("Cargo.toml"));
            candidates.push(ancestor.join("src-tauri").join("Cargo.toml"));
        }
    }

    for candidate in candidates {
        let key = candidate.to_string_lossy().to_string();
        if seen.insert(key) && candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

async fn build_dev_daemon_binary(manifest_path: &Path) -> Result<(), String> {
    let status = crate::utils::async_command("cargo")
        .arg("build")
        .arg("--manifest-path")
        .arg(manifest_path)
        .arg("--bin")
        .arg("moss_x_daemon")
        .status()
        .await
        .map_err(|error| format!("Failed to execute cargo build for moss_x_daemon: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "cargo build --bin moss_x_daemon failed with status {status}"
        ))
    }
}

fn append_daemon_candidates(base: &Path, output: &mut Vec<PathBuf>) {
    for name in daemon_binary_names() {
        output.push(base.join(name));
    }
}

fn daemon_binary_names() -> &'static [&'static str] {
    #[cfg(windows)]
    {
        &[
            "moss_x_daemon.exe",
            "moss-x-daemon.exe",
            "moss_x_daemon",
            "moss-x-daemon",
        ]
    }
    #[cfg(not(windows))]
    {
        &["moss_x_daemon", "moss-x-daemon"]
    }
}

fn find_in_path(binary: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
