import { buildCardMarketProductUrl, buildCardMarketSealedProductUrl } from "@/lib/cardmarket";
import { getRapidApiHeaders } from "@/lib/env";
import { assertScraperRequestsEnabled } from "@/lib/scraper-guard";
import { getTcgdexImageLookup, resolveTcgdexImageUrl } from "@/lib/tcgdex";
import { recordTcggoQuotaSnapshot } from "@/lib/tcggo-usage";

const BASE_URL = "https://cardmarket-api-tcg.p.rapidapi.com";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 500, 502, 503, 504]);
const HISTORY_PAGE_FETCH_DELAY_MS = 250;
const RATE_LIMIT_RETRY_DELAY_MS = 2_000;
export const TCGGO_REQUEST_CONCURRENCY = 8;

// RapidAPI plan caps requests at 300 per rolling minute. We track outgoing
// timestamps in a sliding window so concurrent in-flight requests still respect
// the per-minute ceiling.
const MAX_REQUESTS_PER_MINUTE = 300;
const RATE_LIMIT_WINDOW_MS = 60_000;
const recentRequestTimestamps: number[] = [];

function pruneRateLimitWindow(now: number): void {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (recentRequestTimestamps.length > 0 && recentRequestTimestamps[0] <= cutoff) {
    recentRequestTimestamps.shift();
  }
}

/**
 * Returns 0 if a request can run right now, otherwise the number of milliseconds
 * to wait before the rate window has room for another request.
 */
function getRateLimitWaitMs(now: number): number {
  pruneRateLimitWindow(now);
  if (recentRequestTimestamps.length < MAX_REQUESTS_PER_MINUTE) return 0;
  const oldest = recentRequestTimestamps[0];
  return Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now);
}

function recordRateLimitedRequest(now: number): void {
  recentRequestTimestamps.push(now);
}

// Actual API shapes (from live testing)
interface RawEpisode {
  id: number;
  name: string;
  code?: string;
  released_at?: string;
  cards_total?: number;
  logo?: string | null;
  symbol?: string | null;
  series?: { id: number; name: string; slug: string } | null;
}

interface RawCard {
  id: number;
  name: string;
  card_number?: number | string | null;
  rarity?: string;
  hp?: number;
  supertype?: string;
  subtypes?: string[];
  artist?: { id: number; name: string; slug: string } | null;
  image?: string | null;
  tcggo_url?: string;
  tcgid?: string | number | null;
  cardmarket_id?: string | number | null;
  tcgplayer_id?: string | number | null;
  prices?: RawPrices;
  score?: RawCardScore | number | null;
  scores?: RawCardScore | null;
  metrics?: RawCardScore | null;
  tcggo_score?: RawCardScore | number | null;
  tcggo_score_tier?: string | null;
  tier?: string | null;
  momentum?: number | string | null;
  stability?: number | string | null;
  liquidity?: number | string | null;
  demand?: number | string | null;
  market_depth?: number | string | null;
  grade_premium?: number | string | null;
  rsi?: number | string | null;
  ath?: number | string | null;
  atl?: number | string | null;
  score_updated_at?: string | null;
  tcggo_score_updated_at?: string | null;
}

type RawScoreValue = number | string | null | undefined;

interface RawCardScore {
  score?: RawScoreValue;
  value?: RawScoreValue;
  total?: RawScoreValue;
  overall?: RawScoreValue;
  tcggo_score?: RawScoreValue;
  tier?: string | null;
  rank?: string | null;
  momentum?: RawScoreValue;
  stability?: RawScoreValue;
  liquidity?: RawScoreValue;
  demand?: RawScoreValue;
  market_depth?: RawScoreValue;
  marketDepth?: RawScoreValue;
  grade_premium?: RawScoreValue;
  gradePremium?: RawScoreValue;
  rsi?: RawScoreValue;
  ath?: RawScoreValue;
  atl?: RawScoreValue;
  all_time_high?: RawScoreValue;
  allTimeHigh?: RawScoreValue;
  all_time_low?: RawScoreValue;
  allTimeLow?: RawScoreValue;
  updated_at?: string | null;
  updatedAt?: string | null;
}

interface RawPrices {
  cardmarket?: {
    lowest_near_mint?: number;
    lowest_near_mint_EU_only?: number;
    lowest_near_mint_DE?: number;
    lowest_near_mint_DE_EU_only?: number;
    lowest_near_mint_FR?: number;
    lowest_near_mint_FR_EU_only?: number;
    lowest_near_mint_ES?: number;
    lowest_near_mint_ES_EU_only?: number;
    lowest_near_mint_IT?: number;
    lowest_near_mint_IT_EU_only?: number;
    "30d_average"?: number;
    "7d_average"?: number;
    graded?: RawGradedPrices | null;
  };
  ebay?: {
    currency?: string | null;
    graded?: RawEbaySoldGradedPrices | null;
  };
  tcg_player?: {
    currency?: string;
    market_price?: number;
    mid_price?: number;
    low_price?: number;
  };
}

