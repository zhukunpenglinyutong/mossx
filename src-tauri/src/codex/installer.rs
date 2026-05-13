use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::time::timeout;

use crate::backend::app_server::{
    build_codex_path_env, build_command_for_binary, check_cli_binary, find_cli_binary,
};
use crate::types::AppSettings;

const INSTALL_TIMEOUT_SECS: u64 = 180;
const PREFLIGHT_TIMEOUT_SECS: u64 = 8;
const OUTPUT_SUMMARY_LIMIT: usize = 4_000;
const PROGRESS_CHUNK_LIMIT: usize = 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CliInstallEngine {
    Codex,
    Claude,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CliInstallAction {
    InstallLatest,
    UpdateLatest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CliInstallStrategy {
    NpmGlobal,
    CliSelfUpdate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CliInstallBackend {
    Local,
    Remote,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CliInstallPlatform {
    Macos,
    Windows,
    Linux,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliInstallPlan {
    pub(crate) engine: CliInstallEngine,
    pub(crate) action: CliInstallAction,
    pub(crate) strategy: CliInstallStrategy,
    pub(crate) backend: CliInstallBackend,
    pub(crate) platform: CliInstallPlatform,
    pub(crate) command_preview: Vec<String>,
    pub(crate) can_run: bool,
    pub(crate) blockers: Vec<String>,
    pub(crate) warnings: Vec<String>,
    pub(crate) manual_fallback: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliInstallResult {
    pub(crate) ok: bool,
    pub(crate) engine: CliInstallEngine,
    pub(crate) action: CliInstallAction,
    pub(crate) strategy: CliInstallStrategy,
    pub(crate) backend: CliInstallBackend,
    pub(crate) exit_code: Option<i32>,
    pub(crate) stdout_summary: Option<String>,
    pub(crate) stderr_summary: Option<String>,
    pub(crate) details: Option<String>,
    pub(crate) duration_ms: u128,
    pub(crate) doctor_result: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CliInstallProgressPhase {
    Started,
    Stdout,
    Stderr,
    Finished,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CliInstallOutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliInstallProgressEvent {
    pub(crate) run_id: String,
    pub(crate) engine: CliInstallEngine,
    pub(crate) action: CliInstallAction,
    pub(crate) strategy: CliInstallStrategy,
    pub(crate) backend: CliInstallBackend,
    pub(crate) phase: CliInstallProgressPhase,
    pub(crate) stream: Option<CliInstallOutputStream>,
    pub(crate) message: Option<String>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) duration_ms: Option<u128>,
}

#[derive(Debug, Clone)]
struct InstallerCommandSpec {
    npm_bin: String,
    args: Vec<String>,
    path_env: Option<String>,
}

pub(crate) type CliInstallProgressSink = Arc<dyn Fn(CliInstallProgressEvent) + Send + Sync>;

pub(crate) fn package_name_for_engine(engine: CliInstallEngine) -> &'static str {
    match engine {
        CliInstallEngine::Codex => "@openai/codex@latest",
        CliInstallEngine::Claude => "@anthropic-ai/claude-code@latest",
    }
}

fn command_preview_for(engine: CliInstallEngine) -> Vec<String> {
    vec![
        "npm".to_string(),
        "install".to_string(),
        "-g".to_string(),
        package_name_for_engine(engine).to_string(),
    ]
}

fn current_platform() -> CliInstallPlatform {
    if cfg!(target_os = "macos") {
        CliInstallPlatform::Macos
    } else if cfg!(target_os = "windows") {
        CliInstallPlatform::Windows
    } else if cfg!(target_os = "linux") {
        CliInstallPlatform::Linux
    } else {
        CliInstallPlatform::Unknown
    }
}

fn manual_fallback_for(engine: CliInstallEngine) -> String {
    command_preview_for(engine).join(" ")
}

fn engine_binary_name(engine: CliInstallEngine) -> &'static str {
    match engine {
        CliInstallEngine::Codex => "codex",
        CliInstallEngine::Claude => "claude",
    }
}

fn engine_explicit_bin<'a>(engine: CliInstallEngine, settings: &'a AppSettings) -> Option<&'a str> {
    match engine {
        CliInstallEngine::Codex => settings.codex_bin.as_deref(),
        CliInstallEngine::Claude => settings.claude_bin.as_deref(),
    }
    .filter(|value| !value.trim().is_empty())
}

async fn run_binary_version(
    binary: &str,
    path_env: Option<&String>,
) -> Result<Option<String>, String> {
    let resolved_binary = find_cli_binary(binary, None)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| binary.to_string());
    let mut command = build_command_for_binary(&resolved_binary);
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    match timeout(
        Duration::from_secs(PREFLIGHT_TIMEOUT_SECS),
        command.output(),
    )
    .await
    {
        Ok(Ok(output)) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(if version.is_empty() {
                None
            } else {
                Some(version)
            })
        }
        Ok(Ok(output)) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(if detail.is_empty() {
                format!("{binary} failed to start")
            } else {
                detail
            })
        }
        Ok(Err(error)) if error.kind() == ErrorKind::NotFound => Err("not_found".to_string()),
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err(format!("{binary} check timed out")),
    }
}

