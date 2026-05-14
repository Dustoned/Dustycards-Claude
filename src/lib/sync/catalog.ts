import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isHiddenExpansion, isRedundantSubsetExpansion } from "@/lib/episodes";
import { POKEMON_GAME, type TradingCardGame } from "@/lib/games";
import type { NormalizedEpisode } from "@/lib/tcggo";

export type EpisodeSourceStatus = "ok" | "partial" | "empty";

export interface EpisodeSourceCheckResult {
  status: EpisodeSourceStatus;
  nextCardCount: number | null;
}

interface AutoCatalogLocalEpisode {
  id: string;
  name: string | null;
  card_count: number | null;
  source_status: string | null;
  source_checked_at: Date | null;
  synced_at: Date | null;
  _count: {
    cards: number;
  };
}

interface AutoCatalogEpisodeCandidate extends NormalizedEpisode {
  isNewEpisode: boolean;
  localCardCount: number;
  missingCards: number;
  sourceNeedsRecheck: boolean;
}

interface AutoCatalogSyncPlan {
  selectedEpisodes: AutoCatalogEpisodeCandidate[];
  candidateEpisodes: number;
  newEpisodes: number;
}

export interface AutoCatalogSyncSelection extends AutoCatalogSyncPlan {
  remoteEpisodes: NormalizedEpisode[];
}

export interface AutoCatalogSyncPreview {
  shouldSync: boolean;
}

const AUTO_CATALOG_CHECK_SETTING_PREFIX = "auto-catalog-sync:last-checked-at:";

export function hasEpisodeSourceIssue(status: string | null): boolean {
  return status === "partial" || status === "empty";
}

function shouldRecheckEpisodeSource(
  episode: Pick<AutoCatalogLocalEpisode, "source_status" | "source_checked_at">,
  now: Date,
  minIntervalMs: number
): boolean {
  if (!hasEpisodeSourceIssue(episode.source_status)) {
    return false;
  }

  if (!episode.source_checked_at) {
    return true;
  }

  return now.getTime() - episode.source_checked_at.getTime() >= minIntervalMs;
}

function getLatestEpisodeCatalogActivityAt(episodes: AutoCatalogLocalEpisode[]): Date | null {
  let latest: Date | null = null;

  for (const episode of episodes) {
    const activityAt =
      episode.source_checked_at &&
      (!episode.synced_at || episode.source_checked_at.getTime() > episode.synced_at.getTime())
        ? episode.source_checked_at
        : episode.synced_at;

    if (!activityAt) continue;

    if (!latest || activityAt.getTime() > latest.getTime()) {
      latest = activityAt;
    }
  }

  return latest;
}

export function mergeKnownEpisodeCardCount(
  ...counts: Array<number | null | undefined>
): number | null {
  const knownCounts = counts.filter((count): count is number => count != null);

  if (knownCounts.length === 0) {
    return null;
  }

  return Math.max(...knownCounts);
}

export function assessEpisodeSourceCheck(input: {
  catalogCardCount: number | null;
  localCardCount: number;
  actualCardCount: number;
}): EpisodeSourceCheckResult {
  const bestKnownCount = mergeKnownEpisodeCardCount(
    input.catalogCardCount,
    input.localCardCount,
    input.actualCardCount
  ) ?? 0;

  if (input.actualCardCount === 0 && bestKnownCount > 0) {
    return {
      status: "empty",
      nextCardCount: bestKnownCount,
    };
  }

  if (input.actualCardCount > 0 && bestKnownCount > input.actualCardCount) {
    return {
      status: "partial",
      nextCardCount: bestKnownCount,
    };
  }

  if (bestKnownCount > 0) {
    return {
      status: "ok",
      nextCardCount: bestKnownCount,
    };
  }

  return {
    status: "ok",
    nextCardCount: input.catalogCardCount,
  };
}

export function buildEpisodeSourceCheckUpdate(input: {
  catalogCardCount: number | null;
  localCardCount: number;
  actualCardCount: number;
  checkedAt: Date;
  markSynced?: boolean;
}): Prisma.EpisodeUpdateInput {
  const sourceCheck = assessEpisodeSourceCheck(input);

  return {
    card_count: sourceCheck.nextCardCount,
    source_status: sourceCheck.status,
    source_checked_at: input.checkedAt,
    source_actual_card_count: input.actualCardCount,
    ...(input.markSynced && sourceCheck.status === "ok"
      ? {
          synced_at: input.checkedAt,
        }
      : {}),
  };
}

