import "server-only";
import { runAdviceLearningBatch } from "@/lib/advice-learning-store";

import {
  sweepCardPriceAlerts,
  type CardPriceAlertSweepResult,
} from "@/lib/card-price-alerts";
import { sweepCollectionPriceAlerts } from "@/lib/collection-price-alerts";
import { db } from "@/lib/db";
import { isMailConfigured } from "@/lib/mail";
import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import {
  getAutoPriceRefreshSnapshot,
  reconcilePriceSourceCheckedAtFromSnapshots,
} from "@/lib/sync";
import {
  getAutoPriceRefreshJobSnapshot,
  startAutoPriceRefreshJob,
} from "@/lib/sync/auto-price-refresh-job";
import {
  isCardHistoryQuotaDrainWindow,
  maybeStartCardHistoryQuotaDrainJob,
} from "@/lib/sync/card-history-auto-drain";
import {
  getCardMarketBasePriceJobSnapshot,
  maybeStartCardMarketBasePriceJob,
  type CardMarketBasePriceJobSnapshot,
} from "@/lib/sync/cardmarket-base-price-job";
import {
  getExternalSignalRadarJobSnapshot,
  maybeStartExternalSignalRadarJob,
} from "@/lib/sync/external-signal-radar-job";
import {
  captureOpenExternalSignalOutcomePrices,
  evaluatePendingExternalSignalOutcomes,
  rescoreExternalSignalOutcomeVerdicts,
} from "@/lib/external-signal-forecast-store";
import {
  maybeStartNewReleaseChasePriceJob,
  type NewReleaseChasePriceJobSnapshot,
} from "@/lib/sync/new-release-chase-price-job";
import {
  maybeStartSealedSyncJob,
  maybeSyncJustReleasedSealed,
  type JustReleasedSealedSnapshot,
  type SealedSyncJobSnapshot,
} from "@/lib/sync/sealed-sync-job";
import {
  getSealedCardMarketBasePriceJobSnapshot,
  maybeStartSealedCardMarketBasePriceJob,
  type SealedCardMarketBasePriceJobSnapshot,
} from "@/lib/sync/sealed-cardmarket-base-price-job";
import {
  getSetLifecycleObservationBucket,
  maybeRunSetLifecycleJob,
  type SetLifecycleJobSnapshot,
} from "@/lib/sync/set-lifecycle-job";
import { getTcggoUsageSnapshot } from "@/lib/tcggo-usage";
import { checkTcggoHealth } from "@/lib/tcggo";
import {
  getTcggoMonthlyHealthPeriod,
  maybeRunMonthlyTcggoHealthcheck,
  type TcggoMonthlyHealthcheckResult,
} from "@/lib/tcggo-health";
import { maybeRunMarketScoreJob } from "@/lib/sync/market-score-job";
import {
  getCardReprintJobSnapshot,
  type CardReprintJobSnapshot,
} from "@/lib/sync/card-reprint-job";
import { maybeRunUpcomingGallerySourceJob } from "@/lib/sync/upcoming-gallery-source-job";
import { reconcileUpcomingPriceSourceStatuses } from "@/lib/sync/upcoming-price-source-status";
import {
  getBackgroundLoadSnapshot,
  MAX_BACKGROUND_LOAD_PER_CPU,
  type BackgroundLoadSnapshot,
} from "@/lib/background-load-guard";

const SYNC_SCHEDULER_JOB_TYPE = "sync-scheduler";
// 02:00-05:59 UTC = 04:00-07:59 NL summer time: the app's quietest hours.
const QUIET_TICK_UTC_HOURS = new Set([2, 3, 4, 5]);

