use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;
use tokio::sync::Mutex;

use crate::app_paths;
use crate::dictation::DictationState;
use crate::engine::{EngineConfig, EngineManager, EngineType};
use crate::shared::proxy_core;
use crate::storage::{read_settings, read_workspaces};
use crate::types::{AppSettings, WorkspaceEntry};
use crate::workspaces::DetachedExternalChangeRuntime;

pub(crate) struct AppState {
    pub(crate) workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    pub(crate) sessions: Mutex<HashMap<String, Arc<crate::codex::WorkspaceSession>>>,
    pub(crate) terminal_sessions: Mutex<HashMap<String, Arc<crate::terminal::TerminalSession>>>,
    pub(crate) runtime_log_sessions:
        Mutex<HashMap<String, crate::runtime_log::RuntimeSessionRecord>>,
    pub(crate) remote_backend: Mutex<Option<crate::remote_backend::RemoteBackend>>,
    pub(crate) storage_path: PathBuf,
    pub(crate) settings_path: PathBuf,
    pub(crate) app_settings: Mutex<AppSettings>,
    pub(crate) codex_runtime_reload_lock: Mutex<()>,
    pub(crate) computer_use_activation_lock: Mutex<()>,
    pub(crate) computer_use_activation_verification:
        Mutex<Option<crate::computer_use::ComputerUseActivationVerification>>,
    pub(crate) dictation: Mutex<DictationState>,
    pub(crate) codex_login_cancels: Mutex<HashMap<String, oneshot::Sender<()>>>,
    pub(crate) detached_external_change_runtime: Mutex<DetachedExternalChangeRuntime>,
    pub(crate) runtime_manager: Arc<crate::runtime::RuntimeManager>,
    /// Multi-engine manager
    pub(crate) engine_manager: EngineManager,
}

impl AppState {
    /// Push current app_settings binary paths into the EngineManager so that
    /// new engine sessions pick up user-configured CLI paths (e.g. reclaude).
    /// Also drops cached Claude sessions whose bin_path is stale so the next
    /// turn rebuilds them with the new config.
    pub(crate) async fn sync_engine_configs_from_settings(&self) {
        let settings = self.app_settings.lock().await.clone();

        let new_claude_bin = settings.claude_bin.clone();
        let previous_claude_bin = self
            .engine_manager
            .get_engine_config(EngineType::Claude)
            .await
            .and_then(|cfg| cfg.bin_path);

        self.engine_manager
            .set_engine_config(
                EngineType::Claude,
                EngineConfig {
                    bin_path: new_claude_bin.clone(),
                    ..Default::default()
                },
            )
            .await;

        if previous_claude_bin != new_claude_bin {
            let sessions = self.engine_manager.claude_manager.list_sessions().await;
            for (workspace_id, _session) in sessions {
                self.engine_manager.remove_claude_session(&workspace_id).await;
            }
        }

        self.engine_manager
            .set_engine_config(
                EngineType::Codex,
                EngineConfig {
                    bin_path: settings.codex_bin.clone(),
                    custom_args: settings.codex_args.clone(),
                    ..Default::default()
                },
            )
            .await;
    }

    pub(crate) fn load(app: &AppHandle) -> Self {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()));
        if let Err(error) = app_paths::prepare_app_data_dir(&data_dir) {
            eprintln!("[storage] failed to prepare app data dir migration: {error}");
        }
        let storage_path = data_dir.join("workspaces.json");
        let settings_path = data_dir.join("settings.json");
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        let app_settings = read_settings(&settings_path).unwrap_or_default();
        if let Err(error) = proxy_core::apply_app_proxy_settings(&app_settings) {
            eprintln!("[proxy] failed to apply persisted proxy settings: {error}");
        }
        let runtime_manager = Arc::new(crate::runtime::RuntimeManager::new(&data_dir));
        runtime_manager.orphan_sweep_on_startup(app_settings.runtime_orphan_sweep_on_launch);
        let engine_manager = EngineManager::new();
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            terminal_sessions: Mutex::new(HashMap::new()),
            runtime_log_sessions: Mutex::new(HashMap::new()),
            remote_backend: Mutex::new(None),
            storage_path,
            settings_path,
            app_settings: Mutex::new(app_settings),
            codex_runtime_reload_lock: Mutex::new(()),
            computer_use_activation_lock: Mutex::new(()),
            computer_use_activation_verification: Mutex::new(None),
            dictation: Mutex::new(DictationState::default()),
            codex_login_cancels: Mutex::new(HashMap::new()),
            detached_external_change_runtime: Mutex::new(DetachedExternalChangeRuntime::default()),
            runtime_manager,
            engine_manager,
        }
    }
}
