export type AppearanceThemeId =
  | "collector-violet"
  | "rose-quartz"
  | "lavender-bloom"
  | "ocean-sapphire"
  | "emerald-vault"
  | "amber-archive"
  | "custom";

export interface AppearancePalette {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  border: string;
  borderHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  data: string;
  success: string;
  negative: string;
  warning: string;
}

export interface AppearanceSettings {
  preset: AppearanceThemeId;
  custom: AppearancePalette;
}

export interface AppearanceThemePreset {
  id: Exclude<AppearanceThemeId, "custom">;
  name: string;
  description: string;
  palette: AppearancePalette;
}

const COLLECTOR_VIOLET: AppearancePalette = {
  primary: "#6E4DFF",
  primaryHover: "#7658F4",
  primarySoft: "#B39BFF",
  secondary: "#5D8BFF",
  background: "#07080B",
  surface: "#101218",
  surfaceElevated: "#171A22",
  surfaceHover: "#1D2130",
  border: "#252A38",
  borderHover: "#353C50",
  textPrimary: "#FFFFFF",
  textSecondary: "#C8CEDB",
  textMuted: "#8A91A3",
  data: "#38BDF8",
  success: "#22C55E",
  negative: "#EF4444",
  warning: "#FBBF24",
};

export const APPEARANCE_THEME_PRESETS: readonly AppearanceThemePreset[] = [
  {
    id: "collector-violet",
    name: "Collector Violet",
    description: "The refined DustyCards original.",
    palette: COLLECTOR_VIOLET,
  },
  {
    id: "rose-quartz",
    name: "Rose Quartz",
    description: "Soft rose, plum and polished glass.",
    palette: {
      primary: "#B83E7A",
      primaryHover: "#BF417F",
      primarySoft: "#F3A5CB",
      secondary: "#B978FF",
      background: "#0D080D",
      surface: "#171018",
      surfaceElevated: "#211521",
      surfaceHover: "#2A1B29",
      border: "#3A2737",
      borderHover: "#55354B",
      textPrimary: "#FFF7FB",
      textSecondary: "#E8C7D8",
      textMuted: "#B887A0",
      data: "#65C9F3",
      success: "#40CA82",
      negative: "#F06A75",
      warning: "#F3BA62",
    },
  },
  {
    id: "lavender-bloom",
    name: "Lavender Bloom",
    description: "Dreamy lilac with a subtle orchid glow.",
    palette: {
      primary: "#7653D1",
      primaryHover: "#7D58D2",
      primarySoft: "#D9D0FE",
      secondary: "#E879F9",
      background: "#0B0912",
      surface: "#151120",
      surfaceElevated: "#1E1830",
      surfaceHover: "#28203D",
      border: "#33284A",
      borderHover: "#4A3967",
      textPrimary: "#FBF9FF",
      textSecondary: "#DAD2EB",
      textMuted: "#9D91B5",
      data: "#67C7F4",
      success: "#39C984",
      negative: "#F06B82",
      warning: "#F0B85B",
    },
  },
  {
    id: "ocean-sapphire",
    name: "Ocean Sapphire",
    description: "Deep navy with crisp cyan data accents.",
    palette: {
      primary: "#2A66C7",
      primaryHover: "#3570CE",
      primarySoft: "#91B9F5",
      secondary: "#25C4D9",
      background: "#050A11",
      surface: "#0C141F",
      surfaceElevated: "#122031",
      surfaceHover: "#192B40",
      border: "#21364C",
      borderHover: "#31506E",
      textPrimary: "#F6FAFF",
      textSecondary: "#C6D7EA",
      textMuted: "#8199B2",
      data: "#22D3EE",
      success: "#2CCB86",
      negative: "#F05E6D",
      warning: "#F2B84B",
    },
  },
  {
    id: "emerald-vault",
    name: "Emerald Vault",
    description: "Museum green with modern aqua detail.",
    palette: {
      primary: "#147A57",
      primaryHover: "#1E805C",
      primarySoft: "#8BE0BA",
      secondary: "#2AB9C9",
      background: "#050A08",
      surface: "#0C1511",
      surfaceElevated: "#13221B",
      surfaceHover: "#1A2E25",
      border: "#223B30",
      borderHover: "#345746",
      textPrimary: "#F5FFF9",
      textSecondary: "#C7DED2",
      textMuted: "#82A595",
      data: "#40C9E8",
      success: "#22C55E",
      negative: "#EE5D68",
      warning: "#EFB84F",
    },
  },
  {
    id: "amber-archive",
    name: "Amber Archive",
    description: "Warm amber, leather and evening graphite.",
    palette: {
      primary: "#8A5A0A",
      primaryHover: "#9A6816",
      primarySoft: "#F0CD89",
      secondary: "#E66E78",
      background: "#0B0905",
      surface: "#16120B",
      surfaceElevated: "#211A0F",
      surfaceHover: "#2C2215",
      border: "#3D311D",
      borderHover: "#5C4728",
      textPrimary: "#FFF9EF",
      textSecondary: "#E8D4B5",
      textMuted: "#AE9270",
      data: "#4DCFEA",
      success: "#31C77D",
      negative: "#EB6268",
      warning: "#F2B84B",
    },
  },
] as const;

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  preset: "collector-violet",
  custom: { ...COLLECTOR_VIOLET },
};

