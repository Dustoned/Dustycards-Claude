import "server-only";

import { statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import {
  buildCardPrintingEvidence,
  buildFallbackCardIdentity,
  CARD_REPRINT_MODEL_VERSION,
  getArtworkHashSimilarity,
  getPrintingMatchDetails,
  type ArtworkHash,
  type CardPrintingMatchMethod,
  type PrintingLookupCard,
  type TcgDexCardIdentity,
} from "@/lib/card-printings";

const GROUPS_PER_RUN = 1;
const EVIDENCE_CONCURRENCY = 1;
const EVENT_LOOP_YIELD_INTERVAL = 128;
const WEB_TRAFFIC_YIELD_MS = 25;
const INITIAL_RUN_DELAY_MS = 2 * 60_000;
const RUN_COOLDOWN_MS = 5 * 60_000;
const EVIDENCE_REFRESH_MS = 90 * 24 * 60 * 60_000;
const PARTIAL_RETRY_MS = 6 * 60 * 60_000;
const EXTERNAL_WORKER_HEARTBEAT_MAX_AGE_MS = 10 * 60_000;

export const CARD_REPRINT_EXTERNAL_WORKER_HEARTBEAT_PATH = path.join(
  process.cwd(),
  ".card-reprint-worker-heartbeat"
);

type ReprintCandidateCard = PrintingLookupCard & {
  printingEvidence: {
    image_url: string;
    identity_json: string | null;
    artwork_hash_full: string | null;
    artwork_hash_illustration: string | null;
    source_status: string;
    source_checked_at: Date;
    match_status: string | null;
    match_version: string | null;
    matched_at: Date | null;
  } | null;
};

type PendingAnchor = {
  id: string;
};

type PreparedEvidence = {
  identity: TcgDexCardIdentity;
  artworkHash: ArtworkHash | null;
  sourceStatus: string;
  sourceCheckedAt: Date;
};

export interface CardReprintJobSnapshot {
  running: boolean;
  lastFinishedAt: string | null;
  lastError: string | null;
  lastGroupsProcessed: number;
  lastCardsProcessed: number;
  lastRelationsWritten: number;
}

export interface CardReprintBacklogBatchResult {
  groupsProcessed: number;
  cardsProcessed: number;
  relationsWritten: number;
}

export interface CardReprintBacklogProgress {
  pendingCards: number;
  pendingFamilies: number;
}

let running = false;
let lastFinishedAt: string | null = null;
let lastError: string | null = null;
let lastGroupsProcessed = 0;
let lastCardsProcessed = 0;
let lastRelationsWritten = 0;
let nextEligibleAt = Date.now() + INITIAL_RUN_DELAY_MS;

function yieldToWebTraffic(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, WEB_TRAFFIC_YIELD_MS));
}

export function isExternalCardReprintWorkerActive(now = Date.now()): boolean {
  try {
    return now - statSync(CARD_REPRINT_EXTERNAL_WORKER_HEARTBEAT_PATH).mtimeMs
      < EXTERNAL_WORKER_HEARTBEAT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function getCardReprintJobSnapshot(): CardReprintJobSnapshot {
  return {
    running,
    lastFinishedAt,
    lastError,
    lastGroupsProcessed,
    lastCardsProcessed,
    lastRelationsWritten,
  };
}

function parseIdentity(value: string | null): TcgDexCardIdentity | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as TcgDexCardIdentity : null;
  } catch {
    return null;
  }
}

function getStoredArtworkHash(card: ReprintCandidateCard): ArtworkHash | null {
  const full = card.printingEvidence?.artwork_hash_full;
  const illustration = card.printingEvidence?.artwork_hash_illustration;
  return full && illustration ? { full, illustration } : null;
}

function shouldRefreshEvidence(card: ReprintCandidateCard, now: Date): boolean {
  const evidence = card.printingEvidence;
  if (!evidence || evidence.image_url !== card.image_url) return true;
  if (!getStoredArtworkHash(card)) return true;
  if (!parseIdentity(evidence.identity_json)) {
    if (evidence.match_version !== CARD_REPRINT_MODEL_VERSION) return true;
    if (evidence.source_status !== "image-only") return true;
  }
  return now.getTime() - evidence.source_checked_at.getTime() >= EVIDENCE_REFRESH_MS;
}

