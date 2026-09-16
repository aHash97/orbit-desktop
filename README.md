# Orbit

Desktop hub orbs for Windows. Hover a hub to open a smoked-glass pie menu and launch shortcuts with a click.

Orbit is **not** a Kando clone. It does not hook Explorer, it does not move your files, and it does not try to be a global marking menu. It plants a few glass orbs on the desktop and stays out of the way of normal windows and games.

## How it works

- Orbit creates the first hub for you and opens a small control center on first launch.
- Launch Orbit again, double-click its tray icon, or choose **Open Orbit** in the tray to reopen the control center.
- **New hub** drops another orb on the desktop and opens its editor.
- **Hover** an orb to open the pie. **Right-click anywhere in the orbit** to add,
  rename, or delete an icon, or to enter the full orbit editor.
- **Hold and drag** an orb to move it anywhere on the desktop; Orbit remembers the position.
- **Click an icon** to launch it. Press and move it at least a few pixels to reorder it without entering edit mode.
- A ring holds **at most 12 items**.
- Edit mode: click **Add files** to choose `.lnk` / `.exe` / `.url` files, or drop them onto the ring. The editor also exposes that hub's accent color and hub icon.
- The control center gives every hub its own color, icon picker, **Edit**, and **Delete** controls. The default accent is used only when creating new hubs.
- **Arrange** in the control center can distribute selected hubs horizontally or vertically, align them to a shared **Middle**, or align them to a shared **Center**. A single hub snaps to the middle or center of its monitor. The settings window is resizable and keeps a stable size across high-DPI monitors.

Orbit never scans or relocates the shortcuts already on your desktop. You pick what goes in a hub.

Orbit checks the signed GitHub release feed automatically by default. You can disable automatic updates or run a manual check from **Orbit Settings → Updates**.

## Requirements

- Windows 10 or 11 (x64)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (already on most Windows 11 machines)
- For development: Node.js 22+, Rust (MSVC), Visual Studio Build Tools with the C++ workload

## Install

Download the Windows `.exe` installer from the [latest GitHub release](https://github.com/aHash97/orbit-desktop/releases/latest).

Once the initial WinGet package is accepted into the community repository, Orbit can also be installed and upgraded from a terminal:

```powershell
winget install --id aHash97.Orbit --exact
```

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

Pushing an annotated version tag such as `v0.1.0` builds the installer and publishes it with a SHA-256 checksum on GitHub Releases. The annotated tag message becomes the approved release notes.

## Why not a real desktop icon?

Windows Explorer does not expose hover on `.lnk` files without injecting into Explorer. That breaks on updates and looks like malware. Orbit uses a small non-activating transparent window that normal application windows cover.

## License

MIT