export interface SyncSchedulerTickResult {
  ok: true;
  deferred?: false;
  checkedAt: string;
  scraperDisabled: boolean;
  backgroundLoad: BackgroundLoadSnapshot;
  priceRefresh: {
    started: boolean;
    running: boolean;
    pendingCards: number;
    dueCards: number;
    missingPriceCards: number;
    submittedCardCandidates: number;
    nextBatchCards: number;
    nextBatchEpisodes: number;
    status: string | null;
  };
  historyDrain: {
    started: boolean;
    running: boolean;
    pendingCards: number;
    startedAt: string | null;
    skippedReason: string | null;
  };
  externalRadar: {
    started: boolean;
    running: boolean;
    status: string | null;
    competitiveDue: boolean;
    catalystDue: boolean;
    lastCompetitiveAt: string | null;
    lastCatalystAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
  chaseWatch: NewReleaseChasePriceJobSnapshot;
  cardmarketBasePrices: CardMarketBasePriceJobSnapshot;
  sealedCardmarketBasePrices: SealedCardMarketBasePriceJobSnapshot;
  priceAlerts: CardPriceAlertSweepResult;
  setLifecycle: SetLifecycleJobSnapshot;
  sealedSync: SealedSyncJobSnapshot;
  sealedReleaseCheck: JustReleasedSealedSnapshot;
  quota: {
    requestsRemaining: number | null;
    requestsLimit: number | null;
    quotaResetsAt: string | null;
    hasLiveWindow: boolean;
  };
  maintenance: {
    tcggoHealth: TcggoMonthlyHealthcheckResult;
    reprints: CardReprintJobSnapshot;
    normalizedPriceCheckedAtCards: number;
    signalOutcomePrices: {
      trackedCards: number;
      captured: number;
      unavailable: number;
      observedDay: string;
    };
    signalOutcomes: {
      matured: number;
      evaluated: number;
      complete: number;
      insufficient: number;
      truncated: boolean;
    };
    signalVerdictRescore: {
      checked: number;
      updated: number;
      skipped?: boolean;
    };
    signalOutcomeError: string | null;
  };
}

export interface DeferredSyncSchedulerTickResult {
  ok: true;
  deferred: true;
  deferredReason: "active-users" | "system-load";
  checkedAt: string;
  scraperDisabled: boolean;
  backgroundLoad: BackgroundLoadSnapshot;
}

export type SyncSchedulerResult =
  | SyncSchedulerTickResult
  | DeferredSyncSchedulerTickResult;

async function recordSchedulerTick(result: SyncSchedulerResult): Promise<void> {
  const now = new Date(result.checkedAt);
  const hasRunningWork =
    "priceRefresh" in result &&
    (result.priceRefresh.running ||
      result.historyDrain.running ||
      result.externalRadar.running ||
      result.chaseWatch.running ||
      result.cardmarketBasePrices.running ||
      result.sealedCardmarketBasePrices.running ||
      result.setLifecycle.running ||
      result.sealedSync.running ||
      result.maintenance.reprints.running);
  const status =
    result.scraperDisabled || result.deferred === true
      ? "paused"
      : hasRunningWork
        ? "running"
        : "success";

  await db.syncJob.upsert({
    where: { type: SYNC_SCHEDULER_JOB_TYPE },
    create: {
      type: SYNC_SCHEDULER_JOB_TYPE,
      status,
      details_json: JSON.stringify(result),
      started_at: now,
      finished_at: hasRunningWork ? null : now,
      heartbeat_at: now,
    },
    update: {
      status,
      details_json: JSON.stringify(result),
      started_at: now,
      finished_at: hasRunningWork ? null : now,
      heartbeat_at: now,
    },
  });
}

export async function runSyncSchedulerTick(): Promise<SyncSchedulerResult> {
  const checkedAt = new Date();
  const scraperDisabled = areScraperRequestsDisabled();
  const backgroundLoad = await getBackgroundLoadSnapshot(checkedAt).catch(() => ({
    activeUsers: 0,
    logicalCpus: 1,
    load1m: 0,
    loadPerCpu: 0,
    deferred: false,
  }));
  // Per-card Upcoming metadata is more precise than an expansion-level date.
  // This small lifecycle repair also runs on deferred ticks, so a release is
  // never held back merely because visitors are active.
  await reconcileUpcomingPriceSourceStatuses(checkedAt);
  // better-sqlite3 is synchronous. Running the full maintenance tick in this
  // Next.js process can block every page on the same event loop for seconds.
  // Defer the whole tick while someone is actively browsing (or the host is
  // already busy); the five-minute timer catches up as soon as the app is idle.
  //
  // Starvation guard: a collector who browses all day can defer every tick,
  // which froze the Signal Radar for days. During the quiet night window an
  // active user no longer defers the tick as long as actual system load is
  // fine, so time-based jobs are guaranteed at least one daily run.
  const quietWindowOverride =
    backgroundLoad.deferred &&
    backgroundLoad.activeUsers > 0 &&
    backgroundLoad.loadPerCpu < MAX_BACKGROUND_LOAD_PER_CPU &&
    QUIET_TICK_UTC_HOURS.has(checkedAt.getUTCHours());
  if (backgroundLoad.deferred && !quietWindowOverride) {
    const result: DeferredSyncSchedulerTickResult = {
      ok: true,
      deferred: true,
      deferredReason: backgroundLoad.activeUsers > 0 ? "active-users" : "system-load",
      checkedAt: checkedAt.toISOString(),
      scraperDisabled,
      backgroundLoad,
    };
    await recordSchedulerTick(result);
    return result;
  }
  // Past the guard the tick runs in full; during a quiet-window override the
  // sub-jobs must not re-apply the stale deferred flag.
  const effectiveDeferred = backgroundLoad.deferred && !quietWindowOverride;
  // Fire-and-forget: persist DustyCards market scores in small batches so
  // search can rank on real market interest.
  maybeRunMarketScoreJob(checkedAt, { defer: effectiveDeferred });
  // Complete release galleries use a zero-credit direct fetch first, then
  // Scrape.do, and finally their last successful stored snapshot. The job is
  // fire-and-forget so a slow publisher never delays the main scheduler tick.
  maybeRunUpcomingGallerySourceJob({
    now: checkedAt,
    skip: scraperDisabled || effectiveDeferred,
  });
  // Reprint image comparison runs in its own quiet-window system service.
  // Starting synchronous image/database work inside the web process made a
  // visitor arriving mid-batch wait for the batch to finish.
  const reprints = getCardReprintJobSnapshot();
  // Launch-market chase prices get first access to the scheduler. Their
  // direct CardMarket quote is more current than TCGGo's daily snapshot and
  // must land before a normal batch can select the same cards.
  const chaseWatch = await maybeStartNewReleaseChasePriceJob({
    skip: scraperDisabled,
    now: checkedAt,
  });
  const normalizedPriceCheckedAtCards = await reconcilePriceSourceCheckedAtFromSnapshots();
  // Forecast maintenance only reads already stored marketplace data. It must
  // continue while external scrapers are paused or a Radar refresh fails.
  let signalOutcomeError: string | null = null;
  const signalOutcomePrices = await captureOpenExternalSignalOutcomePrices(checkedAt).catch(
    (error: unknown) => {
      signalOutcomeError = error instanceof Error ? error.message : String(error);
      return {
        trackedCards: 0,
        captured: 0,
        unavailable: 0,
        observedDay: checkedAt.toISOString().slice(0, 10),
      };
    }
  );
  const signalOutcomes = await evaluatePendingExternalSignalOutcomes(checkedAt).catch(
    (error: unknown) => {
      signalOutcomeError = [
        signalOutcomeError,
        error instanceof Error ? error.message : String(error),
      ].filter(Boolean).join(" | ");
      return {
        matured: 0,
        evaluated: 0,
        complete: 0,
        insufficient: 0,
        truncated: false,
      };
    }
  );
  await runAdviceLearningBatch(checkedAt).catch((error: unknown) => {
    console.error("[advice-learning] Scheduler batch failed", error instanceof Error ? error.message : "unknown error");
  });
  // Finished verdicts are reconciled with the current meaningful-move rule
  // once per process, so cohort accuracy never mixes two scoring rules.
  const signalVerdictRescore = await rescoreExternalSignalOutcomeVerdicts().catch(
    (error: unknown) => {
      signalOutcomeError = [
        signalOutcomeError,
        error instanceof Error ? error.message : String(error),
      ].filter(Boolean).join(" | ");
      return { checked: 0, updated: 0 };
    }
  );
  // Evaluate only prices that are already committed. New background refresh
  // writes are intentionally picked up on the next scheduler tick.
  const failedAlertSweep = (error: unknown): CardPriceAlertSweepResult => ({
    configured: isMailConfigured(),
    checked: 0,
    triggered: 0,
    emailsSent: 0,
    alertsSent: 0,
    errors: [error instanceof Error ? error.message : String(error)],
  });
  const [cardAlerts, collectionAlerts] = await Promise.all([
    sweepCardPriceAlerts().catch(failedAlertSweep),
    sweepCollectionPriceAlerts().catch(failedAlertSweep),
  ]);
  const priceAlerts: CardPriceAlertSweepResult = {
    configured: cardAlerts.configured || collectionAlerts.configured,
    checked: cardAlerts.checked + collectionAlerts.checked,
    triggered: cardAlerts.triggered + collectionAlerts.triggered,
    emailsSent: cardAlerts.emailsSent + collectionAlerts.emailsSent,
    alertsSent: cardAlerts.alertsSent + collectionAlerts.alertsSent,
    errors: [...cardAlerts.errors, ...collectionAlerts.errors],
  };
  const [priceSnapshot, existingPriceJob, quota] = await Promise.all([
    getAutoPriceRefreshSnapshot(),
    getAutoPriceRefreshJobSnapshot(),
    getTcggoUsageSnapshot(),
  ]);
  const pricePendingCards =
    priceSnapshot.dueCards + priceSnapshot.missingPriceCards + priceSnapshot.submittedCardCandidates;
  const shouldLetChaseWatchFinishFirst = chaseWatch.running && chaseWatch.dueCards > 0;
  const priceRefresh =
    !scraperDisabled && !shouldLetChaseWatchFinishFirst && pricePendingCards > 0
      ? await startAutoPriceRefreshJob()
      : {
          started: false,
          running: existingPriceJob.running,
          pendingCards: pricePendingCards,
          dueCards: priceSnapshot.dueCards,
          missingPriceCards: priceSnapshot.missingPriceCards,
          submittedCardCandidates: priceSnapshot.submittedCardCandidates,
          nextBatchCards: priceSnapshot.nextBatchCards,
          nextBatchEpisodes: priceSnapshot.nextBatchEpisodes,
          status: existingPriceJob.status,
          startedAt: existingPriceJob.startedAt,
          finishedAt: existingPriceJob.finishedAt,
        };
  const currentCardPriceWorkPending = pricePendingCards > 0 || priceRefresh.running;
  // Slowly fill genuine CardMarket English/NM gaps, including cards that
  // already have a TCGPlayer snapshot. The job processes only one card every
  // two hours and keeps a provider-credit reserve, so history/current-price
  // work cannot accidentally drain the Firecrawl pool.
  // These three lanes share one Firecrawl provider balance. Inspect them
  // together and allow at most one to run at a time, including across ticks.
  // Without this gate, simultaneous pre-request reserve checks could all pass
  // and together cross the provider safety reserve.
  const [cardmarketBaseState, sealedCardmarketBaseState, externalRadarState] =
    await Promise.all([
      getCardMarketBasePriceJobSnapshot(checkedAt),
      getSealedCardMarketBasePriceJobSnapshot(checkedAt),
      getExternalSignalRadarJobSnapshot(checkedAt),
    ]);
  const existingFirecrawlLane = cardmarketBaseState.running
    ? "cards"
    : sealedCardmarketBaseState.running
      ? "sealed"
      : externalRadarState.running
        ? "radar"
        : null;
  const commonFirecrawlSkip = scraperDisabled || shouldLetChaseWatchFinishFirst;

  const cardmarketBasePrices = await maybeStartCardMarketBasePriceJob({
    skip: commonFirecrawlSkip || (existingFirecrawlLane != null && existingFirecrawlLane !== "cards"),
    now: checkedAt,
  });
  // Sealed catalogue sync can legitimately return averages without a current
  // offer. This independent, one-product lane checks only exact CardMarket
  // product identities and never turns an average into a live asking price.
  const sealedCardmarketBasePrices = await maybeStartSealedCardMarketBasePriceJob({
    skip:
      commonFirecrawlSkip ||
      cardmarketBasePrices.running ||
      (existingFirecrawlLane != null && existingFirecrawlLane !== "sealed"),
    now: checkedAt,
  });
  const externalRadar = await maybeStartExternalSignalRadarJob({
    skip:
      commonFirecrawlSkip ||
      effectiveDeferred ||
      cardmarketBasePrices.running ||
      sealedCardmarketBasePrices.running ||
      (existingFirecrawlLane != null && existingFirecrawlLane !== "radar"),
    now: checkedAt,
  });
  // Sealed prices refresh on their own daily cadence; card price work keeps
  // priority so a sealed pass never delays due card refreshes.
  const sealedSkipReason = scraperDisabled
    ? "scraper-disabled"
    : currentCardPriceWorkPending
      ? "waiting-for-price-refresh"
      : shouldLetChaseWatchFinishFirst
        ? "waiting-for-chase-watch"
        : undefined;
  const sealedSync = await maybeStartSealedSyncJob({
    skip: sealedSkipReason != null,
    skipReason: sealedSkipReason,
    requestsRemaining: quota.requestsRemaining,
    hasLiveWindow: quota.hasLiveWindow,
    // Once the final history window is open, current sealed prices may use
    // the daytime reserve. History remains blocked until that current work is
    // actually complete, then receives whatever quota is still left.
    allowReservedRequests: isCardHistoryQuotaDrainWindow(quota, checkedAt),
    now: checkedAt,
  });
  // A set that was just released gets its sealed products fetched as soon as
  // the marketplace lists them, without waiting for the daily full pass.
  const sealedReleaseCheck = await maybeSyncJustReleasedSealed({
    skip: scraperDisabled || sealedSync.running,
    skipReason: scraperDisabled ? "scraper-disabled" : "sealed-sync-running",
    requestsRemaining: quota.requestsRemaining,
    now: checkedAt,
  }).catch((error: unknown) => {
    console.error(
      "[sealed-sync-job] just-released sealed check failed:",
      error instanceof Error ? error.message : String(error)
    );
    return { checked: 0, skippedReason: "error" };
  });
  const currentSealedWorkPending = sealedSync.due || sealedSync.running;
  // History is strictly last: it only gets the final quota-window leftovers
  // after card prices, first prices, chase prices and sealed prices are all
  // current. The drain itself enforces the final two-hour window.
  const historyBlockedReason = scraperDisabled
    ? "scraper-disabled"
    : currentCardPriceWorkPending
      ? "waiting-for-price-refresh"
      : shouldLetChaseWatchFinishFirst
        ? "waiting-for-chase-watch"
        : currentSealedWorkPending
          ? "waiting-for-sealed-sync"
          : null;
  const historyDrain =
    historyBlockedReason == null
      ? {
          ...(await maybeStartCardHistoryQuotaDrainJob()),
          skippedReason: null,
        }
      : {
          started: false,
          running: false,
          pendingCards: 0,
          startedAt: null,
          skippedReason: historyBlockedReason,
        };
  // This pass only summarizes data already stored locally. It deliberately
  // keeps running when scrapers are paused and may never take the whole
  // scheduler down if a malformed historical row slips through.
  const setLifecycle = await maybeRunSetLifecycleJob({ now: checkedAt }).catch(
    (error: unknown): SetLifecycleJobSnapshot => ({
      started: false,
      running: false,
      due: true,
      status: "failed",
      observationBucket: getSetLifecycleObservationBucket(checkedAt).toISOString(),
      setsEvaluated: 0,
      observationsWritten: 0,
      lastFinishedAt: null,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  const tcggoHealth: TcggoMonthlyHealthcheckResult = scraperDisabled
    ? {
        due: getTcggoMonthlyHealthPeriod(checkedAt) != null,
        ran: false,
        skippedReason: "scraper-disabled",
        observation: null,
      }
    : await maybeRunMonthlyTcggoHealthcheck({
        now: checkedAt,
        quota,
        run: checkTcggoHealth,
      });

  const result: SyncSchedulerTickResult = {
    ok: true,
    deferred: false,
    checkedAt: checkedAt.toISOString(),
    scraperDisabled,
    backgroundLoad,
    priceRefresh: {
      started: priceRefresh.started,
      running: priceRefresh.running,
      pendingCards: priceRefresh.pendingCards,
      dueCards: priceRefresh.dueCards,
      missingPriceCards: priceRefresh.missingPriceCards,
      submittedCardCandidates: priceRefresh.submittedCardCandidates,
      nextBatchCards: priceRefresh.nextBatchCards,
      nextBatchEpisodes: priceRefresh.nextBatchEpisodes,
      status: priceRefresh.status,
    },
    historyDrain,
    externalRadar,
    chaseWatch,
    cardmarketBasePrices,
    sealedCardmarketBasePrices,
    priceAlerts,
    setLifecycle,
    sealedSync,
    sealedReleaseCheck,
    quota: {
      requestsRemaining: quota.requestsRemaining,
      requestsLimit: quota.requestsLimit,
      quotaResetsAt: quota.quotaResetsAt?.toISOString() ?? null,
      hasLiveWindow: quota.hasLiveWindow,
    },
    maintenance: {
      tcggoHealth,
      reprints,
      normalizedPriceCheckedAtCards,
      signalOutcomePrices,
      signalOutcomes,
      signalVerdictRescore,
      signalOutcomeError,
    },
  };

  await recordSchedulerTick(result);
  return result;
}
