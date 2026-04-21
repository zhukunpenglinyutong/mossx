use std::collections::{HashMap, HashSet};
use std::time::Duration;

use serde_json::Value;

use super::{
    normalize_engine, RuntimeEngineObservability, RuntimePoolRow, RuntimeProcessDiagnostics,
    TERMINATE_GRACE_MILLIS,
};

pub(super) fn current_host_untracked_engine_roots(
    engine: &str,
    tracked_pids: &[u32],
) -> Result<Vec<u32>, String> {
    let Some(process_rows) = snapshot_process_rows() else {
        return Ok(Vec::new());
    };
    let rows_by_pid = process_rows
        .iter()
        .map(|row| (row.pid, row))
        .collect::<HashMap<_, _>>();
    let tracked = tracked_pids.iter().copied().collect::<HashSet<_>>();
    let host_pid = std::process::id();
    let mut roots = Vec::new();
    for row in &process_rows {
        if row.ppid != host_pid {
            continue;
        }
        if tracked.contains(&row.pid) {
            continue;
        }
        if is_engine_root_process(engine, row, &rows_by_pid) {
            roots.push(row.pid);
        }
    }
    Ok(roots)
}

pub(super) fn terminate_pid_tree(pid: u32) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let status = crate::utils::std_command("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .status()
            .map_err(|error| error.to_string())?;
        return Ok(status.success());
    }

    #[cfg(unix)]
    {
        let pgid = pid as libc::pid_t;
        let terminate_status = unsafe { libc::kill(-pgid, libc::SIGTERM) };
        if terminate_status == 0 {
            std::thread::sleep(Duration::from_millis(TERMINATE_GRACE_MILLIS));
        }
        let kill_status = unsafe { libc::kill(-pgid, libc::SIGKILL) };
        if kill_status != 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ESRCH) {
                return Err(error.to_string());
            }
        }
        return Ok(true);
    }
}

pub(super) fn merge_process_diagnostics(
    pids: &[u32],
    category: &str,
) -> RuntimeProcessDiagnostics {
    let mut diagnostics = RuntimeProcessDiagnostics {
        root_processes: pids.len() as u32,
        total_processes: 0,
        node_processes: 0,
        root_command: None,
        managed_runtime_processes: 0,
        resume_helper_processes: 0,
        orphan_residue_processes: 0,
    };
    for pid in pids {
        if let Some(snapshot) = snapshot_process_diagnostics(*pid) {
            diagnostics.total_processes = diagnostics
                .total_processes
                .saturating_add(snapshot.total_processes);
            diagnostics.node_processes = diagnostics
                .node_processes
                .saturating_add(snapshot.node_processes);
            if diagnostics.root_command.is_none() {
                diagnostics.root_command = snapshot.root_command;
            }
        } else {
            diagnostics.total_processes = diagnostics.total_processes.saturating_add(1);
        }
    }
    match category {
        "managed-runtime" => diagnostics.managed_runtime_processes = diagnostics.node_processes,
        "resume-helper" => diagnostics.resume_helper_processes = diagnostics.node_processes,
        "orphan-residue" => diagnostics.orphan_residue_processes = diagnostics.node_processes,
        _ => {}
    }
    diagnostics
}

#[derive(Debug, Clone)]
pub(crate) struct ProcessSnapshotRow {
    pub(crate) pid: u32,
    pub(crate) ppid: u32,
    pub(crate) command: String,
    pub(crate) args: String,
}

pub(crate) fn parse_process_rows_unix_output(stdout: &str) -> Vec<ProcessSnapshotRow> {
    let mut rows = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let pid = parts.next().and_then(|value| value.parse::<u32>().ok());
        let ppid = parts.next().and_then(|value| value.parse::<u32>().ok());
        let command = parts.next().map(|value| value.trim().to_string());
        let args = parts.collect::<Vec<_>>().join(" ");
        let (pid, ppid, command) = match (pid, ppid, command) {
            (Some(pid), Some(ppid), Some(command)) if !command.is_empty() => (pid, ppid, command),
            _ => continue,
        };
        rows.push(ProcessSnapshotRow {
            pid,
            ppid,
            command,
            args,
        });
    }
    rows
}

