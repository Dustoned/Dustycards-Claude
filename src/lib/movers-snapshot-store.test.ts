import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionMoversData } from "@/lib/movers";
import {
  readMoversSnapshot,
  writeMoversSnapshot,
  type MoversSnapshotKey,
} from "@/lib/movers-snapshot-store";

let snapshotRoot = "";

const snapshotKey: MoversSnapshotKey = {
  userId: "snapshot-test-user",
  game: "pokemon",
  source: "cm_en",
  scope: "all",
  itemScope: "all",
};

const emptyMoversData: CollectionMoversData = {
  scope: "all",
  preferredSource: "cm_en",
  trackedCards: 0,
  eligibleCards: 0,
  movers: [],
  topOpportunities: [],
  cheapestHighRarityMovers: [],
  discountedHighRarity: [],
  suddenDropDeals: [],
  strongest7d: null,
  strongest30d: null,
};

describe("Movers durable snapshot store", () => {
  beforeEach(async () => {
    snapshotRoot = await mkdtemp(path.join(tmpdir(), "dustycards-movers-"));
    vi.spyOn(process, "cwd").mockReturnValue(snapshotRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(snapshotRoot, { recursive: true, force: true });
  });

  it("writes the current version and rejects the previous snapshot version", async () => {
    const writtenAt = new Date("2026-08-11T12:00:00.000Z");
    await writeMoversSnapshot(snapshotKey, emptyMoversData, writtenAt);

    const directory = path.join(snapshotRoot, "data", "movers-snapshots");
    const [fileName] = await readdir(directory);
    const filePath = path.join(directory, fileName);
    const stored = JSON.parse(await readFile(filePath, "utf8")) as {
      version: number;
      writtenAt: string;
      data: CollectionMoversData;
    };

    expect(stored.version).toBe(2);
    expect((await readMoversSnapshot(snapshotKey))?.writtenAt).toBe(writtenAt.toISOString());

    await writeFile(filePath, JSON.stringify({ ...stored, version: 1 }), "utf8");
    expect(await readMoversSnapshot(snapshotKey)).toBeNull();
  });
});