async function findPendingAnchor(now: Date): Promise<PendingAnchor | null> {
  const staleBefore = new Date(now.getTime() - EVIDENCE_REFRESH_MS).toISOString();
  const retryBefore = new Date(now.getTime() - PARTIAL_RETRY_MS).toISOString();
  const rows = await db.$queryRawUnsafe<PendingAnchor[]>(
    `
    SELECT c.id
    FROM "Card" c
    LEFT JOIN "CardPrintingEvidence" evidence ON evidence.card_id = c.id
    WHERE c.game = 'pokemon'
      AND c.image_url IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "Card" candidate
        WHERE candidate.id <> c.id
          AND candidate.game = c.game
          AND candidate.name = c.name
          AND coalesce(candidate.supertype, '') = coalesce(c.supertype, '')
          AND candidate.image_url IS NOT NULL
      )
      AND (
        evidence.card_id IS NULL
        OR evidence.match_version IS NULL
        OR evidence.match_version <> ?
        OR evidence.matched_at IS NULL
        OR evidence.image_url <> c.image_url
        OR evidence.source_checked_at < ?
        OR (evidence.source_status = 'missing-image' AND evidence.source_checked_at < ?)
      )
    ORDER BY
      evidence.card_id IS NOT NULL,
      coalesce(c.market_score, 0) DESC,
      c.created_at DESC,
      c.id ASC
    LIMIT 1
    `,
    CARD_REPRINT_MODEL_VERSION,
    staleBefore,
    retryBefore
  );
  return rows[0] ?? null;
}

export async function getCardReprintBacklogProgress(
  now: Date = new Date()
): Promise<CardReprintBacklogProgress> {
  const staleBefore = new Date(now.getTime() - EVIDENCE_REFRESH_MS).toISOString();
  const retryBefore = new Date(now.getTime() - PARTIAL_RETRY_MS).toISOString();
  const rows = await db.$queryRawUnsafe<Array<{
    pendingCards: bigint | number;
    pendingFamilies: bigint | number;
  }>>(
    `
    SELECT
      count(*) AS pendingCards,
      count(DISTINCT c.name || char(0) || coalesce(c.supertype, '')) AS pendingFamilies
    FROM "Card" c
    LEFT JOIN "CardPrintingEvidence" evidence ON evidence.card_id = c.id
    WHERE c.game = 'pokemon'
      AND c.image_url IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "Card" candidate
        WHERE candidate.id <> c.id
          AND candidate.game = c.game
          AND candidate.name = c.name
          AND coalesce(candidate.supertype, '') = coalesce(c.supertype, '')
          AND candidate.image_url IS NOT NULL
      )
      AND (
        evidence.card_id IS NULL
        OR evidence.match_version IS NULL
        OR evidence.match_version <> ?
        OR evidence.matched_at IS NULL
        OR evidence.image_url <> c.image_url
        OR evidence.source_checked_at < ?
        OR (evidence.source_status = 'missing-image' AND evidence.source_checked_at < ?)
      )
    `,
    CARD_REPRINT_MODEL_VERSION,
    staleBefore,
    retryBefore
  );
  const row = rows[0];
  return {
    pendingCards: Number(row?.pendingCards ?? 0),
    pendingFamilies: Number(row?.pendingFamilies ?? 0),
  };
}

async function loadCandidateGroup(anchorId: string): Promise<ReprintCandidateCard[]> {
  const anchor = await db.card.findUnique({
    where: { id: anchorId },
    select: {
      game: true,
      name: true,
      supertype: true,
    },
  });
  if (!anchor) return [];

  return db.card.findMany({
    where: {
      game: anchor.game,
      name: anchor.name,
      supertype: anchor.supertype,
      image_url: { not: null },
    },
    orderBy: [{ episode: { release_date: "asc" } }, { card_number: "asc" }],
    select: {
      id: true,
      game: true,
      name: true,
      hp: true,
      artist: true,
      image_url: true,
      tcgid: true,
      supertype: true,
      episode: {
        select: { id: true, name: true, code: true, release_date: true },
      },
      printingEvidence: {
        select: {
          image_url: true,
          identity_json: true,
          artwork_hash_full: true,
          artwork_hash_illustration: true,
          source_status: true,
          source_checked_at: true,
          match_status: true,
          match_version: true,
          matched_at: true,
        },
      },
    },
  });
}

