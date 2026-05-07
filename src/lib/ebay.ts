import { convertUsdToEur, getUsdToEurRate, type CurrencyExchangeRate } from "@/lib/exchange-rates";
import type { CurrencyCode } from "@/lib/format";

const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_SEARCH_TIMEOUT_MS = 12_000;
const EBAY_TOKEN_EXPIRY_SKEW_MS = 60_000;
const EBAY_MAX_SEARCH_QUERY_LENGTH = 100;
const EBAY_SEARCH_PAGE_SIZE = 50;
const EBAY_MAX_FETCHED_LISTINGS = 200;
const DEFAULT_EBAY_CATEGORY_ID = "183454";

export type EbayEnvironment = "production" | "sandbox";
export type EbayBuyingMode = "fixed" | "auction" | "all";

export interface EbayRuntimeConfig {
  configured: boolean;
  environment: EbayEnvironment;
  marketplaceId: string;
  deliveryCountry: string | null;
  categoryId: string | null;
  clientId: string | null;
  clientSecret: string | null;
}

interface EbayApplicationToken {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
}

interface EbayAmount {
  value?: string | null;
  currency?: string | null;
}

interface EbaySearchItemSummary {
  itemId?: string | null;
  title?: string | null;
  image?: { imageUrl?: string | null } | null;
  price?: EbayAmount | null;
  currentBidPrice?: EbayAmount | null;
  shippingOptions?: Array<{
    shippingCost?: EbayAmount | null;
  }> | null;
  itemWebUrl?: string | null;
  condition?: string | null;
  conditionId?: string | null;
  buyingOptions?: string[] | null;
  seller?: {
    username?: string | null;
    feedbackPercentage?: string | null;
    feedbackScore?: number | null;
  } | null;
  itemLocation?: {
    country?: string | null;
  } | null;
  itemCreationDate?: string | null;
  itemEndDate?: string | null;
}

interface EbayItemAspect {
  name?: string | null;
  localizedName?: string | null;
  value?: string | null;
  localizedValue?: string | null;
}

interface EbayItemDetailsResponse {
  localizedAspects?: EbayItemAspect[] | null;
}

interface EbaySearchResponse {
  href?: string;
  total?: number;
  limit?: number;
  offset?: number;
  itemSummaries?: EbaySearchItemSummary[];
}

export interface EbayCardSearchInput {
  name: string;
  episodeName?: string | null;
  episodeCode?: string | null;
  cardNumber?: string | null;
  gradingCompany?: string | null;
  gradingGrade?: string | null;
  mode?: "raw" | "graded";
}

export interface EbayDealReference {
  label: string;
  valueEur: number | null;
  source: "cardmarket" | "tcgplayer" | "graded" | "ebay_sold_graded" | "manual" | "none";
}

export type EbayListingLanguageCode =
  | "ENG"
  | "JPN"
  | "KOR"
  | "CHN"
  | "OTHER"
  | "UNKNOWN";

export interface EbayListingLanguage {
  code: EbayListingLanguageCode;
  label: string;
  confidence: "explicit" | "unconfirmed";
  reason: string;
}

export type EbayListingCardConditionCode =
  | "mint"
  | "near_mint"
  | "excellent"
  | "light_play"
  | "moderate_play"
  | "heavy_play"
  | "damaged"
  | "unknown";

export interface EbayListingCardCondition {
  code: EbayListingCardConditionCode;
  label: string;
  rank: number;
  confidence: "explicit" | "unconfirmed";
  reason: string;
}

export interface EbayDealListing {
  itemId: string;
  title: string;
  imageUrl: string | null;
  itemWebUrl: string;
  condition: string | null;
  cardCondition: EbayListingCardCondition;
  language: EbayListingLanguage;
  isGradedListing: boolean;
  gradingReason: string | null;
  buyingOptions: string[];
  price: {
    value: number;
    currency: string;
    valueEur: number | null;
  };
  shipping: {
    value: number | null;
    currency: string | null;
    valueEur: number | null;
  };
  total: {
    value: number;
    currency: string;
    valueEur: number | null;
  };
  seller: {
    username: string | null;
    feedbackPercentage: string | null;
    feedbackScore: number | null;
  };
  locationCountry: string | null;
  itemCreationDate: string | null;
  itemEndDate: string | null;
  discountPercent: number | null;
  differenceEur: number | null;
  dealScore: number | null;
  dealTone: "great" | "good" | "fair" | "high" | "unknown";
}

export interface EbayDealSearchResult {
  query: string;
  marketplaceId: string;
  deliveryCountry: string | null;
  buyingMode: EbayBuyingMode;
  total: number;
  listings: EbayDealListing[];
  directSearchUrl: string;
}