type RawGradedPrices =
  | Array<{
      grade?: string | null;
      price?: number | null;
    }>
  | Record<string, Record<string, number | null> | number | null>;

type RawEbaySoldGradedPriceValue =
  | number
  | string
  | {
      median_price?: RawScoreValue;
      medianPrice?: RawScoreValue;
      price?: RawScoreValue;
      sample_size?: RawScoreValue;
      sampleSize?: RawScoreValue;
    }
  | null;

type RawEbaySoldGradedPrices =
  | Array<{
      company?: string | null;
      grade?: string | null;
      median_price?: RawScoreValue;
      medianPrice?: RawScoreValue;
      price?: RawScoreValue;
      sample_size?: RawScoreValue;
      sampleSize?: RawScoreValue;
      currency?: string | null;
    }>
  | Record<string, Record<string, RawEbaySoldGradedPriceValue> | RawEbaySoldGradedPriceValue>;

interface RawSealedProduct {
  id: number;
  name: string;
  image?: string | null;
  tcggo_url?: string | null;
  cardmarket_id?: string | number | null;
  tcgplayer_id?: string | number | null;
  links?: {
    cardmarket?: string | null;
  } | null;
  prices?: {
    cardmarket?: {
      lowest?: number;
      lowest_EU_only?: number;
      lowest_DE?: number;
      lowest_FR?: number;
      lowest_ES?: number;
      lowest_IT?: number;
      "30d_average"?: number;
      "7d_average"?: number;
    };
  } | null;
}

export interface NormalizedEpisode {
  id: string;
  name: string;
  code: string | null;
  release_date: string | null;
  card_count: number | null;
  logo_url: string | null;
  symbol_url: string | null;
  series: string | null;
}

export interface NormalizedCard {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  image_url: string | null;
  cardmarket_url: string | null;
  tcggo_url: string | null;
  tcgid: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
  score: TcggoCardScoreData;
  prices: RawPrices | undefined;
}

export interface TcggoCardScoreData {
  tcggo_score: number | null;
  tcggo_score_tier: string | null;
  tcggo_score_momentum: number | null;
  tcggo_score_stability: number | null;
  tcggo_score_liquidity: number | null;
  tcggo_score_demand: number | null;
  tcggo_score_market_depth: number | null;
  tcggo_score_grade_premium: number | null;
  tcggo_score_rsi: number | null;
  tcggo_score_ath: number | null;
  tcggo_score_atl: number | null;
  tcggo_score_updated_at: Date | null;
}

export interface NormalizedGradedPrice {
  label: string;
  price: number;
}

export interface NormalizedEbaySoldGradedPrice {
  source: "ebay_sold";
  label: string;
  company: string;
  grade: string;
  median_price: number;
  currency: string;
  sample_size: number | null;
}

export interface TcggoHistoryPricePoint {
  date: string;
  label: string;
  cm_market: number | null;
  cm_market_de: number | null;
  cm_market_fr: number | null;
  cm_market_es: number | null;
  cm_market_it: number | null;
  tcp_market: number | null;
}

export interface NormalizedSealedProduct {
  id: string;
  name: string;
  image_url: string | null;
  tcggo_url: string | null;
  cardmarket_url: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
  price: {
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
    cm_avg_7d: number | null;
    cm_avg_30d: number | null;
  };
}

export class TcggoQuotaExceededError extends Error {
  path: string;
  resetAt: Date | null;

  constructor(path: string, resetAt: Date | null = null) {
    super("TCGGO scraper requests are exhausted. Wait for the quota reset and try again.");
    this.name = "TcggoQuotaExceededError";
    this.path = path;
    this.resetAt = resetAt;
  }
}

export function isTcggoQuotaExceededError(
  error: unknown
): error is TcggoQuotaExceededError {
  return error instanceof TcggoQuotaExceededError;
}

interface RuntimeQuotaSnapshot {
  requestsLimit: number | null;
  requestsRemaining: number | null;
  quotaResetsAt: Date | null;
  observedAt: Date | null;
}

interface TcggoRequestRuntimeSnapshot extends RuntimeQuotaSnapshot {
  requestConcurrency: number;
  activeRequests: number;
  queuedRequests: number;
}

