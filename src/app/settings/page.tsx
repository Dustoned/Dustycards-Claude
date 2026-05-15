import { Activity, AlertTriangle, RefreshCw, Settings2 } from "lucide-react";
import { PageHeroHeader, type HeaderStat } from "@/components/PageHeader";
import { db } from "@/lib/db";
import { decodeSyncLogDetailsJson, decodeSyncLogMessage } from "@/lib/sync-log-details";
import { timeAsync } from "@/lib/performance-timing";
import { areScraperRequestsDisabled, SCRAPER_DISABLED_ENV } from "@/lib/scraper-guard";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import {
  countManualCardHistoryCandidates,
  getAutoPriceRefreshSnapshot,
  reconcileStaleSyncLogs,
} from "@/lib/sync";
import { TCGGO_REQUEST_CONCURRENCY } from "@/lib/tcggo";
import { getTcggoUsageSnapshot } from "@/lib/tcggo-usage";
import { requirePageUser } from "@/lib/page-auth";
import ThemeSection from "./ThemeSection";
import LayoutSection from "./LayoutSection";
import AutomationSection from "./AutomationSection";
import CardDefaultsSection from "./CardDefaultsSection";
import FiltersSection from "./FiltersSection";
import HomePageSection from "./HomePageSection";
import LibrarySection from "./LibrarySection";
import MobileDisplaySection from "./MobileDisplaySection";
import PullRateImportSection from "./PullRateImportSection";
import SyncStatusSection from "./SyncStatusSection";

export const dynamic = "force-dynamic";

const SCRAPER_QUOTA_TIME_ZONE = "Europe/Amsterdam";

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