let tokenCache: EbayApplicationToken | null = null;

function normalizeEnvValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEnvironment(value: string | undefined): EbayEnvironment {
  return value?.trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function getEbayRuntimeConfig(): EbayRuntimeConfig {
  const environment = normalizeEnvironment(process.env.EBAY_ENVIRONMENT);
  const clientId =
    normalizeEnvValue(process.env.EBAY_CLIENT_ID) ??
    normalizeEnvValue(process.env.EBAY_APP_ID);
  const clientSecret =
    normalizeEnvValue(process.env.EBAY_CLIENT_SECRET) ??
    normalizeEnvValue(process.env.EBAY_CERT_ID);
  const marketplaceId = normalizeEnvValue(process.env.EBAY_MARKETPLACE_ID) ?? "EBAY_NL";
  const deliveryCountry = normalizeEnvValue(process.env.EBAY_DELIVERY_COUNTRY) ?? "NL";
  const categoryId = normalizeEnvValue(process.env.EBAY_CATEGORY_ID) ?? DEFAULT_EBAY_CATEGORY_ID;

  return {
    configured: Boolean(clientId && clientSecret),
    environment,
    marketplaceId,
    deliveryCountry,
    categoryId,
    clientId,
    clientSecret,
  };
}

function getEbayApiBaseUrl(environment: EbayEnvironment): string {
  return environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

function buildTokenCacheKey(config: EbayRuntimeConfig): string {
  return [
    config.environment,
    config.clientId ?? "",
    config.clientSecret ? "secret" : "",
  ].join("|");
}

async function getEbayApplicationToken(config: EbayRuntimeConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("eBay API keys are not configured.");
  }

  const cacheKey = buildTokenCacheKey(config);
  const now = Date.now();
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAt > now) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${getEbayApiBaseUrl(config.environment)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: EBAY_SCOPE,
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Could not create eBay access token.");
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt:
      now + Math.max(0, (data.expires_in ?? 7200) * 1000 - EBAY_TOKEN_EXPIRY_SKEW_MS),
    cacheKey,
  };

  return tokenCache.accessToken;
}

