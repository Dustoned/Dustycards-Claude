import "server-only";

import type { Prisma } from "@/generated/prisma";
import {
  hasConclusiveCardMarketOfferState,
  parseCardMarketScrape,
  parseStrictCardMarketEnglishNmPrice,
} from "@/lib/card-submissions";
import {
  buildCardMarketProductUrl,
  getSafeDirectCardMarketCardUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";
import { db } from "@/lib/db";
import { CARDMARKET_BASE_BACKFILL_SOURCE } from "@/lib/sync/direct-cardmarket-protection";
import {
  FirecrawlBudgetError,
  getFirecrawlBudgetSnapshot,
  runBudgetedFirecrawlRequest,
} from "@/lib/firecrawl-budget";
import { scrapeFirecrawlPage, type FirecrawlPageScrapeResult } from "@/lib/firecrawl";
import {
  CARDMARKET_NO_EN_NM_PRICE_STATUS,
  UPCOMING_PRICE_SOURCE_STATUS,
} from "@/lib/price-source-status";

const JOB_TYPE = "cardmarket-base-price";
const FIRECRAWL_CONSUMER = "cardmarket-base-price";
const PRICE_SOURCE = CARDMARKET_BASE_BACKFILL_SOURCE;
const PRICE_PROVIDER = "firecrawl";
const JOB_STALE_MS = 15 * 60_000;
const SEARCH_CACHE_MS = 2 * 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
export const CARDMARKET_BASE_PRICE_INTERVAL_MS = 2 * HOUR_MS;

let activeJob: Promise<CardMarketBasePriceRunResult> | null = null;

type AttemptOutcome =
  | "updated"
  | "already-priced"
  | "missing-link"
  | "ambiguous-link"
  | "no-english-nm"
  | "identity-mismatch"
  | "deduped"
  | "budget-paused"
  | "failed"
  | "no-work"
  | "busy";

type BacklogCandidate = {
  id: string;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  cardmarket_url: string | null;
  cardmarket_id: string | null;
  price_source_status: string | null;
  price_source_checked_at: Date | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    release_date: string | null;
  };
};

type CardCooldown = {
  failures: number;
  nextAttemptAt: string;
  outcome: AttemptOutcome;
  error: string | null;
};

type PersistedDetails = {
  version: 1;
  kind: typeof JOB_TYPE;
  cooldowns: Record<string, CardCooldown>;
  lastRun?: CardMarketBasePriceRunResult;
  error?: string | null;
};

export interface CardMarketBasePriceRunResult {
  outcome: AttemptOutcome;
  processedCards: 0 | 1;
  cardId: string | null;
  cardName: string | null;
  sourceUrl: string | null;
  priceEur: number | null;
  creditsUsed: number;
  startedAt: string;
  finishedAt: string;
  error: string | null;
}

export interface CardMarketBasePriceJobSnapshot {
  started: boolean;
  running: boolean;
  due: boolean;
  status: string | null;
  backlogCards: number;
  dueCards: number;
  directCards: number;
  nextAttemptAt: string | null;
  nextRunAt: string | null;
  lastFinishedAt: string | null;
  lastResult: CardMarketBasePriceRunResult | null;
  budget: {
    configured: boolean;
    globalRemaining: number;
    consumerRemaining: number;
    providerRemaining: number | null;
    providerPlan: number | null;
  };
  error: string | null;
}

type IdentityInput = {
  expectedName: string;
  expectedSetName: string;
  expectedSetCode?: string | null;
  expectedCardNumber?: string | null;
  expectedPrintedCardNumber?: string | null;
  observedName?: string | null;
  observedSetName?: string | null;
  observedCardNumber?: string | null;
  resolvedUrl: string;
};

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function buildCardMarketBasePriceBacklogWhere(
  now = new Date()
): Prisma.CardWhereInput {
  return {
    game: "pokemon",
    episode: { release_date: { not: null, lte: todayKey(now) } },
    prices: {
      none: {
        cm_en_lowest_nm: { gt: 0, not: 9001 },
      },
    },
    AND: [
      {
        OR: [
          { price_source_status: null },
          { price_source_status: { not: UPCOMING_PRICE_SOURCE_STATUS } },
        ],
      },
    ],
  };
}

