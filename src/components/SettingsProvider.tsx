"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  applyAppearanceToElement,
  resolveAppearanceColorScheme,
} from "@/lib/appearance-themes";
import {
  loadBrowserSettings,
  saveBrowserSettings,
} from "@/lib/settings-browser-store";
import {
  buildResolvedThemeCookie,
  DEFAULT_SETTINGS,
  initSettingsScript,
  mergeSettings,
  type Card3dSize,
  type AppearancePalette,
  type AppearanceSettings,
  type AppearanceThemeId,
  type CardSize,
  type CardView,
  type DesktopNavigation,
  type ModalSize,
  type PriceSource,
  type SortBy,
  type SortDir,
  type Theme,
  type UiScale,
  type UserSettings,
} from "@/lib/user-settings";
import { createLatestSettingsSaveQueue } from "@/lib/settings-save-queue";

export type {
  AppearancePalette,
  AppearanceSettings,
  AppearanceThemeId,
  Theme,
  CardView,
  DesktopNavigation,
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
  accountSaveIssue: "error" | "retrying" | null;
  retryAccountSettingsSave: () => void;
  set: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  setDisplay: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
}>({
  settings: DEFAULT_SETTINGS,
  displaySettings: DEFAULT_SETTINGS,
  isLoaded: false,
  isMobileViewport: false,
  currentUserRole: null,
  accountSaveIssue: null,
  retryAccountSettingsSave: () => {},
  set: () => {},
  setDisplay: () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsSaveFeedback({ inline = false }: { inline?: boolean }) {
  const { accountSaveIssue, retryAccountSettingsSave } = useSettings();
  if (!accountSaveIssue) return null;

  return (
    <div
      className={`${inline ? "mx-4 mt-4 shrink-0 sm:mx-6" : "fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[300] md:bottom-6 md:left-auto md:max-w-md [body:has([data-dashboard-customizer])_&]:hidden"} flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-xl`}
      role="status"
      aria-live="polite"
    >
      <p className="min-w-0 flex-1 text-sm leading-5">
        {accountSaveIssue === "retrying" ? "Retrying your account settings…" : "Your latest settings could not be saved to your account. Keep this page open and retry."}
      </p>
      <button
        type="button"
        disabled={accountSaveIssue === "retrying"}
        onClick={retryAccountSettingsSave}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--dc-primary)] px-4 text-sm font-semibold text-[var(--dc-on-primary)] disabled:opacity-60"
      >
        {accountSaveIssue === "retrying" ? "Retrying…" : "Retry saving settings"}
      </button>
    </div>
  );
}

function getInitialSettings(initialSettings?: UserSettings | null): UserSettings {
  return initialSettings ?? DEFAULT_SETTINGS;
}

async function saveToAccount(s: UserSettings) {
  const response = await fetch("/api/account/settings", {
    method: "PUT",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: s }),
  });

  if (!response.ok) {
    throw new Error("Could not save account settings");
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add("dark");
}

function applyAppearance(appearance: AppearanceSettings) {
  const scheme = resolveAppearanceColorScheme(appearance);
  applyAppearanceToElement(document.documentElement, appearance);
  document.documentElement.style.colorScheme = scheme;
  document.documentElement.style.setProperty("--dc-color-scheme", scheme);
  document.cookie = buildResolvedThemeCookie(scheme);
}

function applyWidescreen(on: boolean) {
  document.documentElement.classList.toggle("widescreen", on);
}

function applyDesktopNavigation(navigation: DesktopNavigation) {
  document.documentElement.dataset.desktopNavigation = navigation;
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
  const [settings, setSettings] = useState<UserSettings>(() => getInitialSettings(initialSettings));
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(initialMobileViewport);
  const [accountSaveIssue, setAccountSaveIssue] = useState<"error" | "retrying" | null>(null);
  const didSyncInitialSettingsRef = useRef(false);
  const settingsRef = useRef(settings);
  const settingsSaveQueueRef = useRef<ReturnType<typeof createLatestSettingsSaveQueue> | null>(
    null
  );
  if (settingsSaveQueueRef.current === null) {
    settingsSaveQueueRef.current = createLatestSettingsSaveQueue(saveToAccount, (status) => {
      setAccountSaveIssue((current) => status === "error" ? "error" : status === "saved" ? null : current ? "retrying" : null);
    });
  }
  const displaySettings = getDisplaySettings(settings, isMobileViewport);

  useEffect(() => {
    if (!syncToAccount) return;
    const retry = () => { void settingsSaveQueueRef.current?.retry(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [syncToAccount]);

  useEffect(() => {
    if (!accountSaveIssue) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [accountSaveIssue]);

  useEffect(() => {
    // Signed-in accounts are authoritative. Browser storage is only a fast
    // prepaint/offline mirror, so an old device-specific navigation layout can
    // never overwrite the layout already saved on the account.
    const s = mergeSettings(
      syncToAccount && initialSettings
        ? initialSettings
        : loadBrowserSettings() ?? initialSettings ?? DEFAULT_SETTINGS
    );
    const initial = initialSettings ?? DEFAULT_SETTINGS;
    const nextRaw = JSON.stringify(s);
    const initialRaw = JSON.stringify(initial);
    saveBrowserSettings(s);
    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) return;

      if (nextRaw !== initialRaw) {
        settingsRef.current = s;
        setSettings(s);
      }
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialSettings, syncToAccount]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
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
    applyAppearance(settings.appearance);
    applyDesktopNavigation(settings.desktopNavigation);
    applyWidescreen(displaySettings.widescreen);
    applyUiScale(displaySettings.uiScale);
  }, [
    displaySettings.uiScale,
    displaySettings.widescreen,
    settings.appearance,
    settings.desktopNavigation,
    settings.theme,
  ]);

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
    void settingsSaveQueueRef.current?.enqueue(settings);
  }, [isLoaded, settings, syncToAccount]);

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    saveBrowserSettings(next);
    setSettings(next);
    if (syncToAccount) {
      void settingsSaveQueueRef.current?.enqueue(next);
    }
    if (key === "theme") applyTheme(value as Theme);
    if (key === "appearance") {
      applyAppearance(value as AppearanceSettings);
    }
    if (key === "desktopNavigation") {
      applyDesktopNavigation(value as DesktopNavigation);
    }
    if (key === "widescreen") {
      const effectiveSettings = getDisplaySettings(next, isMobileViewport);
      applyWidescreen(effectiveSettings.widescreen);
    }
    if (key === "uiScale" || key === "mobileUiScale") {
      const effectiveSettings = getDisplaySettings(next, isMobileViewport);
      applyUiScale(effectiveSettings.uiScale);
    }
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
        accountSaveIssue,
        retryAccountSettingsSave: () => { void settingsSaveQueueRef.current?.retry(); },
        set,
        setDisplay,
      }}
    >
      {children}
      <SettingsSaveFeedback />
    </SettingsContext.Provider>
  );
}

export const initScript = `
${initSettingsScript}
`;
