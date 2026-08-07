import {
  APPEARANCE_THEME_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
  LEGACY_APPEARANCE_PRESET_MIGRATIONS,
  normalizeAppearanceSettings,
  type AppearanceSettings,
} from "@/lib/appearance-themes";
import {
  DEFAULT_DESKTOP_PINNED_NAV_KEYS,
  DEFAULT_MOBILE_BOTTOM_NAV_KEYS,
  DEFAULT_MOBILE_MORE_PINNED_KEYS,
  DESKTOP_PIN_LIMIT,
  MOBILE_BOTTOM_NAV_LIMIT,
  MOBILE_MORE_PIN_LIMIT,
  normalizeNavigationShortcutKeys,
  type NavigationShortcutKey,
} from "@/lib/navigation-preferences";
import {
  DEFAULT_HOME_DASHBOARD_MODULE_ORDER,
  normalizeHiddenHomeDashboardModules,
  normalizeHomeDashboardModuleSelection,
  normalizeHomeDashboardModuleOrder,
  type HomeDashboardModuleKey,
} from "@/lib/dashboard-module-preferences";
import {
  DEFAULT_OVERVIEW_SECTION_ORDER,
  normalizeHiddenOverviewSections,
  normalizeOverviewSectionOrder,
  type OverviewSectionKey,
} from "@/lib/overview-section-order";

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
export type SortBy = "number" | "release" | "cm_en" | "tcp";
export type SortDir = "asc" | "desc";
export type ModalSize = DisplaySize;
export type UiScale = DisplaySize;
export type Card3dSize = DisplaySize;
export type PriceSource = "cm_en" | "tcp";
export type DesktopNavigation = "top" | "sidebar";
export type { NavigationShortcutKey } from "@/lib/navigation-preferences";