function normalizeQueryToken(value: string | null | undefined): string | null {
  const normalized = value
    ?.replace(/[^\p{L}\p{N}./&' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : null;
}

function uniqueTokens(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeQueryToken(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

const NON_ENGLISH_CARD_SCRIPT_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LANGUAGE_SEPARATOR = String.raw`(?:^|[\s()[\]{}|/\\,:;._-])`;
const LANGUAGE_END = String.raw`(?=$|[\s()[\]{}|/\\,:;._-])`;
const ENGLISH_LANGUAGE_PATTERN = new RegExp(
  `${LANGUAGE_SEPARATOR}(?:EN|ENG|en|eng|english)${LANGUAGE_END}`,
  "i"
);
const JAPANESE_LANGUAGE_PATTERN =
  /\b(japan|japanese|japanse|japanisch|japans|japonais|giapponese|japonesa|japones|jpn|jp)\b/i;
const JAPANESE_PROMO_NUMBER_PATTERN =
  /\b\d{1,3}\s*\/\s*(?:[a-z]{1,4}-p|dp-p|s-p|sm-p|xy-p|bw-p)\b/i;
const KOREAN_LANGUAGE_PATTERN =
  /\b(korean|korea|koreaanse|koreanisch|coreen|coreenne|coréen|coréenne)\b/i;
const CHINESE_LANGUAGE_PATTERN =
  /\b(chinese|chinees|chinesisch|chinois|cinese|chino|simplified|traditional)\b/i;
const NEGATED_NON_ENGLISH_LANGUAGE_PATTERN =
  /\b(?:not|no|geen|niet)\s+(?:japanese|japanse|japans|jpn|jp|korean|korea|koreaanse|chinese|chinees|german|deutsch|duits|ger|de|french|frans|francais|fr|fra|spanish|spaans|espanol|es|esp|spa|italian|italiaans|italiano|it|ita|portuguese|portugues|pt|por)\b/gi;
const OTHER_NON_ENGLISH_LANGUAGES: Array<{
  label: string;
  name: string;
  pattern: RegExp;
}> = [
  {
    label: "FR",
    name: "French",
    pattern: new RegExp(
      `${LANGUAGE_SEPARATOR}(?:FR|FRA|fr|fra|french|frans|franse|francais|francaise|francese|frances|carte|cartes)${LANGUAGE_END}`,
      "i"
    ),
  },
  {
    label: "ES",
    name: "Spanish",
    pattern: new RegExp(
      `${LANGUAGE_SEPARATOR}(?:ES|ESP|SPA|es|esp|spa|spanish|spaans|spaanse|espanol|espanola|spanisch)${LANGUAGE_END}`,
      "i"
    ),
  },
  {
    label: "DE",
    name: "German",
    pattern: new RegExp(
      `${LANGUAGE_SEPARATOR}(?:DE|DEU|GER|de|deu|ger|german|deutsch|duits|duitse|allemand|tedesco)${LANGUAGE_END}`,
      "i"
    ),
  },
  {
    label: "IT",
    name: "Italian",
    pattern: new RegExp(
      `${LANGUAGE_SEPARATOR}(?:IT|ITA|it|ita|italian|italiaans|italiano|italiana)${LANGUAGE_END}`,
      "i"
    ),
  },
  {
    label: "PT",
    name: "Portuguese",
    pattern: new RegExp(
      `${LANGUAGE_SEPARATOR}(?:PT|POR|pt|por|portuguese|portugues|portugese)${LANGUAGE_END}`,
      "i"
    ),
  },
  {
    label: "RU",
    name: "Russian",
    pattern: new RegExp(
      `${LANGUAGE_SEPARATOR}(?:RU|RUS|ru|rus|russian|russisch)${LANGUAGE_END}`,
      "i"
    ),
  },
  {
    label: "Non-ENG",
    name: "a non-English language",
    pattern:
      /\b(thai|indonesian|indonesisch|polish|pools|dutch|nederlands|nl)\b/i,
  },
];

const DISALLOWED_EBAY_LISTING_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern:
      /\b(pokemon\s+tcg\s+pocket|tcg\s+pocket|ptcgp|pocket)\b/i,
    reason: "Pokemon TCG Pocket listing",
  },
  {
    pattern:
      /\b(digital|online|virtual|code\s+cards?|codes?|qr\s+code|redeem|redeemable|ptcgo|ptcgl|tcg\s+live|pokemon\s+tcg\s+live)\b/i,
    reason: "digital/code listing",
  },
  {
    pattern:
      /\b(mystery|mystery\s+(box|pack|lot)|random\s+(card|cards|lot|pack)|repack|repacks|orica|proxy|replica|custom)\b/i,
    reason: "mystery/custom listing",
  },
  {
    pattern:
      /\b(god\s+packs?|chance\s+to\s+get|guaranteed\s+\d|acrylic|keychains?|sleeves?|display\s+stand|mini\s+slab|extended\s+art(?:work)?\s+(?:case|frame)|artwork\s+case|anime\s+frame|card\s+case|case\s+card)\b/i,
    reason: "accessory/pack listing",
  },
  {
    pattern:
      /\b(lot|bundle|playset|set\s+of\s+\d|x\s?\d{2,})\b/i,
    reason: "multi-card listing",
  },
];

const CONDITION_SEPARATOR = String.raw`(?:^|[\s()[\]{}|,;:/\\-])`;
const CONDITION_END = String.raw`(?=$|[\s()[\]{}|,;:/\\-])`;
const UNKNOWN_CARD_CONDITION: EbayListingCardCondition = {
  code: "unknown",
  label: "Cond. unknown",
  rank: 0,
  confidence: "unconfirmed",
  reason: "No raw card condition marker found",
};

const CARD_CONDITION_RULES: Array<{
  code: Exclude<EbayListingCardConditionCode, "unknown">;
  label: string;
  rank: number;
  pattern: RegExp;
  reason: string;
}> = [
  {
    code: "damaged",
    label: "DMG",
    rank: 1,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:dmg|damaged|damage|poor|creased|crease|bent|bend|water\\s*damage)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions damaged/poor",
  },
  {
    code: "heavy_play",
    label: "HP",
    rank: 2,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:hp|heavily\\s+played|heavy\\s+play|heavy\\s+played)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions heavily played",
  },
  {
    code: "moderate_play",
    label: "MP",
    rank: 3,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:mp|moderately\\s+played|moderate\\s+play|moderate\\s+played)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions moderately played",
  },
  {
    code: "light_play",
    label: "LP",
    rank: 4,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:vlp|lp|lightly\\s+played|light\\s+play|light\\s+played|very\\s+lightly\\s+played)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions lightly played",
  },
  {
    code: "excellent",
    label: "EX",
    rank: 5,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:excellent|exc)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions excellent",
  },
  {
    code: "near_mint",
    label: "NM",
    rank: 6,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:nm|near\\s+mint|nearmint|nmint)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions near mint",
  },
  {
    code: "mint",
    label: "Mint",
    rank: 7,
    pattern: new RegExp(
      `${CONDITION_SEPARATOR}(?:mint)${CONDITION_END}`,
      "i"
    ),
    reason: "Title or condition mentions mint",
  },
];

