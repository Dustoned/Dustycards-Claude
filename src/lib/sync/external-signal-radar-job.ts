import "server-only";

import { db } from "@/lib/db";
import {
  EXTERNAL_CATALYST_QUERY_VERSION,
  runExternalCatalystDiscovery,
} from "@/lib/external-radar-catalyst-discovery";
import {
  loadExternalEventCandidates,
  loadExternalEventWatchTopics,
  mergeExternalEventCandidates,
} from "@/lib/external-event-candidates";
import { refreshExternalSignalRadarData } from "@/lib/external-signal-radar";
import { enrichExternalSignalRadarData } from "@/lib/external-signal-intelligence";
import { ALL_GAMES } from "@/lib/games";
import {
  EXTERNAL_CATALYST_REFRESH_INTERVAL_MS,
  EXTERNAL_COMPETITIVE_REFRESH_INTERVAL_MS,
  EXTERNAL_SIGNAL_MODEL_VERSION,
  isExternalRefreshDue,
  persistExternalCompetitiveScan,
} from "@/lib/sync/external-signal-persistence";
import { evaluatePendingExternalSignalOutcomes } from "@/lib/external-signal-forecast-store";
import { sendHighPotentialSignalAlerts } from "@/lib/signal-radar-email-alerts";
import {
  refreshSignalRadarEbayDemand,
  type SignalRadarEbayDemandRefreshResult,
} from "@/lib/sync/signal-radar-ebay-demand";

const EXTERNAL_SIGNAL_JOB_TYPE = "external-signal-radar";
const EXTERNAL_SIGNAL_CATALYST_RUN_KIND = "catalyst";
const EXTERNAL_SIGNAL_JOB_STALE_MS = 20 * 60_000;
const EXTERNAL_SIGNAL_HEARTBEAT_MS = 60_000;

let activeJob: Promise<void> | null = null;

export interface ExternalSignalRadarJobSnapshot {
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
}

