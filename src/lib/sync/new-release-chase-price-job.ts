import "server-only";

import { parseCardMarketScrape, parseStrictCardMarketEnglishNmPrice } from "@/lib/card-submissions";
import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
import { buildCardMarketProductUrl, getCardMarketUrlGame } from "@/lib/cardmarket";
import { db } from "@/lib/db";
import {
  selectExpansionChaseCandidates,
  type ExpansionChaseCandidateInput,
} from "@/lib/expansion-chase-radar-core";
import {
  normalizeTradingCardGame,
  type TradingCardGame,
} from "@/lib/games";
import {
  evaluateNewReleaseChasePriceGuard,
  getNewReleaseChaseCadenceBucket,
  getNewReleaseChaseFailureDelayMs,
  getNewReleaseChaseNextAttemptAt,
  getNewReleaseChaseWatchCadence,
  NEW_RELEASE_CHASE_WATCH_MAX_CANDIDATES,
  NEW_RELEASE_CHASE_WATCH_MAX_PER_RUN,
  NEW_RELEASE_CHASE_WATCH_PROVIDER,
  NEW_RELEASE_CHASE_WATCH_SOURCE,
} from "@/lib/new-release-chase-watch-core";
import { getLatestNewReleaseChaseWatchEpisodes } from "@/lib/new-release-chase-watch-server";
import {
  completeScrapeDoReservation,
  failScrapeDoReservation,
  getNewReleaseChaseScrapeDoBudgetSnapshot,
  reserveScrapeDoCredits,
  ScrapeDoBudgetError,
} from "@/lib/scrapedo-budget";
import { scrapeScrapeDoPage } from "@/lib/scrapedo";

const JOB_TYPE = "new-release-chase-prices";
const JOB_STALE_MS = 10 * 60_000;
const JOB_HEARTBEAT_MS = 30_000;
const CARDMARKET_RENDERED_REQUEST_CREDITS = 5;
const CARDMARKET_PROVIDER_TIMEOUT_MS = 65_000;
const CARDMARKET_TRANSPORT_TIMEOUT_MS = 75_000;

let activeJob: Promise<void> | null = null;

type WatchCandidate = {
  cardId: string;
  episodeId: string;
  releaseDate: string;
  game: TradingCardGame;
  name: string;
  cardNumber: string | null;
  cardmarketId: string;
  cardmarketUrl: string;
  candidateRank: number;
  currentPrice: number | null;
  priceFetchedAt: Date | null;
  firstSeenAt: Date;
  lastSuccessAt: Date | null;
  nextAttemptAt: Date | null;
  consecutiveFailures: number;
  pendingPrice: number | null;
  pendingConfirmations: number;
  status: string;
  ambiguousSource: boolean;
};

export interface NewReleaseChasePriceJobSnapshot {
  started: boolean;
  running: boolean;
  status: string | null;
  trackedCards: number;
  dueCards: number;
  nextAttemptAt: string | null;
  lastSuccessAt: string | null;
  provider: "scrapedo";
  budgetPaused: boolean;
  dailyCreditsUsed: number;
  dailyCreditLimit: number;
  monthlyCreditsUsed: number;
  monthlyCreditLimit: number;
  error: string | null;
}

function minDate(values: Array<Date | null>): Date | null {
  return values.reduce<Date | null>((earliest, value) => {
    if (!value) return earliest;
    return !earliest || value < earliest ? value : earliest;
  }, null);
}

