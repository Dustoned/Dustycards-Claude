import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  getFirecrawlConfigSnapshot,
  getFirecrawlProviderCreditUsage,
  toFirecrawlApiError,
  type FirecrawlPageScrapeResult,
  type FirecrawlWebSearchResponse,
} from "@/lib/firecrawl";
import { getFirecrawlMonthWindow } from "@/lib/firecrawl-budget";
import {
  getGameLabel,
  normalizeTradingCardGame,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  scopeGameId,
  type TradingCardGame,
} from "@/lib/games";
import {
  firecrawlCreditsUsed,
  scrapePageWithFallback,
  searchWebWithFallback,
  type ProviderPageScrapeResult,
  type ProviderWebSearchResponse,
} from "@/lib/scrape-provider";
import { getScrapeDoConfigSnapshot } from "@/lib/scrapedo";
import { syncMissingBinderWantsAfterCollectionChange } from "@/lib/wantlist-planner";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const USER_DAILY_ATTEMPT_LIMIT = 0;
const CARDMARKET_DOMAIN = "cardmarket.com";
const CARDMARKET_VARIANT_SEARCH_LIMIT = 10;
const CARDMARKET_VARIANT_IMAGE_HYDRATION_LIMIT = 12;
const SUBMITTED_SOURCE_STATUS = "firecrawl-submitted";
const UNKNOWN_SET_LABEL = "Set unknown";
const DEFAULT_SUBMISSION_CONDITION = "Near Mint";
const SUBMISSION_CONDITIONS = [
  "Mint",
  "Near Mint",
  "Excellent",
  "Good",
  "Light Played",
  "Played",
  "Poor",
] as const;

type SubmissionLanguage = "English" | "Japanese";
type CardMarketVariantLanguageGroup = "english" | "non_english";
type CardMarketVariantSource = "versions" | "search_fallback";
type SubmissionStatus =
  | "preview"
  | "duplicate"
  | "failed"
  | "added"
  | "deleted"
  | "migrated_to_tcggo"
  | "possible_tcggo_match"
  | "variant_select";

type SubmissionRecord = Awaited<ReturnType<typeof db.cardSubmission.findFirst>>;

interface SubmittedGradedPrice {
  label: string;
  price: number;
}

export class CardSubmissionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CardSubmissionError";
    this.status = status;
  }
}

export interface CardSubmissionInput {
  game?: unknown;
  name?: unknown;
  setName?: unknown;
  cardNumber?: unknown;
  cardmarketUrl?: unknown;
  condition?: unknown;
  skipDuplicateCheck?: unknown;
}

export interface CardSubmissionPreview {
  id: string;
  status: SubmissionStatus;
  game: TradingCardGame;
  canSave: boolean;
  duplicateCard: DuplicateCardPreview | null;
  duplicateCards: DuplicateCardPreview[];
  cardmarketMatches: CardMarketVariantPreview[];
  canForceFirecrawl: boolean;
  card: {
    name: string;
    setName: string;
    cardNumber: string | null;
    cardmarketUrl: string | null;
    imageUrl: string | null;
    language: SubmissionLanguage | null;
    condition: string;
    nmPriceEur: number | null;
    gradedPrices: SubmittedGradedPrice[];
    confidence: number | null;
  };
  firecrawl: {
    usedSearch: boolean;
    usedScrape: boolean;
    creditsUsed: number;
    monthlyBudget: number;
    monthlyUsed: number;
    dailyAttemptsUsed: number;
  };
  warnings: string[];
  error: string | null;
}

export interface DuplicateCardPreview {
  id: string;
  game: TradingCardGame;
  name: string;
  episodeId: string;
  episodeName: string;
  cardNumber: string | null;
  imageUrl: string | null;
}

export interface CardMarketVariantPreview {
  key: string;
  name: string;
  setName: string;
  cardNumber: string | null;
  cardmarketUrl: string | null;
  cardmarketId: string | null;
  imageUrl: string | null;
  languageGroup: CardMarketVariantLanguageGroup;
  source: CardMarketVariantSource;
  existingCard: DuplicateCardPreview | null;
}

export interface AdminCardSubmissionItem extends CardSubmissionPreview {
  createdAt: string;
  updatedAt: string;
  migratedAt: string | null;
  officialCardId: string | null;
}

export interface SubmittedCardAutoRefreshResult {
  candidateSubmissions: number;
  selectedSubmissions: number;
  refreshedSubmissions: number;
  failedSubmissions: number;
}

export interface UserSubmittedCardItem {
  id: string;
  game: TradingCardGame;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  card: {
    id: string;
    name: string;
    setName: string;
    episodeId: string;
    episodeCode: string | null;
    cardNumber: string | null;
    imageUrl: string | null;
    cardmarketUrl: string | null;
    language: SubmissionLanguage | null;
    condition: string;
    priceEur: number | null;
    gradedPrices: SubmittedGradedPrice[];
  };
}

export interface CardSubmissionFirecrawlUsage {
  configured: boolean;
  monthlyBudget: number;
  monthlyOffset: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyAttemptLimit: number;
  dailyAttemptsUsed: number;
  providerAuthoritative: boolean;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

interface NormalizedSubmissionInput {
  game: TradingCardGame;
  name: string;
  setName: string;
  cardNumber: string | null;
  cardmarketUrl: string | null;
  condition: string;
  skipDuplicateCheck: boolean;
  normalizedKey: string;
}

interface DuplicateCardResult {
  cards: DuplicateCardPreview[];
  exactCardmarketUrl: boolean;
  cardmarketRefs: CardMarketRefSet;
}

interface CardMarketRefSet {
  urls: Set<string>;
  productIds: Set<string>;
}

interface ParsedCardMarketPage {
  title: string | null;
  sourceUrl: string;
  name: string | null;
  setName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  language: SubmissionLanguage | null;
  condition: string;
  nmPriceEur: number | null;
  gradedPrices: SubmittedGradedPrice[];
  warnings: string[];
  confidence: number;
}

interface OfficialReconciliationCard {
  id: string;
  name: string;
  card_number: string | null;
  printed_card_number?: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function normalizeSubmissionCondition(value: unknown): string {
  const normalized = normalizeSubmissionText(asString(value));
  if (!normalized) return DEFAULT_SUBMISSION_CONDITION;

  const match = SUBMISSION_CONDITIONS.find(
    (condition) => normalizeSubmissionText(condition) === normalized
  );
  if (match) return match;

  const aliases: Record<string, string> = {
    m: "Mint",
    mt: "Mint",
    nm: "Near Mint",
    ex: "Excellent",
    excellent: "Excellent",
    gd: "Good",
    good: "Good",
    lp: "Light Played",
    "light played": "Light Played",
    pl: "Played",
    played: "Played",
    p: "Poor",
    poor: "Poor",
  };

  return aliases[normalized] ?? DEFAULT_SUBMISSION_CONDITION;
}

function isNearMintCondition(condition: string | null | undefined): boolean {
  return normalizeSubmissionCondition(condition) === DEFAULT_SUBMISSION_CONDITION;
}

export function normalizeSubmissionText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCardNumber(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^0+(?=\d)/, "");
}

function compactCardNumber(value: string | null | undefined): string {
  return normalizeCardNumber(value).replace(/[^A-Z0-9]/g, "");
}

function baseCardNumber(value: string | null | undefined): string {
  return normalizeCardNumber(value).split("#")[0]?.split("/")[0] ?? "";
}

function makeCardNumberAliases(value: string | null): string[] {
  const raw = value?.trim();
  if (!raw) return [];

  const normalized = normalizeCardNumber(raw);
  const compact = compactCardNumber(raw);
  const beforeSlash = normalizeCardNumber(raw.split("/")[0] ?? raw);
  const beforeVariant = baseCardNumber(raw);
  const aliases = new Set([raw, normalized, compact, beforeSlash, beforeVariant]);

  if (/^\d+$/.test(beforeSlash)) {
    aliases.add(String(Number(beforeSlash)));
    aliases.add(beforeSlash.padStart(3, "0"));
  }

  return [...aliases].filter(Boolean);
}

export function cardNumberMatchesSubmittedBase(
  submitted: string | null | undefined,
  candidate: string | null | undefined
): boolean {
  const submittedExact = normalizeCardNumber(submitted);
  const submittedCompact = compactCardNumber(submitted);
  const submittedBase = baseCardNumber(submitted);
  const candidateExact = normalizeCardNumber(candidate);
  const candidateCompact = compactCardNumber(candidate);
  const candidateBase = baseCardNumber(candidate);

  return Boolean(
    submittedExact &&
      (candidateExact === submittedExact ||
        candidateCompact === submittedCompact ||
        candidateBase === submittedBase)
  );
}

function slugify(value: string): string {
  return normalizeSubmissionText(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "card";
}

function slugifyCardMarketCardName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[.'’"`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDisplaySetName(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || UNKNOWN_SET_LABEL;
}

function getSubmittedEpisodeName(
  value: string | null | undefined,
  game: TradingCardGame,
  cardNumber?: string | null
): string {
  const trimmed = (value ?? "").trim();
  if (trimmed) return trimmed;
  const prefix = cardNumber?.match(/^[A-Z]{2,4}\d{1,3}/i)?.[0]?.toUpperCase();
  return prefix ? `Submitted ${getGameLabel(game)} ${prefix}` : `Submitted ${getGameLabel(game)} Cards`;
}

function inferSetNameFromCardMarketUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return extractCardMarketPathParts(url).setName;
}

function inferCardNumberFromCardMarketUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return extractCardNumberFromText(decodeURIComponent(url));
}

function shortHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

function serializeJson(value: unknown, maxLength = 12000): string | null {
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return null;
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeSubmittedGradedPrice(value: unknown): SubmittedGradedPrice | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as { label?: unknown; price?: unknown };
  const label = asString(entry.label).replace(/\s+/g, " ").trim().toUpperCase();
  const price =
    typeof entry.price === "number"
      ? entry.price
      : typeof entry.price === "string"
        ? Number(entry.price)
        : null;

  if (!label || price == null || !Number.isFinite(price) || price <= 0) return null;
  return { label, price };
}

function dedupeSubmittedGradedPrices(rows: SubmittedGradedPrice[]): SubmittedGradedPrice[] {
  const deduped = new Map<string, SubmittedGradedPrice>();

  for (const row of rows) {
    const normalized = normalizeSubmittedGradedPrice(row);
    if (!normalized) continue;

    const existing = deduped.get(normalized.label);
    if (!existing || normalized.price < existing.price) {
      deduped.set(normalized.label, normalized);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const [companyA, gradeA] = a.label.split(/\s+/, 2);
    const [companyB, gradeB] = b.label.split(/\s+/, 2);
    const companyCompare = (companyA ?? "").localeCompare(companyB ?? "");
    if (companyCompare !== 0) return companyCompare;

    const numericA = Number(gradeA);
    const numericB = Number(gradeB);
    if (Number.isFinite(numericA) && Number.isFinite(numericB) && numericA !== numericB) {
      return numericB - numericA;
    }

    return b.price - a.price || a.label.localeCompare(b.label);
  });
}

function parseStoredGradedPrices(value: string | null | undefined): SubmittedGradedPrice[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return [];
    const gradedPrices = (parsed as { gradedPrices?: unknown }).gradedPrices;
    if (!Array.isArray(gradedPrices)) return [];
    return dedupeSubmittedGradedPrices(
      gradedPrices
        .map(normalizeSubmittedGradedPrice)
        .filter((entry): entry is SubmittedGradedPrice => Boolean(entry))
    );
  } catch {
    return [];
  }
}

function storedScrapeHasGradedPriceParse(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { gradedPrices?: unknown }).gradedPrices)
    );
  } catch {
    return false;
  }
}

function normalizeCardMarketUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.toLowerCase().includes(CARDMARKET_DOMAIN)) return null;
    const productId = url.searchParams.get("idProduct");
    url.hash = "";
    url.search = "";
    if (productId) url.searchParams.set("idProduct", productId);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getCardMarketUrlGame(url: string | null | undefined): TradingCardGame | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    const gameSegment = (segments[start] ?? "").toLowerCase();
    if (gameSegment === "pokemon") return POKEMON_GAME;
    if (gameSegment === "onepiece") return ONE_PIECE_GAME;
    return null;
  } catch {
    return null;
  }
}

function extractCardMarketProductId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("idProduct");
  } catch {
    return null;
  }
}

function createEmptyCardMarketRefs(): CardMarketRefSet {
  return { urls: new Set<string>(), productIds: new Set<string>() };
}

function addCardMarketRef(
  refs: CardMarketRefSet,
  rawUrl: string | null | undefined,
  rawProductId?: string | null
) {
  const normalizedUrl = normalizeCardMarketUrl(rawUrl ?? null);
  if (normalizedUrl) refs.urls.add(normalizedUrl);

  const productId = rawProductId?.trim() || extractCardMarketProductId(normalizedUrl ?? rawUrl);
  if (productId) refs.productIds.add(productId);
}

function cardMarketRefMatches(
  refs: CardMarketRefSet,
  rawUrl: string | null | undefined,
  rawProductId?: string | null
): boolean {
  const normalizedUrl = normalizeCardMarketUrl(rawUrl ?? null);
  if (normalizedUrl && refs.urls.has(normalizedUrl)) return true;

  const productId = rawProductId?.trim() || extractCardMarketProductId(normalizedUrl ?? rawUrl);
  return Boolean(productId && refs.productIds.has(productId));
}

function getCardMarketSearchSite(game: TradingCardGame): string {
  return game === ONE_PIECE_GAME
    ? "site:cardmarket.com/en/OnePiece/Products/Singles"
    : "site:cardmarket.com/en/Pokemon/Products/Singles";
}

function getCardMarketCardsSite(game: TradingCardGame): string {
  return game === ONE_PIECE_GAME
    ? "site:cardmarket.com/en/OnePiece/Cards"
    : "site:cardmarket.com/en/Pokemon/Cards";
}

function humanizeCardMarketSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = decodeURIComponent(value)
    .replace(/\+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decoded || null;
}

function extractCardMarketPathParts(url: string): {
  setName: string | null;
  cardName: string | null;
} {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    const singlesIndex = segments.findIndex(
      (segment, index) => index >= start && segment.toLowerCase() === "singles"
    );
    if (singlesIndex < 0) return { setName: null, cardName: null };

    return {
      setName: humanizeCardMarketSlug(segments[singlesIndex + 1]),
      cardName: humanizeCardMarketSlug(segments[singlesIndex + 2]),
    };
  } catch {
    return { setName: null, cardName: null };
  }
}

function isCardMarketProductUrl(url: string, game?: TradingCardGame): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    const urlGame = getCardMarketUrlGame(url);
    const productSegment = (segments[start + 1] ?? "").toLowerCase();
    const categorySegment = (segments[start + 2] ?? "").toLowerCase();

    return (
      parsed.hostname.toLowerCase().includes(CARDMARKET_DOMAIN) &&
      (!game || urlGame === game) &&
      productSegment === "products" &&
      (categorySegment === "singles" || parsed.searchParams.has("idProduct"))
    );
  } catch {
    return false;
  }
}

function normalizeCardMarketVersionsUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.toLowerCase().includes(CARDMARKET_DOMAIN)) return null;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isCardMarketVersionsUrl(url: string, game?: TradingCardGame): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    const urlGame = getCardMarketUrlGame(url);
    const cardSegment = (segments[start + 1] ?? "").toLowerCase();
    const lastSegment = (segments.at(-1) ?? "").toLowerCase();

    return (
      parsed.hostname.toLowerCase().includes(CARDMARKET_DOMAIN) &&
      (!game || urlGame === game) &&
      cardSegment === "cards" &&
      lastSegment === "versions"
    );
  } catch {
    return false;
  }
}

function normalizeInput(input: CardSubmissionInput): NormalizedSubmissionInput {
  const game = normalizeTradingCardGame(asString(input.game));
  const name = asString(input.name);
  const setName = asString(input.setName);
  const cardNumber = asString(input.cardNumber) || null;
  const normalizedCardNumber = normalizeCardNumber(cardNumber);
  const rawUrl = asString(input.cardmarketUrl) || null;
  const cardmarketUrl = rawUrl ? normalizeCardMarketUrl(rawUrl) : null;
  const condition = normalizeSubmissionCondition(input.condition);
  const skipDuplicateCheck = asBoolean(input.skipDuplicateCheck);

  if (name.length < 2) throw new CardSubmissionError("Card name is required.");
  if (!cardNumber || !normalizedCardNumber) throw new CardSubmissionError("Card number is required.");
  if (rawUrl && (!cardmarketUrl || !isCardMarketProductUrl(cardmarketUrl, game))) {
    throw new CardSubmissionError(`Use a valid ${getGameLabel(game)} CardMarket card URL.`);
  }

  return {
    game,
    name,
    setName,
    cardNumber,
    cardmarketUrl,
    condition,
    skipDuplicateCheck,
    normalizedKey: [
      game,
      normalizeSubmissionText(name),
      normalizeSubmissionText(setName),
      normalizedCardNumber,
      normalizeSubmissionText(condition),
      cardmarketUrl ?? "",
    ].join("|"),
  };
}

function buildSearchQuery(input: NormalizedSubmissionInput): string {
  return [
    getCardMarketSearchSite(input.game),
    `"${input.name}"`,
    input.setName ? `"${input.setName}"` : null,
    input.cardNumber ? `"${input.cardNumber}"` : null,
    input.condition !== DEFAULT_SUBMISSION_CONDITION ? `"${input.condition}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildVersionsSearchQuery(input: NormalizedSubmissionInput): string {
  return [
    getCardMarketCardsSite(input.game),
    `"${input.name}"`,
    input.setName ? `"${input.setName}"` : null,
    input.cardNumber ? `"${input.cardNumber}"` : null,
    "Versions",
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreSearchCandidate(
  candidate: { title: string | null; description: string | null; url: string },
  input: NormalizedSubmissionInput
): number {
  if (!isCardMarketProductUrl(candidate.url, input.game)) return -100;

  const haystack = normalizeSubmissionText(
    `${candidate.title ?? ""} ${candidate.description ?? ""} ${decodeURIComponent(candidate.url)}`
  );
  let score = 25;
  if (haystack.includes(normalizeSubmissionText(input.name))) score += 35;
  if (input.setName && haystack.includes(normalizeSubmissionText(input.setName))) score += 25;
  const normalizedNumber = normalizeCardNumber(input.cardNumber);
  const compactNumber = compactCardNumber(input.cardNumber).toLowerCase();
  const compactHaystack = haystack.replace(/\s+/g, "");
  if (
    normalizedNumber &&
    (compactHaystack.includes(normalizedNumber.toLowerCase()) ||
      (compactNumber && compactHaystack.includes(compactNumber)))
  ) {
    score += 15;
  }
  return score;
}

function scoreVersionsPageCandidate(
  candidate: { title: string | null; description: string | null; url: string },
  input: NormalizedSubmissionInput
): number {
  const normalizedUrl = normalizeCardMarketVersionsUrl(candidate.url);
  if (!normalizedUrl || !isCardMarketVersionsUrl(normalizedUrl, input.game)) return -100;

  const haystack = normalizeSubmissionText(
    `${candidate.title ?? ""} ${candidate.description ?? ""} ${decodeURIComponent(normalizedUrl)}`
  );
  let score = 30;
  if (haystack.includes(normalizeSubmissionText(input.name))) score += 35;
  if (input.setName && haystack.includes(normalizeSubmissionText(input.setName))) score += 10;

  const extractedNumber = extractCardNumberFromText(
    `${candidate.title ?? ""} ${candidate.description ?? ""} ${decodeURIComponent(normalizedUrl)}`
  );
  if (cardNumberMatchesSubmittedBase(input.cardNumber, extractedNumber)) {
    score += 25;
  } else {
    const compactSubmitted = compactCardNumber(input.cardNumber).toLowerCase();
    const compactHaystack = haystack.replace(/\s+/g, "");
    if (compactSubmitted && compactHaystack.includes(compactSubmitted)) score += 20;
  }

  return score;
}

function pickVersionsPageCandidates(
  response: FirecrawlWebSearchResponse,
  input: NormalizedSubmissionInput,
  limit = 3
): string[] {
  const seen = new Set<string>();
  return response.results
    .map((result) => ({
      result,
      url: normalizeCardMarketVersionsUrl(result.url),
      score: scoreVersionsPageCandidate(result, input),
    }))
    .filter((entry) => Boolean(entry.url) && entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.url)
    .filter((url): url is string => Boolean(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, limit);
}

function pickSearchCandidate(
  response: FirecrawlWebSearchResponse,
  input: NormalizedSubmissionInput,
  options?: { excludeCardmarketRefs?: CardMarketRefSet }
): string | null {
  const excludedRefs = options?.excludeCardmarketRefs ?? createEmptyCardMarketRefs();
  return response.results
    .map((result) => ({ result, score: scoreSearchCandidate(result, input) }))
    .filter(
      (entry) =>
        entry.score > 0 && !cardMarketRefMatches(excludedRefs, entry.result.url)
    )
    .sort((a, b) => b.score - a.score)[0]?.result.url ?? null;
}

function htmlToText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&euro;/gi, "€")
    .replace(/\s+/g, " ");
}

function extractMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reverseRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    "i"
  );
  return html.match(regex)?.[1]?.trim() ?? html.match(reverseRegex)?.[1]?.trim() ?? null;
}

function absolutizeUrl(rawUrl: string, sourceUrl: string): string | null {
  try {
    return new URL(rawUrl, sourceUrl).toString();
  } catch {
    return null;
  }
}

function extractHtmlAttributeValues(html: string, attribute: string): string[] {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}=["']([^"']+)["']`, "gi");
  return [...html.matchAll(regex)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
}

function expandSrcset(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0]?.trim())
    .filter(Boolean) as string[];
}

const CARDMARKET_IMAGE_ATTRIBUTES = [
  "src",
  "data-src",
  "data-echo",
  "data-original",
  "data-original-src",
  "data-lazy",
  "data-lazy-src",
];

const CARDMARKET_SRCSET_ATTRIBUTES = ["srcset", "data-srcset"];

function scoreImageCandidate(url: string): number {
  try {
    const parsed = new URL(url);
    const haystack = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
    let score = 0;
    if (
      haystack.includes("transparent.gif") ||
      haystack.includes("placeholder") ||
      haystack.includes("nopicture") ||
      haystack.includes("no-picture") ||
      haystack.includes("no_image") ||
      haystack.includes("no-image")
    ) {
      score -= 120;
    }
    if (/\.(?:jpg|jpeg|png|webp|avif)(?:$|\?)/i.test(parsed.pathname)) score += 20;
    if (haystack.includes("product")) score += 30;
    if (haystack.includes("cardmarket")) score += 25;
    if (haystack.includes("cards") || haystack.includes("items")) score += 12;
    if (haystack.includes("logo") || haystack.includes("icon") || haystack.includes("avatar")) score -= 50;
    if (parsed.pathname.includes("/img/")) score += 5;
    return score;
  } catch {
    return -100;
  }
}

function extractImageUrl(scrape: FirecrawlPageScrapeResult): string | null {
  const candidates: string[] = [];
  const metadataImage =
    typeof scrape.metadata.ogImage === "string"
      ? scrape.metadata.ogImage
      : typeof scrape.metadata.image === "string"
        ? scrape.metadata.image
        : null;
  const metaImage = metadataImage ?? extractMetaContent(scrape.html, "og:image");
  if (metaImage) candidates.push(metaImage);

  const markdownImage = scrape.markdown.match(/!\[[^\]]*]\(([^)]+)\)/)?.[1]?.trim();
  if (markdownImage) candidates.push(markdownImage);

  for (const attribute of CARDMARKET_IMAGE_ATTRIBUTES) {
    candidates.push(...extractHtmlAttributeValues(scrape.html, attribute));
  }
  for (const attribute of CARDMARKET_SRCSET_ATTRIBUTES) {
    for (const srcset of extractHtmlAttributeValues(scrape.html, attribute)) {
      candidates.push(...expandSrcset(srcset));
    }
  }

  return candidates
    .map((candidate) => absolutizeUrl(candidate, scrape.sourceUrl))
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => ({ candidate, score: scoreImageCandidate(candidate) }))
    .filter((entry) => entry.score > -25)
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

function parsePriceToken(value: string): number | null {
  const normalized = value.replace(/[^\d.,]/g, "");
  if (!normalized) return null;

  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");
  const decimalIndex = Math.max(commaIndex, dotIndex);
  const integerPart =
    decimalIndex >= 0 ? normalized.slice(0, decimalIndex).replace(/[.,]/g, "") : normalized.replace(/[.,]/g, "");
  const decimalPart = decimalIndex >= 0 ? normalized.slice(decimalIndex + 1).replace(/[^\d]/g, "") : "";
  const numeric = Number(`${integerPart || "0"}${decimalPart ? `.${decimalPart.slice(0, 2)}` : ""}`);

  return Number.isFinite(numeric) && numeric > 0 && numeric < 100000 ? numeric : null;
}

function extractPricesFromText(text: string): number[] {
  const matches = text.match(/(?:€\s*)?\d{1,6}(?:[.,]\d{2,3})*(?:[.,]\d{2})\s*(?:€|EUR)?/gi) ?? [];
  return matches
    .map(parsePriceToken)
    .filter((value): value is number => value != null);
}

function extractCurrencyPriceMatchesFromText(text: string): Array<{ price: number; index: number }> {
  const currency = String.raw`(?:\u20ac|â‚¬|Ã¢â€šÂ¬|EUR)`;
  const number = String.raw`\d{1,6}(?:[.,]\d{2,3})*(?:[.,]\d{2})`;
  const regex = new RegExp(`${currency}\\s*${number}|${number}\\s*${currency}`, "gi");
  const rows: Array<{ price: number; index: number }> = [];

  for (const match of text.matchAll(regex)) {
    const price = parsePriceToken(match[0] ?? "");
    if (price == null || match.index == null) continue;
    rows.push({ price, index: match.index });
  }

  return rows;
}

function normalizeGradingCompany(value: string): string | null {
  const company = value.replace(/\s+/g, "").toUpperCase();
  if (company === "BECKETT") return "BGS";
  if (["AIGRAD", "AIGRADE", "AIGRADING"].includes(company)) return "AIGRAD";
  if (["PSA", "BGS", "CGC", "SGC", "ACE", "TAG", "AOG"].includes(company)) return company;
  return null;
}

function normalizeGradingGrade(value: string): string | null {
  const grade = value.replace(",", ".").trim();
  const numeric = Number(grade);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 10) return null;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, "");
}

function isBlockedGradedContext(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const nextLineBreak = text.indexOf("\n", index);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const context = text.slice(lineStart, lineEnd);

  return /\b(potential|potenzial|contender|candidate|candidat|kandidat|maybe|possible|should\s+grade|could\s+grade|gradeable|raw|ungraded|not\s+graded|no\s+grade)\b/i.test(
    context
  );
}

function hasGenericGradedContext(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const nextLineBreak = text.indexOf("\n", index);
  const lineEnd = nextLineBreak === -1 ? Math.min(text.length, index + 140) : nextLineBreak;
  const context = text.slice(lineStart, lineEnd);

  return /\b(graded|slabbed|slab|certificate|cert|certified|encased|sealed\s+case|gegradet)\b/i.test(context);
}

function extractGradingLabelMatches(text: string): Array<{ label: string; index: number }> {
  const gradeToken = String.raw`(?:10|9(?:[.,]5)?|9|8(?:[.,]5)?|8|7(?:[.,]5)?|7|6(?:[.,]5)?|6|5(?:[.,]5)?|5|4(?:[.,]5)?|4|3(?:[.,]5)?|3|2(?:[.,]5)?|2|1(?:[.,]5)?|1)`;
  const companyToken = String.raw`(?:PSA|BGS|CGC|SGC|ACE|TAG|AOG|Ai\s*Grad(?:e|ing)?|AiGrad(?:e|ing)?|Beckett)`;
  const descriptorToken = String.raw`(?:(?:graded|grade|slabbed|gem\s*mint|gem\s*mt|pristine|mint|black\s*label|gold\s*label)\s*)`;
  const companyBefore = new RegExp(
    String.raw`\b(${companyToken})\s*(?:${descriptorToken}){0,3}(?:grade\s*)?(${gradeToken})(?:\s*/\s*10)?\b`,
    "gi"
  );
  const companyAfter = new RegExp(
    String.raw`\b(${gradeToken})(?:\s*/\s*10)?\s*(${companyToken})\b`,
    "gi"
  );
  const genericGrade = new RegExp(
    String.raw`\b(?:graded\s+card|graded|slabbed|slab|grad|grade)\s*(${gradeToken})(?:\s*/\s*10)?\b`,
    "gi"
  );
  const labels: Array<{ label: string; index: number }> = [];

  for (const match of text.matchAll(companyBefore)) {
    const company = normalizeGradingCompany(match[1] ?? "");
    const grade = normalizeGradingGrade(match[2] ?? "");
    if (!company || !grade || match.index == null) continue;
    if (isBlockedGradedContext(text, match.index)) continue;
    labels.push({ label: `${company} ${grade}`, index: match.index });
  }

  for (const match of text.matchAll(companyAfter)) {
    const grade = normalizeGradingGrade(match[1] ?? "");
    const company = normalizeGradingCompany(match[2] ?? "");
    if (!company || !grade || match.index == null) continue;
    if (isBlockedGradedContext(text, match.index)) continue;
    labels.push({ label: `${company} ${grade}`, index: match.index });
  }

  for (const match of text.matchAll(genericGrade)) {
    const grade = normalizeGradingGrade(match[1] ?? "");
    if (!grade || match.index == null) continue;
    if (isBlockedGradedContext(text, match.index)) continue;
    if (!hasGenericGradedContext(text, match.index)) continue;
    labels.push({ label: `GRADED ${grade}`, index: match.index });
  }

  return labels;
}