function isFreshRunningJob(
  job: { status: string; heartbeat_at: Date | null } | null,
  now: Date
): boolean {
  return Boolean(
    (job?.status === "running" || job?.status === "queued") &&
      job.heartbeat_at &&
      job.heartbeat_at > new Date(now.getTime() - EXTERNAL_SIGNAL_JOB_STALE_MS)
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "P2002"
  );
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

function readCatalystQueryVersion(detailsJson: string | null | undefined): number {
  if (!detailsJson) return 0;
  try {
    const parsed = JSON.parse(detailsJson) as { queryVersion?: unknown };
    const version = Number(parsed.queryVersion);
    return Number.isFinite(version) ? version : 0;
  } catch {
    return 0;
  }
}

export function isCurrentExternalSignalModel(
  modelVersion: string | null | undefined
): boolean {
  return modelVersion === EXTERNAL_SIGNAL_MODEL_VERSION;
}

async function getRunState(now: Date) {
  const [job, lastCompetitive, lastCatalyst] = await Promise.all([
    db.syncJob.findUnique({ where: { type: EXTERNAL_SIGNAL_JOB_TYPE } }),
    db.externalSignalRun.findFirst({
      where: { kind: "competitive", status: "success" },
      orderBy: { finished_at: "desc" },
      select: {
        finished_at: true,
        observations: {
          orderBy: { id: "asc" },
          take: 1,
          select: { model_version: true },
        },
      },
    }),
    db.externalSignalRun.findFirst({
      where: { kind: EXTERNAL_SIGNAL_CATALYST_RUN_KIND, status: { in: ["success", "partial"] } },
      orderBy: { finished_at: "desc" },
      select: { finished_at: true, details_json: true },
    }),
  ]);
  const lastCompetitiveAt = lastCompetitive?.finished_at ?? null;
  const lastCompetitiveModel = lastCompetitive?.observations[0]?.model_version ?? null;
  const lastCatalystAt =
    readCatalystQueryVersion(lastCatalyst?.details_json) >= EXTERNAL_CATALYST_QUERY_VERSION
      ? lastCatalyst?.finished_at ?? null
      : null;
  return {
    job,
    lastCompetitiveAt,
    lastCatalystAt,
    competitiveDue:
      !isCurrentExternalSignalModel(lastCompetitiveModel) ||
      isExternalRefreshDue(
        lastCompetitiveAt,
        EXTERNAL_COMPETITIVE_REFRESH_INTERVAL_MS,
        now
      ),
    catalystDue: isExternalRefreshDue(
      lastCatalystAt,
      EXTERNAL_CATALYST_REFRESH_INTERVAL_MS,
      now
    ),
  };
}

async function recordCatalystRun(input: {
  requestedAt: Date;
  finishedAt: Date;
  result: Awaited<ReturnType<typeof runExternalCatalystDiscovery>>;
}): Promise<void> {
  await db.externalSignalRun.create({
    data: {
      kind: EXTERNAL_SIGNAL_CATALYST_RUN_KIND,
      status: input.result.status,
      requested_at: input.requestedAt,
      generated_at: input.finishedAt,
      finished_at: input.finishedAt,
      source_count: input.result.sourcesScraped,
      item_count: input.result.catalystsPersisted,
      credits_used: input.result.creditsUsed,
      details_json: JSON.stringify(input.result),
      error: input.result.errors.length
        ? input.result.errors.map((error) => error.message).join(" | ").slice(0, 2_000)
        : null,
    },
  });
}

async function runPersistedExternalSignalJob(jobId: string): Promise<void> {
  const requestedAt = new Date();
  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      started_at: requestedAt,
      finished_at: null,
      heartbeat_at: requestedAt,
    },
  });

  const heartbeat = setInterval(() => {
    void db.syncJob
      .update({ where: { id: jobId }, data: { heartbeat_at: new Date() } })
      .catch(() => {});
  }, EXTERNAL_SIGNAL_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const state = await getRunState(requestedAt);
    const baseRadarData = await refreshExternalSignalRadarData(ALL_GAMES);
    const eventUniverse = state.catalystDue
      ? await loadExternalEventCandidates(baseRadarData.sources.map((source) => source.game))
      : [];
    const watchTopics = state.catalystDue
      ? await loadExternalEventWatchTopics(
          baseRadarData.sources.map((source) => source.game),
          requestedAt
        )
      : [];
    const catalyst = await runExternalCatalystDiscovery({
      candidates: mergeExternalEventCandidates(baseRadarData.signals, eventUniverse),
      watchTopics,
      lastRunAt: state.lastCatalystAt,
      now: requestedAt,
    });
    if (catalyst.due) {
      await recordCatalystRun({ requestedAt, finishedAt: new Date(), result: catalyst });
    }
    // Discovery runs first so a newly found leak/reveal can participate in the
    // same persisted radar snapshot and alert pass instead of waiting a day.
    let ebayDemand: SignalRadarEbayDemandRefreshResult | null = null;
    let ebayDemandError: string | null = null;
    const radarData = await enrichExternalSignalRadarData(baseRadarData, requestedAt, {
      beforeMarketEnrichment: async (signals) => {
        try {
          ebayDemand = await refreshSignalRadarEbayDemand(signals, requestedAt);
        } catch (error) {
          ebayDemandError = error instanceof Error ? error.message : String(error);
        }
      },
    });
    const competitive = await persistExternalCompetitiveScan(radarData, requestedAt);
    const outcomes = await evaluatePendingExternalSignalOutcomes(new Date());
    const emailAlerts = await sendHighPotentialSignalAlerts(radarData, requestedAt).catch(
      (error: unknown) => ({
        configured: true,
        subscribers: 0,
        candidates: 0,
        emailsSent: 0,
        cardsSent: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      })
    );

    const finishedAt = new Date();
    await db.syncJob.update({
      where: { id: jobId },
      data: {
        status:
          catalyst.status === "partial" ||
          ebayDemandError != null ||
          Boolean(
            (ebayDemand as SignalRadarEbayDemandRefreshResult | null)?.stoppedForQuota
          )
            ? "partial"
            : "success",
        details_json: JSON.stringify({
          version: 2,
          kind: EXTERNAL_SIGNAL_JOB_TYPE,
          competitive,
          outcomes,
          emailAlerts,
          ebayDemand: ebayDemand ?? {
            configured: false,
            error: ebayDemandError,
          },
          catalyst: {
            status: catalyst.status,
            due: catalyst.due,
            searchProvider: catalyst.searchProvider,
            tavilyCreditsUsed: catalyst.tavilyCreditsUsed,
            scrapedoCreditsUsed: catalyst.scrapedoCreditsUsed,
            creditsUsed: catalyst.creditsUsed,
            sourcesScraped: catalyst.sourcesScraped,
            catalystsPersisted: catalyst.catalystsPersisted,
            errors: catalyst.errors,
          },
        }),
        heartbeat_at: finishedAt,
        finished_at: finishedAt,
      },
    });
  } finally {
    clearInterval(heartbeat);
  }
}

