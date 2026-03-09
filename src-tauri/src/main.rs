// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(unix)]
use std::path::Path;

#[cfg(unix)]
const PROXY_ENV_KEYS: [&str; 8] = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
];

#[cfg(unix)]
fn read_env_var_non_empty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(unix)]
fn set_env_if_missing(key: &str, value: &str) {
    if read_env_var_non_empty(key).is_none() && !value.trim().is_empty() {
        std::env::set_var(key, value.trim());
    }
}

#[cfg(unix)]
fn sync_proxy_env_from_shell() -> Result<(), String> {
    let script = "if [ -f ~/.zshrc ]; then . ~/.zshrc >/dev/null 2>&1; fi; if [ -f ~/.bashrc ]; then . ~/.bashrc >/dev/null 2>&1; fi; printf '%s\\n' \"${HTTP_PROXY-}\" \"${HTTPS_PROXY-}\" \"${ALL_PROXY-}\" \"${NO_PROXY-}\" \"${http_proxy-}\" \"${https_proxy-}\" \"${all_proxy-}\" \"${no_proxy-}\"";
    let mut last_error: Option<String> = None;
    let mut output_opt = None;
    for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
        if !Path::new(shell).exists() {
            continue;
        }
        match std::process::Command::new(shell).arg("-lc").arg(script).output() {
            Ok(output) if output.status.success() => {
                output_opt = Some(output);
                break;
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stderr.is_empty() {
                    last_error = Some(stderr);
                }
            }
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }
    }
    let Some(output) = output_opt else {
        return Err(last_error.unwrap_or_else(|| "no available POSIX shell for proxy sync".to_string()));
    };

    let mut values = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .collect::<Vec<_>>();
    if values.len() < PROXY_ENV_KEYS.len() {
        values.resize(PROXY_ENV_KEYS.len(), String::new());
    }
    for (index, key) in PROXY_ENV_KEYS.iter().enumerate() {
        if let Some(value) = values.get(index) {
            set_env_if_missing(key, value);
        }
    }

    // Mirror upper/lower proxy env to maximize compatibility across different CLIs.
    if let Some(value) =
        read_env_var_non_empty("HTTP_PROXY").or_else(|| read_env_var_non_empty("http_proxy"))
    {
        set_env_if_missing("HTTP_PROXY", &value);
        set_env_if_missing("http_proxy", &value);
    }
    if let Some(value) =
        read_env_var_non_empty("HTTPS_PROXY").or_else(|| read_env_var_non_empty("https_proxy"))
    {
        set_env_if_missing("HTTPS_PROXY", &value);
        set_env_if_missing("https_proxy", &value);
    }
    if let Some(value) =
        read_env_var_non_empty("ALL_PROXY").or_else(|| read_env_var_non_empty("all_proxy"))
    {
        set_env_if_missing("ALL_PROXY", &value);
        set_env_if_missing("all_proxy", &value);
    }
    if let Some(value) =
        read_env_var_non_empty("NO_PROXY").or_else(|| read_env_var_non_empty("no_proxy"))
    {
        set_env_if_missing("NO_PROXY", &value);
        set_env_if_missing("no_proxy", &value);
    }
    Ok(())
}

fn main() {
    if let Err(err) = fix_path_env::fix() {
        eprintln!("Failed to sync PATH from shell: {err}");
    }
    #[cfg(unix)]
    if let Err(err) = sync_proxy_env_from_shell() {
        eprintln!("Failed to sync proxy env from shell: {err}");
    }
    moss_x_lib::run()
}