function normalizeListingFilterText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectEbayListingCardCondition(input: {
  title: string;
  condition?: string | null;
}): EbayListingCardCondition {
  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  const combined = [title, condition].filter(Boolean).join(" ");

  if (!combined) return UNKNOWN_CARD_CONDITION;

  const detected = CARD_CONDITION_RULES.find((rule) => rule.pattern.test(combined));
  if (!detected) return UNKNOWN_CARD_CONDITION;

  return {
    code: detected.code,
    label: detected.label,
    rank: detected.rank,
    confidence: "explicit",
    reason: detected.reason,
  };
}

function getAspectText(aspect: EbayItemAspect): {
  name: string;
  value: string;
} {
  return {
    name: normalizeListingFilterText(aspect.name ?? aspect.localizedName),
    value: normalizeListingFilterText(aspect.value ?? aspect.localizedValue),
  };
}

function detectLanguageFromValue(
  value: string,
  reasonPrefix: string
): EbayListingLanguage | null {
  const normalized = normalizeListingFilterText(value);
  if (!normalized) return null;

  const detected = detectEbayListingLanguage({ title: normalized });
  if (detected.code === "UNKNOWN") return null;

  return {
    ...detected,
    reason: `${reasonPrefix}: ${normalized}`,
  };
}

function detectEbayListingLanguageFromAspects(
  aspects: EbayItemAspect[] | null | undefined
): EbayListingLanguage | null {
  for (const aspect of aspects ?? []) {
    const { name, value } = getAspectText(aspect);
    if (!value) continue;
    if (!/\b(language|card language|taal|sprache)\b/i.test(name)) continue;

    const detected = detectLanguageFromValue(value, "eBay Language aspect");
    if (detected) return detected;
  }

  return null;
}

function detectEbayListingCardConditionFromAspects(
  aspects: EbayItemAspect[] | null | undefined
): EbayListingCardCondition | null {
  for (const aspect of aspects ?? []) {
    const { name, value } = getAspectText(aspect);
    if (!value) continue;
    if (!/\b(condition|card condition|staat|zustand)\b/i.test(name)) continue;

    const detected = detectEbayListingCardCondition({ title: value });
    if (detected.code === "unknown") continue;

    return {
      ...detected,
      reason: `eBay Condition aspect: ${value}`,
    };
  }

  return null;
}

export function detectEbayListingLanguage(input: {
  title: string;
  condition?: string | null;
}): EbayListingLanguage {
  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  const combined = [title, condition].filter(Boolean).join(" ");
  const languageScanText = combined.replace(NEGATED_NON_ENGLISH_LANGUAGE_PATTERN, " ");

  if (NON_ENGLISH_CARD_SCRIPT_PATTERN.test(languageScanText)) {
    return {
      code: "OTHER",
      label: "Non-ENG",
      confidence: "explicit",
      reason: "Title uses non-English characters",
    };
  }

  if (
    JAPANESE_LANGUAGE_PATTERN.test(languageScanText) ||
    JAPANESE_PROMO_NUMBER_PATTERN.test(languageScanText)
  ) {
    return {
      code: "JPN",
      label: "JPN",
      confidence: "explicit",
      reason: JAPANESE_PROMO_NUMBER_PATTERN.test(languageScanText)
        ? "Title has a Japanese promo-style card number"
        : "Title mentions Japanese",
    };
  }

  if (KOREAN_LANGUAGE_PATTERN.test(languageScanText)) {
    return {
      code: "KOR",
      label: "KOR",
      confidence: "explicit",
      reason: "Title mentions Korean",
    };
  }

  if (CHINESE_LANGUAGE_PATTERN.test(languageScanText)) {
    return {
      code: "CHN",
      label: "CHN",
      confidence: "explicit",
      reason: "Title mentions Chinese",
    };
  }

  const otherLanguage = OTHER_NON_ENGLISH_LANGUAGES.find(({ pattern }) =>
    pattern.test(languageScanText)
  );

  if (otherLanguage) {
    return {
      code: "OTHER",
      label: otherLanguage.label,
      confidence: "explicit",
      reason: `Title mentions ${otherLanguage.name}`,
    };
  }

  if (ENGLISH_LANGUAGE_PATTERN.test(combined)) {
    return {
      code: "ENG",
      label: "ENG",
      confidence: "explicit",
      reason: "Title mentions EN, ENG, or English",
    };
  }

  return {
    code: "UNKNOWN",
    label: "Check ENG",
    confidence: "unconfirmed",
    reason: "No non-English marker found, but eBay did not confirm English",
  };
}

