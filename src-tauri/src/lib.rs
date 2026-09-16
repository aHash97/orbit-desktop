mod config;
mod desktop;
mod icons;

use std::sync::Mutex;

use config::{AppConfig, Hub, MenuItem, MAX_PER_RING, ORB_SIZE};
use serde::Serialize;
use tauri::menu::{Menu, MenuItem as TrayMenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

const PIE_WIDTH: u32 = 400;
const PIE_HEIGHT: u32 = 430;
const PIE_SAFE_RADIUS: f64 = 180.0;

struct AppState {
    config: Mutex<AppConfig>,
    pie_edit: Mutex<bool>,
    pie_hub: Mutex<Option<String>>,
    last_session: Mutex<Option<PieSession>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PieSession {
    hub: Hub,
    edit: bool,
    dwell_ms: u64,
    accent: String,
    screenshot: Option<String>,
    center_x: f64,
    center_y: f64,
    width: f64,
    height: f64,
}

#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn get_icon(path: String) -> Result<String, String> {
    icons::get_icon_data_url(&path)
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: tauri::State<AppState>,
    dwell_ms: u64,
    accent: String,
    auto_update: bool,
) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.dwell_ms = dwell_ms.clamp(80, 800);
    cfg.accent = accent;
    cfg.auto_update = auto_update;
    config::save(&cfg)?;
    let cloned = cfg.clone();
    drop(cfg);
    let _ = app.emit("config-updated", cloned.clone());
    Ok(cloned)
}

