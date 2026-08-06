export type AppearanceThemeId =
  | "collector-violet"
  | "rose-quartz"
  | "lavender-bloom"
  | "ocean-sapphire"
  | "emerald-vault"
  | "porcelain-studio"
  | "blush-petal"
  | "custom";

export type AppearanceColorScheme = "dark" | "light";

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
  scheme: AppearanceColorScheme;
  palette: AppearancePalette;
}

const COLLECTOR_VIOLET: AppearancePalette = {
  primary: "#6847F5",
  primaryHover: "#6541E8",
  primarySoft: "#B9A8FF",
  secondary: "#8B5CF6",
  background: "#07070B",
  surface: "#101016",
  surfaceElevated: "#181720",
  surfaceHover: "#211F2D",
  border: "#2A2738",
  borderHover: "#403A57",
  textPrimary: "#FFFFFF",
  textSecondary: "#D0CCDC",
  textMuted: "#918A9F",
  data: "#42B7E9",
  success: "#31C987",
  negative: "#F06478",
  warning: "#E8B84B",
};

export const APPEARANCE_THEME_PRESETS: readonly AppearanceThemePreset[] = [
  {
    id: "collector-violet",
    name: "Collector Violet",
    description: "The signature DustyCards purple on deep collector graphite.",
    scheme: "dark",
    palette: COLLECTOR_VIOLET,
  },
  {
    id: "rose-quartz",
    name: "Crimson Forge",
    description: "Vivid true-red accents forged into a near-black collector theme.",
    scheme: "dark",
    palette: {
      primary: "#D21F3C",
      primaryHover: "#B91432",
      primarySoft: "#FFADB7",
      secondary: "#F5523F",
      background: "#060608",
      surface: "#101012",
      surfaceElevated: "#19181B",
      surfaceHover: "#251E21",
      border: "#35262B",
      borderHover: "#5A323B",
      textPrimary: "#FFF9F9",
      textSecondary: "#E2D0D2",
      textMuted: "#A08186",
      data: "#5EAFD6",
      success: "#39BE7A",
      negative: "#FF5268",
      warning: "#F2A748",
    },
  },
  {
    id: "lavender-bloom",
    name: "Lavender Bloom",
    description: "Pearl lavender, orchid detail and softly layered dark surfaces.",
    scheme: "dark",
    palette: {
      primary: "#8B6BE0",
      primaryHover: "#9B7CEB",
      primarySoft: "#DCCFFF",
      secondary: "#C47BD7",
      background: "#0B0910",
      surface: "#15121B",
      surfaceElevated: "#1E1928",
      surfaceHover: "#292137",
      border: "#362D45",
      borderHover: "#504260",
      textPrimary: "#FCFAFF",
      textSecondary: "#DDD5E8",
      textMuted: "#9E91AD",
      data: "#65BBD9",
      success: "#40C38A",
      negative: "#E96F86",
      warning: "#E1AF5D",
    },
  },
  {
    id: "ocean-sapphire",
    name: "Ocean Sapphire",
    description: "Deep navy with crisp cyan data accents.",
    scheme: "dark",
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
    name: "Pink Couture",
    description: "An unapologetically girly candy-pink theme with magenta and lilac detail.",
    scheme: "light",
    palette: {
      primary: "#C7186C",
      primaryHover: "#A90F59",
      primarySoft: "#FFA9D0",
      secondary: "#8D3FC1",
      background: "#F6CFE2",
      surface: "#FFE8F3",
      surfaceElevated: "#FFF2F8",
      surfaceHover: "#F2BBD5",
      border: "#DD91B4",
      borderHover: "#C85E8E",
      textPrimary: "#35101F",
      textSecondary: "#633246",
      textMuted: "#784C5E",
      data: "#7B43B5",
      success: "#1C7456",
      negative: "#B92758",
      warning: "#8C5907",
    },
  },
  {
    id: "porcelain-studio",
    name: "Porcelain Studio",
    description: "Structured white, cool ink and restrained blue-violet accents.",
    scheme: "light",
    palette: {
      primary: "#4D52C6",
      primaryHover: "#3E43AA",
      primarySoft: "#DDE0FF",
      secondary: "#287FA0",
      background: "#F3F5F8",
      surface: "#FFFFFF",
      surfaceElevated: "#F9FAFD",
      surfaceHover: "#EAEFF5",
      border: "#D8DEE8",
      borderHover: "#AEB9C9",
      textPrimary: "#171B26",
      textSecondary: "#3D4656",
      textMuted: "#687386",
      data: "#147D9E",
      success: "#16845B",
      negative: "#C73E57",
      warning: "#9A6700",
    },
  },
  {
    id: "blush-petal",
    name: "Blush Petal",
    description: "A clearly feminine white theme with blush, rose and lilac detail.",
    scheme: "light",
    palette: {
      primary: "#C14686",
      primaryHover: "#A83872",
      primarySoft: "#F5CBE1",
      secondary: "#9A69C7",
      background: "#FFF6FA",
      surface: "#FFFDFE",
      surfaceElevated: "#FFF9FC",
      surfaceHover: "#FBEAF3",
      border: "#EDD0DE",
      borderHover: "#D9A8BF",
      textPrimary: "#2B1724",
      textSecondary: "#5D3B4F",
      textMuted: "#806372",
      data: "#277FA3",
      success: "#187A58",
      negative: "#C53F61",
      warning: "#97620C",
    },
  },
] as const;

