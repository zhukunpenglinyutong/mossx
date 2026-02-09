use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub struct MenuItemRegistry<R: Runtime> {
    items: Mutex<HashMap<String, MenuItem<R>>>,
    submenus: Mutex<HashMap<String, Submenu<R>>>,
}

impl<R: Runtime> Default for MenuItemRegistry<R> {
    fn default() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
            submenus: Mutex::new(HashMap::new()),
        }
    }
}

impl<R: Runtime> MenuItemRegistry<R> {
    fn register(&self, id: &str, item: &MenuItem<R>) {
        if let Ok(mut items) = self.items.lock() {
            items.insert(id.to_string(), item.clone());
        }
    }

    fn register_submenu(&self, id: &str, submenu: &Submenu<R>) {
        if let Ok(mut submenus) = self.submenus.lock() {
            submenus.insert(id.to_string(), submenu.clone());
        }
    }

    fn set_accelerator(&self, id: &str, accelerator: Option<&str>) -> tauri::Result<bool> {
        let item = match self.items.lock() {
            Ok(items) => items.get(id).cloned(),
            Err(_) => return Ok(false),
        };
        if let Some(item) = item {
            item.set_accelerator(accelerator)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn set_text(&self, id: &str, text: &str) -> tauri::Result<bool> {
        // Try items first
        if let Ok(items) = self.items.lock() {
            if let Some(item) = items.get(id) {
                item.set_text(text)?;
                return Ok(true);
            }
        }
        // Then try submenus
        if let Ok(submenus) = self.submenus.lock() {
            if let Some(submenu) = submenus.get(id) {
                submenu.set_text(text)?;
                return Ok(true);
            }
        }
        Ok(false)
    }
}

#[derive(Debug, Deserialize)]
pub struct MenuAcceleratorUpdate {
    pub id: String,
    pub accelerator: Option<String>,
}

#[tauri::command]
pub fn menu_set_accelerators<R: Runtime>(
    app: tauri::AppHandle<R>,
    updates: Vec<MenuAcceleratorUpdate>,
) -> Result<(), String> {
    let registry = app.state::<MenuItemRegistry<R>>();
    for update in updates {
        registry
            .set_accelerator(&update.id, update.accelerator.as_deref())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct MenuLabelUpdate {
    pub id: String,
    pub text: String,
}

#[tauri::command]
pub fn menu_update_labels<R: Runtime>(
    app: tauri::AppHandle<R>,
    updates: Vec<MenuLabelUpdate>,
) -> Result<(), String> {
    let registry = app.state::<MenuItemRegistry<R>>();
    for update in updates {
        registry
            .set_text(&update.id, &update.text)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn build_menu<R: tauri::Runtime>(
    handle: &tauri::AppHandle<R>,
) -> tauri::Result<Menu<R>> {
    let registry = handle.state::<MenuItemRegistry<R>>();
    let app_name = handle.package_info().name.clone();
    let about_item = MenuItemBuilder::with_id("about", format!("关于 {app_name}"))
        .build(handle)?;
    let check_updates_item =
        MenuItemBuilder::with_id("check_for_updates", "检查更新…").build(handle)?;
    let settings_item = MenuItemBuilder::with_id("file_open_settings", "设置…")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;

    // Register items for localization
    registry.register("about", &about_item);
    registry.register("check_for_updates", &check_updates_item);
    registry.register("file_open_settings", &settings_item);

    let app_menu = Submenu::with_items(
        handle,
        app_name.clone(),
        true,
        &[
            &about_item,
            &check_updates_item,
            &settings_item,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    let new_agent_item =
        MenuItemBuilder::with_id("file_new_agent", "新建会话").build(handle)?;
    let new_worktree_agent_item =
        MenuItemBuilder::with_id("file_new_worktree_agent", "新建工作树代理")
            .build(handle)?;
    let new_clone_agent_item =
        MenuItemBuilder::with_id("file_new_clone_agent", "新建克隆代理")
            .build(handle)?;
    let add_workspace_item =
        MenuItemBuilder::with_id("file_add_workspace", "添加工作区…").build(handle)?;

    registry.register("file_new_agent", &new_agent_item);
    registry.register("file_new_worktree_agent", &new_worktree_agent_item);
    registry.register("file_new_clone_agent", &new_clone_agent_item);
    registry.register("file_add_workspace", &add_workspace_item);

    #[cfg(target_os = "linux")]
    let file_menu = {
        let close_window_item =
            MenuItemBuilder::with_id("file_close_window", "关闭窗口").build(handle)?;
        let quit_item = MenuItemBuilder::with_id("file_quit", "退出").build(handle)?;
        registry.register("file_close_window", &close_window_item);
        registry.register("file_quit", &quit_item);
        let submenu = SubmenuBuilder::with_id(handle, "file_menu", "文件")
            .items(&[
                &new_agent_item,
                &new_worktree_agent_item,
                &new_clone_agent_item,
                &PredefinedMenuItem::separator(handle)?,
                &add_workspace_item,
                &PredefinedMenuItem::separator(handle)?,
                &close_window_item,
                &quit_item,
            ])
            .build()?;
        registry.register_submenu("file_menu", &submenu);
        submenu
    };
    #[cfg(not(target_os = "linux"))]
    let file_menu = {
        let submenu = SubmenuBuilder::with_id(handle, "file_menu", "文件")
            .items(&[
                &new_agent_item,
                &new_worktree_agent_item,
                &new_clone_agent_item,
                &PredefinedMenuItem::separator(handle)?,
                &add_workspace_item,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::close_window(handle, None)?,
                #[cfg(not(target_os = "macos"))]
                &PredefinedMenuItem::quit(handle, None)?,
            ])
            .build()?;
        registry.register_submenu("file_menu", &submenu);
        submenu
    };

    let edit_menu = {
        let submenu = SubmenuBuilder::with_id(handle, "edit_menu", "编辑")
            .items(&[
                &PredefinedMenuItem::undo(handle, None)?,
                &PredefinedMenuItem::redo(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::cut(handle, None)?,
                &PredefinedMenuItem::copy(handle, None)?,
                &PredefinedMenuItem::paste(handle, None)?,
                &PredefinedMenuItem::select_all(handle, None)?,
            ])
            .build()?;
        registry.register_submenu("edit_menu", &submenu);
        submenu
    };

    let cycle_model_item = MenuItemBuilder::with_id("composer_cycle_model", "切换模型")
        .accelerator("CmdOrCtrl+Shift+M")
        .build(handle)?;
    let cycle_access_item =
        MenuItemBuilder::with_id("composer_cycle_access", "切换访问模式")
            .accelerator("CmdOrCtrl+Shift+A")
            .build(handle)?;
    let cycle_reasoning_item =
        MenuItemBuilder::with_id("composer_cycle_reasoning", "切换推理模式")
            .accelerator("CmdOrCtrl+Shift+R")
            .build(handle)?;
    let cycle_collaboration_item = MenuItemBuilder::with_id(
        "composer_cycle_collaboration",
        "切换协作模式",
    )
    .accelerator("Shift+Tab")
    .build(handle)?;
    registry.register("composer_cycle_model", &cycle_model_item);
    registry.register("composer_cycle_access", &cycle_access_item);
    registry.register("composer_cycle_reasoning", &cycle_reasoning_item);
    registry.register("composer_cycle_collaboration", &cycle_collaboration_item);

    let composer_menu = {
        let submenu = SubmenuBuilder::with_id(handle, "composer_menu", "编辑器")
            .items(&[
                &cycle_model_item,
                &cycle_access_item,
                &cycle_reasoning_item,
                &cycle_collaboration_item,
            ])
            .build()?;
        registry.register_submenu("composer_menu", &submenu);
        submenu
    };

    let toggle_projects_sidebar_item =
        MenuItemBuilder::with_id("view_toggle_projects_sidebar", "切换项目侧边栏")
            .build(handle)?;
    let toggle_git_sidebar_item =
        MenuItemBuilder::with_id("view_toggle_git_sidebar", "切换 Git 侧边栏")
            .build(handle)?;
    let toggle_debug_panel_item = MenuItemBuilder::with_id(
        "view_toggle_debug_panel",
        "切换调试面板",
    )
    .accelerator("CmdOrCtrl+Shift+D")
    .build(handle)?;
    let toggle_terminal_item =
        MenuItemBuilder::with_id("view_toggle_terminal", "切换终端")
            .accelerator("CmdOrCtrl+Shift+T")
            .build(handle)?;
    let next_agent_item = MenuItemBuilder::with_id("view_next_agent", "下一个代理").build(handle)?;
    let prev_agent_item =
        MenuItemBuilder::with_id("view_prev_agent", "上一个代理").build(handle)?;
    let next_workspace_item =
        MenuItemBuilder::with_id("view_next_workspace", "下一个工作区").build(handle)?;
    let prev_workspace_item =
        MenuItemBuilder::with_id("view_prev_workspace", "上一个工作区").build(handle)?;
    registry.register("view_toggle_projects_sidebar", &toggle_projects_sidebar_item);
    registry.register("view_toggle_git_sidebar", &toggle_git_sidebar_item);
    registry.register("view_toggle_debug_panel", &toggle_debug_panel_item);
    registry.register("view_toggle_terminal", &toggle_terminal_item);
    registry.register("view_next_agent", &next_agent_item);
    registry.register("view_prev_agent", &prev_agent_item);
    registry.register("view_next_workspace", &next_workspace_item);
    registry.register("view_prev_workspace", &prev_workspace_item);

    #[cfg(target_os = "linux")]
    let view_menu = {
        let fullscreen_item =
            MenuItemBuilder::with_id("view_fullscreen", "切换全屏").build(handle)?;
        registry.register("view_fullscreen", &fullscreen_item);
        let submenu = SubmenuBuilder::with_id(handle, "view_menu", "视图")
            .items(&[
                &toggle_projects_sidebar_item,
                &toggle_git_sidebar_item,
                &PredefinedMenuItem::separator(handle)?,
                &toggle_debug_panel_item,
                &toggle_terminal_item,
                &PredefinedMenuItem::separator(handle)?,
                &next_agent_item,
                &prev_agent_item,
                &next_workspace_item,
                &prev_workspace_item,
                &PredefinedMenuItem::separator(handle)?,
                &fullscreen_item,
            ])
            .build()?;
        registry.register_submenu("view_menu", &submenu);
        submenu
    };
    #[cfg(not(target_os = "linux"))]
    let view_menu = {
        let submenu = SubmenuBuilder::with_id(handle, "view_menu", "视图")
            .items(&[
                &toggle_projects_sidebar_item,
                &toggle_git_sidebar_item,
                &PredefinedMenuItem::separator(handle)?,
                &toggle_debug_panel_item,
                &toggle_terminal_item,
                &PredefinedMenuItem::separator(handle)?,
                &next_agent_item,
                &prev_agent_item,
                &next_workspace_item,
                &prev_workspace_item,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::fullscreen(handle, None)?,
            ])
            .build()?;
        registry.register_submenu("view_menu", &submenu);
        submenu
    };

    #[cfg(target_os = "linux")]
    let window_menu = {
        let minimize_item =
            MenuItemBuilder::with_id("window_minimize", "最小化").build(handle)?;
        let maximize_item =
            MenuItemBuilder::with_id("window_maximize", "最大化").build(handle)?;
        let close_item = MenuItemBuilder::with_id("window_close", "关闭窗口")
            .build(handle)?;
        registry.register("window_minimize", &minimize_item);
        registry.register("window_maximize", &maximize_item);
        registry.register("window_close", &close_item);
        let submenu = SubmenuBuilder::with_id(handle, "window_menu", "窗口")
            .items(&[
                &minimize_item,
                &maximize_item,
                &PredefinedMenuItem::separator(handle)?,
                &close_item,
            ])
            .build()?;
        registry.register_submenu("window_menu", &submenu);
        submenu
    };
    #[cfg(not(target_os = "linux"))]
    let window_menu = {
        let submenu = SubmenuBuilder::with_id(handle, "window_menu", "窗口")
            .items(&[
                &PredefinedMenuItem::minimize(handle, None)?,
                &PredefinedMenuItem::maximize(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::close_window(handle, None)?,
            ])
            .build()?;
        registry.register_submenu("window_menu", &submenu);
        submenu
    };

    #[cfg(target_os = "linux")]
    let help_menu = {
        let about_item =
            MenuItemBuilder::with_id("help_about", format!("关于 {app_name}"))
                .build(handle)?;
        registry.register("help_about", &about_item);
        let submenu = SubmenuBuilder::with_id(handle, "help_menu", "帮助")
            .items(&[&about_item])
            .build()?;
        registry.register_submenu("help_menu", &submenu);
        submenu
    };
    #[cfg(not(target_os = "linux"))]
    let help_menu = {
        let submenu = SubmenuBuilder::with_id(handle, "help_menu", "帮助")
            .build()?;
        registry.register_submenu("help_menu", &submenu);
        submenu
    };

    Menu::with_items(
        handle,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &composer_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

pub(crate) fn handle_menu_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    event: tauri::menu::MenuEvent,
) {
    match event.id().as_ref() {
        "about" | "help_about" => {
            if let Some(window) = app.get_webview_window("about") {
                let _ = window.show();
                let _ = window.set_focus();
                return;
            }
            let _ = WebviewWindowBuilder::new(app, "about", WebviewUrl::App("index.html".into()))
                .title("关于 CodeMoss")
                .resizable(false)
                .inner_size(360.0, 240.0)
                .center()
                .build();
        }
        "check_for_updates" => {
            let _ = app.emit("updater-check", ());
        }
        "file_new_agent" => emit_menu_event(app, "menu-new-agent"),
        "file_new_worktree_agent" => emit_menu_event(app, "menu-new-worktree-agent"),
        "file_new_clone_agent" => emit_menu_event(app, "menu-new-clone-agent"),
        "file_add_workspace" => emit_menu_event(app, "menu-add-workspace"),
        "file_open_settings" => emit_menu_event(app, "menu-open-settings"),
        "file_close_window" | "window_close" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.close();
            }
        }
        "file_quit" => {
            app.exit(0);
        }
        "view_fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(!is_fullscreen);
            }
        }
        "view_toggle_projects_sidebar" => emit_menu_event(app, "menu-toggle-projects-sidebar"),
        "view_toggle_git_sidebar" => emit_menu_event(app, "menu-toggle-git-sidebar"),
        "view_toggle_debug_panel" => emit_menu_event(app, "menu-toggle-debug-panel"),
        "view_toggle_terminal" => emit_menu_event(app, "menu-toggle-terminal"),
        "view_next_agent" => emit_menu_event(app, "menu-next-agent"),
        "view_prev_agent" => emit_menu_event(app, "menu-prev-agent"),
        "view_next_workspace" => emit_menu_event(app, "menu-next-workspace"),
        "view_prev_workspace" => emit_menu_event(app, "menu-prev-workspace"),
        "composer_cycle_model" => emit_menu_event(app, "menu-composer-cycle-model"),
        "composer_cycle_access" => emit_menu_event(app, "menu-composer-cycle-access"),
        "composer_cycle_reasoning" => emit_menu_event(app, "menu-composer-cycle-reasoning"),
        "composer_cycle_collaboration" => {
            emit_menu_event(app, "menu-composer-cycle-collaboration")
        }
        "window_minimize" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.minimize();
            }
        }
        "window_maximize" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }
        }
        _ => {}
    }
}

fn emit_menu_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit(event, ());
    } else {
        let _ = app.emit(event, ());
    }
}