async function loadVisibleAutoCatalogLocalEpisodes(
  game: TradingCardGame = POKEMON_GAME
): Promise<AutoCatalogLocalEpisode[]> {
  const localEpisodes = await db.episode.findMany({
    where: { game },
    select: {
      id: true,
      name: true,
      card_count: true,
      source_status: true,
      source_checked_at: true,
      synced_at: true,
      _count: {
        select: {
          cards: true,
        },
      },
    },
  });

  return localEpisodes.filter(
    (episode) =>
      !isHiddenExpansion({ id: episode.id, name: episode.name }) &&
      !isRedundantSubsetExpansion(episode.name ?? "")
  );
}

function getAutoCatalogCheckSettingKey(game: TradingCardGame): string {
  return `${AUTO_CATALOG_CHECK_SETTING_PREFIX}${game}`;
}

function parseSettingDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getLastAutoCatalogCheckedAt(game: TradingCardGame): Promise<Date | null> {
  const setting = await db.appSetting.findUnique({
    where: { key: getAutoCatalogCheckSettingKey(game) },
    select: { value: true },
  });

  return parseSettingDate(setting?.value);
}

async function markAutoCatalogCheckedAt(
  games: readonly TradingCardGame[],
  checkedAt: Date
): Promise<void> {
  await db.$transaction(
    [...new Set(games)].map((game) =>
      db.appSetting.upsert({
        where: { key: getAutoCatalogCheckSettingKey(game) },
        create: {
          key: getAutoCatalogCheckSettingKey(game),
          value: checkedAt.toISOString(),
        },
        update: {
          value: checkedAt.toISOString(),
        },
      })
    )
  );
}

function shouldRunAutoCatalogSync(
  episodes: AutoCatalogLocalEpisode[],
  now: Date,
  minIntervalMs: number,
  lastRemoteCatalogCheckedAt: Date | null
): boolean {
  if (episodes.length === 0) {
    return (
      !lastRemoteCatalogCheckedAt ||
      now.getTime() - lastRemoteCatalogCheckedAt.getTime() >= minIntervalMs
    );
  }

  const latestLocalCatalogActivityAt = getLatestEpisodeCatalogActivityAt(episodes);
  const latestCatalogActivityAt =
    latestLocalCatalogActivityAt &&
    (!lastRemoteCatalogCheckedAt ||
      latestLocalCatalogActivityAt.getTime() > lastRemoteCatalogCheckedAt.getTime())
      ? latestLocalCatalogActivityAt
      : lastRemoteCatalogCheckedAt;

  if (
    latestCatalogActivityAt &&
    now.getTime() - latestCatalogActivityAt.getTime() < minIntervalMs
  ) {
    return false;
  }

  // A stale catalog should still be checked even when local card counts look complete,
  // otherwise newly released remote episodes are invisible until a manual full sync.
  return true;
}

export function createEmptyAutoCatalogSyncSelection(): AutoCatalogSyncSelection {
  return {
    remoteEpisodes: [],
    selectedEpisodes: [],
    candidateEpisodes: 0,
    newEpisodes: 0,
  };
}

export async function previewAutoCatalogSync(input: {
  now: Date;
  minIntervalMs: number;
  game?: TradingCardGame;
}): Promise<AutoCatalogSyncPreview> {
  const game = input.game ?? POKEMON_GAME;
  const [localEpisodes, lastRemoteCatalogCheckedAt] = await Promise.all([
    loadVisibleAutoCatalogLocalEpisodes(game),
    getLastAutoCatalogCheckedAt(game),
  ]);

  return {
    shouldSync: shouldRunAutoCatalogSync(
      localEpisodes,
      input.now,
      input.minIntervalMs,
      lastRemoteCatalogCheckedAt
    ),
  };
}