function normalizeWords(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\u03b4/gi, " delta ")
    .replace(/\u2640/g, " female ")
    .replace(/\u2642/g, " male ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function compactIdentity(value: string | null | undefined): string {
  return normalizeWords(value).replace(/\s+/g, "");
}

function normalizeSet(value: string | null | undefined): string {
  const normalized = normalizeWords(value)
    .split(" ")
    .filter((token) => !["and", "the", "set"].includes(token))
    .join(" ");
  // These are explicit publisher/CardMarket naming differences observed in
  // the live backlog. Keep this list closed: a broad fuzzy set comparison
  // could silently attach a same-name, same-number card from another set.
  const aliases: Record<string, string> = {
    "hs triumphant": "triumphant",
    "hs undaunted": "undaunted",
    "hs unleashed": "unleashed",
    "ex trainer kit 2 plusle": "ex trainer kit 2",
    "ex trainer kit 2 minun": "ex trainer kit 2",
    "nintendo black star promos": "nintendo promos",
    "dp black star promos": "dp promos",
    "bw black star promos": "bw promos",
    "xy black star promos": "xy promos",
    "sm black star promos": "sm promos",
    "swsh black star promos": "swsh promos",
    "sv black star promos": "sv promos",
  };
  return aliases[normalized] ?? normalized;
}

function knownCardMarketNumberPrefix(setName: string): string | null {
  const normalized = normalizeWords(setName);
  const prefixes: Record<string, string> = {
    "hs triumphant": "tm",
    "hs undaunted": "ud",
    "hs unleashed": "ul",
    "ex trainer kit 2 plusle": "tk2red",
    "ex trainer kit 2 minun": "tk2blue",
  };
  return prefixes[normalized] ?? null;
}

function remainderMatchesCardNumber(input: {
  remainder: string;
  alias: string;
  expectedSetName: string;
  expectedSetCode?: string | null;
}): boolean {
  if (input.remainder === input.alias) return true;
  const knownPrefix = knownCardMarketNumberPrefix(input.expectedSetName);
  if (knownPrefix) return input.remainder === `${knownPrefix}${input.alias}`;
  const setCode = compactIdentity(input.expectedSetCode);
  return (
    (Boolean(setCode) && input.remainder === `${setCode}${input.alias}`) ||
    new RegExp(`^[a-z]{1,5}${input.alias}$`, "i").test(input.remainder)
  );
}

function normalizedCardNumber(value: string | null | undefined): string {
  const primary = (value ?? "").split("/", 1)[0];
  return compactIdentity(primary).replace(/^0+(?=\d)/, "");
}

function cardNumberAliases(...values: Array<string | null | undefined>): Set<string> {
  const aliases = new Set<string>();
  for (const value of values) {
    const normalized = normalizedCardNumber(value);
    if (!normalized) continue;
    aliases.add(normalized);
    const tail = normalized.match(/(?:^|[a-z])0*(\d+[a-z]?)$/i)?.[1];
    if (tail) aliases.add(tail.toLowerCase());
  }
  return aliases;
}

function productParts(rawUrl: string): {
  url: string;
  setName: string;
  productName: string;
} | null {
  try {
    const url = new URL(rawUrl, "https://www.cardmarket.com");
    if (url.hostname.toLowerCase() !== "www.cardmarket.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const singlesIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "singles"
    );
    if (singlesIndex < 0 || !segments[singlesIndex + 1] || !segments[singlesIndex + 2]) {
      return null;
    }
    const setSlug = segments[singlesIndex + 1];
    const productSlug = segments[singlesIndex + 2];
    return {
      url: `https://www.cardmarket.com/en/Pokemon/Products/Singles/${setSlug}/${productSlug}`,
      setName: decodeURIComponent(setSlug).replace(/[-+]/g, " "),
      productName: decodeURIComponent(productSlug).replace(/[-+]/g, " "),
    };
  } catch {
    return null;
  }
}

