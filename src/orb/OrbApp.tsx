import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import type { AppConfig, Hub } from "../types";

function hubIdFromLabel(label: string): string | null {
  return label.startsWith("orb-") ? label.slice(4) : null;
}

export function OrbApp() {
  const id = hubIdFromLabel(getCurrentWindow().label);
  const [hub, setHub] = useState<Hub | null>(null);
  const [accent, setAccent] = useState("#7EB8D4");
  const hoverTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    const apply = (cfg: AppConfig) => {
      setAccent(cfg.accent);
      setHub(cfg.hubs.find((h) => h.id === id) ?? null);
    };
    void api.getConfig().then(apply);
    let un: (() => void) | undefined;
    listen<AppConfig>("config-updated", (e) => apply(e.payload)).then((fn) => {
      un = fn;
    });
    return () => un?.();
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
      className="orb"
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
        dragging.current = false;
        start.current = { x: e.screenX, y: e.screenY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.screenX - start.current.x;
        const dy = e.screenY - start.current.y;
        if (!dragging.current && Math.hypot(dx, dy) > 4) {
          dragging.current = true;
          cancelHover();
        }
        if (dragging.current) {
          void api.dragOrb(id);
        }
      }}
      onPointerUp={async () => {
        const wasDrag = dragging.current;
        dragging.current = false;
        start.current = null;
        if (!wasDrag) return;
        await api.finishOrbDrag(id);
      }}
    >
      <div className="orb-disc">
        <span>{letter}</span>
      </div>
    </div>
  );
}