#[tauri::command]
async fn create_hub(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<Hub, String> {
    let mut cfg = state.config.lock().unwrap();
    let n = cfg.hubs.len() + 1;
    let offset = (n as f64 * 0.07) % 0.45;
    let hub = Hub {
        id: uuid::Uuid::new_v4().to_string(),
        name: format!("Hub {n}"),
        icon: None,
        accent: cfg.accent.clone(),
        x: 0.82,
        y: 0.18 + offset,
        monitor: 0,
        items: Vec::new(),
    };
    cfg.hubs.push(hub.clone());
    config::save(&cfg)?;
    drop(cfg);

    // WebView construction must coordinate with Tauri's main loop. Keeping
    // this command async prevents the IPC handler from monopolizing that loop
    // while the new orb is initialized.
    spawn_orb(&app, &hub)?;
    let _ = app.emit("config-updated", get_config_snapshot(&app));
    let _ = open_pie_inner(&app, &hub.id, true);
    Ok(hub)
}

#[tauri::command]
fn delete_hub(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
) -> Result<AppConfig, String> {
    {
        let mut cfg = state.config.lock().unwrap();
        cfg.hubs.retain(|h| h.id != id);
        config::save(&cfg)?;
    }
    if let Some(win) = app.get_webview_window(&orb_label(&id)) {
        let _ = win.close();
    }
    let _ = close_pie_inner(&app);
    let cfg = get_config_snapshot(&app);
    let _ = app.emit("config-updated", cfg.clone());
    Ok(cfg)
}

#[tauri::command]
fn rename_hub(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
    name: String,
) -> Result<AppConfig, String> {
    {
        let mut cfg = state.config.lock().unwrap();
        let hub = config::find_hub_mut(&mut cfg, &id)?;
        hub.name = name.trim().chars().take(24).collect();
        if hub.name.is_empty() {
            hub.name = "Hub".into();
        }
        config::save(&cfg)?;
    }
    let cfg = get_config_snapshot(&app);
    let _ = app.emit("config-updated", cfg.clone());
    Ok(cfg)
}

#[tauri::command]
fn set_hub_icon(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
    icon: Option<String>,
) -> Result<AppConfig, String> {
    {
        let mut cfg = state.config.lock().unwrap();
        let hub = config::find_hub_mut(&mut cfg, &id)?;
        hub.icon = icon.filter(|value| value.starts_with("builtin:"));
        config::save(&cfg)?;
    }
    let cfg = get_config_snapshot(&app);
    let _ = app.emit("config-updated", cfg.clone());
    Ok(cfg)
}

#[tauri::command]
fn set_hub_accent(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
    accent: String,
) -> Result<AppConfig, String> {
    {
        let mut cfg = state.config.lock().unwrap();
        let hub = config::find_hub_mut(&mut cfg, &id)?;
        hub.accent = accent;
        config::save(&cfg)?;
    }
    let cfg = get_config_snapshot(&app);
    let _ = app.emit("config-updated", cfg.clone());
    Ok(cfg)
}

#[tauri::command]
fn import_hub_icon(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
    path: String,
) -> Result<AppConfig, String> {
    {
        let cfg = state.config.lock().unwrap();
        config::find_hub(&cfg, &id)?;
    }
    let stored = icons::import_hub_icon(&id, &path)?;
    {
        let mut cfg = state.config.lock().unwrap();
        let hub = config::find_hub_mut(&mut cfg, &id)?;
        hub.icon = Some(format!("custom:{}", stored.to_string_lossy()));
        config::save(&cfg)?;
    }
    let cfg = get_config_snapshot(&app);
    let _ = app.emit("config-updated", cfg.clone());
    Ok(cfg)
}

#[tauri::command]
fn set_hub_items(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
    items: Vec<MenuItem>,
) -> Result<AppConfig, String> {
    {
        let mut cfg = state.config.lock().unwrap();
        let hub = config::find_hub_mut(&mut cfg, &id)?;
        hub.items = items;
        config::save(&cfg)?;
    }
    let cfg = get_config_snapshot(&app);
    let _ = app.emit("config-updated", cfg.clone());
    Ok(cfg)
}

#[tauri::command]
fn move_hub(
    _app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
    x: f64,
    y: f64,
    monitor: u32,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    let hub = config::find_hub_mut(&mut cfg, &id)?;
    hub.x = x.clamp(0.02, 0.98);
    hub.y = y.clamp(0.02, 0.98);
    hub.monitor = monitor;
    config::save(&cfg)?;
    Ok(())
}

#[tauri::command]
fn launch_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        unsafe {
            let n = ShellExecuteW(
                HWND::default(),
                windows::core::w!("open"),
                &HSTRING::from(path.as_str()),
                None,
                None,
                windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
            );
            if (n.0 as usize) <= 32 {
                return Err(format!("Could not launch {path}"));
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Launch is Windows-only".into())
    }
}

#[tauri::command]
fn open_pie(app: AppHandle, id: String, edit: bool) -> Result<(), String> {
    open_pie_inner(&app, &id, edit)
}

#[tauri::command]
fn close_pie(app: AppHandle) -> Result<(), String> {
    close_pie_inner(&app)
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("index.html".into()))
        .title("Orbit Settings")
        .inner_size(460.0, 680.0)
        .resizable(false)
        .skip_taskbar(false)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_config_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = config::app_dir()?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn shortcut_meta(path: String) -> Result<MenuItem, String> {
    if path.trim().is_empty() {
        return Err("Empty path".into());
    }
    Ok(MenuItem::Shortcut {
        id: uuid::Uuid::new_v4().to_string(),
        name: config::shortcut_name(&path),
        path,
        icon: None,
    })
}

#[tauri::command]
fn max_per_ring() -> usize {
    MAX_PER_RING
}

#[tauri::command]
fn get_pie_session(state: tauri::State<AppState>) -> Option<PieSession> {
    state.last_session.lock().unwrap().clone()
}

#[tauri::command]
fn finish_orb_drag(
    app: AppHandle,
    state: tauri::State<AppState>,
    id: String,
) -> Result<(), String> {
    let win = app
        .get_webview_window(&orb_label(&id))
        .ok_or("missing orb")?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let found = monitors.iter().enumerate().find(|(_, m)| {
        let p = m.position();
        let s = m.size();
        cx >= p.x && cy >= p.y && cx < p.x + s.width as i32 && cy < p.y + s.height as i32
    });
    let (idx, mon) = match found {
        Some((i, m)) => (i as u32, m.clone()),
        None => (0, app.primary_monitor().ok().flatten().ok_or("No monitor")?),
    };
    let p = mon.position();
    let s = mon.size();
    let rx = ((cx - p.x) as f64 / s.width as f64).clamp(0.02, 0.98);
    let ry = ((cy - p.y) as f64 / s.height as f64).clamp(0.02, 0.98);
    let mut cfg = state.config.lock().unwrap();
    let hub = config::find_hub_mut(&mut cfg, &id)?;
    hub.x = rx;
    hub.y = ry;
    hub.monitor = idx;
    config::save(&cfg)?;
    Ok(())
}

fn orb_label(id: &str) -> String {
    format!("orb-{id}")
}

fn get_config_snapshot(app: &AppHandle) -> AppConfig {
    app.state::<AppState>().config.lock().unwrap().clone()
}

fn pie_session_from(
    app: &AppHandle,
    id: &str,
    edit: bool,
    screenshot: Option<String>,
) -> Result<PieSession, String> {
    let cfg = get_config_snapshot(app);
    let hub = config::find_hub(&cfg, id)?.clone();
    let pie = app.get_webview_window("pie").ok_or("Pie window missing")?;
    let size = pie.inner_size().map_err(|e| e.to_string())?;
    let scale = pie.scale_factor().unwrap_or(1.0);
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    let (raw_cx, raw_cy) = orb_center_in_pie(app, id).unwrap_or((width / 2.0, height / 2.0));
    // If a hub sits against a monitor edge, detach the ring slightly from the
    // orb rather than rendering half of the menu off-screen.
    let cx = raw_cx.clamp(PIE_SAFE_RADIUS, width - PIE_SAFE_RADIUS);
    let cy = raw_cy.clamp(PIE_SAFE_RADIUS, height - 245.0);
    Ok(PieSession {
        accent: hub.accent.clone(),
        hub,
        edit,
        dwell_ms: cfg.dwell_ms,
        screenshot,
        center_x: cx,
        center_y: cy,
        width,
        height,
    })
}

fn orb_center_in_pie(app: &AppHandle, id: &str) -> Option<(f64, f64)> {
    let orb = app.get_webview_window(&orb_label(id))?;
    let pie = app.get_webview_window("pie")?;
    let orb_pos = orb.outer_position().ok()?;
    let orb_size = orb.outer_size().ok()?;
    let pie_pos = pie.outer_position().ok()?;
    let scale = pie.scale_factor().ok()?;
    let cx = (orb_pos.x + orb_size.width as i32 / 2 - pie_pos.x) as f64 / scale;
    let cy = (orb_pos.y + orb_size.height as i32 / 2 - pie_pos.y) as f64 / scale;
    Some((cx, cy))
}

fn ensure_pie_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window("pie") {
        return Ok(win);
    }
    let win = WebviewWindowBuilder::new(app, "pie", WebviewUrl::App("index.html".into()))
        .title("Orbit")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .resizable(false)
        // WebView2/Wry does not register file-drop targets for windows that are
        // hidden when created. Build it visibly off-screen, then hide it.
        .position(-10_000.0, -10_000.0)
        .visible(true)
        .focused(false)
        .accept_first_mouse(true)
        .drag_and_drop(true)
        .inner_size(PIE_WIDTH as f64, PIE_HEIGHT as f64)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.hide();
    let _ = desktop::apply_tool_window(&win);
    Ok(win)
}

