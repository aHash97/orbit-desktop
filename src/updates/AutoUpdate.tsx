import { useEffect } from "react";
import { api } from "../api";
import { checkAndInstallUpdate } from "../updates";

export function AutoUpdate() {
  useEffect(() => {
    let cancelled = false;
    void api.getConfig().then((config) => {
      if (cancelled || !config.autoUpdate) return;
      void checkAndInstallUpdate(() => {}).catch(() => {
        // Automatic checks stay quiet; the manual settings check reports errors.
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <div className="hidden-main" />;
}
