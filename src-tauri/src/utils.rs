use std::env;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

/// On Windows, the CREATE_NO_WINDOW flag (0x08000000) prevents child processes
/// from creating visible console windows. Without this flag, every spawned
/// process (cmd.exe, git, node, etc.) opens its own terminal window.
///
/// NOTE: This flag can interfere with stdio pipe handling for some .cmd wrapper
/// scripts. Set the environment variable CODEMOSS_SHOW_CONSOLE=1 to disable
/// this flag for debugging purposes.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Check if CREATE_NO_WINDOW should be applied.
/// Returns false if CODEMOSS_SHOW_CONSOLE=1 is set (useful for debugging pipe issues).
#[cfg(windows)]
fn should_hide_console() -> bool {
    !matches!(env::var("CODEMOSS_SHOW_CONSOLE").as_deref(), Ok("1") | Ok("true"))
}

/// Create a tokio async Command that won't open a visible console window on Windows.
pub(crate) fn async_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    if should_hide_console() {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Create a std sync Command that won't open a visible console window on Windows.
pub(crate) fn std_command(program: impl AsRef<OsStr>) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        if should_hide_console() {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
    }
    cmd
}

#[allow(dead_code)]
pub(crate) fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
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

pub(crate) fn resolve_git_binary() -> Result<PathBuf, String> {
    if let Some(path) = find_in_path("git") {
        return Ok(path);
    }
    if cfg!(windows) {
        if let Some(path) = find_in_path("git.exe") {
            return Ok(path);
        }
    }

    let candidates: &[&str] = if cfg!(windows) {
        &[
            "C:\\Program Files\\Git\\bin\\git.exe",
            "C:\\Program Files (x86)\\Git\\bin\\git.exe",
        ]
    } else {
        &[
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
            "/usr/bin/git",
            "/opt/local/bin/git",
            "/run/current-system/sw/bin/git",
        ]
    };

    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!(
        "Git not found. Install Git or ensure it is on PATH. Tried: {}",
        candidates.join(", ")
    ))
}

pub(crate) fn git_env_path() -> String {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let defaults: &[&str] = if cfg!(windows) {
        &["C:\\Windows\\System32"]
    } else {
        &[
            "/usr/bin",
            "/bin",
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/opt/local/bin",
            "/run/current-system/sw/bin",
        ]
    };

    for candidate in defaults {
        let path = PathBuf::from(candidate);
        if !paths.contains(&path) {
            paths.push(path);
        }
    }

    let joined = env::join_paths(paths).unwrap_or_else(|_| OsString::new());
    joined.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::normalize_git_path;

    #[test]
    fn normalize_git_path_replaces_backslashes() {
        assert_eq!(normalize_git_path("foo\\bar\\baz"), "foo/bar/baz");
    }
}