function productUrlMatchesExpected(candidate: BacklogCandidate, rawUrl: string): boolean {
  const parts = productParts(rawUrl);
  if (!parts || normalizeSet(parts.setName) !== normalizeSet(candidate.episode.name)) return false;
  const expectedName = compactIdentity(candidate.name);
  const productName = compactIdentity(parts.productName);
  if (!expectedName || !productName.startsWith(expectedName)) return false;

  const remainder = productName.slice(expectedName.length);
  const aliases = cardNumberAliases(candidate.card_number, candidate.printed_card_number);
  return [...aliases].some(
    (alias) => remainderMatchesCardNumber({
      remainder,
      alias,
      expectedSetName: candidate.episode.name,
      expectedSetCode: candidate.episode.code,
    })
  );
}

export function cardMarketBasePriceIdentityMatches(input: IdentityInput): boolean {
  const parts = productParts(input.resolvedUrl);
  const observedSet = input.observedSetName ?? parts?.setName ?? null;
  if (!observedSet || normalizeSet(observedSet) !== normalizeSet(input.expectedSetName)) {
    return false;
  }

  const expectedName = compactIdentity(input.expectedName);
  const observedName = compactIdentity(input.observedName);
  const aliases = cardNumberAliases(
    input.expectedCardNumber,
    input.expectedPrintedCardNumber
  );
  const observedNumber = normalizedCardNumber(input.observedCardNumber);
  const numberMatches = Boolean(observedNumber && aliases.has(observedNumber));

  let urlNameAndNumberMatch = false;
  if (parts) {
    const productName = compactIdentity(parts.productName);
    const remainder = productName.startsWith(expectedName)
      ? productName.slice(expectedName.length)
      : "";
    urlNameAndNumberMatch = [...aliases].some(
      (alias) => remainderMatchesCardNumber({
        remainder,
        alias,
        expectedSetName: input.expectedSetName,
        expectedSetCode: input.expectedSetCode,
      })
    );
  }

  const nameMatches = Boolean(expectedName && observedName && expectedName === observedName);
  return (nameMatches || urlNameAndNumberMatch) && (numberMatches || urlNameAndNumberMatch);
}

function extractSearchCandidates(
  candidate: BacklogCandidate,
  scrape: FirecrawlPageScrapeResult
): string[] {
  const rawLinks = [scrape.sourceUrl, ...scrape.links];
  for (const match of scrape.html.matchAll(/href=["']([^"']+)["']/gi)) {
    rawLinks.push(match[1]);
  }
  const matches = new Set<string>();
  for (const rawLink of rawLinks) {
    let absolute: string;
    try {
      absolute = new URL(rawLink, "https://www.cardmarket.com").toString();
    } catch {
      continue;
    }
    const parts = productParts(absolute);
    if (parts && productUrlMatchesExpected(candidate, parts.url)) matches.add(parts.url);
  }
  return [...matches];
}

function directSourceUrl(candidate: BacklogCandidate): string | null {
  return (
    getSafeDirectCardMarketCardUrl(candidate.cardmarket_url, "pokemon") ??
    (candidate.cardmarket_id
      ? buildCardMarketProductUrl(candidate.cardmarket_id, "pokemon")
      : null)
  );
}

function sortCandidates(candidates: BacklogCandidate[]): BacklogCandidate[] {
  return [...candidates].sort((left, right) => {
    const directDifference = Number(Boolean(directSourceUrl(right))) - Number(Boolean(directSourceUrl(left)));
    if (directDifference !== 0) return directDifference;
    return (
      (left.episode.release_date ?? "").localeCompare(right.episode.release_date ?? "") ||
      left.episode.name.localeCompare(right.episode.name) ||
      (left.card_number ?? "").localeCompare(right.card_number ?? "") ||
      left.id.localeCompare(right.id)
    );
  });
}

