import { check, Update, type DownloadEvent } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | { phase: "checking" }
  | { phase: "current" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; percent: number | null }
  | { phase: "installing"; version: string };

export async function checkForUpdate(
  onStatus: (status: UpdateStatus) => void,
): Promise<Update | null> {
  onStatus({ phase: "checking" });
  const update = await check({ timeout: 30_000 });
  if (!update) {
    onStatus({ phase: "current" });
    return null;
  }

  onStatus({ phase: "available", version: update.version });
  return update;
}

export async function installUpdate(
  update: Update,
  onStatus: (status: UpdateStatus) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;
  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
      onStatus({ phase: "downloading", version: update.version, percent: 0 });
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
      onStatus({ phase: "downloading", version: update.version, percent });
    } else {
      onStatus({ phase: "installing", version: update.version });
    }
  });
}

export async function checkAndInstallUpdate(
  onStatus: (status: UpdateStatus) => void,
): Promise<boolean> {
  const update = await checkForUpdate(onStatus);
  if (!update) return false;
  await installUpdate(update, onStatus);
  return true;
}
