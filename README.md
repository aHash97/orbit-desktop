# Orbit

Desktop hub orbs for Windows. Hover a hub to open a smoked-glass pie menu, drill into folders, and launch shortcuts with a click.

Orbit is **not** a Kando clone. It does not hook Explorer, it does not move your files, and it does not try to be a global marking menu. It plants a few glass orbs on the desktop and stays out of the way of normal windows and games.

## How it works

- Orbit creates the first hub for you and opens a small control center on first launch.
- Launch Orbit again, double-click its tray icon, or choose **Open Orbit** in the tray to reopen the control center.
- **New hub** drops another orb on the desktop and opens its editor.
- **Hover** an orb to open the pie. **Right-click** an orb to edit it.
- **Folders** open on a short dwell (~250ms) or a click.
- **Shortcuts** launch on click.
- A ring holds **at most 12 items**. More than that: make a subfolder.
- Edit mode: click **Add files** to choose `.lnk` / `.exe` / `.url` files, or drop them onto the ring. Drag items to reorder; right-click to rename, delete, or add a folder.

Orbit never scans or relocates the shortcuts already on your desktop. You pick what goes in a hub.

## Requirements

- Windows 10 or 11 (x64)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (already on most Windows 11 machines)
- For development: Node.js 22+, Rust (MSVC), Visual Studio Build Tools with the C++ workload

## Develop

```bash
npm install
npm run tauri icon
npm run tauri dev
```

First run: Orbit opens its control center and creates **Hub 1**. Use **Edit** to add shortcuts. If the window is closed, launch Orbit again or double-click its tray icon.

Config lives at `%APPDATA%\Orbit\config.json`. Tray → **Open config folder** if you want to edit it by hand.

## Build an installer

```bash
npm run tauri build
```

The NSIS installer lands in `src-tauri/target/release/bundle/nsis/`. It is unsigned in v1, so SmartScreen will complain until you sign it.

## Why not a real desktop icon?

Windows Explorer does not expose hover on `.lnk` files without injecting into Explorer. That breaks on updates and looks like malware. Orbit uses a small non-activating transparent window that normal application windows cover.

## License

MIT
