import { describe, expect, it } from "vitest";
import { APPEARANCE_THEME_PRESETS } from "@/lib/appearance-themes";
import {
  getAppearancePresetTone,
  getVisibleAppearancePresets,
} from "./theme-presentation";

describe("appearance preset presentation", () => {
  it("does not expose the retired Amber Archive preset", () => {
    const visible = getVisibleAppearancePresets(APPEARANCE_THEME_PRESETS);

    expect(visible.some((preset) => String(preset.id) === "amber-archive")).toBe(false);
    expect(visible.some((preset) => preset.name === "Amber Archive")).toBe(false);
  });

  it("marks every bright preset as a light appearance", () => {
    const visible = getVisibleAppearancePresets(APPEARANCE_THEME_PRESETS);
    const lightPresets = visible
      .filter((preset) => getAppearancePresetTone(preset) === "light")
      .map((preset) => [preset.id, preset.name]);

    expect(lightPresets).toEqual([
      ["emerald-vault", "Pink Couture"],
      ["porcelain-studio", "Porcelain Studio"],
      ["blush-petal", "Blush Petal"],
    ]);
  });
});