function extractSubmittedGradedPrices(scrape: FirecrawlPageScrapeResult): SubmittedGradedPrice[] {
  const sources = [scrape.markdown, htmlToText(scrape.html)].filter(Boolean);
  const candidates: SubmittedGradedPrice[] = [];

  for (const text of sources) {
    const labelMatches = extractGradingLabelMatches(text);
    if (labelMatches.length === 0) continue;

    for (const labelMatch of labelMatches) {
      const start = Math.max(0, labelMatch.index - 260);
      const end = Math.min(text.length, labelMatch.index + 360);
      const localWindow = text.slice(start, end);
      const priceMatches = extractCurrencyPriceMatchesFromText(localWindow);
      if (priceMatches.length === 0) continue;

      const relativeLabelIndex = labelMatch.index - start;
      const nearestAfter = priceMatches
        .map((priceMatch) => ({
          ...priceMatch,
          distance: priceMatch.index - relativeLabelIndex,
        }))
        .filter((priceMatch) => priceMatch.distance >= 0)
        .sort((a, b) => a.distance - b.distance)[0];
      const nearest = nearestAfter ?? priceMatches
        .map((priceMatch) => ({
          ...priceMatch,
          distance: Math.abs(start + priceMatch.index - labelMatch.index),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > 360) continue;

      candidates.push({ label: labelMatch.label, price: nearest.price });
    }
  }

  return dedupeSubmittedGradedPrices(candidates);
}

function languageFromText(value: string): SubmissionLanguage | null {
  if (/\b(japanese|japanisch|japans|japonais|japones|japonés)\b/i.test(value)) {
    return "Japanese";
  }
  if (/\b(english|englisch|engels|anglais|ingles|inglés)\b/i.test(value)) {
    return "English";
  }
  return null;
}

function windowMatchesCondition(text: string, condition: string): boolean {
  const normalizedCondition = normalizeSubmissionCondition(condition);
  switch (normalizedCondition) {
    case "Mint":
      return /\b(Mint|MT)\b/i.test(text) && !/(near\s*mint|\bNM\b)/i.test(text);
    case "Near Mint":
      return /(near\s*mint|\bNM\b)/i.test(text);
    case "Excellent":
      return /(\bexcellent\b|\bEX\b)/i.test(text);
    case "Good":
      return /(\bgood\b|\bGD\b)/i.test(text);
    case "Light Played":
      return /(light\s*played|\bLP\b)/i.test(text);
    case "Played":
      return /(\bplayed\b|\bPL\b)/i.test(text) && !/(light\s*played|\bLP\b)/i.test(text);
    case "Poor":
      return /(\bpoor\b|\bPO\b|\bPR\b)/i.test(text);
    default:
      return false;
  }
}

interface ExtractedConditionPrice {
  language: SubmissionLanguage | null;
  price: number | null;
  warnings: string[];
}

export interface StrictCardMarketEnglishNmPrice {
  priceEur: number;
  offerCount: number;
}

function extractCardMarketArticleRows(html: string): string[] {
  const starts = [
    ...html.matchAll(/<div\b[^>]*\bid=["']articleRow[^"']*["'][^>]*>/gi),
  ]
    .map((match) => match.index)
    .filter((index): index is number => index != null);

  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const footerStart = html.indexOf('<div class="table-footer"', start);
    const end = nextStart ?? (footerStart >= 0 ? footerStart : html.length);
    return html.slice(start, end);
  });
}

function extractCardMarketArticlePrice(row: string): number | null {
  for (const match of row.matchAll(/<span\b([^>]*)>([^<]*)<\/span>/gi)) {
    const classes = match[1]?.match(/\bclass=["']([^"']+)["']/i)?.[1]?.split(/\s+/) ?? [];
    if (!classes.includes("color-primary")) continue;

    const price = parsePriceToken(match[2] ?? "");
    if (price != null) return price;
  }

  return null;
}