function PersonalSettingsSections({ className }: { className: string }) {
  return (
    <div className={className}>
      <ThemeSection />
      <LibrarySection />
      <div className="hidden sm:contents">
        <LayoutSection />
        <CardDefaultsSection />
      </div>
      <div className="sm:hidden">
        <MobileDisplaySection />
      </div>
      <HomePageSection />
      <FiltersSection />
    </div>
  );
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

        <PersonalSettingsSections className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" />
      </div>
    );
  }

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
    onePieceAutoRefreshSnapshot,
    tcggoUsageSnapshot,
    pendingCardHistoryCards,
    pendingPokemonCardHistoryCards,
    pendingOnePieceCardHistoryCards,
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
    getAutoPriceRefreshSnapshot({ game: ONE_PIECE_GAME }),
    getTcggoUsageSnapshot(),
    countManualCardHistoryCandidates(),
    countManualCardHistoryCandidates({ game: POKEMON_GAME }),
    countManualCardHistoryCandidates({ game: ONE_PIECE_GAME }),
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
      ...onePieceAutoRefreshSnapshot.nextBatchCardIds,
    ]
      .filter((cardId): cardId is string => Boolean(cardId))
  )];
  for (const episodeId of [
    ...autoRefreshSnapshot.nextBatchEpisodeIds,
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
  const recentSuccessCount = recentSyncs.filter((log) => log.status === "success").length;
  const recentFailureCount = recentSyncs.filter((log) => log.status === "failed").length;
  const recentAutoFailureCount = recentSyncs.filter(
    (log) => log.status === "failed" && log.type === "auto-prices"
  ).length;
  const activeSyncEntry = toSyncEntry(activeSync);
  const activeAutoRefreshEntry = toSyncEntry(activeAutoRefresh);
  const onePieceActiveAutoRefresh =
    activeAutoRefreshEntry?.details?.kind === "auto-price-refresh" &&
    activeAutoRefreshEntry.details.currentSet?.game === ONE_PIECE_GAME
      ? activeAutoRefreshEntry
      : null;
  const activeScraperLabel = activeSyncEntry?.label ?? null;
  const headerStats = [
    { label: "Running", value: runningNowCount.toLocaleString(), Icon: Activity, tone: "sky" },
    { label: "Success 24h", value: recentSuccessCount.toLocaleString(), Icon: RefreshCw, tone: "emerald" },
    { label: "Failed 24h", value: recentFailureCount.toLocaleString(), Icon: AlertTriangle, tone: "rose" },
    { label: "Due cards", value: autoRefreshSnapshot.dueCards.toLocaleString(), Icon: Settings2, tone: "amber" },
  ] satisfies HeaderStat[];

  return (
    <div className="settings-page mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <PageHeroHeader
        eyebrow="DustyCards"
        title="Settings"
        description="Tune appearance, layout, defaults and background sync behavior."
        className="mb-8"
        stats={headerStats}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
        <PersonalSettingsSections className="grid gap-4 md:grid-cols-2 xl:grid-cols-1" />

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
                ? formatScraperQuotaResetTime(tcggoUsageSnapshot.quotaResetsAt)
                : tcggoUsageSnapshot.observedAt
                  ? "Just reset, waiting for the next scraper response"
                  : "No scraper requests seen yet",
              observedLabel: formatDateTime(tcggoUsageSnapshot.observedAt),
            }}
            pendingCardHistoryCards={pendingCardHistoryCards}
            pendingCardHistoryByGame={{
              pokemon: pendingPokemonCardHistoryCards,
              onePiece: pendingOnePieceCardHistoryCards,
            }}
            knownUnavailableCards={autoRefreshSnapshot.unavailableCooldownCards}
            activeScraperLabel={activeScraperLabel}
            scraperDisabled={scraperDisabled}
            scraperDisabledLabel={SCRAPER_DISABLED_ENV}
          />
        </div>

        <div className="xl:col-span-2">
          <SyncStatusSection
            activeSync={activeSyncEntry}
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
              title: "All Games Background Refresh",
              description:
                "Combined queue for every enabled library, including Pokemon and One Piece cards.",
              active: activeAutoRefreshEntry,
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
                ? formatScraperQuotaResetTime(tcggoUsageSnapshot.quotaResetsAt)
                : null,
              scraperDisabled,
            }}
            onePieceAutoRefreshStatus={
              {
                title: "One Piece Background Refresh",
                description:
                  "Filtered view of the One Piece queue; it runs through the shared background price refresher.",
                active: onePieceActiveAutoRefresh,
                lastSuccess: null,
                lastFailure: null,
                dueCards: onePieceAutoRefreshSnapshot.dueCards,
                missingPriceCards: onePieceAutoRefreshSnapshot.missingPriceCards,
                unavailableCooldownCards: onePieceAutoRefreshSnapshot.unavailableCooldownCards,
                nextUnavailableRetryLabel: formatDateTime(
                  onePieceAutoRefreshSnapshot.nextUnavailableRetryAt
                ),
                nextBatchCards: onePieceAutoRefreshSnapshot.nextBatchCards,
                nextBatchEpisodes: onePieceAutoRefreshSnapshot.nextBatchEpisodes,
                nextBatchSetLabels: onePieceAutoRefreshSnapshot.nextBatchEpisodeIds.map(
                  (episodeId) => episodeNameById[episodeId] ?? `Set ${episodeId}`
                ),
                nextBatchCardLabels: onePieceAutoRefreshSnapshot.nextBatchCardIds.map(
                  (cardId) => cardNameById[cardId] ?? cardId
                ),
                requestsRemaining: tcggoUsageSnapshot.requestsRemaining,
                requestConcurrency: TCGGO_REQUEST_CONCURRENCY,
                quotaPaused:
                  tcggoUsageSnapshot.hasLiveWindow &&
                  tcggoUsageSnapshot.requestsRemaining === 0,
                quotaResetLabel: tcggoUsageSnapshot.hasLiveWindow
                  ? formatScraperQuotaResetTime(tcggoUsageSnapshot.quotaResetsAt)
                  : null,
                scraperDisabled,
              }
            }
            recentSyncs={recentSyncEntries}
            recentFailures={recentFailedEntries}
          />
        </div>
      </div>
    </div>
  );
}
