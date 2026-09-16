import { useEffect, useState } from "react";
import { api } from "../api";

const svgModules = import.meta.glob<string>("../assets/hub-icons/*.svg", {
  eager: true,
  import: "default",
  query: "?raw",
});

export type BuiltinHubIcon = {
  id: string;
  category: "Desktop" | "Games";
  label: string;
  svg: string;
};

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const BUILTIN_HUB_ICONS: BuiltinHubIcon[] = Object.entries(svgModules)
  .map(([path, svg]) => {
    const id = path.split("/").pop()!.replace(/\.svg$/, "");
    const [family, group, ...name] = id.split("-");
    return {
      id,
      category: family === "game" ? "Games" : "Desktop",
      label: titleCase([group, ...name].join("-")),
      svg,
    } as BuiltinHubIcon;
  })
  .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

const builtinById = new Map(BUILTIN_HUB_ICONS.map((icon) => [icon.id, icon]));
const customCache = new Map<string, string>();

export function HubIcon({
  icon,
  fallback,
  className = "",
}: {
  icon?: string | null;
  fallback: string;
  className?: string;
}) {
  const customPath = icon?.startsWith("custom:") ? icon.slice("custom:".length) : null;
  const [customSrc, setCustomSrc] = useState<string | null>(
    customPath ? customCache.get(customPath) ?? null : null,
  );

  useEffect(() => {
    if (!customPath) {
      setCustomSrc(null);
      return;
    }
    const cached = customCache.get(customPath);
    if (cached) {
      setCustomSrc(cached);
      return;
    }
    let cancelled = false;
    void api.getIcon(customPath).then((src) => {
      customCache.set(customPath, src);
      if (!cancelled) setCustomSrc(src);
    }).catch(() => {
      if (!cancelled) setCustomSrc(null);
    });
    return () => {
      cancelled = true;
    };
  }, [customPath]);

  const builtin = icon?.startsWith("builtin:")
    ? builtinById.get(icon.slice("builtin:".length))
    : undefined;

  return (
    <span className={`hub-icon ${className}`} aria-hidden>
      {builtin ? (
        <span className="hub-icon-svg" dangerouslySetInnerHTML={{ __html: builtin.svg }} />
      ) : customSrc ? (
        <img src={customSrc} alt="" draggable={false} />
      ) : (
        <span className="hub-icon-letter">{fallback}</span>
      )}
    </span>
  );
}
