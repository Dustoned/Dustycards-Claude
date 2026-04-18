"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  buildSettingsCookie,
  DEFAULT_SETTINGS,
  initSettingsScript,
  mergeSettings,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
  type CardSize,
  type CardView,
  type ModalSize,
  type PriceSource,
  type SortBy,
  type SortDir,
  type Theme,
  type UserSettings,
} from "@/lib/user-settings";

export type {
  Theme,
  CardView,
  CardSize,
  SortBy,
  SortDir,
  ModalSize,
  PriceSource,
  UserSettings,
};

const SettingsContext = createContext<{
  settings: UserSettings;
  isLoaded: boolean;
  set: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
}>({ settings: DEFAULT_SETTINGS, isLoaded: false, set: () => {} });

export function useSettings() {
  return useContext(SettingsContext);
}

function load(): UserSettings {
  return parseStoredSettings(localStorage.getItem(SETTINGS_STORAGE_KEY)) ?? DEFAULT_SETTINGS;
}

function save(s: UserSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  document.cookie = buildSettingsCookie(s);
}

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && prefersDark)
  );
}

function applyWidescreen(on: boolean) {
  document.documentElement.classList.toggle("widescreen", on);
}

export default function SettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings?: UserSettings | null;
}) {
  const [settings, setSettings] = useState<UserSettings>(initialSettings ?? DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(Boolean(initialSettings));

  useEffect(() => {
    const s = mergeSettings(load());
    const initial = initialSettings ?? DEFAULT_SETTINGS;
    const nextRaw = JSON.stringify(s);
    const initialRaw = JSON.stringify(initial);
    applyTheme(s.theme);
    applyWidescreen(s.widescreen);
    save(s);
    const frame = window.requestAnimationFrame(() => {
      if (nextRaw !== initialRaw) {
        setSettings(s);
      }
      if (!initialSettings) {
        setIsLoaded(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [initialSettings]);

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      if (key === "theme") applyTheme(value as Theme);
      if (key === "widescreen") applyWidescreen(value as boolean);
      return next;
    });
  }

  return (
    <SettingsContext.Provider value={{ settings, isLoaded, set }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const initScript = `
${initSettingsScript}
`;