let runtimeQuotaSnapshot: RuntimeQuotaSnapshot = {
  requestsLimit: null,
  requestsRemaining: null,
  quotaResetsAt: null,
  observedAt: null,
};
let activeTcggoRequests = 0;
const tcggoRequestQueue: Array<() => void> = [];

function parseHeaderInt(value: string | null): number | null {
  if (value == null) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuotaResetAt(headers: Headers): Date | null {
  const resetSeconds = parseHeaderInt(headers.get("x-ratelimit-requests-reset"));
  if (resetSeconds == null || resetSeconds < 0) return null;
  return new Date(Date.now() + resetSeconds * 1000);
}

function normalizeRuntimeQuotaSnapshot() {
  if (
    runtimeQuotaSnapshot.requestsRemaining === 0 &&
    runtimeQuotaSnapshot.quotaResetsAt != null &&
    runtimeQuotaSnapshot.quotaResetsAt.getTime() <= Date.now()
  ) {
    runtimeQuotaSnapshot = {
      ...runtimeQuotaSnapshot,
      requestsRemaining: null,
      quotaResetsAt: null,
      observedAt: new Date(),
    };
  }
}

function getRuntimeQuotaError(path: string): TcggoQuotaExceededError | null {
  normalizeRuntimeQuotaSnapshot();

  if (runtimeQuotaSnapshot.requestsRemaining === 0) {
    return new TcggoQuotaExceededError(path, runtimeQuotaSnapshot.quotaResetsAt);
  }

  return null;
}

function reserveRuntimeQuotaRequest() {
  if (runtimeQuotaSnapshot.requestsRemaining == null) return;

  runtimeQuotaSnapshot = {
    ...runtimeQuotaSnapshot,
    requestsRemaining: Math.max(runtimeQuotaSnapshot.requestsRemaining - 1, 0),
    observedAt: new Date(),
  };
}

function updateRuntimeQuotaSnapshot(headers: Headers) {
  const requestsLimit = parseHeaderInt(headers.get("x-ratelimit-requests-limit"));
  const requestsRemaining = parseHeaderInt(headers.get("x-ratelimit-requests-remaining"));
  const quotaResetsAt = parseQuotaResetAt(headers);

  if (requestsLimit == null && requestsRemaining == null && quotaResetsAt == null) {
    return;
  }

  runtimeQuotaSnapshot = {
    requestsLimit: requestsLimit ?? runtimeQuotaSnapshot.requestsLimit,
    requestsRemaining:
      requestsRemaining == null
        ? runtimeQuotaSnapshot.requestsRemaining
        : Math.max(requestsRemaining, 0),
    quotaResetsAt: quotaResetsAt ?? runtimeQuotaSnapshot.quotaResetsAt,
    observedAt: new Date(),
  };
}

function drainTcggoRequestQueue() {
  while (
    activeTcggoRequests < TCGGO_REQUEST_CONCURRENCY &&
    tcggoRequestQueue.length > 0
  ) {
    const run = tcggoRequestQueue.shift();
    run?.();
  }
}

function runQueuedTcggoRequest<T>(path: string, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      const quotaError = getRuntimeQuotaError(path);
      if (quotaError) {
        reject(quotaError);
        return;
      }

      const now = Date.now();
      const waitMs = getRateLimitWaitMs(now);
      if (waitMs > 0) {
        // Re-queue this run after the rate window has freed a slot.
        // Add small jitter to avoid all queued requests waking up together.
        const jitter = Math.floor(Math.random() * 50);
        setTimeout(() => {
          tcggoRequestQueue.unshift(run);
          drainTcggoRequestQueue();
        }, waitMs + jitter);
        return;
      }

      reserveRuntimeQuotaRequest();
      recordRateLimitedRequest(now);
      activeTcggoRequests += 1;

      work()
        .then(resolve, reject)
        .finally(() => {
          activeTcggoRequests -= 1;
          drainTcggoRequestQueue();
        });
    };

    tcggoRequestQueue.push(run);
    drainTcggoRequestQueue();
  });
}

export function getTcggoRequestRuntimeSnapshot(): TcggoRequestRuntimeSnapshot {
  normalizeRuntimeQuotaSnapshot();

  return {
    ...runtimeQuotaSnapshot,
    requestConcurrency: TCGGO_REQUEST_CONCURRENCY,
    activeRequests: activeTcggoRequests,
    queuedRequests: tcggoRequestQueue.length,
  };
}

function resetTcggoRequestRuntimeForTests() {
  runtimeQuotaSnapshot = {
    requestsLimit: null,
    requestsRemaining: null,
    quotaResetsAt: null,
    observedAt: null,
  };
  activeTcggoRequests = 0;
  tcggoRequestQueue.splice(0, tcggoRequestQueue.length);
}