export function getEbayListingRejectionReason(input: {
  title: string;
  condition?: string | null;
  language?: EbayListingLanguage | null;
}): string | null {
  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  const combined = [title, condition].filter(Boolean).join(" ");
  const language = input.language ?? detectEbayListingLanguage({ title, condition });

  if (language.code !== "ENG" && language.code !== "UNKNOWN") {
    return "non-English card language";
  }

  for (const { pattern, reason } of DISALLOWED_EBAY_LISTING_PATTERNS) {
    if (pattern.test(combined)) return reason;
  }

  return null;
}

function getEbayListingGradingReasonFromAspects(
  aspects: EbayItemAspect[] | null | undefined
): string | null {
  for (const aspect of aspects ?? []) {
    const { name, value } = getAspectText(aspect);
    if (!value) continue;

    if (/\bgraded\b/i.test(name) && /\b(yes|ja|true|graded)\b/i.test(value)) {
      return "eBay aspect says graded";
    }

    if (
      /\b(professional grader|grader|grading company)\b/i.test(name) &&
      !/\b(no|none|not specified|n\/a)\b/i.test(value)
    ) {
      return `eBay grader aspect: ${value}`;
    }

    if (/\bgrade\b/i.test(name) && /\b(10|9\.5|9|8\.5|8|gem|mint|pristine)\b/i.test(value)) {
      return `eBay grade aspect: ${value}`;
    }
  }

  return null;
}

export function getEbayListingGradingReason(input: {
  title: string;
  condition?: string | null;
  aspects?: EbayItemAspect[] | null;
}): string | null {
  const aspectReason = getEbayListingGradingReasonFromAspects(input.aspects);
  if (aspectReason) return aspectReason;

  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  const combined = [title, condition].filter(Boolean).join(" ");

  if (/\b(psa|bgs|cgc|sgc)\b(?:\W+\w+){0,3}?\W+\d+(?:\.\d+)?\b/i.test(combined)) {
    return "Title mentions a grading company and grade";
  }

  if (/\b(psa|bgs|cgc|sgc)\b/i.test(combined)) {
    return "Title mentions a grading company";
  }

  if (/\b(ace|tag)\W+\d+(?:\.\d+)?\b/i.test(combined)) {
    return "Title mentions a grading company and grade";
  }

  if (/\b(graded|slabbed?|graad|valutata|professionally\W+graded)\b/i.test(combined)) {
    return "Title mentions graded/slab";
  }

  if (/\bgem\W+mint\b/i.test(combined)) {
    return "Title mentions GEM MINT";
  }

  if (/\b(black\W+label|pristine\W+10|beckett)\b/i.test(combined)) {
    return "Title mentions grading terminology";
  }

  return null;
}

export function buildEbayCardSearchQuery(input: EbayCardSearchInput): string {
  const gradeTokens =
    input.mode === "graded"
      ? uniqueTokens([
          input.gradingCompany && input.gradingGrade
            ? `${input.gradingCompany} ${input.gradingGrade}`
            : "graded",
        ])
      : [];
  const cardNumber = normalizeQueryToken(input.cardNumber);
  const episodeCode = normalizeQueryToken(input.episodeCode);
  const episodeName = normalizeQueryToken(input.episodeName);
  const tokens = uniqueTokens([
    ...gradeTokens,
    input.name,
    cardNumber,
    episodeName,
    episodeCode,
    "Pokemon",
  ]);
  let query = tokens.join(" ");

  if (query.length <= EBAY_MAX_SEARCH_QUERY_LENGTH) {
    return query;
  }

  query = uniqueTokens([
    ...gradeTokens,
    input.name,
    cardNumber,
    episodeCode,
    "Pokemon",
  ]).join(" ");

  if (query.length <= EBAY_MAX_SEARCH_QUERY_LENGTH) {
    return query;
  }

  return query.slice(0, EBAY_MAX_SEARCH_QUERY_LENGTH).trim();
}

export function buildEbayManualSearchQuery(value: string): string {
  const query = normalizeQueryToken(value);
  if (!query) return "";

  const hasPokemonContext = /\bpokemon\b/i.test(
    query.normalize("NFKD").replace(/\p{M}/gu, "")
  );
  const expandedQuery = hasPokemonContext ? query : `${query} Pokemon`;
  if (expandedQuery.length <= EBAY_MAX_SEARCH_QUERY_LENGTH) {
    return expandedQuery;
  }

  return expandedQuery.slice(0, EBAY_MAX_SEARCH_QUERY_LENGTH).trim();
}

