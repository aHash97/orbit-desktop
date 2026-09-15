import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import {
  FolderItem,
  Hub,
  MenuItem,
  PieSession,
  folderNameAtPath,
  isFolder,
  itemsAtPath,
  mapAtPath,
  MAX_PER_RING,
} from "../types";
import {
  INNER_R,
  OUTER_R,
  hitCenter,
  hitWedge,
  layoutWedges,
  polar,
  wedgePath,
} from "./geometry";
import { Icon } from "../ui/Icon";

type Ctx = { x: number; y: number; index: number | "center" | "empty" };

export function PieApp() {
  const [session, setSession] = useState<PieSession | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [rename, setRename] = useState<{ target: "hub" | "item"; id?: string; value: string } | null>(
    null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [filesOver, setFilesOver] = useState(false);
  const [notice, setNotice] = useState("");
  const dwellRef = useRef<number | null>(null);
  const leaveRef = useRef<number | null>(null);
  const sessionRef = useRef<PieSession | null>(null);
  const itemsRef = useRef<MenuItem[]>([]);
  const pathRef = useRef<string[]>([]);

  useEffect(() => {
    let unlistenSession: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;

    const applySession = (payload: PieSession) => {
      setSession(payload);
      setPath([]);
      setHover(null);
      setCtx(null);
      setRename(null);
      setNotice("");
    };

    void api.getPieSession().then((s) => {
      if (s) applySession(s);
    });

    listen<PieSession>("pie-session", (e) => applySession(e.payload)).then((fn) => {
      unlistenSession = fn;
    });

    let disposed = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const current = sessionRef.current;
        if (!current?.edit) return;
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setFilesOver(true);
        } else if (event.payload.type === "drop") {
          setFilesOver(false);
          void addPaths(event.payload.paths);
        } else {
          setFilesOver(false);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlistenDrop = fn;
      });

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setRename(null);
        setCtx(null);
        void api.closePie();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      unlistenSession?.();
      unlistenDrop?.();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const hub: Hub | null = session?.hub ?? null;
  const edit = session?.edit ?? false;
  const items = hub ? itemsAtPath(hub.items, path) : [];
  const plus = edit && items.length < MAX_PER_RING;
  const visualCount = Math.max(items.length + (plus ? 1 : 0), items.length === 0 && edit ? 1 : 0);
  const wedges = useMemo(() => layoutWedges(visualCount || 1), [visualCount]);

  sessionRef.current = session;
  itemsRef.current = items;
  pathRef.current = path;

  function clearDwell() {
    if (dwellRef.current) {
      window.clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
  }

  function clearLeave() {
    if (leaveRef.current) {
      window.clearTimeout(leaveRef.current);
      leaveRef.current = null;
    }
  }

  async function addPaths(paths: string[], targetIndex: number | null = null) {
    const current = sessionRef.current;
    if (!current?.edit) return;
    const hubNow = current.hub;
    const liveItems = itemsRef.current;
    const metas: MenuItem[] = [];
    for (const p of paths) {
      try {
        metas.push(await api.shortcutMeta(p));
      } catch {
        /* skip */
      }
    }
    if (metas.length === 0) {
      setNotice("No supported shortcuts were selected.");
      return;
    }

    const next = [...liveItems];
    const room = MAX_PER_RING - next.length;
    const add = metas.slice(0, Math.max(0, room));
    if (add.length === 0) {
      setNotice("This ring is full. Add a folder first.");
      return;
    }

    if (targetIndex != null && targetIndex < next.length) {
      next.splice(targetIndex, 0, ...add);
      if (next.length > MAX_PER_RING) next.length = MAX_PER_RING;
    } else {
      next.push(...add);
    }
    const tree = mapAtPath(hubNow.items, pathRef.current, () => next);
    await api.setHubItems(hubNow.id, tree);
    setSession((s) => (s ? { ...s, hub: { ...s.hub, items: tree } } : s));
    setCtx(null);
    setNotice(`${add.length} shortcut${add.length === 1 ? "" : "s"} added.`);
  }

  async function pickShortcuts() {
    clearLeave();
    setCtx(null);
    setNotice("");
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: "Add shortcuts to Orbit",
        filters: [
          {
            name: "Shortcuts and applications",
            extensions: ["lnk", "exe", "url"],
          },
        ],
      });
      if (!selected) return;
      await addPaths(Array.isArray(selected) ? selected : [selected]);
    } catch (error) {
      setNotice(`Could not open file picker: ${String(error)}`);
    }
  }

  async function persist(nextItems: MenuItem[]) {
    if (!hub) return;
    const next = mapAtPath(hub.items, path, () => nextItems);
    await api.setHubItems(hub.id, next);
    setSession((s) => (s ? { ...s, hub: { ...s.hub, items: next } } : s));
  }

  function drill(index: number) {
    const item = items[index];
    if (!item || !isFolder(item)) return;
    clearDwell();
    setPath((p) => [...p, item.id]);
    setHover(null);
    setCtx(null);
  }

  async function activate(index: number) {
    const item = items[index];
    if (!item) {
      if (edit) await pickShortcuts();
      return;
    }
    if (isFolder(item)) {
      drill(index);
      return;
    }
    if (edit) return;
    await api.launch(item.path);
    await api.closePie();
  }

  function onMove(ev: React.PointerEvent) {
    if (!session) return;
    clearLeave();
    const x = ev.clientX;
    const y = ev.clientY;
    if (hitCenter(x, y, session.centerX, session.centerY)) {
      clearDwell();
      setHover(null);
      return;
    }
    const idx = hitWedge(x, y, session.centerX, session.centerY, wedges);
    if (idx !== hover) {
      clearDwell();
      setHover(idx);
      const item = idx != null ? items[idx] : undefined;
      if (!edit && idx != null && item && isFolder(item)) {
        dwellRef.current = window.setTimeout(() => drill(idx), session.dwellMs);
      }
    }
    const dist = Math.hypot(x - session.centerX, y - session.centerY);
    if (!edit && dist > OUTER_R + 36) {
      leaveRef.current = window.setTimeout(() => {
        void api.closePie();
      }, 180);
    }
  }

  async function onClick(ev: React.MouseEvent) {
    if (!session || ev.button !== 0) return;
    setCtx(null);
    const x = ev.clientX;
    const y = ev.clientY;
    if (hitCenter(x, y, session.centerX, session.centerY)) {
      if (path.length > 0) {
        setPath((p) => p.slice(0, -1));
        return;
      }
      if (edit) {
        setRename({ target: "hub", value: hub?.name ?? "" });
        return;
      }
      await api.closePie();
      return;
    }
    const idx = hitWedge(x, y, session.centerX, session.centerY, wedges);
    if (idx == null) {
      if (!edit) await api.closePie();
      return;
    }
    if (dragId) return;
    await activate(idx);
  }

  function onContext(ev: React.MouseEvent) {
    ev.preventDefault();
    if (!session?.edit) return;
    const x = ev.clientX;
    const y = ev.clientY;
    if (hitCenter(x, y, session.centerX, session.centerY)) {
      setCtx({ x, y, index: "center" });
      return;
    }
    const idx = hitWedge(x, y, session.centerX, session.centerY, wedges);
    if (idx == null) {
      setCtx({ x, y, index: "empty" });
      return;
    }
    setCtx({ x, y, index: idx });
  }

  async function addFolder() {
    if (!hub) return;
    if (items.length >= MAX_PER_RING) return;
    const folder: FolderItem = {
      type: "folder",
      id: crypto.randomUUID(),
      name: "Folder",
      items: [],
    };
    await persist([...items, folder]);
    setCtx(null);
    setRename({ target: "item", id: folder.id, value: "Folder" });
  }

  async function removeAt(index: number) {
    const next = items.filter((_, i) => i !== index);
    await persist(next);
    setCtx(null);
  }

  async function applyRename() {
    if (!rename || !hub) return;
    const value = rename.value.trim() || (rename.target === "hub" ? "Hub" : "Item");
    if (rename.target === "hub") {
      await api.renameHub(hub.id, value);
      setSession((s) => (s ? { ...s, hub: { ...s.hub, name: value } } : s));
    } else {
      const next = items.map((it) =>
        it.id === rename.id ? { ...it, name: value } : it,
      );
      await persist(next);
    }
    setRename(null);
  }

  async function onInternalDrop(toIndex: number) {
    if (!dragId) return;
    const from = items.findIndex((it) => it.id === dragId);
    setDragId(null);
    if (from < 0 || from === toIndex) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    const insert = toIndex > from ? toIndex - 1 : toIndex;
    next.splice(Math.max(0, insert), 0, moved);
    await persist(next);
  }

  if (!session || !hub) {
    return <div className="pie-root idle" />;
  }

  const cx = session.centerX;
  const cy = session.centerY;
  const title = folderNameAtPath(hub, path);
  const emptyEdit = edit && items.length === 0;

  return (
    <div
      className={`pie-root ${edit ? "edit" : ""} ${
        items.length <= 4 ? "sparse" : items.length <= 8 ? "medium" : "dense"
      }`}
      style={{ ["--accent" as string]: session.accent }}
      onPointerMove={onMove}
      onPointerLeave={() => {
        if (!edit) leaveRef.current = window.setTimeout(() => void api.closePie(), 220);
      }}
      onClick={onClick}
      onContextMenu={onContext}
    >
      <svg className="pie-svg" width="100%" height="100%">
        <defs>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          className="glass-disc"
          cx={cx}
          cy={cy}
          r={OUTER_R + 18}
          filter="url(#soft)"
        />
        {emptyEdit ? (
          <circle
            className="empty-ring"
            cx={cx}
            cy={cy}
            r={(INNER_R + OUTER_R) / 2}
          />
        ) : (
          wedges.map((w, i) => {
            const item = items[i];
            const isPlus = plus && i === items.length;
            const active = hover === i;
            return (
              <path
                key={item?.id ?? `plus-${i}`}
                className={`wedge ${active ? "hot" : ""} ${isPlus ? "plus" : ""} ${
                  item && isFolder(item) ? "folder" : ""
                }`}
                d={wedgePath(cx, cy, INNER_R, OUTER_R, w.a0, w.a1)}
                onPointerDown={(ev) => {
                  if (edit && item && ev.button === 0) {
                    setDragId(item.id);
                  }
                }}
                onPointerUp={() => {
                  if (edit && dragId) void onInternalDrop(i);
                }}
              />
            );
          })
        )}
        <circle className="center-disc" cx={cx} cy={cy} r={INNER_R - 2} />
      </svg>

      <div className="center-label" style={{ left: cx, top: cy }}>
        <div className="center-kicker">{path.length ? "Back" : edit ? "Edit" : "Orbit"}</div>
        <div className="center-title">{title}</div>
        {edit && (
          <button
            type="button"
            className="center-done"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void api.closePie();
            }}
          >
            Done
          </button>
        )}
      </div>

      {emptyEdit && (
        <div className="empty-actions" style={{ left: cx, top: cy + 76 }}>
          <button
            type="button"
            className="empty-add"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void pickShortcuts();
            }}
          >
            <span>+</span> Add shortcuts
          </button>
          <button
            type="button"
            className="empty-folder"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void addFolder();
            }}
          >
            New folder
          </button>
        </div>
      )}

      {notice && <div className="pie-notice">{notice}</div>}
      {filesOver && (
        <div className="drop-overlay" style={{ left: cx, top: cy }}>
          Drop to add
        </div>
      )}

      {!emptyEdit &&
        wedges.map((w, i) => {
          const item = items[i];
          const isPlus = plus && i === items.length;
          const iconRadius = items.length <= 4 ? 124 : items.length <= 8 ? 128 : 132;
          const [lx, ly] = polar(cx, cy, iconRadius, w.mid);
          return (
            <div
              key={item?.id ?? `plus-label-${i}`}
              className={`wedge-ui ${hover === i ? "hot" : ""}`}
              style={{ left: lx, top: ly }}
            >
              {item ? (
                <>
                  <Icon item={item} />
                  {isFolder(item) && <span className="folder-pip" />}
                  <span className="wedge-name">{item.name}</span>
                </>
              ) : isPlus ? (
                <>
                  <span className="plus-mark">+</span>
                  <span className="wedge-name">Add files</span>
                </>
              ) : null}
            </div>
          );
        })}

      {ctx && (
        <ul
          className="ctx"
          style={{ left: ctx.x, top: ctx.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ctx.index === "center" && (
            <>
              <li onClick={() => setRename({ target: "hub", value: hub.name })}>Rename hub</li>
              <li
                onClick={() => {
                  void api.deleteHub(hub.id);
                  void api.closePie();
                }}
              >
                Delete hub
              </li>
              <li onClick={() => void api.closePie()}>Done</li>
            </>
          )}
          {ctx.index === "empty" && (
            <>
              <li onClick={() => void pickShortcuts()}>Add shortcuts…</li>
              <li onClick={() => void addFolder()}>New folder</li>
              <li onClick={() => void api.closePie()}>Done</li>
            </>
          )}
          {typeof ctx.index === "number" && items[ctx.index] && (
            <>
              <li
                onClick={() =>
                  setRename({
                    target: "item",
                    id: items[ctx.index as number].id,
                    value: items[ctx.index as number].name,
                  })
                }
              >
                Rename
              </li>
              <li onClick={() => void removeAt(ctx.index as number)}>Delete</li>
              {isFolder(items[ctx.index]) && (
                <li onClick={() => drill(ctx.index as number)}>Open folder</li>
              )}
            </>
          )}
          {typeof ctx.index === "number" && !items[ctx.index] && (
            <li onClick={() => void addFolder()}>New folder</li>
          )}
        </ul>
      )}

      {rename && (
        <form
          className="rename"
          style={{ left: cx, top: cy }}
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            void applyRename();
          }}
        >
          <input
            autoFocus
            value={rename.value}
            onChange={(e) => setRename({ ...rename, value: e.target.value })}
            onBlur={() => void applyRename()}
            maxLength={32}
          />
        </form>
      )}
    </div>
  );
}
