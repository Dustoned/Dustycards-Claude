import fs from "node:fs/promises";
import path from "node:path";
import { PageHeroHeader } from "@/components/PageHeader";
import { appBuildLabel, appVersion, buildVersion, getServerUptimeMs, serverStartedAtIso } from "@/lib/app-version";
import { db } from "@/lib/db";
import { LIVE_DB_PATH } from "@/lib/db-paths";
import { decodeSyncLogDetailsJson, decodeSyncLogMessage } from "@/lib/sync-log-details";
import { timeAsync } from "@/lib/performance-timing";
import {
  areScraperRequestsDisabled,
  getScraperRequestsDisabledReason,
} from "@/lib/scraper-guard";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import {
  countManualCardHistoryCandidates,
  getAutoPriceRefreshSnapshot,
  getKnownUnavailablePriceSummary,
  reconcileStaleSyncLogs,
} from "@/lib/sync";
import { getAutoPriceRefreshJobSnapshot } from "@/lib/sync/auto-price-refresh-job";
import { getCardHistorySyncJobSnapshot } from "@/lib/sync/card-history-job";
import { TCGGO_REQUEST_CONCURRENCY } from "@/lib/tcggo";
import { getTcggoUsageSnapshot } from "@/lib/tcggo-usage";
import { requirePageUser } from "@/lib/page-auth";
import { getFirecrawlConfigSnapshot } from "@/lib/firecrawl";
import AutomationSection from "./AutomationSection";
import DataQualitySection from "./DataQualitySection";
import FirecrawlSection from "./FirecrawlSection";
import HealthDashboardSection from "./HealthDashboardSection";
import PullRateImportSection from "./PullRateImportSection";
import SettingsCollectionDefaultsPanel from "./SettingsCollectionDefaultsPanel";
import SettingsPreferencesPanel from "./SettingsPreferencesPanel";
import SettingsTabs from "./SettingsTabs";
import SettingsUpdatesPanel from "./SettingsUpdatesPanel";
import SyncStatusSection from "./SyncStatusSection";
import type { AutoRefreshStatus } from "./sync-status-utils";

export const dynamic = "force-dynamic";

const SCRAPER_QUOTA_TIME_ZONE = "Europe/Amsterdam";
const SCHEDULER_INTERVAL_MS = 1000 * 60 * 5;
const SCHEDULER_STALE_MS = 1000 * 60 * 15;
const HISTORY_DRAIN_WINDOW_MS = 1000 * 60 * 60 * 2;

type SchedulerTickDetails = {
  checkedAt?: string;
  priceRefresh?: {
    started?: boolean;
    running?: boolean;
    pendingCards?: number;
    dueCards?: number;
    missingPriceCards?: number;
    nextBatchCards?: number;
    status?: string | null;
  };
  historyDrain?: {
    started?: boolean;
    running?: boolean;
    pendingCards?: number;
    skippedReason?: string | null;
  };
  maintenance?: {
    normalizedPriceCheckedAtCards?: number;
  };
};

interface SystemFileHealth {
  databaseSizeBytes: number | null;
  databaseUpdatedAt: Date | null;
  backupCount: number;
  latestBackupName: string | null;
  latestBackupSizeBytes: number | null;
  latestBackupUpdatedAt: Date | null;
}

function parseSchedulerTickDetails(value: string | null | undefined): SchedulerTickDetails | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as SchedulerTickDetails;
  } catch {
    return null;
  }
}

function parseDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: Date | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatScraperQuotaResetTime(value: Date | null): string | null {
  if (!value) return null;

  const time = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SCRAPER_QUOTA_TIME_ZONE,
  }).format(value);

  return `${time} Amsterdam`;
}