async function prepareEvidence(
  card: ReprintCandidateCard,
  now: Date
): Promise<PreparedEvidence> {
  const existingIdentity = parseIdentity(card.printingEvidence?.identity_json ?? null);
  const existingArtworkHash = getStoredArtworkHash(card);
  const refresh = shouldRefreshEvidence(card, now);
  const loaded = refresh ? await buildCardPrintingEvidence(card) : null;
  const canReuseExisting = card.printingEvidence?.image_url === card.image_url;
  const identity = loaded?.identity ?? (canReuseExisting ? existingIdentity : null);
  const artworkHash = loaded?.artworkHash ?? (canReuseExisting ? existingArtworkHash : null);
  const sourceStatus = !artworkHash
    ? "missing-image"
    : identity
      ? "complete"
      : "image-only";
  const sourceCheckedAt = loaded ? now : card.printingEvidence?.source_checked_at ?? now;

  await db.cardPrintingEvidence.upsert({
    where: { card_id: card.id },
    create: {
      card_id: card.id,
      image_url: card.image_url!,
      identity_json: identity ? JSON.stringify(identity) : null,
      artwork_hash_full: artworkHash?.full ?? null,
      artwork_hash_illustration: artworkHash?.illustration ?? null,
      source_status: sourceStatus,
      source_checked_at: sourceCheckedAt,
      match_status: "running",
    },
    update: {
      image_url: card.image_url!,
      identity_json: identity ? JSON.stringify(identity) : null,
      artwork_hash_full: artworkHash?.full ?? null,
      artwork_hash_illustration: artworkHash?.illustration ?? null,
      source_status: sourceStatus,
      source_checked_at: sourceCheckedAt,
      match_status: "running",
    },
  });

  return {
    identity: identity ?? buildFallbackCardIdentity(card),
    artworkHash,
    sourceStatus,
    sourceCheckedAt,
  };
}

