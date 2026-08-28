import "server-only";

import { db } from "@/lib/db";
import type { ExternalCatalystDiscoveryCandidate } from "@/lib/external-radar-catalyst-discovery";
import type { CatalystWatchTopic } from "@/lib/external-radar-catalysts-core";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import {
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
} from "@/lib/games";

const VERSION_SUFFIX = /\s*\((?:v\.?\s*\d+|version\s*\d+|alt(?:ernate)?\s*art)\)\s*$/i;
const POKEMON_MECHANIC_SUFFIX =
  /(?:\s*[- ]?(?:ex|gx|vmax|vstar|v-union|v|break|lv\.?x|prime|star|radiant))\s*$/i;

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function addAlias(target: Set<string>, value: string, original: string): void {
  const alias = compact(value);
  if (alias.length >= 3 && alias.toLowerCase() !== original.toLowerCase()) target.add(alias);
}

/**
 * Produces character/species aliases without using local price movement. One
 * reveal can therefore fan out to older variants of the same subject while an
 * exact printed card name remains the strongest match.
 */
export function getExternalEventAliases(game: TradingCardGame, rawName: string): string[] {
  const original = compact(rawName);
  const aliases = new Set<string>();
  const withoutVersion = compact(original.replace(VERSION_SUFFIX, ""));
  addAlias(aliases, withoutVersion, original);

  if (game === "pokemon") {
    const withoutMechanic = compact(withoutVersion.replace(POKEMON_MECHANIC_SUFFIX, ""));
    addAlias(aliases, withoutMechanic, original);

    const withoutMega = compact(withoutMechanic.replace(/^(?:mega|m)\s+/i, ""));
    addAlias(aliases, withoutMega, original);

    for (const member of withoutMechanic.split(/\s+(?:&|and)\s+/i)) {
      addAlias(aliases, member, original);
    }
  }

  return [...aliases];
}

export function getExternalEntityKey(game: TradingCardGame, rawName: string): string {
  const aliases = getExternalEventAliases(game, rawName);
  const preferred = aliases.at(-1) ?? compact(rawName.replace(VERSION_SUFFIX, ""));
  const normalized = preferred
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${game}:${normalized || "unknown"}`;
}

export async function loadExternalEventCandidates(
  games: readonly TradingCardGame[]
): Promise<ExternalCatalystDiscoveryCandidate[]> {
  if (!games.length) return [];
  const rows = await db.card.findMany({
    where: { game: { in: [...games] } },
    select: {
      id: true,
      game: true,
      name: true,
      episode: { select: { name: true, code: true } },
    },
    orderBy: [{ game: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => ({
    cardId: row.id,
    game: row.game === "one-piece" ? "one-piece" : "pokemon",
    name: row.name,
    episodeName: row.episode.name,
    episodeCode: row.episode.code,
    aliases: getExternalEventAliases(
      row.game === "one-piece" ? "one-piece" : "pokemon",
      row.name
    ),
  }));
}

export async function loadExternalEventWatchTopics(
  games: readonly TradingCardGame[],
  now = new Date()
): Promise<CatalystWatchTopic[]> {
  if (!games.length) return [];
  const from = new Date(now.getTime() - 45 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const through = new Date(now.getTime() + 400 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const lifecycleThrough = new Date(now.getTime() - 18 * 30.4375 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const [releaseRows, lifecycleRows] = await Promise.all([
    db.episode.findMany({
      where: {
        game: { in: [...games] },
        release_date: { gte: from, lte: through },
      },
      orderBy: [{ release_date: "asc" }, { name: "asc" }],
      select: { id: true, game: true, name: true, code: true, release_date: true },
    }),
    db.episode.findMany({
      where: {
        game: { in: [...games] },
        release_date: { lte: lifecycleThrough },
      },
      orderBy: [{ release_date: "asc" }, { name: "asc" }],
      select: { id: true, game: true, name: true, code: true, release_date: true },
    }),
  ]);
  const seen = new Set<string>();
  const topics: CatalystWatchTopic[] = [];
  for (const rawGame of games) {
    const game: TradingCardGame = rawGame === "one-piece" ? "one-piece" : "pokemon";
    const today = now.toISOString().slice(0, 10);
    const gameReleaseRows = releaseRows.filter((row) => row.game === game);
    const releases = [
      ...gameReleaseRows.filter((row) => (row.release_date ?? "") >= today),
      ...gameReleaseRows
        .filter((row) => (row.release_date ?? "") < today)
        .sort((left, right) => (right.release_date ?? "").localeCompare(left.release_date ?? "")),
    ].slice(0, 2);
    for (const row of releases) {
      const key = `${game}:${row.name.trim().toLowerCase()}`;
      if (!row.name.trim() || seen.has(key)) continue;
      seen.add(key);
      topics.push({
        game,
        episodeId: row.id,
        name: row.name.trim(),
        setCode: row.code,
        focus: "release",
      });
    }

    // Rotate one mature set per game through the same bounded daily query
    // budget. Over time every relevant set gets an OOP/reprint check, without
    // adding a per-card crawl or increasing MAX_CATALYST_SEARCH_QUERIES.
    const mature = lifecycleRows.filter((row) => row.game === game);
    if (mature.length) {
      const dayBucket = Math.floor(now.getTime() / (24 * 60 * 60_000));
      const row = mature[dayBucket % mature.length];
      const key = `${game}:${row.name.trim().toLowerCase()}`;
      if (row.name.trim() && !seen.has(key)) {
        seen.add(key);
        topics.push({
          game,
          episodeId: row.id,
          name: row.name.trim(),
          setCode: row.code,
          focus: "lifecycle",
        });
      }
    }
  }
  return topics;
}

export function mergeExternalEventCandidates(
  signals: readonly ExternalCardSignal[],
  universe: readonly ExternalCatalystDiscoveryCandidate[]
): ExternalCatalystDiscoveryCandidate[] {
  const byCard = new Map<string, ExternalCatalystDiscoveryCandidate>();
  for (const candidate of universe) byCard.set(candidate.cardId, candidate);
  for (const signal of signals) {
    if (signal.game !== POKEMON_GAME && signal.game !== ONE_PIECE_GAME) continue;
    const universeCandidate = byCard.get(signal.cardId);
    byCard.set(signal.cardId, {
      ...universeCandidate,
      cardId: signal.cardId,
      game: signal.game,
      name: signal.name,
      episodeName: signal.episodeName,
      episodeCode: signal.episodeCode,
      aliases:
        universeCandidate?.aliases ?? getExternalEventAliases(signal.game, signal.name),
      rank: signal.rank,
      externalScore: signal.externalScore,
    });
  }
  return [...byCard.values()];
}
