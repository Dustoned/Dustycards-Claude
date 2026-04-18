export type Theme = "light" | "dark" | "system";
export type CardView = "table" | "grid" | "binder";
export type CardSize = "small" | "medium" | "large";
export type SortBy = "number" | "cm_en" | "tcp";
export type SortDir = "asc" | "desc";
export type ModalSize = "small" | "medium" | "large";
export type PriceSource = "cm_en" | "tcp";

export interface UserSettings {
  theme: Theme;
  widescreen: boolean;
  autoPriceRefresh: boolean;
  defaultView: CardView;
  cardSize: CardSize;
  defaultRarities: string[];
  defaultSupertypes: string[];
  showOnlyPriced: boolean;
  primaryPriceSource: PriceSource;
  sortBy: SortBy;
  sortDir: SortDir;
  modalSize: ModalSize;
}

export const SETTINGS_STORAGE_KEY = "dustycards-settings";
export const SETTINGS_COOKIE_NAME = "dustycards-settings";
export const SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  widescreen: false,
  autoPriceRefresh: true,
  defaultView: "table",
  cardSize: "medium",
  defaultRarities: [],
  defaultSupertypes: [],
  showOnlyPriced: false,
  primaryPriceSource: "cm_en",
  sortBy: "number",
  sortDir: "asc",
  modalSize: "medium",
};

export function mergeSettings(value: Partial<UserSettings> | null | undefined): UserSettings {
  return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
}

export function parseStoredSettings(raw: string | null | undefined): UserSettings | null {
  if (!raw) return null;

  try {
    return mergeSettings(JSON.parse(raw) as Partial<UserSettings>);
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
  return JSON.stringify(settings);
}

export function buildSettingsCookie(settings: UserSettings): string {
  return [
    `${SETTINGS_COOKIE_NAME}=${encodeURIComponent(serializeSettings(settings))}`,
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
    if (dark) document.documentElement.classList.add('dark');
    if (s.widescreen) document.documentElement.classList.add('widescreen');
  } catch(e){}
})();
`;
