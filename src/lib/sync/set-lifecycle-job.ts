import "server-only";

import { db } from "@/lib/db";
import { assessSetLifecycle } from "@/lib/set-lifecycle-core";

const SET_LIFECYCLE_JOB_TYPE = "set-lifecycle-observations";
export const SET_LIFECYCLE_MODEL_VERSION = "set-lifecycle-v1";
const SET_LIFECYCLE_JOB_STALE_MS = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const REPRINT_RESET_WINDOW_MS = 180 * DAY_MS;
const MAX_SET_EVIDENCE_DISTANCE = 220;

const PACK_NAME_RE = /\b(?:booster|blister|sleeved\s+pack|single\s+pack)\b/i;
const PACK_CONTAINER_RE = /\b(?:box|case|display|bundle|collection|tin)\b/i;
const OOP_EVIDENCE_PHRASES = [
  "confirmed no reprint",
  "no reprint planned",
  "will not be reprinted",
  "out of print",
  "print run ended",
  "discontinued",
] as const;
const REPRINT_EVIDENCE_PHRASES = [
  "mass reprint",
  "reprint announced",
  "additional print run",
  "increased production",
  "back in stock",
  "restocked",
  "restock",
  "reprinted",
  "reprinting",
  "reprint",
] as const;

export interface SetLifecycleJobSnapshot {
  started: boolean;
  running: boolean;
  due: boolean;
  status: string | null;
  observationBucket: string;
  setsEvaluated: number;
  observationsWritten: number;
  lastFinishedAt: string | null;
  error: string | null;
}

type ProductRow = {
  id: string;
  episode_id: string;
  name: string;
  cm_lowest: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
  release_date: Date | null;
  contentSets: Array<{ episode_id: string }>;
};

type SnapshotRow = {
  product_id: string;
  fetched_at: Date;
  cm_lowest: number | null;
};

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function parseEpisodeReleaseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function laterDate(left: Date | null, right: Date | null | undefined): Date | null {
  if (!right) return left;
  return !left || right > left ? right : left;
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number | null, decimals = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getSetLifecycleObservationBucket(now: Date): Date {
  const bucket = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = bucket.getUTCDay();
  bucket.setUTCDate(bucket.getUTCDate() - (day === 0 ? 6 : day - 1));
  return bucket;
}

/** Missing prices are discarded, never converted to zero or supply loss. */
export function calculateLifecycleSetTrend(
  rows: readonly SnapshotRow[],
  horizonDays: number
): number | null {
  const byProduct = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    if (finitePositive(row.cm_lowest) == null) continue;
    const productRows = byProduct.get(row.product_id) ?? [];
    productRows.push(row);
    byProduct.set(row.product_id, productRows);
  }

  const trends: number[] = [];
  for (const productRows of byProduct.values()) {
    productRows.sort((left, right) => left.fetched_at.getTime() - right.fetched_at.getTime());
    const latest = productRows.at(-1);
    const latestPrice = finitePositive(latest?.cm_lowest);
    if (!latest || latestPrice == null) continue;
    const cutoff = latest.fetched_at.getTime() - horizonDays * DAY_MS;
    const baseline = [...productRows]
      .reverse()
      .find((row) => row.fetched_at.getTime() <= cutoff);
    const baselinePrice = finitePositive(baseline?.cm_lowest);
    if (baselinePrice == null) continue;
    const trend = ((latestPrice - baselinePrice) / baselinePrice) * 100;
    if (Number.isFinite(trend) && Math.abs(trend) <= 500) trends.push(trend);
  }
  return round(median(trends));
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function allIndexes(text: string, phrase: string): number[] {
  const indexes: number[] = [];
  let from = 0;
  while (phrase && from < text.length) {
    const index = text.indexOf(phrase, from);
    if (index < 0) break;
    indexes.push(index);
    from = index + Math.max(1, phrase.length);
  }
  return indexes;
}

function hasSetLevelLifecycleStatement(input: {
  sourceText: string;
  episodeName: string;
  episodeCode?: string | null;
  phrases: readonly string[];
}): boolean {
  const text = normalizeEvidenceText(input.sourceText);
  if (!text || !input.phrases.some((phrase) => text.includes(phrase))) return false;
  const anchors = [input.episodeName, input.episodeCode]
    .map((value) => normalizeEvidenceText(String(value ?? "")))
    .filter(
      (value, index) =>
        value.replace(/\s+/g, "").length >= 4 &&
        (index === 0 ||
          String(input.episodeCode ?? "").replace(/[^a-z0-9]/gi, "").length >= 4)
    );
  for (const anchor of anchors) {
    for (const anchorIndex of allIndexes(text, anchor)) {
      const anchorEnd = anchorIndex + anchor.length;
      for (const phrase of input.phrases) {
        for (const phraseIndex of allIndexes(text, phrase)) {
          const phraseEnd = phraseIndex + phrase.length;
          const distance = Math.max(0, anchorIndex - phraseEnd, phraseIndex - anchorEnd);
          if (distance <= MAX_SET_EVIDENCE_DISTANCE) return true;
        }
      }
    }
  }
  return false;
}

export function hasSetLevelOopStatement(input: {
  sourceText: string;
  episodeName: string;
  episodeCode?: string | null;
}): boolean {
  return hasSetLevelLifecycleStatement({ ...input, phrases: OOP_EVIDENCE_PHRASES });
}

export function hasSetLevelReprintStatement(input: {
  sourceText: string;
  episodeName: string;
  episodeCode?: string | null;
}): boolean {
  // Prevent "no reprint planned" from becoming a reprint through the generic
  // word when a different part of the document triggered the classifier.
  let sourceText = normalizeEvidenceText(input.sourceText);
  for (const oopPhrase of OOP_EVIDENCE_PHRASES) {
    sourceText = sourceText.replaceAll(oopPhrase, " ");
  }
  return hasSetLevelLifecycleStatement({
    ...input,
    sourceText,
    phrases: REPRINT_EVIDENCE_PHRASES,
  });
}

export function isOopEvidenceNewerThanReprint(
  oopObservedAt: Date | null | undefined,
  reprintObservedAt: Date | null | undefined
): boolean {
  if (!oopObservedAt) return false;
  return !reprintObservedAt || oopObservedAt.getTime() > reprintObservedAt.getTime();
}

export function lifecycleEpisodeIdFromSourceMetadata(
  metadataJson: string | null | undefined,
  game: string
): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { queryCardId?: unknown };
    if (typeof parsed.queryCardId !== "string") return null;
    const prefix = `watch-topic:${game}:lifecycle:`;
    return parsed.queryCardId.startsWith(prefix)
      ? parsed.queryCardId.slice(prefix.length).trim() || null
      : null;
  } catch {
    return null;
  }
}