fn is_windows_wsl_boundary_path(path: &str) -> bool {
    let trimmed = path.trim();
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("\\\\wsl$\\")
        || lower.starts_with("\\\\wsl.localhost\\")
        || lower.starts_with("//wsl$/")
        || lower.starts_with("//wsl.localhost/")
}

async fn resolve_npm_prefix(path_env: Option<&String>) -> Result<Option<String>, String> {
    let npm_binary = find_cli_binary("npm", None)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "npm".to_string());
    let mut command = build_command_for_binary(&npm_binary);
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    command.arg("config");
    command.arg("get");
    command.arg("prefix");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    match timeout(
        Duration::from_secs(PREFLIGHT_TIMEOUT_SECS),
        command.output(),
    )
    .await
    {
        Ok(Ok(output)) if output.status.success() => {
            let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(if prefix.is_empty() || prefix == "undefined" {
                None
            } else {
                Some(prefix)
            })
        }
        Ok(Ok(output)) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(if detail.is_empty() {
                "failed to resolve npm global prefix".to_string()
            } else {
                detail
            })
        }
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err("npm prefix check timed out".to_string()),
    }
}

async fn npm_prefix_blocker(path_env: Option<&String>) -> Option<String> {
    let Ok(Some(prefix)) = resolve_npm_prefix(path_env).await else {
        return None;
    };
    let prefix_path = Path::new(&prefix);
    let Ok(metadata) = std::fs::metadata(prefix_path) else {
        return None;
    };
    if metadata.permissions().readonly() {
        Some(format!(
            "npm global prefix appears read-only: {prefix}. The installer will not use sudo or admin elevation."
        ))
    } else {
        None
    }
}

async fn resolve_installer_command(
    engine: CliInstallEngine,
    settings: &AppSettings,
) -> Result<InstallerCommandSpec, String> {
    let path_env = build_codex_path_env(engine_explicit_bin(engine, settings));
    let npm_path = find_cli_binary("npm", None)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "npm".to_string());

    let mut args = vec!["install".to_string(), "-g".to_string()];
    args.push(package_name_for_engine(engine).to_string());

    Ok(InstallerCommandSpec {
        npm_bin: npm_path,
        args,
        path_env,
    })
}

