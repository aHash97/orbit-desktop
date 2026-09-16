import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import { MAX_PER_RING, type AppConfig, type Hub, type MenuItem } from "../types";
import { HubIcon } from "../ui/HubIcon";

function hubIdFromLabel(label: string): string | null {
  return label.startsWith("orb-") ? label.slice(4) : null;
}

export function OrbApp() {
  const orbWindow = getCurrentWindow();
  const id = hubIdFromLabel(orbWindow.label);
  const [hub, setHub] = useState<Hub | null>(null);
  const [accent, setAccent] = useState("#7EB8D4");
  const [filesOver, setFilesOver] = useState(false);
  const hubRef = useRef<Hub | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const savePositionTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const apply = (cfg: AppConfig) => {
      setAccent(cfg.accent);
      const nextHub = cfg.hubs.find((h) => h.id === id) ?? null;
      hubRef.current = nextHub;
      setHub(nextHub);
    };
    void api.getConfig().then(apply);
    let un: (() => void) | undefined;
    listen<AppConfig>("config-updated", (e) => apply(e.payload)).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setFilesOver(true);
          return;
        }
        if (event.payload.type === "leave") {
          setFilesOver(false);
          return;
        }
        if (event.payload.type !== "drop") return;
        setFilesOver(false);
        const paths = event.payload.paths;
        const current = hubRef.current;
        if (!current) return;
        void (async () => {
          const room = MAX_PER_RING - current.items.length;
          if (room <= 0) {
            await api.openPie(id, true);
            return;
          }
          const added: MenuItem[] = [];
          for (const path of paths.slice(0, room)) {
            try {
              added.push(await api.shortcutMeta(path));
            } catch {
              // Keep valid shortcuts if a mixed selection contains an unsupported shell item.
            }
          }
          if (added.length === 0) return;
          const cfg = await api.setHubItems(id, [...current.items, ...added]);
          const updated = cfg.hubs.find((h) => h.id === id) ?? null;
          hubRef.current = updated;
          setHub(updated);
          await api.openPie(id, true);
        })();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let unlistenMoved: (() => void) | undefined;
    void orbWindow
      .onMoved(() => {
        dragging.current = true;
        if (savePositionTimer.current) window.clearTimeout(savePositionTimer.current);
        savePositionTimer.current = window.setTimeout(() => {
          savePositionTimer.current = null;
          void api.finishOrbDrag(id).finally(() => {
            dragging.current = false;
          });
        }, 180);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlistenMoved = fn;
      });
    return () => {
      disposed = true;
      unlistenMoved?.();
      if (savePositionTimer.current) window.clearTimeout(savePositionTimer.current);
    };
  }, [id]);

  if (!id || !hub) return <div className="orb dead" />;

  const letter = hub.name.trim().slice(0, 1).toUpperCase() || "O";

  function cancelHover() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  return (
    <div
      className={`orb ${filesOver ? "files-over" : ""}`}
      style={{ ["--accent" as string]: accent }}
      onPointerEnter={() => {
        if (dragging.current) return;
        cancelHover();
        hoverTimer.current = window.setTimeout(() => {
          void api.openPie(id, false);
        }, 160);
      }}
      onPointerLeave={cancelHover}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelHover();
        void api.openPie(id, true);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        cancelHover();
        dragging.current = true;
        void orbWindow.startDragging().finally(() => {
          if (!savePositionTimer.current) dragging.current = false;
        });
      }}
    >
      <div className="orb-disc">
        <HubIcon icon={hub.icon} fallback={letter} className="orb-hub-icon" />
      </div>
    </div>
  );
}
