use tokio::process::Command;

use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) fn parse_codex_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Codex args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

pub(crate) fn apply_codex_args(command: &mut Command, value: Option<&str>) -> Result<(), String> {
    let args = parse_codex_args(value)?;
    if !args.is_empty() {
        command.args(args);
    }
    Ok(())
}

pub(crate) fn resolve_workspace_codex_args(
    entry: &WorkspaceEntry,
    parent_entry: Option<&WorkspaceEntry>,
    app_settings: Option<&AppSettings>,
) -> Option<String> {
    let unified_exec_override = app_settings.and_then(AppSettings::codex_unified_exec_override);
    if let Some(value) = entry.settings.codex_args.as_deref() {
        if let Some(normalized) =
            normalize_codex_args_with_runtime_overrides(value, unified_exec_override)
        {
            return Some(normalized);
        }
    }
    if entry.kind.is_worktree() {
        if let Some(parent) = parent_entry {
            if let Some(value) = parent.settings.codex_args.as_deref() {
                if let Some(normalized) =
                    normalize_codex_args_with_runtime_overrides(value, unified_exec_override)
                {
                    return Some(normalized);
                }
            }
        }
    }
    if let Some(settings) = app_settings {
        if let Some(value) = settings.codex_args.as_deref() {
            return normalize_codex_args_with_runtime_overrides(value, unified_exec_override);
        }
    }
    None
}

fn normalize_codex_args(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_codex_args_with_runtime_overrides(
    value: &str,
    unified_exec_override: Option<bool>,
) -> Option<String> {
    let normalized = normalize_codex_args(value)?;
    match unified_exec_override {
        Some(enabled) => rewrite_codex_args_with_unified_exec_override(&normalized, enabled)
            .ok()
            .or(Some(normalized)),
        None => Some(normalized),
    }
}

fn rewrite_codex_args_with_unified_exec_override(
    value: &str,
    enabled: bool,
) -> Result<String, String> {
    let args = parse_codex_args(Some(value))?;
    let mut filtered = Vec::with_capacity(args.len() + 2);
    let mut index = 0;
    while index < args.len() {
        let current = &args[index];
        if (current == "-c" || current == "--config") && index + 1 < args.len() {
            if is_unified_exec_config_override(&args[index + 1]) {
                index += 2;
                continue;
            }
        }
        if let Some(inline) = current.strip_prefix("--config=") {
            if is_unified_exec_config_override(inline) {
                index += 1;
                continue;
            }
        }
        filtered.push(current.clone());
        index += 1;
    }
    filtered.push("-c".to_string());
    filtered.push(format!(
        "features.unified_exec={}",
        if enabled { "true" } else { "false" }
    ));
    Ok(join_shell_args(&filtered))
}

fn is_unified_exec_config_override(value: &str) -> bool {
    value
        .split('=')
        .next()
        .map(str::trim)
        .is_some_and(|key| key == "features.unified_exec")
}

fn join_shell_args(args: &[String]) -> String {
    args.iter()
        .map(|arg| shell_escape_arg(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_escape_arg(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if value.chars().all(|ch| {
        ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.' | '/' | ':' | '=' | '+')
    }) {
        return value.to_string();
    }
    let escaped = value.replace('\'', "'\"'\"'");
    format!("'{escaped}'")
}

#[cfg(test)]
mod tests {
    use super::{parse_codex_args, resolve_workspace_codex_args};
    use crate::types::{
        AppSettings, CodexUnifiedExecPolicy, WorkspaceEntry, WorkspaceKind, WorkspaceSettings,
    };

    #[test]
    fn parses_empty_args() {
        assert!(parse_codex_args(None).expect("parse none").is_empty());
        assert!(parse_codex_args(Some("   "))
            .expect("parse blanks")
            .is_empty());
    }

    #[test]
    fn parses_simple_args() {
        let args = parse_codex_args(Some("--profile personal --flag")).expect("parse args");
        assert_eq!(args, vec!["--profile", "personal", "--flag"]);
    }

    #[test]
    fn parses_quoted_args() {
        let args = parse_codex_args(Some("--path \"a b\" --name='c d'")).expect("parse args");
        assert_eq!(args, vec!["--path", "a b", "--name=c d"]);
    }

    #[test]
    fn resolves_workspace_codex_args_precedence() {
        let mut app_settings = AppSettings::default();
        app_settings.codex_args = Some("--profile app".to_string());

        let parent = WorkspaceEntry {
            id: "parent".to_string(),
            name: "Parent".to_string(),
            path: "/tmp/parent".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings {
                codex_args: Some("--profile parent".to_string()),
                ..WorkspaceSettings::default()
            },
        };

        let child = WorkspaceEntry {
            id: "child".to_string(),
            name: "Child".to_string(),
            path: "/tmp/child".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Worktree,
            parent_id: Some(parent.id.clone()),
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let resolved = resolve_workspace_codex_args(&child, Some(&parent), Some(&app_settings));
        assert_eq!(resolved.as_deref(), Some("--profile parent"));

        let mut override_child = child.clone();
        override_child.settings.codex_args = Some("  --profile child  ".to_string());
        let resolved_child =
            resolve_workspace_codex_args(&override_child, Some(&parent), Some(&app_settings));
        assert_eq!(resolved_child.as_deref(), Some("--profile child"));

        let main = WorkspaceEntry {
            id: "main".to_string(),
            name: "Main".to_string(),
            path: "/tmp/main".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let resolved_main = resolve_workspace_codex_args(&main, None, Some(&app_settings));
        assert_eq!(resolved_main.as_deref(), Some("--profile app"));
    }

    #[test]
    fn resolves_workspace_codex_args_appends_unified_exec_override() {
        let mut app_settings = AppSettings::default();
        app_settings.codex_args = Some("--profile app -c features.unified_exec=false".to_string());
        app_settings.codex_unified_exec_policy = CodexUnifiedExecPolicy::ForceEnabled;

        let main = WorkspaceEntry {
            id: "main".to_string(),
            name: "Main".to_string(),
            path: "/tmp/main".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let resolved =
            resolve_workspace_codex_args(&main, None, Some(&app_settings)).expect("resolved args");

        assert_eq!(
            parse_codex_args(Some(&resolved)).expect("parse resolved"),
            vec!["--profile", "app", "-c", "features.unified_exec=true"]
        );
    }
}
