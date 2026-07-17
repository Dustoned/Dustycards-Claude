import { convertUsdToEur, getUsdToEurRate, type CurrencyExchangeRate } from "@/lib/exchange-rates";
import { buildEbaySealedProductSearchQuery } from "@/lib/ebay-sealed-query";
import type { CurrencyCode } from "@/lib/format";

const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_SEARCH_TIMEOUT_MS = 12_000;
const EBAY_TOKEN_EXPIRY_SKEW_MS = 60_000;
const EBAY_MAX_SEARCH_QUERY_LENGTH = 100;
const EBAY_SEARCH_PAGE_SIZE = 100;
// Browse search supports 200 rows per page and a 10,000-row result window.
// Demand scans use that complete official window instead of a UI-sized sample.
const EBAY_DEMAND_SEARCH_PAGE_SIZE = 200;
const EBAY_DEMAND_MAX_FETCHED_LISTINGS = 10_000;
const EBAY_MAX_FETCHED_LISTINGS = 300;
const EBAY_ITEM_DETAILS_ENRICHMENT_LIMIT = 300;
const EBAY_ITEM_DETAILS_TIMEOUT_MS = 4_000;
const EBAY_SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
const EBAY_SEARCH_CACHE_MAX_ENTRIES = 120;
const EBAY_ITEM_DETAILS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EBAY_ITEM_DETAILS_CACHE_MAX_ENTRIES = 5_000;
const EBAY_RATE_LIMIT_CACHE_TTL_MS = 5 * 60 * 1000;
const EBAY_BROWSE_QUOTA_BACKOFF_FALLBACK_MS = 5 * 60 * 1000;
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

interface EbayConditionDescriptorValue {
  content?: string | null;
  value?: string | null;
  additionalInfo?: string[] | string | null;
}

interface EbayConditionDescriptor {
  name?: string | null;
  values?: EbayConditionDescriptorValue[] | null;
}

interface EbayItemDetailsResponse {
  localizedAspects?: EbayItemAspect[] | null;
  conditionDescriptors?: EbayConditionDescriptor[] | null;
}

interface EbaySearchResponse {
  href?: string;
  total?: number;
  limit?: number;
  offset?: number;
  itemSummaries?: EbaySearchItemSummary[];
}

interface EbayAnalyticsRateLimitsResponse {
  rateLimits?: Array<{
    apiContext?: string | null;
    apiName?: string | null;
    apiVersion?: string | null;
    resources?: Array<{
      name?: string | null;
      rates?: Array<{
        count?: number | null;
        limit?: number | null;
        remaining?: number | null;
        reset?: string | null;
        timeWindow?: number | null;
      }> | null;
    }> | null;
  }> | null;
}

export interface EbayCardSearchInput {
  name: string;
  game?: "pokemon" | "one-piece" | null;
  episodeName?: string | null;
  episodeCode?: string | null;
  cardNumber?: string | null;
  gradingCompany?: string | null;
  gradingGrade?: string | null;
  mode?: "raw" | "graded";
}

export interface EbaySealedSearchInput {
  name: string;
  episodeName?: string | null;
  episodeCode?: string | null;
}

export interface EbayDealReference {
  label: string;
  valueEur: number | null;
  source: "cardmarket" | "tcgplayer" | "graded" | "ebay_sold_graded" | "sealed" | "manual" | "none";
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
  /**
   * Stronger than `isGradedListing`: true only when eBay metadata or a
   * grader-plus-grade title pattern confirms that this is an actual slab.
   * The broader flag intentionally remains available to keep suspicious
   * graded-looking listings out of raw demand.
   */
  isConfirmedGradedListing?: boolean;
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
  demandVerification?: {
    english: boolean;
    nearMint: boolean;
    source: "ebay_item" | "ebay_search_filter";
  };
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
  scan?: {
    fetchedCount: number;
    availableTotal: number | null;
    capped: boolean;
  };
}

export interface EbayRateLimitRate {
  count: number | null;
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  timeWindow: number | null;
}

export interface EbayRateLimitResource {
  name: string;
  rates: EbayRateLimitRate[];
}

export interface EbayRateLimitSummary extends EbayRateLimitRate {
  apiContext: string;
  apiName: string;
  resourceName: string;
}

export interface EbayRateLimitStatus {
  configured: boolean;
  apiContext: string;
  apiName: string;
  marketplaceId: string;
  resources: EbayRateLimitResource[];
  summary: EbayRateLimitSummary | null;
  refreshedAt: string;
}

let tokenCache: EbayApplicationToken | null = null;
const searchCache = new Map<
  string,
  {
    expiresAt: number;
    result: EbayDealSearchResult;
  }
>();
const rateLimitCache = new Map<
  string,
  {
    expiresAt: number;
    status: EbayRateLimitStatus;
  }
>();
const itemDetailsCache = new Map<
  string,
  {
    expiresAt: number;
    details: EbayItemDetailsResponse | null;
  }
>();
let browseQuotaBackoff: { expiresAt: number; message: string } | null = null;

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

function toNullableInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
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
      `${LANGUAGE_SEPARATOR}(?:IT|ITA|it|ita|italian|italiaans|italiano|italiana|non\\s+gradat[ao]|non\\s+gradad[ao])${LANGUAGE_END}`,
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
      /\b(mystery|mystery\s+(box|pack|lot)|random\s+(card|cards|lot|pack)|chase\s+(card|pack|box|lot)|read\s+please|repack|repacks|orica|proxy|proxies|replica|replicas|custom|customs|custom[-\s]+made|fan[-\s]*made|fanmade|fan[-\s]+art|diy|do[-\s]*it[-\s]*yourself|hand[-\s]*made|handmade|home[-\s]*made|homemade|unofficial|fake|fakes|counterfeit|bootleg|repro|reproduction|facsimile|novelty\s+card|art\s+card|altered\s+art|custom\s+art)\b/i,
    reason: "mystery/custom listing",
  },
  {
    pattern:
      /\bempty\b(?=.{0,140}\b(?:elite\s+trainer\s+box|etb|booster\s+box|display|box|boxes|tin|tins|case|wrapper|wrappers|packaging|carton|divider|dividers)\b)/i,
    reason: "no-card listing",
  },
  {
    pattern:
      /\b(no\s+(?:card|cards|pack|packs|booster|boosters)|(?:card|cards|pack|packs|booster|boosters)\s+not\s+included|does\s+not\s+include\s+(?:a\s+)?(?:card|cards|pack|packs|booster|boosters)|without\s+(?:a\s+)?(?:card|cards|pack|packs|booster|boosters)|empty\s+(?:(?:booster|elite\s+trainer|etb|display|collection|trainer|tin|case|outer|shipping|storage|packaging)\s+){0,3}(?:box|boxes|pack|packs|tin|tins|etb|display|case|wrapper|wrappers|packaging|carton)|(?:empty\s+)?(?:etb|elite\s+trainer|outer|shipping|storage|packaging)\s+box\s+only|(?:wrapper|wrappers|packaging|carton|case)\s+only|(?:box|boxes|pack|packs|tin|tins|etb|display|case|wrapper|wrappers|packaging|carton)\s+empty|packaging\s+only|graded\s+guard)\b/i,
    reason: "no-card listing",
  },
  {
    pattern:
      /\b(choose\s+your\s+card|pick\s+your\s+card|choose\s+the\s+card|pick\s+the\s+card|you\s+pick|multiple\s+available)\b/i,
    reason: "choice listing",
  },
  {
    pattern:
      /\b(god\s+packs?|chance\s+to\s+get|guaranteed\s+\d|acrylic|keychains?|sleeves?|display\s+stand|mini\s+slab|slab\s+(?:case|holder|stand|guard)|metal\s+card|stainless\s+steel|extended\s+art(?:work)?\s+(?:case|frame)|artwork\s+case|anime\s+frame|card\s+case|case\s+card)\b/i,
    reason: "accessory/pack listing",
  },
  {
    pattern:
      /\b(?:jumbo|oversized?|oversize|stickers?|decals?)\b(?=.{0,120}\b(?:card|pokemon|tcg)\b)|\b(?:card|pokemon|tcg)\b(?=.{0,120}\b(?:jumbo|oversized?|oversize|stickers?|decals?)\b)/i,
    reason: "accessory/pack listing",
  },
  {
    pattern:
      /\b(lot|bundle|playset|set\s+of\s+\d|x\s?\d{2,})\b/i,
    reason: "multi-card listing",
  },
];

