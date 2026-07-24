import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  serializeSettings,
  type UserSettings,
} from "@/lib/user-settings";

const mocks = vi.hoisted(() => ({
  cookieValue: null as string | null,
  settingsJson: null as string | null,
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => (
      mocks.cookieValue == null ? undefined : { value: mocks.cookieValue }
    )),
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { getServerUserSettings } from "@/lib/user-settings-server";

function withAppearance(preset: UserSettings["appearance"]["preset"]): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      preset,
    },
  };
}

describe("server user settings", () => {
  beforeEach(() => {
    mocks.cookieValue = null;
    mocks.settingsJson = null;
    mocks.findUnique.mockImplementation(async () => ({
      settings_json: mocks.settingsJson,
    }));
  });

  it("prefers the synchronously saved browser cookie while the account copy lags", async () => {
    mocks.cookieValue = encodeURIComponent(serializeSettings(withAppearance("custom")));
    mocks.settingsJson = serializeSettings(withAppearance("rose-quartz"));

    const settings = await getServerUserSettings("cookie-newer-user");

    expect(settings.appearance.preset).toBe("custom");
  });

  it("falls back to account settings when the browser has no saved settings", async () => {
    mocks.settingsJson = serializeSettings(withAppearance("ocean-sapphire"));

    const settings = await getServerUserSettings("account-only-user");

    expect(settings.appearance.preset).toBe("ocean-sapphire");
  });
});