export function buildEbayMarketplaceSearchUrl(
  query: string,
  marketplaceId = "EBAY_NL",
  categoryId: string | null = DEFAULT_EBAY_CATEGORY_ID
): string {
  const domainByMarketplace = new Map<string, string>([
    ["EBAY_AT", "www.ebay.at"],
    ["EBAY_AU", "www.ebay.com.au"],
    ["EBAY_BE", "www.ebay.be"],
    ["EBAY_CA", "www.ebay.ca"],
    ["EBAY_CH", "www.ebay.ch"],
    ["EBAY_DE", "www.ebay.de"],
    ["EBAY_ES", "www.ebay.es"],
    ["EBAY_FR", "www.ebay.fr"],
    ["EBAY_GB", "www.ebay.co.uk"],
    ["EBAY_IE", "www.ebay.ie"],
    ["EBAY_IT", "www.ebay.it"],
    ["EBAY_NL", "www.ebay.nl"],
    ["EBAY_PL", "www.ebay.pl"],
    ["EBAY_US", "www.ebay.com"],
  ]);
  const domain = domainByMarketplace.get(marketplaceId.toUpperCase()) ?? "www.ebay.com";
  const url = new URL(`https://${domain}/sch/i.html`);
  if (query.trim()) {
    url.searchParams.set("_nkw", query);
  }
  if (categoryId) {
    url.searchParams.set("_sacat", categoryId);
  }
  return url.toString();
}

function parseAmount(value: EbayAmount | null | undefined): { value: number; currency: string } | null {
  const amount = Number(value?.value);
  const currency = value?.currency?.trim().toUpperCase();

  if (!currency || !Number.isFinite(amount)) {
    return null;
  }

  return { value: amount, currency };
}

function convertAmountToEur(
  value: number | null,
  currency: string | null,
  usdToEurRate: CurrencyExchangeRate | null
): number | null {
  if (value == null || !currency) return null;

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "EUR") return Number(value.toFixed(2));
  if (normalizedCurrency === "USD") return convertUsdToEur(value, usdToEurRate);

  return null;
}

function getListingAmount(item: EbaySearchItemSummary) {
  return parseAmount(item.price) ?? parseAmount(item.currentBidPrice);
}

function getShippingAmount(item: EbaySearchItemSummary) {
  for (const option of item.shippingOptions ?? []) {
    const amount = parseAmount(option.shippingCost);
    if (amount) return amount;
  }

  return null;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => worker())
  );

  return results;
}