const PRESET_BY_ID = new Map(
  APPEARANCE_THEME_PRESETS.map((preset) => [preset.id, preset] as const)
);

export const APPEARANCE_PALETTE_KEYS = [
  "primary",
  "primaryHover",
  "primarySoft",
  "secondary",
  "background",
  "surface",
  "surfaceElevated",
  "surfaceHover",
  "border",
  "borderHover",
  "textPrimary",
  "textSecondary",
  "textMuted",
  "data",
  "success",
  "negative",
  "warning",
] as const satisfies readonly (keyof AppearancePalette)[];

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toUpperCase() : fallback.toUpperCase();
}

export function normalizeAppearancePalette(
  value: unknown,
  fallback: AppearancePalette = DEFAULT_APPEARANCE_SETTINGS.custom
): AppearancePalette {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    APPEARANCE_PALETTE_KEYS.map((key) => [key, normalizeHexColor(source[key], fallback[key])])
  ) as unknown as AppearancePalette;
}

export function normalizeAppearanceSettings(value: unknown): AppearanceSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const preset =
    typeof source.preset === "string" &&
    (source.preset === "custom" || PRESET_BY_ID.has(source.preset as Exclude<AppearanceThemeId, "custom">))
      ? (source.preset as AppearanceThemeId)
      : DEFAULT_APPEARANCE_SETTINGS.preset;

  return {
    preset,
    custom: normalizeAppearancePalette(source.custom),
  };
}

export function getAppearancePreset(
  id: AppearanceThemeId
): AppearanceThemePreset | null {
  return id === "custom" ? null : PRESET_BY_ID.get(id) ?? null;
}

