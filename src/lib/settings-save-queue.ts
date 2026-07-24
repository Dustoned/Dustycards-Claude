import type { UserSettings } from "@/lib/user-settings";

export type SettingsAccountSave = (settings: UserSettings) => Promise<void>;

export function createLatestSettingsSaveQueue(save: SettingsAccountSave) {
  let pending: UserSettings | null = null;
  let active: Promise<void> | null = null;

  async function drain() {
    while (pending) {
      const next = pending;
      pending = null;

      try {
        await save(next);
      } catch {
        // Browser storage remains authoritative until a later account save succeeds.
      }
    }
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
  };
}
