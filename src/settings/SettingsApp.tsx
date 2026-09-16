import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { confirm as confirmDialog, open } from "@tauri-apps/plugin-dialog";
import type { Update } from "@tauri-apps/plugin-updater";
import { api } from "../api";
import type { AppConfig } from "../types";
import { checkForUpdate, installUpdate, type UpdateStatus } from "../updates";
import { BUILTIN_HUB_ICONS, HubIcon } from "../ui/HubIcon";

type ArrangeMode = "distribute-horizontal" | "distribute-vertical" | "middle" | "center";

export function SettingsApp() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [iconHubId, setIconHubId] = useState<string | null>(null);
  const [selectedHubIds, setSelectedHubIds] = useState<string[]>([]);

  useEffect(() => {
    void api.getConfig().then((next) => {
      setCfg(next);
      setSelectedHubIds(next.hubs.map((hub) => hub.id));
    });
    void isEnabled().then(setAuto);
    void getVersion().then(setVersion);
    let unlisten: (() => void) | undefined;
    void listen<AppConfig>("config-updated", (event) => {
      setCfg(event.payload);
      setSelectedHubIds((prev) => {
        const available = new Set(event.payload.hubs.map((hub) => hub.id));
        const kept = prev.filter((id) => available.has(id));
        return kept.length ? kept : event.payload.hubs.map((hub) => hub.id);
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  if (!cfg) {
    return <div className="settings" />;
  }

  async function save() {
    if (!cfg) return;
    const next = await api.saveSettings(cfg.dwellMs, cfg.accent, cfg.autoUpdate);
    setCfg(next);
    setStatus("Saved");
    window.setTimeout(() => setStatus(""), 1200);
  }

  async function createHub() {
    setStatus("Creating hub…");
    try {
      const hub = await api.createHub();
      setCfg(await api.getConfig());
      setSelectedHubIds((prev) => [...prev, hub.id]);
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

  async function setHubAccent(id: string, accent: string) {
    try {
      setCfg(await api.setHubAccent(id, accent));
      setStatus("Hub color saved");
    } catch (error) {
      setStatus(`Could not change hub color: ${String(error)}`);
    }
  }

  async function chooseBuiltinIcon(icon: string | null) {
    if (!iconHubId) return;
    try {
      setCfg(await api.setHubIcon(iconHubId, icon ? `builtin:${icon}` : null));
      setIconHubId(null);
      setStatus(icon ? "Hub icon saved" : "Hub icon removed");
    } catch (error) {
      setStatus(`Could not change hub icon: ${String(error)}`);
    }
  }

  async function chooseCustomIcon() {
    if (!iconHubId) return;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Choose a hub icon",
        filters: [{ name: "Images", extensions: ["svg", "ico", "jpg", "jpeg", "png"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setCfg(await api.importHubIcon(iconHubId, selected));
      setIconHubId(null);
      setStatus("Custom hub icon saved");
    } catch (error) {
      setStatus(`Could not use that icon: ${String(error)}`);
    }
  }

  async function deleteHub(id: string, name: string) {
    const confirmed = await confirmDialog(`Delete “${name}” and all of its shortcuts?`, {
      title: "Delete hub",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    try {
      setCfg(await api.deleteHub(id));
      setSelectedHubIds((prev) => prev.filter((hubId) => hubId !== id));
      setStatus("Hub deleted");
    } catch (error) {
      setStatus(`Could not delete hub: ${String(error)}`);
    }
  }

  function toggleHubSelection(id: string) {
    setSelectedHubIds((prev) =>
      prev.includes(id) ? prev.filter((hubId) => hubId !== id) : [...prev, id],
    );
  }

  function selectAllHubs() {
    if (!cfg) return;
    setSelectedHubIds(cfg.hubs.map((hub) => hub.id));
  }

  async function arrangeSelected(mode: ArrangeMode) {
    const ids = selectedHubIds.length ? selectedHubIds : cfg?.hubs.map((hub) => hub.id) ?? [];
    if (!ids.length) {
      setStatus("Create a hub first");
      return;
    }
    try {
      setCfg(await api.arrangeHubs(ids, mode));
      setStatus(
        mode === "distribute-horizontal"
          ? "Distributed horizontally"
          : mode === "distribute-vertical"
            ? "Distributed vertically"
            : mode === "middle"
              ? "Aligned to middle"
              : "Aligned to center",
      );
    } catch (error) {
      setStatus(`Could not arrange hubs: ${String(error)}`);
    }
  }

  async function checkForUpdates() {
    setUpdateError("");
    setPendingUpdate(null);
    try {
      setPendingUpdate(await checkForUpdate(setUpdateStatus));
    } catch (error) {
      setUpdateError(`Update check failed: ${String(error)}`);
    }
  }

  async function installPendingUpdate() {
    if (!pendingUpdate) return;
    setUpdateError("");
    try {
      await installUpdate(pendingUpdate, setUpdateStatus);
    } catch (error) {
      setUpdateError(`Update installation failed: ${String(error)}`);
    }
  }

  function updateLabel() {
    if (updateError) return updateError;
    if (!updateStatus) return version ? `Version ${version}` : "";
    switch (updateStatus.phase) {
      case "checking":
        return "Checking for updates…";
      case "current":
        return `Orbit ${version} is up to date.`;
      case "available":
        return `Orbit ${updateStatus.version} is available.`;
      case "downloading":
        return updateStatus.percent == null
          ? `Downloading Orbit ${updateStatus.version}…`
          : `Downloading Orbit ${updateStatus.version} — ${updateStatus.percent}%`;
      case "installing":
        return `Installing Orbit ${updateStatus.version}…`;
    }
  }

  const allSelected = cfg.hubs.length > 0 && selectedHubIds.length === cfg.hubs.length;
  const canArrange = selectedHubIds.length > 0 || cfg.hubs.length > 0;
  const canDistribute = (selectedHubIds.length || cfg.hubs.length) >= 2;

  return (
    <div className="settings" style={{ ["--accent" as string]: cfg.accent }}>
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
            <div className="hub-row" key={hub.id} style={{ ["--accent" as string]: hub.accent }}>
              <label className="hub-select" title={`Select ${hub.name}`}>
                <span className="sr-only">Select {hub.name}</span>
                <input
                  type="checkbox"
                  checked={selectedHubIds.includes(hub.id)}
                  onChange={() => toggleHubSelection(hub.id)}
                />
              </label>
              <span className="hub-dot">
                <HubIcon
                  icon={hub.icon}
                  fallback={hub.name.trim().slice(0, 1).toUpperCase() || "O"}
                />
              </span>
              <span className="hub-name">{hub.name}</span>
              <label className="hub-color" title={`Accent color for ${hub.name}`}>
                <span className="sr-only">Accent color for {hub.name}</span>
                <input
                  type="color"
                  value={hub.accent}
                  onChange={(event) => void setHubAccent(hub.id, event.target.value)}
                />
              </label>
              <button type="button" onClick={() => setIconHubId(hub.id)}>Icon</button>
              <button type="button" onClick={() => void editHub(hub.id)}>Edit</button>
              <button
                type="button"
                className="danger"
                onClick={() => void deleteHub(hub.id, hub.name)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        {cfg.hubs.length > 0 && (
          <div className="arrange-bar">
            <div className="arrange-heading">
              <span>Arrange</span>
              <button type="button" className="linkish" onClick={selectAllHubs} disabled={allSelected}>
                Select all
              </button>
            </div>
            <div className="arrange-actions">
              <button
                type="button"
                disabled={!canDistribute}
                title="Space selected hubs evenly left to right"
                onClick={() => void arrangeSelected("distribute-horizontal")}
              >
                Distribute horizontally
              </button>
              <button
                type="button"
                disabled={!canDistribute}
                title="Space selected hubs evenly top to bottom"
                onClick={() => void arrangeSelected("distribute-vertical")}
              >
                Distribute vertically
              </button>
              <button
                type="button"
                disabled={!canArrange}
                title="Align selected hubs to a shared horizontal middle"
                onClick={() => void arrangeSelected("middle")}
              >
                Middle
              </button>
              <button
                type="button"
                disabled={!canArrange}
                title="Align selected hubs to a shared vertical center"
                onClick={() => void arrangeSelected("center")}
              >
                Center
              </button>
            </div>
          </div>
        )}
      </section>

      <label>
        <span>Default accent for new hubs</span>
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

      <section className="update-card">
        <div>
          <strong>Updates</strong>
          <span>{updateLabel()}</span>
        </div>
        <div className="update-actions">
          {pendingUpdate && (
            <button type="button" onClick={() => void installPendingUpdate()}>
              Install update
            </button>
          )}
          <button
            type="button"
            disabled={updateStatus?.phase === "checking" || updateStatus?.phase === "downloading"}
            onClick={() => void checkForUpdates()}
          >
            Check now
          </button>
        </div>
      </section>

      <label className="row">
        <span>Install updates automatically</span>
        <input
          type="checkbox"
          checked={cfg.autoUpdate}
          onChange={(e) => setCfg({ ...cfg, autoUpdate: e.target.checked })}
        />
      </label>

      <p className="hint">
        Look for each hub orb on the desktop. Right-click an orb, or use Edit above,
        then right-click its center to rename it, change its icon, or delete it. Drop
        <code> .lnk</code>, <code>.exe</code>, or <code>.url</code> files onto wedges.
        A ring holds at most 12 items. Select hubs above to distribute or align them.
        Orbit never moves files on your desktop.
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={() => void save()}>
          Save
        </button>
        <span className="status">{status}</span>
      </div>

      {iconHubId && (() => {
        const selectedHub = cfg.hubs.find((hub) => hub.id === iconHubId);
        if (!selectedHub) return null;
        return (
          <div
            className="icon-picker settings-icon-picker"
            style={{ ["--accent" as string]: selectedHub.accent }}
          >
            <div className="icon-picker-heading">
              <div>
                <strong>{selectedHub.name} icon</strong>
                <span>Choose a built-in icon or use your own.</span>
              </div>
              <button type="button" className="icon-picker-close" onClick={() => setIconHubId(null)}>
                ×
              </button>
            </div>
            <div className="icon-picker-actions">
              <button type="button" onClick={() => void chooseBuiltinIcon(null)}>No icon</button>
              <button type="button" onClick={() => void chooseCustomIcon()}>Choose custom…</button>
            </div>
            <div className="icon-picker-scroll">
              {(["Desktop", "Games"] as const).map((category) => (
                <section key={category}>
                  <h3>{category}</h3>
                  <div className="icon-picker-grid">
                    {BUILTIN_HUB_ICONS.filter((icon) => icon.category === category).map((icon) => (
                      <button
                        type="button"
                        key={icon.id}
                        className={selectedHub.icon === `builtin:${icon.id}` ? "selected" : ""}
                        title={icon.label}
                        aria-label={icon.label}
                        onClick={() => void chooseBuiltinIcon(icon.id)}
                      >
                        <HubIcon icon={`builtin:${icon.id}`} fallback="" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
