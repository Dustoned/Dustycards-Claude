import { describe, expect, it } from "vitest";
import {
  JUST_RELEASED_SEALED_MAX_PER_TICK,
  SEALED_SYNC_GAMES,
  selectJustReleasedSealedCandidates,
} from "@/lib/sync/sealed-sync-scope";

const now = new Date("2026-09-06T12:00:00.000Z");

function episode(input: { id: string; releaseDate: string; game?: string; name?: string; code?: string | null }) {
  return {
    id: input.id,
    game: input.game ?? "pokemon",
    name: input.name ?? input.id,
    code: input.code ?? null,
    release_date: input.releaseDate,
  };
}

describe("sealed sync scope", () => {
  it("covers every automatically catalogued game, not only Pokémon", () => {
    expect([...SEALED_SYNC_GAMES]).toEqual(["pokemon", "pokemon-jp", "one-piece"]);
  });

  it("picks freshly released sets that still have no sealed products", () => {
    const candidates = selectJustReleasedSealedCandidates({
      episodes: [
        episode({ id: "op17", game: "one-piece", releaseDate: "2026-09-03" }),
        episode({ id: "old", releaseDate: "2026-08-10" }),
        episode({ id: "future", releaseDate: "2026-09-20" }),
        episode({ id: "tomorrow", releaseDate: "2026-09-07" }),
      ],
      lastChecks: {},
      now,
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual(["tomorrow", "op17"]);
  });

  it("re-checks a set only after the throttle window, and forgets stale checks", () => {
    const result = selectJustReleasedSealedCandidates({
      episodes: [
        episode({ id: "recent", releaseDate: "2026-09-04" }),
        episode({ id: "due", releaseDate: "2026-09-02" }),
      ],
      lastChecks: {
        recent: "2026-09-06T10:30:00.000Z",
        due: "2026-09-06T02:00:00.000Z",
        gone: "2026-07-01T00:00:00.000Z",
      },
      now,
    });

    expect(result.map((candidate) => candidate.id)).toEqual(["due"]);
  });

  it("skips hidden expansions and caps the batch", () => {
    const episodes = Array.from({ length: 8 }, (_, index) =>
      episode({ id: `set-${index}`, releaseDate: "2026-09-05" })
    );
    episodes.push(episode({ id: "hidden", code: "sve", releaseDate: "2026-09-05" }));

    const result = selectJustReleasedSealedCandidates({ episodes, lastChecks: {}, now });

    expect(result).toHaveLength(JUST_RELEASED_SEALED_MAX_PER_TICK);
    expect(result.some((candidate) => candidate.id === "hidden")).toBe(false);
  });
});