async function loadBacklog(now: Date): Promise<BacklogCandidate[]> {
  const rows = await db.card.findMany({
    where: buildCardMarketBasePriceBacklogWhere(now),
    orderBy: [{ episode_id: "asc" }, { card_number: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      cardmarket_url: true,
      cardmarket_id: true,
      price_source_status: true,
      price_source_checked_at: true,
      episode: {
        select: { id: true, name: true, code: true, release_date: true },
      },
    },
  });
  return sortCandidates(rows);
}

function parseDetails(detailsJson: string | null | undefined): PersistedDetails {
  try {
    const parsed = detailsJson ? (JSON.parse(detailsJson) as Partial<PersistedDetails>) : null;
    if (parsed?.version === 1 && parsed.kind === JOB_TYPE && parsed.cooldowns) {
      return {
        version: 1,
        kind: JOB_TYPE,
        cooldowns: parsed.cooldowns,
        lastRun: parsed.lastRun,
        error: typeof parsed.error === "string" ? parsed.error : null,
      };
    }
  } catch {
    // A malformed old status must not permanently stop the backlog.
  }
  return { version: 1, kind: JOB_TYPE, cooldowns: {}, error: null };
}

function cooldownDate(cooldown: CardCooldown | undefined): Date | null {
  if (!cooldown) return null;
  const value = new Date(cooldown.nextAttemptAt);
  return Number.isFinite(value.getTime()) ? value : null;
}

function isCoolingDown(cooldown: CardCooldown | undefined, now: Date): boolean {
  const until = cooldownDate(cooldown);
  return Boolean(until && until > now);
}

function cooldownMs(outcome: AttemptOutcome, failures: number): number {
  if (outcome === "ambiguous-link" || outcome === "identity-mismatch") return 30 * DAY_MS;
  if (outcome === "missing-link") return 7 * DAY_MS;
  if (outcome === "no-english-nm") return 7 * DAY_MS;
  if (outcome === "budget-paused" || outcome === "deduped") return 6 * HOUR_MS;
  return Math.min(7 * DAY_MS, HOUR_MS * 2 ** Math.min(6, Math.max(0, failures - 1)));
}

function pruneCooldowns(
  cooldowns: Record<string, CardCooldown>,
  candidates: BacklogCandidate[]
): Record<string, CardCooldown> {
  const liveIds = new Set(candidates.map((candidate) => candidate.id));
  return Object.fromEntries(
    Object.entries(cooldowns).filter(([cardId]) => liveIds.has(cardId))
  );
}

function seedExistingNoEnglishNmCooldowns(
  cooldowns: Record<string, CardCooldown>,
  candidates: BacklogCandidate[],
  now: Date
): Record<string, CardCooldown> {
  const seeded = { ...cooldowns };
  for (const candidate of candidates) {
    if (
      seeded[candidate.id] ||
      candidate.price_source_status !== CARDMARKET_NO_EN_NM_PRICE_STATUS ||
      !candidate.price_source_checked_at
    ) {
      continue;
    }
    const nextAttemptAt = new Date(
      candidate.price_source_checked_at.getTime() + cooldownMs("no-english-nm", 1)
    );
    if (nextAttemptAt <= now) continue;
    seeded[candidate.id] = {
      failures: 1,
      outcome: "no-english-nm",
      error: "CardMarket previously had no English Near Mint listing.",
      nextAttemptAt: nextAttemptAt.toISOString(),
    };
  }
  return seeded;
}

async function budgetedScrape(input: {
  cardId: string;
  attempt: number;
  operation: "search" | "product";
  url: string;
  maxAge?: number;
}): Promise<{ scrape: FirecrawlPageScrapeResult | null; creditsUsed: number }> {
  const request = await runBudgetedFirecrawlRequest({
    consumer: FIRECRAWL_CONSUMER,
    operation: `cardmarket-${input.operation}`,
    idempotencyKey: `${FIRECRAWL_CONSUMER}:v1:${input.cardId}:${input.attempt}:${input.operation}`,
    estimatedCredits: 1,
    sourceUrl: input.url,
    request: () =>
      scrapeFirecrawlPage(input.url, {
        onlyMainContent: false,
        ...(input.maxAge == null ? {} : { maxAge: input.maxAge }),
      }),
    getCreditsUsed: (result) => result.creditsUsed ?? 1,
  });
  return { scrape: request.executed ? request.result : null, creditsUsed: request.creditsUsed };
}

function searchUrl(name: string): string {
  const url = new URL("https://www.cardmarket.com/en/Pokemon/Products/Search");
  url.searchParams.set("searchString", name);
  return url.toString();
}

export function buildMergedCardMarketPriceData(input: {
  cardId: string;
  priceEur: number;
  sourceUrl: string;
  observedAt: Date;
}) {
  return {
    card_id: input.cardId,
    fetched_at: input.observedAt,
    changed_at: input.observedAt,
    source: PRICE_SOURCE,
    source_provider: PRICE_PROVIDER,
    source_url: input.sourceUrl,
    cm_en_lowest_nm: input.priceEur,
    // This row is one direct CardMarket observation. Copying older values
    // would falsely refresh their provenance and create artificial history.
    cm_de_lowest_nm: null,
    cm_fr_lowest_nm: null,
    cm_es_lowest_nm: null,
    cm_it_lowest_nm: null,
    cm_jp_lowest_nm: null,
    cm_en_avg_30d: null,
    cm_en_avg_7d: null,
    tcp_market: null,
    tcp_mid: null,
    tcp_low: null,
  };
}

async function persistAcceptedPrice(input: {
  candidate: BacklogCandidate;
  priceEur: number;
  sourceUrl: string;
  observedAt: Date;
}): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const existing = await tx.price.findFirst({
      where: {
        card_id: input.candidate.id,
        cm_en_lowest_nm: { gt: 0, not: 9001 },
      },
      select: { id: true },
    });
    if (existing) return false;

    await tx.price.create({
      data: buildMergedCardMarketPriceData({
        cardId: input.candidate.id,
        priceEur: input.priceEur,
        sourceUrl: input.sourceUrl,
        observedAt: input.observedAt,
      }),
    });
    const canonicalUrl = productParts(input.sourceUrl)?.url ?? null;
    await tx.card.update({
      where: { id: input.candidate.id },
      data: {
        ...(canonicalUrl && !getSafeDirectCardMarketCardUrl(input.candidate.cardmarket_url, "pokemon")
          ? { cardmarket_url: canonicalUrl }
          : {}),
        price_source_status: null,
        price_source_checked_at: input.observedAt,
      },
    });
    return true;
  });
}