pub(crate) async fn build_cli_install_plan_with_backend(
    engine: CliInstallEngine,
    action: CliInstallAction,
    strategy: CliInstallStrategy,
    backend: CliInstallBackend,
    settings: &AppSettings,
) -> CliInstallPlan {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    let platform = current_platform();

    if strategy != CliInstallStrategy::NpmGlobal {
        blockers.push(
            "cliSelfUpdate is reserved for a future release; Phase 1 only supports npmGlobal."
                .to_string(),
        );
    }

    if matches!(platform, CliInstallPlatform::Unknown) {
        blockers.push("Unsupported platform for one-click installer.".to_string());
    }

    let path_env = build_codex_path_env(engine_explicit_bin(engine, settings));
    if cfg!(target_os = "windows") {
        if let Some(explicit_bin) = engine_explicit_bin(engine, settings) {
            if is_windows_wsl_boundary_path(explicit_bin) {
                blockers.push(
                    "Configured CLI path points to WSL. Windows desktop installer will not cross-install into WSL; run a remote daemon inside WSL/Linux or use the manual command there."
                        .to_string(),
                );
            }
        }
    }
    if run_binary_version("node", path_env.as_ref()).await.is_err() {
        blockers.push("Node is not available on the installer PATH.".to_string());
    }
    if run_binary_version("npm", path_env.as_ref()).await.is_err() {
        blockers.push("npm is not available on the installer PATH.".to_string());
    }
    if let Some(prefix_blocker) = npm_prefix_blocker(path_env.as_ref()).await {
        blockers.push(prefix_blocker);
    }

    let engine_binary = engine_binary_name(engine);
    match check_cli_binary(engine_binary, path_env.clone()).await {
        Ok(_) => {
            if action == CliInstallAction::InstallLatest {
                warnings.push(format!(
                    "{engine_binary} already appears to be installed; npmGlobal will reinstall @latest."
                ));
            }
        }
        Err(_) => {
            if action == CliInstallAction::UpdateLatest {
                warnings.push(format!(
                    "{engine_binary} is not currently detected; npmGlobal will still install @latest."
                ));
            }
        }
    }

    CliInstallPlan {
        engine,
        action,
        strategy,
        backend,
        platform,
        command_preview: command_preview_for(engine),
        can_run: blockers.is_empty(),
        blockers,
        warnings,
        manual_fallback: Some(manual_fallback_for(engine)),
    }
}

pub(crate) async fn build_cli_install_plan(
    engine: CliInstallEngine,
    action: CliInstallAction,
    strategy: CliInstallStrategy,
    settings: &AppSettings,
) -> CliInstallPlan {
    build_cli_install_plan_with_backend(
        engine,
        action,
        strategy,
        CliInstallBackend::Local,
        settings,
    )
    .await
}

pub(crate) async fn run_cli_installer_with_progress(
    engine: CliInstallEngine,
    action: CliInstallAction,
    strategy: CliInstallStrategy,
    settings: &AppSettings,
    run_id: Option<String>,
    progress_sink: Option<CliInstallProgressSink>,
) -> Result<CliInstallResult, String> {
    let started = Instant::now();
    let plan = build_cli_install_plan(engine, action, strategy, settings).await;
    if !plan.can_run {
        return Ok(CliInstallResult {
            ok: false,
            engine,
            action,
            strategy,
            backend: CliInstallBackend::Local,
            exit_code: None,
            stdout_summary: None,
            stderr_summary: None,
            details: Some(plan.blockers.join("; ")),
            duration_ms: started.elapsed().as_millis(),
            doctor_result: None,
        });
    }

    let run_id = normalize_run_id(run_id, engine);
    emit_progress(
        &progress_sink,
        CliInstallProgressEvent {
            run_id: run_id.clone(),
            engine,
            action,
            strategy,
            backend: CliInstallBackend::Local,
            phase: CliInstallProgressPhase::Started,
            stream: None,
            message: Some(manual_fallback_for(engine)),
            exit_code: None,
            duration_ms: Some(0),
        },
    );

    let command_spec = resolve_installer_command(engine, settings).await?;
    let mut command = build_command_for_binary(&command_spec.npm_bin);
    if let Some(path_env) = &command_spec.path_env {
        command.env("PATH", path_env);
    }
    command.args(&command_spec.args);
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        let message = format!("failed to start CLI installer: {error}");
        emit_progress(
            &progress_sink,
            CliInstallProgressEvent {
                run_id: run_id.clone(),
                engine,
                action,
                strategy,
                backend: CliInstallBackend::Local,
                phase: CliInstallProgressPhase::Error,
                stream: None,
                message: Some(message.clone()),
                exit_code: None,
                duration_ms: Some(started.elapsed().as_millis()),
            },
        );
        message
    })?;
    let stdout_task = tokio::spawn(read_output_stream(
        child.stdout.take(),
        run_id.clone(),
        engine,
        action,
        strategy,
        CliInstallOutputStream::Stdout,
        progress_sink.clone(),
    ));
    let stderr_task = tokio::spawn(read_output_stream(
        child.stderr.take(),
        run_id.clone(),
        engine,
        action,
        strategy,
        CliInstallOutputStream::Stderr,
        progress_sink.clone(),
    ));

    let status = timeout(Duration::from_secs(INSTALL_TIMEOUT_SECS), child.wait())
        .await
        .map_err(|_| {
            let _ = child.start_kill();
            emit_progress(
                &progress_sink,
                CliInstallProgressEvent {
                    run_id: run_id.clone(),
                    engine,
                    action,
                    strategy,
                    backend: CliInstallBackend::Local,
                    phase: CliInstallProgressPhase::Error,
                    stream: None,
                    message: Some("CLI installer timed out.".to_string()),
                    exit_code: None,
                    duration_ms: Some(started.elapsed().as_millis()),
                },
            );
            "CLI installer timed out.".to_string()
        })?
        .map_err(|error| format!("failed to run CLI installer: {error}"))?;
    let stdout_text = stdout_task
        .await
        .map_err(|error| format!("failed to join CLI installer stdout reader: {error}"))??;
    let stderr_text = stderr_task
        .await
        .map_err(|error| format!("failed to join CLI installer stderr reader: {error}"))??;

    let ok = status.success();
    let (doctor_result, doctor_details) = if ok {
        match run_post_install_doctor(engine, settings).await {
            Ok(result) => (Some(result), None),
            Err(error) => (
                None,
                Some(format!(
                    "CLI installer completed, but post-install doctor failed: {error}"
                )),
            ),
        }
    } else {
        (None, None)
    };

    let result = CliInstallResult {
        ok,
        engine,
        action,
        strategy,
        backend: CliInstallBackend::Local,
        exit_code: status.code(),
        stdout_summary: summarize_output(&stdout_text),
        stderr_summary: summarize_output(&stderr_text),
        details: if let Some(detail) = doctor_details {
            Some(detail)
        } else if ok {
            None
        } else {
            Some("CLI installer exited with a non-zero status.".to_string())
        },
        duration_ms: started.elapsed().as_millis(),
        doctor_result,
    };
    emit_progress(
        &progress_sink,
        CliInstallProgressEvent {
            run_id,
            engine,
            action,
            strategy,
            backend: CliInstallBackend::Local,
            phase: if ok {
                CliInstallProgressPhase::Finished
            } else {
                CliInstallProgressPhase::Error
            },
            stream: None,
            message: result.details.clone(),
            exit_code: result.exit_code,
            duration_ms: Some(result.duration_ms),
        },
    );
    Ok(result)
}

