import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  parseStoredSettings,
  serializeSettings,
} from "@/lib/user-settings";

describe("user settings", () => {
  it("defaults wiggle stereoscopy to disabled for existing settings", () => {
    expect(DEFAULT_SETTINGS.wiggleStereoscopy).toBe(false);
    expect(mergeSettings({}).wiggleStereoscopy).toBe(false);
    expect(parseStoredSettings(JSON.stringify({ settingsVersion: 3 }))?.wiggleStereoscopy).toBe(
      false
    );
  });

  it("roundtrips an enabled wiggle stereoscopy preference", () => {
    const settings = mergeSettings({ wiggleStereoscopy: true });
    const restored = parseStoredSettings(serializeSettings(settings));

    expect(restored?.wiggleStereoscopy).toBe(true);
  });

  it("falls back safely when the stored wiggle stereoscopy value is invalid", () => {
    const restored = parseStoredSettings(
      JSON.stringify({ settingsVersion: 3, wiggleStereoscopy: "enabled" })
    );

    expect(restored?.wiggleStereoscopy).toBe(false);
  });
});