async function getEbayItemDetails(
  config: EbayRuntimeConfig,
  token: string,
  itemId: string
): Promise<EbayItemDetailsResponse | null> {
  const response = await fetch(
    `${getEbayApiBaseUrl(config.environment)}/buy/browse/v1/item/${encodeURIComponent(itemId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": config.marketplaceId,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) return null;

  return (await response.json().catch(() => null)) as EbayItemDetailsResponse | null;
}

async function enrichListingsWithItemDetails(input: {
  listings: EbayDealListing[];
  config: EbayRuntimeConfig;
  token: string;
  strictEnglish?: boolean;
  requireGraded?: boolean;
}): Promise<EbayDealListing[]> {
  return mapWithConcurrency(input.listings, 6, async (listing) => {
    const shouldFetchDetails =
      (input.strictEnglish && listing.language.code === "UNKNOWN") ||
      (input.requireGraded && !listing.isGradedListing);
    if (!shouldFetchDetails) return listing;

    const detail = await getEbayItemDetails(input.config, input.token, listing.itemId);
    const aspects = detail?.localizedAspects ?? null;
    const language = detectEbayListingLanguageFromAspects(aspects) ?? listing.language;
    const cardCondition =
      detectEbayListingCardConditionFromAspects(aspects) ?? listing.cardCondition;
    const gradingReason =
      getEbayListingGradingReason({
        title: listing.title,
        condition: listing.condition,
        aspects,
      }) ?? listing.gradingReason;

    return {
      ...listing,
      language,
      cardCondition,
      gradingReason,
      isGradedListing: Boolean(gradingReason),
    };
  });
}

function calculateDealTone(discountPercent: number | null): EbayDealListing["dealTone"] {
  if (discountPercent == null) return "unknown";
  if (discountPercent >= 25) return "great";
  if (discountPercent >= 10) return "good";
  if (discountPercent >= 0) return "fair";
  return "high";
}

export function compareListingToReference(input: {
  totalPriceEur: number | null;
  referencePriceEur: number | null;
}): Pick<EbayDealListing, "discountPercent" | "differenceEur" | "dealScore" | "dealTone"> {
  if (
    input.totalPriceEur == null ||
    input.referencePriceEur == null ||
    input.referencePriceEur <= 0
  ) {
    return {
      discountPercent: null,
      differenceEur: null,
      dealScore: null,
      dealTone: "unknown",
    };
  }

  const differenceEur = Number((input.referencePriceEur - input.totalPriceEur).toFixed(2));
  const discountPercent = Number(((differenceEur / input.referencePriceEur) * 100).toFixed(1));

  return {
    discountPercent,
    differenceEur,
    dealScore: discountPercent,
    dealTone: calculateDealTone(discountPercent),
  };
}

function buildEbaySearchFilters(config: EbayRuntimeConfig, buyingMode: EbayBuyingMode): string[] {
  const filters: string[] = [];
  if (config.deliveryCountry) {
    filters.push(`deliveryCountry:${config.deliveryCountry}`);
  }

  if (buyingMode === "auction") {
    filters.push("buyingOptions:{AUCTION}");
  } else if (buyingMode === "all") {
    filters.push("buyingOptions:{FIXED_PRICE|AUCTION}");
  }

  return filters;
}

function buildListing(
  item: EbaySearchItemSummary,
  reference: EbayDealReference,
  usdToEurRate: CurrencyExchangeRate | null
): EbayDealListing | null {
  const price = getListingAmount(item);
  const itemId = normalizeQueryToken(item.itemId);
  const title = item.title?.trim();
  const itemWebUrl = item.itemWebUrl?.trim();

  if (!itemId || !title || !itemWebUrl || !price) {
    return null;
  }

  const shipping = getShippingAmount(item);
  const sameCurrencyShipping =
    shipping && shipping.currency.toUpperCase() === price.currency.toUpperCase()
      ? shipping
      : null;
  const totalValue = Number((price.value + (sameCurrencyShipping?.value ?? 0)).toFixed(2));
  const priceEur = convertAmountToEur(price.value, price.currency, usdToEurRate);
  const shippingEur = shipping
    ? convertAmountToEur(shipping.value, shipping.currency, usdToEurRate)
    : null;
  const totalEur =
    priceEur == null
      ? null
      : shippingEur == null
        ? priceEur
        : Number((priceEur + shippingEur).toFixed(2));
  const comparison = compareListingToReference({
    totalPriceEur: totalEur,
    referencePriceEur: reference.valueEur,
  });
  const language = detectEbayListingLanguage({
    title,
    condition: item.condition,
  });
  const gradingReason = getEbayListingGradingReason({
    title,
    condition: item.condition,
  });
  const cardCondition = detectEbayListingCardCondition({
    title,
    condition: item.condition,
  });

  return {
    itemId,
    title,
    imageUrl: item.image?.imageUrl?.trim() || null,
    itemWebUrl,
    condition: item.condition?.trim() || null,
    cardCondition,
    language,
    isGradedListing: Boolean(gradingReason),
    gradingReason,
    buyingOptions: item.buyingOptions ?? [],
    price: {
      value: price.value,
      currency: price.currency,
      valueEur: priceEur,
    },
    shipping: {
      value: shipping?.value ?? null,
      currency: shipping?.currency ?? null,
      valueEur: shippingEur,
    },
    total: {
      value: totalValue,
      currency: price.currency,
      valueEur: totalEur,
    },
    seller: {
      username: item.seller?.username?.trim() || null,
      feedbackPercentage: item.seller?.feedbackPercentage?.trim() || null,
      feedbackScore: item.seller?.feedbackScore ?? null,
    },
    locationCountry: item.itemLocation?.country?.trim() || null,
    itemCreationDate: item.itemCreationDate ?? null,
    itemEndDate: item.itemEndDate ?? null,
    ...comparison,
  };
}

function sortListings(a: EbayDealListing, b: EbayDealListing): number {
  const aScore = a.dealScore ?? Number.NEGATIVE_INFINITY;
  const bScore = b.dealScore ?? Number.NEGATIVE_INFINITY;
  if (aScore !== bScore) return bScore - aScore;

  const aTotal = a.total.valueEur ?? a.total.value;
  const bTotal = b.total.valueEur ?? b.total.value;
  if (aTotal !== bTotal) return aTotal - bTotal;

  return a.title.localeCompare(b.title, "nl", { sensitivity: "base" });
}

export async function searchEbayDeals(input: {
  query: string;
  reference: EbayDealReference;
  limit?: number;
  buyingMode?: EbayBuyingMode;
  config?: EbayRuntimeConfig;
  strictEnglish?: boolean;
  excludeGraded?: boolean;
  requireGraded?: boolean;
}): Promise<EbayDealSearchResult> {
  const config = input.config ?? getEbayRuntimeConfig();
  const query = input.query.trim();
  const buyingMode = input.buyingMode ?? "fixed";
  const directSearchUrl = buildEbayMarketplaceSearchUrl(
    query,
    config.marketplaceId,
    config.categoryId
  );

  if (!query) {
    return {
      query,
      marketplaceId: config.marketplaceId,
      deliveryCountry: config.deliveryCountry,
      buyingMode,
      total: 0,
      listings: [],
      directSearchUrl,
    };
  }

  if (!config.configured) {
    return {
      query,
      marketplaceId: config.marketplaceId,
      deliveryCountry: config.deliveryCountry,
      buyingMode,
      total: 0,
      listings: [],
      directSearchUrl,
    };
  }

  const requestedLimit = Math.min(Math.max(input.limit ?? 24, 1), EBAY_SEARCH_PAGE_SIZE);
  const token = await getEbayApplicationToken(config);
  const baseUrl = new URL(`${getEbayApiBaseUrl(config.environment)}/buy/browse/v1/item_summary/search`);
  baseUrl.searchParams.set("q", query);
  if (config.categoryId) {
    baseUrl.searchParams.set("category_ids", config.categoryId);
  }

  const filters = buildEbaySearchFilters(config, buyingMode);
  if (filters.length > 0) {
    baseUrl.searchParams.set("filter", filters.join(","));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EBAY_SEARCH_TIMEOUT_MS);

  try {
    const itemSummaries: EbaySearchItemSummary[] = [];
    let reportedTotal = 0;

    for (
      let offset = 0;
      offset < EBAY_MAX_FETCHED_LISTINGS && itemSummaries.length < EBAY_MAX_FETCHED_LISTINGS;
      offset += EBAY_SEARCH_PAGE_SIZE
    ) {
      const pageUrl = new URL(baseUrl);
      pageUrl.searchParams.set("limit", String(EBAY_SEARCH_PAGE_SIZE));
      pageUrl.searchParams.set("offset", String(offset));

      const response = await fetch(pageUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "X-EBAY-C-MARKETPLACE-ID": config.marketplaceId,
        },
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as EbaySearchResponse & {
        errors?: Array<{ message?: string; longMessage?: string }>;
      };

      if (!response.ok) {
        const message =
          data.errors?.[0]?.longMessage ??
          data.errors?.[0]?.message ??
          `eBay search failed with ${response.status}`;
        throw new Error(message);
      }

      reportedTotal = data.total ?? reportedTotal;
      const pageItems = data.itemSummaries ?? [];
      itemSummaries.push(...pageItems);

      if (pageItems.length < EBAY_SEARCH_PAGE_SIZE) break;
      if (reportedTotal > 0 && offset + EBAY_SEARCH_PAGE_SIZE >= reportedTotal) break;
    }

    const uniqueItemSummaries = Array.from(
      new Map(
        itemSummaries.map((item, index) => [
          normalizeQueryToken(item.itemId) || `${normalizeQueryToken(item.title)}-${index}`,
          item,
        ])
      ).values()
    );

    const needsUsdRate = uniqueItemSummaries.some((item) => {
      const price = getListingAmount(item);
      const shipping = getShippingAmount(item);
      return price?.currency.toUpperCase() === "USD" || shipping?.currency.toUpperCase() === "USD";
    });
    const usdToEurRate = needsUsdRate ? await getUsdToEurRate() : null;
    let listings = uniqueItemSummaries
      .map((item) => buildListing(item, input.reference, usdToEurRate))
      .filter((listing): listing is EbayDealListing => Boolean(listing))
      .filter((listing) => !getEbayListingRejectionReason(listing));

    if (input.strictEnglish || input.requireGraded) {
      listings = await enrichListingsWithItemDetails({
        listings,
        config,
        token,
        strictEnglish: input.strictEnglish,
        requireGraded: input.requireGraded,
      });
    }

    listings = listings
      .filter((listing) => !getEbayListingRejectionReason(listing))
      .filter((listing) => !input.strictEnglish || listing.language.code === "ENG")
      .filter((listing) => !input.excludeGraded || !listing.isGradedListing)
      .filter((listing) => !input.requireGraded || listing.isGradedListing)
      .sort(sortListings)
      .slice(0, requestedLimit);

    return {
      query,
      marketplaceId: config.marketplaceId,
      deliveryCountry: config.deliveryCountry,
      buyingMode,
      total: listings.length,
      listings,
      directSearchUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function isSupportedDealCurrency(currency: string): currency is CurrencyCode {
  return currency === "EUR" || currency === "USD";
}

export function __resetEbayTokenCacheForTests() {
  tokenCache = null;
}