function launchJob(jobId: string): void {
  if (activeJob) return;
  activeJob = runPersistedExternalSignalJob(jobId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      await db.syncJob
        .update({
          where: { id: jobId },
          data: {
            status: "failed",
            details_json: JSON.stringify({
              version: 1,
              kind: EXTERNAL_SIGNAL_JOB_TYPE,
              error: message,
            }),
            heartbeat_at: new Date(),
            finished_at: new Date(),
          },
        })
        .catch(() => {});
    })
    .finally(() => {
      activeJob = null;
    });
}

function toSnapshot(
  state: Awaited<ReturnType<typeof getRunState>>,
  now: Date,
  started: boolean
): ExternalSignalRadarJobSnapshot {
  const running = Boolean(activeJob || isFreshRunningJob(state.job, now));
  return {
    started,
    running,
    status: state.job?.status ?? null,
    competitiveDue: state.competitiveDue,
    catalystDue: state.catalystDue,
    lastCompetitiveAt: state.lastCompetitiveAt?.toISOString() ?? null,
    lastCatalystAt: state.lastCatalystAt?.toISOString() ?? null,
    startedAt: state.job?.started_at?.toISOString() ?? null,
    finishedAt: state.job?.finished_at?.toISOString() ?? null,
    error: state.job?.status === "failed" ? readJobError(state.job.details_json) : null,
  };
}

export async function claimExternalSignalJob(
  state: Awaited<ReturnType<typeof getRunState>>,
  now: Date
) {
  if (!state.job) {
    try {
      return await db.syncJob.create({
        data: {
          type: EXTERNAL_SIGNAL_JOB_TYPE,
          status: "queued",
          started_at: now,
          heartbeat_at: now,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    }
  }

  const staleBefore = new Date(now.getTime() - EXTERNAL_SIGNAL_JOB_STALE_MS);
  const claimed = await db.syncJob.updateMany({
    where: {
      id: state.job.id,
      OR: [
        { status: { notIn: ["queued", "running"] } },
        { status: { in: ["queued", "running"] }, heartbeat_at: null },
        {
          status: { in: ["queued", "running"] },
          heartbeat_at: { lte: staleBefore },
        },
      ],
    },
    data: {
      status: "queued",
      started_at: now,
      finished_at: null,
      heartbeat_at: now,
    },
  });
  if (claimed.count !== 1) return null;
  return db.syncJob.findUnique({ where: { id: state.job.id } });
}

export async function maybeStartExternalSignalRadarJob(options?: {
  skip?: boolean;
  now?: Date;
}): Promise<ExternalSignalRadarJobSnapshot> {
  const now = options?.now ?? new Date();
  const state = await getRunState(now);
  if (options?.skip || activeJob || isFreshRunningJob(state.job, now)) {
    return toSnapshot(state, now, false);
  }
  if (!state.competitiveDue && !state.catalystDue) {
    return toSnapshot(state, now, false);
  }

  const job = await claimExternalSignalJob(state, now);
  if (!job) {
    return toSnapshot(await getRunState(now), now, false);
  }
  launchJob(job.id);
  return {
    ...toSnapshot({ ...state, job }, now, true),
    started: true,
    running: true,
    status: "queued",
  };
}

export async function getExternalSignalRadarJobSnapshot(
  now = new Date()
): Promise<ExternalSignalRadarJobSnapshot> {
  return toSnapshot(await getRunState(now), now, false);
}
