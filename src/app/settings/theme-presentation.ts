import type { AppearanceThemePreset } from "@/lib/appearance-themes";

const HIDDEN_PRESET_IDS = new Set<string>(["amber-archive"]);

export type AppearancePresetTone = "light" | "dark";

export function getVisibleAppearancePresets(
  presets: readonly AppearanceThemePreset[]
): AppearanceThemePreset[] {
  return presets.filter((preset) => !HIDDEN_PRESET_IDS.has(preset.id));
}

export function getAppearancePresetTone(
  preset: AppearanceThemePreset
): AppearancePresetTone {
  return preset.scheme;
}
