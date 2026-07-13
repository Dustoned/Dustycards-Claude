import "server-only";

import { db } from "@/lib/db";
import type { ExternalCatalystDiscoveryCandidate } from "@/lib/external-radar-catalyst-discovery";
import type { CatalystWatchTopic } from "@/lib/external-radar-catalysts-core";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import type { TradingCardGame } from "@/lib/games";

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
  const rows = await db.episode.findMany({
    where: {
      game: { in: [...games] },
      release_date: { gte: from, lte: through },
    },
    orderBy: [{ release_date: "asc" }, { name: "asc" }],
    take: 24,
    select: { game: true, name: true, code: true },
  });
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const game: TradingCardGame = row.game === "one-piece" ? "one-piece" : "pokemon";
    const key = `${game}:${row.name.trim().toLowerCase()}`;
    if (!row.name.trim() || seen.has(key)) return [];
    seen.add(key);
    return [{ game, name: row.name.trim(), setCode: row.code }];
  });
}

export function mergeExternalEventCandidates(
  signals: readonly ExternalCardSignal[],
  universe: readonly ExternalCatalystDiscoveryCandidate[]
): ExternalCatalystDiscoveryCandidate[] {
  const byCard = new Map<string, ExternalCatalystDiscoveryCandidate>();
  for (const candidate of universe) byCard.set(candidate.cardId, candidate);
  for (const signal of signals) {
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