function extractCardMarketArticleComment(row: string): string {
  const start = row.search(/\bclass=["'][^"']*\bproduct-comments\b[^"']*["']/i);
  if (start < 0) return "";

  const relativeEnd = row
    .slice(start)
    .search(/\bclass=["'][^"']*\bmobile-offer-container\b[^"']*["']/i);
  const end = relativeEnd < 0 ? row.length : start + relativeEnd;
  return htmlToText(row.slice(start, end));
}

function extractArticleConditionPrice(
  scrape: FirecrawlPageScrapeResult,
  condition: string
): ExtractedConditionPrice | null {
  const rows = extractCardMarketArticleRows(scrape.html);
  if (rows.length === 0) return null;

  const explicit: Record<SubmissionLanguage, number[]> = { English: [], Japanese: [] };

  for (const row of rows) {
    const productAttributes =
      row.match(
        /<div\b[^>]*class=["'][^"']*\bproduct-attributes\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i
      )?.[0] ?? "";
    if (!productAttributes || !windowMatchesCondition(productAttributes, condition)) continue;

    const language = languageFromText(productAttributes);
    const price = extractCardMarketArticlePrice(row);
    if (!language || price == null) continue;

    const comment = extractCardMarketArticleComment(row);
    if (extractGradingLabelMatches(comment).length > 0) continue;

    explicit[language].push(price);
  }

  const lowestEnglish = explicit.English.length > 0 ? Math.min(...explicit.English) : null;
  const lowestJapanese = explicit.Japanese.length > 0 ? Math.min(...explicit.Japanese) : null;
  if (lowestEnglish != null) return { language: "English", price: lowestEnglish, warnings: [] };
  if (lowestJapanese != null) return { language: "Japanese", price: lowestJapanese, warnings: [] };

  return {
    language: null,
    price: null,
    warnings: [`No English or Japanese ${condition} price was found in CardMarket offer rows.`],
  };
}

/**
 * Automation-safe CardMarket parser. Unlike the interactive submission parser
 * this deliberately has no text, unknown-language, or Japanese fallback: a
 * Chase Watch quote is accepted only from explicit English Near Mint offer
 * rows and graded seller comments are ignored.
 */
export function parseStrictCardMarketEnglishNmPrice(
  scrape: FirecrawlPageScrapeResult
): StrictCardMarketEnglishNmPrice | null {
  const prices: number[] = [];
  for (const row of extractCardMarketArticleRows(scrape.html)) {
    const productAttributes =
      row.match(
        /<div\b[^>]*class=["'][^"']*\bproduct-attributes\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i
      )?.[0] ?? "";
    if (!productAttributes || !windowMatchesCondition(productAttributes, "Near Mint")) {
      continue;
    }
    if (languageFromText(productAttributes) !== "English") continue;
    const comment = extractCardMarketArticleComment(row);
    if (extractGradingLabelMatches(comment).length > 0) continue;
    const price = extractCardMarketArticlePrice(row);
    if (price != null) prices.push(price);
  }
  if (prices.length === 0) return null;
  return { priceEur: Math.min(...prices), offerCount: prices.length };
}

/**
 * Distinguishes a fully rendered offer table with no matching EN/NM row from
 * a blocked, partial or otherwise unreadable page. A rendered product table
 * is conclusive only when a priced offer row or CardMarket's exact empty-state
 * marker is present.
 */
export function hasConclusiveCardMarketOfferState(
  scrape: FirecrawlPageScrapeResult
): boolean {
  const hasReadableRow = extractCardMarketArticleRows(scrape.html).some((row) => {
    const hasAttributes = /\bclass=["'][^"']*\bproduct-attributes\b/i.test(row);
    return hasAttributes && extractCardMarketArticlePrice(row) != null;
  });
  if (hasReadableRow) return true;
  return /<p\b[^>]*class=["'][^"']*\bnoResults\b[^"']*["'][^>]*>\s*Currently there are no available offers for this article\.\s*<\/p>/i.test(
    scrape.html
  );
}

function extractConditionPrice(
  scrape: FirecrawlPageScrapeResult,
  condition: string
): ExtractedConditionPrice {
  const normalizedCondition = normalizeSubmissionCondition(condition);
  const articlePrice = extractArticleConditionPrice(scrape, normalizedCondition);
  if (articlePrice) return articlePrice;

  const text = `${scrape.markdown}\n${htmlToText(scrape.html)}`;
  const lines = text
    .split(/\r?\n|(?<=€)\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const explicit: Record<SubmissionLanguage, number[]> = { English: [], Japanese: [] };
  const fallback: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const windowText = lines.slice(index, index + 5).join(" ");
    if (!windowMatchesCondition(windowText, normalizedCondition)) continue;

    const prices = extractPricesFromText(windowText);
    if (prices.length === 0) continue;

    const language = languageFromText(windowText);
    if (language) {
      explicit[language].push(...prices);
    } else {
      fallback.push(...prices);
    }
  }

  const lowestEnglish = explicit.English.length > 0 ? Math.min(...explicit.English) : null;
  const lowestJapanese = explicit.Japanese.length > 0 ? Math.min(...explicit.Japanese) : null;
  if (lowestEnglish != null) return { language: "English", price: lowestEnglish, warnings: [] };
  if (lowestJapanese != null) return { language: "Japanese", price: lowestJapanese, warnings: [] };

  if (fallback.length > 0) {
    const pageLanguage = languageFromText(`${scrape.title ?? ""} ${scrape.markdown.slice(0, 1200)}`);
    return {
      language: pageLanguage ?? "English",
      price: Math.min(...fallback),
      warnings: [
        `CardMarket language was not explicit; using the lowest visible ${normalizedCondition} price.`,
      ],
    };
  }

  return {
    language: null,
    price: null,
    warnings: [`No English or Japanese ${normalizedCondition} price was found on the scraped page.`],
  };
}

function stripCardMarketTitleNoise(value: string): string {
  return value
    .replace(/\s*\|\s*.*$/g, "")
    .replace(/\s+-\s+.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCardNumberFromText(value: string): string | null {
  return (
    value.match(/\b[A-Z]{2,4}\d{1,3}[-\s]?\d{1,3}(?:#\d+)?\b/i)?.[0]?.replace(/\s+/g, "") ??
    value.match(/\b\d{1,4}\/\d{1,4}(?:#\d+)?\b/i)?.[0] ??
    null
  );
}

function extractNameFromTitle(title: string | null, fallbackSlugName: string | null): string | null {
  const cleaned = stripCardMarketTitleNoise(title ?? "");
  if (!cleaned) return fallbackSlugName;
  const withoutNumber = cleaned
    .replace(/\([^)]*\b[A-Z]{2,4}\d{1,3}[-\s]?\d{1,3}(?:#\d+)?[^)]*\)/gi, "")
    .replace(/\(\s*#?\d{1,4}\s*\)/g, "")
    .replace(/\b[A-Z]{2,4}\d{1,3}[-\s]?\d{1,3}(?:#\d+)?\b/gi, "")
    .replace(/\b\d{1,4}\/\d{1,4}(?:#\d+)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutNumber || fallbackSlugName;
}

export function parseCardMarketScrape(
  scrape: FirecrawlPageScrapeResult,
  condition = DEFAULT_SUBMISSION_CONDITION
): ParsedCardMarketPage {
  const normalizedCondition = normalizeSubmissionCondition(condition);
  const pathParts = extractCardMarketPathParts(scrape.sourceUrl);
  const imageUrl = extractImageUrl(scrape);
  const price = extractConditionPrice(scrape, normalizedCondition);
  const gradedPrices = extractSubmittedGradedPrices(scrape);
  const titleText = `${scrape.title ?? ""}\n${scrape.markdown.slice(0, 1200)}\n${htmlToText(scrape.html).slice(0, 1200)}`;
  const cardNumber = extractCardNumberFromText(titleText);
  const warnings = [...price.warnings];
  if (!imageUrl) warnings.push("No product image was found on the scraped page.");

  const confidence = Number(
    (
      0.25 +
      (isCardMarketProductUrl(scrape.sourceUrl) ? 0.25 : 0) +
      (imageUrl ? 0.2 : 0) +
      (price.price != null ? 0.25 : 0) +
      (price.language ? 0.05 : 0)
    ).toFixed(2)
  );

  return {
    title: scrape.title,
    sourceUrl: normalizeCardMarketUrl(scrape.sourceUrl) ?? scrape.sourceUrl,
    name: extractNameFromTitle(scrape.title, pathParts.cardName),
    setName: pathParts.setName,
    cardNumber,
    imageUrl,
    language: price.language,
    condition: normalizedCondition,
    nmPriceEur: price.price,
    gradedPrices,
    warnings,
    confidence,
  };
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

async function getFirecrawlUsage(userId: string, now = new Date()) {
  const config = getFirecrawlConfigSnapshot();
  const month = getFirecrawlMonthWindow(now);
  const [monthly, ledgerCompleted, ledgerReserved, dailyAttempts] = await Promise.all([
    db.cardSubmission.aggregate({
      where: { created_at: { gte: month.startsAt, lt: month.endsAt } },
      _sum: { credits_used: true },
    }),
    db.firecrawlCreditLedger.aggregate({
      where: {
        period_key: month.periodKey,
        status: { in: ["completed", "failed"] },
      },
      _sum: { credits_used: true },
    }),
    db.firecrawlCreditLedger.aggregate({
      where: {
        period_key: month.periodKey,
        status: "reserved",
        expires_at: { gt: now },
      },
      _sum: { estimated_credits: true },
    }),
    db.cardSubmission.count({
      where: {
        user_id: userId,
        created_at: { gte: startOfDay(now) },
        OR: [{ search_count: { gt: 0 } }, { scrape_count: { gt: 0 } }],
      },
    }),
  ]);

  return {
    monthlyUsed:
      config.monthlyCreditOffset +
      (monthly._sum.credits_used ?? 0) +
      (ledgerCompleted._sum.credits_used ?? 0) +
      (ledgerReserved._sum.estimated_credits ?? 0),
    dailyAttemptsUsed: dailyAttempts,
  };
}

export async function getCardSubmissionFirecrawlUsage(
  userId: string
): Promise<CardSubmissionFirecrawlUsage> {
  const config = getFirecrawlConfigSnapshot();
  const [usage, provider] = await Promise.all([
    getFirecrawlUsage(userId),
    getFirecrawlProviderCreditUsage(),
  ]);
  const providerUsed = provider ? provider.planCredits - provider.remainingCredits : null;

  return {
    configured: config.configured,
    monthlyBudget: provider?.planCredits ?? config.monthlyCreditBudget,
    monthlyOffset: config.monthlyCreditOffset,
    monthlyUsed: providerUsed ?? usage.monthlyUsed,
    monthlyRemaining:
      provider?.remainingCredits ?? Math.max(0, config.monthlyCreditBudget - usage.monthlyUsed),
    dailyAttemptLimit: USER_DAILY_ATTEMPT_LIMIT,
    dailyAttemptsUsed: usage.dailyAttemptsUsed,
    providerAuthoritative: Boolean(provider),
    billingPeriodStart: provider?.billingPeriodStart ?? null,
    billingPeriodEnd: provider?.billingPeriodEnd ?? null,
  };
}

async function assertScraperBudget(userId: string, estimatedCredits: number) {
  const config = getFirecrawlConfigSnapshot();
  const scrapeDoConfigured = getScrapeDoConfigSnapshot().configured;
  const [usage, provider] = await Promise.all([
    getFirecrawlUsage(userId),
    getFirecrawlProviderCreditUsage(),
  ]);

  if (USER_DAILY_ATTEMPT_LIMIT > 0 && usage.dailyAttemptsUsed >= USER_DAILY_ATTEMPT_LIMIT) {
    throw new CardSubmissionError("Daily card lookup limit reached for this user.", 429);
  }

  let firecrawlBlockedReason: string | null = null;
  if (!config.configured) {
    firecrawlBlockedReason = "Firecrawl is not configured.";
  } else if (usage.monthlyUsed + estimatedCredits > config.monthlyCreditBudget) {
    firecrawlBlockedReason = "Firecrawl monthly budget is reached.";
  } else if (provider && provider.remainingCredits - estimatedCredits < 25) {
    firecrawlBlockedReason =
      `Firecrawl provider balance is too low; ${provider.remainingCredits} credits remain and 25 are kept in reserve.`;
  }

  if (firecrawlBlockedReason && !scrapeDoConfigured) {
    throw new CardSubmissionError(firecrawlBlockedReason, 429);
  }

  return {
    config,
    usage,
    firecrawlAllowed: !firecrawlBlockedReason,
  };
}

type DuplicateCandidateCard = {
  id: string;
  game: string;
  name: string;
  card_number: string | null;
  printed_card_number?: string | null;
  image_url: string | null;
  cardmarket_url?: string | null;
  cardmarket_id?: string | null;
  episode: { id: string; name: string };
};

function serializeDuplicateCard(card: DuplicateCandidateCard): DuplicateCardPreview {
  return {
    id: card.id,
    game: normalizeTradingCardGame(card.game),
    name: card.name,
    episodeId: card.episode.id,
    episodeName: card.episode.name,
    cardNumber: card.printed_card_number ?? card.card_number,
    imageUrl: card.image_url,
  };
}

function uniqueDuplicateCards(cards: DuplicateCandidateCard[]): DuplicateCardPreview[] {
  const seen = new Set<string>();
  const previews: DuplicateCardPreview[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    previews.push(serializeDuplicateCard(card));
  }
  return previews;
}

function getCardMarketVariantKey(cardmarketUrl: string | null, cardmarketId: string | null): string {
  return cardmarketId ? `cm-id:${cardmarketId}` : `cm-url:${cardmarketUrl ?? ""}`;
}

function buildOnePieceCardMarketVersionsUrl(input: NormalizedSubmissionInput): string | null {
  if (input.game !== ONE_PIECE_GAME || !input.cardNumber) return null;

  const nameSlug = slugifyCardMarketCardName(input.name);
  const numberSlug = normalizeCardNumber(input.cardNumber);
  if (!nameSlug || !numberSlug) return null;

  return `https://www.cardmarket.com/en/OnePiece/Cards/${nameSlug}-${numberSlug}/Versions`;
}

function extractVersionFromProductUrl(url: string): string | null {
  const match = decodeURIComponent(url).match(/(?:-|%20)(V\d+)$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function getVersionedCardNumber(cardNumber: string | null, version: string | null): string | null {
  if (!cardNumber) return version;
  return version ? `${cardNumber} / ${version}` : cardNumber;
}

function getCardMarketVariantLanguageGroup(input: {
  game: TradingCardGame;
  cardmarketUrl: string;
  setName: string | null;
  imageUrl?: string | null;
}): CardMarketVariantLanguageGroup {
  const haystack = normalizeSubmissionText(
    decodeURIComponent(`${input.cardmarketUrl} ${input.setName ?? ""} ${input.imageUrl ?? ""}`)
  );
  const codeHaystack = decodeURIComponent(`${input.cardmarketUrl} ${input.imageUrl ?? ""}`).replace(
    /[-_/]+/g,
    " "
  );

  const nonEnglish =
    haystack.includes("non english") ||
    haystack.includes("japanese") ||
    haystack.includes("asia region legal") ||
    /\b[A-Z]{1,5}\d{0,4}\s*JP\b/i.test(codeHaystack);

  return nonEnglish ? "non_english" : "english";
}

function normalizeScrapedUrlText(value: string): string {
  return value
    .replace(/\\\//g, "/")
    .replace(/\\u002f/gi, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function getProductUrlNeedles(productUrl: string): string[] {
  const needles = [productUrl, decodeURIComponent(productUrl)];

  try {
    const parsed = new URL(productUrl);
    needles.push(parsed.pathname, decodeURIComponent(parsed.pathname));
    const lastTwoSegments = parsed.pathname.split("/").filter(Boolean).slice(-2).join("/");
    if (lastTwoSegments) needles.push(lastTwoSegments, decodeURIComponent(lastTwoSegments));
  } catch {
    // The product URL was already validated by the caller.
  }

  return uniqueStrings(needles.map(normalizeScrapedUrlText));
}

function findProductUrlIndex(text: string, productUrl: string): number {
  const normalizedText = normalizeScrapedUrlText(text);
  const indexes = getProductUrlNeedles(productUrl)
    .map((needle) => normalizedText.indexOf(needle))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function cleanImageCandidate(value: string): string {
  return normalizeScrapedUrlText(value)
    .replace(/^["'([{]+/, "")
    .replace(/[)"'\]}>,.]+$/g, "")
    .trim();
}

function extractImageCandidatesFromText(value: string, sourceUrl: string): string[] {
  const text = normalizeScrapedUrlText(value);
  const candidates: string[] = [];

  for (const match of text.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g)) {
    if (match[1]) candidates.push(match[1]);
  }

  for (const attribute of CARDMARKET_IMAGE_ATTRIBUTES) {
    candidates.push(...extractHtmlAttributeValues(text, attribute));
  }
  for (const attribute of CARDMARKET_SRCSET_ATTRIBUTES) {
    for (const srcset of extractHtmlAttributeValues(text, attribute)) {
      candidates.push(...expandSrcset(srcset));
    }
  }

  const directImageRegex =
    /(?:https?:)?\/\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'()<>\s\\]*)?/gi;
  for (const match of text.matchAll(directImageRegex)) {
    if (match[0]) candidates.push(match[0]);
  }

  return uniqueStrings(
    candidates
      .map(cleanImageCandidate)
      .map((candidate) =>
        candidate.startsWith("//") ? `https:${candidate}` : candidate
      )
      .map((candidate) => absolutizeUrl(candidate, sourceUrl))
      .filter((candidate): candidate is string => Boolean(candidate))
      .filter((candidate) => scoreImageCandidate(candidate) > -25)
  );
}

function pickBestImageCandidate(
  candidates: string[],
  cardmarketId: string | null
): string | null {
  return uniqueStrings(candidates)
    .map((candidate) => {
      const productScore =
        cardmarketId &&
        (candidate.includes(`/${cardmarketId}/`) || candidate.includes(`/${cardmarketId}.`))
          ? 100
          : 0;
      return { candidate, score: scoreImageCandidate(candidate) + productScore };
    })
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

function extractNearestMarkdownImage(
  markdown: string,
  sourceUrl: string,
  productUrl: string
): string | null {
  const index = findProductUrlIndex(markdown, productUrl);
  if (index < 0) return null;

  const normalizedMarkdown = normalizeScrapedUrlText(markdown);
  const before = normalizedMarkdown.slice(Math.max(0, index - 900), index);
  const beforeImages = extractImageCandidatesFromText(before, sourceUrl);
  if (beforeImages.length > 0) {
    return beforeImages.at(-1) ?? null;
  }

  const after = normalizedMarkdown.slice(index, index + 900);
  return extractImageCandidatesFromText(after, sourceUrl)[0] ?? null;
}

function findPreviousOpeningTag(html: string, index: number, tagName: string): number {
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let lastIndex = -1;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > index) break;
    lastIndex = match.index;
  }

  return lastIndex;
}

function findNextClosingTagEnd(html: string, index: number, tagName: string): number {
  const closingTag = `</${tagName}>`;
  const closingIndex = html.toLowerCase().indexOf(closingTag, index);
  return closingIndex >= 0 ? closingIndex + closingTag.length : -1;
}

function extractNearestHtmlElementImage(
  html: string | null | undefined,
  sourceUrl: string,
  productUrl: string,
  cardmarketId: string | null
): string | null {
  if (!html) return null;

  const normalizedHtml = normalizeScrapedUrlText(html);
  const index = findProductUrlIndex(normalizedHtml, productUrl);
  if (index < 0) return null;

  const regions: string[] = [];
  for (const tagName of ["a", "article", "tr", "li", "section", "div"]) {
    const start = findPreviousOpeningTag(normalizedHtml, index, tagName);
    const end = findNextClosingTagEnd(normalizedHtml, index, tagName);
    if (start < 0 || end <= index || end <= start) continue;

    const region = normalizedHtml.slice(start, end);
    if (region.length > 12000) continue;
    regions.push(region);
  }

  for (const region of regions) {
    const image = pickBestImageCandidate(
      extractImageCandidatesFromText(region, sourceUrl),
      cardmarketId
    );
    if (image) return image;
  }

  return null;
}

function extractNearestVariantImage(
  scrape: Pick<FirecrawlPageScrapeResult, "markdown"> &
    Partial<Pick<FirecrawlPageScrapeResult, "html" | "sourceUrl">>,
  productUrl: string,
  cardmarketId: string | null
): string | null {
  const sourceUrl = scrape.sourceUrl ?? productUrl;
  const htmlElementImage = extractNearestHtmlElementImage(
    scrape.html,
    sourceUrl,
    productUrl,
    cardmarketId
  );
  if (htmlElementImage) return htmlElementImage;

  const markdownImage = extractNearestMarkdownImage(scrape.markdown, sourceUrl, productUrl);
  if (markdownImage) return markdownImage;

  const regions: string[] = [];

  for (const text of [scrape.markdown, scrape.html ?? ""]) {
    const index = findProductUrlIndex(text, productUrl);
    if (index < 0) continue;
    regions.push(text.slice(Math.max(0, index - 1800), index + 1800));
  }

  const regionalImage = pickBestImageCandidate(
    regions.flatMap((region) => extractImageCandidatesFromText(region, sourceUrl)),
    cardmarketId
  );
  if (regionalImage) return regionalImage;

  if (!cardmarketId) return null;

  return pickBestImageCandidate(
    extractImageCandidatesFromText(`${scrape.markdown}\n${scrape.html ?? ""}`, sourceUrl).filter(
      (candidate) =>
        candidate.includes(`/${cardmarketId}/`) || candidate.includes(`/${cardmarketId}.`)
    ),
    cardmarketId
  );
}

export function parseCardMarketVersionsScrape(
  scrape: Pick<FirecrawlPageScrapeResult, "links" | "markdown"> &
    Partial<Pick<FirecrawlPageScrapeResult, "html" | "sourceUrl">>,
  input: { game: TradingCardGame; name: string; cardNumber: string | null }
): CardMarketVariantPreview[] {
  const seen = new Set<string>();
  const variants: CardMarketVariantPreview[] = [];

  for (const link of scrape.links) {
    const normalizedUrl = normalizeCardMarketUrl(link);
    if (!normalizedUrl || !isCardMarketProductUrl(normalizedUrl, input.game)) continue;
    if (seen.has(normalizedUrl)) continue;

    const pathParts = extractCardMarketPathParts(normalizedUrl);
    const extractedNumber = extractCardNumberFromText(decodeURIComponent(normalizedUrl));
    const version = extractVersionFromProductUrl(normalizedUrl);
    const cardmarketId = extractCardMarketProductId(normalizedUrl);
    const imageUrl = extractNearestVariantImage(scrape, normalizedUrl, cardmarketId);
    const setName = getDisplaySetName(pathParts.setName);
    const languageGroup = getCardMarketVariantLanguageGroup({
      game: input.game,
      cardmarketUrl: normalizedUrl,
      setName,
      imageUrl,
    });

    variants.push({
      key: getCardMarketVariantKey(normalizedUrl, cardmarketId),
      name: input.name,
      setName,
      cardNumber: getVersionedCardNumber(extractedNumber ?? input.cardNumber, version),
      cardmarketUrl: normalizedUrl,
      cardmarketId,
      imageUrl,
      languageGroup,
      source: "versions",
      existingCard: null,
    });
    seen.add(normalizedUrl);
  }

  return variants;
}

function dedupeCardMarketVariants(
  variants: CardMarketVariantPreview[]
): CardMarketVariantPreview[] {
  const deduped = new Map<string, CardMarketVariantPreview>();

  for (const variant of variants) {
    const key = variant.key || getCardMarketVariantKey(variant.cardmarketUrl, variant.cardmarketId);
    const existing = deduped.get(key);
    if (!existing || (!existing.existingCard && variant.existingCard)) {
      deduped.set(key, { ...variant, key });
    }
  }

  return [...deduped.values()];
}

function attachExistingCardsToVariants(
  variants: CardMarketVariantPreview[],
  existingCards: DuplicateCandidateCard[],
  knownDuplicates: DuplicateCardPreview[]
): CardMarketVariantPreview[] {
  return variants.map((variant) => {
    const refs = createEmptyCardMarketRefs();
    addCardMarketRef(refs, variant.cardmarketUrl, variant.cardmarketId);
    const refMatch = existingCards.find((card) =>
      cardMarketRefMatches(refs, card.cardmarket_url, card.cardmarket_id)
    );
    const setNumberMatch =
      refMatch ??
      existingCards.find((card) => {
        const preview = serializeDuplicateCard(card);
        return (
          normalizeSubmissionText(preview.name) === normalizeSubmissionText(variant.name) &&
          duplicatePreviewMatchesSetAndNumber(preview, variant.setName, variant.cardNumber)
        );
      });
    const knownMatch =
      knownDuplicates.find(
        (card) =>
          normalizeSubmissionText(card.name) === normalizeSubmissionText(variant.name) &&
          duplicatePreviewMatchesSetAndNumber(card, variant.setName, variant.cardNumber)
      ) ?? null;

    return {
      ...variant,
      existingCard: setNumberMatch ? serializeDuplicateCard(setNumberMatch) : knownMatch,
    };
  });
}

async function findExistingCardsForCardMarketVariants(
  game: TradingCardGame,
  variants: CardMarketVariantPreview[]
): Promise<DuplicateCandidateCard[]> {
  if (variants.length === 0) return [];

  const productIds = variants
    .map((variant) => variant.cardmarketId)
    .filter((id): id is string => Boolean(id));
  const select = {
    id: true,
    game: true,
    name: true,
    card_number: true,
    printed_card_number: true,
    image_url: true,
    cardmarket_url: true,
    cardmarket_id: true,
    episode: { select: { id: true, name: true } },
  } satisfies Prisma.CardSelect;

  const [productMatches, urlCandidates] = await Promise.all([
    productIds.length > 0
      ? db.card.findMany({
          where: { game, cardmarket_id: { in: productIds } },
          select,
        })
      : Promise.resolve([]),
    db.card.findMany({
      where: { game, cardmarket_url: { not: null } },
      take: 5000,
      select,
    }),
  ]);

  const variantRefs = variants.map((variant) => {
    const refs = createEmptyCardMarketRefs();
    addCardMarketRef(refs, variant.cardmarketUrl, variant.cardmarketId);
    return refs;
  });
  const seen = new Set<string>();
  const matches: DuplicateCandidateCard[] = [];

  for (const card of [...productMatches, ...urlCandidates]) {
    if (seen.has(card.id)) continue;
    if (
      !variantRefs.some((refs) =>
        cardMarketRefMatches(refs, card.cardmarket_url, card.cardmarket_id)
      )
    ) {
      continue;
    }
    seen.add(card.id);
    matches.push(card);
  }

  return matches;
}

async function enrichCardMarketVariants(
  input: Pick<NormalizedSubmissionInput, "game">,
  variants: CardMarketVariantPreview[],
  duplicateCards: DuplicateCardPreview[]
): Promise<CardMarketVariantPreview[]> {
  const existingCards = await findExistingCardsForCardMarketVariants(input.game, variants);
  return attachExistingCardsToVariants(variants, existingCards, duplicateCards);
}

function sortCardMarketVariantsForSelection(
  variants: CardMarketVariantPreview[]
): CardMarketVariantPreview[] {
  return [...variants].sort((a, b) => {
    const groupA = a.languageGroup === "english" ? 0 : 1;
    const groupB = b.languageGroup === "english" ? 0 : 1;
    if (groupA !== groupB) return groupA - groupB;
    return (
      normalizeSubmissionText(a.setName).localeCompare(normalizeSubmissionText(b.setName)) ||
      normalizeSubmissionText(a.cardNumber ?? "").localeCompare(normalizeSubmissionText(b.cardNumber ?? ""))
    );
  });
}

interface CardMarketVersionsDiscovery {
  variants: CardMarketVariantPreview[];
  searchResponse: FirecrawlWebSearchResponse | null;
  searchCount: number;
  scrapeCount: number;
  creditsUsed: number;
  warnings: string[];
  scrapedPages: Array<{
    provider: "firecrawl" | "scrapedo";
    title: string | null;
    sourceUrl: string;
    markdownLength: number;
    htmlLength: number;
  }>;
}

async function hydrateMissingCardMarketVariantImages(
  input: Pick<NormalizedSubmissionInput, "condition">,
  variants: CardMarketVariantPreview[],
  scrapedPages: CardMarketVersionsDiscovery["scrapedPages"],
  skipFirecrawl: boolean
): Promise<{
  variants: CardMarketVariantPreview[];
  scrapeCount: number;
  creditsUsed: number;
}> {
  let scrapeCount = 0;
  let creditsUsed = 0;
  let hydratedCount = 0;
  const hydratedVariants: CardMarketVariantPreview[] = [];

  for (const variant of variants) {
    if (
      variant.imageUrl ||
      variant.existingCard?.imageUrl ||
      !variant.cardmarketUrl ||
      hydratedCount >= CARDMARKET_VARIANT_IMAGE_HYDRATION_LIMIT
    ) {
      hydratedVariants.push(variant);
      continue;
    }

    try {
      const scrape = await scrapePageWithFallback(variant.cardmarketUrl, { skipFirecrawl });
      scrapeCount += 1;
      hydratedCount += 1;
      creditsUsed += firecrawlCreditsUsed(scrape, 1);
      scrapedPages.push({
        provider: scrape.provider,
        title: scrape.title,
        sourceUrl: scrape.sourceUrl,
        markdownLength: scrape.markdown.length,
        htmlLength: scrape.html.length,
      });

      const parsed = parseCardMarketScrape(scrape, input.condition);
      hydratedVariants.push({
        ...variant,
        imageUrl: parsed.imageUrl ?? variant.imageUrl,
      });
    } catch {
      hydratedVariants.push(variant);
    }
  }

  return {
    variants: hydratedVariants,
    scrapeCount,
    creditsUsed,
  };
}

async function discoverCardMarketVersionPreviews(
  input: NormalizedSubmissionInput,
  duplicateCards: DuplicateCardPreview[],
  skipFirecrawl: boolean
): Promise<CardMarketVersionsDiscovery> {
  const warnings: string[] = [];
  const scrapedPages: CardMarketVersionsDiscovery["scrapedPages"] = [];
  const versionsUrls: string[] = [];
  let searchResponse: FirecrawlWebSearchResponse | null = null;
  let searchCount = 0;
  let scrapeCount = 0;
  let creditsUsed = 0;
  let variants: CardMarketVariantPreview[] = [];

  const addVersionsUrl = (rawUrl: string | null | undefined) => {
    const normalizedUrl = normalizeCardMarketVersionsUrl(rawUrl);
    if (!normalizedUrl || !isCardMarketVersionsUrl(normalizedUrl, input.game)) return;
    if (!versionsUrls.includes(normalizedUrl)) versionsUrls.push(normalizedUrl);
  };

  addVersionsUrl(buildOnePieceCardMarketVersionsUrl(input));

  const scrapeVersionsUrl = async (versionsUrl: string) => {
    try {
      const scrape = await scrapePageWithFallback(versionsUrl, { skipFirecrawl });
      scrapeCount += 1;
      creditsUsed += firecrawlCreditsUsed(scrape, 1);
      scrapedPages.push({
        provider: scrape.provider,
        title: scrape.title,
        sourceUrl: scrape.sourceUrl,
        markdownLength: scrape.markdown.length,
        htmlLength: scrape.html.length,
      });
      variants = dedupeCardMarketVariants([
        ...variants,
        ...parseCardMarketVersionsScrape(scrape, input),
      ]);
    } catch (error) {
      const apiError = toFirecrawlApiError(error);
      warnings.push(`Could not scrape CardMarket versions page: ${apiError.message}`);
    }
  };

  for (const versionsUrl of versionsUrls) {
    await scrapeVersionsUrl(versionsUrl);
  }

  if (variants.length === 0) {
    try {
      const providerSearch = await searchWebWithFallback({
        query: buildVersionsSearchQuery(input),
        limit: CARDMARKET_VARIANT_SEARCH_LIMIT,
        includeDomains: [CARDMARKET_DOMAIN],
        skipFirecrawl,
      });
      searchResponse = providerSearch;
      searchCount = 1;
      creditsUsed += firecrawlCreditsUsed(providerSearch, 2);
      if (searchResponse.warning) warnings.push(searchResponse.warning);

      for (const versionsUrl of pickVersionsPageCandidates(searchResponse, input)) {
        addVersionsUrl(versionsUrl);
      }

      for (const versionsUrl of versionsUrls) {
        const alreadyScraped = scrapedPages.some((page) => {
          const normalizedPageUrl = normalizeCardMarketVersionsUrl(page.sourceUrl);
          return normalizedPageUrl === versionsUrl;
        });
        if (!alreadyScraped) await scrapeVersionsUrl(versionsUrl);
      }
    } catch (error) {
      const apiError = toFirecrawlApiError(error);
      warnings.push(`Could not find CardMarket versions page: ${apiError.message}`);
    }
  }

  const variantsWithExistingCards = await enrichCardMarketVariants(
    input,
    sortCardMarketVariantsForSelection(dedupeCardMarketVariants(variants)),
    duplicateCards
  );
  const hydrated = await hydrateMissingCardMarketVariantImages(
    input,
    variantsWithExistingCards,
    scrapedPages,
    skipFirecrawl
  );
  scrapeCount += hydrated.scrapeCount;
  creditsUsed += hydrated.creditsUsed;

  return {
    variants: sortCardMarketVariantsForSelection(hydrated.variants),
    searchResponse,
    searchCount,
    scrapeCount,
    creditsUsed,
    warnings,
    scrapedPages,
  };
}

function getDuplicateCardMarketRefs(cards: DuplicateCandidateCard[]): CardMarketRefSet {
  const refs = createEmptyCardMarketRefs();
  for (const card of cards) {
    addCardMarketRef(refs, card.cardmarket_url, card.cardmarket_id);
  }
  return refs;
}

function duplicatePreviewMatchesSetAndNumber(
  card: DuplicateCardPreview,
  setName: string | null | undefined,
  cardNumber: string | null | undefined
): boolean {
  if (!setName || !cardNumber || !card.cardNumber) return false;
  return (
    normalizeSubmissionText(card.episodeName) === normalizeSubmissionText(setName) &&
    cardNumberMatchesSubmittedBase(cardNumber, card.cardNumber)
  );
}

async function findDuplicateCandidateCardsByCardMarketRef(
  game: TradingCardGame,
  cardmarketUrl: string | null | undefined
): Promise<DuplicateCandidateCard[]> {
  const refs = createEmptyCardMarketRefs();
  addCardMarketRef(refs, cardmarketUrl);
  if (refs.urls.size === 0 && refs.productIds.size === 0) return [];

  const productIds = [...refs.productIds];
  const select = {
    id: true,
    game: true,
    name: true,
    card_number: true,
    printed_card_number: true,
    image_url: true,
    cardmarket_url: true,
    cardmarket_id: true,
    episode: { select: { id: true, name: true } },
  } satisfies Prisma.CardSelect;

  const productMatches =
    productIds.length > 0
      ? await db.card.findMany({
          where: { game, cardmarket_id: { in: productIds } },
          select,
        })
      : [];
  const urlCandidates = await db.card.findMany({
    where: { game, cardmarket_url: { not: null } },
    take: 5000,
    select,
  });

  const seen = new Set<string>();
  const matches: DuplicateCandidateCard[] = [];
  for (const card of [...productMatches, ...urlCandidates]) {
    if (seen.has(card.id)) continue;
    if (!cardMarketRefMatches(refs, card.cardmarket_url, card.cardmarket_id)) continue;
    seen.add(card.id);
    matches.push(card);
  }
  return matches;
}

async function findDuplicateCards(input: NormalizedSubmissionInput): Promise<DuplicateCardResult> {
  const canonicalUrl = input.cardmarketUrl;
  const matches: DuplicateCandidateCard[] = [];
  let exactCardmarketUrl = false;

  if (canonicalUrl) {
    const exactMatches = await findDuplicateCandidateCardsByCardMarketRef(input.game, canonicalUrl);
    if (exactMatches.length > 0) {
      exactCardmarketUrl = true;
      matches.push(...exactMatches);
    }
  }

  const aliases = makeCardNumberAliases(input.cardNumber);
  const candidates = await db.card.findMany({
    where: {
      game: input.game,
      ...(aliases.length > 0
        ? {
            OR: [
              { card_number: { in: aliases } },
              { printed_card_number: { in: aliases } },
              ...aliases.map((alias) => ({ printed_card_number: { startsWith: `${alias}/` } })),
              ...aliases.map((alias) => ({ card_number: { startsWith: `${alias}#` } })),
              ...aliases.map((alias) => ({ printed_card_number: { startsWith: `${alias}#` } })),
            ],
          }
        : { name: { contains: input.name } }),
    },
    take: 120,
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      image_url: true,
      cardmarket_url: true,
      cardmarket_id: true,
      episode: { select: { id: true, name: true } },
    },
  });
  const normalizedName = normalizeSubmissionText(input.name);
  const normalizedSet = normalizeSubmissionText(input.setName);
  const matchedByNameNumber = candidates.filter((card) => {
    const nameMatches = normalizeSubmissionText(card.name) === normalizedName;
    const setMatches =
      !normalizedSet || normalizeSubmissionText(card.episode.name) === normalizedSet;
    const numberMatches =
      cardNumberMatchesSubmittedBase(input.cardNumber, card.card_number) ||
      cardNumberMatchesSubmittedBase(input.cardNumber, card.printed_card_number);
    return nameMatches && setMatches && numberMatches;
  });
  matches.push(...matchedByNameNumber);

  return {
    cards: uniqueDuplicateCards(matches),
    exactCardmarketUrl,
    cardmarketRefs: getDuplicateCardMarketRefs(matches),
  };
}

async function findDuplicateCardsByCardMarketRef(
  game: TradingCardGame,
  cardmarketUrl: string | null | undefined
): Promise<DuplicateCardPreview[]> {
  return uniqueDuplicateCards(
    await findDuplicateCandidateCardsByCardMarketRef(game, cardmarketUrl)
  );
}

async function createDuplicateSubmissionPreview(
  userId: string,
  input: NormalizedSubmissionInput,
  duplicateCards: DuplicateCardPreview[],
  options?: {
    status?: "duplicate" | "variant_select";
    canForceFirecrawl?: boolean;
    cardmarketMatches?: CardMarketVariantPreview[];
    warnings?: string[];
    usage?: { monthlyUsed: number; dailyAttemptsUsed: number } | null;
    monthlyBudget?: number | null;
    cardmarketUrl?: string | null;
    cardmarketId?: string | null;
    searchCount?: number;
    scrapeCount?: number;
    creditsUsed?: number;
    firecrawlSearchJson?: unknown;
    firecrawlScrapeJson?: unknown;
    lastScrapedAt?: Date | null;
  }
): Promise<CardSubmissionPreview> {
  const config = getFirecrawlConfigSnapshot();
  const usage = options?.usage ?? (await getFirecrawlUsage(userId));
  const submission = await db.cardSubmission.create({
    data: {
      user_id: userId,
      status: options?.status ?? "duplicate",
      game: input.game,
      input_name: input.name,
      input_set_name: input.setName,
      input_card_number: input.cardNumber,
      input_cardmarket_url: input.cardmarketUrl,
      input_condition: input.condition,
      normalized_key: input.normalizedKey,
      duplicate_card_id: duplicateCards[0]?.id,
      cardmarket_url: options?.cardmarketUrl,
      cardmarket_id: options?.cardmarketId,
      warnings_json: options?.warnings?.length ? serializeJson(options.warnings) : null,
      firecrawl_search_json: options?.firecrawlSearchJson
        ? serializeJson(options.firecrawlSearchJson)
        : null,
      firecrawl_scrape_json: options?.firecrawlScrapeJson
        ? serializeJson(options.firecrawlScrapeJson)
        : null,
      search_count: options?.searchCount ?? 0,
      scrape_count: options?.scrapeCount ?? 0,
      credits_used: options?.creditsUsed ?? 0,
      last_scraped_at: options?.lastScrapedAt,
    },
  });

  return serializeSubmission(submission, {
    duplicateCards,
    cardmarketMatches: options?.cardmarketMatches,
    canForceFirecrawl: options?.canForceFirecrawl ?? true,
    usage,
    monthlyBudget: options?.monthlyBudget ?? config.monthlyCreditBudget,
  });
}

function serializeSubmission(
  submission: NonNullable<SubmissionRecord>,
  options?: {
    duplicateCard?: DuplicateCardPreview | null;
    duplicateCards?: DuplicateCardPreview[] | null;
    cardmarketMatches?: CardMarketVariantPreview[] | null;
    canForceFirecrawl?: boolean | null;
    usage?: { monthlyUsed: number; dailyAttemptsUsed: number } | null;
    monthlyBudget?: number | null;
    error?: string | null;
  }
): CardSubmissionPreview {
  const warnings = parseJsonArray(submission.warnings_json);
  const hasRequiredFields = Boolean(
    submission.image_url && submission.cardmarket_url && submission.nm_price_eur != null
  );
  const duplicateCards =
    options?.duplicateCards ??
    (options?.duplicateCard ? [options.duplicateCard] : []);
  const cardmarketMatches = options?.cardmarketMatches ?? [];
  const inferredSetName = inferSetNameFromCardMarketUrl(submission.cardmarket_url);
  const inferredCardNumber = inferCardNumberFromCardMarketUrl(submission.cardmarket_url);

  return {
    id: submission.id,
    status: submission.status as SubmissionStatus,
    game: normalizeTradingCardGame(submission.game),
    canSave: submission.status === "preview" && hasRequiredFields,
    duplicateCard: duplicateCards[0] ?? null,
    duplicateCards,
    cardmarketMatches,
    canForceFirecrawl: Boolean(options?.canForceFirecrawl),
    card: {
      name: submission.detected_name ?? submission.input_name,
      setName: getDisplaySetName(
        (submission.detected_set_name ?? submission.input_set_name) || inferredSetName
      ),
      cardNumber:
        submission.detected_card_number ?? submission.input_card_number ?? inferredCardNumber,
      cardmarketUrl: submission.cardmarket_url,
      imageUrl: submission.image_url,
      language: (submission.detected_language as SubmissionLanguage | null) ?? null,
      condition: normalizeSubmissionCondition(
        submission.detected_condition ?? submission.input_condition
      ),
      nmPriceEur: submission.nm_price_eur,
      gradedPrices: parseStoredGradedPrices(submission.firecrawl_scrape_json),
      confidence: submission.confidence,
    },
    firecrawl: {
      usedSearch: submission.search_count > 0,
      usedScrape: submission.scrape_count > 0,
      creditsUsed: submission.credits_used,
      monthlyBudget: options?.monthlyBudget ?? getFirecrawlConfigSnapshot().monthlyCreditBudget,
      monthlyUsed: options?.usage?.monthlyUsed ?? 0,
      dailyAttemptsUsed: options?.usage?.dailyAttemptsUsed ?? 0,
    },
    warnings,
    error: options?.error ?? (submission.status === "failed" ? warnings[0] ?? "Preview failed." : null),
  };
}

async function createCachedSubmissionClone(
  userId: string,
  input: NormalizedSubmissionInput,
  cached: NonNullable<SubmissionRecord>
) {
  const inferredSetName = inferSetNameFromCardMarketUrl(cached.cardmarket_url);
  const inferredCardNumber = inferCardNumberFromCardMarketUrl(cached.cardmarket_url);

  return db.cardSubmission.create({
    data: {
      user_id: userId,
      status: "preview",
      game: input.game,
      input_name: input.name,
      input_set_name: input.setName,
      input_card_number: input.cardNumber,
      input_cardmarket_url: input.cardmarketUrl,
      input_condition: input.condition,
      normalized_key: input.normalizedKey,
      detected_name: cached.detected_name,
      detected_set_name: cached.detected_set_name || inferredSetName,
      detected_card_number: cached.detected_card_number ?? inferredCardNumber,
      detected_language: cached.detected_language,
      detected_condition: cached.detected_condition ?? input.condition,
      cardmarket_url: cached.cardmarket_url,
      cardmarket_id: cached.cardmarket_id,
      image_url: cached.image_url,
      nm_price_eur: cached.nm_price_eur,
      confidence: cached.confidence,
      warnings_json: cached.warnings_json,
      firecrawl_search_json: cached.firecrawl_search_json,
      firecrawl_scrape_json: cached.firecrawl_scrape_json,
      last_scraped_at: cached.last_scraped_at,
    },
  });
}

export async function previewCardSubmission(
  userId: string,
  rawInput: CardSubmissionInput
): Promise<CardSubmissionPreview> {
  const input = normalizeInput(rawInput);
  const knownDuplicateResult = await findDuplicateCards(input);
  const config = getFirecrawlConfigSnapshot();

  if (
    input.cardmarketUrl &&
    knownDuplicateResult.exactCardmarketUrl &&
    knownDuplicateResult.cards.length > 0
  ) {
    return createDuplicateSubmissionPreview(userId, input, knownDuplicateResult.cards, {
      canForceFirecrawl: false,
      cardmarketUrl: input.cardmarketUrl,
      cardmarketId: extractCardMarketProductId(input.cardmarketUrl),
      warnings: ["This CardMarket page is already linked to a card in your library."],
      monthlyBudget: config.monthlyCreditBudget,
    });
  }

  const cached = input.cardmarketUrl
    ? await db.cardSubmission.findFirst({
        where: {
          game: input.game,
          normalized_key: input.normalizedKey,
          status: { in: ["preview", "added"] },
          image_url: { not: null },
          nm_price_eur: { not: null },
          last_scraped_at: { gte: new Date(Date.now() - CACHE_TTL_MS) },
        },
        orderBy: { updated_at: "desc" },
      })
    : null;

  if (cached && storedScrapeHasGradedPriceParse(cached.firecrawl_scrape_json)) {
    const exactCachedDuplicates = await findDuplicateCardsByCardMarketRef(input.game, cached.cardmarket_url);
    if (exactCachedDuplicates.length > 0) {
      return createDuplicateSubmissionPreview(userId, input, exactCachedDuplicates, {
        canForceFirecrawl: false,
        warnings: ["This cached CardMarket preview points to a card that already exists locally."],
        monthlyBudget: config.monthlyCreditBudget,
      });
    }

    const submission = await createCachedSubmissionClone(userId, input, cached);
    const usage = await getFirecrawlUsage(userId);
    return serializeSubmission(submission, { usage, monthlyBudget: config.monthlyCreditBudget });
  }

  const estimatedCredits = input.cardmarketUrl ? 1 : 8;
  let guard: Awaited<ReturnType<typeof assertScraperBudget>>;
  try {
    guard = await assertScraperBudget(userId, estimatedCredits);
  } catch (error) {
    if (!input.cardmarketUrl) {
      const message =
        error instanceof CardSubmissionError
          ? error.message
          : "Could not load CardMarket variants right now.";
      return createDuplicateSubmissionPreview(userId, input, knownDuplicateResult.cards, {
        status: "variant_select",
        canForceFirecrawl: false,
        cardmarketMatches: [],
        warnings: [
          message,
          "No CardMarket versions were found. Paste the exact CardMarket URL for this variant.",
        ],
        monthlyBudget: config.monthlyCreditBudget,
      });
    }
    throw error;
  }
  let searchResponse: FirecrawlWebSearchResponse | null = null;
  const selectedUrl = input.cardmarketUrl;
  let cardmarketMatches: CardMarketVariantPreview[] = [];
  let searchCount = 0;
  let scrapeCount = 0;
  let creditsUsed = 0;
  const warnings: string[] = [];

  try {
    if (!selectedUrl) {
      const discovery = await discoverCardMarketVersionPreviews(
        input,
        knownDuplicateResult.cards,
        !guard.firecrawlAllowed
      );
      searchResponse = discovery.searchResponse;
      searchCount = discovery.searchCount;
      scrapeCount = discovery.scrapeCount;
      creditsUsed = discovery.creditsUsed;
      warnings.push(...discovery.warnings);
      cardmarketMatches = discovery.variants;

      if (cardmarketMatches.length === 0) {
        warnings.push(
          "No CardMarket versions were found. Paste the exact CardMarket URL for this variant."
        );
      }

      return createDuplicateSubmissionPreview(userId, input, knownDuplicateResult.cards, {
        status: "variant_select",
        canForceFirecrawl: false,
        cardmarketMatches,
        warnings,
        searchCount,
        scrapeCount,
        creditsUsed,
        firecrawlSearchJson: searchResponse,
        firecrawlScrapeJson:
          discovery.scrapedPages.length > 0
            ? {
                scrapedPages: discovery.scrapedPages,
                cardmarketVariants: cardmarketMatches.map((variant) => ({
                  name: variant.name,
                  setName: variant.setName,
                  cardNumber: variant.cardNumber,
                  cardmarketUrl: variant.cardmarketUrl,
                  cardmarketId: variant.cardmarketId,
                  imageUrl: variant.imageUrl,
                  languageGroup: variant.languageGroup,
                  source: variant.source,
                  existingCardId: variant.existingCard?.id ?? null,
                })),
              }
            : null,
        lastScrapedAt: discovery.scrapedPages.length > 0 ? new Date() : null,
        usage: {
          monthlyUsed: guard.usage.monthlyUsed + creditsUsed,
          dailyAttemptsUsed:
            guard.usage.dailyAttemptsUsed + (searchCount || scrapeCount ? 1 : 0),
        },
        monthlyBudget: config.monthlyCreditBudget,
      });
    }

    const scrape = await scrapePageWithFallback(selectedUrl, {
      skipFirecrawl: !guard.firecrawlAllowed,
    });
    scrapeCount += 1;
    creditsUsed += firecrawlCreditsUsed(scrape, 1);
    const parsed = parseCardMarketScrape(scrape, input.condition);
    const parsedCardMarketUrl = normalizeCardMarketUrl(parsed.sourceUrl) ?? selectedUrl;
    warnings.push(...parsed.warnings);
    const detectedName = parsed.name ?? input.name;
    const detectedSetName = parsed.setName ?? input.setName;
    const detectedCardNumber = parsed.cardNumber ?? input.cardNumber;
    const exactScrapedDuplicates = await findDuplicateCardsByCardMarketRef(input.game, parsedCardMarketUrl);
    if (exactScrapedDuplicates.length > 0) {
      return createDuplicateSubmissionPreview(userId, input, exactScrapedDuplicates, {
        canForceFirecrawl: false,
        cardmarketUrl: parsedCardMarketUrl,
        cardmarketId: extractCardMarketProductId(parsedCardMarketUrl),
        warnings: [
          ...warnings,
          `${scrape.provider === "firecrawl" ? "Firecrawl" : "Scrape.do"} found a CardMarket page that is already linked to a local card.`,
        ],
        searchCount,
        scrapeCount,
        creditsUsed,
        firecrawlSearchJson: searchResponse,
        firecrawlScrapeJson: {
          provider: scrape.provider,
          title: parsed.title,
          sourceUrl: parsed.sourceUrl,
          gradedPrices: parsed.gradedPrices,
          markdownLength: scrape.markdown.length,
          htmlLength: scrape.html.length,
        },
        lastScrapedAt: new Date(),
        usage: {
          monthlyUsed: guard.usage.monthlyUsed + creditsUsed,
          dailyAttemptsUsed: guard.usage.dailyAttemptsUsed + 1,
        },
        monthlyBudget: config.monthlyCreditBudget,
      });
    }

    const canSave = Boolean(parsed.imageUrl && parsed.nmPriceEur != null);
    const submission = await db.cardSubmission.create({
      data: {
        user_id: userId,
        status: canSave ? "preview" : "failed",
        game: input.game,
        input_name: input.name,
        input_set_name: input.setName,
        input_card_number: input.cardNumber,
        input_cardmarket_url: input.cardmarketUrl,
        input_condition: input.condition,
        normalized_key: input.normalizedKey,
        detected_name: detectedName,
        detected_set_name: detectedSetName,
        detected_card_number: detectedCardNumber,
        detected_language: parsed.language,
        detected_condition: parsed.condition,
        cardmarket_url: parsedCardMarketUrl,
        cardmarket_id: extractCardMarketProductId(parsedCardMarketUrl),
        image_url: parsed.imageUrl,
        nm_price_eur: parsed.nmPriceEur,
        confidence: parsed.confidence,
        warnings_json: serializeJson(warnings),
        firecrawl_search_json: serializeJson(searchResponse),
        firecrawl_scrape_json: serializeJson({
          provider: scrape.provider,
          title: parsed.title,
          sourceUrl: parsed.sourceUrl,
          gradedPrices: parsed.gradedPrices,
          markdownLength: scrape.markdown.length,
          htmlLength: scrape.html.length,
        }),
        search_count: searchCount,
        scrape_count: scrapeCount,
        credits_used: creditsUsed,
        last_scraped_at: new Date(),
      },
    });

    return serializeSubmission(submission, {
      usage: {
        monthlyUsed: guard.usage.monthlyUsed + creditsUsed,
        dailyAttemptsUsed: guard.usage.dailyAttemptsUsed + 1,
      },
      monthlyBudget: config.monthlyCreditBudget,
    });
  } catch (error) {
    const apiError = toFirecrawlApiError(error);
    warnings.push(apiError.message);
    const failed = await db.cardSubmission.create({
      data: {
        user_id: userId,
        status: "failed",
        game: input.game,
        input_name: input.name,
        input_set_name: input.setName,
        input_card_number: input.cardNumber,
        input_cardmarket_url: input.cardmarketUrl,
        input_condition: input.condition,
        normalized_key: input.normalizedKey,
        warnings_json: serializeJson(warnings),
        firecrawl_search_json: serializeJson(searchResponse),
        search_count: searchCount,
        scrape_count: scrapeCount,
        credits_used: creditsUsed,
      },
    });
    return serializeSubmission(failed, {
      usage: {
        monthlyUsed: guard.usage.monthlyUsed + creditsUsed,
        dailyAttemptsUsed: guard.usage.dailyAttemptsUsed + (searchCount || scrapeCount ? 1 : 0),
      },
      monthlyBudget: config.monthlyCreditBudget,
      error: apiError.message,
    });
  }
}

async function findUserSubmittedEpisode(
  tx: Prisma.TransactionClient,
  setName: string,
  game: TradingCardGame
) {
  const episodes = await tx.episode.findMany({
    where: { game, is_user_submitted: true },
    select: { id: true, name: true },
  });
  const normalized = normalizeSubmissionText(setName);
  return episodes.find((episode) => normalizeSubmissionText(episode.name) === normalized) ?? null;
}

async function getAvailableEpisodeId(
  tx: Prisma.TransactionClient,
  setName: string,
  game: TradingCardGame
): Promise<string> {
  const unscopedBase = `submitted-${slugify(setName).slice(0, 42)}-${shortHash(`${game}|${setName}`)}`;
  const base = scopeGameId(game, unscopedBase);
  for (let index = 0; index < 20; index += 1) {
    const id = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await tx.episode.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return id;
  }
  throw new CardSubmissionError("Could not create a unique submitted set id.", 500);
}

async function getAvailableCardId(
  tx: Prisma.TransactionClient,
  game: TradingCardGame,
  episodeId: string,
  name: string,
  cardNumber: string | null
): Promise<string> {
  const unscopedBase = `submitted-${slugify(episodeId).slice(0, 30)}-${slugify(cardNumber ?? name).slice(0, 30)}-${shortHash(`${game}|${episodeId}|${name}|${cardNumber ?? ""}`)}`;
  const base = scopeGameId(game, unscopedBase);
  for (let index = 0; index < 20; index += 1) {
    const id = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await tx.card.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return id;
  }
  throw new CardSubmissionError("Could not create a unique submitted card id.", 500);
}

function priceDataForLanguage(language: string | null, price: number) {
  return language === "Japanese"
    ? { cm_jp_lowest_nm: price, cm_en_lowest_nm: null }
    : { cm_en_lowest_nm: price, cm_jp_lowest_nm: null };
}

async function replaceSubmittedGradedPrices(
  tx: Prisma.TransactionClient,
  cardId: string,
  gradedPrices: SubmittedGradedPrice[],
  fetchedAt: Date
): Promise<number> {
  await tx.cardGradedPrice.deleteMany({ where: { card_id: cardId } });

  const rows = dedupeSubmittedGradedPrices(gradedPrices).map((gradedPrice) => ({
    card_id: cardId,
    label: gradedPrice.label,
    price: gradedPrice.price,
    fetched_at: fetchedAt,
  }));
  if (rows.length === 0) return 0;

  await tx.cardGradedPrice.createMany({ data: rows });
  await tx.cardGradedPriceSnapshot.createMany({ data: rows });
  return rows.length;
}

async function ensureSubmittedCollectionCopy(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    cardId: string;
    condition: string;
    language: SubmissionLanguage | null;
    priceEur: number | null;
  }
): Promise<string | null> {
  const existing = await tx.collectionCard.findFirst({
    where: {
      user_id: input.userId,
      card_id: input.cardId,
      for_sale: false,
      sold_at: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.collectionCard.create({
    data: {
      user_id: input.userId,
      card_id: input.cardId,
      purchase_price: input.priceEur,
      condition: input.condition,
      language: input.language ?? "English",
    },
    select: { id: true },
  });

  await tx.collectionWant.deleteMany({
    where: {
      user_id: input.userId,
      card_id: input.cardId,
    },
  });

  return created.id;
}

export async function saveCardSubmission(
  userId: string,
  submissionId: string
): Promise<{
  cardId: string;
  episodeId: string;
  collectionItemId: string | null;
  preview: CardSubmissionPreview;
}> {
  const submission = await db.cardSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new CardSubmissionError("Submission not found.", 404);
  if (submission.user_id !== userId) throw new CardSubmissionError("Submission does not belong to this user.", 403);
  if (submission.status === "added" && submission.card_id && submission.episode_id) {
    const submissionCondition = normalizeSubmissionCondition(
      submission.detected_condition ?? submission.input_condition
    );
    const collectionItemId = await db.$transaction((tx) =>
      ensureSubmittedCollectionCopy(tx, {
        userId,
        cardId: submission.card_id as string,
        condition: submissionCondition,
        language: (submission.detected_language as SubmissionLanguage | null) ?? null,
        priceEur: submission.nm_price_eur,
      })
    );
    if (collectionItemId) {
      await syncMissingBinderWantsAfterCollectionChange(userId);
    }
    return {
      cardId: submission.card_id,
      episodeId: submission.episode_id,
      collectionItemId,
      preview: serializeSubmission(submission),
    };
  }
  if (submission.status !== "preview") {
    throw new CardSubmissionError("Only preview submissions can be saved.");
  }
  if (!submission.image_url || !submission.cardmarket_url || submission.nm_price_eur == null) {
    throw new CardSubmissionError("Submission needs an image, CardMarket URL and NM price before saving.");
  }
  const submissionImageUrl = submission.image_url;
  const submissionCardMarketUrl = submission.cardmarket_url;
  const submissionNmPriceEur = submission.nm_price_eur;
  const submissionCondition = normalizeSubmissionCondition(
    submission.detected_condition ?? submission.input_condition
  );
  const submissionGame = normalizeTradingCardGame(submission.game);

  const duplicateResult = await findDuplicateCards({
    game: submissionGame,
    name: submission.detected_name ?? submission.input_name,
    setName:
      (submission.detected_set_name ?? submission.input_set_name) ||
      inferSetNameFromCardMarketUrl(submission.cardmarket_url) ||
      "",
    cardNumber:
      submission.detected_card_number ??
      submission.input_card_number ??
      inferCardNumberFromCardMarketUrl(submission.cardmarket_url),
    cardmarketUrl: submission.cardmarket_url,
    condition: normalizeSubmissionCondition(
      submission.detected_condition ?? submission.input_condition
    ),
    skipDuplicateCheck: false,
    normalizedKey: submission.normalized_key,
  });
  if (duplicateResult.exactCardmarketUrl && duplicateResult.cards[0]) {
    const updated = await db.cardSubmission.update({
      where: { id: submission.id },
      data: {
        status: "duplicate",
        duplicate_card_id: duplicateResult.cards[0].id,
      },
    });
    throw new CardSubmissionError(`Card already exists: ${updated.duplicate_card_id}`, 409);
  }

  const saved = await db.$transaction(async (tx) => {
    const cardName = submission.detected_name ?? submission.input_name;
    const cardNumber =
      submission.detected_card_number ??
      submission.input_card_number ??
      inferCardNumberFromCardMarketUrl(submission.cardmarket_url);
    const setName = getSubmittedEpisodeName(
      (submission.detected_set_name ?? submission.input_set_name) ||
        inferSetNameFromCardMarketUrl(submission.cardmarket_url),
      submissionGame,
      cardNumber
    );
    const existingEpisode = await findUserSubmittedEpisode(tx, setName, submissionGame);
    const episodeId = existingEpisode?.id ?? (await getAvailableEpisodeId(tx, setName, submissionGame));

    if (!existingEpisode) {
      await tx.episode.create({
        data: {
          id: episodeId,
          game: submissionGame,
          name: setName,
          code: null,
          card_count: 0,
          printed_card_count: null,
          source_status: SUBMITTED_SOURCE_STATUS,
          is_user_submitted: true,
          synced_at: new Date(),
        },
      });
    }

    const cardId = await getAvailableCardId(tx, submissionGame, episodeId, cardName, cardNumber);
    const now = new Date();

    await tx.card.create({
      data: {
        id: cardId,
        game: submissionGame,
        episode_id: episodeId,
        name: cardName,
        card_number: cardNumber,
        printed_card_number: cardNumber,
        rarity: null,
        hp: null,
        supertype: submissionGame === ONE_PIECE_GAME ? "One Piece" : "Pokemon",
        subtypes: null,
        artist: null,
        image_url: submissionImageUrl,
        tcggo_url: null,
        cardmarket_url: submissionCardMarketUrl,
        cardmarket_id: submission.cardmarket_id,
        tcgplayer_id: null,
        price_source_status: null,
        price_source_checked_at: now,
        is_user_submitted: true,
        submitted_by_user_id: userId,
      },
    });

    if (isNearMintCondition(submissionCondition)) {
      await tx.price.create({
        data: {
          card_id: cardId,
          fetched_at: now,
          changed_at: now,
          ...priceDataForLanguage(submission.detected_language, submissionNmPriceEur),
        },
      });
    }

    await replaceSubmittedGradedPrices(
      tx,
      cardId,
      parseStoredGradedPrices(submission.firecrawl_scrape_json),
      now
    );

    const collectionItemId = await ensureSubmittedCollectionCopy(tx, {
      userId,
      cardId,
      condition: submissionCondition,
      language: (submission.detected_language as SubmissionLanguage | null) ?? null,
      priceEur: submissionNmPriceEur,
    });

    const cardCount = await tx.card.count({ where: { episode_id: episodeId } });
    await tx.episode.update({
      where: { id: episodeId },
      data: { card_count: cardCount, source_checked_at: now, synced_at: now },
    });

    const updatedSubmission = await tx.cardSubmission.update({
      where: { id: submission.id },
      data: {
        status: "added",
        detected_condition: submissionCondition,
        card_id: cardId,
        episode_id: episodeId,
      },
    });

    return { cardId, episodeId, collectionItemId, submission: updatedSubmission };
  });

  if (saved.collectionItemId) {
    await syncMissingBinderWantsAfterCollectionChange(userId);
  }

  return {
    cardId: saved.cardId,
    episodeId: saved.episodeId,
    collectionItemId: saved.collectionItemId,
    preview: serializeSubmission(saved.submission),
  };
}

export async function listAdminCardSubmissions(): Promise<AdminCardSubmissionItem[]> {
  const submissions = await db.cardSubmission.findMany({
    where: {
      status: { in: ["added", "possible_tcggo_match"] },
    },
    orderBy: { updated_at: "desc" },
    take: 80,
  });

  return submissions.map((submission) => ({
    ...serializeSubmission(submission),
    createdAt: submission.created_at.toISOString(),
    updatedAt: submission.updated_at.toISOString(),
    migratedAt: submission.migrated_at?.toISOString() ?? null,
    officialCardId: submission.official_card_id,
  }));
}

export async function listUserSubmittedCards(userId: string): Promise<UserSubmittedCardItem[]> {
  const submissions = await db.cardSubmission.findMany({
    where: {
      user_id: userId,
      status: "added",
      card_id: { not: null },
    },
    orderBy: { updated_at: "desc" },
    take: 80,
    select: {
      id: true,
      game: true,
      status: true,
      detected_language: true,
      detected_condition: true,
      input_condition: true,
      nm_price_eur: true,
      cardmarket_url: true,
      created_at: true,
      updated_at: true,
      card: {
        select: {
          id: true,
          game: true,
          name: true,
          card_number: true,
          printed_card_number: true,
          image_url: true,
          cardmarket_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          gradedPrices: {
            select: {
              label: true,
              price: true,
            },
            orderBy: [{ label: "asc" }],
          },
        },
      },
    },
  });

  return submissions
    .filter((submission): submission is typeof submission & { card: NonNullable<typeof submission.card> } =>
      Boolean(submission.card)
    )
    .map((submission) => ({
      id: submission.id,
      game: normalizeTradingCardGame(submission.game),
      status: submission.status as SubmissionStatus,
      createdAt: submission.created_at.toISOString(),
      updatedAt: submission.updated_at.toISOString(),
      card: {
        id: submission.card.id,
        name: submission.card.name,
        setName: submission.card.episode.name,
        episodeId: submission.card.episode.id,
        episodeCode: submission.card.episode.code,
        cardNumber: submission.card.printed_card_number ?? submission.card.card_number,
        imageUrl: submission.card.image_url,
        cardmarketUrl: submission.card.cardmarket_url ?? submission.cardmarket_url,
        language: (submission.detected_language as SubmissionLanguage | null) ?? null,
        condition: normalizeSubmissionCondition(
          submission.detected_condition ?? submission.input_condition
        ),
        priceEur: submission.nm_price_eur,
        gradedPrices: dedupeSubmittedGradedPrices(submission.card.gradedPrices),
      },
    }));
}

export async function updateAdminCardSubmission(
  submissionId: string,
  input: {
    name?: unknown;
    setName?: unknown;
    cardNumber?: unknown;
    cardmarketUrl?: unknown;
    imageUrl?: unknown;
    language?: unknown;
    condition?: unknown;
    nmPriceEur?: unknown;
  }
): Promise<AdminCardSubmissionItem> {
  const name = asString(input.name);
  const setName = asString(input.setName);
  const cardNumber = asString(input.cardNumber) || null;
  const cardmarketUrl = asString(input.cardmarketUrl);
  const imageUrl = asString(input.imageUrl);
  const language = asString(input.language);
  const condition = normalizeSubmissionCondition(input.condition);
  const rawPrice = Number(input.nmPriceEur);
  const nmPriceEur = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null;
  const normalizedLanguage: SubmissionLanguage | null =
    language === "Japanese" ? "Japanese" : language === "English" ? "English" : null;

  if (!name) throw new CardSubmissionError("Name is required.");
  if (!cardNumber || !normalizeCardNumber(cardNumber)) {
    throw new CardSubmissionError("Card number is required.");
  }
  if (!nmPriceEur) throw new CardSubmissionError("A valid NM price is required.");
  const normalizedUrl = cardmarketUrl ? normalizeCardMarketUrl(cardmarketUrl) : null;
  if (cardmarketUrl && !normalizedUrl) throw new CardSubmissionError("Use a valid CardMarket URL.");

  const updated = await db.$transaction(async (tx) => {
    const submission = await tx.cardSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new CardSubmissionError("Submission not found.", 404);
    const submissionGame = normalizeTradingCardGame(submission.game);
    if (normalizedUrl && !isCardMarketProductUrl(normalizedUrl, submissionGame)) {
      throw new CardSubmissionError(`Use a valid ${getGameLabel(submissionGame)} CardMarket card URL.`);
    }

    if (submission.card_id) {
      const card = await tx.card.findUnique({
        where: { id: submission.card_id },
        select: { id: true, episode_id: true, is_user_submitted: true },
      });
      if (card?.is_user_submitted) {
        await tx.card.update({
          where: { id: card.id },
          data: {
            name,
            card_number: cardNumber,
            printed_card_number: cardNumber,
            image_url: imageUrl || null,
            cardmarket_url: normalizedUrl,
            price_source_checked_at: new Date(),
          },
        });
        if (isNearMintCondition(condition)) {
          const priceFetchedAt = new Date();
          await tx.price.create({
            data: {
              card_id: card.id,
              fetched_at: priceFetchedAt,
              changed_at: priceFetchedAt,
              ...priceDataForLanguage(normalizedLanguage, nmPriceEur),
            },
          });
        }
        await tx.episode.update({
          where: { id: card.episode_id },
          data: {
            name: getSubmittedEpisodeName(setName, submissionGame, cardNumber),
            source_checked_at: new Date(),
          },
        });
      }
    }

    return tx.cardSubmission.update({
      where: { id: submissionId },
      data: {
        detected_name: name,
        detected_set_name: setName || null,
        detected_card_number: cardNumber,
        detected_language: normalizedLanguage,
        detected_condition: condition,
        cardmarket_url: normalizedUrl,
        image_url: imageUrl || null,
        nm_price_eur: nmPriceEur,
        status: submission.status === "failed" ? "preview" : submission.status,
      },
    });
  });

  return {
    ...serializeSubmission(updated),
    createdAt: updated.created_at.toISOString(),
    updatedAt: updated.updated_at.toISOString(),
    migratedAt: updated.migrated_at?.toISOString() ?? null,
    officialCardId: updated.official_card_id,
  };
}

async function deleteSubmittedCard(
  tx: Prisma.TransactionClient,
  cardId: string
): Promise<string | null> {
  const card = await tx.card.findUnique({
    where: { id: cardId },
    select: { id: true, episode_id: true, is_user_submitted: true },
  });
  if (!card?.is_user_submitted) return null;

  await tx.collectionCardTag.deleteMany({
    where: { collection_card: { card_id: card.id } },
  });
  await tx.collectionCard.deleteMany({ where: { card_id: card.id } });
  await tx.collectionWant.deleteMany({ where: { card_id: card.id } });
  await tx.ebayListingCardOverride.updateMany({
    where: { card_id: card.id },
    data: { card_id: null, status: "ignored" },
  });
  await tx.price.deleteMany({ where: { card_id: card.id } });
  await tx.cardSubmission.updateMany({ where: { card_id: card.id }, data: { card_id: null } });
  await tx.card.delete({ where: { id: card.id } });

  const remainingCards = await tx.card.count({ where: { episode_id: card.episode_id } });
  const episode = await tx.episode.findUnique({
    where: { id: card.episode_id },
    select: { id: true, is_user_submitted: true },
  });
  if (episode?.is_user_submitted && remainingCards === 0) {
    await tx.episode.delete({ where: { id: episode.id } });
    return null;
  }
  if (episode?.is_user_submitted) {
    await tx.episode.update({ where: { id: episode.id }, data: { card_count: remainingCards } });
  }
  return card.episode_id;
}

export async function deleteAdminCardSubmission(submissionId: string): Promise<{ ok: true }> {
  await db.$transaction(async (tx) => {
    const submission = await tx.cardSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new CardSubmissionError("Submission not found.", 404);
    if (submission.card_id) await deleteSubmittedCard(tx, submission.card_id);
    await tx.cardSubmission.update({
      where: { id: submissionId },
      data: { status: "deleted", card_id: null, episode_id: null },
    });
  });
  return { ok: true };
}

export async function refreshAdminCardSubmission(submissionId: string): Promise<AdminCardSubmissionItem> {
  const submission = await db.cardSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new CardSubmissionError("Submission not found.", 404);
  const input = normalizeInput({
    game: submission.game,
    name: submission.detected_name ?? submission.input_name,
    setName: submission.detected_set_name ?? submission.input_set_name,
    cardNumber: submission.detected_card_number ?? submission.input_card_number,
    cardmarketUrl: submission.cardmarket_url ?? submission.input_cardmarket_url,
    condition: submission.detected_condition ?? submission.input_condition,
  });
  const guard = await assertScraperBudget(
    submission.user_id ?? "admin",
    input.cardmarketUrl ? 1 : 3
  );

  let selectedUrl = input.cardmarketUrl;
  let searchResponse: FirecrawlWebSearchResponse | null = null;
  let searchCount = 0;
  let creditsUsed = 0;

  if (!selectedUrl) {
    let providerSearch: ProviderWebSearchResponse;
    try {
      providerSearch = await searchWebWithFallback({
        query: buildSearchQuery(input),
        limit: 3,
        includeDomains: [CARDMARKET_DOMAIN],
        skipFirecrawl: !guard.firecrawlAllowed,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new CardSubmissionError(`Card lookup failed on every search provider: ${detail}`, 502);
    }
    searchResponse = providerSearch;
    searchCount = 1;
    creditsUsed += firecrawlCreditsUsed(providerSearch, 2);
    selectedUrl = pickSearchCandidate(searchResponse, input);
  }
  if (!selectedUrl) throw new CardSubmissionError("No CardMarket URL found for refresh.", 404);

  let scrape: ProviderPageScrapeResult;
  try {
    scrape = await scrapePageWithFallback(selectedUrl, {
      skipFirecrawl: !guard.firecrawlAllowed,
    });
  } catch (error) {
    // Surface the real provider failure instead of a generic 500; the same
    // message ends up in the auto-refresh warnings.
    const detail = error instanceof Error ? error.message : String(error);
    throw new CardSubmissionError(`Price refresh failed: ${detail}`, 502);
  }
  creditsUsed += firecrawlCreditsUsed(scrape, 1);
  const parsed = parseCardMarketScrape(scrape, input.condition);
  if (!parsed.imageUrl || parsed.nmPriceEur == null) {
    throw new CardSubmissionError(parsed.warnings[0] ?? "Refresh did not find image and price.", 422);
  }
  const parsedImageUrl = parsed.imageUrl;
  const parsedNmPriceEur = parsed.nmPriceEur;
  const parsedCardMarketUrl = normalizeCardMarketUrl(parsed.sourceUrl) ?? selectedUrl;
  const parsedName = parsed.name ?? submission.detected_name ?? submission.input_name;
  const parsedSetName = parsed.setName ?? submission.detected_set_name ?? submission.input_set_name;
  const parsedCardNumber =
    parsed.cardNumber ?? submission.detected_card_number ?? submission.input_card_number;

  const updated = await db.$transaction(async (tx) => {
    if (submission.card_id) {
      const card = await tx.card.findUnique({
        where: { id: submission.card_id },
        select: { episode_id: true },
      });
      await tx.card.update({
        where: { id: submission.card_id },
        data: {
          image_url: parsedImageUrl,
          name: parsedName,
          card_number: parsedCardNumber,
          printed_card_number: parsedCardNumber,
          cardmarket_url: parsedCardMarketUrl,
          cardmarket_id: extractCardMarketProductId(parsedCardMarketUrl),
          price_source_status: null,
          price_source_checked_at: new Date(),
        },
      });
      if (card?.episode_id && parsedSetName) {
        await tx.episode.update({
          where: { id: card.episode_id },
          data: { name: parsedSetName, source_checked_at: new Date() },
        });
      }
      if (isNearMintCondition(parsed.condition)) {
        const priceFetchedAt = new Date();
        await tx.price.create({
          data: {
            card_id: submission.card_id,
            fetched_at: priceFetchedAt,
            changed_at: priceFetchedAt,
            ...priceDataForLanguage(parsed.language, parsedNmPriceEur),
          },
        });
      }
      await replaceSubmittedGradedPrices(tx, submission.card_id, parsed.gradedPrices, new Date());
    }

    return tx.cardSubmission.update({
      where: { id: submissionId },
      data: {
        status: submission.status === "failed" ? "preview" : submission.status,
        detected_name: parsedName,
        detected_set_name: parsedSetName || null,
        detected_card_number: parsedCardNumber,
        detected_language: parsed.language,
        detected_condition: parsed.condition,
        cardmarket_url: parsedCardMarketUrl,
        cardmarket_id: extractCardMarketProductId(parsedCardMarketUrl),
        image_url: parsedImageUrl,
        nm_price_eur: parsedNmPriceEur,
        confidence: parsed.confidence,
        warnings_json: serializeJson(parsed.warnings),
        firecrawl_search_json: serializeJson(searchResponse),
        firecrawl_scrape_json: serializeJson({
          provider: scrape.provider,
          title: parsed.title,
          sourceUrl: parsed.sourceUrl,
          gradedPrices: parsed.gradedPrices,
          markdownLength: scrape.markdown.length,
          htmlLength: scrape.html.length,
        }),
        search_count: { increment: searchCount },
        scrape_count: { increment: 1 },
        credits_used: { increment: creditsUsed },
        last_scraped_at: new Date(),
      },
    });
  });

  return {
    ...serializeSubmission(updated),
    createdAt: updated.created_at.toISOString(),
    updatedAt: updated.updated_at.toISOString(),
    migratedAt: updated.migrated_at?.toISOString() ?? null,
    officialCardId: updated.official_card_id,
  };
}

export async function countDueSubmittedCardSubmissions(options?: {
  now?: Date;
  intervalMs?: number;
  game?: TradingCardGame;
}): Promise<number> {
  const now = options?.now ?? new Date();
  const intervalMs = Math.max(options?.intervalMs ?? 0, 0);
  const dueBefore = new Date(now.getTime() - intervalMs);
  const rows = await db.$queryRaw<Array<{ count: number | bigint }>>`
    SELECT COUNT(*) AS count
    FROM "CardSubmission" s
    INNER JOIN "Card" c ON c.id = s.card_id
    WHERE s.status = 'added'
      AND s.card_id IS NOT NULL
      AND s.cardmarket_url IS NOT NULL
      AND c.is_user_submitted = 1
      AND (${options?.game ?? null} IS NULL OR c.game = ${options?.game ?? null})
      AND MAX(
        COALESCE(c.price_source_checked_at, '1970-01-01T00:00:00.000Z'),
        COALESCE(s.last_scraped_at, '1970-01-01T00:00:00.000Z'),
        s.updated_at,
        s.created_at
      ) < ${dueBefore}
  `;

  const count = rows[0]?.count ?? 0;
  return typeof count === "bigint" ? Number(count) : Number(count);
}

export async function refreshDueSubmittedCardSubmissions(options?: {
  now?: Date;
  intervalMs?: number;
  maxSubmissions?: number;
  game?: TradingCardGame;
  throwIfCancelled?: () => Promise<void>;
}): Promise<SubmittedCardAutoRefreshResult> {
  const now = options?.now ?? new Date();
  const intervalMs = Math.max(options?.intervalMs ?? 0, 0);
  const dueBefore = new Date(now.getTime() - intervalMs);
  const maxSubmissions = Math.max(options?.maxSubmissions ?? 0, 0);
  const candidateSubmissions = await countDueSubmittedCardSubmissions({
    now,
    intervalMs,
    game: options?.game,
  });

  if (candidateSubmissions === 0 || maxSubmissions === 0) {
    return {
      candidateSubmissions,
      selectedSubmissions: 0,
      refreshedSubmissions: 0,
      failedSubmissions: 0,
    };
  }

  const submissions = await db.$queryRaw<
    Array<{
      id: string;
      cardId: string;
      latestFetchedAt: Date | string | null;
    }>
  >`
    SELECT
      s.id,
      s.card_id AS "cardId",
      c.price_source_checked_at AS "latestFetchedAt"
    FROM "CardSubmission" s
    INNER JOIN "Card" c ON c.id = s.card_id
    WHERE s.status = 'added'
      AND s.card_id IS NOT NULL
      AND s.cardmarket_url IS NOT NULL
      AND c.is_user_submitted = 1
      AND (${options?.game ?? null} IS NULL OR c.game = ${options?.game ?? null})
      AND MAX(
        COALESCE(c.price_source_checked_at, '1970-01-01T00:00:00.000Z'),
        COALESCE(s.last_scraped_at, '1970-01-01T00:00:00.000Z'),
        s.updated_at,
        s.created_at
      ) < ${dueBefore}
    ORDER BY MAX(
      COALESCE(c.price_source_checked_at, '1970-01-01T00:00:00.000Z'),
      COALESCE(s.last_scraped_at, '1970-01-01T00:00:00.000Z'),
      s.updated_at,
      s.created_at
    ) ASC
    LIMIT ${maxSubmissions}
  `;

  let refreshedSubmissions = 0;
  let failedSubmissions = 0;

  for (const submission of submissions) {
    await options?.throwIfCancelled?.();

    try {
      await refreshAdminCardSubmission(submission.id);
      refreshedSubmissions += 1;
    } catch (error) {
      if (error instanceof CardSubmissionError && error.status === 429) {
        break;
      }

      failedSubmissions += 1;
      const message = error instanceof Error ? error.message : String(error);
      await db.cardSubmission.update({
        where: { id: submission.id },
        data: {
          warnings_json: serializeJson([`Auto refresh skipped: ${message}`]),
          last_scraped_at: now,
        },
      });
    }
  }

  return {
    candidateSubmissions,
    selectedSubmissions: submissions.length,
    refreshedSubmissions,
    failedSubmissions,
  };
}

function officialMatchesSubmission(
  submission: {
    input_name: string;
    input_set_name: string;
    input_card_number: string | null;
    detected_name: string | null;
    detected_set_name: string | null;
    detected_card_number: string | null;
    cardmarket_url: string | null;
    cardmarket_id: string | null;
  },
  officialEpisodeName: string,
  officialCard: OfficialReconciliationCard
): "hard" | "possible" | null {
  if (submission.cardmarket_id && officialCard.cardmarket_id === submission.cardmarket_id) {
    return "hard";
  }

  const submissionUrl = normalizeCardMarketUrl(submission.cardmarket_url);
  const officialUrl = normalizeCardMarketUrl(officialCard.cardmarket_url);
  if (submissionUrl && officialUrl && submissionUrl === officialUrl) {
    return "hard";
  }

  const submissionName = normalizeSubmissionText(submission.detected_name ?? submission.input_name);
  const submissionSet = normalizeSubmissionText(submission.detected_set_name ?? submission.input_set_name);
  const submissionNumber = normalizeCardNumber(
    submission.detected_card_number ?? submission.input_card_number
  );
  const compactSubmissionNumber = compactCardNumber(
    submission.detected_card_number ?? submission.input_card_number
  );
  const officialNumbers = [
    normalizeCardNumber(officialCard.card_number),
    normalizeCardNumber(officialCard.printed_card_number),
    normalizeCardNumber(officialCard.printed_card_number?.split("/")[0]),
  ].filter(Boolean);
  const compactOfficialNumbers = [
    compactCardNumber(officialCard.card_number),
    compactCardNumber(officialCard.printed_card_number),
    compactCardNumber(officialCard.printed_card_number?.split("/")[0]),
  ].filter(Boolean);
  const nameMatches = normalizeSubmissionText(officialCard.name) === submissionName;
  const hasSubmittedSet = Boolean(submissionSet);
  const setMatches = hasSubmittedSet && normalizeSubmissionText(officialEpisodeName) === submissionSet;
  const numberMatches =
    Boolean(submissionNumber) &&
    (officialNumbers.includes(submissionNumber) ||
      compactOfficialNumbers.includes(compactSubmissionNumber));

  if (nameMatches && numberMatches && (!hasSubmittedSet || setMatches)) return "hard";
  if (nameMatches && numberMatches) return "possible";
  return null;
}

async function migrateSubmittedCardToOfficial(
  tx: Prisma.TransactionClient,
  submission: {
    id: string;
    card_id: string | null;
    episode_id: string | null;
  },
  officialCardId: string,
  migratedAt: Date
) {
  if (!submission.card_id || submission.card_id === officialCardId) return false;

  await tx.collectionCard.updateMany({
    where: { card_id: submission.card_id },
    data: { card_id: officialCardId },
  });

  const wants = await tx.collectionWant.findMany({
    where: { card_id: submission.card_id },
    select: { id: true, user_id: true, notes: true },
  });
  for (const want of wants) {
    const existing = await tx.collectionWant.findUnique({
      where: { user_id_card_id: { user_id: want.user_id, card_id: officialCardId } },
      select: { id: true, notes: true },
    });
    if (existing) {
      if (!existing.notes && want.notes) {
        await tx.collectionWant.update({
          where: { id: existing.id },
          data: { notes: want.notes },
        });
      }
      await tx.collectionWant.delete({ where: { id: want.id } });
    } else {
      await tx.collectionWant.update({
        where: { id: want.id },
        data: { card_id: officialCardId },
      });
    }
  }

  await tx.ebayListingCardOverride.updateMany({
    where: { card_id: submission.card_id },
    data: { card_id: officialCardId },
  });
  await tx.cardSubmission.update({
    where: { id: submission.id },
    data: {
      status: "migrated_to_tcggo",
      official_card_id: officialCardId,
      migrated_at: migratedAt,
      card_id: null,
    },
  });
  await deleteSubmittedCard(tx, submission.card_id);
  return true;
}

export async function reconcileSubmittedCardsForOfficialEpisode(
  tx: Prisma.TransactionClient,
  input: {
    game: TradingCardGame;
    officialEpisodeId: string;
    officialEpisodeName: string;
    officialCards: OfficialReconciliationCard[];
    migratedAt: Date;
  }
): Promise<{ migrated: number; possible: number }> {
  const submissions = await tx.cardSubmission.findMany({
    where: {
      game: input.game,
      status: "added",
      card_id: { not: null },
    },
    select: {
      id: true,
      card_id: true,
      episode_id: true,
      input_name: true,
      input_set_name: true,
      input_card_number: true,
      detected_name: true,
      detected_set_name: true,
      detected_card_number: true,
      cardmarket_url: true,
      cardmarket_id: true,
      card: { select: { is_user_submitted: true } },
    },
  });

  let migrated = 0;
  let possible = 0;

  for (const submission of submissions) {
    if (!submission.card?.is_user_submitted) continue;

    let possibleMatch: OfficialReconciliationCard | null = null;
    for (const officialCard of input.officialCards) {
      const match = officialMatchesSubmission(submission, input.officialEpisodeName, officialCard);
      if (match === "hard") {
        if (await migrateSubmittedCardToOfficial(tx, submission, officialCard.id, input.migratedAt)) {
          migrated += 1;
        }
        possibleMatch = null;
        break;
      }
      if (match === "possible") possibleMatch = officialCard;
    }

    if (possibleMatch) {
      await tx.cardSubmission.update({
        where: { id: submission.id },
        data: {
          status: "possible_tcggo_match",
          official_card_id: possibleMatch.id,
        },
      });
      possible += 1;
    }
  }

  return { migrated, possible };
}
