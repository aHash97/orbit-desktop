use tauri::WebviewWindow;

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_TOP,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW,
};

#[cfg(windows)]
pub fn hwnd_of(window: &WebviewWindow) -> Result<HWND, String> {
    let raw = window.hwnd().map_err(|e| e.to_string())?;
    Ok(HWND(raw.0))
}

#[cfg(not(windows))]
pub fn hwnd_of(_window: &WebviewWindow) -> Result<(), String> {
    Err("Orbit is Windows-only".into())
}

#[cfg(windows)]
pub fn apply_tool_window(window: &WebviewWindow) -> Result<(), String> {
    unsafe {
        let hwnd = hwnd_of(window)?;
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(
            hwnd,
            GWL_EXSTYLE,
            ex | WS_EX_NOACTIVATE.0 as i32 | WS_EX_TOOLWINDOW.0 as i32,
        );
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE,
        );
    }
    Ok(())
}

#[cfg(windows)]
pub fn move_orb_physical(
    window: &WebviewWindow,
    screen_x: i32,
    screen_y: i32,
) -> Result<(), String> {
    unsafe {
        let hwnd = hwnd_of(window)?;
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            screen_x,
            screen_y,
            0,
            0,
            SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
    Ok(())
}

#[cfg(windows)]
pub fn virtual_screen() -> (i32, i32, i32, i32) {
    unsafe {
        (
            GetSystemMetrics(SM_XVIRTUALSCREEN),
            GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN),
            GetSystemMetrics(SM_CYVIRTUALSCREEN),
        )
    }
}

#[cfg(windows)]
pub fn clamp_to_virtual(x: i32, y: i32, w: i32, h: i32) -> (i32, i32) {
    let (vx, vy, vw, vh) = virtual_screen();
    let x = x.clamp(vx, vx + vw - w);
    let y = y.clamp(vy, vy + vh - h);
    (x, y)
}

#[cfg(not(windows))]
pub fn apply_tool_window(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub fn move_orb_physical(
    _window: &WebviewWindow,
    _screen_x: i32,
    _screen_y: i32,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub fn clamp_to_virtual(x: i32, y: i32, _w: i32, _h: i32) -> (i32, i32) {
    (x, y)
}
