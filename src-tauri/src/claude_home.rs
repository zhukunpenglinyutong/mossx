use std::path::{Path, PathBuf};

use crate::engine::EngineConfig;

pub(crate) fn normalize_home_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "~" {
        return dirs::home_dir();
    }
    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    if trimmed == "$HOME" || trimmed == "${HOME}" || trimmed == "%USERPROFILE%" {
        return dirs::home_dir();
    }
    if let Some(rest) = trimmed
        .strip_prefix("$HOME/")
        .or_else(|| trimmed.strip_prefix("$HOME\\"))
    {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    if let Some(rest) = trimmed
        .strip_prefix("${HOME}/")
        .or_else(|| trimmed.strip_prefix("${HOME}\\"))
    {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    if let Some(rest) = trimmed
        .strip_prefix("%USERPROFILE%/")
        .or_else(|| trimmed.strip_prefix("%USERPROFILE%\\"))
    {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    Some(PathBuf::from(trimmed))
}

pub(crate) fn resolve_effective_claude_home(config: Option<&EngineConfig>) -> Option<PathBuf> {
    if let Some(path) = config
        .and_then(|item| item.home_dir.as_deref())
        .and_then(normalize_home_path)
    {
        return Some(path);
    }
    if let Ok(value) = std::env::var("CLAUDE_HOME") {
        if let Some(path) = normalize_home_path(&value) {
            return Some(path);
        }
    }
    dirs::home_dir().map(|home| home.join(".claude"))
}

pub(crate) fn resolve_claude_projects_dir(config: Option<&EngineConfig>) -> Option<PathBuf> {
    resolve_effective_claude_home(config).map(|home| home.join("projects"))
}

#[allow(dead_code)]
pub(crate) fn commands_dir_from_home(home_dir: &Path) -> Option<PathBuf> {
    let primary = home_dir.join("commands");
    if primary.exists() {
        return Some(primary);
    }
    let fallback = home_dir.join("Commands");
    if fallback.exists() {
        return Some(fallback);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvVarGuard {
        previous: Option<String>,
    }

    impl EnvVarGuard {
        fn set(value: &Path) -> Self {
            let previous = std::env::var("CLAUDE_HOME").ok();
            unsafe {
                std::env::set_var("CLAUDE_HOME", value);
            }
            Self { previous }
        }

        fn remove() -> Self {
            let previous = std::env::var("CLAUDE_HOME").ok();
            unsafe {
                std::env::remove_var("CLAUDE_HOME");
            }
            Self { previous }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            unsafe {
                if let Some(previous) = self.previous.as_ref() {
                    std::env::set_var("CLAUDE_HOME", previous);
                } else {
                    std::env::remove_var("CLAUDE_HOME");
                }
            }
        }
    }

    fn temp_home(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("ccgui-claude-home-{name}"))
    }

    #[test]
    fn resolves_configured_claude_home_before_env() {
        let configured_home = temp_home("configured");
        let config = EngineConfig {
            home_dir: Some(configured_home.to_string_lossy().to_string()),
            ..EngineConfig::default()
        };

        assert_eq!(
            resolve_effective_claude_home(Some(&config)),
            Some(configured_home)
        );
    }

    #[test]
    fn resolves_default_projects_dir_from_configured_home() {
        let configured_home = temp_home("projects");
        let config = EngineConfig {
            home_dir: Some(configured_home.to_string_lossy().to_string()),
            ..EngineConfig::default()
        };

        assert_eq!(
            resolve_claude_projects_dir(Some(&config)),
            Some(configured_home.join("projects"))
        );
    }

    #[test]
    fn resolves_claude_home_from_env_when_config_absent() {
        let _lock = ENV_LOCK.lock().expect("env test lock poisoned");
        let env_home = temp_home("env");
        let _guard = EnvVarGuard::set(&env_home);

        assert_eq!(resolve_effective_claude_home(None), Some(env_home));
    }

    #[test]
    fn falls_back_to_default_home_when_config_and_env_absent() {
        let _lock = ENV_LOCK.lock().expect("env test lock poisoned");
        let _guard = EnvVarGuard::remove();
        let Some(home) = dirs::home_dir() else {
            return;
        };

        assert_eq!(
            resolve_effective_claude_home(None),
            Some(home.join(".claude"))
        );
    }

    #[test]
    fn expands_tilde_home_path() {
        let Some(home) = dirs::home_dir() else {
            return;
        };

        assert_eq!(
            normalize_home_path("~/custom-claude"),
            Some(home.join("custom-claude"))
        );
        assert_eq!(
            normalize_home_path("~\\custom-claude"),
            Some(home.join("custom-claude"))
        );
    }

    #[test]
    fn expands_home_environment_style_paths() {
        let Some(home) = dirs::home_dir() else {
            return;
        };

        assert_eq!(
            normalize_home_path("$HOME/custom-claude"),
            Some(home.join("custom-claude"))
        );
        assert_eq!(
            normalize_home_path("$HOME\\custom-claude"),
            Some(home.join("custom-claude"))
        );
        assert_eq!(
            normalize_home_path("%USERPROFILE%\\custom-claude"),
            Some(home.join("custom-claude"))
        );
    }
}
