"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  buildResolvedThemeCookie,
  buildSettingsCookie,
  DEFAULT_SETTINGS,
  initSettingsScript,
  mergeSettings,
  parseStoredSettings,
  resolveTheme,
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
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  document.cookie = buildSettingsCookie(s);
  document.cookie = buildResolvedThemeCookie(resolveTheme(s.theme, prefersDark));
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
    applyUiScale(s.uiScale);
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

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      if (key === "theme") applyTheme(value as Theme);
      if (key === "widescreen") applyWidescreen(value as boolean);
      if (key === "uiScale") applyUiScale(value as UiScale);
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