async function persistNoEnglishNmStatus(input: {
  candidate: BacklogCandidate;
  sourceUrl: string;
  observedAt: Date;
}): Promise<void> {
  const canonicalUrl = productParts(input.sourceUrl)?.url ?? null;
  await db.card.update({
    where: { id: input.candidate.id },
    data: {
      ...(canonicalUrl && !getSafeDirectCardMarketCardUrl(input.candidate.cardmarket_url, "pokemon")
        ? { cardmarket_url: canonicalUrl }
        : {}),
      price_source_status: CARDMARKET_NO_EN_NM_PRICE_STATUS,
      price_source_checked_at: input.observedAt,
    },
  });
}

function makeAttemptResult(input: {
  outcome: AttemptOutcome;
  startedAt: Date;
  candidate?: BacklogCandidate | null;
  sourceUrl?: string | null;
  priceEur?: number | null;
  creditsUsed?: number;
  error?: string | null;
}): CardMarketBasePriceRunResult {
  return {
    outcome: input.outcome,
    processedCards: input.candidate ? 1 : 0,
    cardId: input.candidate?.id ?? null,
    cardName: input.candidate?.name ?? null,
    sourceUrl: input.sourceUrl ?? null,
    priceEur: input.priceEur ?? null,
    creditsUsed: input.creditsUsed ?? 0,
    startedAt: input.startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    error: input.error ?? null,
  };
}