pub(crate) fn parse_process_rows_windows_payload(payload: &Value) -> Vec<ProcessSnapshotRow> {
    let rows = payload
        .as_array()
        .cloned()
        .unwrap_or_else(|| vec![payload.clone()]);
    let mut parsed = Vec::new();
    for row in rows {
        let obj = match row.as_object() {
            Some(obj) => obj,
            None => continue,
        };
        let pid = obj
            .get("ProcessId")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let ppid = obj
            .get("ParentProcessId")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let command = obj
            .get("Name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        let args = obj
            .get("CommandLine")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .or_else(|| command.clone());
        let (pid, ppid, command, args) = match (pid, ppid, command, args) {
            (Some(pid), Some(ppid), Some(command), Some(args)) => (pid, ppid, command, args),
            _ => continue,
        };
        parsed.push(ProcessSnapshotRow {
            pid,
            ppid,
            command,
            args,
        });
    }
    parsed
}

#[cfg(unix)]
fn snapshot_process_rows() -> Option<Vec<ProcessSnapshotRow>> {
    let output = crate::utils::std_command("ps")
        .args(["-axo", "pid=,ppid=,comm=,args="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Some(parse_process_rows_unix_output(&stdout))
}

#[cfg(windows)]
fn snapshot_process_rows() -> Option<Vec<ProcessSnapshotRow>> {
    fn read_process_rows(shell_bin: &str) -> Option<Vec<ProcessSnapshotRow>> {
        let output = crate::utils::std_command(shell_bin)
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return None;
        }
        let payload = serde_json::from_str::<Value>(&stdout).ok()?;
        Some(parse_process_rows_windows_payload(&payload))
    }

    read_process_rows("powershell").or_else(|| read_process_rows("pwsh"))
}

#[cfg(not(any(unix, windows)))]
fn snapshot_process_rows() -> Option<Vec<ProcessSnapshotRow>> {
    None
}

fn process_descendant_count(root_pid: u32, parent_to_children: &HashMap<u32, Vec<u32>>) -> u32 {
    let mut stack = vec![root_pid];
    let mut visited = HashSet::new();
    let mut total = 0u32;
    while let Some(current_pid) = stack.pop() {
        if !visited.insert(current_pid) {
            continue;
        }
        total = total.saturating_add(1);
        if let Some(children) = parent_to_children.get(&current_pid) {
            stack.extend(children.iter().copied());
        }
    }
    total
}

fn is_codex_app_server_process(row: &ProcessSnapshotRow) -> bool {
    let command = row.command.to_ascii_lowercase();
    let args = row.args.to_ascii_lowercase();
    (command.contains("codex") || args.contains("codex")) && args.contains("app-server")
}

fn is_engine_process_row(engine: &str, row: &ProcessSnapshotRow) -> bool {
    match normalize_engine(engine).as_str() {
        "codex" => is_codex_app_server_process(row),
        "claude" => {
            let command = row.command.to_ascii_lowercase();
            let args = row.args.to_ascii_lowercase();
            (command.contains("claude") || args.contains("claude"))
                && !args.contains("claude-agent-acp")
        }
        _ => false,
    }
}

pub(crate) fn is_engine_root_process(
    engine: &str,
    row: &ProcessSnapshotRow,
    rows_by_pid: &HashMap<u32, &ProcessSnapshotRow>,
) -> bool {
    if !is_engine_process_row(engine, row) {
        return false;
    }
    rows_by_pid
        .get(&row.ppid)
        .map(|parent| !is_engine_process_row(engine, parent))
        .unwrap_or(true)
}

pub(super) fn build_engine_observability(
    rows: &[RuntimePoolRow],
) -> Vec<RuntimeEngineObservability> {
    let engines = ["codex", "claude"];
    let mut observability = engines
        .into_iter()
        .map(|engine| {
            let engine_rows = rows
                .iter()
                .filter(|row| normalize_engine(&row.engine) == engine)
                .collect::<Vec<_>>();
            RuntimeEngineObservability {
                engine: engine.to_string(),
                session_count: engine_rows.len() as u32,
                tracked_root_processes: engine_rows
                    .iter()
                    .map(|row| {
                        row.process_diagnostics
                            .as_ref()
                            .map(|item| item.root_processes)
                            .unwrap_or(u32::from(row.pid.is_some()))
                    })
                    .sum(),
                tracked_total_processes: engine_rows
                    .iter()
                    .map(|row| {
                        row.process_diagnostics
                            .as_ref()
                            .map(|item| item.total_processes)
                            .unwrap_or(u32::from(row.pid.is_some()))
                    })
                    .sum(),
                tracked_node_processes: engine_rows
                    .iter()
                    .map(|row| {
                        row.process_diagnostics
                            .as_ref()
                            .map(|item| item.node_processes)
                            .unwrap_or(0)
                    })
                    .sum(),
                host_managed_root_processes: 0,
                host_unmanaged_root_processes: 0,
                external_root_processes: 0,
                host_unmanaged_total_processes: 0,
                external_total_processes: 0,
            }
        })
        .collect::<Vec<_>>();

    let Some(process_rows) = snapshot_process_rows() else {
        return observability;
    };
    let rows_by_pid = process_rows
        .iter()
        .map(|row| (row.pid, row))
        .collect::<HashMap<_, _>>();
    let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
    for row in &process_rows {
        parent_to_children
            .entry(row.ppid)
            .or_default()
            .push(row.pid);
    }
    let host_pid = std::process::id();

    for item in &mut observability {
        let tracked_pids = rows
            .iter()
            .filter(|row| normalize_engine(&row.engine) == item.engine)
            .filter_map(|row| row.pid)
            .collect::<HashSet<_>>();
        for row in &process_rows {
            if !is_engine_root_process(&item.engine, row, &rows_by_pid) {
                continue;
            }
            let subtree_total = process_descendant_count(row.pid, &parent_to_children);
            if tracked_pids.contains(&row.pid) {
                if row.ppid == host_pid {
                    item.host_managed_root_processes =
                        item.host_managed_root_processes.saturating_add(1);
                }
                continue;
            }
            if row.ppid == host_pid {
                item.host_unmanaged_root_processes =
                    item.host_unmanaged_root_processes.saturating_add(1);
                item.host_unmanaged_total_processes = item
                    .host_unmanaged_total_processes
                    .saturating_add(subtree_total);
            } else {
                item.external_root_processes = item.external_root_processes.saturating_add(1);
                item.external_total_processes =
                    item.external_total_processes.saturating_add(subtree_total);
            }
        }
    }

    observability
}

pub(super) fn snapshot_process_diagnostics(pid: u32) -> Option<RuntimeProcessDiagnostics> {
    #[cfg(windows)]
    {
        return snapshot_process_diagnostics_windows(pid);
    }

    #[cfg(unix)]
    {
        return snapshot_process_diagnostics_unix(pid);
    }

    #[allow(unreachable_code)]
    None
}

#[cfg(unix)]
fn snapshot_process_diagnostics_unix(pid: u32) -> Option<RuntimeProcessDiagnostics> {
    let stdout = snapshot_process_rows()?;
    let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut command_by_pid: HashMap<u32, String> = HashMap::new();
    for row in stdout {
        command_by_pid.insert(row.pid, row.command.clone());
        parent_to_children
            .entry(row.ppid)
            .or_default()
            .push(row.pid);
    }
    build_process_diagnostics(pid, &parent_to_children, &command_by_pid)
}

#[cfg(windows)]
fn snapshot_process_diagnostics_windows(pid: u32) -> Option<RuntimeProcessDiagnostics> {
    let rows = snapshot_process_rows()?;
    let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut command_by_pid: HashMap<u32, String> = HashMap::new();
    for row in rows {
        command_by_pid.insert(row.pid, row.command.clone());
        parent_to_children
            .entry(row.ppid)
            .or_default()
            .push(row.pid);
    }

    build_process_diagnostics(pid, &parent_to_children, &command_by_pid)
}

fn build_process_diagnostics(
    root_pid: u32,
    parent_to_children: &HashMap<u32, Vec<u32>>,
    command_by_pid: &HashMap<u32, String>,
) -> Option<RuntimeProcessDiagnostics> {
    let mut stack = vec![root_pid];
    let mut visited = HashSet::new();
    let mut total_processes = 0u32;
    let mut node_processes = 0u32;

    while let Some(current_pid) = stack.pop() {
        if !visited.insert(current_pid) {
            continue;
        }
        total_processes = total_processes.saturating_add(1);
        if let Some(command) = command_by_pid.get(&current_pid) {
            let normalized = command.to_ascii_lowercase();
            if normalized == "node"
                || normalized == "node.exe"
                || normalized.ends_with("/node")
                || normalized.ends_with("\\node.exe")
            {
                node_processes = node_processes.saturating_add(1);
            }
        }
        if let Some(children) = parent_to_children.get(&current_pid) {
            stack.extend(children.iter().copied());
        }
    }

    if total_processes == 0 {
        return None;
    }

    Some(RuntimeProcessDiagnostics {
        root_processes: 1,
        total_processes,
        node_processes,
        root_command: command_by_pid.get(&root_pid).cloned(),
        managed_runtime_processes: node_processes,
        resume_helper_processes: 0,
        orphan_residue_processes: 0,
    })
}
