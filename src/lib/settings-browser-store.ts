import { resolveAppearanceColorScheme } from "@/lib/appearance-themes";
import {
  buildResolvedThemeCookie,
  buildSettingsCookie,
  mergeSettings,
  parseStoredSettings,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
  type UserSettings,
} from "@/lib/user-settings";

type SettingsWindow = Window & {
  __dustycardsSettings?: Partial<UserSettings>;
};

export function loadBrowserSettings(): UserSettings | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Fall back to the prepaint snapshot when browser storage is unavailable.
  }

  const preloaded = (window as SettingsWindow).__dustycardsSettings;
  return preloaded ? mergeSettings(preloaded) : null;
}

export function saveBrowserSettings(settings: UserSettings): UserSettings {
  const snapshot = mergeSettings(settings);
  if (typeof window === "undefined") return snapshot;

  // Keep router.refresh() and the prepaint bootstrap on the same newest value.
  (window as SettingsWindow).__dustycardsSettings = snapshot;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(snapshot));
  } catch {
    // Cookies still preserve preferences when browser storage is unavailable.
  }

  if (typeof document !== "undefined") {
    try {
      document.cookie = buildSettingsCookie(snapshot);
      document.cookie = buildResolvedThemeCookie(
        resolveAppearanceColorScheme(snapshot.appearance)
      );
    } catch {
      // The in-memory setting remains active for this session.
    }
  }

  return snapshot;
}