function maxDate(values: Array<Date | null>): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, null);
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeCardNumber(value: string | null | undefined): string {
  return (value ?? "").toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

function scrapeMatchesCandidate(
  candidate: WatchCandidate,
  scrape: Awaited<ReturnType<typeof scrapeScrapeDoPage>>
): boolean {
  const resolvedGame = getCardMarketUrlGame(scrape.sourceUrl);
  if (resolvedGame && resolvedGame !== candidate.game) return false;
  try {
    const resolvedProductId = new URL(scrape.sourceUrl).searchParams.get("idProduct");
    if (resolvedProductId !== candidate.cardmarketId) return false;
  } catch {
    return false;
  }

  const parsed = parseCardMarketScrape(scrape);
  const expectedName = normalizeIdentity(candidate.name);
  const parsedName = normalizeIdentity(parsed.name);
  if (!expectedName || !parsedName || expectedName !== parsedName) {
    return false;
  }
  const expectedNumber = normalizeCardNumber(candidate.cardNumber);
  const parsedNumber = normalizeCardNumber(parsed.cardNumber);
  if (expectedNumber && parsedNumber && expectedNumber !== parsedNumber) return false;
  return true;
}

async function loadWatchCandidates(now: Date, persistState: boolean): Promise<WatchCandidate[]> {
  const episodes = (await getLatestNewReleaseChaseWatchEpisodes(now)).filter(
    (episode): episode is NonNullable<typeof episode> => Boolean(episode?.release_date)
  );
  const output: WatchCandidate[] = [];

  for (const episode of episodes) {
    const cards = await db.card.findMany({
      where: { episode_id: episode.id, cardmarket_id: { not: null } },
      orderBy: [{ card_number: "asc" }, { id: "asc" }],
      select: {
        id: true,
        game: true,
        episode_id: true,
        name: true,
        image_url: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        cardmarket_id: true,
        cardmarket_url: true,
      },
    });
    const latestPrices = await loadLatestSafeEnglishNmPrices(
      cards.map((card) => ({
        id: card.id,
        game: card.game,
        episodeId: card.episode_id,
        name: card.name,
        cardNumber: card.card_number,
        printedCardNumber: card.printed_card_number,
        cardmarketId: card.cardmarket_id,
        cardmarketUrl: card.cardmarket_url,
      }))
    );
    const inputs: ExpansionChaseCandidateInput[] = cards.map((card) => {
      const price = latestPrices.get(card.id);
      return {
        id: card.id,
        name: card.name,
        imageUrl: card.image_url,
        cardNumber: card.card_number,
        printedCardNumber: card.printed_card_number,
        rarity: card.rarity,
        currentPrice: price?.value ?? null,
        priceFetchedAt: price?.fetchedAt ?? null,
      };
    });
    const selected = selectExpansionChaseCandidates(
      inputs,
      NEW_RELEASE_CHASE_WATCH_MAX_CANDIDATES
    );
    const selectedIds = selected.map((card) => card.id);
    const selectedCards = new Map(cards.map((card) => [card.id, card]));
    const marketIds = selected
      .map((card) => selectedCards.get(card.id)?.cardmarket_id)
      .filter((value): value is string => Boolean(value));
    const duplicateRows = marketIds.length
      ? await db.card.groupBy({
          by: ["game", "cardmarket_id"],
          where: {
            game: episode.game,
            cardmarket_id: { in: marketIds },
          },
          _count: { _all: true },
        })
      : [];
    const duplicateIds = new Set(
      duplicateRows
        .filter((row) => row._count._all > 1 && row.cardmarket_id)
        .map((row) => `${row.game}:${row.cardmarket_id}`)
    );

    if (persistState && selectedIds.length) {
      await db.$transaction(
        selectedIds.map((cardId, index) =>
          db.newReleaseChasePriceWatch.upsert({
            where: { card_id: cardId },
            create: {
              card_id: cardId,
              episode_id: episode.id,
              candidate_rank: index + 1,
              status: "scheduled",
              next_attempt_at: now,
            },
            update: {
              episode_id: episode.id,
              candidate_rank: index + 1,
            },
          })
        )
      );
    }

    const states = selectedIds.length
      ? await db.newReleaseChasePriceWatch.findMany({ where: { card_id: { in: selectedIds } } })
      : [];
    const stateById = new Map(states.map((state) => [state.card_id, state]));
    const scheduleClamps: Array<{ cardId: string; nextAttemptAt: Date }> = [];
    selected.forEach((input, index) => {
      const card = selectedCards.get(input.id);
      const state = stateById.get(input.id);
      if (!card?.cardmarket_id || !state || !episode.release_date) return;
      const cadence = getNewReleaseChaseWatchCadence({
        releaseDate: episode.release_date,
        firstSeenAt: state.first_seen_at,
        candidateRank: index + 1,
        now,
      });
      if (!cadence.active) return;
      const policyNextAttemptAt = getNewReleaseChaseNextAttemptAt({
          releaseDate: episode.release_date,
          firstSeenAt: state.first_seen_at,
          candidateRank: index + 1,
          lastSuccessAt: state.last_success_at,
          now,
        });
      const nextAttemptAt =
        state.next_attempt_at &&
        (!policyNextAttemptAt || state.next_attempt_at <= policyNextAttemptAt)
          ? state.next_attempt_at
          : policyNextAttemptAt;
      if (
        persistState &&
        nextAttemptAt &&
        state.next_attempt_at?.getTime() !== nextAttemptAt.getTime()
      ) {
        scheduleClamps.push({ cardId: card.id, nextAttemptAt });
      }
      output.push({
        cardId: card.id,
        episodeId: episode.id,
        releaseDate: episode.release_date,
        game: normalizeTradingCardGame(card.game),
        name: card.name,
        cardNumber: card.printed_card_number ?? card.card_number,
        cardmarketId: card.cardmarket_id,
        cardmarketUrl: buildCardMarketProductUrl(
          card.cardmarket_id,
          normalizeTradingCardGame(card.game)
        ),
        candidateRank: index + 1,
        currentPrice: input.currentPrice,
        priceFetchedAt:
          input.priceFetchedAt instanceof Date
            ? input.priceFetchedAt
            : input.priceFetchedAt
              ? new Date(input.priceFetchedAt)
              : null,
        firstSeenAt: state.first_seen_at,
        lastSuccessAt: state.last_success_at,
        nextAttemptAt,
        consecutiveFailures: state.consecutive_failures,
        pendingPrice: state.candidate_price,
        pendingConfirmations: state.candidate_confirmations,
        status: state.status,
        ambiguousSource: duplicateIds.has(`${card.game}:${card.cardmarket_id}`),
      });
    });
    if (scheduleClamps.length) {
      await db.$transaction(
        scheduleClamps.map(({ cardId, nextAttemptAt }) =>
          db.newReleaseChasePriceWatch.update({
            where: { card_id: cardId },
            data: { next_attempt_at: nextAttemptAt },
          })
        )
      );
    }
  }
  return output;
}

function readMetadataNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function writeAcceptedPrice(
  candidate: WatchCandidate,
  priceEur: number,
  fetchedAt: Date,
  sourceUrl: string
): Promise<void> {
  await db.$transaction(async (tx) => {
    const latest = await tx.price.findFirst({
      where: { card_id: candidate.cardId },
      orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        fetched_at: true,
        changed_at: true,
        source: true,
        source_provider: true,
        source_url: true,
        cm_en_lowest_nm: true,
        cm_de_lowest_nm: true,
        cm_fr_lowest_nm: true,
        cm_es_lowest_nm: true,
        cm_it_lowest_nm: true,
        cm_jp_lowest_nm: true,
        cm_en_avg_30d: true,
        cm_en_avg_7d: true,
        tcp_market: true,
        tcp_mid: true,
        tcp_low: true,
      },
    });
    if (latest?.cm_en_lowest_nm === priceEur) {
      await tx.price.update({
        where: { id: latest.id },
        data: {
          fetched_at: fetchedAt,
          source: NEW_RELEASE_CHASE_WATCH_SOURCE,
          source_provider: NEW_RELEASE_CHASE_WATCH_PROVIDER,
          source_url: sourceUrl,
        },
      });
    } else {
      await tx.price.create({
        data: {
          card_id: candidate.cardId,
          fetched_at: fetchedAt,
          changed_at: fetchedAt,
          source: NEW_RELEASE_CHASE_WATCH_SOURCE,
          source_provider: NEW_RELEASE_CHASE_WATCH_PROVIDER,
          source_url: sourceUrl,
          cm_en_lowest_nm: priceEur,
          cm_de_lowest_nm: latest?.cm_de_lowest_nm ?? null,
          cm_fr_lowest_nm: latest?.cm_fr_lowest_nm ?? null,
          cm_es_lowest_nm: latest?.cm_es_lowest_nm ?? null,
          cm_it_lowest_nm: latest?.cm_it_lowest_nm ?? null,
          cm_jp_lowest_nm: latest?.cm_jp_lowest_nm ?? null,
          cm_en_avg_30d: latest?.cm_en_avg_30d ?? null,
          cm_en_avg_7d: latest?.cm_en_avg_7d ?? null,
          tcp_market: latest?.tcp_market ?? null,
          tcp_mid: latest?.tcp_mid ?? null,
          tcp_low: latest?.tcp_low ?? null,
        },
      });
    }
    await tx.card.update({
      where: { id: candidate.cardId },
      data: {
        price_source_status: "chase-watch-current",
        price_source_checked_at: fetchedAt,
      },
    });
  });
}

