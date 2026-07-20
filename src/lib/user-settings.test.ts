import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  parseStoredSettings,
  serializeSettings,
} from "@/lib/user-settings";

describe("user settings", () => {
  it("roundtrips known display preferences", () => {
    const settings = mergeSettings({ card3dSize: "large", mobileCard3dSize: "medium" });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored).toMatchObject({
      card3dSize: "large",
      mobileCard3dSize: "medium",
    });
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
});