function planAutoCatalogSyncFromEpisodes(input: {
  remoteEpisodes: NormalizedEpisode[];
  localEpisodes: AutoCatalogLocalEpisode[];
  now: Date;
  maxEpisodes: number;
  minIntervalMs: number;
}): AutoCatalogSyncPlan {
  const localEpisodeMap = new Map(input.localEpisodes.map((episode) => [episode.id, episode]));
  const candidates: AutoCatalogEpisodeCandidate[] = [];
  let newEpisodes = 0;

  for (const episode of input.remoteEpisodes) {
    if (isHiddenExpansion(episode) || isRedundantSubsetExpansion(episode.name)) {
      continue;
    }

    const existingEpisode = localEpisodeMap.get(episode.id);
    const isNewEpisode = !existingEpisode;
    const localCardCount = existingEpisode?._count.cards ?? 0;
    const sourceNeedsRecheck = existingEpisode
      ? shouldRecheckEpisodeSource(existingEpisode, input.now, input.minIntervalMs)
      : false;
    const hasRemoteCards = episode.card_count == null || episode.card_count > 0;
    const missingCards =
      episode.card_count == null
        ? (localCardCount === 0 ? 1 : 0)
        : Math.max(episode.card_count - localCardCount, 0);

    if (isNewEpisode) {
      newEpisodes += 1;
    }

    if (!hasRemoteCards && !sourceNeedsRecheck) {
      continue;
    }

    if (isNewEpisode || localCardCount === 0 || missingCards > 0 || sourceNeedsRecheck) {
      candidates.push({
        ...episode,
        isNewEpisode,
        localCardCount,
        missingCards,
        sourceNeedsRecheck,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.isNewEpisode !== b.isNewEpisode) {
      return a.isNewEpisode ? -1 : 1;
    }

    if (a.sourceNeedsRecheck !== b.sourceNeedsRecheck) {
      return a.sourceNeedsRecheck ? -1 : 1;
    }

    const missingDiff = b.missingCards - a.missingCards;
    if (missingDiff !== 0) {
      return missingDiff;
    }

    const releaseDiff =
      new Date(b.release_date ?? 0).getTime() - new Date(a.release_date ?? 0).getTime();
    if (releaseDiff !== 0) {
      return releaseDiff;
    }

    return a.name.localeCompare(b.name);
  });

  return {
    selectedEpisodes: candidates.slice(0, input.maxEpisodes),
    candidateEpisodes: candidates.length,
    newEpisodes,
  };
}

export async function selectAutoCatalogSyncBatch(input: {
  now: Date;
  minIntervalMs: number;
  maxEpisodes: number;
  fetchRemoteEpisodes: () => Promise<NormalizedEpisode[]>;
  game?: TradingCardGame;
}): Promise<AutoCatalogSyncSelection> {
  const game = input.game ?? POKEMON_GAME;
  const [visibleLocalEpisodes, lastRemoteCatalogCheckedAt] = await Promise.all([
    loadVisibleAutoCatalogLocalEpisodes(game),
    getLastAutoCatalogCheckedAt(game),
  ]);

  if (
    !shouldRunAutoCatalogSync(
      visibleLocalEpisodes,
      input.now,
      input.minIntervalMs,
      lastRemoteCatalogCheckedAt
    )
  ) {
    return createEmptyAutoCatalogSyncSelection();
  }

  const remoteEpisodes = await input.fetchRemoteEpisodes();
  await markAutoCatalogCheckedAt([game], input.now);

  return {
    remoteEpisodes,
    ...planAutoCatalogSyncFromEpisodes({
      remoteEpisodes,
      localEpisodes: visibleLocalEpisodes,
      now: input.now,
      maxEpisodes: input.maxEpisodes,
      minIntervalMs: input.minIntervalMs,
    }),
  };
}

export async function upsertVisibleRemoteEpisodes(
  remoteEpisodes: NormalizedEpisode[]
): Promise<void> {
  const visibleEpisodes = remoteEpisodes.filter(
    (episode) => !isHiddenExpansion(episode) && !isRedundantSubsetExpansion(episode.name)
  );

  if (visibleEpisodes.length === 0) {
    return;
  }

  const existingEpisodes = await db.episode.findMany({
    where: {
      id: {
        in: visibleEpisodes.map((episode) => episode.id),
      },
    },
    select: {
      id: true,
      card_count: true,
    },
  });
  const existingEpisodeMap = new Map(existingEpisodes.map((episode) => [episode.id, episode]));

  await db.$transaction(
    visibleEpisodes.map((episode) =>
      db.episode.upsert({
        where: { id: episode.id },
        create: episode,
        update: {
          game: episode.game,
          name: episode.name,
          code: episode.code,
          release_date: episode.release_date,
          card_count: mergeKnownEpisodeCardCount(
            existingEpisodeMap.get(episode.id)?.card_count,
            episode.card_count
          ),
          logo_url: episode.logo_url,
          symbol_url: episode.symbol_url,
          series: episode.series,
        },
      })
    )
  );
}
