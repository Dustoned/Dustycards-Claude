"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  buildResolvedThemeCookie,
  buildSettingsCookie,
  DEFAULT_SETTINGS,
  initSettingsScript,
  mergeSettings,
  parseStoredSettings,
  resolveTheme,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
  type Card3dSize,
  type CardSize,
  type CardView,
  type ModalSize,
  type PriceSource,
  type SortBy,
  type SortDir,
  type Theme,
  type UiScale,
  type UserSettings,
} from "@/lib/user-settings";

export type {
  Theme,
  CardView,
  Card3dSize,
  CardSize,
  SortBy,
  SortDir,
  ModalSize,
  PriceSource,
  UserSettings,
  UiScale,
};

const SettingsContext = createContext<{
  settings: UserSettings;
  displaySettings: UserSettings;
  isLoaded: boolean;
  isMobileViewport: boolean;
  currentUserRole: "admin" | "user" | null;
  set: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  setDisplay: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
}>({
  settings: DEFAULT_SETTINGS,
  displaySettings: DEFAULT_SETTINGS,
  isLoaded: false,
  isMobileViewport: false,
  currentUserRole: null,
  set: () => {},
  setDisplay: () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

function load(): UserSettings {
  return parseStoredSettings(localStorage.getItem(SETTINGS_STORAGE_KEY)) ?? DEFAULT_SETTINGS;
}

function saveToBrowser(s: UserSettings) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(s));
  document.cookie = buildSettingsCookie(s);
  document.cookie = buildResolvedThemeCookie(resolveTheme(s.theme, prefersDark));
}

async function saveToAccount(s: UserSettings) {
  const response = await fetch("/api/account/settings", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: s }),
  });

  if (!response.ok) {
    throw new Error("Could not save account settings");
  }
}

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = resolveTheme(theme, prefersDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.cookie = buildResolvedThemeCookie(resolvedTheme);
}

function applyWidescreen(on: boolean) {
  document.documentElement.classList.toggle("widescreen", on);
}

function applyUiScale(scale: UiScale) {
  document.documentElement.dataset.uiScale = scale;
  document.documentElement.classList.remove("ui-scale-small", "ui-scale-medium", "ui-scale-large");
  document.documentElement.classList.add(`ui-scale-${scale}`);
}

function getDisplaySettings(settings: UserSettings, isMobileViewport: boolean): UserSettings {
  if (!isMobileViewport) return settings;

  return {
    ...settings,
    widescreen: false,
    uiScale: settings.mobileUiScale,
    defaultView: settings.mobileDefaultView,
    cardSize: settings.mobileCardSize,
    modalSize: settings.mobileModalSize,
    card3dSize: settings.mobileCard3dSize,
  };
}

function getDisplaySettingKey<K extends keyof UserSettings>(
  key: K,
  isMobileViewport: boolean
): K {
  if (!isMobileViewport) return key;

  const mobileKeyByDisplayKey: Partial<Record<keyof UserSettings, keyof UserSettings>> = {
    uiScale: "mobileUiScale",
    defaultView: "mobileDefaultView",
    cardSize: "mobileCardSize",
    modalSize: "mobileModalSize",
    card3dSize: "mobileCard3dSize",
  };

  return (mobileKeyByDisplayKey[key] ?? key) as K;
}

export default function SettingsProvider({
  children,
  initialSettings,
  initialMobileViewport = false,
  syncToAccount = false,
  currentUserRole = null,
}: {
  children: React.ReactNode;
  initialSettings?: UserSettings | null;
  initialMobileViewport?: boolean;
  syncToAccount?: boolean;
  currentUserRole?: "admin" | "user" | null;
}) {
  const [settings, setSettings] = useState<UserSettings>(initialSettings ?? DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(Boolean(initialSettings));
  const [isMobileViewport, setIsMobileViewport] = useState(initialMobileViewport);
  const didSyncInitialSettingsRef = useRef(false);
  const displaySettings = getDisplaySettings(settings, isMobileViewport);

  useEffect(() => {
    const s = mergeSettings(initialSettings ?? load());
    const initial = initialSettings ?? DEFAULT_SETTINGS;
    const nextRaw = JSON.stringify(s);
    const initialRaw = JSON.stringify(initial);
    saveToBrowser(s);
    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) return;

      if (nextRaw !== initialRaw) {
        setSettings(s);
      }
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialSettings]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const handleChange = () => {
      setIsMobileViewport((previous) => (previous === media.matches ? previous : media.matches));
    };

    handleChange();
    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    applyWidescreen(displaySettings.widescreen);
    applyUiScale(displaySettings.uiScale);
  }, [displaySettings.uiScale, displaySettings.widescreen, settings.theme]);

  useEffect(() => {
    if (settings.theme !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      applyTheme("system");
    };

    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, [settings.theme]);

  useEffect(() => {
    if (!syncToAccount || !isLoaded || didSyncInitialSettingsRef.current) return;

    didSyncInitialSettingsRef.current = true;
    void saveToAccount(settings).catch(() => {
      didSyncInitialSettingsRef.current = false;
    });
  }, [isLoaded, settings, syncToAccount]);

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => {
      const effectiveValue = key === "autoPriceRefresh" ? true : value;
      const next = { ...prev, [key]: effectiveValue };
      saveToBrowser(next);
      if (syncToAccount) {
        void saveToAccount(next).catch(() => undefined);
      }
      if (key === "theme") applyTheme(effectiveValue as Theme);
      if (key === "widescreen") {
        const effectiveSettings = getDisplaySettings(next, isMobileViewport);
        applyWidescreen(effectiveSettings.widescreen);
      }
      if (key === "uiScale" || key === "mobileUiScale") {
        const effectiveSettings = getDisplaySettings(next, isMobileViewport);
        applyUiScale(effectiveSettings.uiScale);
      }
      return next;
    });
  }

  function setDisplay<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    set(getDisplaySettingKey(key, isMobileViewport), value);
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        displaySettings,
        isLoaded,
        isMobileViewport,
        currentUserRole,
        set,
        setDisplay,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const initScript = `
${initSettingsScript}
`;