function setTcggoRuntimeQuotaForTests(snapshot: Partial<RuntimeQuotaSnapshot>) {
  runtimeQuotaSnapshot = {
    ...runtimeQuotaSnapshot,
    ...snapshot,
  };
}

export const __tcggoTestUtils = {
  resetRequestRuntime: resetTcggoRequestRuntimeForTests,
  setRuntimeQuota: setTcggoRuntimeQuotaForTests,
  runQueuedRequest: runQueuedTcggoRequest,
};

async function apiFetch<T>(path: string): Promise<T> {
  assertScraperRequestsEnabled();

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRY_ATTEMPTS) {
    try {
      const res = await runQueuedTcggoRequest(path, async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          return await fetch(`${BASE_URL}${path}`, {
            headers: getRapidApiHeaders(),
            cache: "no-store",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      });

      updateRuntimeQuotaSnapshot(res.headers);

      try {
        await recordTcggoQuotaSnapshot(res.headers);
      } catch {
        // Quota tracking should never block the scraper itself.
      }

      if (!res.ok) {
        if (res.status === 429) {
          const requestsRemaining = parseHeaderInt(
            res.headers.get("x-ratelimit-requests-remaining")
          );
          if (requestsRemaining === 0) {
            throw new TcggoQuotaExceededError(path, parseQuotaResetAt(res.headers));
          }

          const rateLimitError = new Error(`TCGGO API 429 rate limited: ${path}`);
          if (attempt < MAX_RETRY_ATTEMPTS) {
            lastError = rateLimitError;
            attempt += 1;
            await sleep(RATE_LIMIT_RETRY_DELAY_MS * attempt);
            continue;
          }

          throw rateLimitError;
        }

        const statusError = new Error(`TCGGO API ${res.status}: ${path}`);
        if (attempt < MAX_RETRY_ATTEMPTS && RETRYABLE_STATUS_CODES.has(res.status)) {
          lastError = statusError;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }

        throw statusError;
      }

      return res.json() as Promise<T>;
    } catch (error) {
      if (isTcggoQuotaExceededError(error)) {
        throw error;
      }

      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"));
      const isRetryableNetworkError = error instanceof TypeError || isAbortError;

      if (attempt < MAX_RETRY_ATTEMPTS && isRetryableNetworkError) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error(`TCGGO API request failed: ${path}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEpisode(ep: RawEpisode): NormalizedEpisode {
  return {
    id: String(ep.id),
    name: ep.name,
    code: ep.code ?? null,
    release_date: ep.released_at ?? null,
    card_count: ep.cards_total ?? null,
    logo_url: ep.logo ?? null,
    symbol_url: ep.symbol ?? null,
    series: ep.series?.name ?? null,
  };
}

function toScoreNumber(value: RawScoreValue): number | null {
  if (value == null || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toScoreDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRawCardScore(value: RawCardScore | number | null | undefined): RawCardScore | null {
  return value && typeof value === "object" ? value : null;
}

function getFirstScoreNumber(
  card: RawCard,
  score: RawCardScore | null,
  keys: Array<keyof RawCardScore>,
  cardKeys: Array<keyof RawCard> = []
): number | null {
  for (const key of keys) {
    const value = toScoreNumber(score?.[key] as RawScoreValue);
    if (value != null) return value;
  }

  for (const key of cardKeys) {
    const value = toScoreNumber(card[key] as RawScoreValue);
    if (value != null) return value;
  }

  return null;
}

function getTcggoScoreTier(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 90) return "ULTRA";
  if (score >= 75) return "PRO";
  if (score >= 60) return "SOLID";
  if (score >= 40) return "NEUTRAL";
  if (score >= 20) return "WEAK";
  return "COLD";
}

function normalizeCardScore(card: RawCard): TcggoCardScoreData {
  const scorePayload =
    asRawCardScore(card.tcggo_score) ??
    asRawCardScore(card.score) ??
    asRawCardScore(card.scores) ??
    asRawCardScore(card.metrics);
  const scoreValue =
    toScoreNumber(typeof card.tcggo_score === "object" ? null : card.tcggo_score) ??
    toScoreNumber(typeof card.score === "object" ? null : card.score) ??
    getFirstScoreNumber(card, scorePayload, ["tcggo_score", "score", "overall", "total", "value"]);
  const explicitTier = scorePayload?.tier ?? scorePayload?.rank ?? card.tcggo_score_tier ?? card.tier ?? null;

  return {
    tcggo_score: scoreValue,
    tcggo_score_tier: explicitTier?.toUpperCase() ?? getTcggoScoreTier(scoreValue),
    tcggo_score_momentum: getFirstScoreNumber(card, scorePayload, ["momentum"], ["momentum"]),
    tcggo_score_stability: getFirstScoreNumber(card, scorePayload, ["stability"], ["stability"]),
    tcggo_score_liquidity: getFirstScoreNumber(card, scorePayload, ["liquidity"], ["liquidity"]),
    tcggo_score_demand: getFirstScoreNumber(card, scorePayload, ["demand"], ["demand"]),
    tcggo_score_market_depth: getFirstScoreNumber(
      card,
      scorePayload,
      ["market_depth", "marketDepth"],
      ["market_depth"]
    ),
    tcggo_score_grade_premium: getFirstScoreNumber(
      card,
      scorePayload,
      ["grade_premium", "gradePremium"],
      ["grade_premium"]
    ),
    tcggo_score_rsi: getFirstScoreNumber(card, scorePayload, ["rsi"], ["rsi"]),
    tcggo_score_ath: getFirstScoreNumber(
      card,
      scorePayload,
      ["ath", "all_time_high", "allTimeHigh"],
      ["ath"]
    ),
    tcggo_score_atl: getFirstScoreNumber(
      card,
      scorePayload,
      ["atl", "all_time_low", "allTimeLow"],
      ["atl"]
    ),
    tcggo_score_updated_at: toScoreDate(
      scorePayload?.updated_at ??
        scorePayload?.updatedAt ??
        card.tcggo_score_updated_at ??
        card.score_updated_at
    ),
  };
}

function normalizeCard(
  card: RawCard,
  tcgdexImageLookup: ReadonlyMap<string, string>
): NormalizedCard {
  const cardmarketId = card.cardmarket_id != null ? String(card.cardmarket_id) : null;
  const tcgId = card.tcgid != null ? String(card.tcgid) : null;
  const tcgdexImageUrl = resolveTcgdexImageUrl(tcgId, tcgdexImageLookup);

  return {
    id: String(card.id),
    name: card.name,
    card_number: card.card_number != null ? String(card.card_number) : null,
    rarity: card.rarity ?? null,
    hp: card.hp ?? null,
    supertype: card.supertype ?? null,
    subtypes: card.subtypes?.join(",") ?? null,
    artist: card.artist?.name ?? null,
    image_url: tcgdexImageUrl ?? card.image ?? null,
    cardmarket_url: cardmarketId ? buildCardMarketProductUrl(cardmarketId) : null,
    tcggo_url: card.tcggo_url ?? null,
    tcgid: tcgId,
    cardmarket_id: cardmarketId,
    tcgplayer_id: card.tcgplayer_id != null ? String(card.tcgplayer_id) : null,
    score: normalizeCardScore(card),
    prices: card.prices,
  };
}

function normalizeSealedProduct(product: RawSealedProduct): NormalizedSealedProduct {
  const cardmarketId =
    product.cardmarket_id != null ? String(product.cardmarket_id) : null;
  const cardmarket = product.prices?.cardmarket;

  return {
    id: String(product.id),
    name: product.name,
    image_url: product.image ?? null,
    tcggo_url: product.tcggo_url ?? null,
    cardmarket_url:
      product.links?.cardmarket ?? buildCardMarketSealedProductUrl(product.name),
    cardmarket_id: cardmarketId,
    tcgplayer_id:
      product.tcgplayer_id != null ? String(product.tcgplayer_id) : null,
    price: {
      cm_lowest: cardmarket?.lowest ?? null,
      cm_lowest_eu: cardmarket?.lowest_EU_only ?? null,
      cm_lowest_de: cardmarket?.lowest_DE ?? null,
      cm_lowest_fr: cardmarket?.lowest_FR ?? null,
      cm_lowest_es: cardmarket?.lowest_ES ?? null,
      cm_lowest_it: cardmarket?.lowest_IT ?? null,
      cm_avg_7d: cardmarket?.["7d_average"] ?? null,
      cm_avg_30d: cardmarket?.["30d_average"] ?? null,
    },
  };
}

function toHistoryDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function normalizeGradeToken(token: string): string {
  return token
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGradedPriceLabel(sourceKey: string, nestedKey?: string): string {
  const upperSource = sourceKey.toUpperCase();
  const normalizedNested = nestedKey ? normalizeGradeToken(nestedKey) : "";
  const match = nestedKey?.match(/(\d+(?:\.\d+)?)/);

  if (match) {
    return `${upperSource} ${match[1]}`;
  }

  if (normalizedNested) {
    if (normalizedNested.toUpperCase().startsWith(upperSource)) {
      return normalizedNested.toUpperCase();
    }

    return `${upperSource} ${normalizedNested}`;
  }

  return upperSource;
}

function normalizeEbaySoldCompany(companyKey: string): string {
  return normalizeGradeToken(companyKey).toUpperCase();
}

function normalizeEbaySoldGrade(companyKey: string, gradeKey: string): string {
  const normalizedGrade = normalizeGradeToken(gradeKey);
  const numericMatch = normalizedGrade.match(/(\d+(?:\.\d+)?)/);
  if (numericMatch) return numericMatch[1];

  const company = normalizeEbaySoldCompany(companyKey);
  const upperGrade = normalizedGrade.toUpperCase();
  if (upperGrade.startsWith(company)) {
    const stripped = upperGrade.slice(company.length).replace(/^[\s/-]+/, "").trim();
    if (stripped) return stripped;
  }

  return upperGrade;
}

function normalizeEbaySoldCurrency(currency: string | null | undefined): string {
  const normalized = currency?.trim().toUpperCase();
  return normalized || "USD";
}

function toPositiveInteger(value: RawScoreValue): number | null {
  const numberValue = toScoreNumber(value);
  if (numberValue == null) return null;

  const integerValue = Math.trunc(numberValue);
  return integerValue > 0 ? integerValue : null;
}

function readEbaySoldGradedValue(
  value: RawEbaySoldGradedPriceValue
): { medianPrice: number | null; sampleSize: number | null } {
  if (value == null) {
    return { medianPrice: null, sampleSize: null };
  }

  if (typeof value === "number" || typeof value === "string") {
    return { medianPrice: toScoreNumber(value), sampleSize: null };
  }

  return {
    medianPrice: toScoreNumber(value.median_price ?? value.medianPrice ?? value.price),
    sampleSize: toPositiveInteger(value.sample_size ?? value.sampleSize),
  };
}

function hasEbaySoldGradedPriceFields(value: unknown): value is Exclude<
  RawEbaySoldGradedPriceValue,
  number | string | null
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return ["median_price", "medianPrice", "price", "sample_size", "sampleSize"].some(
    (key) => key in value
  );
}

function dedupeGradedPrices(entries: NormalizedGradedPrice[]): NormalizedGradedPrice[] {
  const deduped = new Map<string, NormalizedGradedPrice>();

  for (const entry of entries) {
    const normalizedLabel = entry.label.replace(/\s+/g, " ").trim();
    if (!normalizedLabel) continue;

    const dedupeKey = normalizedLabel.toUpperCase();
    const existing = deduped.get(dedupeKey);

    if (!existing || entry.price > existing.price) {
      deduped.set(dedupeKey, {
        label: normalizedLabel,
        price: entry.price,
      });
    }
  }

  return [...deduped.values()].sort((a, b) => b.price - a.price || a.label.localeCompare(b.label));
}

function dedupeEbaySoldGradedPrices(
  entries: NormalizedEbaySoldGradedPrice[]
): NormalizedEbaySoldGradedPrice[] {
  const deduped = new Map<string, NormalizedEbaySoldGradedPrice>();

  for (const entry of entries) {
    const label = entry.label.replace(/\s+/g, " ").trim();
    const company = entry.company.replace(/\s+/g, " ").trim().toUpperCase();
    const grade = entry.grade.replace(/\s+/g, " ").trim();
    if (!label || !company || !grade) continue;

    const dedupeKey = `${entry.source}::${company}::${grade.toUpperCase()}`;
    const existing = deduped.get(dedupeKey);
    const entrySampleSize = entry.sample_size ?? 0;
    const existingSampleSize = existing?.sample_size ?? 0;

    if (
      !existing ||
      entrySampleSize > existingSampleSize ||
      (entrySampleSize === existingSampleSize && entry.median_price > existing.median_price)
    ) {
      deduped.set(dedupeKey, {
        ...entry,
        label,
        company,
        grade,
      });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const companyCompare = a.company.localeCompare(b.company);
    if (companyCompare !== 0) return companyCompare;

    const gradeA = Number(a.grade);
    const gradeB = Number(b.grade);
    if (Number.isFinite(gradeA) && Number.isFinite(gradeB) && gradeA !== gradeB) {
      return gradeB - gradeA;
    }

    return b.median_price - a.median_price || a.label.localeCompare(b.label);
  });
}

export function extractGradedPrices(prices: RawPrices | undefined): NormalizedGradedPrice[] {
  const graded = prices?.cardmarket?.graded;
  if (!graded) return [];

  if (Array.isArray(graded)) {
    return dedupeGradedPrices(
      graded.flatMap((entry) => {
        if (!entry?.grade || entry.price == null) return [];
        return [{ label: entry.grade, price: entry.price }];
      })
    );
  }

  const normalized: NormalizedGradedPrice[] = [];

  for (const [sourceKey, sourceValue] of Object.entries(graded)) {
    if (sourceValue == null) continue;

    if (typeof sourceValue === "number") {
      normalized.push({
        label: normalizeGradedPriceLabel(sourceKey),
        price: sourceValue,
      });
      continue;
    }

    if (typeof sourceValue === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(sourceValue)) {
        if (nestedValue == null) continue;
        normalized.push({
          label: normalizeGradedPriceLabel(sourceKey, nestedKey),
          price: nestedValue,
        });
      }
    }
  }

  return dedupeGradedPrices(normalized);
}

export function extractEbaySoldGradedPrices(
  prices: RawPrices | undefined
): NormalizedEbaySoldGradedPrice[] {
  const graded = prices?.ebay?.graded;
  if (!graded) return [];

  const fallbackCurrency = normalizeEbaySoldCurrency(prices?.ebay?.currency);
  const normalized: NormalizedEbaySoldGradedPrice[] = [];

  if (Array.isArray(graded)) {
    for (const entry of graded) {
      if (!entry?.company || !entry.grade) continue;

      const { medianPrice, sampleSize } = readEbaySoldGradedValue(entry);
      if (medianPrice == null) continue;

      const company = normalizeEbaySoldCompany(entry.company);
      const grade = normalizeEbaySoldGrade(entry.company, entry.grade);
      if (!company || !grade) continue;

      normalized.push({
        source: "ebay_sold",
        label: `${company} ${grade}`,
        company,
        grade,
        median_price: medianPrice,
        currency: entry.currency ? normalizeEbaySoldCurrency(entry.currency) : fallbackCurrency,
        sample_size: sampleSize,
      });
    }

    return dedupeEbaySoldGradedPrices(normalized);
  }

  for (const [companyKey, companyValue] of Object.entries(graded)) {
    if (companyValue == null) continue;

    const company = normalizeEbaySoldCompany(companyKey);
    if (!company) continue;

    if (
      typeof companyValue === "number" ||
      typeof companyValue === "string" ||
      hasEbaySoldGradedPriceFields(companyValue)
    ) {
      const { medianPrice, sampleSize } = readEbaySoldGradedValue(companyValue);
      if (medianPrice == null) continue;

      const grade = normalizeEbaySoldGrade(companyKey, companyKey);
      if (!grade) continue;

      normalized.push({
        source: "ebay_sold",
        label: `${company} ${grade}`,
        company,
        grade,
        median_price: medianPrice,
        currency: fallbackCurrency,
        sample_size: sampleSize,
      });
      continue;
    }

    if (typeof companyValue === "object") {
      for (const [gradeKey, gradeValue] of Object.entries(companyValue)) {
        const { medianPrice, sampleSize } = readEbaySoldGradedValue(gradeValue);
        if (medianPrice == null) continue;

        const grade = normalizeEbaySoldGrade(companyKey, gradeKey);
        if (!grade) continue;

        normalized.push({
          source: "ebay_sold",
          label: `${company} ${grade}`,
          company,
          grade,
          median_price: medianPrice,
          currency: fallbackCurrency,
          sample_size: sampleSize,
        });
      }
    }
  }

  return dedupeEbaySoldGradedPrices(normalized);
}

interface RawHistoryPriceEntry {
  cm_low?: number | null;
  cm_low_de?: number | null;
  cm_low_fr?: number | null;
  cm_low_es?: number | null;
  cm_low_it?: number | null;
  tcg_player_market?: number | null;
}

interface RawHistoryPriceResponse {
  data?: Record<string, RawHistoryPriceEntry>;
  paging?: {
    current?: number;
    total?: number;
    per_page?: number;
  };
  results?: number;
}

export async function fetchAllEpisodes(): Promise<NormalizedEpisode[]> {
  const all: NormalizedEpisode[] = [];
  let page = 1;
  while (true) {
    const data = await apiFetch<{ data: RawEpisode[]; paging?: { total?: number } }>(
      `/pokemon/episodes?page=${page}&per_page=100`
    );
    all.push(...(data.data ?? []).map(normalizeEpisode));
    const totalPages = data.paging?.total ?? 1;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

export async function fetchCardsForEpisode(episodeId: string): Promise<NormalizedCard[]> {
  const tcgdexImageLookup = await getTcgdexImageLookup();

  const firstPage = await apiFetch<{
    data: RawCard[];
    paging?: { total?: number };
  }>(`/pokemon/episodes/${episodeId}/cards?page=1&per_page=100`);

  const all: NormalizedCard[] = (firstPage.data ?? []).map((card) =>
    normalizeCard(card, tcgdexImageLookup)
  );
  const totalPages = firstPage.paging?.total ?? 1;

  if (totalPages <= 1) {
    return all;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiFetch<{
        data: RawCard[];
        paging?: { total?: number };
      }>(`/pokemon/episodes/${episodeId}/cards?page=${index + 2}&per_page=100`)
    )
  );

  for (const page of remainingPages) {
    all.push(...(page.data ?? []).map((card) => normalizeCard(card, tcgdexImageLookup)));
  }

  return all;
}

export async function fetchSealedAvailabilityForEpisode(
  episodeId: string
): Promise<boolean> {
  const data = await apiFetch<{ data: RawSealedProduct[] }>(
    `/pokemon/episodes/${episodeId}/products?page=1&per_page=1`
  );

  return (data.data?.length ?? 0) > 0;
}

export async function fetchSealedProductsForEpisode(
  episodeId: string
): Promise<NormalizedSealedProduct[]> {
  const firstPage = await apiFetch<{
    data: RawSealedProduct[];
    paging?: { total?: number };
  }>(`/pokemon/episodes/${episodeId}/products?page=1&per_page=100`);

  const all: NormalizedSealedProduct[] = (firstPage.data ?? []).map(normalizeSealedProduct);
  const totalPages = firstPage.paging?.total ?? 1;

  if (totalPages <= 1) {
    return all;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiFetch<{
        data: RawSealedProduct[];
        paging?: { total?: number };
      }>(`/pokemon/episodes/${episodeId}/products?page=${index + 2}&per_page=100`)
    )
  );

  for (const page of remainingPages) {
    all.push(...(page.data ?? []).map(normalizeSealedProduct));
  }

  return all;
}

export async function fetchHistoryPricesByItemId(
  itemId: string,
  options?: {
    lang?: "en" | "de" | "fr" | "es" | "it";
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<TcggoHistoryPricePoint[]> {
  const params = new URLSearchParams({
    id: itemId,
    sort: "asc",
    page: "1",
  });

  if (options?.lang) params.set("lang", options.lang);
  if (options?.dateFrom) params.set("date_from", options.dateFrom);
  if (options?.dateTo) params.set("date_to", options.dateTo);

  const firstPage = await apiFetch<RawHistoryPriceResponse>(`/pokemon/history-prices?${params}`);
  const totalPages = firstPage.paging?.total ?? 1;
  const pages = [firstPage];

  // History imports are request-heavy and RapidAPI tends to burst-rate-limit them
  // long before the daily window is actually empty. Fetch follow-up pages gently.
  for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
    const pageParams = new URLSearchParams(params);
    pageParams.set("page", String(pageNumber));
    await sleep(HISTORY_PAGE_FETCH_DELAY_MS);
    pages.push(await apiFetch<RawHistoryPriceResponse>(`/pokemon/history-prices?${pageParams}`));
  }

  const merged = new Map<string, RawHistoryPriceEntry>();

  for (const page of pages) {
    for (const [date, entry] of Object.entries(page.data ?? {})) {
      merged.set(date, entry);
    }
  }

  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({
      date,
      label: toHistoryDateLabel(date),
      cm_market: entry.cm_low ?? null,
      cm_market_de: entry.cm_low_de ?? null,
      cm_market_fr: entry.cm_low_fr ?? null,
      cm_market_es: entry.cm_low_es ?? null,
      cm_market_it: entry.cm_low_it ?? null,
      tcp_market: entry.tcg_player_market ?? null,
    }));
}

export async function fetchCardDetail(cardId: string): Promise<NormalizedCard | null> {
  const tcgdexImageLookup = await getTcgdexImageLookup();
  const data = await apiFetch<{ data?: RawCard }>(`/pokemon/cards/${cardId}`);
  const card = data.data;

  if (!card) return null;

  return normalizeCard(card, tcgdexImageLookup);
}

export function extractPrices(prices: RawPrices | undefined) {
  const cm = prices?.cardmarket;
  const tcp = prices?.tcg_player;
  return {
    cm_en_lowest_nm: cm?.lowest_near_mint ?? null,
    cm_de_lowest_nm: cm?.lowest_near_mint_DE ?? null,
    cm_fr_lowest_nm: cm?.lowest_near_mint_FR ?? null,
    cm_es_lowest_nm: cm?.lowest_near_mint_ES ?? null,
    cm_it_lowest_nm: cm?.lowest_near_mint_IT ?? null,
    cm_en_avg_30d: cm?.["30d_average"] ?? null,
    cm_en_avg_7d: cm?.["7d_average"] ?? null,
    tcp_market: tcp?.market_price ?? null,
    tcp_mid: tcp?.mid_price ?? null,
    tcp_low: tcp?.low_price ?? null,
  };
}