function formatByteSize(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";

  const units = ["B", "KB", "MB", "GB"] as const;
  let unitIndex = 0;
  let scaled = value;

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  const decimals = scaled >= 10 || unitIndex === 0 ? 0 : 1;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDuration(valueMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(valueMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
}

async function getSystemFileHealth(): Promise<SystemFileHealth> {
  const result: SystemFileHealth = {
    databaseSizeBytes: null,
    databaseUpdatedAt: null,
    backupCount: 0,
    latestBackupName: null,
    latestBackupSizeBytes: null,
    latestBackupUpdatedAt: null,
  };

  try {
    const stat = await fs.stat(LIVE_DB_PATH);
    result.databaseSizeBytes = stat.size;
    result.databaseUpdatedAt = stat.mtime;
  } catch {}

  const backupDirCandidates = [
    process.env.DUSTYCARDS_BACKUP_DIR,
    path.resolve(process.cwd(), "..", "backups"),
    path.resolve(process.cwd(), "backups"),
    "/opt/dustycards/backups",
  ].filter((entry): entry is string => Boolean(entry));
  const uniqueBackupDirs = [...new Set(backupDirCandidates)];

  for (const backupDir of uniqueBackupDirs) {
    try {
      const entries = await fs.readdir(backupDir, { withFileTypes: true });
      const backupFiles = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
          .map(async (entry) => {
            const filePath = path.join(backupDir, entry.name);
            const stat = await fs.stat(filePath);
            return {
              name: entry.name,
              size: stat.size,
              updatedAt: stat.mtime,
              updatedAtMs: stat.mtimeMs,
            };
          })
      );

      if (backupFiles.length === 0) {
        continue;
      }

      backupFiles.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      const latestBackup = backupFiles[0];
      result.backupCount = backupFiles.length;
      result.latestBackupName = latestBackup.name;
      result.latestBackupSizeBytes = latestBackup.size;
      result.latestBackupUpdatedAt = latestBackup.updatedAt;
      break;
    } catch {}
  }

  return result;
}

function parseSyncType(type: string): {
  kind:
    | "full"
    | "episode"
    | "auto"
    | "card"
    | "sealed"
    | "history"
    | "ebay-sold-graded"
    | "known-unavailable"
    | "other";
  episodeId: string | null;
  cardId: string | null;
} {
  if (type === "full") {
    return { kind: "full", episodeId: null, cardId: null };
  }

  if (type === "auto-prices") {
    return { kind: "auto", episodeId: null, cardId: null };
  }

  if (type === "sealed") {
    return { kind: "sealed", episodeId: null, cardId: null };
  }

  if (type === "card-history") {
    return { kind: "history", episodeId: null, cardId: null };
  }

  if (type === "ebay-sold-graded-prices") {
    return { kind: "ebay-sold-graded", episodeId: null, cardId: null };
  }

  if (type === "known-unavailable-prices") {
    return { kind: "known-unavailable", episodeId: null, cardId: null };
  }

  if (type.startsWith("episode:")) {
    return { kind: "episode", episodeId: type.slice("episode:".length) || null, cardId: null };
  }

  if (type.startsWith("card:")) {
    return { kind: "card", episodeId: null, cardId: type.slice("card:".length) || null };
  }

  return { kind: "other", episodeId: null, cardId: null };
}

export default async function SettingsPage() {
  const user = await requirePageUser("/settings");
  const isAdmin = user.role === "admin";

  if (!isAdmin) {
    return (
      <div className="settings-page mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <PageHeroHeader
          eyebrow="DustyCards"
          title="Settings"
          description="Tune appearance, layout, defaults and personal preferences."
          className="mb-8"
        />

        <SettingsTabs
          tabs={[
            {
              key: "preferences",
              label: "Preferences",
              description: "Display, layout, phone overrides, and visible libraries.",
              content: <SettingsPreferencesPanel />,
            },
            {
              key: "collection",
              label: "Collection",
              description: "Browsing defaults, filters, prices, and Binder Watch.",
              content: <SettingsCollectionDefaultsPanel />,
            },
            {
              key: "updates",
              label: "Updates",
              description: "Patch notes and a compact roadmap for the latest app changes.",
              content: <SettingsUpdatesPanel />,
            },
          ]}
        />
      </div>
    );
  }

  const scraperDisabled = areScraperRequestsDisabled();
  const scraperDisabledReason = getScraperRequestsDisabledReason();

  await reconcileStaleSyncLogs();

  const [
    activeSync,
    activeAutoRefresh,
    lastSuccessfulSync,
    lastFailedSync,
    lastAutoRefresh,
    lastAutoRefreshFailure,
    recentSyncs,
    recentFailedSyncs,
    autoRefreshSnapshot,
    autoPriceRefreshJobSnapshot,
    schedulerJob,
    pokemonAutoRefreshSnapshot,
    onePieceAutoRefreshSnapshot,
    tcggoUsageSnapshot,
    cardHistorySyncJobSnapshot,
    pendingCardHistoryCards,
    pendingPokemonCardHistoryCards,
    pendingOnePieceCardHistoryCards,
    knownUnavailablePriceSummary,
    pricedCardsMissingCheckedAt,
    dataQualityCardsTotal,
    dataQualityCardsMissingImages,
    dataQualityCardsMissingSourceUrls,
    dataQualityCardsMissingPrices,
    dataQualityCardsMissingRarity,
    dataQualityCardDuplicateCandidates,
    dataQualitySealedTotal,
    dataQualitySealedMissingImages,
    dataQualitySealedMissingSourceUrls,
    dataQualitySealedMissingPrices,
    pullRateSetCount,
    pullRateRarityRowCount,
    latestPullRateProfile,
    latestPriceSnapshot,
    systemFileHealth,
  ] = await timeAsync("settings.summary-data", () => Promise.all([
    db.syncLog.findFirst({
      where: {
        status: "running",
      },
      orderBy: { started_at: "desc" },
    }),
    db.syncLog.findFirst({
      where: {
        type: "auto-prices",
        status: "running",
      },
      orderBy: { started_at: "desc" },
    }),
    db.syncLog.findFirst({
      where: {
        status: "success",
      },
      orderBy: { finished_at: "desc" },
    }),
    db.syncLog.findFirst({
      where: {
        status: "failed",
      },
      orderBy: { finished_at: "desc" },
    }),
    db.syncLog.findFirst({
      where: {
        type: "auto-prices",
        status: "success",
      },
      orderBy: { finished_at: "desc" },
    }),
    db.syncLog.findFirst({
      where: {
        type: "auto-prices",
        status: "failed",
      },
      orderBy: { finished_at: "desc" },
    }),
    db.syncLog.findMany({
      orderBy: { started_at: "desc" },
      take: 14,
    }),
    db.syncLog.findMany({
      where: {
        status: "failed",
      },
      orderBy: { finished_at: "desc" },
      take: 5,
    }),
    getAutoPriceRefreshSnapshot(),
    getAutoPriceRefreshJobSnapshot(),
    db.syncJob.findUnique({
      where: { type: "sync-scheduler" },
    }),
    getAutoPriceRefreshSnapshot({ game: POKEMON_GAME }),
    getAutoPriceRefreshSnapshot({ game: ONE_PIECE_GAME }),
    getTcggoUsageSnapshot(),
    getCardHistorySyncJobSnapshot(),
    countManualCardHistoryCandidates(),
    countManualCardHistoryCandidates({ game: POKEMON_GAME }),
    countManualCardHistoryCandidates({ game: ONE_PIECE_GAME }),
    getKnownUnavailablePriceSummary(),
    db.card.count({
      where: {
        tcggo_url: { not: null },
        price_source_checked_at: null,
        prices: { some: {} },
      },
    }),
    db.card.count(),
    db.card.count({
      where: {
        OR: [{ image_url: null }, { image_url: "" }],
      },
    }),
    db.card.count({
      where: {
        OR: [{ tcggo_url: null }, { tcggo_url: "" }],
      },
    }),
    db.card.count({
      where: {
        prices: { none: {} },
      },
    }),
    db.card.count({
      where: {
        OR: [{ rarity: null }, { rarity: "" }],
      },
    }),
    db.$queryRaw<Array<{ duplicates: bigint | number }>>`
      SELECT COALESCE(SUM(extra_count), 0) AS duplicates
      FROM (
        SELECT COUNT(*) - 1 AS extra_count
        FROM "Card"
        WHERE card_number IS NOT NULL
          AND card_number <> ''
          AND name IS NOT NULL
          AND name <> ''
        GROUP BY game, episode_id, card_number, name
        HAVING COUNT(*) > 1
      )
    `,
    db.sealedProduct.count(),
    db.sealedProduct.count({
      where: {
        OR: [{ image_url: null }, { image_url: "" }],
      },
    }),
    db.sealedProduct.count({
      where: {
        OR: [{ tcggo_url: null }, { tcggo_url: "" }],
      },
    }),
    db.sealedProduct.count({
      where: {
        cm_lowest: null,
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: null,
        cm_avg_30d: null,
      },
    }),
    db.setPullRateProfile.count({
      where: { rarity_buckets: { gt: 0 } },
    }),
    db.setPullRateRarity.count(),
    db.setPullRateProfile.findFirst({
      where: { rarity_buckets: { gt: 0 } },
      orderBy: { imported_at: "desc" },
      select: {
        imported_at: true,
        generated_at: true,
      },
    }),
    db.price.findFirst({
      orderBy: { fetched_at: "desc" },
      select: { fetched_at: true },
    }),
    getSystemFileHealth(),
  ]));

  const relevantLogs = [
    activeSync,
    activeAutoRefresh,
    lastSuccessfulSync,
    lastFailedSync,
    lastAutoRefresh,
    lastAutoRefreshFailure,
    ...recentSyncs,
    ...recentFailedSyncs,
  ].filter(
    (log): log is NonNullable<typeof log> => Boolean(log)
  );

  const episodeIds = [...new Set(
    relevantLogs
      .map((log) => parseSyncType(log.type).episodeId)
      .filter((episodeId): episodeId is string => Boolean(episodeId))
  )];
  const cardIds = [...new Set(
    [
      ...relevantLogs.map((log) => parseSyncType(log.type).cardId),
      ...autoRefreshSnapshot.nextBatchCardIds,
      ...pokemonAutoRefreshSnapshot.nextBatchCardIds,
      ...onePieceAutoRefreshSnapshot.nextBatchCardIds,
    ]
      .filter((cardId): cardId is string => Boolean(cardId))
  )];
  for (const episodeId of [
    ...autoRefreshSnapshot.nextBatchEpisodeIds,
    ...pokemonAutoRefreshSnapshot.nextBatchEpisodeIds,
    ...onePieceAutoRefreshSnapshot.nextBatchEpisodeIds,
  ]) {
    if (!episodeIds.includes(episodeId)) {
      episodeIds.push(episodeId);
    }
  }

  const [episodes, cards] = await timeAsync("settings.label-lookups", () => Promise.all([
    episodeIds.length
      ? db.episode.findMany({
          where: { id: { in: episodeIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    cardIds.length
      ? db.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]), {
    episodes: episodeIds.length,
    cards: cardIds.length,
  });

  const episodeNameById = Object.fromEntries(episodes.map((episode) => [episode.id, episode.name]));
  const cardNameById = Object.fromEntries(cards.map((card) => [card.id, card.name]));

  const toSyncEntry = (log: NonNullable<typeof activeSync> | null) => {
    if (!log) return null;
    const decodedMessage = decodeSyncLogMessage(log.message);
    const detailsFromColumn = decodeSyncLogDetailsJson(log.details_json);

    const parsedType = parseSyncType(log.type);
    let label = "Sync";

    if (parsedType.kind === "full") {
      label = "Full Sync";
    } else if (parsedType.kind === "auto") {
      label = "Background Price Refresh";
    } else if (parsedType.kind === "episode") {
      label = episodeNameById[parsedType.episodeId ?? ""] ?? `Set ${parsedType.episodeId ?? "?"}`;
    } else if (parsedType.kind === "sealed") {
      label = "Sealed Products Sync";
    } else if (parsedType.kind === "history") {
      label = "Card History Sync";
    } else if (parsedType.kind === "ebay-sold-graded") {
      label = "eBay Sold Graded Price Sync";
    } else if (parsedType.kind === "known-unavailable") {
      label = "Known Unavailable Price Check";
    } else if (parsedType.kind === "card") {
      label = parsedType.cardId
        ? `Card Refresh: ${cardNameById[parsedType.cardId] ?? parsedType.cardId}`
        : "Card Refresh";
    } else if (log.type) {
      label = log.type;
    }

    return {
      id: log.id,
      type: log.type,
      label,
      status: log.status,
      message: decodedMessage.message,
      details: detailsFromColumn ?? decodedMessage.details,
      started_at: log.started_at,
      finished_at: log.finished_at,
      cancel_requested_at: log.cancel_requested_at,
    };
  };

  const recentSyncEntries = recentSyncs
    .map((log) => toSyncEntry(log))
    .filter(
      (
        entry
      ): entry is NonNullable<ReturnType<typeof toSyncEntry>> => entry !== null
    );
  const failedTypes = [...new Set(recentFailedSyncs.map((log) => log.type))];
  const latestSuccessfulFailedTypeLogs = failedTypes.length
    ? await db.syncLog.findMany({
        where: {
          type: { in: failedTypes },
          status: "success",
        },
        orderBy: [{ type: "asc" }, { finished_at: "desc" }, { started_at: "desc" }],
      })
    : [];
  const latestSuccessByFailedType = new Map<string, (typeof latestSuccessfulFailedTypeLogs)[number]>();

  for (const log of latestSuccessfulFailedTypeLogs) {
    if (!latestSuccessByFailedType.has(log.type)) {
      latestSuccessByFailedType.set(log.type, log);
    }
  }

  const unresolvedRecentFailedSyncs = recentFailedSyncs.filter((log) => {
    const latestSuccess = latestSuccessByFailedType.get(log.type);
    if (!latestSuccess) return true;

    const latestSuccessAt =
      latestSuccess.finished_at?.getTime() ?? latestSuccess.started_at.getTime();
    const failureAt = log.finished_at?.getTime() ?? log.started_at.getTime();

    return latestSuccessAt < failureAt;
  });
  const recentFailedEntries = unresolvedRecentFailedSyncs
    .map((log) => toSyncEntry(log))
    .filter(
      (
        entry
      ): entry is NonNullable<ReturnType<typeof toSyncEntry>> => entry !== null
    );
  const activeSyncEntry = toSyncEntry(activeSync);
  const activeAutoRefreshEntry = toSyncEntry(activeAutoRefresh);
  const pokemonActiveAutoRefresh =
    activeAutoRefreshEntry?.details?.kind === "auto-price-refresh" &&
    activeAutoRefreshEntry.details.currentSet?.game === POKEMON_GAME
      ? activeAutoRefreshEntry
      : null;
  const onePieceActiveAutoRefresh =
    activeAutoRefreshEntry?.details?.kind === "auto-price-refresh" &&
    activeAutoRefreshEntry.details.currentSet?.game === ONE_PIECE_GAME
      ? activeAutoRefreshEntry
      : null;
  const activeScraperLabel = activeSyncEntry?.label ?? null;
  const serverJobStartedLabel = autoPriceRefreshJobSnapshot.startedAt
    ? formatDateTime(new Date(autoPriceRefreshJobSnapshot.startedAt))
    : null;
  const serverJobFinishedLabel = autoPriceRefreshJobSnapshot.finishedAt
    ? formatDateTime(new Date(autoPriceRefreshJobSnapshot.finishedAt))
    : null;
  const serverJobHeartbeatLabel = autoPriceRefreshJobSnapshot.heartbeatAt
    ? formatDateTime(new Date(autoPriceRefreshJobSnapshot.heartbeatAt))
    : null;
  const latestPriceLabel = formatDateTime(latestPriceSnapshot?.fetched_at ?? null);
  const quotaPaused =
    tcggoUsageSnapshot.hasLiveWindow && tcggoUsageSnapshot.requestsRemaining === 0;
  const quotaResetLabel = tcggoUsageSnapshot.hasLiveWindow
    ? formatScraperQuotaResetTime(tcggoUsageSnapshot.quotaResetsAt)
    : null;
  const schedulerDetails = parseSchedulerTickDetails(schedulerJob?.details_json);
  const schedulerLastTickAt =
    parseDateTime(schedulerDetails?.checkedAt) ?? schedulerJob?.heartbeat_at ?? null;
  const schedulerNextTickAt = schedulerLastTickAt
    ? new Date(schedulerLastTickAt.getTime() + SCHEDULER_INTERVAL_MS)
    : null;
  const settingsCheckedAt = new Date();
  const schedulerHealthy = Boolean(
    schedulerLastTickAt &&
      schedulerLastTickAt.getTime() >= settingsCheckedAt.getTime() - SCHEDULER_STALE_MS
  );
  const schedulerLastActionLabel =
    schedulerDetails?.maintenance?.normalizedPriceCheckedAtCards
      ? `Normalized ${schedulerDetails.maintenance.normalizedPriceCheckedAtCards.toLocaleString(
          "en-US"
        )} price check timestamps`
      : schedulerDetails?.priceRefresh?.started
        ? "Started background price refresh"
        : schedulerDetails?.priceRefresh?.running
          ? "Price refresh is still running"
          : schedulerDetails?.historyDrain?.started
            ? "Started card history drain"
            : schedulerDetails?.historyDrain?.running
              ? "Card history drain is still running"
              : schedulerDetails?.historyDrain?.skippedReason === "waiting-for-price-refresh"
                ? "Waiting for price refresh to finish"
                : schedulerJob?.status
                  ? "No work started on the last tick"
                  : "Scheduler has not reported yet";
  const historyStartedAt = parseDateTime(cardHistorySyncJobSnapshot.startedAt);
  const historyFinishedAt = parseDateTime(cardHistorySyncJobSnapshot.finishedAt);
  const historyDrainStartsAt =
    tcggoUsageSnapshot.hasLiveWindow && tcggoUsageSnapshot.quotaResetsAt
      ? new Date(tcggoUsageSnapshot.quotaResetsAt.getTime() - HISTORY_DRAIN_WINDOW_MS)
      : null;
  const historyDrainWindowLabel =
    historyDrainStartsAt && tcggoUsageSnapshot.quotaResetsAt
      ? `${formatScraperQuotaResetTime(historyDrainStartsAt)} - ${formatScraperQuotaResetTime(
          tcggoUsageSnapshot.quotaResetsAt
        )}`
      : null;
  const sharedAutoRefreshStatus = {
    serverJobStatus: autoPriceRefreshJobSnapshot.status,
    serverJobRunning: autoPriceRefreshJobSnapshot.running,
    serverJobStartedLabel,
    serverJobFinishedLabel,
    serverJobHeartbeatLabel,
    latestPriceLabel,
    requestsRemaining: tcggoUsageSnapshot.requestsRemaining,
    requestConcurrency: TCGGO_REQUEST_CONCURRENCY,
    quotaPaused,
    quotaResetLabel,
    scraperDisabled,
  };
  const getEpisodeLabels = (episodeIds: string[]) =>
    episodeIds.map((episodeId) => episodeNameById[episodeId] ?? `Set ${episodeId}`);
  const getCardLabels = (cardIds: string[]) =>
    cardIds.map((cardId) => cardNameById[cardId] ?? cardId);
  const autoRefreshStatuses = [
    {
      key: "all",
      label: "All",
      description: "Combined queue for every enabled library.",
      active: activeAutoRefreshEntry,
      lastSuccess: toSyncEntry(lastAutoRefresh),
      lastFailure: toSyncEntry(lastAutoRefreshFailure),
      ...sharedAutoRefreshStatus,
      dueCards: autoRefreshSnapshot.dueCards,
      missingPriceCards: autoRefreshSnapshot.missingPriceCards,
      unavailableCooldownCards: autoRefreshSnapshot.unavailableCooldownCards,
      nextUnavailableRetryLabel: formatDateTime(autoRefreshSnapshot.nextUnavailableRetryAt),
      nextBatchCards: autoRefreshSnapshot.nextBatchCards,
      nextBatchEpisodes: autoRefreshSnapshot.nextBatchEpisodes,
      nextBatchSetLabels: getEpisodeLabels(autoRefreshSnapshot.nextBatchEpisodeIds),
      nextBatchCardLabels: getCardLabels(autoRefreshSnapshot.nextBatchCardIds),
    },
    {
      key: "pokemon",
      label: "Pokemon",
      description: "Pokemon queue only, using the same shared background refresher.",
      active: pokemonActiveAutoRefresh,
      lastSuccess: null,
      lastFailure: null,
      ...sharedAutoRefreshStatus,
      dueCards: pokemonAutoRefreshSnapshot.dueCards,
      missingPriceCards: pokemonAutoRefreshSnapshot.missingPriceCards,
      unavailableCooldownCards: pokemonAutoRefreshSnapshot.unavailableCooldownCards,
      nextUnavailableRetryLabel: formatDateTime(
        pokemonAutoRefreshSnapshot.nextUnavailableRetryAt
      ),
      nextBatchCards: pokemonAutoRefreshSnapshot.nextBatchCards,
      nextBatchEpisodes: pokemonAutoRefreshSnapshot.nextBatchEpisodes,
      nextBatchSetLabels: getEpisodeLabels(pokemonAutoRefreshSnapshot.nextBatchEpisodeIds),
      nextBatchCardLabels: getCardLabels(pokemonAutoRefreshSnapshot.nextBatchCardIds),
    },
    {
      key: "one-piece",
      label: "One Piece",
      description: "One Piece queue only, using the same shared background refresher.",
      active: onePieceActiveAutoRefresh,
      lastSuccess: null,
      lastFailure: null,
      ...sharedAutoRefreshStatus,
      dueCards: onePieceAutoRefreshSnapshot.dueCards,
      missingPriceCards: onePieceAutoRefreshSnapshot.missingPriceCards,
      unavailableCooldownCards: onePieceAutoRefreshSnapshot.unavailableCooldownCards,
      nextUnavailableRetryLabel: formatDateTime(
        onePieceAutoRefreshSnapshot.nextUnavailableRetryAt
      ),
      nextBatchCards: onePieceAutoRefreshSnapshot.nextBatchCards,
      nextBatchEpisodes: onePieceAutoRefreshSnapshot.nextBatchEpisodes,
      nextBatchSetLabels: getEpisodeLabels(onePieceAutoRefreshSnapshot.nextBatchEpisodeIds),
      nextBatchCardLabels: getCardLabels(onePieceAutoRefreshSnapshot.nextBatchCardIds),
    },
  ] satisfies AutoRefreshStatus[];
  const duplicateCandidateRow = dataQualityCardDuplicateCandidates[0];
  const duplicateCandidateValue = Number(duplicateCandidateRow?.duplicates ?? 0);
  const appStartedAt = parseDateTime(serverStartedAtIso);
  const appStartedLabel = formatDateTime(appStartedAt);
  const appUptimeLabel = formatDuration(getServerUptimeMs(settingsCheckedAt));
  const latestBackupLabel =
    formatDateTime(systemFileHealth.latestBackupUpdatedAt) ??
    systemFileHealth.latestBackupName;
  const firecrawlConfig = getFirecrawlConfigSnapshot();

  return (
    <div className="settings-page mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <PageHeroHeader
        eyebrow="DustyCards"
        title="Settings"
        description="Tune appearance, layout, defaults and background sync behavior."
        className="mb-8"
      />

      <SettingsTabs
        tabs={[
          {
            key: "preferences",
            label: "Preferences",
            description: "Display, layout, phone overrides, and visible libraries.",
            content: <SettingsPreferencesPanel />,
          },
          {
            key: "collection",
            label: "Collection",
            description: "Browsing defaults, filters, prices, and Binder Watch.",
            content: <SettingsCollectionDefaultsPanel />,
          },
          {
            key: "updates",
            label: "Updates",
            description: "Patch notes and a compact roadmap for the latest app changes.",
            content: <SettingsUpdatesPanel />,
          },
          {
            key: "system",
            label: "System",
            description: "Runtime health, data quality, database backups, and pull-rate imports.",
            content: (
              <div className="grid gap-4">
                <HealthDashboardSection
                  app={{
                    version: appVersion,
                    buildLabel: appBuildLabel,
                    buildTitle: buildVersion,
                    startedLabel: appStartedLabel ? `Started ${appStartedLabel}` : null,
                    uptimeLabel: appUptimeLabel,
                  }}
                  quota={{
                    requestsUsed: tcggoUsageSnapshot.requestsUsed,
                    requestsLimit: tcggoUsageSnapshot.requestsLimit,
                    requestsRemaining: tcggoUsageSnapshot.requestsRemaining,
                    resetLabel: tcggoUsageSnapshot.hasLiveWindow
                      ? formatScraperQuotaResetTime(tcggoUsageSnapshot.quotaResetsAt)
                      : null,
                  }}
                  database={{
                    sizeLabel: formatByteSize(systemFileHealth.databaseSizeBytes),
                    updatedLabel: formatDateTime(systemFileHealth.databaseUpdatedAt),
                    latestBackupLabel,
                    latestBackupSizeLabel:
                      systemFileHealth.latestBackupSizeBytes == null
                        ? null
                        : formatByteSize(systemFileHealth.latestBackupSizeBytes),
                    backupCount: systemFileHealth.backupCount,
                  }}
                />
                <DataQualitySection
                  cards={{
                    total: dataQualityCardsTotal,
                    missingImages: dataQualityCardsMissingImages,
                    missingSourceUrls: dataQualityCardsMissingSourceUrls,
                    missingPrices: dataQualityCardsMissingPrices,
                    missingRarity: dataQualityCardsMissingRarity,
                    duplicateCandidates: duplicateCandidateValue,
                  }}
                  sealed={{
                    total: dataQualitySealedTotal,
                    missingImages: dataQualitySealedMissingImages,
                    missingSourceUrls: dataQualitySealedMissingSourceUrls,
                    missingPrices: dataQualitySealedMissingPrices,
                  }}
                />
                <PullRateImportSection
                  summary={{
                    setCount: pullRateSetCount,
                    rarityRowCount: pullRateRarityRowCount,
                    lastImportedLabel: formatDateTime(latestPullRateProfile?.imported_at ?? null),
                    lastGeneratedAt: latestPullRateProfile?.generated_at ?? null,
                  }}
                />
              </div>
            ),
          },
          {
            key: "firecrawl",
            label: "Firecrawl",
            description: "Admin-only web context tools with clear credit guardrails.",
            content: <FirecrawlSection config={firecrawlConfig} isAdmin={user.role === "admin"} />,
          },
          {
            key: "sync",
            label: "Sync",
            description: "Background refresh status, scheduler tools, and manual sync actions.",
            content: (
              <div className="grid gap-4">
                <SyncStatusSection
                  activeSync={activeSyncEntry}
                  autoRefreshStatuses={autoRefreshStatuses}
                  recentSyncs={recentSyncEntries}
                  recentFailures={recentFailedEntries}
                />
                <AutomationSection
                  schedulerHealth={{
                    status: schedulerJob?.status ?? null,
                    healthy: schedulerHealthy,
                    lastTickLabel: formatDateTime(schedulerLastTickAt),
                    nextTickLabel: formatDateTime(schedulerNextTickAt),
                    lastActionLabel: schedulerLastActionLabel,
                    historyPendingCards:
                      schedulerDetails?.historyDrain?.pendingCards ??
                      cardHistorySyncJobSnapshot.pendingCards,
                    normalizedPriceCheckedAtCards:
                      schedulerDetails?.maintenance?.normalizedPriceCheckedAtCards ?? null,
                    pricedCardsMissingCheckedAt,
                  }}
                  historyAutomation={{
                    running: cardHistorySyncJobSnapshot.running,
                    pendingCards: cardHistorySyncJobSnapshot.pendingCards,
                    startedLabel: formatDateTime(historyStartedAt),
                    finishedLabel: formatDateTime(historyFinishedAt),
                    drainWindowLabel: historyDrainWindowLabel,
                    quotaResetLabel,
                    error: cardHistorySyncJobSnapshot.error,
                  }}
                  knownUnavailableSummary={{
                    total: knownUnavailablePriceSummary.totalCards,
                    pokemon: knownUnavailablePriceSummary.pokemonCards,
                    onePiece: knownUnavailablePriceSummary.onePieceCards,
                    retryWindow: knownUnavailablePriceSummary.retryWindowCards,
                    withoutPriceSnapshot: knownUnavailablePriceSummary.withoutPriceSnapshotCards,
                    withPriceSnapshot: knownUnavailablePriceSummary.withPriceSnapshotCards,
                    oldestCheckedLabel: formatDateTime(knownUnavailablePriceSummary.oldestCheckedAt),
                    latestCheckedLabel: formatDateTime(knownUnavailablePriceSummary.latestCheckedAt),
                    nextRetryLabel: formatDateTime(knownUnavailablePriceSummary.nextRetryAt),
                  }}
                  pendingCardHistoryCards={pendingCardHistoryCards}
                  pendingCardHistoryByGame={{
                    pokemon: pendingPokemonCardHistoryCards,
                    onePiece: pendingOnePieceCardHistoryCards,
                  }}
                  knownUnavailableCards={knownUnavailablePriceSummary.totalCards}
                  activeScraperLabel={activeScraperLabel}
                  scraperDisabled={scraperDisabled}
                  scraperDisabledReason={scraperDisabledReason ?? "Scraper requests are disabled."}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