fn normalize_run_id(run_id: Option<String>, engine: CliInstallEngine) -> String {
    run_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            format!(
                "{}-{}",
                engine_binary_name(engine),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|duration| duration.as_millis())
                    .unwrap_or_default()
            )
        })
}

async fn run_post_install_doctor(
    engine: CliInstallEngine,
    settings: &AppSettings,
) -> Result<Value, String> {
    match engine {
        CliInstallEngine::Codex => {
            crate::codex::run_codex_doctor_with_settings(None, None, settings).await
        }
        CliInstallEngine::Claude => {
            crate::codex::run_claude_doctor_with_settings(None, settings).await
        }
    }
}

fn summarize_output(output: &str) -> Option<String> {
    let redacted = redact_sensitive_output(output.trim());
    if redacted.is_empty() {
        return None;
    }
    if redacted.chars().count() <= OUTPUT_SUMMARY_LIMIT {
        return Some(redacted);
    }
    Some(format!(
        "{}\n... output truncated ...",
        truncate_for_display(&redacted, OUTPUT_SUMMARY_LIMIT)
    ))
}

fn redact_sensitive_output(output: &str) -> String {
    output
        .split_whitespace()
        .map(|part| {
            let lower = part.to_ascii_lowercase();
            if lower.contains("token=")
                || lower.contains("apikey=")
                || lower.contains("api_key=")
                || lower.contains("authorization:")
            {
                "[REDACTED]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn summarize_progress_chunk(output: &str) -> Option<String> {
    let redacted = redact_sensitive_output(output.trim());
    if redacted.is_empty() {
        return None;
    }
    if redacted.chars().count() <= PROGRESS_CHUNK_LIMIT {
        return Some(redacted);
    }
    Some(format!(
        "{} ...",
        truncate_for_display(&redacted, PROGRESS_CHUNK_LIMIT)
    ))
}

fn truncate_for_display(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn emit_progress(progress_sink: &Option<CliInstallProgressSink>, event: CliInstallProgressEvent) {
    if let Some(sink) = progress_sink {
        sink(event);
    }
}

async fn read_output_stream<R>(
    stream: Option<R>,
    run_id: String,
    engine: CliInstallEngine,
    action: CliInstallAction,
    strategy: CliInstallStrategy,
    output_stream: CliInstallOutputStream,
    progress_sink: Option<CliInstallProgressSink>,
) -> Result<String, String>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let Some(stream) = stream else {
        return Ok(String::new());
    };
    let phase = match output_stream {
        CliInstallOutputStream::Stdout => CliInstallProgressPhase::Stdout,
        CliInstallOutputStream::Stderr => CliInstallProgressPhase::Stderr,
    };
    let mut reader = BufReader::new(stream).lines();
    let mut output = String::new();
    loop {
        let line = reader
            .next_line()
            .await
            .map_err(|error| format!("failed to read CLI installer {output_stream:?}: {error}"))?;
        let Some(line) = line else {
            break;
        };
        output.push_str(&line);
        output.push('\n');
        if let Some(message) = summarize_progress_chunk(&line) {
            emit_progress(
                &progress_sink,
                CliInstallProgressEvent {
                    run_id: run_id.clone(),
                    engine,
                    action,
                    strategy,
                    backend: CliInstallBackend::Local,
                    phase,
                    stream: Some(output_stream),
                    message: Some(message),
                    exit_code: None,
                    duration_ms: None,
                },
            );
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_installer_phase_one_command_matrix_is_bounded() {
        assert_eq!(
            command_preview_for(CliInstallEngine::Codex),
            vec![
                "npm".to_string(),
                "install".to_string(),
                "-g".to_string(),
                "@openai/codex@latest".to_string()
            ]
        );
        assert_eq!(
            command_preview_for(CliInstallEngine::Claude),
            vec![
                "npm".to_string(),
                "install".to_string(),
                "-g".to_string(),
                "@anthropic-ai/claude-code@latest".to_string()
            ]
        );
    }

    #[tokio::test]
    async fn cli_installer_self_update_strategy_is_blocked() {
        let plan = build_cli_install_plan(
            CliInstallEngine::Codex,
            CliInstallAction::UpdateLatest,
            CliInstallStrategy::CliSelfUpdate,
            &AppSettings::default(),
        )
        .await;

        assert!(!plan.can_run);
        assert!(plan
            .blockers
            .iter()
            .any(|blocker| blocker.contains("cliSelfUpdate")));
    }

    #[test]
    fn cli_installer_output_summary_redacts_and_truncates() {
        let summary = summarize_output(&format!(
            "token=secret {}",
            "x".repeat(OUTPUT_SUMMARY_LIMIT + 20)
        ))
        .expect("summary");
        assert!(summary.contains("[REDACTED]"));
        assert!(summary.contains("output truncated"));
        assert!(!summary.contains("token=secret"));
    }

    #[test]
    fn cli_installer_progress_chunk_is_redacted_and_bounded() {
        let chunk = summarize_progress_chunk(&format!(
            "api_key=secret {}",
            "x".repeat(PROGRESS_CHUNK_LIMIT + 20)
        ))
        .expect("chunk");
        assert!(chunk.contains("[REDACTED]"));
        assert!(chunk.ends_with(" ..."));
        assert!(!chunk.contains("api_key=secret"));
    }

    #[test]
    fn cli_installer_truncates_unicode_without_panicking() {
        let summary = summarize_output(&"安装".repeat(OUTPUT_SUMMARY_LIMIT + 1)).expect("summary");
        assert!(summary.contains("output truncated"));
        assert!(summary.is_char_boundary(summary.len()));
    }

    #[test]
    fn cli_installer_blank_run_id_falls_back_to_generated_id() {
        let run_id = normalize_run_id(Some("   ".to_string()), CliInstallEngine::Claude);
        assert!(run_id.starts_with("claude-"));
    }

    #[test]
    fn cli_installer_detects_windows_wsl_boundary_paths() {
        assert!(is_windows_wsl_boundary_path(r"\\wsl$\Ubuntu\home\me\.npm"));
        assert!(is_windows_wsl_boundary_path(
            r"\\wsl.localhost\Ubuntu\home\me\.npm"
        ));
        assert!(!is_windows_wsl_boundary_path(
            r"C:\Users\me\AppData\Roaming\npm"
        ));
    }
}