fn open_pie_inner(app: &AppHandle, id: &str, edit: bool) -> Result<(), String> {
    let cfg = get_config_snapshot(app);
    let _hub = config::find_hub(&cfg, id)?;
    let pie = ensure_pie_window(app)?;

    let (mon_pos, mon_size) = match monitor_for_orb(app, id) {
        Some((pos, size)) => (pos, size),
        None => (
            PhysicalPosition { x: 0, y: 0 },
            PhysicalSize {
                width: PIE_WIDTH,
                height: PIE_HEIGHT,
            },
        ),
    };

    let (orb_x, orb_y) = app
        .get_webview_window(&orb_label(id))
        .and_then(|orb| {
            let pos = orb.outer_position().ok()?;
            let size = orb.outer_size().ok()?;
            Some((
                pos.x + size.width as i32 / 2,
                pos.y + size.height as i32 / 2,
            ))
        })
        .unwrap_or((
            mon_pos.x + mon_size.width as i32 / 2,
            mon_pos.y + mon_size.height as i32 / 2,
        ));
    let scale = pie.scale_factor().unwrap_or(1.0);
    let pie_width_px = (PIE_WIDTH as f64 * scale).round() as i32;
    let pie_height_px = (PIE_HEIGHT as f64 * scale).round() as i32;
    let max_x = mon_pos.x + mon_size.width as i32 - pie_width_px;
    let max_y = mon_pos.y + mon_size.height as i32 - pie_height_px;
    let pie_x = (orb_x - pie_width_px / 2).clamp(mon_pos.x, max_x.max(mon_pos.x));
    let pie_y = (orb_y - (190.0 * scale).round() as i32).clamp(mon_pos.y, max_y.max(mon_pos.y));

    let _ = pie.set_always_on_top(true);
    let _ = pie.set_position(tauri::Position::Physical(PhysicalPosition {
        x: pie_x,
        y: pie_y,
    }));
    let _ = pie.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: PIE_WIDTH as f64,
        height: PIE_HEIGHT as f64,
    }));
    let _ = pie.show();
    if edit {
        let _ = pie.set_focus();
    }

    {
        let state = app.state::<AppState>();
        *state.pie_edit.lock().unwrap() = edit;
        *state.pie_hub.lock().unwrap() = Some(id.to_string());
    }

    let session = pie_session_from(app, id, edit, None)?;
    *app.state::<AppState>().last_session.lock().unwrap() = Some(session.clone());
    let _ = pie.emit("pie-session", session);
    Ok(())
}

fn close_pie_inner(app: &AppHandle) -> Result<(), String> {
    if let Some(pie) = app.get_webview_window("pie") {
        let _ = pie.hide();
    }
    *app.state::<AppState>().pie_hub.lock().unwrap() = None;
    Ok(())
}

