import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import type { ExternalSignalRadarData } from "@/lib/external-signal-radar";
import {
  readSignalRadarChaseSnapshot,
  readSignalRadarSnapshot,
  scopeSignalRadarData,
  writeSignalRadarChaseSnapshot,
  writeSignalRadarSnapshots,
} from "@/lib/signal-radar-snapshot-store";

let snapshotRoot = "";

function radarData(): ExternalSignalRadarData {
  return {
    generatedAt: "2026-07-29T20:00:00.000Z",
    signals: [
      { cardId: "pokemon-1", game: "pokemon", rank: 1 },
      { cardId: "one-piece-1", game: "one-piece", rank: 2 },
      { cardId: "pokemon-2", game: "pokemon", rank: 3 },
    ] as ExternalSignalRadarData["signals"],
    sources: [
      { game: "pokemon", deckCount: 12 },
      { game: "one-piece", deckCount: 8 },
    ] as ExternalSignalRadarData["sources"],
    unmatchedCount: 4,
    scannedDeckCount: 20,
  };
}

describe("Signal Radar durable snapshot store", () => {
  beforeEach(async () => {
    snapshotRoot = await mkdtemp(path.join(tmpdir(), "dustycards-radar-"));
    vi.spyOn(process, "cwd").mockReturnValue(snapshotRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(snapshotRoot, { recursive: true, force: true });
  });

  it("writes and reloads all and game-scoped snapshots", async () => {
    await writeSignalRadarSnapshots(radarData(), new Date("2026-07-29T20:05:00.000Z"));
    const updated = {
      ...radarData(),
      generatedAt: "2026-07-29T20:04:00.000Z",
    };
    await writeSignalRadarSnapshots(updated, new Date("2026-07-29T20:06:00.000Z"));

    const all = await readSignalRadarSnapshot("all");
    const pokemon = await readSignalRadarSnapshot("pokemon");
    const onePiece = await readSignalRadarSnapshot("one-piece");

    expect(all?.data.signals).toHaveLength(3);
    expect(all?.data.generatedAt).toBe("2026-07-29T20:04:00.000Z");
    expect(pokemon?.writtenAt).toBe("2026-07-29T20:06:00.000Z");
    expect(pokemon?.data.signals.map((signal) => signal.cardId)).toEqual([
      "pokemon-1",
      "pokemon-2",
    ]);
    expect(onePiece?.data.signals.map((signal) => signal.cardId)).toEqual([
      "one-piece-1",
    ]);
  });

  it("reranks scoped cards and recalculates the deck total", () => {
    const scoped = scopeSignalRadarData(radarData(), "pokemon");

    expect(scoped.signals.map((signal) => signal.rank)).toEqual([1, 2]);
    expect(scoped.scannedDeckCount).toBe(12);
  });

  it("stores a set-specific Chase Watch snapshot separately", async () => {
    const key = { gameFilter: "pokemon" as const, episodeId: "set:with/slashes" };
    const chase = {
      generatedAt: "2026-07-29T20:00:00.000Z",
      cards: [{ cardId: "chase-1" }],
    } as ExpansionChaseRadarData;

    await writeSignalRadarChaseSnapshot(
      key,
      chase,
      new Date("2026-07-29T20:06:00.000Z")
    );
    const stored = await readSignalRadarChaseSnapshot(key);

    expect(stored?.writtenAt).toBe("2026-07-29T20:06:00.000Z");
    expect(stored?.data?.cards[0]?.cardId).toBe("chase-1");
  });
});
