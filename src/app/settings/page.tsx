import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getAutoPriceRefreshSnapshot } from "@/lib/sync";
import { parseCookieSettings, SETTINGS_COOKIE_NAME } from "@/lib/user-settings";
import ThemeSection from "./ThemeSection";
import LayoutSection from "./LayoutSection";
import AutomationSection from "./AutomationSection";
import CardDefaultsSection from "./CardDefaultsSection";
import FiltersSection from "./FiltersSection";
import HomePageSection from "./HomePageSection";
import SyncStatusSection from "./SyncStatusSection";

export const dynamic = "force-dynamic";

function parseSyncType(type: string): {
  kind: "full" | "episode" | "auto" | "other";
  episodeId: string | null;
} {
  if (type === "full") {
    return { kind: "full", episodeId: null };
  }

  if (type === "auto-prices") {
    return { kind: "auto", episodeId: null };
  }

  if (type.startsWith("episode:")) {
    return { kind: "episode", episodeId: type.slice("episode:".length) || null };
  }

  return { kind: "other", episodeId: null };
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
    recentSyncs,
    autoRefreshSnapshot,
  ] = await Promise.all([
    db.syncLog.findFirst({
      where: {
        status: "running",
        type: { not: "auto-prices" },
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
        type: { not: "auto-prices" },
      },
      orderBy: { finished_at: "desc" },
    }),
    db.syncLog.findFirst({
      where: {
        status: "failed",
        type: { not: "auto-prices" },
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
    db.syncLog.findMany({
      where: {
        type: { not: "auto-prices" },
      },
      orderBy: { started_at: "desc" },
      take: 8,
    }),
    getAutoPriceRefreshSnapshot(),
  ]);

  const relevantLogs = [
    activeSync,
    activeAutoRefresh,
    lastSuccessfulSync,
    lastFailedSync,
    lastAutoRefresh,
    ...recentSyncs,
  ].filter(
    (log): log is NonNullable<typeof log> => Boolean(log)
  );

  const episodeIds = [...new Set(
    relevantLogs
      .map((log) => parseSyncType(log.type).episodeId)
      .filter((episodeId): episodeId is string => Boolean(episodeId))
  )];

  const episodes = episodeIds.length
    ? await db.episode.findMany({
        where: { id: { in: episodeIds } },
        select: { id: true, name: true },
      })
    : [];

  const episodeNameById = Object.fromEntries(episodes.map((episode) => [episode.id, episode.name]));

  const toSyncEntry = (log: NonNullable<typeof activeSync> | null) => {
    if (!log) return null;

    const parsedType = parseSyncType(log.type);
    let label = "Sync";

    if (parsedType.kind === "full") {
      label = "Full Sync";
    } else if (parsedType.kind === "auto") {
      label = "Auto Price Refresh";
    } else if (parsedType.kind === "episode") {
      label = episodeNameById[parsedType.episodeId ?? ""] ?? `Episode ${parsedType.episodeId ?? "?"}`;
    }

    return {
      id: log.id,
      type: log.type,
      label,
      status: log.status,
      message: log.message,
      started_at: log.started_at,
      finished_at: log.finished_at,
    };
  };

  const recentSyncEntries = recentSyncs
    .map((log) => toSyncEntry(log))
    .filter(
      (
        entry
      ): entry is NonNullable<ReturnType<typeof toSyncEntry>> => entry !== null
    );

  return (
    <div className={`${widescreen ? "max-w-[2000px]" : "max-w-2xl"} mx-auto px-4 sm:px-6 lg:px-8 py-10`}>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-8">Settings</h1>

      <div className={`grid gap-4 ${widescreen ? "grid-cols-3" : "grid-cols-1"}`}>
        <ThemeSection />
        <LayoutSection />
        <CardDefaultsSection />
        <HomePageSection />
        <FiltersSection />
        <AutomationSection />
        <div className={widescreen ? "col-span-3" : ""}>
          <SyncStatusSection
            activeSync={toSyncEntry(activeSync)}
            lastSuccessfulSync={toSyncEntry(lastSuccessfulSync)}
            lastFailedSync={toSyncEntry(lastFailedSync)}
            autoRefreshStatus={{
              active: toSyncEntry(activeAutoRefresh),
              lastSuccess: toSyncEntry(lastAutoRefresh),
              dueCards: autoRefreshSnapshot.dueCards,
              missingPriceCards: autoRefreshSnapshot.missingPriceCards,
              nextBatchCards: autoRefreshSnapshot.nextBatchCards,
              nextBatchEpisodes: autoRefreshSnapshot.nextBatchEpisodes,
            }}
            recentSyncs={recentSyncEntries}
          />
        </div>
      </div>
    </div>
  );
}
