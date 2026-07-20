import {
  APPEARANCE_THEME_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
  LEGACY_APPEARANCE_PRESET_MIGRATIONS,
  appearancePaletteToCssVariables,
  normalizeAppearanceSettings,
  type AppearanceSettings,
} from "@/lib/appearance-themes";

export type {
  AppearancePalette,
  AppearanceSettings,
  AppearanceThemeId,
} from "@/lib/appearance-themes";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type CardView = "table" | "grid" | "binder";
export type DisplaySize = "small" | "medium" | "large";
export type CardSize = "xsmall" | DisplaySize;
export type SortBy = "number" | "cm_en" | "tcp";
export type SortDir = "asc" | "desc";
export type ModalSize = DisplaySize;
export type UiScale = DisplaySize;
export type Card3dSize = DisplaySize;
export type PriceSource = "cm_en" | "tcp";

export interface UserSettings {
  theme: Theme;
  appearance: AppearanceSettings;
  widescreen: boolean;
  onePieceLibraryEnabled: boolean;
  uiScale: UiScale;
  mobileUiScale: UiScale;
  autoPriceRefresh: boolean;
  signalRadarEmailAlerts: boolean;
  binderWatchMinPrice: number;
  defaultView: CardView;
  mobileDefaultView: CardView;
  cardSize: CardSize;
  mobileCardSize: CardSize;
  defaultRarities: string[];
  defaultSupertypes: string[];
  showOnlyPriced: boolean;
  primaryPriceSource: PriceSource;
  sortBy: SortBy;
  sortDir: SortDir;
  modalSize: ModalSize;
  mobileModalSize: ModalSize;
  card3dSize: Card3dSize;
  mobileCard3dSize: Card3dSize;
}

export const SETTINGS_STORAGE_KEY = "dustycards-settings";
export const SETTINGS_COOKIE_NAME = "dustycards-settings";
export const SETTINGS_RESOLVED_THEME_COOKIE_NAME = "dustycards-resolved-theme";
export const SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SETTINGS_VERSION = 3;

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  appearance: {
    preset: DEFAULT_APPEARANCE_SETTINGS.preset,
    custom: { ...DEFAULT_APPEARANCE_SETTINGS.custom },
  },
  widescreen: false,
  onePieceLibraryEnabled: false,
  uiScale: "medium",
  mobileUiScale: "small",
  autoPriceRefresh: false,
  signalRadarEmailAlerts: false,
  binderWatchMinPrice: 50,
  defaultView: "table",
  mobileDefaultView: "grid",
  cardSize: "medium",
  mobileCardSize: "small",
  defaultRarities: [],
  defaultSupertypes: [],
  showOnlyPriced: false,
  primaryPriceSource: "cm_en",
  sortBy: "number",
  sortDir: "asc",
  modalSize: "medium",
  mobileModalSize: "small",
  card3dSize: "medium",
  mobileCard3dSize: "small",
};

function pickEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function pickNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  return fallback;
}

