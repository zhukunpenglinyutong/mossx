#[cfg(any(target_os = "windows", test))]
use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "windows", test))]
use std::path::{Path, PathBuf};
#[cfg(any(target_os = "windows", test))]
use std::sync::Mutex;

#[cfg(any(target_os = "windows", test))]
use crate::app_paths;

#[cfg(any(target_os = "windows", test))]
const STARTUP_GUARD_FILENAME: &str = "startup_guard.json";
#[cfg(any(target_os = "windows", test))]
const COMPAT_MODE_THRESHOLD: u32 = 1;
#[cfg(any(target_os = "windows", test))]
const GPU_FALLBACK_THRESHOLD: u32 = 2;
#[cfg(any(target_os = "windows", test))]
static STARTUP_GUARD_STATE_LOCK: Mutex<()> = Mutex::new(());

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, Copy)]
pub(crate) struct StartupGuardDecision {
    pub(crate) enable_webview2_compat_mode: bool,
    pub(crate) enable_webview2_gpu_fallback: bool,
    pub(crate) consecutive_unready_launches: u32,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
struct StartupGuardState {
    consecutive_unready_launches: u32,
    launch_in_progress: bool,
}

#[cfg(any(target_os = "windows", test))]
fn guard_file_path() -> Result<PathBuf, String> {
    Ok(app_paths::app_home_dir()?.join(STARTUP_GUARD_FILENAME))
}

#[cfg(any(target_os = "windows", test))]
fn read_state(path: &Path) -> Result<StartupGuardState, String> {
    if !path.exists() {
        return Ok(StartupGuardState::default());
    }
    let raw = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[cfg(any(target_os = "windows", test))]
fn write_state(path: &Path, state: &StartupGuardState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(path, raw).map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn prepare_launch_with_path(path: &Path) -> Result<StartupGuardDecision, String> {
    let mut state = read_state(path)?;
    if state.launch_in_progress {
        state.consecutive_unready_launches = state.consecutive_unready_launches.saturating_add(1);
    } else {
        state.consecutive_unready_launches = 0;
    }

    let decision = StartupGuardDecision {
        enable_webview2_compat_mode: state.consecutive_unready_launches >= COMPAT_MODE_THRESHOLD,
        enable_webview2_gpu_fallback: state.consecutive_unready_launches >= GPU_FALLBACK_THRESHOLD,
        consecutive_unready_launches: state.consecutive_unready_launches,
    };

    state.launch_in_progress = true;
    write_state(path, &state)?;
    Ok(decision)
}

#[cfg(any(target_os = "windows", test))]
fn mark_renderer_ready_with_path(path: &Path) -> Result<(), String> {
    let mut state = read_state(path)?;
    state.launch_in_progress = false;
    state.consecutive_unready_launches = 0;
    write_state(path, &state)
}

#[cfg(target_os = "windows")]
pub(crate) fn prepare_launch() -> Result<StartupGuardDecision, String> {
    let _lock = STARTUP_GUARD_STATE_LOCK
        .lock()
        .map_err(|_| "Startup guard state lock poisoned".to_string())?;
    let path = guard_file_path()?;
    prepare_launch_with_path(&path)
}

#[cfg(target_os = "windows")]
pub(crate) fn mark_renderer_ready() -> Result<(), String> {
    let _lock = STARTUP_GUARD_STATE_LOCK
        .lock()
        .map_err(|_| "Startup guard state lock poisoned".to_string())?;
    let path = guard_file_path()?;
    mark_renderer_ready_with_path(&path)
}

#[cfg(target_os = "windows")]
fn parse_disable_features_argument(argument: &str) -> Option<Vec<String>> {
    let normalized = argument.trim_matches(|c| c == '"' || c == '\'');
    let (key, value) = normalized.split_once('=')?;
    if !key.eq_ignore_ascii_case("--disable-features") {
        return None;
    }
    let features: Vec<String> = value
        .split(',')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_ascii_lowercase())
        .collect();
    if features.is_empty() {
        return None;
    }
    Some(features)
}

#[cfg(target_os = "windows")]
fn webview2_argument_exists(existing: &str, argument: &str) -> bool {
    if let Some(target_features) = parse_disable_features_argument(argument) {
        return existing
            .split_whitespace()
            .filter_map(parse_disable_features_argument)
            .any(|current_features| {
                target_features
                    .iter()
                    .all(|feature| current_features.iter().any(|item| item == feature))
            });
    }
    existing.split_whitespace().any(|token| {
        token
            .trim_matches(|c| c == '"' || c == '\'')
            .eq_ignore_ascii_case(argument.trim_matches(|c| c == '"' || c == '\''))
    })
}

#[cfg(target_os = "windows")]
fn append_webview2_browser_argument(argument: &str) {
    let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    if webview2_argument_exists(&existing, argument) {
        return;
    }
    let next = if existing.trim().is_empty() {
        argument.to_string()
    } else {
        format!("{existing} {argument}")
    };
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", next);
}

#[cfg(target_os = "windows")]
pub(crate) fn apply_webview2_compat_env() {
    append_webview2_browser_argument("--disable-features=RendererCodeIntegrity");
}

#[cfg(target_os = "windows")]
pub(crate) fn apply_webview2_gpu_fallback_env() {
    append_webview2_browser_argument("--disable-gpu");
}

#[tauri::command]
pub(crate) fn bootstrap_mark_renderer_ready() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return mark_renderer_ready();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        mark_renderer_ready_with_path, prepare_launch_with_path, read_state, StartupGuardState,
    };
    use uuid::Uuid;

