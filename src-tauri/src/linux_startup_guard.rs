#[cfg(any(target_os = "linux", test))]
use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "linux", test))]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::sync::Mutex;

#[cfg(target_os = "linux")]
use crate::app_paths;

#[cfg(target_os = "linux")]
const LINUX_STARTUP_GUARD_FILENAME: &str = "linux_startup_guard.json";
#[cfg(any(target_os = "linux", test))]
const COMPOSITING_MODE_FALLBACK_THRESHOLD: u32 = 1;
#[cfg(target_os = "linux")]
static LINUX_STARTUP_GUARD_STATE_LOCK: Mutex<()> = Mutex::new(());

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct LinuxStartupContext {
    xdg_session_type: Option<String>,
    wayland_display_present: bool,
    display_present: bool,
    appimage_present: bool,
    appdir_present: bool,
    user_dmabuf_override: bool,
    user_compositing_override: bool,
    gtk_im_module: Option<String>,
    qt_im_module: Option<String>,
    xmodifiers: Option<String>,
    clutter_im_module: Option<String>,
}

#[cfg(any(target_os = "linux", test))]
impl LinuxStartupContext {
    fn is_wayland(&self) -> bool {
        self.xdg_session_type
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case("wayland"))
            || self.wayland_display_present
    }

    fn is_appimage(&self) -> bool {
        self.appimage_present || self.appdir_present
    }

    fn is_high_risk(&self) -> bool {
        self.is_wayland() && self.is_appimage()
    }
}

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LinuxImeModule {
    Fcitx,
    Ibus,
}

#[cfg(any(target_os = "linux", test))]
impl LinuxImeModule {
    fn as_env_value(self) -> &'static str {
        match self {
            Self::Fcitx => "fcitx",
            Self::Ibus => "ibus",
        }
    }
}

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct LinuxImeEnvUpdates {
    pub(crate) gtk_im_module: Option<&'static str>,
    pub(crate) qt_im_module: Option<&'static str>,
}

#[cfg(target_os = "linux")]
impl LinuxStartupContext {
    fn from_env() -> Self {
        Self {
            xdg_session_type: std::env::var("XDG_SESSION_TYPE")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            wayland_display_present: std::env::var_os("WAYLAND_DISPLAY").is_some(),
            display_present: std::env::var_os("DISPLAY").is_some(),
            appimage_present: std::env::var_os("APPIMAGE").is_some(),
            appdir_present: std::env::var_os("APPDIR").is_some(),
            user_dmabuf_override: std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some(),
            user_compositing_override: std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE")
                .is_some(),
            gtk_im_module: env_value("GTK_IM_MODULE"),
            qt_im_module: env_value("QT_IM_MODULE"),
            xmodifiers: env_value("XMODIFIERS"),
            clutter_im_module: env_value("CLUTTER_IM_MODULE"),
        }
    }
}

