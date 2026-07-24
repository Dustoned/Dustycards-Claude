import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBrowserSettings, saveBrowserSettings } from "@/lib/settings-browser-store";
import { DEFAULT_SETTINGS, serializeSettings, type UserSettings } from "@/lib/user-settings";

function withAppearance(preset: UserSettings["appearance"]["preset"]): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      preset,
    },
  };
}

function installBrowser(options: {
  stored?: UserSettings | null;
  preloaded?: UserSettings;
  storageError?: boolean;
}) {
  const writes: string[] = [];
  const cookies: string[] = [];
  const windowMock = {
    __dustycardsSettings: options.preloaded,
    localStorage: {
      getItem: vi.fn(() => {
        if (options.storageError) throw new Error("storage unavailable");
        return options.stored ? serializeSettings(options.stored) : null;
      }),
      setItem: vi.fn((_key: string, value: string) => {
        if (options.storageError) throw new Error("storage unavailable");
        writes.push(value);
      }),
    },
  };
  const documentMock = {};
  Object.defineProperty(documentMock, "cookie", {
    configurable: true,
    get: () => cookies.join("; "),
    set: (value: string) => {
      cookies.push(value);
    },
  });

  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("document", documentMock);
  return { cookies, windowMock, writes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser settings store", () => {
  it("prefers current local storage over a stale prepaint custom theme", () => {
    installBrowser({
      stored: withAppearance("ocean-sapphire"),
      preloaded: withAppearance("custom"),
    });

    expect(loadBrowserSettings()?.appearance.preset).toBe("ocean-sapphire");
  });

  it("updates storage, cookies, and the refresh bootstrap atomically", () => {
    const browser = installBrowser({
      stored: withAppearance("custom"),
      preloaded: withAppearance("custom"),
    });

    saveBrowserSettings(withAppearance("ocean-sapphire"));

    expect(browser.windowMock.__dustycardsSettings?.appearance.preset).toBe(
      "ocean-sapphire"
    );
    expect(browser.writes.at(-1)).toContain('"preset":"ocean-sapphire"');
    expect(browser.cookies.some((cookie) => cookie.startsWith("dustycards-settings="))).toBe(true);
  });

  it("still updates the refresh bootstrap when local storage is unavailable", () => {
    const browser = installBrowser({
      preloaded: withAppearance("custom"),
      storageError: true,
    });

    saveBrowserSettings(withAppearance("rose-quartz"));

    expect(browser.windowMock.__dustycardsSettings?.appearance.preset).toBe("rose-quartz");
    expect(loadBrowserSettings()?.appearance.preset).toBe("rose-quartz");
  });
});
