import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getAutoPriceRefreshSnapshot } from "@/lib/sync";
import { getTcggoUsageSnapshot } from "@/lib/tcggo-usage";
import { parseCookieSettings, SETTINGS_COOKIE_NAME } from "@/lib/user-settings";
import ThemeSection from "./ThemeSection";
import LayoutSection from "./LayoutSection";
import AutomationSection from "./AutomationSection";
import CardDefaultsSection from "./CardDefaultsSection";
import FiltersSection from "./FiltersSection";
import HomePageSection from "./HomePageSection";
import SyncStatusSection from "./SyncStatusSection";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function parseSyncType(type: string): {
  kind: "full" | "episode" | "auto" | "card" | "sealed" | "history" | "other";
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
  const widescreen = parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value)?.widescreen ?? false;

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
  ] = await Promise.all([
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
    db.card.count({
      where: {
        collectionItems: {
          some: {},
        },
        native_history_synced_at: null,
        NOT: {
          rarity: {
            in: ["Common", "Uncommon", "Rare", "common", "uncommon", "rare"],
          },
        },
        OR: [
          { prices: { some: {} } },
          { cardmarket_id: { not: null } },
          { tcgplayer_id: { not: null } },
        ],
      },
    }),
  ]);

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

  const [episodes, cards] = await Promise.all([
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
  ]);

  const episodeNameById = Object.fromEntries(episodes.map((episode) => [episode.id, episode.name]));
  const cardNameById = Object.fromEntries(cards.map((card) => [card.id, card.name]));

  const toSyncEntry = (log: NonNullable<typeof activeSync> | null) => {
    if (!log) return null;

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
      message: log.message,
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

  return (
    <div className={`${widescreen ? "max-w-[2000px]" : "max-w-2xl"} mx-auto px-4 sm:px-6 lg:px-8 py-10`}>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-8">Settings</h1>

      <div className={`grid gap-4 ${widescreen ? "grid-cols-3" : "grid-cols-1"}`}>
        <ThemeSection />
        <LayoutSection />
        <CardDefaultsSection />
        <HomePageSection />
        <FiltersSection />
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
          activeScraperLabel={activeScraperLabel}
        />
        <div className={widescreen ? "col-span-3" : ""}>
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
              nextBatchCards: autoRefreshSnapshot.nextBatchCards,
              nextBatchEpisodes: autoRefreshSnapshot.nextBatchEpisodes,
              nextBatchSetLabels: autoRefreshSnapshot.nextBatchEpisodeIds.map(
                (episodeId) => episodeNameById[episodeId] ?? `Set ${episodeId}`
              ),
              nextBatchCardLabels: autoRefreshSnapshot.nextBatchCardIds.map(
                (cardId) => cardNameById[cardId] ?? cardId
              ),
            }}
            recentSyncs={recentSyncEntries}
            recentFailures={recentFailedEntries}
          />
        </div>
      </div>
    </div>
  );
}
