import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  syncJob: { findUnique: vi.fn() },
  syncLog: { findFirst: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
import {
  getFastSuddenDropCoveredDays,
  getFastSuddenDropsData,
  normalizeFastSuddenDropRefreshWindow,
} from "./home-sudden-drops-server";

afterEach(() => {
  vi.clearAllMocks();
});

describe("getFastSuddenDropCoveredDays", () => {
  it("measures the actual latest-to-anchor window", () => {
    expect(
      getFastSuddenDropCoveredDays("2026-07-08T09:00:00.000Z", "2026-07-03T09:00:00.000Z")
    ).toBe(5);
  });

  it("uses at least one day for same-day snapshots", () => {
    expect(
      getFastSuddenDropCoveredDays("2026-07-08T09:00:00.000Z", "2026-07-08T08:00:00.000Z")
    ).toBe(1);
  });

  it("returns null for missing, invalid, or inverted dates", () => {
    expect(getFastSuddenDropCoveredDays(null, "2026-07-08T09:00:00.000Z")).toBeNull();
    expect(getFastSuddenDropCoveredDays("nope", "2026-07-08T09:00:00.000Z")).toBeNull();
    expect(
      getFastSuddenDropCoveredDays("2026-07-08T09:00:00.000Z", "2026-07-09T09:00:00.000Z")
    ).toBeNull();
  });
});

describe("normalizeFastSuddenDropRefreshWindow", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");

  it("keeps the latest daily refresh window", () => {
    const result = normalizeFastSuddenDropRefreshWindow(
      {
        startedAt: "2026-07-10T09:00:00.000Z",
        finishedAt: "2026-07-10T09:30:00.000Z",
        status: "success",
      },
      now
    );

    expect(result?.startedAt.toISOString()).toBe("2026-07-10T09:00:00.000Z");
    expect(result?.finishedAt?.toISOString()).toBe("2026-07-10T09:30:00.000Z");
  });

  it("drops stale refresh windows so old deals cannot remain pinned", () => {
    expect(
      normalizeFastSuddenDropRefreshWindow(
        {
          startedAt: "2026-07-06T09:00:00.000Z",
          finishedAt: "2026-07-06T09:30:00.000Z",
          status: "success",
        },
        now
      )
    ).toBeNull();
  });
});

describe("getFastSuddenDropsData", () => {
  it("keeps only drops introduced by the latest refresh", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE "Episode" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        release_date TEXT
      );
      CREATE TABLE "Card" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        image_url TEXT,
        card_number TEXT,
        rarity TEXT,
        episode_id TEXT NOT NULL,
        game TEXT NOT NULL
      );
      CREATE TABLE "Price" (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        changed_at TEXT,
        cm_en_lowest_nm REAL,
        cm_de_lowest_nm REAL,
        cm_fr_lowest_nm REAL,
        cm_es_lowest_nm REAL,
        cm_it_lowest_nm REAL,
        cm_jp_lowest_nm REAL,
        cm_en_avg_30d REAL,
        cm_en_avg_7d REAL,
        tcp_market REAL,
        tcp_mid REAL,
        tcp_low REAL
      );
    `);

    const now = Date.now();
    const refreshStartedAt = new Date(now - 60 * 60 * 1000);
    const refreshFinishedAt = new Date(now - 30 * 60 * 1000);
    const currentSnapshotAt = new Date(now - 45 * 60 * 1000).toISOString();
    const previousSnapshotAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const olderSnapshotAt = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    sqlite.prepare(
      `INSERT INTO "Episode" (id, name, code, release_date) VALUES (?, ?, ?, ?)`
    ).run("episode-1", "Test Set", "TST", "2020-01-01T00:00:00.000Z");
    const insertCard = sqlite.prepare(
      `INSERT INTO "Card" (id, name, card_number, rarity, episode_id, game)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insertCard.run("new-drop", "New Drop", "001", "Rare", "episode-1", "pokemon");
    insertCard.run("old-drop", "Old Drop", "002", "Rare", "episode-1", "pokemon");

    const insertPrice = sqlite.prepare(
      `INSERT INTO "Price" (id, card_id, fetched_at, changed_at, cm_en_lowest_nm)
       VALUES (?, ?, ?, ?, ?)`
    );
    insertPrice.run("new-before", "new-drop", previousSnapshotAt, previousSnapshotAt, 150);
    insertPrice.run("new-after", "new-drop", currentSnapshotAt, currentSnapshotAt, 90);
    insertPrice.run("old-high", "old-drop", olderSnapshotAt, olderSnapshotAt, 150);
    insertPrice.run("old-low", "old-drop", currentSnapshotAt, previousSnapshotAt, 90);

    dbMock.syncJob.findUnique.mockResolvedValue({
      status: "success",
      started_at: refreshStartedAt,
      finished_at: refreshFinishedAt,
    });
    dbMock.$queryRawUnsafe.mockImplementation((sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params)
    );

    try {
      const result = await getFastSuddenDropsData("cm_en", "pokemon");

      expect(result.items.map((item) => item.cardId)).toEqual(["new-drop"]);
      expect(result.items[0]?.change7d).toBe(-60);
      expect(result.refresh?.startedAt).toBe(refreshStartedAt.toISOString());
    } finally {
      sqlite.close();
    }
  });
});
