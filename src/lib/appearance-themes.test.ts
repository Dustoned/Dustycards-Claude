import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_PALETTE_KEYS,
  APPEARANCE_THEME_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
  appearancePaletteToCssVariables,
  applyAppearanceToElement,
  getAppearanceContrastChecks,
  getAppearancePreset,
  getContrastRatio,
  isHexColor,
  mixHex,
  normalizeAppearancePalette,
  normalizeAppearanceSettings,
  normalizeHexColor,
  resolveAppearancePalette,
  type AppearancePalette,
  type AppearanceSettings,
} from "@/lib/appearance-themes";

const COMPLETE_CUSTOM_PALETTE: AppearancePalette = {
  primary: "#010203",
  primaryHover: "#111213",
  primarySoft: "#212223",
  secondary: "#313233",
  background: "#040506",
  surface: "#141516",
  surfaceElevated: "#242526",
  surfaceHover: "#343536",
  border: "#444546",
  borderHover: "#545556",
  textPrimary: "#F1F2F3",
  textSecondary: "#D1D2D3",
  textMuted: "#A1A2A3",
  data: "#616263",
  success: "#717273",
  negative: "#818283",
  warning: "#919293",
};

describe("appearance theme presets", () => {
  it("publishes the expected named presets with unique stable ids", () => {
    const ids = APPEARANCE_THEME_PRESETS.map((preset) => preset.id);

    expect(ids).toEqual([
      "collector-violet",
      "rose-quartz",
      "lavender-bloom",
      "ocean-sapphire",
      "emerald-vault",
      "amber-archive",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("custom");
  });

  it("has complete, valid palettes and meaningful metadata for every preset", () => {
    for (const preset of APPEARANCE_THEME_PRESETS) {
      expect(preset.name.trim()).not.toBe("");
      expect(preset.description.trim()).not.toBe("");
      expect(Object.keys(preset.palette).sort()).toEqual([...APPEARANCE_PALETTE_KEYS].sort());

      for (const key of APPEARANCE_PALETTE_KEYS) {
        expect(isHexColor(preset.palette[key]), `${preset.id}.${key}`).toBe(true);
        expect(preset.palette[key], `${preset.id}.${key}`).toBe(
          preset.palette[key].toUpperCase()
        );
      }
    }
  });

  it("resolves every named preset and deliberately has no preset record for custom", () => {
    for (const preset of APPEARANCE_THEME_PRESETS) {
      expect(getAppearancePreset(preset.id)).toBe(preset);
    }

    expect(getAppearancePreset("custom")).toBeNull();
  });
});

describe("appearance color normalization", () => {
  it.each([
    ["#abcdef", true],
    ["#ABCDEF", true],
    ["#012345", true],
    ["abcdef", false],
    ["#abc", false],
    ["#abcdef00", false],
    ["#gggggg", false],
    [" #abcdef", false],
    ["#abcdef ", false],
    [null, false],
    [42, false],
  ])("recognizes strict six-digit hex color %j", (value, expected) => {
    expect(isHexColor(value)).toBe(expected);
  });

  it("uppercases valid colors and falls back for invalid input", () => {
    expect(normalizeHexColor("#a1b2c3", "#010203")).toBe("#A1B2C3");
    expect(normalizeHexColor("transparent", "#aabbcc")).toBe("#AABBCC");
    expect(normalizeHexColor(undefined, "#dDeEfF")).toBe("#DDEEFF");
  });

  it("normalizes a partial custom palette one key at a time without retaining extras", () => {
    const normalized = normalizeAppearancePalette({
      primary: "#abcdef",
      surface: "not-a-color",
      data: "#123456",
      injected: "#FFFFFF",
    });

    expect(normalized.primary).toBe("#ABCDEF");
    expect(normalized.data).toBe("#123456");
    expect(normalized.surface).toBe(DEFAULT_APPEARANCE_SETTINGS.custom.surface);
    expect(normalized.secondary).toBe(DEFAULT_APPEARANCE_SETTINGS.custom.secondary);
    expect(Object.keys(normalized).sort()).toEqual([...APPEARANCE_PALETTE_KEYS].sort());
    expect(normalized).not.toHaveProperty("injected");
  });

  it("uses the supplied fallback palette for null, missing and malformed values", () => {
    const fallback = { ...COMPLETE_CUSTOM_PALETTE };

    expect(normalizeAppearancePalette(null, fallback)).toEqual(fallback);
    expect(
      normalizeAppearancePalette(
        { primary: "bad", primaryHover: "#abcdef", warning: 123 },
        fallback
      )
    ).toMatchObject({
      primary: fallback.primary,
      primaryHover: "#ABCDEF",
      warning: fallback.warning,
    });
  });

  it("normalizes preset selection while preserving a safe complete custom palette", () => {
    expect(normalizeAppearanceSettings(null)).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    expect(normalizeAppearanceSettings({ preset: "unknown", custom: null })).toEqual(
      DEFAULT_APPEARANCE_SETTINGS
    );

    const normalized = normalizeAppearanceSettings({
      preset: "custom",
      custom: { primary: "#abcdef", background: "javascript:alert(1)" },
    });

    expect(normalized.preset).toBe("custom");
    expect(normalized.custom.primary).toBe("#ABCDEF");
    expect(normalized.custom.background).toBe(
      DEFAULT_APPEARANCE_SETTINGS.custom.background
    );
    expect(Object.keys(normalized.custom).sort()).toEqual(
      [...APPEARANCE_PALETTE_KEYS].sort()
    );
  });

  it("accepts every supported preset id and rejects custom-looking variants", () => {
    for (const preset of APPEARANCE_THEME_PRESETS) {
      expect(normalizeAppearanceSettings({ preset: preset.id }).preset).toBe(preset.id);
    }

    expect(normalizeAppearanceSettings({ preset: "Custom" }).preset).toBe(
      DEFAULT_APPEARANCE_SETTINGS.preset
    );
    expect(normalizeAppearanceSettings({ preset: "rose-quartz " }).preset).toBe(
      DEFAULT_APPEARANCE_SETTINGS.preset
    );
  });
});

describe("appearance palette resolution", () => {
  it("returns the selected preset palette", () => {
    for (const preset of APPEARANCE_THEME_PRESETS) {
      expect(
        resolveAppearancePalette({
          preset: preset.id,
          custom: COMPLETE_CUSTOM_PALETTE,
        })
      ).toBe(preset.palette);
    }
  });

  it("returns a normalized custom palette without mutating the saved draft", () => {
    const custom = {
      ...COMPLETE_CUSTOM_PALETTE,
      primary: "#abcdef",
      surface: "invalid",
    } as AppearancePalette;
    const before = { ...custom };

    const resolved = resolveAppearancePalette({ preset: "custom", custom });

    expect(resolved.primary).toBe("#ABCDEF");
    expect(resolved.surface).toBe(DEFAULT_APPEARANCE_SETTINGS.custom.surface);
    expect(custom).toEqual(before);
    expect(resolved).not.toBe(custom);
  });

  it("falls back to Collector Violet for an unknown preset at a runtime boundary", () => {
    const malformed = {
      preset: "missing-preset",
      custom: COMPLETE_CUSTOM_PALETTE,
    } as unknown as AppearanceSettings;

    expect(resolveAppearancePalette(malformed)).toBe(
      getAppearancePreset("collector-violet")?.palette
    );
  });
});

describe("appearance CSS variables", () => {
  it("mixes colors predictably, including rounding and clamped weights", () => {
    expect(mixHex("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixHex("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#A0B0C0", 0.25)).toBe("#344454");
    expect(mixHex("#123456", "#ABCDEF", -10)).toBe("#123456");
    expect(mixHex("#123456", "#ABCDEF", 10)).toBe("#ABCDEF");
  });

  it("emits semantic values, RGB companions, fills and gradients", () => {
    const variables = appearancePaletteToCssVariables(COMPLETE_CUSTOM_PALETTE);

    expect(variables).toMatchObject({
      "--dc-primary": "#010203",
      "--dc-primary-hover": "#111213",
      "--dc-primary-soft": "#212223",
      "--dc-secondary": "#313233",
      "--dc-bg-main": "#040506",
      "--dc-surface-primary": "#141516",
      "--dc-surface-elevated": "#242526",
      "--dc-surface-hover": "#343536",
      "--dc-border": "#444546",
      "--dc-border-hover": "#545556",
      "--dc-border-active": "#010203",
      "--dc-text-primary": "#F1F2F3",
      "--dc-text-secondary": "#D1D2D3",
      "--dc-text-muted": "#A1A2A3",
      "--dc-success": "#717273",
      "--dc-negative": "#818283",
      "--dc-cyan": "#616263",
      "--dc-gold": "#919293",
      "--dc-pink": "#313233",
      "--dc-primary-rgb": "1 2 3",
      "--dc-primary-hover-rgb": "17 18 19",
      "--dc-primary-soft-rgb": "33 34 35",
      "--dc-secondary-rgb": "49 50 51",
      "--dc-bg-main-rgb": "4 5 6",
      "--dc-surface-primary-rgb": "20 21 22",
      "--dc-border-rgb": "68 69 70",
      "--dc-success-rgb": "113 114 115",
      "--dc-negative-rgb": "129 130 131",
      "--dc-cyan-rgb": "97 98 99",
      "--app-bg": "#040506",
      "--color-white": "#F1F2F3",
      "--color-black": "#040506",
    });
    expect(variables["--dc-success-bg"]).toBe("rgba(113, 114, 115, 0.12)");
    expect(variables["--dc-negative-bg"]).toBe("rgba(129, 130, 131, 0.12)");
    expect(variables["--dc-chart-primary-fill"]).toBe("rgba(1, 2, 3, 0.15)");
    expect(variables["--dc-chart-secondary-fill"]).toBe("rgba(97, 98, 99, 0.15)");
    expect(variables["--dc-primary-gradient"]).toBe(
      "linear-gradient(135deg, #010203 0%, #111213 100%)"
    );
    expect(variables["--dc-ambient-glow"]).toBe(
      "radial-gradient(circle, rgba(1, 2, 3, 0.18), transparent 70%)"
    );
  });

  it("builds complete aliased ramps for brand, data, status, warning and neutral colors", () => {
    const palette: AppearancePalette = {
      ...COMPLETE_CUSTOM_PALETTE,
      primary: "#804020",
      primarySoft: "#C08040",
      background: "#000000",
      data: "#206080",
      success: "#208040",
      negative: "#802040",
      warning: "#806020",
    };
    const variables = appearancePaletteToCssVariables(palette);

    for (const alias of ["violet", "purple"]) {
      expect(variables[`--color-${alias}-50`]).toBe(mixHex("#C08040", "#FFFFFF", 0.72));
      expect(variables[`--color-${alias}-300`]).toBe("#C08040");
      expect(variables[`--color-${alias}-500`]).toBe("#804020");
      expect(variables[`--color-${alias}-600`]).toBe(mixHex("#804020", "#000000", 0.08));
      expect(variables[`--color-${alias}-950`]).toBe(mixHex("#804020", "#000000", 0.72));
    }

    for (const alias of ["fuchsia", "pink"]) {
      expect(variables[`--color-${alias}-500`]).toBe(palette.secondary);
    }

    for (const alias of ["blue", "sky", "cyan"]) {
      expect(variables[`--color-${alias}-500`]).toBe("#206080");
    }
    for (const alias of ["emerald", "green", "lime"]) {
      expect(variables[`--color-${alias}-500`]).toBe("#208040");
    }
    for (const alias of ["red", "rose"]) {
      expect(variables[`--color-${alias}-500`]).toBe("#802040");
    }
    for (const alias of ["amber", "yellow", "orange"]) {
      expect(variables[`--color-${alias}-500`]).toBe("#806020");
    }
    for (const alias of ["gray", "slate", "zinc", "neutral"]) {
      expect(variables[`--color-${alias}-50`]).toBe(palette.textPrimary);
      expect(variables[`--color-${alias}-400`]).toBe(palette.textMuted);
      expect(variables[`--color-${alias}-700`]).toBe(palette.border);
      expect(variables[`--color-${alias}-900`]).toBe(palette.surface);
      expect(variables[`--color-${alias}-950`]).toBe(palette.background);
    }
  });

  it("normalizes lower-case palette values before emitting variables", () => {
    const variables = appearancePaletteToCssVariables({
      ...COMPLETE_CUSTOM_PALETTE,
      primary: "#abcdef",
      background: "#0a0b0c",
    });

    expect(variables["--dc-primary"]).toBe("#ABCDEF");
    expect(variables["--dc-primary-rgb"]).toBe("171 205 239");
    expect(variables["--dc-bg-main"]).toBe("#0A0B0C");
    expect(variables["--dc-bg-main-rgb"]).toBe("10 11 12");
  });

  it("applies the resolved preset id and every generated variable to an element", () => {
    const setProperty = vi.fn();
    const element = {
      dataset: {} as DOMStringMap,
      style: { setProperty },
    } as unknown as HTMLElement;
    const appearance: AppearanceSettings = {
      preset: "custom",
      custom: COMPLETE_CUSTOM_PALETTE,
    };
    const expected = appearancePaletteToCssVariables(COMPLETE_CUSTOM_PALETTE);

    applyAppearanceToElement(element, appearance);

    expect(element.dataset.appearance).toBe("custom");
    expect(setProperty).toHaveBeenCalledTimes(Object.keys(expected).length);
    expect(setProperty).toHaveBeenCalledWith("--dc-primary", "#010203");
    expect(setProperty).toHaveBeenCalledWith("--dc-primary-rgb", "1 2 3");
    expect(setProperty).toHaveBeenCalledWith("--color-violet-500", "#010203");
    expect(setProperty).toHaveBeenCalledWith("--color-gray-950", "#040506");
  });
});

describe("appearance contrast", () => {
  it("matches WCAG contrast reference values and is symmetric", () => {
    expect(getContrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(getContrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(getContrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.478, 3);
    expect(getContrastRatio("#123456", "#ABCDEF")).toBeCloseTo(
      getContrastRatio("#ABCDEF", "#123456"),
      12
    );
  });

  it("calculates each semantic preview contrast against the intended background", () => {
    const palette: AppearancePalette = {
      ...COMPLETE_CUSTOM_PALETTE,
      primary: "#336699",
      background: "#000000",
      surface: "#101010",
      textPrimary: "#FFFFFF",
      textMuted: "#888888",
    };

    expect(getAppearanceContrastChecks(palette)).toEqual({
      page: getContrastRatio("#FFFFFF", "#000000"),
      surface: getContrastRatio("#FFFFFF", "#101010"),
      muted: getContrastRatio("#888888", "#101010"),
      button: getContrastRatio("#FFFFFF", "#336699"),
    });
  });

  it("produces finite positive contrast checks for every bundled preset", () => {
    for (const preset of APPEARANCE_THEME_PRESETS) {
      const checks = getAppearanceContrastChecks(preset.palette);
      for (const [name, ratio] of Object.entries(checks)) {
        expect(Number.isFinite(ratio), `${preset.id}.${name}`).toBe(true);
        expect(ratio, `${preset.id}.${name}`).toBeGreaterThanOrEqual(1);
        expect(ratio, `${preset.id}.${name}`).toBeLessThanOrEqual(21);
      }
      expect(checks.page, `${preset.id}.page`).toBeGreaterThanOrEqual(7);
      expect(checks.surface, `${preset.id}.surface`).toBeGreaterThanOrEqual(7);
      expect(checks.button, `${preset.id}.button`).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(preset.palette.textPrimary, preset.palette.primaryHover),
        `${preset.id}.button-hover`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
