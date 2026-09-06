import { isHiddenExpansion } from "@/lib/episodes";
import { ONE_PIECE_GAME, POKEMON_GAME, POKEMON_JAPANESE_GAME } from "@/lib/games";

/**
 * Every game whose catalogue is synced automatically also gets its sealed
 * products synced. The bulk sealed sync used to walk Pokémon expansions only,
 * so One Piece and Japanese Pokémon sealed products never arrived.
 */
export const SEALED_SYNC_GAMES = [POKEMON_GAME, POKEMON_JAPANESE_GAME, ONE_PIECE_GAME] as const;

const DAY_MS = 24 * 60 * 60_000;
/** A set counts as "just released" from a day before until two weeks after release. */
export const JUST_RELEASED_SEALED_WINDOW_DAYS = 14;
export const JUST_RELEASED_SEALED_LOOKAHEAD_DAYS = 1;
/** The marketplace lists products hours to days after release; re-ask every six hours. */
export const JUST_RELEASED_SEALED_RECHECK_MS = 6 * 60 * 60_000;
export const JUST_RELEASED_SEALED_MAX_PER_TICK = 5;
export const JUST_RELEASED_SEALED_CHECK_RETENTION_MS = 30 * DAY_MS;
export const JUST_RELEASED_SEALED_CHECK_KEY = "sealed-release-check";

export interface JustReleasedSealedEpisode {
  id: string;
  game: string;
  name: string;
  code: string | null;
  release_date: string | null;
}

export type JustReleasedSealedChecks = Record<string, string>;

function releaseTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isFinite(time) ? time : null;
}

function checkTime(value: string | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * Picks the sets that were released recently, still have no sealed products
 * and were not asked about within the re-check window. Newest release first,
 * capped per scheduler tick so a release wave never burns the quota.
 */
export function selectJustReleasedSealedCandidates(input: {
  episodes: readonly JustReleasedSealedEpisode[];
  lastChecks: JustReleasedSealedChecks;
  now: Date;
}): JustReleasedSealedEpisode[] {
  const nowTime = input.now.getTime();
  const windowStart = nowTime - JUST_RELEASED_SEALED_WINDOW_DAYS * DAY_MS;
  const windowEnd = nowTime + JUST_RELEASED_SEALED_LOOKAHEAD_DAYS * DAY_MS;

  return input.episodes
    .filter((episode) => {
      if (isHiddenExpansion(episode)) return false;
      const released = releaseTime(episode.release_date);
      if (released == null || released < windowStart || released > windowEnd) return false;
      const checked = checkTime(input.lastChecks[episode.id]);
      return checked == null || nowTime - checked >= JUST_RELEASED_SEALED_RECHECK_MS;
    })
    .sort(
      (left, right) =>
        (releaseTime(right.release_date) ?? 0) - (releaseTime(left.release_date) ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, JUST_RELEASED_SEALED_MAX_PER_TICK);
}

/** Drops check timestamps that can no longer matter, keeping the setting small. */
export function pruneJustReleasedSealedChecks(
  lastChecks: JustReleasedSealedChecks,
  now: Date
): JustReleasedSealedChecks {
  const cutoff = now.getTime() - JUST_RELEASED_SEALED_CHECK_RETENTION_MS;
  return Object.fromEntries(
    Object.entries(lastChecks).filter(([, value]) => {
      const time = checkTime(value);
      return time != null && time >= cutoff;
    })
  );
}
