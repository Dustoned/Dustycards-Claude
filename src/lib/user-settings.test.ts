import { describe, expect, it, vi } from "vitest";
import { appearancePaletteToCssVariables } from "@/lib/appearance-themes";
import {
  DEFAULT_SETTINGS,
  initSettingsScript,
  mergeSettings,
  parseStoredSettings,
  serializeSettings,
} from "@/lib/user-settings";

describe("user settings", () => {
  it("defaults desktop navigation to the top header", () => {
    expect(DEFAULT_SETTINGS.desktopNavigation).toBe("top");
    expect(mergeSettings({}).desktopNavigation).toBe("top");
  });

  it("roundtrips the classic desktop sidebar preference", () => {
    const settings = mergeSettings({ desktopNavigation: "sidebar" });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored?.desktopNavigation).toBe("sidebar");
  });

  it("repairs an invalid desktop navigation preference", () => {
    const settings = mergeSettings({ desktopNavigation: "rail" as never });

    expect(settings.desktopNavigation).toBe("top");
  });

  it("roundtrips ordered navigation shortcuts", () => {
    const settings = mergeSettings({
      mobileBottomNavKeys: ["market-sealed", "home", "openings", "wants"],
      mobileMorePinnedKeys: ["selling", "market-radar"],
      desktopPinnedNavKeys: ["market-sealed", "market-radar"],
    });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored).toMatchObject({
      mobileBottomNavKeys: ["market-sealed", "home", "openings", "wants"],
      mobileMorePinnedKeys: ["selling", "market-radar"],
      desktopPinnedNavKeys: ["market-sealed", "market-radar"],
    });
  });

  it("repairs duplicate and invalid navigation shortcuts without shortening the phone bar", () => {
    const settings = mergeSettings({
      mobileBottomNavKeys: ["home", "home", "unknown", "market-sealed"] as never,
      mobileMorePinnedKeys: ["selling", "selling", "invalid"] as never,
      desktopPinnedNavKeys: [] as never,
    });

    expect(settings.mobileBottomNavKeys).toEqual([
      "home",
      "market-sealed",
      "complete",
      "wants",
    ]);
    expect(settings.mobileMorePinnedKeys).toEqual(["selling"]);
    expect(settings.desktopPinnedNavKeys).toEqual([]);
  });

  it("roundtrips known display preferences", () => {
    const settings = mergeSettings({ card3dSize: "large", mobileCard3dSize: "medium" });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored).toMatchObject({
      card3dSize: "large",
      mobileCard3dSize: "medium",
    });
  });

  it("roundtrips and repairs collapsed Home modules", () => {
    const settings = mergeSettings({
      homeDashboardCollapsedModules: ["overview", "market", "unknown", "overview"] as never,
    });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored?.homeDashboardCollapsedModules).toEqual(["overview", "market"]);
  });

  it("drops retired preferences while preserving current settings", () => {
    const restored = parseStoredSettings(
      JSON.stringify({ settingsVersion: 3, card3dSize: "large", retiredPreference: true })
    );

    expect(restored?.card3dSize).toBe("large");
    expect(serializeSettings(restored!)).not.toContain("retiredPreference");
  });

  it("adds the collector palette to settings saved before appearance existed", () => {
    const restored = parseStoredSettings(
      JSON.stringify({ settingsVersion: 3, theme: "dark", widescreen: true })
    );

    expect(restored?.appearance).toEqual(DEFAULT_SETTINGS.appearance);
    expect(restored?.widescreen).toBe(true);
  });

  it("roundtrips a complete custom appearance atomically", () => {
    const settings = mergeSettings({
      appearance: {
        preset: "custom",
        custom: {
          ...DEFAULT_SETTINGS.appearance.custom,
          primary: "#D94F93",
          background: "#0D080D",
        },
      },
    });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored?.appearance.preset).toBe("custom");
    expect(restored?.appearance.custom.primary).toBe("#D94F93");
    expect(restored?.appearance.custom.background).toBe("#0D080D");
  });

  it("repairs invalid custom colors without rejecting the other settings", () => {
    const restored = mergeSettings({
      widescreen: true,
      appearance: {
        preset: "custom",
        custom: {
          ...DEFAULT_SETTINGS.appearance.custom,
          primary: "hotpink",
        },
      },
    });

    expect(restored.widescreen).toBe(true);
    expect(restored.appearance.custom.primary).toBe(
      DEFAULT_SETTINGS.appearance.custom.primary
    );
  });

  it("prepaints a cookie-backed custom appearance before hydration", () => {
    const setProperty = vi.fn();
    const settings = mergeSettings({
      appearance: {
        preset: "custom",
        custom: {
          ...DEFAULT_SETTINGS.appearance.custom,
          primary: "#D94F93",
          background: "#0D080D",
          surface: "#171018",
        },
      },
      mobileUiScale: "large",
    });
    let cookie = `dustycards-settings=${encodeURIComponent(serializeSettings(settings))}`;
    const classList = {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    };
    const documentMock = {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      },
      documentElement: {
        dataset: {} as Record<string, string>,
        classList,
        style: { setProperty },
      },
    };
    const windowMock = {
      matchMedia: (query: string) => ({ matches: query.includes("max-width") }),
      __dustycardsSettings: undefined,
    };

    Function("localStorage", "document", "window", initSettingsScript)(
      { getItem: () => null },
      documentMock,
      windowMock
    );

    expect(windowMock.__dustycardsSettings).toMatchObject({
      appearance: { preset: "custom" },
      mobileUiScale: "large",
    });
    expect(documentMock.documentElement.dataset.appearance).toBe("custom");
    expect(documentMock.documentElement.dataset.uiScale).toBe("large");
    expect(setProperty).toHaveBeenCalledWith("--dc-bg-main", "#0D080D");
    expect(setProperty).toHaveBeenCalledWith("--app-bg", "#0D080D");
    expect(setProperty).toHaveBeenCalledWith("--dc-primary", "#D94F93");
    const prepainted = Object.fromEntries(setProperty.mock.calls);
    expect(prepainted).toMatchObject(
      appearancePaletteToCssVariables(settings.appearance.custom)
    );
  });

  it("prepaints the stored desktop navigation before hydration", () => {
    const raw = serializeSettings(mergeSettings({ desktopNavigation: "sidebar" }));
    const documentMock = {
      cookie: "",
      documentElement: {
        dataset: {} as Record<string, string>,
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        style: { setProperty: vi.fn() },
      },
    };
    const windowMock = {
      matchMedia: () => ({ matches: false }),
      __dustycardsSettings: undefined,
    };

    Function("localStorage", "document", "window", initSettingsScript)(
      { getItem: () => raw, setItem: vi.fn() },
      documentMock,
      windowMock
    );

    expect(documentMock.documentElement.dataset.desktopNavigation).toBe("sidebar");
  });

  it("does not let an empty browser store replace account settings", () => {
    let cookie = "";
    const documentMock = {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      },
      documentElement: {
        dataset: {} as Record<string, string>,
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        style: { setProperty: vi.fn() },
      },
    };
    const windowMock = {
      matchMedia: () => ({ matches: false }),
      __dustycardsSettings: { stale: true } as unknown,
    };

    Function("localStorage", "document", "window", initSettingsScript)(
      { getItem: () => null },
      documentMock,
      windowMock
    );

    expect(windowMock.__dustycardsSettings).toBeUndefined();
    expect(cookie).not.toContain("dustycards-settings=");
  });

  it.each([
    ["porcelain-studio", "#F3F5F8", "#171B26"],
    ["blush-petal", "#FFF6FA", "#2B1724"],
  ])("prepaints the %s light appearance before hydration", (preset, background, text) => {
    const setProperty = vi.fn();
    const classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
    const settings = mergeSettings({
      theme: "light",
      appearance: { ...DEFAULT_SETTINGS.appearance, preset: preset as never },
    });
    const raw = serializeSettings(settings);
    const localStorageMock = { getItem: () => raw, setItem: vi.fn() };
    const documentMock = {
      cookie: "",
      documentElement: {
        dataset: {} as Record<string, string>,
        classList,
        style: { setProperty },
      },
    };

    Function("localStorage", "document", "window", initSettingsScript)(
      localStorageMock,
      documentMock,
      { matchMedia: () => ({ matches: false }), __dustycardsSettings: undefined }
    );

    expect(documentMock.documentElement.dataset).toMatchObject({
      appearance: preset,
      appearanceScheme: "light",
    });
    expect(classList.add).toHaveBeenCalledWith("dark");
    expect(setProperty).toHaveBeenCalledWith("--dc-bg-main", background);
    expect(setProperty).toHaveBeenCalledWith("--color-white", text);
    expect(setProperty).toHaveBeenCalledWith("--color-black", text);
    expect(setProperty).toHaveBeenCalledWith("--dc-on-primary", "#FFFFFF");
    expect(setProperty).toHaveBeenCalledWith("--dc-bg-main-rgb", expect.any(String));
    expect(setProperty).toHaveBeenCalledWith("color-scheme", "light");
  });

  it("migrates amber archive during prepaint without showing the retired theme", () => {
    const raw = JSON.stringify({
      settingsVersion: 3,
      appearance: { ...DEFAULT_SETTINGS.appearance, preset: "amber-archive" },
    });
    const setItem = vi.fn();
    const documentMock = {
      cookie: "",
      documentElement: {
        dataset: {} as Record<string, string>,
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        style: { setProperty: vi.fn() },
      },
    };
    const windowMock = {
      matchMedia: () => ({ matches: false }),
      __dustycardsSettings: undefined as unknown,
    };

    Function("localStorage", "document", "window", initSettingsScript)(
      { getItem: () => raw, setItem },
      documentMock,
      windowMock
    );

    expect(documentMock.documentElement.dataset.appearance).toBe("porcelain-studio");
    expect(documentMock.documentElement.dataset.appearanceScheme).toBe("light");
    expect(windowMock.__dustycardsSettings).toMatchObject({
      appearance: { preset: "porcelain-studio" },
    });
    expect(setItem).toHaveBeenCalledWith(
      "dustycards-settings",
      expect.stringContaining('"preset":"porcelain-studio"')
    );
  });
});