/**
 * Saved preset ids are user data, so retired themes must migrate instead of
 * unexpectedly snapping back to the product default.
 */
export const LEGACY_APPEARANCE_PRESET_MIGRATIONS = {
  "amber-archive": "porcelain-studio",
} as const satisfies Readonly<Record<string, Exclude<AppearanceThemeId, "custom">>>;

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
  const rawPreset = typeof source.preset === "string" ? source.preset : null;
  const migratedPreset: string | null = rawPreset
    ? migrateLegacyAppearancePreset(rawPreset)
    : null;
  const preset =
    migratedPreset === "custom" ||
    PRESET_BY_ID.has(migratedPreset as Exclude<AppearanceThemeId, "custom">)
      ? (migratedPreset as AppearanceThemeId)
      : DEFAULT_APPEARANCE_SETTINGS.preset;

  return {
    preset,
    custom: normalizeAppearancePalette(source.custom),
  };
}

function migrateLegacyAppearancePreset(preset: string): string {
  return Object.prototype.hasOwnProperty.call(LEGACY_APPEARANCE_PRESET_MIGRATIONS, preset)
    ? LEGACY_APPEARANCE_PRESET_MIGRATIONS[
        preset as keyof typeof LEGACY_APPEARANCE_PRESET_MIGRATIONS
      ]
    : preset;
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

export function resolveAppearanceColorScheme(
  settingsInput: AppearanceSettings
): AppearanceColorScheme {
  const settings = normalizeAppearanceSettings(settingsInput);
  if (settings.preset !== "custom") {
    return getAppearancePreset(settings.preset)?.scheme ?? "dark";
  }

  return relativeLuminance(resolveAppearancePalette(settings).background) >= 0.5
    ? "light"
    : "dark";
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
  if (relativeLuminance(background) >= 0.5) {
    // The app deliberately keeps its dark-first utility branches active for
    // appearance presets. On a light canvas, low-numbered colors therefore
    // need to become readable foregrounds while high-numbered colors become
    // quiet tint surfaces (for example dark:text-violet-100 paired with
    // dark:bg-violet-950). This is role-aware rather than a conventional ramp.
    return {
      "50": mixHex(base, "#000000", 0.5),
      "100": mixHex(base, "#000000", 0.38),
      "200": mixHex(base, "#000000", 0.24),
      "300": mixHex(base, "#000000", 0.1),
      "400": base,
      "500": base,
      "600": mixHex(base, soft, 0.22),
      "700": mixHex(base, soft, 0.44),
      "800": mixHex(soft, background, 0.18),
      "900": mixHex(soft, background, 0.48),
      "950": mixHex(background, soft, 0.16),
    };
  }

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
  const isLightAppearance = relativeLuminance(palette.background) >= 0.5;
  const onPrimary = getReadableForeground(palette.primary, palette.textPrimary);
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
    "--dc-on-primary": onPrimary,
    "--dc-on-dark": "#FFFFFF",
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
    "--dc-surface-glass": rgba(palette.surface, 0.92),
    "--dc-surface-glass-strong": rgba(palette.surface, 0.98),
    "--dc-overlay": rgba(palette.background, 0.82),
    "--dc-overlay-strong": rgba(palette.background, 0.96),
    "--dc-scrim": isLightAppearance
      ? rgba(palette.textPrimary, 0.32)
      : "rgba(0, 0, 0, 0.62)",
    "--dc-shadow-color": isLightAppearance
      ? rgba(palette.textPrimary, 0.16)
      : "rgba(0, 0, 0, 0.52)",
    "--dc-sheen": isLightAppearance
      ? "rgba(255, 255, 255, 0.78)"
      : "rgba(255, 255, 255, 0.06)",
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
    "--dc-text-primary-rgb": rgbString(palette.textPrimary),
    "--dc-text-secondary-rgb": rgbString(palette.textSecondary),
    "--dc-text-muted-rgb": rgbString(palette.textMuted),
    "--dc-on-primary-rgb": rgbString(onPrimary),
    "--dc-on-dark-rgb": "255 255 255",
    "--dc-success-rgb": rgbString(palette.success),
    "--dc-negative-rgb": rgbString(palette.negative),
    "--dc-cyan-rgb": rgbString(palette.data),
    "--dc-gold-rgb": rgbString(palette.warning),
    "--dc-pink-rgb": rgbString(palette.secondary),
    "--app-bg": palette.background,
    // These aliases intentionally preserve dark-first utility semantics. On a
    // light appearance `text-white` becomes the dark ink token, while black
    // alpha overlays still need a genuinely dark source color.
    "--color-white": palette.textPrimary,
    "--color-black": isLightAppearance ? palette.textPrimary : palette.background,
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

/**
 * The pre-hydration theme bootstrap and runtime theme application must expose
 * the exact same contract. Deriving this list from the real converter keeps a
 * newly added semantic token available to presets and custom themes from the
 * very first paint.
 */
export const APPEARANCE_CSS_VARIABLE_NAMES = Object.freeze(
  Object.keys(appearancePaletteToCssVariables(DEFAULT_APPEARANCE_SETTINGS.custom))
);

export function applyAppearanceToElement(
  element: HTMLElement,
  appearanceInput: AppearanceSettings
) {
  const appearance = normalizeAppearanceSettings(appearanceInput);
  const palette = resolveAppearancePalette(appearance);
  const variables = appearancePaletteToCssVariables(palette);
  element.dataset.appearance = appearance.preset;
  element.dataset.appearanceScheme = resolveAppearanceColorScheme(appearance);
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }

  // Keep installed PWAs and Safari's status-bar area visually continuous when
  // a saved appearance is applied after the static document metadata.
  const themeColorMeta = element.ownerDocument?.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  themeColorMeta?.setAttribute("content", palette.background);
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

export function getReadableForeground(background: string, preferred: string): string {
  const candidates = [preferred, "#FFFFFF", "#000000"].map((color) =>
    normalizeHexColor(color, "#000000")
  );
  return candidates.reduce((best, candidate) =>
    getContrastRatio(candidate, background) > getContrastRatio(best, background)
      ? candidate
      : best
  );
}

export function getAppearanceContrastChecks(palette: AppearancePalette) {
  return {
    page: getContrastRatio(palette.textPrimary, palette.background),
    surface: getContrastRatio(palette.textPrimary, palette.surface),
    muted: getContrastRatio(palette.textMuted, palette.surface),
    button: getContrastRatio(getReadableForeground(palette.primary, palette.textPrimary), palette.primary),
  };
}
