import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, Hub, MenuItem, PieSession } from "./types";

export const api = {
  getConfig: () => invoke<AppConfig>("get_config"),
  getIcon: (path: string) => invoke<string>("get_icon", { path }),
  saveSettings: (dwellMs: number, accent: string, autoUpdate: boolean) =>
    invoke<AppConfig>("save_settings", { dwellMs, accent, autoUpdate }),
  createHub: () => invoke<Hub>("create_hub"),
  deleteHub: (id: string) => invoke<AppConfig>("delete_hub", { id }),
  renameHub: (id: string, name: string) =>
    invoke<AppConfig>("rename_hub", { id, name }),
  setHubIcon: (id: string, icon: string | null) =>
    invoke<AppConfig>("set_hub_icon", { id, icon }),
  setHubAccent: (id: string, accent: string) =>
    invoke<AppConfig>("set_hub_accent", { id, accent }),
  importHubIcon: (id: string, path: string) =>
    invoke<AppConfig>("import_hub_icon", { id, path }),
  setHubItems: (id: string, items: MenuItem[]) =>
    invoke<AppConfig>("set_hub_items", { id, items }),
  moveHub: (id: string, x: number, y: number, monitor: number) =>
    invoke<void>("move_hub", { id, x, y, monitor }),
  launch: (path: string) => invoke<void>("launch_path", { path }),
  openPie: (id: string, edit: boolean) => invoke<void>("open_pie", { id, edit }),
  closePie: () => invoke<void>("close_pie"),
  openSettings: () => invoke<void>("open_settings"),
  shortcutMeta: (path: string) => invoke<MenuItem>("shortcut_meta", { path }),
  getPieSession: () => invoke<PieSession | null>("get_pie_session"),
  finishOrbDrag: (id: string) => invoke<void>("finish_orb_drag", { id }),
};