#[cfg(target_os = "linux")]
fn env_value(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
struct LinuxStartupGuardState {
    consecutive_unready_launches: u32,
    launch_in_progress: bool,
    last_context_high_risk: bool,
}

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LinuxStartupGuardDecision {
    pub(crate) high_risk_context: bool,
    pub(crate) detected_wayland: bool,
    pub(crate) appimage_present: bool,
    pub(crate) appdir_present: bool,
    pub(crate) wayland_display_present: bool,
    pub(crate) display_present: bool,
    pub(crate) user_dmabuf_override: bool,
    pub(crate) user_compositing_override: bool,
    pub(crate) ime_env_updates: LinuxImeEnvUpdates,
    pub(crate) enable_dmabuf_renderer_fallback: bool,
    pub(crate) enable_compositing_mode_fallback: bool,
    pub(crate) consecutive_unready_launches: u32,
    pub(crate) xdg_session_type: Option<String>,
}

#[cfg(any(target_os = "linux", test))]
impl LinuxStartupGuardDecision {
    fn from_context(context: &LinuxStartupContext, consecutive_unready_launches: u32) -> Self {
        let high_risk_context = context.is_high_risk();
        let enable_dmabuf_renderer_fallback = high_risk_context && !context.user_dmabuf_override;
        let enable_compositing_mode_fallback = high_risk_context
            && consecutive_unready_launches >= COMPOSITING_MODE_FALLBACK_THRESHOLD
            && !context.user_compositing_override;

        Self {
            high_risk_context,
            detected_wayland: context.is_wayland(),
            appimage_present: context.appimage_present,
            appdir_present: context.appdir_present,
            wayland_display_present: context.wayland_display_present,
            display_present: context.display_present,
            user_dmabuf_override: context.user_dmabuf_override,
            user_compositing_override: context.user_compositing_override,
            ime_env_updates: resolve_ime_env_updates(context),
            enable_dmabuf_renderer_fallback,
            enable_compositing_mode_fallback,
            consecutive_unready_launches,
            xdg_session_type: context.xdg_session_type.clone(),
        }
    }
}

#[cfg(any(target_os = "linux", test))]
fn detect_ime_module(context: &LinuxStartupContext) -> Option<LinuxImeModule> {
    let signals = [
        context.xmodifiers.as_deref(),
        context.clutter_im_module.as_deref(),
        context.gtk_im_module.as_deref(),
        context.qt_im_module.as_deref(),
    ];

    if signals
        .iter()
        .flatten()
        .any(|value| value.to_ascii_lowercase().contains("fcitx"))
    {
        return Some(LinuxImeModule::Fcitx);
    }

    if signals
        .iter()
        .flatten()
        .any(|value| value.to_ascii_lowercase().contains("ibus"))
    {
        return Some(LinuxImeModule::Ibus);
    }

    None
}

#[cfg(any(target_os = "linux", test))]
fn resolve_ime_env_updates(context: &LinuxStartupContext) -> LinuxImeEnvUpdates {
    let Some(module) = detect_ime_module(context) else {
        return LinuxImeEnvUpdates::default();
    };

    LinuxImeEnvUpdates {
        gtk_im_module: context
            .gtk_im_module
            .is_none()
            .then_some(module.as_env_value()),
        qt_im_module: context
            .qt_im_module
            .is_none()
            .then_some(module.as_env_value()),
    }
}

#[cfg(target_os = "linux")]
fn guard_file_path() -> Result<PathBuf, String> {
    Ok(app_paths::app_home_dir()?.join(LINUX_STARTUP_GUARD_FILENAME))
}

#[cfg(any(target_os = "linux", test))]
fn read_state(path: &Path) -> Result<LinuxStartupGuardState, String> {
    if !path.exists() {
        return Ok(LinuxStartupGuardState::default());
    }
    let raw = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[cfg(any(target_os = "linux", test))]
fn write_state(path: &Path, state: &LinuxStartupGuardState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(path, raw).map_err(|error| error.to_string())
}

#[cfg(any(target_os = "linux", test))]
fn prepare_launch_with_path(
    path: &Path,
    context: &LinuxStartupContext,
) -> Result<LinuxStartupGuardDecision, String> {
    let mut state = read_state(path)?;
    let high_risk_context = context.is_high_risk();
    let consecutive_unready_launches =
        if high_risk_context && state.launch_in_progress && state.last_context_high_risk {
            state.consecutive_unready_launches.saturating_add(1)
        } else {
            0
        };

    let decision = LinuxStartupGuardDecision::from_context(context, consecutive_unready_launches);

    state.launch_in_progress = high_risk_context;
    state.last_context_high_risk = high_risk_context;
    state.consecutive_unready_launches = if high_risk_context {
        consecutive_unready_launches
    } else {
        0
    };
    write_state(path, &state)?;
    Ok(decision)
}

#[cfg(any(target_os = "linux", test))]
fn mark_renderer_ready_with_path(path: &Path) -> Result<(), String> {
    let mut state = read_state(path)?;
    state.launch_in_progress = false;
    state.last_context_high_risk = false;
    state.consecutive_unready_launches = 0;
    write_state(path, &state)
}

#[cfg(target_os = "linux")]
pub(crate) fn prepare_launch() -> Result<LinuxStartupGuardDecision, String> {
    let _lock = LINUX_STARTUP_GUARD_STATE_LOCK
        .lock()
        .map_err(|_| "Linux startup guard state lock poisoned".to_string())?;
    let path = guard_file_path()?;
    prepare_launch_with_path(&path, &LinuxStartupContext::from_env())
}

#[cfg(target_os = "linux")]
pub(crate) fn mark_renderer_ready() -> Result<(), String> {
    let _lock = LINUX_STARTUP_GUARD_STATE_LOCK
        .lock()
        .map_err(|_| "Linux startup guard state lock poisoned".to_string())?;
    let path = guard_file_path()?;
    mark_renderer_ready_with_path(&path)
}

#[cfg(target_os = "linux")]
pub(crate) fn apply_launch_env(decision: &LinuxStartupGuardDecision) {
    if let Some(value) = decision.ime_env_updates.gtk_im_module {
        if std::env::var_os("GTK_IM_MODULE").is_none() {
            std::env::set_var("GTK_IM_MODULE", value);
        }
    }
    if let Some(value) = decision.ime_env_updates.qt_im_module {
        if std::env::var_os("QT_IM_MODULE").is_none() {
            std::env::set_var("QT_IM_MODULE", value);
        }
    }
    if decision.enable_dmabuf_renderer_fallback
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    if decision.enable_compositing_mode_fallback
        && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn log_launch_decision(decision: &LinuxStartupGuardDecision) {
    log::info!(
        "linux startup guard context: xdg_session_type={:?}, wayland_display_present={}, display_present={}, appimage_present={}, appdir_present={}, high_risk_context={}, consecutive_unready_launches={}, user_dmabuf_override={}, user_compositing_override={}",
        decision.xdg_session_type,
        decision.wayland_display_present,
        decision.display_present,
        decision.appimage_present,
        decision.appdir_present,
        decision.high_risk_context,
        decision.consecutive_unready_launches,
        decision.user_dmabuf_override,
        decision.user_compositing_override,
    );
    if decision.enable_dmabuf_renderer_fallback {
        log::warn!(
            "Linux startup guard enabled WEBKIT_DISABLE_DMABUF_RENDERER after detecting Wayland AppImage startup context"
        );
    }
    if decision.enable_compositing_mode_fallback {
        log::warn!(
            "Linux startup guard enabled WEBKIT_DISABLE_COMPOSITING_MODE after {} consecutive unready launches",
            decision.consecutive_unready_launches
        );
    }
    if decision.ime_env_updates.gtk_im_module.is_some()
        || decision.ime_env_updates.qt_im_module.is_some()
    {
        log::info!(
            "Linux startup guard repaired missing IME env: gtk_im_module={}, qt_im_module={}",
            decision
                .ime_env_updates
                .gtk_im_module
                .unwrap_or("preserved"),
            decision.ime_env_updates.qt_im_module.unwrap_or("preserved"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{
        mark_renderer_ready_with_path, prepare_launch_with_path, read_state, LinuxStartupContext,
        LinuxStartupGuardState,
    };
    use uuid::Uuid;

    fn temp_guard_path() -> std::path::PathBuf {
        let temp_dir =
            std::env::temp_dir().join(format!("ccgui-linux-startup-guard-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        temp_dir.join("linux_startup_guard.json")
    }

    fn high_risk_context() -> LinuxStartupContext {
        LinuxStartupContext {
            xdg_session_type: Some("wayland".to_string()),
            wayland_display_present: true,
            display_present: false,
            appimage_present: true,
            appdir_present: false,
            user_dmabuf_override: false,
            user_compositing_override: false,
            gtk_im_module: None,
            qt_im_module: None,
            xmodifiers: None,
            clutter_im_module: None,
        }
    }

    #[test]
    fn first_high_risk_launch_enables_only_dmabuf_fallback() {
        let path = temp_guard_path();

        let decision =
            prepare_launch_with_path(&path, &high_risk_context()).expect("prepare first launch");

        assert!(decision.high_risk_context);
        assert!(decision.enable_dmabuf_renderer_fallback);
        assert!(!decision.enable_compositing_mode_fallback);
        assert_eq!(decision.consecutive_unready_launches, 0);

        let state = read_state(&path).expect("read state");
        assert_eq!(
            state,
            LinuxStartupGuardState {
                consecutive_unready_launches: 0,
                launch_in_progress: true,
                last_context_high_risk: true,
            }
        );

        std::fs::remove_file(&path).ok();
        std::fs::remove_dir_all(path.parent().expect("temp dir")).ok();
    }

    #[test]
    fn user_overrides_disable_repo_fallback_flags() {
        let path = temp_guard_path();
        let mut context = high_risk_context();
        context.user_dmabuf_override = true;
        context.user_compositing_override = true;
        std::fs::write(
            &path,
            r#"{
  "consecutive_unready_launches": 1,
  "launch_in_progress": true,
  "last_context_high_risk": true
}"#,
        )
        .expect("seed prior unready state");

        let decision = prepare_launch_with_path(&path, &context).expect("prepare launch");

        assert!(!decision.enable_dmabuf_renderer_fallback);
        assert!(!decision.enable_compositing_mode_fallback);
        assert_eq!(decision.consecutive_unready_launches, 2);

        std::fs::remove_file(&path).ok();
        std::fs::remove_dir_all(path.parent().expect("temp dir")).ok();
    }

    #[test]
    fn second_unready_high_risk_launch_enables_compositing_fallback() {
        let path = temp_guard_path();

        let _ = prepare_launch_with_path(&path, &high_risk_context()).expect("prepare first");
        let decision =
            prepare_launch_with_path(&path, &high_risk_context()).expect("prepare second");

        assert!(decision.enable_dmabuf_renderer_fallback);
        assert!(decision.enable_compositing_mode_fallback);
        assert_eq!(decision.consecutive_unready_launches, 1);

        std::fs::remove_file(&path).ok();
        std::fs::remove_dir_all(path.parent().expect("temp dir")).ok();
    }

    #[test]
    fn renderer_ready_resets_unready_state() {
        let path = temp_guard_path();

        let _ = prepare_launch_with_path(&path, &high_risk_context()).expect("prepare first");
        let _ = prepare_launch_with_path(&path, &high_risk_context()).expect("prepare second");
        mark_renderer_ready_with_path(&path).expect("mark ready");
        let decision = prepare_launch_with_path(&path, &high_risk_context()).expect("prepare next");

        assert!(decision.enable_dmabuf_renderer_fallback);
        assert!(!decision.enable_compositing_mode_fallback);
        assert_eq!(decision.consecutive_unready_launches, 0);

        std::fs::remove_file(&path).ok();
        std::fs::remove_dir_all(path.parent().expect("temp dir")).ok();
    }

    #[test]
    fn non_high_risk_launch_does_not_enable_repo_fallback() {
        let path = temp_guard_path();
        let context = LinuxStartupContext {
            xdg_session_type: Some("x11".to_string()),
            wayland_display_present: false,
            display_present: true,
            appimage_present: true,
            appdir_present: false,
            user_dmabuf_override: false,
            user_compositing_override: false,
            gtk_im_module: None,
            qt_im_module: None,
            xmodifiers: None,
            clutter_im_module: None,
        };

        let decision = prepare_launch_with_path(&path, &context).expect("prepare x11 launch");

        assert!(!decision.high_risk_context);
        assert!(!decision.enable_dmabuf_renderer_fallback);
        assert!(!decision.enable_compositing_mode_fallback);
        assert_eq!(decision.consecutive_unready_launches, 0);

        let state = read_state(&path).expect("read state");
        assert_eq!(
            state,
            LinuxStartupGuardState {
                consecutive_unready_launches: 0,
                launch_in_progress: false,
                last_context_high_risk: false,
            }
        );

        std::fs::remove_file(&path).ok();
        std::fs::remove_dir_all(path.parent().expect("temp dir")).ok();
    }

    #[test]
    fn fcitx_xmodifiers_repairs_missing_gtk_and_qt_ime_env() {
        let mut context = high_risk_context();
        context.xmodifiers = Some("@im=fcitx".to_string());

        let updates = super::resolve_ime_env_updates(&context);

        assert_eq!(updates.gtk_im_module, Some("fcitx"));
        assert_eq!(updates.qt_im_module, Some("fcitx"));
    }

    #[test]
    fn ibus_signal_repairs_only_missing_ime_env() {
        let mut context = high_risk_context();
        context.xmodifiers = Some("@im=ibus".to_string());
        context.gtk_im_module = Some("custom-gtk".to_string());

        let updates = super::resolve_ime_env_updates(&context);

        assert_eq!(updates.gtk_im_module, None);
        assert_eq!(updates.qt_im_module, Some("ibus"));
    }

    #[test]
    fn explicit_ime_modules_are_preserved() {
        let mut context = high_risk_context();
        context.xmodifiers = Some("@im=fcitx".to_string());
        context.gtk_im_module = Some("custom-gtk".to_string());
        context.qt_im_module = Some("custom-qt".to_string());

        let updates = super::resolve_ime_env_updates(&context);

        assert_eq!(updates, super::LinuxImeEnvUpdates::default());
    }

    #[test]
    fn missing_ime_signal_does_not_inject_module_env() {
        let context = high_risk_context();

        let updates = super::resolve_ime_env_updates(&context);

        assert_eq!(updates, super::LinuxImeEnvUpdates::default());
    }
}
