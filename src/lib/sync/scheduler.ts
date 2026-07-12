import "server-only";

import { db } from "@/lib/db";
import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import {
  getAutoPriceRefreshSnapshot,
  reconcilePriceSourceCheckedAtFromSnapshots,
} from "@/lib/sync";
import {
  getAutoPriceRefreshJobSnapshot,
  startAutoPriceRefreshJob,
} from "@/lib/sync/auto-price-refresh-job";
import { maybeStartCardHistoryQuotaDrainJob } from "@/lib/sync/card-history-auto-drain";
import { maybeStartExternalSignalRadarJob } from "@/lib/sync/external-signal-radar-job";
import { getTcggoUsageSnapshot } from "@/lib/tcggo-usage";

const SYNC_SCHEDULER_JOB_TYPE = "sync-scheduler";

export interface SyncSchedulerTickResult {
  ok: true;
  checkedAt: string;
  scraperDisabled: boolean;
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
  quota: {
    requestsRemaining: number | null;
    requestsLimit: number | null;
    quotaResetsAt: string | null;
    hasLiveWindow: boolean;
  };
  maintenance: {
    normalizedPriceCheckedAtCards: number;
  };
}

async function recordSchedulerTick(result: SyncSchedulerTickResult): Promise<void> {
  const now = new Date(result.checkedAt);
  const hasRunningWork =
    result.priceRefresh.running || result.historyDrain.running || result.externalRadar.running;
  const status = result.scraperDisabled ? "paused" : hasRunningWork ? "running" : "success";

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

export async function runSyncSchedulerTick(): Promise<SyncSchedulerTickResult> {
  const checkedAt = new Date();
  const scraperDisabled = areScraperRequestsDisabled();
  const normalizedPriceCheckedAtCards = await reconcilePriceSourceCheckedAtFromSnapshots();
  const [priceSnapshot, existingPriceJob, quota] = await Promise.all([
    getAutoPriceRefreshSnapshot(),
    getAutoPriceRefreshJobSnapshot(),
    getTcggoUsageSnapshot(),
  ]);
  const pricePendingCards =
    priceSnapshot.dueCards + priceSnapshot.missingPriceCards + priceSnapshot.submittedCardCandidates;
  const priceRefresh =
    !scraperDisabled && pricePendingCards > 0
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
  const shouldLetPriceJobFinishFirst = priceRefresh.running && pricePendingCards > 0;
  const historyDrain =
    !scraperDisabled && !shouldLetPriceJobFinishFirst
      ? {
          ...(await maybeStartCardHistoryQuotaDrainJob()),
          skippedReason: null,
        }
      : {
          started: false,
          running: false,
          pendingCards: 0,
          startedAt: null,
          skippedReason: scraperDisabled
            ? "scraper-disabled"
            : "waiting-for-price-refresh",
        };
  const externalRadar = await maybeStartExternalSignalRadarJob({
    skip: scraperDisabled,
    now: checkedAt,
  });

  const result: SyncSchedulerTickResult = {
    ok: true,
    checkedAt: checkedAt.toISOString(),
    scraperDisabled,
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
    quota: {
      requestsRemaining: quota.requestsRemaining,
      requestsLimit: quota.requestsLimit,
      quotaResetsAt: quota.quotaResetsAt?.toISOString() ?? null,
      hasLiveWindow: quota.hasLiveWindow,
    },
    maintenance: {
      normalizedPriceCheckedAtCards,
    },
  };

  await recordSchedulerTick(result);
  return result;
}