export function resolveAppearancePalette(settings: AppearanceSettings): AppearancePalette {
  if (settings.preset === "custom") {
    return normalizeAppearancePalette(settings.custom);
  }
  return getAppearancePreset(settings.preset)?.palette ?? COLLECTOR_VIOLET;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHexColor(hex, "#000000").slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function rgbString(hex: string): string {
  return hexToRgb(hex).join(" ");
}

function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function mixHex(first: string, second: string, secondWeight: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const weight = Math.min(1, Math.max(0, secondWeight));
  const mixed = a.map((channel, index) => Math.round(channel * (1 - weight) + b[index]! * weight));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function colorScale(base: string, soft: string, background: string): Record<string, string> {
  return {
    "50": mixHex(soft, "#FFFFFF", 0.72),
    "100": mixHex(soft, "#FFFFFF", 0.5),
    "200": mixHex(soft, "#FFFFFF", 0.24),
    "300": soft,
    "400": mixHex(base, "#FFFFFF", 0.18),
    "500": base,
    "600": mixHex(base, background, 0.08),
    "700": mixHex(base, background, 0.24),
    "800": mixHex(base, background, 0.4),
    "900": mixHex(base, background, 0.58),
    "950": mixHex(base, background, 0.72),
  };
}

function addScale(
  variables: Record<string, string>,
  names: readonly string[],
  scale: Record<string, string>
) {
  for (const name of names) {
    for (const [step, color] of Object.entries(scale)) {
      variables[`--color-${name}-${step}`] = color;
    }
  }
}

export function appearancePaletteToCssVariables(
  paletteInput: AppearancePalette
): Record<string, string> {
  const palette = normalizeAppearancePalette(paletteInput);
  const variables: Record<string, string> = {
    "--dc-primary": palette.primary,
    "--dc-primary-hover": palette.primaryHover,
    "--dc-primary-soft": palette.primarySoft,
    "--dc-secondary": palette.secondary,
    "--dc-bg-main": palette.background,
    "--dc-surface-primary": palette.surface,
    "--dc-surface-elevated": palette.surfaceElevated,
    "--dc-surface-hover": palette.surfaceHover,
    "--dc-border": palette.border,
    "--dc-border-hover": palette.borderHover,
    "--dc-border-active": palette.primary,
    "--dc-text-primary": palette.textPrimary,
    "--dc-text-secondary": palette.textSecondary,
    "--dc-text-muted": palette.textMuted,
    "--dc-text-disabled": mixHex(palette.textMuted, palette.background, 0.38),
    "--dc-success": palette.success,
    "--dc-success-hover": mixHex(palette.success, "#FFFFFF", 0.16),
    "--dc-success-bg": rgba(palette.success, 0.12),
    "--dc-negative": palette.negative,
    "--dc-negative-hover": mixHex(palette.negative, "#FFFFFF", 0.16),
    "--dc-negative-bg": rgba(palette.negative, 0.12),
    "--dc-cyan": palette.data,
    "--dc-gold": palette.warning,
    "--dc-pink": palette.secondary,
    "--dc-chart-primary-fill": rgba(palette.primary, 0.15),
    "--dc-chart-secondary-fill": rgba(palette.data, 0.15),
    "--dc-primary-gradient": `linear-gradient(135deg, ${palette.primary} 0%, ${palette.primaryHover} 100%)`,
    "--dc-ambient-glow": `radial-gradient(circle, ${rgba(palette.primary, 0.18)}, transparent 70%)`,
    "--dc-primary-rgb": rgbString(palette.primary),
    "--dc-primary-hover-rgb": rgbString(palette.primaryHover),
    "--dc-primary-soft-rgb": rgbString(palette.primarySoft),
    "--dc-secondary-rgb": rgbString(palette.secondary),
    "--dc-bg-main-rgb": rgbString(palette.background),
    "--dc-surface-primary-rgb": rgbString(palette.surface),
    "--dc-surface-elevated-rgb": rgbString(palette.surfaceElevated),
    "--dc-surface-hover-rgb": rgbString(palette.surfaceHover),
    "--dc-border-rgb": rgbString(palette.border),
    "--dc-border-hover-rgb": rgbString(palette.borderHover),
    "--dc-border-active-rgb": rgbString(palette.primary),
    "--dc-text-secondary-rgb": rgbString(palette.textSecondary),
    "--dc-text-muted-rgb": rgbString(palette.textMuted),
    "--dc-success-rgb": rgbString(palette.success),
    "--dc-negative-rgb": rgbString(palette.negative),
    "--dc-cyan-rgb": rgbString(palette.data),
    "--dc-gold-rgb": rgbString(palette.warning),
    "--dc-pink-rgb": rgbString(palette.secondary),
    "--app-bg": palette.background,
    "--color-white": palette.textPrimary,
    "--color-black": palette.background,
  };

  addScale(
    variables,
    ["violet", "purple"],
    colorScale(palette.primary, palette.primarySoft, palette.background)
  );
  addScale(
    variables,
    ["fuchsia", "pink"],
    colorScale(
      palette.secondary,
      mixHex(palette.secondary, "#FFFFFF", 0.48),
      palette.background
    )
  );
  addScale(
    variables,
    ["blue", "sky", "cyan"],
    colorScale(palette.data, mixHex(palette.data, "#FFFFFF", 0.44), palette.background)
  );
  addScale(
    variables,
    ["emerald", "green", "lime"],
    colorScale(palette.success, mixHex(palette.success, "#FFFFFF", 0.48), palette.background)
  );
  addScale(
    variables,
    ["red", "rose"],
    colorScale(palette.negative, mixHex(palette.negative, "#FFFFFF", 0.5), palette.background)
  );
  addScale(
    variables,
    ["amber", "yellow", "orange"],
    colorScale(palette.warning, mixHex(palette.warning, "#FFFFFF", 0.5), palette.background)
  );

  const neutralScale = {
    "50": palette.textPrimary,
    "100": mixHex(palette.textPrimary, palette.textSecondary, 0.5),
    "200": palette.textSecondary,
    "300": mixHex(palette.textSecondary, palette.textMuted, 0.45),
    "400": palette.textMuted,
    "500": mixHex(palette.textMuted, palette.background, 0.28),
    "600": palette.borderHover,
    "700": palette.border,
    "800": palette.surfaceHover,
    "900": palette.surface,
    "950": palette.background,
  };
  addScale(variables, ["gray", "slate", "zinc", "neutral"], neutralScale);

  return variables;
}

export function applyAppearanceToElement(
  element: HTMLElement,
  appearanceInput: AppearanceSettings
) {
  const appearance = normalizeAppearanceSettings(appearanceInput);
  const variables = appearancePaletteToCssVariables(resolveAppearancePalette(appearance));
  element.dataset.appearance = appearance.preset;
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function getContrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getAppearanceContrastChecks(palette: AppearancePalette) {
  return {
    page: getContrastRatio(palette.textPrimary, palette.background),
    surface: getContrastRatio(palette.textPrimary, palette.surface),
    muted: getContrastRatio(palette.textMuted, palette.surface),
    button: getContrastRatio(palette.textPrimary, palette.primary),
  };
}