fn monitor_for_orb(
    app: &AppHandle,
    id: &str,
) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let orb = app.get_webview_window(&orb_label(id))?;
    let pos = orb.outer_position().ok()?;
    let size = orb.outer_size().ok()?;
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;
    let monitors = app.available_monitors().ok()?;
    let mon = monitors
        .into_iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            cx >= p.x && cy >= p.y && cx < p.x + s.width as i32 && cy < p.y + s.height as i32
        })
        .or_else(|| app.primary_monitor().ok().flatten())?;
    Some((mon.position().to_owned(), mon.size().to_owned()))
}

fn spawn_orb(app: &AppHandle, hub: &Hub) -> Result<(), String> {
    let label = orb_label(&hub.id);
    if app.get_webview_window(&label).is_some() {
        position_orb(app, hub)?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(&hub.name)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        // See ensure_pie_window: initial visibility is required for Windows
        // file-drop registration. The empty orb is transparent while loading.
        .position(-10_000.0, -10_000.0)
        .visible(true)
        .focused(false)
        .accept_first_mouse(true)
        .drag_and_drop(true)
        .inner_size(ORB_SIZE, ORB_SIZE)
        .build()
        .map_err(|e| e.to_string())?;

    position_orb(app, hub)?;
    // A top-level tool window naturally sits above Explorer and below active
    // application windows. Parenting WebView2 into SHELLDLL_DefView caused
    // clipped/offset rendering on Windows 11.
    let _ = desktop::apply_tool_window(&win);
    let _ = win.show();
    Ok(())
}

fn position_orb(app: &AppHandle, hub: &Hub) -> Result<(), String> {
    let win = app
        .get_webview_window(&orb_label(&hub.id))
        .ok_or("orb missing")?;
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let mon = monitors
        .get(hub.monitor as usize)
        .cloned()
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("No monitor")?;
    let pos = mon.position();
    let size = mon.size();
    let scale = win.scale_factor().unwrap_or(1.0);
    let orb_px = (ORB_SIZE * scale).round() as i32;
    let x = pos.x + ((size.width as f64 * hub.x) as i32) - orb_px / 2;
    let y = pos.y + ((size.height as f64 * hub.y) as i32) - orb_px / 2;
    let (x, y) = desktop::clamp_to_virtual(x, y, orb_px, orb_px);
    let _ = desktop::move_orb_physical(&win, x, y);
    Ok(())
}

fn sync_orbs(app: &AppHandle) {
    let cfg = get_config_snapshot(app);
    let wanted: Vec<String> = cfg.hubs.iter().map(|h| orb_label(&h.id)).collect();
    for (label, win) in app.webview_windows() {
        if label.starts_with("orb-") && !wanted.contains(&label) {
            let _ = win.close();
        }
    }
    for hub in &cfg.hubs {
        let _ = spawn_orb(app, hub);
    }
}

fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let new_hub = TrayMenuItem::with_id(app, "new_hub", "New hub", true, None::<&str>)?;
    let settings = TrayMenuItem::with_id(app, "settings", "Open Orbit", true, None::<&str>)?;
    let config_folder =
        TrayMenuItem::with_id(app, "open_config", "Open config folder", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = TrayMenuItem::with_id(app, "quit", "Quit Orbit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&new_hub, &settings, &config_folder, &sep, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Orbit")
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                let _ = open_settings(tray.app_handle().clone());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "new_hub" => {
                let _ = create_hub(app.clone(), app.state());
            }
            "settings" => {
                let _ = open_settings(app.clone());
            }
            "open_config" => {
                let _ = open_config_folder(app.clone());
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut cfg = config::load().unwrap_or_default();
    let first_run = cfg.hubs.is_empty();
    if first_run {
        cfg.hubs.push(Hub {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Hub 1".into(),
            icon: None,
            accent: cfg.accent.clone(),
            x: 0.82,
            y: 0.25,
            monitor: 0,
            items: Vec::new(),
        });
        let _ = config::save(&cfg);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = open_settings(app.clone());
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppState {
            config: Mutex::new(cfg),
            pie_edit: Mutex::new(false),
            pie_hub: Mutex::new(None),
            last_session: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_icon,
            save_settings,
            create_hub,
            delete_hub,
            rename_hub,
            set_hub_icon,
            set_hub_accent,
            import_hub_icon,
            set_hub_items,
            move_hub,
            launch_path,
            open_pie,
            close_pie,
            open_settings,
            open_config_folder,
            shortcut_meta,
            max_per_ring,
            get_pie_session,
            finish_orb_drag
        ])
        .setup(move |app| {
            build_tray(app.handle())?;
            let _ = ensure_pie_window(app.handle());
            let handle = app.handle().clone();
            sync_orbs(&handle);
            if first_run {
                let _ = open_settings(handle.clone());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "pie" && matches!(event, WindowEvent::Focused(false)) {
                // keep pie while editing; normal mode stays until leave/esc from UI
            }
            if window.label() == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