export function mergeSettings(value: Partial<UserSettings> | null | undefined): UserSettings {
  const source = value ?? {};

  return {
    theme: pickEnumValue(source.theme, ["light", "dark", "system"], DEFAULT_SETTINGS.theme),
    appearance: normalizeAppearanceSettings(source.appearance),
    widescreen:
      typeof source.widescreen === "boolean" ? source.widescreen : DEFAULT_SETTINGS.widescreen,
    onePieceLibraryEnabled:
      typeof source.onePieceLibraryEnabled === "boolean"
        ? source.onePieceLibraryEnabled
        : DEFAULT_SETTINGS.onePieceLibraryEnabled,
    uiScale: pickEnumValue(source.uiScale, ["small", "medium", "large"], DEFAULT_SETTINGS.uiScale),
    mobileUiScale: pickEnumValue(
      source.mobileUiScale,
      ["small", "medium", "large"],
      DEFAULT_SETTINGS.mobileUiScale
    ),
    autoPriceRefresh:
      typeof source.autoPriceRefresh === "boolean"
        ? source.autoPriceRefresh
        : DEFAULT_SETTINGS.autoPriceRefresh,
    signalRadarEmailAlerts:
      typeof source.signalRadarEmailAlerts === "boolean"
        ? source.signalRadarEmailAlerts
        : DEFAULT_SETTINGS.signalRadarEmailAlerts,
    binderWatchMinPrice: pickNonNegativeNumber(
      source.binderWatchMinPrice,
      DEFAULT_SETTINGS.binderWatchMinPrice
    ),
    defaultView: pickEnumValue(
      source.defaultView,
      ["table", "grid", "binder"],
      DEFAULT_SETTINGS.defaultView
    ),
    mobileDefaultView: pickEnumValue(
      source.mobileDefaultView,
      ["table", "grid", "binder"],
      DEFAULT_SETTINGS.mobileDefaultView
    ),
    cardSize: pickEnumValue(
      source.cardSize,
      ["xsmall", "small", "medium", "large"],
      DEFAULT_SETTINGS.cardSize
    ),
    mobileCardSize: pickEnumValue(
      source.mobileCardSize,
      ["xsmall", "small", "medium", "large"],
      DEFAULT_SETTINGS.mobileCardSize
    ),
    defaultRarities: pickStringArray(source.defaultRarities),
    defaultSupertypes: pickStringArray(source.defaultSupertypes),
    showOnlyPriced:
      typeof source.showOnlyPriced === "boolean"
        ? source.showOnlyPriced
        : DEFAULT_SETTINGS.showOnlyPriced,
    primaryPriceSource: pickEnumValue(
      source.primaryPriceSource,
      ["cm_en", "tcp"],
      DEFAULT_SETTINGS.primaryPriceSource
    ),
    sortBy: pickEnumValue(source.sortBy, ["number", "cm_en", "tcp"], DEFAULT_SETTINGS.sortBy),
    sortDir: pickEnumValue(source.sortDir, ["asc", "desc"], DEFAULT_SETTINGS.sortDir),
    modalSize: pickEnumValue(
      source.modalSize,
      ["small", "medium", "large"],
      DEFAULT_SETTINGS.modalSize
    ),
    mobileModalSize: pickEnumValue(
      source.mobileModalSize,
      ["small", "medium", "large"],
      DEFAULT_SETTINGS.mobileModalSize
    ),
    card3dSize: pickEnumValue(
      source.card3dSize,
      ["small", "medium", "large"],
      DEFAULT_SETTINGS.card3dSize
    ),
    mobileCard3dSize: pickEnumValue(
      source.mobileCard3dSize,
      ["small", "medium", "large"],
      DEFAULT_SETTINGS.mobileCard3dSize
    ),
  };
}

type StoredSettings = Partial<UserSettings> & {
  settingsVersion?: number;
};

export function parseStoredSettings(raw: string | null | undefined): UserSettings | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredSettings;
    const merged = mergeSettings(parsed);

    if (parsed.settingsVersion !== SETTINGS_VERSION) {
      merged.autoPriceRefresh = DEFAULT_SETTINGS.autoPriceRefresh;
    }

    return merged;
  } catch {
    return null;
  }
}