async function markCandidateFailure(
  candidate: WatchCandidate,
  now: Date,
  error: unknown
): Promise<void> {
  const policy = getNewReleaseChaseWatchCadence({
    releaseDate: candidate.releaseDate,
    firstSeenAt: candidate.firstSeenAt,
    candidateRank: candidate.candidateRank,
    now,
  });
  const failures = candidate.consecutiveFailures + 1;
  const delay = getNewReleaseChaseFailureDelayMs(failures, policy.cadenceMs ?? 12 * 60 * 60_000);
  await db.newReleaseChasePriceWatch.update({
    where: { card_id: candidate.cardId },
    data: {
      status: error instanceof ScrapeDoBudgetError ? "paused" : "failed",
      last_attempt_at: now,
      next_attempt_at: new Date(now.getTime() + delay),
      consecutive_failures: failures,
      last_error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    },
  });
}

async function refreshCandidate(candidate: WatchCandidate, now: Date) {
  if (candidate.ambiguousSource) {
    const error = new Error("Ambiguous CardMarket product mapping; automatic update skipped.");
    await markCandidateFailure(candidate, now, error);
    return { cardId: candidate.cardId, status: "skipped", creditsUsed: 0, error: error.message };
  }
  const policy = getNewReleaseChaseWatchCadence({
    releaseDate: candidate.releaseDate,
    firstSeenAt: candidate.firstSeenAt,
    candidateRank: candidate.candidateRank,
    now,
  });
  if (!policy.active || !policy.cadenceMs) {
    return { cardId: candidate.cardId, status: "inactive", creditsUsed: 0, error: null };
  }
  // A 30-minute request bucket deduplicates concurrent scheduler claims while
  // still allowing the deliberate confirmation/backoff retry inside a longer
  // three-, six-, or twelve-hour price cadence.
  const bucket = getNewReleaseChaseCadenceBucket(now, 30 * 60_000);
  let reservationId: string | null = null;
  try {
    const reservation = await reserveScrapeDoCredits({
      operation: "cardmarket-english-nm",
      idempotencyKey: `chase:${candidate.episodeId}:${candidate.cardId}:${bucket}`,
      estimatedCredits: CARDMARKET_RENDERED_REQUEST_CREDITS,
      sourceUrl: candidate.cardmarketUrl,
      now,
    });
    reservationId = reservation.id;
    if (!reservation.created) {
      const nextAttemptAt = new Date(now.getTime() + policy.cadenceMs);
      await db.newReleaseChasePriceWatch.update({
        where: { card_id: candidate.cardId },
        data: { status: "scheduled", next_attempt_at: nextAttemptAt },
      });
      return { cardId: candidate.cardId, status: "deduped", creditsUsed: 0, error: null };
    }

    await db.newReleaseChasePriceWatch.update({
      where: { card_id: candidate.cardId },
      data: { status: "refreshing", last_attempt_at: now, provider: "scrapedo" },
    });
    const scrape = await scrapeScrapeDoPage(candidate.cardmarketUrl, {
      output: "html",
      // CardMarket consistently times out through Scrape.do's plain
      // datacenter route. The DE browser profile returns the complete static
      // offer table quickly and costs five credits per successful request.
      render: true,
      geoCode: "de",
      providerTimeoutMs: CARDMARKET_PROVIDER_TIMEOUT_MS,
      timeoutMs: CARDMARKET_TRANSPORT_TIMEOUT_MS,
    });
    const strict = parseStrictCardMarketEnglishNmPrice(scrape);
    if (!strict || !scrapeMatchesCandidate(candidate, scrape)) {
      throw new Error("CardMarket did not return a verified English Near Mint offer for this card.");
    }
    const creditsUsed =
      readMetadataNumber(scrape.creditsUsed) ?? CARDMARKET_RENDERED_REQUEST_CREDITS;
    const remainingCredits = readMetadataNumber(scrape.metadata.remainingCredits);
    await completeScrapeDoReservation(reservation.id, {
      creditsUsed,
      remainingCredits,
      details: {
        cardId: candidate.cardId,
        offerCount: strict.offerCount,
        resolvedUrl: scrape.sourceUrl,
      },
    });
    reservationId = null;

    const guard = evaluateNewReleaseChasePriceGuard({
      currentPrice: candidate.currentPrice,
      observedPrice: strict.priceEur,
      pendingPrice: candidate.pendingPrice,
      pendingConfirmations: candidate.pendingConfirmations,
    });
    if (guard.requiresConfirmation) {
      await db.newReleaseChasePriceWatch.update({
        where: { card_id: candidate.cardId },
        data: {
          status: "confirming",
          last_attempt_at: now,
          next_attempt_at: new Date(now.getTime() + 30 * 60_000),
          candidate_price: strict.priceEur,
          candidate_observed_at: now,
          candidate_confirmations: guard.confirmationCount,
          consecutive_failures: 0,
          last_error: null,
        },
      });
      return { cardId: candidate.cardId, status: "confirming", creditsUsed, error: null };
    }
    if (!guard.accept) throw new Error("CardMarket returned an invalid EN/NM price.");

    await writeAcceptedPrice(candidate, strict.priceEur, now, scrape.sourceUrl);
    await db.newReleaseChasePriceWatch.update({
      where: { card_id: candidate.cardId },
      data: {
        status: "current",
        last_attempt_at: now,
        last_success_at: now,
        next_attempt_at: new Date(now.getTime() + policy.cadenceMs),
        consecutive_failures: 0,
        provider: "scrapedo",
        last_error: null,
        candidate_price: null,
        candidate_observed_at: null,
        candidate_confirmations: 0,
      },
    });
    return { cardId: candidate.cardId, status: "updated", creditsUsed, error: null };
  } catch (error) {
    if (reservationId) await failScrapeDoReservation(reservationId, error).catch(() => {});
    await markCandidateFailure(candidate, now, error);
    return {
      cardId: candidate.cardId,
      status: "failed",
      creditsUsed: reservationId ? CARDMARKET_RENDERED_REQUEST_CREDITS : 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runJob(jobId: string): Promise<void> {
  const startedAt = new Date();
  await db.syncJob.update({
    where: { id: jobId },
    data: { status: "running", started_at: startedAt, finished_at: null, heartbeat_at: startedAt },
  });
  const heartbeat = setInterval(() => {
    void db.syncJob.update({ where: { id: jobId }, data: { heartbeat_at: new Date() } }).catch(() => {});
  }, JOB_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const candidates = await loadWatchCandidates(startedAt, true);
    const due = candidates
      .filter((candidate) => !candidate.nextAttemptAt || candidate.nextAttemptAt <= startedAt)
      .sort(
        (left, right) =>
          (left.nextAttemptAt?.getTime() ?? 0) - (right.nextAttemptAt?.getTime() ?? 0) ||
          left.candidateRank - right.candidateRank
      )
      .slice(0, NEW_RELEASE_CHASE_WATCH_MAX_PER_RUN);
    const results = await Promise.all(due.map((candidate) => refreshCandidate(candidate, startedAt)));
    const finishedAt = new Date();
    const problemResults = results.filter((result) =>
      ["failed", "skipped"].includes(result.status)
    );
    const failed = problemResults.length;
    const status = failed === results.length && results.length ? "failed" : failed ? "partial" : "success";
    const details = {
      version: 1,
      kind: JOB_TYPE,
      provider: "scrapedo",
      trackedCards: candidates.length,
      dueCards: due.length,
      checkedCards: results.length,
      creditsUsed: results.reduce((sum, result) => sum + result.creditsUsed, 0),
      error: problemResults[0]?.error ?? null,
      results,
    };
    await Promise.all([
      db.syncJob.update({
        where: { id: jobId },
        data: {
          status,
          details_json: JSON.stringify(details),
          heartbeat_at: finishedAt,
          finished_at: finishedAt,
        },
      }),
      db.syncLog.create({
        data: {
          type: JOB_TYPE,
          status,
          message: `Checked ${results.length} launch chase price${results.length === 1 ? "" : "s"}.`,
          details_json: JSON.stringify(details),
          started_at: startedAt,
          finished_at: finishedAt,
        },
      }),
    ]);
  } finally {
    clearInterval(heartbeat);
  }
}

function launchJob(jobId: string): void {
  if (activeJob) return;
  activeJob = runJob(jobId)
    .catch(async (error: unknown) => {
      const now = new Date();
      await db.syncJob
        .update({
          where: { id: jobId },
          data: {
            status: "failed",
            details_json: JSON.stringify({
              version: 1,
              kind: JOB_TYPE,
              error: error instanceof Error ? error.message : String(error),
            }),
            heartbeat_at: now,
            finished_at: now,
          },
        })
        .catch(() => {});
    })
    .finally(() => {
      activeJob = null;
    });
}

function freshRunning(job: { status: string; heartbeat_at: Date | null } | null, now: Date) {
  return Boolean(
    job &&
      ["queued", "running"].includes(job.status) &&
      job.heartbeat_at &&
      job.heartbeat_at > new Date(now.getTime() - JOB_STALE_MS)
  );
}

function readError(detailsJson: string | null | undefined): string | null {
  if (!detailsJson) return null;
  try {
    const parsed = JSON.parse(detailsJson) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

async function buildSnapshot(now: Date, persistState: boolean, started = false): Promise<NewReleaseChasePriceJobSnapshot> {
  const [job, candidates, budget] = await Promise.all([
    db.syncJob.findUnique({ where: { type: JOB_TYPE } }),
    loadWatchCandidates(now, persistState),
    getNewReleaseChaseScrapeDoBudgetSnapshot(now),
  ]);
  const dueCards = candidates.filter(
    (candidate) => !candidate.nextAttemptAt || candidate.nextAttemptAt <= now
  ).length;
  return {
    started,
    running: Boolean(activeJob || freshRunning(job, now)),
    status: job?.status ?? null,
    trackedCards: candidates.length,
    dueCards,
    nextAttemptAt: minDate(candidates.map((candidate) => candidate.nextAttemptAt))?.toISOString() ?? null,
    lastSuccessAt: maxDate(candidates.map((candidate) => candidate.lastSuccessAt))?.toISOString() ?? null,
    provider: "scrapedo",
    budgetPaused: budget.paused || !budget.configured,
    dailyCreditsUsed: budget.dailyUsed,
    dailyCreditLimit: budget.dailyLimit,
    monthlyCreditsUsed: budget.monthlyUsed,
    monthlyCreditLimit: budget.monthlyLimit,
    error: job?.status === "failed" ? readError(job.details_json) : null,
  };
}

export async function getNewReleaseChasePriceJobSnapshot(
  now = new Date()
): Promise<NewReleaseChasePriceJobSnapshot> {
  return buildSnapshot(now, false);
}

export async function maybeStartNewReleaseChasePriceJob(options?: {
  skip?: boolean;
  now?: Date;
}): Promise<NewReleaseChasePriceJobSnapshot> {
  const now = options?.now ?? new Date();
  const snapshot = await buildSnapshot(now, true);
  if (options?.skip || snapshot.running || snapshot.dueCards === 0 || snapshot.budgetPaused) {
    return snapshot;
  }
  const existing = await db.syncJob.findUnique({ where: { type: JOB_TYPE } });
  let job;
  if (!existing) {
    try {
      job = await db.syncJob.create({
        data: { type: JOB_TYPE, status: "queued", started_at: now, heartbeat_at: now },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        String((error as { code?: unknown }).code) === "P2002"
      ) {
        return buildSnapshot(now, false);
      }
      throw error;
    }
  } else {
    const claimed = await db.syncJob.updateMany({
      where: {
        id: existing.id,
        OR: [
          { status: { notIn: ["queued", "running"] } },
          { heartbeat_at: null },
          { heartbeat_at: { lte: new Date(now.getTime() - JOB_STALE_MS) } },
        ],
      },
      data: { status: "queued", started_at: now, finished_at: null, heartbeat_at: now },
    });
    if (claimed.count !== 1) return buildSnapshot(now, false);
    job = await db.syncJob.findUniqueOrThrow({ where: { id: existing.id } });
  }
  launchJob(job.id);
  return { ...snapshot, started: true, running: true, status: "queued" };
}
