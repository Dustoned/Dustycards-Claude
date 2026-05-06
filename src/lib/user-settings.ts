export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type CardView = "table" | "grid" | "binder";
export type DisplaySize = "small" | "medium" | "large";
export type CardSize = DisplaySize;
export type SortBy = "number" | "cm_en" | "tcp";
export type SortDir = "asc" | "desc";
export type ModalSize = DisplaySize;
export type UiScale = DisplaySize;
export type Card3dSize = DisplaySize;
export type PriceSource = "cm_en" | "tcp";

export interface UserSettings {
  theme: Theme;
  widescreen: boolean;
  uiScale: UiScale;
  mobileUiScale: UiScale;
  autoPriceRefresh: boolean;
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
  widescreen: false,
  uiScale: "medium",
  mobileUiScale: "small",
  autoPriceRefresh: true,
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
    widescreen:
      typeof source.widescreen === "boolean" ? source.widescreen : DEFAULT_SETTINGS.widescreen,
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
    cardSize: pickEnumValue(source.cardSize, ["small", "medium", "large"], DEFAULT_SETTINGS.cardSize),
    mobileCardSize: pickEnumValue(
      source.mobileCardSize,
      ["small", "medium", "large"],
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

export const initSettingsScript = `
(function(){
  try {
    var raw = localStorage.getItem('${SETTINGS_STORAGE_KEY}');
    var s = raw ? JSON.parse(raw) : {};
    window.__dustycardsSettings = s;
    document.cookie = '${SETTINGS_COOKIE_NAME}=' + encodeURIComponent(JSON.stringify(s)) + '; Path=/; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax';
    var t = s.theme || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.cookie = '${SETTINGS_RESOLVED_THEME_COOKIE_NAME}=' + (dark ? 'dark' : 'light') + '; Path=/; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax';
    var phone = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    var rawUi = phone ? (s.mobileUiScale || 'small') : (s.uiScale || 'medium');
    var ui = ['small', 'medium', 'large'].indexOf(rawUi) >= 0 ? rawUi : (phone ? 'small' : 'medium');
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.uiScale = ui;
    document.documentElement.classList.remove('ui-scale-small', 'ui-scale-medium', 'ui-scale-large');
    document.documentElement.classList.add('ui-scale-' + ui);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('widescreen', !phone && !!s.widescreen);
  } catch(e){}
})();
`;