    #[test]
    fn first_launch_does_not_enable_compat_mode() {
        let temp_dir = std::env::temp_dir().join(format!("ccgui-startup-guard-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("startup_guard.json");

        let decision = prepare_launch_with_path(&path).expect("prepare first launch");
        assert!(!decision.enable_webview2_compat_mode);
        assert!(!decision.enable_webview2_gpu_fallback);
        assert_eq!(decision.consecutive_unready_launches, 0);

        let state = read_state(&path).expect("read state");
        assert_eq!(
            state,
            StartupGuardState {
                consecutive_unready_launches: 0,
                launch_in_progress: true,
            }
        );

        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn second_unready_launch_enables_compat_mode() {
        let temp_dir = std::env::temp_dir().join(format!("ccgui-startup-guard-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("startup_guard.json");

        let first = prepare_launch_with_path(&path).expect("prepare first launch");
        assert!(!first.enable_webview2_compat_mode);
        assert!(!first.enable_webview2_gpu_fallback);
        let second = prepare_launch_with_path(&path).expect("prepare second launch");
        assert!(second.enable_webview2_compat_mode);
        assert!(!second.enable_webview2_gpu_fallback);
        assert_eq!(second.consecutive_unready_launches, 1);

        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn third_unready_launch_enables_gpu_fallback() {
        let temp_dir = std::env::temp_dir().join(format!("ccgui-startup-guard-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("startup_guard.json");

        let _ = prepare_launch_with_path(&path).expect("prepare first launch");
        let _ = prepare_launch_with_path(&path).expect("prepare second launch");
        let third = prepare_launch_with_path(&path).expect("prepare third launch");

        assert!(third.enable_webview2_compat_mode);
        assert!(third.enable_webview2_gpu_fallback);
        assert_eq!(third.consecutive_unready_launches, 2);

        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn mark_ready_resets_consecutive_failures() {
        let temp_dir = std::env::temp_dir().join(format!("ccgui-startup-guard-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("startup_guard.json");

        let _ = prepare_launch_with_path(&path).expect("prepare first launch");
        let _ = prepare_launch_with_path(&path).expect("prepare second launch");
        mark_renderer_ready_with_path(&path).expect("mark ready");
        let next = prepare_launch_with_path(&path).expect("prepare next launch");

        assert!(!next.enable_webview2_compat_mode);
        assert!(!next.enable_webview2_gpu_fallback);
        assert_eq!(next.consecutive_unready_launches, 0);

        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn corrupted_state_falls_back_to_default() {
        let temp_dir = std::env::temp_dir().join(format!("ccgui-startup-guard-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("startup_guard.json");
        std::fs::write(&path, "{not-json").expect("write corrupted json");

        let decision =
            prepare_launch_with_path(&path).expect("prepare launch with corrupted state");
        assert!(!decision.enable_webview2_compat_mode);
        assert!(!decision.enable_webview2_gpu_fallback);
        assert_eq!(decision.consecutive_unready_launches, 0);

        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn detects_disable_features_argument_case_insensitively() {
        let existing = "--disable-features=renderercodeintegrity,MsPdf";
        let target = "--disable-features=RendererCodeIntegrity";
        assert!(super::webview2_argument_exists(existing, target));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn detects_disable_features_argument_when_quoted() {
        let existing = "\"--disable-features=RendererCodeIntegrity,SomeFeature\"";
        let target = "--disable-features=RendererCodeIntegrity";
        assert!(super::webview2_argument_exists(existing, target));
    }
}
