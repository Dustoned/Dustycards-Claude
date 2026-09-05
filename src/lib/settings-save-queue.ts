import type { UserSettings } from "@/lib/user-settings";

export type SettingsAccountSave = (settings: UserSettings) => Promise<void>;
export type SettingsSaveStatus = "saving" | "saved" | "error";

export function createLatestSettingsSaveQueue(
  save: SettingsAccountSave,
  onStatusChange?: (status: SettingsSaveStatus) => void,
) {
  let pending: UserSettings | null = null;
  let failed: UserSettings | null = null;
  let active: Promise<void> | null = null;

  async function drain() {
    onStatusChange?.("saving");
    while (pending) {
      const next = pending;
      pending = null;

      try {
        await save(next);
        failed = null;
      } catch {
        // Keep the failed snapshot for retry. A newer queued snapshot supersedes
        // it and includes every subsequent edit, so never retry an older write.
        failed = next;
        if (!pending) {
          onStatusChange?.("error");
          return;
        }
      }
    }
    onStatusChange?.("saved");
  }

  function start(): Promise<void> {
    active = Promise.resolve()
      .then(drain)
      .finally(() => {
        active = null;
        if (pending) start();
      });
    return active;
  }

  return {
    enqueue(settings: UserSettings): Promise<void> {
      pending = settings;
      return active ?? start();
    },
    retry(): Promise<void> {
      if (active) return active;
      if (!failed) return Promise.resolve();
      pending = failed;
      return start();
    },
  };
}
