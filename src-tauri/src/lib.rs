use std::sync::Mutex;
use tauri::{Emitter, Manager};
#[cfg(target_os = "macos")]
use tauri::{RunEvent, WindowEvent};
#[cfg(not(target_os = "macos"))]
use tauri::RunEvent;

/// Stores paths that were passed to the app on launch (via drag-drop or CLI)
/// Frontend can retrieve these paths after it's ready
static PENDING_OPEN_PATHS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Get and clear any pending paths that were passed to the app on launch
#[tauri::command]
fn get_pending_open_paths() -> Vec<String> {
    let mut paths = PENDING_OPEN_PATHS.lock().unwrap();
    std::mem::take(&mut *paths)
}

mod backend;
mod claude_commands;
mod codex;
mod engine;
mod files;
mod dictation;
mod event_sink;
mod git;
mod git_utils;
mod local_usage;
mod menu;
mod prompts;
mod remote_backend;
mod rules;
mod settings;
mod state;
mod storage;
mod shared;
mod terminal;
mod types;
mod utils;
mod window;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Avoid WebKit compositing issues on NVIDIA Linux setups (GBM buffer errors).
        if std::env::var_os("__NV_PRIME_RENDER_OFFLOAD").is_none() {
            std::env::set_var("__NV_PRIME_RENDER_OFFLOAD", "1");
        }
    }

    let builder = tauri::Builder::default()
        .enable_macos_default_menu(false)
        .manage(menu::MenuItemRegistry::<tauri::Wry>::default())
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event)
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            #[cfg(target_os = "macos")]
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let state = state::AppState::load(&app.handle());
            app.manage(state);
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    let app = builder
        .plugin(tauri_plugin_liquid_glass::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Settings
            settings::get_app_settings,
            settings::update_app_settings,
            settings::get_codex_config_path,
            // Files
            files::file_read,
            files::file_write,
            // Menu
            menu::menu_set_accelerators,
            menu::menu_update_labels,
            // Engine management
            engine::detect_engines,
            engine::get_active_engine,
            engine::switch_engine,
            engine::get_engine_status,
            engine::get_all_engine_statuses,
            engine::set_engine_config,
            engine::get_engine_config,
            engine::is_engine_available,
            engine::get_available_engines,
            engine::get_engine_models,
            engine::engine_send_message,
            engine::engine_interrupt,
            engine::list_claude_sessions,
            engine::load_claude_session,
            // Codex
            codex::get_config_model,
            codex::codex_doctor,
            codex::start_thread,
            codex::send_user_message,
            codex::turn_interrupt,
            codex::start_review,
            codex::respond_to_server_request,
            codex::remember_approval_rule,
            codex::get_commit_message_prompt,
            codex::generate_commit_message,
            codex::list_thread_titles,
            codex::set_thread_title,
            codex::rename_thread_title_key,
            codex::generate_thread_title,
            codex::generate_run_metadata,
            codex::resume_thread,
            codex::fork_thread,
            codex::list_threads,
            codex::list_mcp_server_status,
            codex::archive_thread,
            codex::collaboration_mode_list,
            codex::model_list,
            codex::account_rate_limits,
            codex::account_read,
            codex::codex_login,
            codex::codex_login_cancel,
            codex::skills_list,
            // Workspaces
            workspaces::list_workspaces,
            workspaces::is_workspace_path_dir,
            workspaces::add_workspace,
            workspaces::add_clone,
            workspaces::add_worktree,
            workspaces::worktree_setup_status,
            workspaces::worktree_setup_mark_ran,
            workspaces::remove_workspace,
            workspaces::remove_worktree,
            workspaces::rename_worktree,
            workspaces::rename_worktree_upstream,
            workspaces::apply_worktree_changes,
            workspaces::update_workspace_settings,
            workspaces::update_workspace_codex_bin,
            workspaces::connect_workspace,
            workspaces::list_workspace_files,
            workspaces::read_workspace_file,
            workspaces::open_workspace_in,
            workspaces::get_open_app_icon,
            // Git
            git::get_git_status,
            git::list_git_roots,
            git::get_git_diffs,
            git::get_git_log,
            git::get_git_commit_diff,
            git::get_git_remote,
            git::stage_git_file,
            git::stage_git_all,
            git::unstage_git_file,
            git::revert_git_file,
            git::revert_git_all,
            git::commit_git,
            git::push_git,
            git::pull_git,
            git::sync_git,
            git::get_github_issues,
            git::get_github_pull_requests,
            git::get_github_pull_request_diff,
            git::get_github_pull_request_comments,
            git::list_git_branches,
            git::checkout_git_branch,
            git::create_git_branch,
            // Prompts
            claude_commands::claude_commands_list,
            prompts::prompts_list,
            prompts::prompts_create,
            prompts::prompts_update,
            prompts::prompts_delete,
            prompts::prompts_move,
            prompts::prompts_workspace_dir,
            prompts::prompts_global_dir,
            // Terminal
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            // Dictation
            dictation::dictation_model_status,
            dictation::dictation_download_model,
            dictation::dictation_cancel_download,
            dictation::dictation_remove_model,
            dictation::dictation_start,
            dictation::dictation_request_permission,
            dictation::dictation_stop,
            dictation::dictation_cancel,
            // Local usage
            local_usage::local_usage_snapshot,
            // Open paths
            get_pending_open_paths
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        match &event {
            RunEvent::Reopen { .. } => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            RunEvent::Opened { urls } => {
                // Handle files/folders dropped on the app icon (macOS)
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| {
                        if url.scheme() == "file" {
                            url.to_file_path().ok().map(|p| p.to_string_lossy().into_owned())
                        } else {
                            None
                        }
                    })
                    .collect();
                if !paths.is_empty() {
                    // Store paths for frontend to retrieve later (in case event is missed)
                    if let Ok(mut pending) = PENDING_OPEN_PATHS.lock() {
                        pending.extend(paths.clone());
                    }
                    // Also try to emit event immediately (for when app is already running)
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("open-paths", paths);
                    }
                }
            }
            _ => {}
        }

        #[cfg(not(target_os = "macos"))]
        if let RunEvent::Ready = event {
            // Handle command line arguments (Windows/Linux)
            let args: Vec<String> = std::env::args().skip(1).collect();
            let paths: Vec<String> = args
                .into_iter()
                .filter(|arg| !arg.starts_with('-') && std::path::Path::new(arg).exists())
                .collect();
            if !paths.is_empty() {
                // Store paths for frontend to retrieve later
                if let Ok(mut pending) = PENDING_OPEN_PATHS.lock() {
                    pending.extend(paths.clone());
                }
                // Also try to emit event
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.emit("open-paths", paths);
                }
            }
        }
    });
}
