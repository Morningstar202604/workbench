pub mod agent;
pub mod ai;
pub mod commands;
pub mod cost_store;
pub mod data;
pub mod devserver;
pub mod ipc_guard;
pub mod json_store;
pub mod logging_setup;
pub mod ports;
pub mod pricing;
pub mod procs;
pub mod session_meter;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 显示/隐藏主窗口（托盘点击、全局快捷键共用）。
fn toggle_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            logging_setup::init_logging(app.handle());
            log::info!("工作台 v{} 启动", app.package_info().version);

            // IPC 反向入参守卫：目录与端口白名单，随扫描/加载动态登记
            app.manage(ipc_guard::KnownDirs::default());
            app.manage(ipc_guard::AllowedPorts::default());
            // Agent 运行时状态：provider 配置（密钥仅内存）+ 工具审批登记
            app.manage(agent::AgentState::default());

            // ── 全局快捷键 Ctrl+Shift+W 切换窗口可见性（被占用时降级为警告，不阻断启动）──
            if let Err(e) = app
                .handle()
                .global_shortcut()
                .on_shortcut("CmdOrCtrl+Shift+W", move |handle, _, _| {
                    toggle_window(handle);
                })
            {
                log::warn!("全局快捷键 CmdOrCtrl+Shift+W 注册失败（窗口隐藏后需从托盘恢复）: {e}");
            }

            // ── 最小化到托盘：拦截关闭事件，改为隐藏 ──
            if let Some(window) = app.get_webview_window("main") {
                let handle2 = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if let Some(win) = handle2.get_webview_window("main") {
                            let _ = win.hide();
                        }
                        api.prevent_close();
                    }
                });
            }

            // ── 托盘：左键切换显示，菜单提供「退出」彻底结束进程 ──
            // 托盘文案在系统 UI 里长期可见，用双语标注而不是只写中文：
            // 界面主语言可在三语间切换，但托盘菜单在创建时就固定了，
            // 折中方案是让两种主要语言同时出现。
            let toggle_item = MenuItem::with_id(
                app,
                "toggle",
                "显示 / 隐藏窗口 · Show / Hide",
                true,
                None::<&str>,
            )?;
            let quit_item =
                MenuItem::with_id(app, "quit", "退出工作台 · Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;
            let _tray = TrayIconBuilder::with_id("workbench-tray")
                .tooltip("Workbench")
                // 用 PNG 而不是 ico：Linux 的托盘实现只认位图，
                // include_image 跨平台解析到 icons/32x32.png
                .icon(tauri::include_image!("icons/32x32.png"))
                .menu(&menu)
                // Linux 上托盘菜单默认需要左键弹出（很多桌面环境没有右键习惯）
                .show_menu_on_left_click(cfg!(target_os = "linux"))
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_window(app),
                    "quit" => {
                        log::info!("托盘菜单退出");
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_processes,
            commands::terminate_process,
            commands::list_ports,
            commands::list_dev_servers,
            commands::list_ai_processes,
            commands::opencode_sessions,
            commands::opencode_session_detail,
            commands::recent_sessions_preview,
            commands::system_info,
            commands::disk_info,
            commands::git_branch,
            commands::open_known_path,
            commands::set_always_on_top,
            commands::load_data,
            commands::save_data,
            commands::read_logs,
            commands::clear_logs,
            // ── 成本计量 ──
            commands::scan_session_costs,
            commands::get_cost_overview,
            commands::get_cost_trend,
            commands::get_model_breakdown,
            commands::get_cost_settings_cmd,
            commands::save_cost_settings_cmd,
            commands::clear_cost_records,
            // ── Agent（模型 + 工具调用）──
            agent::agent_set_provider,
            agent::agent_get_provider,
            agent::agent_list_tools,
            agent::agent_approve_tool,
            agent::agent_reject_tool,
            agent::agent_cancel,
            agent::agent_run,
        ])
        .run(tauri::generate_context!())
        .expect("运行工作台应用失败");
}