export function parseCookieSettings(raw: string | null | undefined): UserSettings | null {
  if (!raw) return null;

  try {
    return parseStoredSettings(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function serializeSettings(settings: UserSettings): string {
  return JSON.stringify({ ...settings, settingsVersion: SETTINGS_VERSION });
}

export function buildSettingsCookie(settings: UserSettings): string {
  return [
    `${SETTINGS_COOKIE_NAME}=${encodeURIComponent(serializeSettings(settings))}`,
    "Path=/",
    `Max-Age=${SETTINGS_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function parseResolvedThemeCookie(
  raw: string | null | undefined
): ResolvedTheme | null {
  return raw === "dark" || raw === "light" ? raw : null;
}

export function buildResolvedThemeCookie(theme: ResolvedTheme): string {
  return [
    `${SETTINGS_RESOLVED_THEME_COOKIE_NAME}=${theme}`,
    "Path=/",
    `Max-Age=${SETTINGS_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}

const PREPAINT_CSS_VARIABLE_NAMES = [
  "--dc-primary",
  "--dc-primary-hover",
  "--dc-primary-soft",
  "--dc-secondary",
  "--dc-bg-main",
  "--dc-surface-primary",
  "--dc-surface-elevated",
  "--dc-surface-hover",
  "--dc-border",
  "--dc-border-hover",
  "--dc-border-active",
  "--dc-text-primary",
  "--dc-text-secondary",
  "--dc-text-muted",
  "--dc-text-disabled",
  "--dc-on-primary",
  "--dc-success",
  "--dc-success-hover",
  "--dc-success-bg",
  "--dc-negative",
  "--dc-negative-hover",
  "--dc-negative-bg",
  "--dc-cyan",
  "--dc-gold",
  "--dc-pink",
  "--dc-chart-primary-fill",
  "--dc-chart-secondary-fill",
  "--dc-primary-gradient",
  "--dc-ambient-glow",
  "--dc-primary-rgb",
  "--dc-primary-hover-rgb",
  "--dc-primary-soft-rgb",
  "--dc-secondary-rgb",
  "--dc-bg-main-rgb",
  "--dc-surface-primary-rgb",
  "--dc-surface-elevated-rgb",
  "--dc-surface-hover-rgb",
  "--dc-border-rgb",
  "--dc-border-hover-rgb",
  "--dc-border-active-rgb",
  "--dc-text-secondary-rgb",
  "--dc-text-muted-rgb",
  "--dc-on-primary-rgb",
  "--dc-success-rgb",
  "--dc-negative-rgb",
  "--dc-cyan-rgb",
  "--dc-gold-rgb",
  "--dc-pink-rgb",
  "--app-bg",
  "--color-white",
  "--color-black",
] as const;

const PREPAINT_APPEARANCE_PRESETS = Object.fromEntries(
  APPEARANCE_THEME_PRESETS.map(({ id, scheme, palette }) => [
    id,
    {
      scheme,
      palette,
      variables: Object.fromEntries(
        PREPAINT_CSS_VARIABLE_NAMES.map((name) => [
          name,
          appearancePaletteToCssVariables(palette)[name],
        ])
      ),
    },
  ])
);

export const initSettingsScript = `
(function(){
  try {
    var raw = null;
    try { raw = localStorage.getItem('${SETTINGS_STORAGE_KEY}'); } catch (storageError) {}
    if (!raw) {
      var cookiePrefix = '${SETTINGS_COOKIE_NAME}=';
      var cookieParts = document.cookie ? document.cookie.split(';') : [];
      for (var cookieIndex = 0; cookieIndex < cookieParts.length; cookieIndex += 1) {
        var cookiePart = cookieParts[cookieIndex].trim();
        if (cookiePart.indexOf(cookiePrefix) === 0) {
          try { raw = decodeURIComponent(cookiePart.slice(cookiePrefix.length)); } catch (cookieError) {}
          break;
        }
      }
    }
    var s = raw ? JSON.parse(raw) : {};
    var presetMigrations = ${JSON.stringify(LEGACY_APPEARANCE_PRESET_MIGRATIONS)};
    var storedAppearance = s && s.appearance && typeof s.appearance === 'object'
      ? s.appearance
      : null;
    var storedPreset = storedAppearance && typeof storedAppearance.preset === 'string'
      ? storedAppearance.preset
      : null;
    if (storedPreset && Object.prototype.hasOwnProperty.call(presetMigrations, storedPreset)) {
      s.appearance = Object.assign({}, storedAppearance, { preset: presetMigrations[storedPreset] });
      try { localStorage.setItem('${SETTINGS_STORAGE_KEY}', JSON.stringify(s)); } catch (migrationError) {}
    }
    var hasBrowserSettings = !!(
      raw && s && typeof s === 'object' &&
      (typeof s.theme === 'string' || s.appearance || typeof s.settingsVersion === 'number')
    );
    window.__dustycardsSettings = hasBrowserSettings ? s : undefined;
    if (hasBrowserSettings) {
      document.cookie = '${SETTINGS_COOKIE_NAME}=' + encodeURIComponent(JSON.stringify(s)) + '; Path=/; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax';
    }
    var t = s.theme || 'system';
    var phone = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    var rawUi = phone ? (s.mobileUiScale || 'small') : (s.uiScale || 'medium');
    var ui = ['small', 'medium', 'large'].indexOf(rawUi) >= 0 ? rawUi : (phone ? 'small' : 'medium');
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.uiScale = ui;
    document.documentElement.classList.remove('ui-scale-small', 'ui-scale-medium', 'ui-scale-large');
    document.documentElement.classList.add('ui-scale-' + ui);
    document.documentElement.classList.add('dark');
    document.documentElement.classList.toggle('widescreen', !phone && !!s.widescreen);

    var presetRecords = ${JSON.stringify(PREPAINT_APPEARANCE_PRESETS)};
    var appearance = s.appearance && typeof s.appearance === 'object' ? s.appearance : {};
    var preset = typeof appearance.preset === 'string' ? appearance.preset : 'collector-violet';
    if (Object.prototype.hasOwnProperty.call(presetMigrations, preset)) {
      preset = presetMigrations[preset];
    }
    if (preset !== 'custom' && !presetRecords[preset]) {
      preset = 'collector-violet';
    }

    var defaultRecord = presetRecords['collector-violet'];
    var selectedRecord = preset !== 'custom' ? presetRecords[preset] : null;
    var isHex = function(value) {
      return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    };
    var palette = selectedRecord ? selectedRecord.palette : {};
    if (preset === 'custom') {
      var custom = appearance.custom && typeof appearance.custom === 'object' ? appearance.custom : {};
      palette = {};
      for (var paletteKey in defaultRecord.palette) {
        palette[paletteKey] = isHex(custom[paletteKey])
          ? custom[paletteKey].toUpperCase()
          : defaultRecord.palette[paletteKey];
      }
    }

    var hexRgb = function(hex) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
      ];
    };
    var rgbString = function(hex) { return hexRgb(hex).join(' '); };
    var rgba = function(hex, alpha) {
      var rgb = hexRgb(hex);
      return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + alpha + ')';
    };
    var luminance = function(hex) {
      var channels = hexRgb(hex).map(function(channel) {
        var normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    var contrast = function(first, second) {
      var a = luminance(first);
      var b = luminance(second);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    var readableForeground = function(background, preferred) {
      var candidates = [preferred, '#FFFFFF', '#000000'];
      var best = candidates[0];
      for (var candidateIndex = 1; candidateIndex < candidates.length; candidateIndex += 1) {
        if (contrast(candidates[candidateIndex], background) > contrast(best, background)) {
          best = candidates[candidateIndex];
        }
      }
      return best;
    };
    var onPrimary = readableForeground(palette.primary, palette.textPrimary);
    var customVariables = {
      '--dc-primary': palette.primary,
      '--dc-primary-hover': palette.primaryHover,
      '--dc-primary-soft': palette.primarySoft,
      '--dc-secondary': palette.secondary,
      '--dc-bg-main': palette.background,
      '--dc-surface-primary': palette.surface,
      '--dc-surface-elevated': palette.surfaceElevated,
      '--dc-surface-hover': palette.surfaceHover,
      '--dc-border': palette.border,
      '--dc-border-hover': palette.borderHover,
      '--dc-border-active': palette.primary,
      '--dc-text-primary': palette.textPrimary,
      '--dc-text-secondary': palette.textSecondary,
      '--dc-text-muted': palette.textMuted,
      '--dc-on-primary': onPrimary,
      '--dc-success': palette.success,
      '--dc-negative': palette.negative,
      '--dc-cyan': palette.data,
      '--dc-gold': palette.warning,
      '--dc-pink': palette.secondary,
      '--dc-chart-primary-fill': rgba(palette.primary, 0.15),
      '--dc-chart-secondary-fill': rgba(palette.data, 0.15),
      '--dc-primary-gradient': 'linear-gradient(135deg, ' + palette.primary + ' 0%, ' + palette.primaryHover + ' 100%)',
      '--dc-ambient-glow': 'radial-gradient(circle, ' + rgba(palette.primary, 0.18) + ', transparent 70%)',
      '--dc-primary-rgb': rgbString(palette.primary),
      '--dc-primary-hover-rgb': rgbString(palette.primaryHover),
      '--dc-primary-soft-rgb': rgbString(palette.primarySoft),
      '--dc-secondary-rgb': rgbString(palette.secondary),
      '--dc-bg-main-rgb': rgbString(palette.background),
      '--dc-surface-primary-rgb': rgbString(palette.surface),
      '--dc-surface-elevated-rgb': rgbString(palette.surfaceElevated),
      '--dc-surface-hover-rgb': rgbString(palette.surfaceHover),
      '--dc-border-rgb': rgbString(palette.border),
      '--dc-border-hover-rgb': rgbString(palette.borderHover),
      '--dc-border-active-rgb': rgbString(palette.primary),
      '--dc-text-secondary-rgb': rgbString(palette.textSecondary),
      '--dc-text-muted-rgb': rgbString(palette.textMuted),
      '--dc-on-primary-rgb': rgbString(onPrimary),
      '--dc-success-rgb': rgbString(palette.success),
      '--dc-negative-rgb': rgbString(palette.negative),
      '--dc-cyan-rgb': rgbString(palette.data),
      '--dc-gold-rgb': rgbString(palette.warning),
      '--dc-pink-rgb': rgbString(palette.secondary),
      '--app-bg': palette.background,
      '--color-white': palette.textPrimary,
      '--color-black': luminance(palette.background) >= 0.5
        ? palette.textPrimary
        : palette.background
    };
    var appearanceVariables = selectedRecord ? selectedRecord.variables : customVariables;
    var scheme = selectedRecord
      ? selectedRecord.scheme
      : (luminance(palette.background) >= 0.5 ? 'light' : 'dark');

    document.documentElement.dataset.appearance = preset;
    document.documentElement.dataset.appearanceScheme = scheme;
    document.documentElement.style.setProperty('--dc-color-scheme', scheme);
    document.documentElement.style.setProperty('color-scheme', scheme);
    for (var variableName in appearanceVariables) {
      document.documentElement.style.setProperty(variableName, appearanceVariables[variableName]);
    }
    document.cookie = '${SETTINGS_RESOLVED_THEME_COOKIE_NAME}=' + scheme + '; Path=/; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax';

    var updateMeta = function(name, content) {
      if (!document.querySelectorAll) return;
      var metas = document.querySelectorAll('meta[name="' + name + '"]');
      if (metas.length) {
        for (var metaIndex = 0; metaIndex < metas.length; metaIndex += 1) {
          metas[metaIndex].setAttribute('content', content);
        }
      } else if (document.createElement && document.head) {
        var meta = document.createElement('meta');
        meta.setAttribute('name', name);
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
      }
    };
    updateMeta('theme-color', palette.background);
    updateMeta('apple-mobile-web-app-status-bar-style', scheme === 'light' ? 'default' : 'black-translucent');

    if (hasBrowserSettings && s.appearance && s.appearance.preset !== preset) {
      s.appearance.preset = preset;
    }
  } catch(e){}
})();
`;
