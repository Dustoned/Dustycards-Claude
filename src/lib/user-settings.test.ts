import { describe, expect, it } from "vitest";
import {
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
});