export interface UserSettings {
  theme: Theme;
  appearance: AppearanceSettings;
  desktopNavigation: DesktopNavigation;
  desktopPinnedNavKeys: NavigationShortcutKey[];
  mobileBottomNavKeys: NavigationShortcutKey[];
  mobileMorePinnedKeys: NavigationShortcutKey[];
  widescreen: boolean;
  onePieceLibraryEnabled: boolean;
  uiScale: UiScale;
  mobileUiScale: UiScale;
  autoPriceRefresh: boolean;
  signalRadarEmailAlerts: boolean;
  binderWatchMinPrice: number;
  homeDashboardModuleOrder: HomeDashboardModuleKey[];
  homeDashboardHiddenModules: HomeDashboardModuleKey[];
  homeDashboardCompactModules: HomeDashboardModuleKey[];
  homeDashboardCollapsedModules: HomeDashboardModuleKey[];
  completeCollectionSectionOrder: OverviewSectionKey[];
  completeCollectionHiddenSections: OverviewSectionKey[];
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
  desktopNavigation: "top",
  desktopPinnedNavKeys: [...DEFAULT_DESKTOP_PINNED_NAV_KEYS],
  mobileBottomNavKeys: [...DEFAULT_MOBILE_BOTTOM_NAV_KEYS],
  mobileMorePinnedKeys: [...DEFAULT_MOBILE_MORE_PINNED_KEYS],
  widescreen: false,
  onePieceLibraryEnabled: false,
  uiScale: "medium",
  mobileUiScale: "small",
  autoPriceRefresh: false,
  signalRadarEmailAlerts: false,
  binderWatchMinPrice: 50,
  homeDashboardModuleOrder: [...DEFAULT_HOME_DASHBOARD_MODULE_ORDER],
  homeDashboardHiddenModules: [],
  homeDashboardCompactModules: [],
  homeDashboardCollapsedModules: [],
  completeCollectionSectionOrder: [...DEFAULT_OVERVIEW_SECTION_ORDER],
  completeCollectionHiddenSections: [],
  defaultView: "grid",
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
    desktopNavigation: pickEnumValue(
      source.desktopNavigation,
      ["top", "sidebar"],
      DEFAULT_SETTINGS.desktopNavigation
    ),
    desktopPinnedNavKeys: normalizeNavigationShortcutKeys(
      source.desktopPinnedNavKeys,
      DEFAULT_DESKTOP_PINNED_NAV_KEYS,
      DESKTOP_PIN_LIMIT,
      { allowEmpty: true }
    ),
    mobileBottomNavKeys: normalizeNavigationShortcutKeys(
      source.mobileBottomNavKeys,
      DEFAULT_MOBILE_BOTTOM_NAV_KEYS,
      MOBILE_BOTTOM_NAV_LIMIT,
      { exact: true }
    ),
    mobileMorePinnedKeys: normalizeNavigationShortcutKeys(
      source.mobileMorePinnedKeys,
      DEFAULT_MOBILE_MORE_PINNED_KEYS,
      MOBILE_MORE_PIN_LIMIT,
      { allowEmpty: true }
    ),
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
    homeDashboardModuleOrder: normalizeHomeDashboardModuleOrder(
      source.homeDashboardModuleOrder
    ),
    homeDashboardHiddenModules: normalizeHiddenHomeDashboardModules(
      source.homeDashboardHiddenModules
    ),
    homeDashboardCompactModules: normalizeHomeDashboardModuleSelection(
      source.homeDashboardCompactModules
    ),
    homeDashboardCollapsedModules: normalizeHomeDashboardModuleSelection(
      source.homeDashboardCollapsedModules
    ),
    completeCollectionSectionOrder: normalizeOverviewSectionOrder(
      source.completeCollectionSectionOrder
    ),
    completeCollectionHiddenSections: normalizeHiddenOverviewSections(
      source.completeCollectionHiddenSections
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
    sortBy: pickEnumValue(source.sortBy, ["number", "release", "cm_en", "tcp"], DEFAULT_SETTINGS.sortBy),
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

const PREPAINT_APPEARANCE_PRESETS = Object.fromEntries(
  APPEARANCE_THEME_PRESETS.map(({ id, scheme, palette }) => [
    id,
    {
      scheme,
      palette,
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
    var desktopNavigation = ['top', 'sidebar'].indexOf(s.desktopNavigation) >= 0
      ? s.desktopNavigation
      : 'top';
    document.documentElement.dataset.desktopNavigation = desktopNavigation;
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
    var mixHex = function(first, second, secondWeight) {
      var firstRgb = hexRgb(first);
      var secondRgb = hexRgb(second);
      var weight = Math.min(1, Math.max(0, secondWeight));
      var mixed = firstRgb.map(function(channel, index) {
        return Math.round(channel * (1 - weight) + secondRgb[index] * weight);
      });
      return '#' + mixed.map(function(channel) {
        return channel.toString(16).padStart(2, '0');
      }).join('').toUpperCase();
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
    var lightAppearance = luminance(palette.background) >= 0.5;
    var colorScale = function(base, soft, background) {
      if (luminance(background) >= 0.5) {
        return {
          '50': mixHex(base, '#000000', 0.5),
          '100': mixHex(base, '#000000', 0.38),
          '200': mixHex(base, '#000000', 0.24),
          '300': mixHex(base, '#000000', 0.1),
          '400': base,
          '500': base,
          '600': mixHex(base, soft, 0.22),
          '700': mixHex(base, soft, 0.44),
          '800': mixHex(soft, background, 0.18),
          '900': mixHex(soft, background, 0.48),
          '950': mixHex(background, soft, 0.16)
        };
      }
      return {
        '50': mixHex(soft, '#FFFFFF', 0.72),
        '100': mixHex(soft, '#FFFFFF', 0.5),
        '200': mixHex(soft, '#FFFFFF', 0.24),
        '300': soft,
        '400': mixHex(base, '#FFFFFF', 0.18),
        '500': base,
        '600': mixHex(base, background, 0.08),
        '700': mixHex(base, background, 0.24),
        '800': mixHex(base, background, 0.4),
        '900': mixHex(base, background, 0.58),
        '950': mixHex(base, background, 0.72)
      };
    };
    var addScale = function(target, names, scale) {
      names.forEach(function(name) {
        for (var step in scale) {
          target['--color-' + name + '-' + step] = scale[step];
        }
      });
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
      '--dc-text-disabled': mixHex(palette.textMuted, palette.background, 0.38),
      '--dc-on-primary': onPrimary,
      '--dc-on-dark': '#FFFFFF',
      '--dc-success': palette.success,
      '--dc-success-hover': mixHex(palette.success, '#FFFFFF', 0.16),
      '--dc-success-bg': rgba(palette.success, 0.12),
      '--dc-negative': palette.negative,
      '--dc-negative-hover': mixHex(palette.negative, '#FFFFFF', 0.16),
      '--dc-negative-bg': rgba(palette.negative, 0.12),
      '--dc-cyan': palette.data,
      '--dc-gold': palette.warning,
      '--dc-pink': palette.secondary,
      '--dc-chart-primary-fill': rgba(palette.primary, 0.15),
      '--dc-chart-secondary-fill': rgba(palette.data, 0.15),
      '--dc-primary-gradient': 'linear-gradient(135deg, ' + palette.primary + ' 0%, ' + palette.primaryHover + ' 100%)',
      '--dc-ambient-glow': 'radial-gradient(circle, ' + rgba(palette.primary, 0.18) + ', transparent 70%)',
      '--dc-surface-glass': rgba(palette.surface, 0.92),
      '--dc-surface-glass-strong': rgba(palette.surface, 0.98),
      '--dc-overlay': rgba(palette.background, 0.82),
      '--dc-overlay-strong': rgba(palette.background, 0.96),
      '--dc-scrim': lightAppearance
        ? rgba(palette.textPrimary, 0.32)
        : 'rgba(0, 0, 0, 0.62)',
      '--dc-shadow-color': lightAppearance
        ? rgba(palette.textPrimary, 0.16)
        : 'rgba(0, 0, 0, 0.52)',
      '--dc-sheen': lightAppearance
        ? 'rgba(255, 255, 255, 0.78)'
        : 'rgba(255, 255, 255, 0.06)',
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
      '--dc-text-primary-rgb': rgbString(palette.textPrimary),
      '--dc-text-secondary-rgb': rgbString(palette.textSecondary),
      '--dc-text-muted-rgb': rgbString(palette.textMuted),
      '--dc-on-primary-rgb': rgbString(onPrimary),
      '--dc-on-dark-rgb': '255 255 255',
      '--dc-success-rgb': rgbString(palette.success),
      '--dc-negative-rgb': rgbString(palette.negative),
      '--dc-cyan-rgb': rgbString(palette.data),
      '--dc-gold-rgb': rgbString(palette.warning),
      '--dc-pink-rgb': rgbString(palette.secondary),
      '--app-bg': palette.background,
      '--color-white': palette.textPrimary,
      '--color-black': lightAppearance
        ? palette.textPrimary
        : palette.background
    };
    addScale(
      customVariables,
      ['violet', 'purple'],
      colorScale(palette.primary, palette.primarySoft, palette.background)
    );
    addScale(
      customVariables,
      ['fuchsia', 'pink'],
      colorScale(palette.secondary, mixHex(palette.secondary, '#FFFFFF', 0.48), palette.background)
    );
    addScale(
      customVariables,
      ['blue', 'sky', 'cyan'],
      colorScale(palette.data, mixHex(palette.data, '#FFFFFF', 0.44), palette.background)
    );
    addScale(
      customVariables,
      ['emerald', 'green', 'lime'],
      colorScale(palette.success, mixHex(palette.success, '#FFFFFF', 0.48), palette.background)
    );
    addScale(
      customVariables,
      ['red', 'rose'],
      colorScale(palette.negative, mixHex(palette.negative, '#FFFFFF', 0.5), palette.background)
    );
    addScale(
      customVariables,
      ['amber', 'yellow', 'orange'],
      colorScale(palette.warning, mixHex(palette.warning, '#FFFFFF', 0.5), palette.background)
    );
    addScale(customVariables, ['gray', 'slate', 'zinc', 'neutral'], {
      '50': palette.textPrimary,
      '100': mixHex(palette.textPrimary, palette.textSecondary, 0.5),
      '200': palette.textSecondary,
      '300': mixHex(palette.textSecondary, palette.textMuted, 0.45),
      '400': palette.textMuted,
      '500': mixHex(palette.textMuted, palette.background, 0.28),
      '600': palette.borderHover,
      '700': palette.border,
      '800': palette.surfaceHover,
      '900': palette.surface,
      '950': palette.background
    });
    var appearanceVariables = customVariables;
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
