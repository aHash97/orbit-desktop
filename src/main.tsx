import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PieApp } from "./pie/PieApp";
import { OrbApp } from "./orb/OrbApp";
import { SettingsApp } from "./settings/SettingsApp";
import "./styles.css";

document.addEventListener("contextmenu", (e) => {
  const label = getCurrentWindow().label;
  if (label !== "pie") e.preventDefault();
});

function Root() {
  const label = getCurrentWindow().label;
  if (label === "pie") return <PieApp />;
  if (label === "settings") return <SettingsApp />;
  if (label.startsWith("orb-")) return <OrbApp />;
  return <div className="hidden-main" />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