const DISALLOWED_SEALED_EBAY_LISTING_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern:
      /\b(card\s+sleeves?|deck\s+sleeves?|sleeves?\s*(?:\(?\d+\s*-?\s*pack\)?|pack))\b/i,
    reason: "accessory/pack listing",
  },
  {
    pattern:
      /\b(lot|pulls?\s+from|hits?\s+from|loose\s+(?:cards?|packs?)|opened\s+(?:box|packs?|product)|bulk)\b/i,
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

function detectEbayListingCardConditionFromDescriptors(
  descriptors: EbayConditionDescriptor[] | null | undefined
): EbayListingCardCondition | null {
  for (const descriptor of descriptors ?? []) {
    const name = normalizeListingFilterText(descriptor.name);
    if (!/card\s*condition|kartenzustand|kaartconditie/i.test(name)) continue;

    for (const value of descriptor.values ?? []) {
      const content = normalizeListingFilterText(value.content ?? value.value);
      if (!content) continue;
      const detected = detectEbayListingCardCondition({ title: content });
      if (detected.code !== "near_mint") continue;

      return {
        ...detected,
        reason: `eBay Condition descriptor: ${content}`,
      };
    }
  }

  return null;
}

function moreConservativeCardCondition(
  summaryCondition: EbayListingCardCondition,
  verifiedCondition: EbayListingCardCondition | null
): EbayListingCardCondition {
  if (!verifiedCondition) return summaryCondition;
  if (
    summaryCondition.code !== "unknown" &&
    summaryCondition.rank < verifiedCondition.rank
  ) {
    return summaryCondition;
  }
  return verifiedCondition;
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
  listingKind?: "card" | "graded" | "sealed";
}): string | null {
  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  const combined = [title, condition].filter(Boolean).join(" ");
  const language = input.language ?? detectEbayListingLanguage({ title, condition });

  if (
    input.listingKind !== "graded" &&
    language.code !== "ENG" &&
    language.code !== "UNKNOWN"
  ) {
    return input.listingKind === "sealed"
      ? "non-English sealed language"
      : "non-English card language";
  }

  if (input.listingKind === "sealed") {
    for (const { pattern, reason } of DISALLOWED_SEALED_EBAY_LISTING_PATTERNS) {
      if (pattern.test(combined)) return reason;
    }
  }

  for (const { pattern, reason } of DISALLOWED_EBAY_LISTING_PATTERNS) {
    if (
      input.listingKind === "sealed" &&
      (reason === "multi-card listing" || reason === "accessory/pack listing")
    ) {
      continue;
    }
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

const NEGATIVE_GRADING_ASPECT_VALUE =
  /\b(?:no|false|none|ungraded|not\s+(?:professionally\s+)?graded|not\s+applicable|does\s+not\s+apply|not\s+specified|n\s*\/\s*a)\b/i;
const POSITIVE_GRADED_ASPECT_VALUE = /\b(?:yes|ja|true|graded|professionally\s+graded)\b/i;
const GRADING_COMPANY_PATTERN =
  String.raw`(?:p\.?s\.?a|b\.?g\.?s|c\.?g\.?c|s\.?g\.?c|beckett|ace|tag|aigrading|ai\s*grading)`;
const GRADING_VALUE_PATTERN =
  String.raw`(?:10|9(?:\.5)?|8(?:\.5)?|7(?:\.5)?|6(?:\.5)?|5(?:\.5)?|4(?:\.5)?|3(?:\.5)?|2(?:\.5)?|1(?:\.5)?|gem\s*mint|gem\s*mt|pristine|black\s*label)(?!\d)`;
const SPECULATIVE_GRADING_TERM_PATTERN =
  String.raw`(?:potential|candidate|ready|likely|possible|possibly|grade[-\s]?(?:worthy|able)|gradable|gradeworthy|should\s+grade)`;
const EXPLICIT_RAW_TITLE_PATTERN = /\b(?:ungraded|not\s+graded|raw\s+card)\b/i;

function hasNegativeGradingAspect(aspects: EbayItemAspect[] | null | undefined): boolean {
  return (aspects ?? []).some((aspect) => {
    const { name, value } = getAspectText(aspect);
    if (!value) return false;
    return (
      /\b(?:graded|professional grader|grader|grading company|grade)\b/i.test(name) &&
      NEGATIVE_GRADING_ASPECT_VALUE.test(value)
    );
  });
}

/**
 * Returns true only for an eBay-confirmed graded item or a title that names
 * both a recognised grader and a real grade. Seller buzzwords and card names
 * such as ACE SPEC / TAG TEAM are deliberately insufficient.
 */
export function isConfirmedEbayGradedListing(input: {
  title: string;
  condition?: string | null;
  aspects?: EbayItemAspect[] | null;
}): boolean {
  if (hasNegativeGradingAspect(input.aspects)) return false;

  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  // Explicit raw wording is more specific than generic eBay aspect metadata.
  // The official Graded condition remains authoritative for non-conflicting titles.
  if (EXPLICIT_RAW_TITLE_PATTERN.test(title) || EXPLICIT_RAW_TITLE_PATTERN.test(condition)) {
    return false;
  }
  if (/^(?:graded|professionally graded)$/i.test(condition)) return true;

  let aspectSaysGraded = false;
  let aspectHasGrader = false;
  let aspectHasGrade = false;
  for (const aspect of input.aspects ?? []) {
    const { name, value } = getAspectText(aspect);
    if (!value) continue;
    if (/\bgraded\b/i.test(name) && POSITIVE_GRADED_ASPECT_VALUE.test(value)) {
      aspectSaysGraded = true;
    }
    if (/\b(?:professional grader|grader|grading company)\b/i.test(name)) {
      aspectHasGrader ||= new RegExp(String.raw`\b${GRADING_COMPANY_PATTERN}\b`, "i").test(value);
    }
    if (/\bgrade\b/i.test(name)) {
      aspectHasGrade ||= new RegExp(String.raw`\b${GRADING_VALUE_PATTERN}\b`, "i").test(value);
    }
  }
  if (aspectSaysGraded || (aspectHasGrader && aspectHasGrade)) return true;

  const combined = [title, condition].filter(Boolean).join(" ");
  const gradingCompany = String.raw`(?:${GRADING_COMPANY_PATTERN})`;
  const speculativeGradingPattern = new RegExp(
    String.raw`(?:\b${SPECULATIVE_GRADING_TERM_PATTERN}\b(?:\W+\w+){0,4}?\W+\b${gradingCompany}\b|\b${gradingCompany}\b(?:\W+\w+){0,4}?\W+\b${SPECULATIVE_GRADING_TERM_PATTERN}\b|\b(?:grade[-\s]?(?:worthy|able)|gradable|gradeworthy|should\s+grade)\b)`,
    "i"
  );
  if (speculativeGradingPattern.test(combined)) return false;
  const knownRawCardPhrase = /\b(?:ace\s+spec|tag\s+team)\b/i.test(combined);
  const companyAndGrade =
    new RegExp(
      String.raw`\b(${GRADING_COMPANY_PATTERN})\b(?:\W+\w+){0,4}?\W+${GRADING_VALUE_PATTERN}\b`,
      "i"
    ).exec(combined) ??
    new RegExp(
      String.raw`\b(${GRADING_COMPANY_PATTERN})[\s._:/#-]*${GRADING_VALUE_PATTERN}(?=$|[\s()[\]{}|,;:/\\#-])`,
      "i"
    ).exec(combined);
  if (!companyAndGrade) return false;

  const matchedCompany = companyAndGrade[1]?.replace(/[^a-z]/gi, "").toLowerCase();
  if (knownRawCardPhrase && (matchedCompany === "ace" || matchedCompany === "tag")) {
    return false;
  }
  return true;
}

export function getEbayListingGradingReason(input: {
  title: string;
  condition?: string | null;
  aspects?: EbayItemAspect[] | null;
}): string | null {
  if (hasNegativeGradingAspect(input.aspects)) return null;
  const aspectReason = getEbayListingGradingReasonFromAspects(input.aspects);
  if (aspectReason) return aspectReason;

  const title = normalizeListingFilterText(input.title);
  const condition = normalizeListingFilterText(input.condition);
  const combined = [title, condition].filter(Boolean).join(" ");
  const companyWithOptionalDots = GRADING_COMPANY_PATTERN;
  const gradeValue = GRADING_VALUE_PATTERN;

  if (
    new RegExp(
      String.raw`\b${companyWithOptionalDots}\b(?:\W+\w+){0,4}?\W+${gradeValue}\b`,
      "i"
    ).test(combined) ||
    new RegExp(
      String.raw`\b${companyWithOptionalDots}[\s._:/#-]*${gradeValue}(?=$|[\s()[\]{}|,;:/\\#-])`,
      "i"
    ).test(combined)
  ) {
    return "Title mentions a grading company and grade";
  }

  if (
    new RegExp(String.raw`\b${companyWithOptionalDots}\b`, "i").test(combined) &&
    !/\b(?:ace\s+spec|tag\s+team)\b/i.test(combined)
  ) {
    return "Title mentions a grading company";
  }

  if (/\b(graded|slabbed?|slab|graad|valutata|professionally\W+graded|certified|authenticated|encased)\b/i.test(combined)) {
    return "Title mentions graded/slab";
  }

  if (/\b(gem\W+mint|gem\W+mt|pristine\W+10|black\W+label)\b/i.test(combined)) {
    return "Title mentions GEM MINT";
  }

  if (/\b(black\W+label|pristine\W+10|beckett)\b/i.test(combined)) {
    return "Title mentions grading terminology";
  }

  return null;
}

export function buildEbayCardSearchQuery(input: EbayCardSearchInput): string {
  const gradingContext =
    input.gradingCompany && input.gradingGrade
      ? `${input.gradingCompany} ${input.gradingGrade}`
      : input.gradingCompany
        ? input.gradingCompany
        : input.gradingGrade
          ? `graded ${input.gradingGrade}`
          : "graded";
  const gradeTokens =
    input.mode === "graded"
      ? uniqueTokens([gradingContext])
      : [];
  const cardNumber = normalizeQueryToken(input.cardNumber);
  const episodeCode = normalizeQueryToken(input.episodeCode);
  const episodeName = normalizeQueryToken(input.episodeName);
  const gameLabel = input.game === "one-piece" ? "One Piece" : "Pokemon";
  const tokens = uniqueTokens([
    ...gradeTokens,
    input.name,
    cardNumber,
    episodeName,
    episodeCode,
    gameLabel,
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
    gameLabel,
  ]).join(" ");

  if (query.length <= EBAY_MAX_SEARCH_QUERY_LENGTH) {
    return query;
  }

  return query.slice(0, EBAY_MAX_SEARCH_QUERY_LENGTH).trim();
}

/**
 * Broad discovery query for one exact card inventory. Set names and codes are
 * intentionally omitted because many valid eBay titles only contain the card
 * name and full collector number. Exact identity, mode, language, condition,
 * and junk filtering are enforced after Browse discovery.
 */
export function buildEbayCardDemandSearchQuery(input: {
  name: string;
  game?: "pokemon" | "one-piece" | null;
  cardNumber?: string | null;
}): string {
  return buildEbayCardSearchQuery({
    name: input.name,
    game: input.game,
    cardNumber: input.cardNumber,
    episodeName: null,
    episodeCode: null,
    gradingCompany: null,
    gradingGrade: null,
    mode: "raw",
  });
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

export function buildEbaySealedSearchQuery(input: EbaySealedSearchInput): string {
  return buildEbaySealedProductSearchQuery(input);
}

/**
 * Demand intelligence intentionally uses the English-speaking US market. The
 * EBAY_NL trading-card taxonomy does not expose Language/Card Condition
 * refinements, while EBAY_US does. USD asks are already normalized to EUR.
 */
export function getEbayDemandRuntimeConfig(): EbayRuntimeConfig {
  const config = getEbayRuntimeConfig();
  return {
    ...config,
    marketplaceId:
      normalizeEnvValue(process.env.EBAY_DEMAND_MARKETPLACE_ID) ?? "EBAY_US",
    deliveryCountry:
      normalizeEnvValue(process.env.EBAY_DEMAND_DELIVERY_COUNTRY) ??
      "US",
  };
}

export function buildEbaySealedManualSearchQuery(value: string): string {
  return buildEbaySealedProductSearchQuery({ name: value });
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
  const cacheKey = `${config.environment}|${config.marketplaceId}|${itemId}`;
  const cached = itemDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.details;
  }
  if (cached) itemDetailsCache.delete(cacheKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EBAY_ITEM_DETAILS_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(
      `${getEbayApiBaseUrl(config.environment)}/buy/browse/v1/item/${encodeURIComponent(itemId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "X-EBAY-C-MARKETPLACE-ID": config.marketplaceId,
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );
  } catch {
    itemDetailsCache.set(cacheKey, {
      expiresAt: Date.now() + 30 * 60 * 1000,
      details: null,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    itemDetailsCache.set(cacheKey, {
      expiresAt: Date.now() + Math.min(EBAY_ITEM_DETAILS_CACHE_TTL_MS, 6 * 60 * 60 * 1000),
      details: null,
    });
    return null;
  }

  const details = (await response.json().catch(() => null)) as EbayItemDetailsResponse | null;
  itemDetailsCache.set(cacheKey, {
    expiresAt: Date.now() + EBAY_ITEM_DETAILS_CACHE_TTL_MS,
    details,
  });
  while (itemDetailsCache.size > EBAY_ITEM_DETAILS_CACHE_MAX_ENTRIES) {
    const oldestKey = itemDetailsCache.keys().next().value;
    if (!oldestKey) break;
    itemDetailsCache.delete(oldestKey);
  }
  return details;
}

async function enrichListingsWithItemDetails(input: {
  listings: EbayDealListing[];
  config: EbayRuntimeConfig;
  token: string;
  strictEnglish?: boolean;
  checkLanguageDetails?: boolean;
  requireGraded?: boolean;
  strictNearMint?: boolean;
  englishAspectFiltered?: boolean;
  nearMintAspectFiltered?: boolean;
  gradedAspectFiltered?: boolean;
  detailFetchLimit?: number;
}): Promise<EbayDealListing[]> {
  let detailFetches = 0;

  return mapWithConcurrency(input.listings, 6, async (listing) => {
    const shouldFetchDetails =
      (input.strictEnglish &&
        listing.language.code === "UNKNOWN" &&
        !input.englishAspectFiltered) ||
      (input.checkLanguageDetails && listing.language.code === "UNKNOWN") ||
      (input.requireGraded &&
        !input.gradedAspectFiltered &&
        !listing.isConfirmedGradedListing) ||
      (input.strictNearMint && !input.nearMintAspectFiltered);
    if (!shouldFetchDetails) {
      if (input.gradedAspectFiltered) {
        const language =
          listing.language.code === "UNKNOWN"
            ? {
                code: "ENG" as const,
                label: "ENG",
                confidence: "explicit" as const,
                reason: "eBay search aspect filter: Language English",
              }
            : listing.language;
        const isConfirmedGradedListing = isConfirmedEbayGradedListing({
          title: listing.title,
          condition: listing.condition,
          aspects: [{ name: "Graded", value: "Yes" }],
        });
        return {
          ...listing,
          language,
          gradingReason: isConfirmedGradedListing
            ? listing.gradingReason ?? "eBay search aspect filter: Graded Yes"
            : listing.gradingReason,
          isGradedListing: listing.isGradedListing || isConfirmedGradedListing,
          isConfirmedGradedListing,
        };
      }
      if (
        input.strictNearMint &&
        input.englishAspectFiltered &&
        input.nearMintAspectFiltered
      ) {
        const filteredCondition: EbayListingCardCondition = {
          code: "near_mint",
          label: "NM",
          rank: 6,
          confidence: "explicit",
          reason: "eBay search aspect filter: Card Condition Near Mint or Better",
        };
        const cardCondition = moreConservativeCardCondition(
          listing.cardCondition,
          filteredCondition
        );
        const language =
          listing.language.code === "UNKNOWN"
            ? {
                code: "ENG" as const,
                label: "ENG",
                confidence: "explicit" as const,
                reason: "eBay search aspect filter: Language English",
              }
            : listing.language;
        return {
          ...listing,
          language,
          cardCondition,
          demandVerification: {
            english: language.code === "ENG",
            nearMint: cardCondition.code === "near_mint",
            source: "ebay_search_filter" as const,
          },
        };
      }
      return listing;
    }
    if (input.detailFetchLimit != null && detailFetches >= input.detailFetchLimit) {
      return listing;
    }

    detailFetches += 1;

    const detail = await getEbayItemDetails(input.config, input.token, listing.itemId);
    const aspects = detail?.localizedAspects ?? null;
    const aspectLanguage = detectEbayListingLanguageFromAspects(aspects);
    const englishVerified = Boolean(
      aspectLanguage?.code === "ENG" ||
      (input.englishAspectFiltered &&
        (listing.language.code === "ENG" || listing.language.code === "UNKNOWN"))
    );
    const language =
      listing.language.code !== "UNKNOWN"
        ? listing.language
        : aspectLanguage ??
          (englishVerified
            ? {
                code: "ENG" as const,
                label: "ENG",
                confidence: "explicit" as const,
                reason: "eBay search aspect filter: Language English",
              }
            : listing.language);
    const descriptorCondition = detectEbayListingCardConditionFromDescriptors(
      detail?.conditionDescriptors
    );
    const verifiedCondition =
      descriptorCondition ?? detectEbayListingCardConditionFromAspects(aspects);
    const cardCondition = moreConservativeCardCondition(
      listing.cardCondition,
      verifiedCondition
    );
    const gradingReason =
      getEbayListingGradingReason({
        title: listing.title,
        condition: listing.condition,
        aspects,
      }) ?? listing.gradingReason;
    const isConfirmedGradedListing = isConfirmedEbayGradedListing({
      title: listing.title,
      condition: listing.condition,
      aspects,
    });

    return {
      ...listing,
      language,
      cardCondition,
      gradingReason,
      isGradedListing: Boolean(gradingReason),
      isConfirmedGradedListing,
      demandVerification: input.strictNearMint
        ? {
            english: englishVerified,
            nearMint: verifiedCondition?.code === "near_mint",
            source: "ebay_item" as const,
          }
        : listing.demandVerification,
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

function buildEbaySearchFilters(
  config: EbayRuntimeConfig,
  buyingMode: EbayBuyingMode,
  strictNearMint = false
): string[] {
  const filters: string[] = [];
  if (config.deliveryCountry) {
    filters.push(`deliveryCountry:${config.deliveryCountry}`);
  }

  if (buyingMode === "fixed") {
    filters.push("buyingOptions:{FIXED_PRICE}");
  } else if (buyingMode === "auction") {
    filters.push("buyingOptions:{AUCTION}");
  } else if (buyingMode === "all") {
    filters.push("buyingOptions:{FIXED_PRICE|AUCTION}");
  }

  // For trading cards 4000 means "Ungraded". Near Mint itself is verified
  // from getItem.conditionDescriptors after this coarse server-side filter.
  if (strictNearMint) {
    filters.push("conditionIds:{4000}");
  }

  return filters;
}

function matchesEbayBuyingMode(
  listing: EbayDealListing,
  buyingMode: EbayBuyingMode
): boolean {
  if (buyingMode === "all") return true;
  const options = new Set(listing.buyingOptions.map((option) => option.toUpperCase()));
  if (buyingMode === "auction") return options.has("AUCTION");
  return (
    !options.has("AUCTION") &&
    (options.has("FIXED_PRICE") || options.has("BEST_OFFER"))
  );
}

function buildStrictEnglishNearMintAspectFilter(config: EbayRuntimeConfig): string | null {
  if (!config.categoryId) return null;

  if (config.marketplaceId === "EBAY_US" || config.marketplaceId === "EBAY_GB") {
    return `categoryId:${config.categoryId},Language:{English},Card Condition:{Near Mint or Better},Graded:{No}`;
  }

  if (config.marketplaceId === "EBAY_DE") {
    return `categoryId:${config.categoryId},Sprache:{Englisch},Kartenzustand:{Nahezu neuwertig oder besser (Near Mint or Better)},Bewertet:{Nein}`;
  }

  return null;
}

function buildStrictEnglishGradedAspectFilter(config: EbayRuntimeConfig): string | null {
  if (!config.categoryId) return null;

  if (config.marketplaceId === "EBAY_US" || config.marketplaceId === "EBAY_GB") {
    return `categoryId:${config.categoryId},Language:{English},Graded:{Yes}`;
  }

  if (config.marketplaceId === "EBAY_DE") {
    return `categoryId:${config.categoryId},Sprache:{Englisch},Bewertet:{Ja}`;
  }

  return null;
}

function cloneEbayDealSearchResult(result: EbayDealSearchResult): EbayDealSearchResult {
  return {
    ...result,
    listings: result.listings.map((listing) => ({
      ...listing,
      cardCondition: { ...listing.cardCondition },
      language: { ...listing.language },
      buyingOptions: [...listing.buyingOptions],
      price: { ...listing.price },
      shipping: { ...listing.shipping },
      total: { ...listing.total },
      seller: { ...listing.seller },
      demandVerification: listing.demandVerification
        ? { ...listing.demandVerification }
        : undefined,
    })),
  };
}

function getSearchCacheKey(input: {
  buyingMode: EbayBuyingMode;
  config: EbayRuntimeConfig;
  excludeGraded?: boolean;
  limit: number;
  query: string;
  reference: EbayDealReference;
  requireGraded?: boolean;
  strictEnglish?: boolean;
  strictNearMint?: boolean;
  listingKind?: "card" | "graded" | "sealed";
}): string {
  return JSON.stringify({
    buyingMode: input.buyingMode,
    categoryId: input.config.categoryId,
    deliveryCountry: input.config.deliveryCountry,
    environment: input.config.environment,
    excludeGraded: Boolean(input.excludeGraded),
    limit: input.limit,
    listingKind: input.listingKind ?? "card",
    marketplaceId: input.config.marketplaceId,
    query: input.query,
    referenceSource: input.reference.source,
    referenceValueEur: input.reference.valueEur,
    requireGraded: Boolean(input.requireGraded),
    strictEnglish: Boolean(input.strictEnglish),
    strictNearMint: Boolean(input.strictNearMint),
  });
}

function getCachedSearchResult(cacheKey: string): EbayDealSearchResult | null {
  const cached = searchCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    searchCache.delete(cacheKey);
    return null;
  }

  return cloneEbayDealSearchResult(cached.result);
}

function setCachedSearchResult(cacheKey: string, result: EbayDealSearchResult): void {
  searchCache.set(cacheKey, {
    expiresAt: Date.now() + EBAY_SEARCH_CACHE_TTL_MS,
    result: cloneEbayDealSearchResult(result),
  });

  while (searchCache.size > EBAY_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (!oldestKey) break;
    searchCache.delete(oldestKey);
  }
}

function cloneEbayRateLimitStatus(status: EbayRateLimitStatus): EbayRateLimitStatus {
  return {
    ...status,
    resources: status.resources.map((resource) => ({
      ...resource,
      rates: resource.rates.map((rate) => ({ ...rate })),
    })),
    summary: status.summary ? { ...status.summary } : null,
  };
}

function getRateLimitCacheKey(config: EbayRuntimeConfig): string {
  return [
    config.environment,
    config.marketplaceId,
    config.clientId ?? "",
    config.clientSecret ? "secret" : "",
    "buy",
    "browse",
  ].join("|");
}

function getCachedRateLimitStatus(cacheKey: string): EbayRateLimitStatus | null {
  const cached = rateLimitCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    rateLimitCache.delete(cacheKey);
    return null;
  }

  return cloneEbayRateLimitStatus(cached.status);
}

function setCachedRateLimitStatus(cacheKey: string, status: EbayRateLimitStatus): void {
  rateLimitCache.set(cacheKey, {
    expiresAt: Date.now() + EBAY_RATE_LIMIT_CACHE_TTL_MS,
    status: cloneEbayRateLimitStatus(status),
  });
}

function pickEbayRateLimitSummary(input: {
  apiContext: string;
  apiName: string;
  resources: EbayRateLimitResource[];
}): EbayRateLimitSummary | null {
  const resource =
    input.resources.find((candidate) =>
      /\b(search|item_summary|browse|buy\.browse)\b/i.test(candidate.name)
    ) ?? input.resources.find((candidate) => candidate.rates.length > 0);
  if (!resource) return null;

  const rate =
    resource.rates.find((candidate) => candidate.timeWindow === 86400) ?? resource.rates[0];
  if (!rate) return null;

  return {
    ...rate,
    apiContext: input.apiContext,
    apiName: input.apiName,
    resourceName: resource.name,
  };
}

function buildEbayBrowseQuotaMessage(reset: string | null | undefined): string {
  if (!reset) {
    return "eBay Browse API limit reached. Try again after the eBay daily reset, or use the eBay link for this search.";
  }

  const resetDate = new Date(reset);
  if (Number.isNaN(resetDate.getTime())) {
    return "eBay Browse API limit reached. Try again after the eBay daily reset, or use the eBay link for this search.";
  }

  return `eBay Browse API limit reached. Daily reset: ${resetDate.toLocaleString("nl-NL", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Amsterdam",
  })}. Use the eBay link for this search until then.`;
}

function rememberEbayBrowseQuotaBackoff(reset: string | null | undefined): string {
  const resetTime = reset ? Date.parse(reset) : Number.NaN;
  const expiresAt =
    Number.isFinite(resetTime) && resetTime > Date.now()
      ? resetTime
      : Date.now() + EBAY_BROWSE_QUOTA_BACKOFF_FALLBACK_MS;
  const message = buildEbayBrowseQuotaMessage(reset);
  browseQuotaBackoff = { expiresAt, message };
  return message;
}

function getEbayBrowseQuotaBackoffMessage(): string | null {
  if (!browseQuotaBackoff) return null;
  if (browseQuotaBackoff.expiresAt <= Date.now()) {
    browseQuotaBackoff = null;
    return null;
  }

  return browseQuotaBackoff.message;
}

async function assertEbayBrowseQuotaAvailable(
  config: EbayRuntimeConfig,
  requiredCalls = 1
): Promise<void> {
  const backoffMessage = getEbayBrowseQuotaBackoffMessage();
  if (backoffMessage) {
    throw new Error(backoffMessage);
  }

  try {
    const status = await getEbayBrowseRateLimitStatus(config);
    const remaining = status.summary?.remaining;
    if (remaining != null && remaining < Math.max(1, requiredCalls)) {
      throw new Error(rememberEbayBrowseQuotaBackoff(status.summary?.reset));
    }
    if (status.summary && remaining != null && requiredCalls > 0) {
      const reserved = Math.min(remaining, Math.max(1, requiredCalls));
      setCachedRateLimitStatus(getRateLimitCacheKey(config), {
        ...status,
        summary: {
          ...status.summary,
          remaining: Math.max(0, remaining - reserved),
          count:
            status.summary.count == null
              ? null
              : status.summary.count + reserved,
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/eBay Browse API limit reached/i.test(message)) {
      throw error;
    }

    console.warn("eBay rate limit preflight failed", error);
  }
}

export async function getEbayBrowseRateLimitStatus(
  config = getEbayRuntimeConfig()
): Promise<EbayRateLimitStatus> {
  const emptyStatus: EbayRateLimitStatus = {
    configured: config.configured,
    apiContext: "buy",
    apiName: "browse",
    marketplaceId: config.marketplaceId,
    resources: [],
    summary: null,
    refreshedAt: new Date().toISOString(),
  };

  if (!config.configured) return emptyStatus;

  const cacheKey = getRateLimitCacheKey(config);
  const cached = getCachedRateLimitStatus(cacheKey);
  if (cached) return cached;

  const token = await getEbayApplicationToken(config);
  const url = new URL(`${getEbayApiBaseUrl(config.environment)}/developer/analytics/v1_beta/rate_limit/`);
  url.searchParams.set("api_context", "buy");
  url.searchParams.set("api_name", "browse");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    setCachedRateLimitStatus(cacheKey, emptyStatus);
    return emptyStatus;
  }

  const data = (await response.json().catch(() => ({}))) as EbayAnalyticsRateLimitsResponse & {
    errors?: Array<{ message?: string; longMessage?: string }>;
  };

  if (!response.ok) {
    const message =
      data.errors?.[0]?.longMessage ??
      data.errors?.[0]?.message ??
      `eBay rate limit lookup failed with ${response.status}`;
    throw new Error(message);
  }

  const rateLimit =
    data.rateLimits?.find(
      (candidate) =>
        candidate.apiContext?.toLowerCase() === "buy" &&
        candidate.apiName?.toLowerCase() === "browse"
    ) ?? data.rateLimits?.[0];
  const resources =
    rateLimit?.resources?.map((resource) => ({
      name: resource.name?.trim() || "browse",
      rates:
        resource.rates?.map((rate) => ({
          count: toNullableInteger(rate.count),
          limit: toNullableInteger(rate.limit),
          remaining: toNullableInteger(rate.remaining),
          reset: rate.reset?.trim() || null,
          timeWindow: toNullableInteger(rate.timeWindow),
        })) ?? [],
    })) ?? [];
  const apiContext = rateLimit?.apiContext?.toLowerCase() || "buy";
  const apiName = rateLimit?.apiName?.toLowerCase() || "browse";
  const status: EbayRateLimitStatus = {
    configured: true,
    apiContext,
    apiName,
    marketplaceId: config.marketplaceId,
    resources,
    summary: pickEbayRateLimitSummary({
      apiContext,
      apiName,
      resources,
    }),
    refreshedAt: new Date().toISOString(),
  };

  setCachedRateLimitStatus(cacheKey, status);
  return cloneEbayRateLimitStatus(status);
}

function buildListing(
  item: EbaySearchItemSummary,
  reference: EbayDealReference,
  usdToEurRate: CurrencyExchangeRate | null
): EbayDealListing | null {
  const price = getListingAmount(item);
  // Browse item IDs contain structural separators such as `v1|...|0`.
  // They must stay byte-for-byte intact for the getItem endpoint and stable
  // lifecycle tracking; query normalization would turn the pipes into spaces.
  const itemId = item.itemId?.trim();
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
  const isConfirmedGradedListing = isConfirmedEbayGradedListing({
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
    isConfirmedGradedListing,
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

function needsFollowUpSearchPage(input: {
  filteredListings: EbayDealListing[];
  fetchedListings: number;
  requestedLimit: number;
  totalAvailable: number | null;
}): boolean {
  if (input.filteredListings.length >= input.requestedLimit) {
    return false;
  }

  if (input.fetchedListings >= EBAY_MAX_FETCHED_LISTINGS) {
    return false;
  }

  if (input.totalAvailable != null && input.fetchedListings >= input.totalAvailable) {
    return false;
  }

  return true;
}

export async function searchEbayDeals(input: {
  query: string;
  reference: EbayDealReference;
  limit?: number;
  buyingMode?: EbayBuyingMode;
  config?: EbayRuntimeConfig;
  strictEnglish?: boolean;
  strictNearMint?: boolean;
  excludeGraded?: boolean;
  requireGraded?: boolean;
  listingKind?: "card" | "graded" | "sealed";
}): Promise<EbayDealSearchResult> {
  const config = input.config ?? getEbayRuntimeConfig();
  const query = input.query.trim();
  const buyingMode = input.buyingMode ?? "fixed";
  const strictGradedAspectFilter =
    input.strictEnglish && input.requireGraded
      ? buildStrictEnglishGradedAspectFilter(config)
      : null;
  const strictDemandScan = Boolean(input.strictNearMint || strictGradedAspectFilter);
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

  // A strict demand scan returns every verified listing from its bounded
  // inventory window. The API route can still render a smaller preview, while
  // persistence receives the complete cohort needed for lifecycle tracking.
  const requestedLimit = strictDemandScan
    ? EBAY_DEMAND_MAX_FETCHED_LISTINGS
    : Math.min(Math.max(input.limit ?? 24, 1), 50);
  const cacheKey = getSearchCacheKey({
    buyingMode,
    config,
    excludeGraded: input.excludeGraded,
    limit: requestedLimit,
    query,
    reference: input.reference,
    requireGraded: input.requireGraded,
    strictEnglish: input.strictEnglish,
    strictNearMint: input.strictNearMint,
    listingKind: input.listingKind,
  });
  const cachedResult = getCachedSearchResult(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const token = await getEbayApplicationToken(config);
  const baseUrl = new URL(`${getEbayApiBaseUrl(config.environment)}/buy/browse/v1/item_summary/search`);
  baseUrl.searchParams.set("q", query);
  if (config.categoryId) {
    baseUrl.searchParams.set("category_ids", config.categoryId);
  }

  const filters = buildEbaySearchFilters(config, buyingMode, input.strictNearMint);
  if (filters.length > 0) {
    baseUrl.searchParams.set("filter", filters.join(","));
  }
  const strictNearMintAspectFilter =
    input.strictEnglish && input.strictNearMint
      ? buildStrictEnglishNearMintAspectFilter(config)
      : null;
  const strictAspectFilter = strictNearMintAspectFilter ?? strictGradedAspectFilter;
  if (strictAspectFilter) {
    baseUrl.searchParams.set("aspect_filter", strictAspectFilter);
  }
  const reservedBrowseCalls = strictDemandScan
    ? strictAspectFilter
      ? Math.ceil(EBAY_DEMAND_MAX_FETCHED_LISTINGS / EBAY_DEMAND_SEARCH_PAGE_SIZE)
      : Math.ceil(EBAY_ITEM_DETAILS_ENRICHMENT_LIMIT / EBAY_DEMAND_SEARCH_PAGE_SIZE) +
        EBAY_ITEM_DETAILS_ENRICHMENT_LIMIT
    : 1;
  await assertEbayBrowseQuotaAvailable(config, reservedBrowseCalls);

  const fetchedItems = new Map<string, EbaySearchItemSummary>();
  let totalAvailable: number | null = null;
  let paginationUnstable = false;
  let verificationIncomplete = false;
  let offset = 0;
  let listings: EbayDealListing[] = [];

  const maximumFetchedListings = strictDemandScan
    ? strictAspectFilter
      ? EBAY_DEMAND_MAX_FETCHED_LISTINGS
      : EBAY_ITEM_DETAILS_ENRICHMENT_LIMIT
    : EBAY_MAX_FETCHED_LISTINGS;
  while (offset < maximumFetchedListings) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EBAY_SEARCH_TIMEOUT_MS);

    try {
      const pageUrl = new URL(baseUrl);
      const pageSize = strictDemandScan
        ? EBAY_DEMAND_SEARCH_PAGE_SIZE
        : EBAY_SEARCH_PAGE_SIZE;
      const pageLimit = Math.min(pageSize, maximumFetchedListings - offset);
      pageUrl.searchParams.set("limit", String(pageLimit));
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
        if (/limit|rate/i.test(message) || response.status === 429) {
          throw new Error(rememberEbayBrowseQuotaBackoff(null));
        }
        throw new Error(message);
      }

      if (data.total != null) {
        if (totalAvailable != null && data.total !== totalAvailable) {
          paginationUnstable = true;
        }
        totalAvailable = Math.max(totalAvailable ?? 0, data.total);
      }
      const pageItems = data.itemSummaries ?? [];
      for (const [index, item] of pageItems.entries()) {
        const key =
          normalizeQueryToken(item.itemId) ||
          `${normalizeQueryToken(item.title)}-${offset + index}`;
        if (!key) continue;
        if (fetchedItems.has(key)) {
          paginationUnstable = true;
          continue;
        }
        fetchedItems.set(key, item);
      }

      const uniqueItemSummaries = [...fetchedItems.values()];
      const needsUsdRate = uniqueItemSummaries.some((item) => {
        const price = getListingAmount(item);
        const shipping = getShippingAmount(item);
        return (
          price?.currency.toUpperCase() === "USD" ||
          shipping?.currency.toUpperCase() === "USD"
        );
      });
      const usdToEurRate = needsUsdRate ? await getUsdToEurRate() : null;
      listings = uniqueItemSummaries
        .map((item) => buildListing(item, input.reference, usdToEurRate))
        .filter((listing): listing is EbayDealListing => Boolean(listing))
        .filter(
          (listing) =>
            !getEbayListingRejectionReason({ ...listing, listingKind: input.listingKind })
        );

      const preliminaryModeMatches = listings
        .filter((listing) => matchesEbayBuyingMode(listing, buyingMode))
        .filter((listing) => !input.excludeGraded || !listing.isGradedListing)
        .filter((listing) => !input.requireGraded || listing.isConfirmedGradedListing === true);

      if (strictDemandScan) {
        const completeInventory =
          totalAvailable != null && fetchedItems.size >= totalAvailable;
        if (
          completeInventory ||
          fetchedItems.size >= maximumFetchedListings ||
          pageItems.length < pageLimit
        ) {
          break;
        }
        offset += pageLimit;
        continue;
      }

      if (
        !needsFollowUpSearchPage({
          filteredListings: preliminaryModeMatches,
          fetchedListings: fetchedItems.size,
          requestedLimit,
          totalAvailable,
        })
      ) {
        break;
      }

      if (pageItems.length < pageLimit) {
        break;
      }

      offset += pageLimit;
    } finally {
      clearTimeout(timeout);
    }
  }

  const shouldCheckLanguageDetails = input.listingKind === "sealed";

  if (
    input.strictEnglish ||
    input.strictNearMint ||
    input.requireGraded ||
    shouldCheckLanguageDetails
  ) {
    listings = await enrichListingsWithItemDetails({
      listings,
      config,
      token,
      strictEnglish: input.strictEnglish,
      strictNearMint: input.strictNearMint,
      englishAspectFiltered: Boolean(strictAspectFilter),
      nearMintAspectFiltered: Boolean(strictNearMintAspectFilter),
      gradedAspectFiltered: Boolean(strictGradedAspectFilter),
      checkLanguageDetails: shouldCheckLanguageDetails,
      requireGraded: input.requireGraded,
      detailFetchLimit: EBAY_ITEM_DETAILS_ENRICHMENT_LIMIT,
    });
    verificationIncomplete = Boolean(
      input.strictNearMint &&
        !strictAspectFilter &&
        listings.some((listing) => listing.demandVerification == null)
    );
  }

  listings = listings
    .filter((listing) => !getEbayListingRejectionReason({ ...listing, listingKind: input.listingKind }))
    .filter((listing) => matchesEbayBuyingMode(listing, buyingMode))
    .filter((listing) => !input.strictEnglish || listing.language.code === "ENG")
    .filter(
      (listing) =>
        !input.strictNearMint ||
        (listing.cardCondition.code === "near_mint" &&
          listing.demandVerification?.english === true &&
          listing.demandVerification.nearMint === true)
    )
    .filter((listing) => !input.excludeGraded || !listing.isGradedListing)
    .filter((listing) => !input.requireGraded || listing.isConfirmedGradedListing === true)
    .sort(sortListings)
    .slice(0, requestedLimit);

  const result = {
    query,
    marketplaceId: config.marketplaceId,
    deliveryCountry: config.deliveryCountry,
    buyingMode,
    total: listings.length,
    listings,
    directSearchUrl,
    scan: {
      fetchedCount: fetchedItems.size,
      availableTotal: totalAvailable,
      capped:
        paginationUnstable ||
        verificationIncomplete ||
        (totalAvailable != null
          ? fetchedItems.size < totalAvailable
          : Boolean(
              strictDemandScan &&
                fetchedItems.size >= maximumFetchedListings
            )),
    },
  };
  setCachedSearchResult(cacheKey, result);
  return cloneEbayDealSearchResult(result);
}

export function isSupportedDealCurrency(currency: string): currency is CurrencyCode {
  return currency === "EUR" || currency === "USD";
}

export function __resetEbayTokenCacheForTests() {
  tokenCache = null;
  browseQuotaBackoff = null;
  searchCache.clear();
  itemDetailsCache.clear();
  rateLimitCache.clear();
}