async function processCandidateGroup(cards: ReprintCandidateCard[], now: Date) {
  if (cards.length < 2) return { cards: cards.length, relations: 0 };

  // Treat every same-name printing as a candidate family. This deliberately
  // favors recall (including promo/jumbo/gold/rainbow cards with changed HP or
  // illustrator), while the identity + artwork matcher still decides which
  // cards belong together. Small batches keep provider load predictable.
  const evidence: PreparedEvidence[] = [];
  for (let offset = 0; offset < cards.length; offset += EVIDENCE_CONCURRENCY) {
    evidence.push(...await Promise.all(
      cards.slice(offset, offset + EVIDENCE_CONCURRENCY)
        .map((card) => prepareEvidence(card, now))
    ));
    await yieldToWebTraffic();
  }
  const directMatches = new Map<string, {
    method: CardPrintingMatchMethod;
    imageSimilarity: number;
  }>();
  const overrides = await db.cardPrintingOverride.findMany({
    where: {
      OR: [
        { source_card_id: { in: cards.map((card) => card.id) } },
        { target_card_id: { in: cards.map((card) => card.id) } },
      ],
    },
    select: { source_card_id: true, target_card_id: true, decision: true },
  });
  const overrideByPair = new Map(
    overrides.map((override) => [
      [override.source_card_id, override.target_card_id].sort().join("\u0000"),
      override.decision,
    ])
  );

  let comparisons = 0;
  for (let left = 0; left < cards.length; left += 1) {
    for (let right = left + 1; right < cards.length; right += 1) {
      comparisons += 1;
      if (comparisons % EVENT_LOOP_YIELD_INTERVAL === 0) {
        await yieldToWebTraffic();
      }
      const override = overrideByPair.get([cards[left].id, cards[right].id].sort().join("\u0000"));
      if (override === "exclude") continue;
      if (override === "include") {
        directMatches.set(`${left}:${right}`, { method: "manual-include", imageSimilarity: 1 });
        continue;
      }
      const imageSimilarity = getArtworkHashSimilarity(
        evidence[left].artworkHash,
        evidence[right].artworkHash
      );
      const match = getPrintingMatchDetails(
        evidence[left].identity,
        evidence[right].identity,
        imageSimilarity
      );
      if (!match) continue;
      // A likely-art match is only a review candidate and is deliberately not
      // shown as a reprint until an admin accepts it. Keep same-set candidates
      // too: alternate-number printings can be legitimate reprints.
      directMatches.set(`${left}:${right}`, {
        method: match.method,
        imageSimilarity,
      });
    }
  }

  const relations: Array<{
    source_card_id: string;
    target_card_id: string;
    match_type: string;
    match_method: string;
    image_similarity: number;
    model_version: string;
    matched_at: Date;
  }> = [];
  for (const [key, direct] of directMatches) {
    const [left, right] = key.split(":").map(Number);
    for (const [source, target] of [[left, right], [right, left]]) {
      relations.push({
        source_card_id: cards[source].id,
        target_card_id: cards[target].id,
        match_type: "reprint",
        match_method: direct.method,
        image_similarity: direct.imageSimilarity,
        model_version: CARD_REPRINT_MODEL_VERSION,
        matched_at: now,
      });
    }
  }

  const cardIds = cards.map((card) => card.id);
  const matchStatus = evidence.every((item) => item.artworkHash != null)
    ? "complete"
    : "partial";
  await db.$transaction([
    db.cardPrintingRelation.deleteMany({
      where: {
        OR: [
          { source_card_id: { in: cardIds } },
          { target_card_id: { in: cardIds } },
        ],
      },
    }),
    ...(relations.length > 0
      ? [db.cardPrintingRelation.createMany({ data: relations })]
      : []),
    db.cardPrintingEvidence.updateMany({
      where: { card_id: { in: cardIds } },
      data: {
        match_status: matchStatus,
        match_version: CARD_REPRINT_MODEL_VERSION,
        matched_at: now,
      },
    }),
  ]);

  return { cards: cards.length, relations: relations.length };
}

/** Rebuilds one complete candidate family; useful for focused repairs/audits. */
export async function rebuildCardReprintGroup(
  cardId: string,
  now: Date = new Date()
): Promise<{ cards: number; relations: number }> {
  const cards = await loadCandidateGroup(cardId);
  return processCandidateGroup(cards, now);
}

export async function runCardReprintBacklogBatch(
  now: Date,
  maxGroups: number = GROUPS_PER_RUN
): Promise<CardReprintBacklogBatchResult> {
  let groupsProcessed = 0;
  let cardsProcessed = 0;
  let relationsWritten = 0;
  const processedAnchors = new Set<string>();

  while (groupsProcessed < Math.max(1, Math.floor(maxGroups))) {
    const anchor = await findPendingAnchor(now);
    if (!anchor || processedAnchors.has(anchor.id)) break;
    processedAnchors.add(anchor.id);
    const cards = await loadCandidateGroup(anchor.id);
    const result = await processCandidateGroup(cards, now);
    groupsProcessed += 1;
    cardsProcessed += result.cards;
    relationsWritten += result.relations;
    await yieldToWebTraffic();
  }

  return { groupsProcessed, cardsProcessed, relationsWritten };
}

export function maybeRunCardReprintJob(now: Date = new Date()): CardReprintJobSnapshot {
  if (
    running ||
    now.getTime() < nextEligibleAt ||
    isExternalCardReprintWorkerActive(now.getTime())
  ) return getCardReprintJobSnapshot();
  running = true;

  void runCardReprintBacklogBatch(now)
    .then((result) => {
      lastGroupsProcessed = result.groupsProcessed;
      lastCardsProcessed = result.cardsProcessed;
      lastRelationsWritten = result.relationsWritten;
      lastError = null;
    })
    .catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
      console.error("[card-reprint-job] backlog batch failed:", lastError);
    })
    .finally(() => {
      running = false;
      lastFinishedAt = new Date().toISOString();
      nextEligibleAt = Date.now() + RUN_COOLDOWN_MS;
    });

  return getCardReprintJobSnapshot();
}
