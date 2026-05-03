import { cookies } from "next/headers";
import { Activity, AlertTriangle, RefreshCw, Settings2 } from "lucide-react";
import { PageHeroHeader, type HeaderStat } from "@/components/PageHeader";
import { db } from "@/lib/db";
import { decodeSyncLogDetailsJson, decodeSyncLogMessage } from "@/lib/sync-log-details";
import { timeAsync } from "@/lib/performance-timing";
import { areScraperRequestsDisabled, SCRAPER_DISABLED_ENV } from "@/lib/scraper-guard";
import {
  countEbaySoldGradedPriceCandidates,
  countManualCardHistoryCandidates,
  getAutoPriceRefreshSnapshot,
  reconcileStaleSyncLogs,
} from "@/lib/sync";
import { TCGGO_REQUEST_CONCURRENCY } from "@/lib/tcggo";
import { getTcggoUsageSnapshot } from "@/lib/tcggo-usage";
import { parseCookieSettings, SETTINGS_COOKIE_NAME } from "@/lib/user-settings";
import ThemeSection from "./ThemeSection";
import LayoutSection from "./LayoutSection";
import AutomationSection from "./AutomationSection";
import CardDefaultsSection from "./CardDefaultsSection";
import FiltersSection from "./FiltersSection";
import HomePageSection from "./HomePageSection";
import PullRateImportSection from "./PullRateImportSection";
import SyncStatusSection from "./SyncStatusSection";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
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

  if (type.startsWith("episode:")) {
    return { kind: "episode", episodeId: type.slice("episode:".length) || null, cardId: null };
  }

  if (type.startsWith("card:")) {
    return { kind: "card", episodeId: null, cardId: type.slice("card:".length) || null };
  }

  return { kind: "other", episodeId: null, cardId: null };
}

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const settings = parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value);
  const widescreen = settings?.widescreen ?? false;
  const scraperDisabled = areScraperRequestsDisabled();

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
    runningNowCount,
    autoRefreshSnapshot,
    tcggoUsageSnapshot,
    pendingCardHistoryCards,
    pendingEbaySoldGradedPriceCards,
    pullRateSetCount,
    pullRateRarityRowCount,
    latestPullRateProfile,
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
    db.syncLog.count({
      where: {
        status: "running",
      },
    }),
    getAutoPriceRefreshSnapshot(),
    getTcggoUsageSnapshot(),
    countManualCardHistoryCandidates(),
    countEbaySoldGradedPriceCandidates(),
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
    ]
      .filter((cardId): cardId is string => Boolean(cardId))
  )];
  for (const episodeId of autoRefreshSnapshot.nextBatchEpisodeIds) {
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
  const recentSuccessCount = recentSyncs.filter((log) => log.status === "success").length;
  const recentFailureCount = recentSyncs.filter((log) => log.status === "failed").length;
  const recentAutoFailureCount = recentSyncs.filter(
    (log) => log.status === "failed" && log.type === "auto-prices"
  ).length;
  const activeScraperLabel = toSyncEntry(activeSync)?.label ?? null;
  const headerStats = [
    { label: "Running", value: runningNowCount.toLocaleString(), Icon: Activity, tone: "sky" },
    { label: "Success 24h", value: recentSuccessCount.toLocaleString(), Icon: RefreshCw, tone: "emerald" },
    { label: "Failed 24h", value: recentFailureCount.toLocaleString(), Icon: AlertTriangle, tone: "rose" },
    { label: "Due cards", value: autoRefreshSnapshot.dueCards.toLocaleString(), Icon: Settings2, tone: "amber" },
  ] satisfies HeaderStat[];

  return (
    <div className={`settings-page ${widescreen ? "max-w-[2000px]" : "max-w-6xl"} mx-auto px-4 sm:px-6 lg:px-8 py-10`}>
      <PageHeroHeader
        eyebrow="DustyCards"
        title="Settings"
        description="Tune appearance, layout, defaults and background sync behavior."
        className="mb-8"
        stats={headerStats}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <ThemeSection />
          <LayoutSection />
          <CardDefaultsSection />
          <HomePageSection />
          <FiltersSection />
        </div>

        <div className="grid gap-4">
          <PullRateImportSection
            summary={{
              setCount: pullRateSetCount,
              rarityRowCount: pullRateRarityRowCount,
              lastImportedLabel: formatDateTime(latestPullRateProfile?.imported_at ?? null),
              lastGeneratedAt: latestPullRateProfile?.generated_at ?? null,
            }}
          />
          <AutomationSection
            scraperUsage={{
              requestsUsed: tcggoUsageSnapshot.requestsUsed,
              requestsLimit: tcggoUsageSnapshot.requestsLimit,
              requestsRemaining: tcggoUsageSnapshot.requestsRemaining,
              resetLabel: tcggoUsageSnapshot.hasLiveWindow
                ? formatDateTime(tcggoUsageSnapshot.quotaResetsAt)
                : tcggoUsageSnapshot.observedAt
                  ? "Just reset, waiting for the next scraper response"
                  : "No scraper requests seen yet",
              observedLabel: formatDateTime(tcggoUsageSnapshot.observedAt),
            }}
            pendingCardHistoryCards={pendingCardHistoryCards}
            pendingEbaySoldGradedPriceCards={pendingEbaySoldGradedPriceCards}
            activeScraperLabel={activeScraperLabel}
            scraperDisabled={scraperDisabled}
            scraperDisabledLabel={SCRAPER_DISABLED_ENV}
          />
        </div>

        <div className="xl:col-span-2">
          <SyncStatusSection
            activeSync={toSyncEntry(activeSync)}
            lastSuccessfulSync={toSyncEntry(lastSuccessfulSync)}
            lastFailedSync={toSyncEntry(lastFailedSync)}
            overview={{
              runningNow: runningNowCount,
              success24h: recentSuccessCount,
              failed24h: recentFailureCount,
              autoFailures24h: recentAutoFailureCount,
              lastActivity: recentSyncEntries[0] ?? null,
            }}
            autoRefreshStatus={{
              active: toSyncEntry(activeAutoRefresh),
              lastSuccess: toSyncEntry(lastAutoRefresh),
              lastFailure: toSyncEntry(lastAutoRefreshFailure),
              dueCards: autoRefreshSnapshot.dueCards,
              missingPriceCards: autoRefreshSnapshot.missingPriceCards,
              unavailableCooldownCards: autoRefreshSnapshot.unavailableCooldownCards,
              nextUnavailableRetryLabel: formatDateTime(autoRefreshSnapshot.nextUnavailableRetryAt),
              nextBatchCards: autoRefreshSnapshot.nextBatchCards,
              nextBatchEpisodes: autoRefreshSnapshot.nextBatchEpisodes,
              nextBatchSetLabels: autoRefreshSnapshot.nextBatchEpisodeIds.map(
                (episodeId) => episodeNameById[episodeId] ?? `Set ${episodeId}`
              ),
              nextBatchCardLabels: autoRefreshSnapshot.nextBatchCardIds.map(
                (cardId) => cardNameById[cardId] ?? cardId
              ),
              requestsRemaining: tcggoUsageSnapshot.requestsRemaining,
              requestConcurrency: TCGGO_REQUEST_CONCURRENCY,
              quotaPaused:
                tcggoUsageSnapshot.hasLiveWindow &&
                tcggoUsageSnapshot.requestsRemaining === 0,
              quotaResetLabel: tcggoUsageSnapshot.hasLiveWindow
                ? formatDateTime(tcggoUsageSnapshot.quotaResetsAt)
                : null,
              scraperDisabled,
            }}
            recentSyncs={recentSyncEntries}
            recentFailures={recentFailedEntries}
          />
        </div>
      </div>
    </div>
  );
}