function isPackProduct(name: string): boolean {
  return PACK_NAME_RE.test(name) && !PACK_CONTAINER_RE.test(name);
}

function productHasPrice(product: ProductRow): boolean {
  return [product.cm_lowest, product.cm_avg_7d, product.cm_avg_30d].some(
    (value) => finitePositive(value) != null
  );
}

function sourceEvidenceText(catalyst: {
  evidence_excerpt: string | null;
  source: {
    title: string | null;
    description: string | null;
    content_excerpt: string | null;
  };
}): string {
  return [
    catalyst.evidence_excerpt,
    catalyst.source.title,
    catalyst.source.description,
    catalyst.source.content_excerpt,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getLifecycleCatalystEvidenceAt(input: {
  observedAt: Date;
  publishedAt?: Date | null;
}): Date {
  return input.publishedAt ?? input.observedAt;
}

function catalystEvidenceAt(catalyst: {
  observed_at: Date;
  source: { published_at: Date | null };
}): Date {
  return getLifecycleCatalystEvidenceAt({
    observedAt: catalyst.observed_at,
    publishedAt: catalyst.source.published_at,
  });
}

export function isLifecycleReprintResetActive(input: {
  now: Date;
  observedAt: Date;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
}): boolean {
  const evidenceAt = getLifecycleCatalystEvidenceAt(input);
  const ageMs = input.now.getTime() - evidenceAt.getTime();
  const withinResetWindow = ageMs >= 0 && ageMs <= REPRINT_RESET_WINDOW_MS;

  // A late discovery must not make an old, dated reprint current again. The
  // catalyst expiry is only a fallback for sources without a publication date.
  if (input.publishedAt) return withinResetWindow;

  const stillActive = !input.expiresAt || input.expiresAt >= input.now;
  return withinResetWindow || stillActive;
}

function uniqueProductsForEpisode(
  products: readonly ProductRow[],
  episodeId: string
): ProductRow[] {
  const byId = new Map<string, ProductRow>();
  for (const product of products) {
    if (
      product.episode_id === episodeId ||
      product.contentSets.some((content) => content.episode_id === episodeId)
    ) {
      byId.set(product.id, product);
    }
  }
  return [...byId.values()];
}

async function runLifecycleObservationPass(now: Date, bucket: Date) {
  const episodes = await db.episode.findMany({
    where: {
      OR: [{ sealedProducts: { some: {} } }, { sealedProductContents: { some: {} } }],
    },
    select: { id: true, game: true, name: true, code: true, release_date: true },
    orderBy: { id: "asc" },
  });
  if (!episodes.length) return { setsEvaluated: 0, observationsWritten: 0 };

  const episodeIds = episodes.map((episode) => episode.id);
  const products = (await db.sealedProduct.findMany({
    where: {
      OR: [
        { episode_id: { in: episodeIds } },
        { contentSets: { some: { episode_id: { in: episodeIds } } } },
      ],
    },
    select: {
      id: true,
      episode_id: true,
      name: true,
      cm_lowest: true,
      cm_avg_7d: true,
      cm_avg_30d: true,
      release_date: true,
      contentSets: { select: { episode_id: true } },
    },
  })) as ProductRow[];
  const productIds = products.map((product) => product.id);
  const [snapshots, catalysts] = await Promise.all([
    productIds.length
      ? db.sealedPriceSnapshot.findMany({
          where: { product_id: { in: productIds } },
          select: { product_id: true, fetched_at: true, cm_lowest: true },
          orderBy: [{ product_id: "asc" }, { fetched_at: "asc" }],
        })
      : Promise.resolve([]),
    db.externalCardCatalyst.findMany({
      where: {
        game: { in: [...new Set(episodes.map((episode) => episode.game))] },
        catalyst_type: "reprint",
      },
      select: {
        id: true,
        game: true,
        card_id: true,
        direction: true,
        strength: true,
        headline: true,
        evidence_excerpt: true,
        observed_at: true,
        expires_at: true,
        source: {
          select: {
            id: true,
            canonical_url: true,
            domain: true,
            source_type: true,
            published_at: true,
            title: true,
            description: true,
            content_excerpt: true,
            metadata_json: true,
          },
        },
      },
    }),
  ]);

  const catalystCardIds = [
    ...new Set(
      catalysts
        .map((catalyst) => catalyst.card_id)
        .filter((cardId): cardId is string => Boolean(cardId))
    ),
  ];
  const catalystCards = catalystCardIds.length
    ? await db.card.findMany({
        where: { id: { in: catalystCardIds }, episode_id: { in: episodeIds } },
        select: { id: true, episode_id: true },
      })
    : [];
  const episodeByCatalystCardId = new Map(
    catalystCards.map((card) => [card.id, card.episode_id])
  );
  const knownEpisodeIds = new Set(episodeIds);
  const catalystsByEpisode = new Map<string, typeof catalysts>();
  for (const catalyst of catalysts) {
    const episodeId = lifecycleEpisodeIdFromSourceMetadata(
      catalyst.source.metadata_json,
      catalyst.game
    );
    if (!episodeId || !knownEpisodeIds.has(episodeId)) continue;
    if (!catalyst.card_id || episodeByCatalystCardId.get(catalyst.card_id) !== episodeId) {
      continue;
    }
    const rows = catalystsByEpisode.get(episodeId) ?? [];
    rows.push(catalyst);
    catalystsByEpisode.set(episodeId, rows);
  }
  const snapshotsByProduct = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) {
    const rows = snapshotsByProduct.get(snapshot.product_id) ?? [];
    rows.push(snapshot);
    snapshotsByProduct.set(snapshot.product_id, rows);
  }

  let observationsWritten = 0;
  for (const episode of episodes) {
    const episodeProducts = uniqueProductsForEpisode(products, episode.id);
    const episodeSnapshots = episodeProducts.flatMap(
      (product) => snapshotsByProduct.get(product.id) ?? []
    );
    const episodeCatalysts = catalystsByEpisode.get(episode.id) ?? [];
    const credibleOopCatalysts = episodeCatalysts.filter(
      (catalyst) =>
        catalyst.direction === "positive" &&
        catalyst.source.source_type !== "social" &&
        hasSetLevelOopStatement({
          sourceText: sourceEvidenceText(catalyst),
          episodeName: episode.name,
          episodeCode: episode.code,
        })
    );
    const credibleReprintCatalysts = episodeCatalysts.filter(
      (catalyst) =>
        catalyst.direction === "negative" &&
        catalyst.source.source_type !== "social" &&
        catalyst.strength >= 0.35 &&
        hasSetLevelReprintStatement({
          sourceText: sourceEvidenceText(catalyst),
          episodeName: episode.name,
          episodeCode: episode.code,
        })
    );
    const latestOopObservedAt = credibleOopCatalysts.reduce<Date | null>(
      (latest, catalyst) => laterDate(latest, catalystEvidenceAt(catalyst)),
      null
    );
    const latestReprintObservedAt = credibleReprintCatalysts.reduce<Date | null>(
      (latest, catalyst) => laterDate(latest, catalystEvidenceAt(catalyst)),
      null
    );
    const oopIsLatest = isOopEvidenceNewerThanReprint(
      latestOopObservedAt,
      latestReprintObservedAt
    );
    const explicitOopCatalysts = oopIsLatest
      ? credibleOopCatalysts.filter(
          (catalyst) =>
            !latestReprintObservedAt ||
            catalystEvidenceAt(catalyst) > latestReprintObservedAt
        )
      : [];
    const officialExplicitOop = explicitOopCatalysts.some(
      (catalyst) => catalyst.source.source_type === "official"
    );
    const explicitOopEvidence = explicitOopCatalysts.length > 0;
    const reprintIsLatest =
      latestReprintObservedAt != null &&
      (!latestOopObservedAt || latestReprintObservedAt >= latestOopObservedAt);
    const recentReprintCatalysts = reprintIsLatest
      ? credibleReprintCatalysts.filter((catalyst) => {
          return isLifecycleReprintResetActive({
            now,
            observedAt: catalyst.observed_at,
            publishedAt: catalyst.source.published_at,
            expiresAt: catalyst.expires_at,
          });
        })
      : [];

    let latestProductReleaseDate: Date | null = null;
    for (const product of episodeProducts) {
      latestProductReleaseDate = laterDate(latestProductReleaseDate, product.release_date);
    }
    const releaseDate = parseEpisodeReleaseDate(episode.release_date);
    const trend30dPct = calculateLifecycleSetTrend(episodeSnapshots, 30);
    const trend90dPct = calculateLifecycleSetTrend(episodeSnapshots, 90);
    const productCount = episodeProducts.length;
    const pricedProductCount = episodeProducts.filter(productHasPrice).length;
    const packProductCount = episodeProducts.filter((product) => isPackProduct(product.name)).length;
    const assessment = assessSetLifecycle({
      asOf: now,
      releaseDate,
      latestProductReleaseDate,
      officialExplicitOop,
      explicitOopEvidence,
      recentReprintOrRestock: recentReprintCatalysts.length > 0,
      reprintOrRestockObservedAt: recentReprintCatalysts.reduce<Date | null>(
        (latest, catalyst) => laterDate(latest, catalystEvidenceAt(catalyst)),
        null
      ),
      explicitSupplyContraction: false,
      // Weekly model rows and price snapshots are not listing-supply samples.
      observationCount: 0,
      supplyDataAsOf: null,
      pricedProductCount,
      totalProductCount: productCount,
      activeProductCount: null,
      priceTrend30dPct: trend30dPct,
      priceTrend90dPct: trend90dPct,
    });
    const releaseAgeDays = releaseDate
      ? Math.floor((now.getTime() - releaseDate.getTime()) / DAY_MS)
      : null;
    const historicalLatestReprint = latestReprintObservedAt
      ? credibleReprintCatalysts.filter(
          (catalyst) =>
            catalystEvidenceAt(catalyst).getTime() === latestReprintObservedAt.getTime()
        )
      : [];
    const catalystEvidence = [
      ...explicitOopCatalysts,
      ...(recentReprintCatalysts.length ? recentReprintCatalysts : historicalLatestReprint),
    ]
      .filter(
        (catalyst, index, all) =>
          all.findIndex((candidate) => candidate.source.id === catalyst.source.id) === index
      )
      .slice(0, 8)
      .map((catalyst) => ({
        type: catalyst.direction === "negative" ? "reprint-or-restock" : "oop-claim",
        official: catalyst.source.source_type === "official",
        strength: catalyst.strength,
        observedAt: catalystEvidenceAt(catalyst).toISOString(),
        discoveredAt: catalyst.observed_at.toISOString(),
        source: catalyst.source.domain,
        url: catalyst.source.canonical_url,
        headline: catalyst.headline,
      }));
    const evidenceJson = JSON.stringify({
      episode: { id: episode.id, game: episode.game, name: episode.name },
      assessment: {
        label: assessment.label,
        summary: assessment.summary,
        reasons: assessment.reasons,
        confidenceLabel: assessment.confidenceLabel,
      },
      catalysts: catalystEvidence,
    });

    const observationData = {
      status: assessment.status,
      oop_probability: assessment.oopProbability,
      confidence: assessment.confidence,
      release_age_days: releaseAgeDays,
      product_count: productCount,
      priced_product_count: pricedProductCount,
      pack_product_count: packProductCount,
      latest_product_release_at: latestProductReleaseDate,
      latest_supply_observed_at: null,
      trend_30d_pct: trend30dPct,
      trend_90d_pct: trend90dPct,
      explicit_oop: officialExplicitOop,
      active_reprint: recentReprintCatalysts.length > 0,
      evidence_json: evidenceJson,
      observed_at: now,
    };
    await db.setLifecycleObservation.upsert({
      where: {
        episode_id_observation_bucket_model_version: {
          episode_id: episode.id,
          observation_bucket: bucket,
          model_version: SET_LIFECYCLE_MODEL_VERSION,
        },
      },
      create: {
        episode_id: episode.id,
        model_version: SET_LIFECYCLE_MODEL_VERSION,
        observation_bucket: bucket,
        ...observationData,
      },
      update: observationData,
    });
    observationsWritten += 1;
  }
  return { setsEvaluated: episodes.length, observationsWritten };
}

function readJobError(detailsJson: string | null | undefined): string | null {
  if (!detailsJson) return null;
  try {
    const parsed = JSON.parse(detailsJson) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "P2002"
  );
}

export async function maybeRunSetLifecycleJob(options?: {
  now?: Date;
}): Promise<SetLifecycleJobSnapshot> {
  const now = options?.now ?? new Date();
  const bucket = getSetLifecycleObservationBucket(now);
  const observationBucket = bucket.toISOString();
  const lifecycleWhere = {
    OR: [{ sealedProducts: { some: {} } }, { sealedProductContents: { some: {} } }],
  };
  const [job, episodeCount, observationCount] = await Promise.all([
    db.syncJob.findUnique({ where: { type: SET_LIFECYCLE_JOB_TYPE } }),
    db.episode.count({ where: lifecycleWhere }),
    db.setLifecycleObservation.count({
      where: { observation_bucket: bucket, model_version: SET_LIFECYCLE_MODEL_VERSION },
    }),
  ]);
  const due = observationCount < episodeCount;
  const running = Boolean(
    job &&
      ["queued", "running"].includes(job.status) &&
      job.heartbeat_at &&
      job.heartbeat_at > new Date(now.getTime() - SET_LIFECYCLE_JOB_STALE_MS)
  );
  const base: SetLifecycleJobSnapshot = {
    started: false,
    running,
    due,
    status: job?.status ?? null,
    observationBucket,
    setsEvaluated: 0,
    observationsWritten: 0,
    lastFinishedAt: job?.finished_at?.toISOString() ?? null,
    error: job?.status === "failed" ? readJobError(job.details_json) : null,
  };
  if (!due || running) return base;

  let claimedJob = job;
  if (!claimedJob) {
    try {
      claimedJob = await db.syncJob.create({
        data: {
          type: SET_LIFECYCLE_JOB_TYPE,
          status: "running",
          started_at: now,
          heartbeat_at: now,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return { ...base, running: true, status: "running" };
    }
  } else {
    const staleBefore = new Date(now.getTime() - SET_LIFECYCLE_JOB_STALE_MS);
    const claimed = await db.syncJob.updateMany({
      where: {
        id: claimedJob.id,
        OR: [
          { status: { notIn: ["queued", "running"] } },
          { heartbeat_at: null },
          { heartbeat_at: { lte: staleBefore } },
        ],
      },
      data: {
        status: "running",
        details_json: JSON.stringify({ observationBucket }),
        started_at: now,
        finished_at: null,
        heartbeat_at: now,
      },
    });
    if (claimed.count !== 1) return { ...base, running: true, status: "running" };
  }

  try {
    const pass = await runLifecycleObservationPass(now, bucket);
    const finishedAt = new Date();
    await db.syncJob.update({
      where: { id: claimedJob.id },
      data: {
        status: "success",
        details_json: JSON.stringify({
          observationBucket,
          modelVersion: SET_LIFECYCLE_MODEL_VERSION,
          ...pass,
          externalRequests: 0,
        }),
        heartbeat_at: finishedAt,
        finished_at: finishedAt,
      },
    });
    return {
      started: true,
      running: false,
      due: false,
      status: "success",
      observationBucket,
      ...pass,
      lastFinishedAt: finishedAt.toISOString(),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    await db.syncJob
      .update({
        where: { id: claimedJob.id },
        data: {
          status: "failed",
          details_json: JSON.stringify({
            observationBucket,
            modelVersion: SET_LIFECYCLE_MODEL_VERSION,
            error: message,
          }),
          heartbeat_at: finishedAt,
          finished_at: finishedAt,
        },
      })
      .catch(() => undefined);
    return {
      ...base,
      started: true,
      running: false,
      status: "failed",
      lastFinishedAt: finishedAt.toISOString(),
      error: message,
    };
  }
}
