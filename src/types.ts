export const MAX_PER_RING = 12;

export type ShortcutItem = {
  type: "shortcut";
  id: string;
  name: string;
  path: string;
  icon?: string | null;
};

export type FolderItem = {
  type: "folder";
  id: string;
  name: string;
  icon?: string | null;
  items: MenuItem[];
};

export type MenuItem = ShortcutItem | FolderItem;

export type Hub = {
  id: string;
  name: string;
  x: number;
  y: number;
  monitor: number;
  items: MenuItem[];
};

export type AppConfig = {
  dwellMs: number;
  accent: string;
  autoUpdate: boolean;
  hubs: Hub[];
};

export type PieSession = {
  hub: Hub;
  edit: boolean;
  dwellMs: number;
  accent: string;
  screenshot?: string | null;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};


export function isFolder(item: MenuItem): item is FolderItem {
  return item.type === "folder";
}

export function itemsAtPath(items: MenuItem[], path: string[]): MenuItem[] {
  let cur = items;
  for (const id of path) {
    const next = cur.find((it) => it.id === id);
    if (!next || !isFolder(next)) return cur;
    cur = next.items;
  }
  return cur;
}

export function mapAtPath(
  items: MenuItem[],
  path: string[],
  mapper: (items: MenuItem[]) => MenuItem[],
): MenuItem[] {
  if (path.length === 0) return mapper(items);
  const [head, ...rest] = path;
  return items.map((it) => {
    if (it.id !== head || !isFolder(it)) return it;
    return { ...it, items: mapAtPath(it.items, rest, mapper) };
  });
}

export function folderNameAtPath(hub: Hub, path: string[]): string {
  if (path.length === 0) return hub.name;
  let cur: MenuItem[] = hub.items;
  let name = hub.name;
  for (const id of path) {
    const next = cur.find((it) => it.id === id);
    if (!next || !isFolder(next)) break;
    name = next.name;
    cur = next.items;
  }
  return name;
}