async function processCandidate(
  candidate: BacklogCandidate,
  attempt: number,
  startedAt: Date
): Promise<CardMarketBasePriceRunResult> {
  let creditsUsed = 0;
  let sourceUrl = directSourceUrl(candidate);
  try {
    if (!sourceUrl) {
      const discovery = await budgetedScrape({
        cardId: candidate.id,
        attempt,
        operation: "search",
        url: searchUrl(candidate.name),
        maxAge: SEARCH_CACHE_MS,
      });
      creditsUsed += discovery.creditsUsed;
      if (!discovery.scrape) {
        return makeAttemptResult({
          outcome: "deduped",
          startedAt,
          candidate,
          creditsUsed,
          error: "This CardMarket search attempt was already reserved or completed.",
        });
      }
      const links = extractSearchCandidates(candidate, discovery.scrape);
      if (links.length === 0) {
        return makeAttemptResult({
          outcome: "missing-link",
          startedAt,
          candidate,
          creditsUsed,
          error: "CardMarket search returned no exact name, set and number match.",
        });
      }
      if (links.length > 1) {
        return makeAttemptResult({
          outcome: "ambiguous-link",
          startedAt,
          candidate,
          creditsUsed,
          error: "CardMarket search returned multiple exact candidates; nothing was written.",
        });
      }
      sourceUrl = withCardMarketFilters(links[0]);
    }

    const product = await budgetedScrape({
      cardId: candidate.id,
      attempt,
      operation: "product",
      url: sourceUrl,
    });
    creditsUsed += product.creditsUsed;
    if (!product.scrape) {
      return makeAttemptResult({
        outcome: "deduped",
        startedAt,
        candidate,
        sourceUrl,
        creditsUsed,
        error: "This CardMarket product attempt was already reserved or completed.",
      });
    }

    const parsed = parseCardMarketScrape(product.scrape, "Near Mint");
    const identityMatches = cardMarketBasePriceIdentityMatches({
      expectedName: candidate.name,
      expectedSetName: candidate.episode.name,
      expectedSetCode: candidate.episode.code,
      expectedCardNumber: candidate.card_number,
      expectedPrintedCardNumber: candidate.printed_card_number,
      observedName: parsed.name,
      observedSetName: parsed.setName,
      observedCardNumber: parsed.cardNumber,
      resolvedUrl: product.scrape.sourceUrl,
    });
    if (!identityMatches) {
      return makeAttemptResult({
        outcome: "identity-mismatch",
        startedAt,
        candidate,
        sourceUrl: product.scrape.sourceUrl,
        creditsUsed,
        error: "CardMarket returned a different name, set or card number; nothing was written.",
      });
    }

    const strictPrice = parseStrictCardMarketEnglishNmPrice(product.scrape);
    if (!strictPrice) {
      if (!hasConclusiveCardMarketOfferState(product.scrape)) {
        return makeAttemptResult({
          outcome: "failed",
          startedAt,
          candidate,
          sourceUrl: product.scrape.sourceUrl,
          creditsUsed,
          error: "CardMarket did not return a readable priced offer table; no listing status was written.",
        });
      }
      await persistNoEnglishNmStatus({
        candidate,
        sourceUrl: product.scrape.sourceUrl,
        observedAt: startedAt,
      });
      return makeAttemptResult({
        outcome: "no-english-nm",
        startedAt,
        candidate,
        sourceUrl: product.scrape.sourceUrl,
        creditsUsed,
        error: "CardMarket returned no explicit English Near Mint offer.",
      });
    }

    const inserted = await persistAcceptedPrice({
      candidate,
      priceEur: strictPrice.priceEur,
      sourceUrl: product.scrape.sourceUrl,
      observedAt: startedAt,
    });
    return makeAttemptResult({
      outcome: inserted ? "updated" : "already-priced",
      startedAt,
      candidate,
      sourceUrl: product.scrape.sourceUrl,
      priceEur: strictPrice.priceEur,
      creditsUsed,
    });
  } catch (error) {
    const budgetPaused = error instanceof FirecrawlBudgetError;
    return makeAttemptResult({
      outcome: budgetPaused ? "budget-paused" : "failed",
      startedAt,
      candidate,
      sourceUrl,
      creditsUsed,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function claimJob(now: Date) {
  const job = await db.syncJob.upsert({
    where: { type: JOB_TYPE },
    create: { type: JOB_TYPE, status: "idle" },
    update: {},
  });
  const claimed = await db.syncJob.updateMany({
    where: {
      id: job.id,
      OR: [
        { status: { not: "running" } },
        { heartbeat_at: null },
        { heartbeat_at: { lt: new Date(now.getTime() - JOB_STALE_MS) } },
      ],
    },
    data: {
      status: "running",
      started_at: now,
      finished_at: null,
      heartbeat_at: now,
    },
  });
  return claimed.count === 1 ? job : null;
}

function terminalStatus(outcome: AttemptOutcome): string {
  if (outcome === "budget-paused") return "quota-paused";
  if (outcome === "failed") return "failed";
  if (["updated", "already-priced", "no-work"].includes(outcome)) return "success";
  return "partial";
}

export async function runCardMarketBasePriceJob(
  now = new Date()
): Promise<CardMarketBasePriceRunResult> {
  const job = await claimJob(now);
  if (!job) return makeAttemptResult({ outcome: "busy", startedAt: now });

  const details = parseDetails(job.details_json);
  try {
    const candidates = await loadBacklog(now);
    details.cooldowns = seedExistingNoEnglishNmCooldowns(
      pruneCooldowns(details.cooldowns, candidates),
      candidates,
      now
    );
    // Never-attempted cards always go first. Otherwise a small set of direct
    // no-listing pages can become due again and starve later discovery work.
    const candidate =
      candidates.find((item) => !details.cooldowns[item.id]) ??
      candidates
        .filter((item) => !isCoolingDown(details.cooldowns[item.id], now))
        .sort((left, right) => {
          const leftAt = cooldownDate(details.cooldowns[left.id])?.getTime() ?? 0;
          const rightAt = cooldownDate(details.cooldowns[right.id])?.getTime() ?? 0;
          return leftAt - rightAt;
        })[0];
    const result = candidate
      ? await processCandidate(
          candidate,
          (details.cooldowns[candidate.id]?.failures ?? 0) + 1,
          now
        )
      : makeAttemptResult({ outcome: "no-work", startedAt: now });

    if (candidate) {
      if (["updated", "already-priced"].includes(result.outcome)) {
        delete details.cooldowns[candidate.id];
      } else {
        const failures = (details.cooldowns[candidate.id]?.failures ?? 0) + 1;
        details.cooldowns[candidate.id] = {
          failures,
          outcome: result.outcome,
          error: result.error,
          nextAttemptAt: new Date(now.getTime() + cooldownMs(result.outcome, failures)).toISOString(),
        };
      }
    }
    details.lastRun = result;
    details.error = result.error;
    await db.syncJob.update({
      where: { id: job.id },
      data: {
        status: terminalStatus(result.outcome),
        details_json: JSON.stringify(details),
        heartbeat_at: new Date(),
        finished_at: new Date(),
      },
    });
    return result;
  } catch (error) {
    const result = makeAttemptResult({
      outcome: "failed",
      startedAt: now,
      error: error instanceof Error ? error.message : String(error),
    });
    details.lastRun = result;
    details.error = result.error;
    await db.syncJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          details_json: JSON.stringify(details),
          heartbeat_at: new Date(),
          finished_at: new Date(),
        },
      })
      .catch(() => undefined);
    return result;
  }
}

function jobIsRunning(
  job: { status: string; heartbeat_at: Date | null } | null,
  now: Date
): boolean {
  return Boolean(
    job?.status === "running" &&
      job.heartbeat_at &&
      job.heartbeat_at > new Date(now.getTime() - JOB_STALE_MS)
  );
}

export async function getCardMarketBasePriceJobSnapshot(
  now = new Date()
): Promise<CardMarketBasePriceJobSnapshot> {
  const [job, candidates, budget] = await Promise.all([
    db.syncJob.findUnique({ where: { type: JOB_TYPE } }),
    loadBacklog(now),
    getFirecrawlBudgetSnapshot(FIRECRAWL_CONSUMER, now),
  ]);
  const details = parseDetails(job?.details_json);
  const cooldowns = pruneCooldowns(details.cooldowns, candidates);
  const dueCandidates = candidates.filter(
    (candidate) => !isCoolingDown(cooldowns[candidate.id], now)
  );
  const nextAttemptAt = candidates
    .map((candidate) => cooldownDate(cooldowns[candidate.id]))
    .filter((value): value is Date => Boolean(value && value > now))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const lastFinishedAt = job?.finished_at ? new Date(job.finished_at) : null;
  const nextRunAt = lastFinishedAt
    ? new Date(lastFinishedAt.getTime() + CARDMARKET_BASE_PRICE_INTERVAL_MS)
    : null;
  const due =
    candidates.length > 0 &&
    dueCandidates.length > 0 &&
    (!nextRunAt || nextRunAt <= now);

  return {
    started: false,
    running: Boolean(activeJob || jobIsRunning(job, now)),
    due,
    status: job?.status ?? null,
    backlogCards: candidates.length,
    dueCards: dueCandidates.length,
    directCards: candidates.filter((candidate) => Boolean(directSourceUrl(candidate))).length,
    nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    lastFinishedAt: lastFinishedAt?.toISOString() ?? null,
    lastResult: details.lastRun ?? null,
    budget: {
      configured: budget.configured,
      globalRemaining: budget.globalRemaining,
      consumerRemaining: budget.consumerRemaining,
      providerRemaining: budget.providerRemaining,
      providerPlan: budget.providerPlan,
    },
    error: details.error ?? null,
  };
}

function launchCardMarketBasePriceJob(now: Date): void {
  if (activeJob) return;
  activeJob = runCardMarketBasePriceJob(now)
    .catch((error: unknown) => {
      console.error(
        "[cardmarket-base-price-job] scheduled run failed:",
        error instanceof Error ? error.message : String(error)
      );
      return makeAttemptResult({
        outcome: "failed",
        startedAt: now,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      activeJob = null;
    });
}

export async function maybeStartCardMarketBasePriceJob(options?: {
  skip?: boolean;
  now?: Date;
}): Promise<CardMarketBasePriceJobSnapshot> {
  const now = options?.now ?? new Date();
  const snapshot = await getCardMarketBasePriceJobSnapshot(now);
  const providerReserveReached =
    snapshot.budget.providerRemaining != null && snapshot.budget.providerRemaining <= 25;
  const localBudgetExhausted =
    snapshot.budget.globalRemaining <= 0 || snapshot.budget.consumerRemaining <= 0;
  if (
    options?.skip ||
    snapshot.running ||
    !snapshot.due ||
    !snapshot.budget.configured ||
    localBudgetExhausted ||
    providerReserveReached
  ) {
    return snapshot;
  }
  launchCardMarketBasePriceJob(now);
  return { ...snapshot, started: true, running: true, status: "queued" };
}
