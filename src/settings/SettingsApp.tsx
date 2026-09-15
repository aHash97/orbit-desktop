import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { api } from "../api";
import type { AppConfig } from "../types";

export function SettingsApp() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void api.getConfig().then(setCfg);
    void isEnabled().then(setAuto);
  }, []);

  if (!cfg) {
    return <div className="settings" />;
  }

  async function save() {
    if (!cfg) return;
    const next = await api.saveSettings(cfg.dwellMs, cfg.accent);
    setCfg(next);
    setStatus("Saved");
    window.setTimeout(() => setStatus(""), 1200);
  }

  async function createHub() {
    setStatus("Creating hub…");
    try {
      await api.createHub();
      setCfg(await api.getConfig());
      setStatus("Hub created — its editor is open");
    } catch (error) {
      setStatus(`Could not create hub: ${String(error)}`);
    }
  }

  async function editHub(id: string) {
    setStatus("");
    try {
      await api.openPie(id, true);
    } catch (error) {
      setStatus(`Could not open hub: ${String(error)}`);
    }
  }

  return (
    <div className="settings">
      <header>
        <div className="mark" style={{ ["--accent" as string]: cfg.accent }} />
        <div>
          <h1>Orbit</h1>
          <p>Desktop hubs. Hover to open. Click to launch.</p>
        </div>
      </header>

      <section className="hub-control">
        <div className="section-heading">
          <div>
            <h2>Your hubs</h2>
            <p>{cfg.hubs.length ? "Double-click the tray icon to return here." : "Create a hub to get started."}</p>
          </div>
          <button type="button" className="primary" onClick={() => void createHub()}>
            New hub
          </button>
        </div>
        <div className="hub-list">
          {cfg.hubs.map((hub) => (
            <div className="hub-row" key={hub.id}>
              <span className="hub-dot" style={{ ["--accent" as string]: cfg.accent }}>
                {hub.name.trim().slice(0, 1).toUpperCase() || "O"}
              </span>
              <span className="hub-name">{hub.name}</span>
              <button type="button" onClick={() => void editHub(hub.id)}>Edit</button>
            </div>
          ))}
        </div>
      </section>

      <label>
        <span>Accent</span>
        <input
          type="color"
          value={cfg.accent}
          onChange={(e) => setCfg({ ...cfg, accent: e.target.value })}
        />
      </label>

      <label>
        <span>Folder dwell ({cfg.dwellMs} ms)</span>
        <input
          type="range"
          min={80}
          max={600}
          step={10}
          value={cfg.dwellMs}
          onChange={(e) => setCfg({ ...cfg, dwellMs: Number(e.target.value) })}
        />
      </label>

      <label className="row">
        <span>Launch at sign-in</span>
        <input
          type="checkbox"
          checked={auto}
          onChange={async (e) => {
            const on = e.target.checked;
            if (on) await enable();
            else await disable();
            setAuto(await isEnabled());
          }}
        />
      </label>

      <p className="hint">
        Look for each hub orb on the desktop. Right-click an orb, or use Edit above,
        then drop
        <code> .lnk</code>, <code>.exe</code>, or <code>.url</code> files onto wedges.
        A ring holds at most 12 items. Orbit never moves files on your desktop.
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={() => void save()}>
          Save
        </button>
        <span className="status">{status}</span>
      </div>
    </div>
  );
}
