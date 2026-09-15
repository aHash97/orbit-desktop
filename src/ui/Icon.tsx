import { useEffect, useState } from "react";
import type { MenuItem } from "../types";
import { isFolder } from "../types";
import { api } from "../api";

const cache = new Map<string, string>();

export function Icon({ item }: { item: MenuItem }) {
  const [src, setSrc] = useState<string | null>(
    item.type === "shortcut" && item.path && cache.has(item.path)
      ? cache.get(item.path)!
      : null,
  );

  useEffect(() => {
    if (isFolder(item) || !item.path) return;
    if (cache.has(item.path)) {
      setSrc(cache.get(item.path)!);
      return;
    }
    let cancelled = false;
    api
      .getIcon(item.path)
      .then((url) => {
        cache.set(item.path, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (isFolder(item)) {
    return (
      <span className="icon-wrap folder-icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path
            fill="currentColor"
            d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.3c.4 0 .8.2 1.1.5l1.2 1.2c.3.3.7.5 1.1.5H18.5A2.5 2.5 0 0 1 21 8.7v8.8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            opacity="0.92"
          />
        </svg>
      </span>
    );
  }

  if (src) {
    return (
      <span className="icon-wrap">
        <img src={src} alt="" draggable={false} />
      </span>
    );
  }

  return (
    <span className="icon-wrap letter">{item.name.slice(0, 1).toUpperCase()}</span>
  );
}
