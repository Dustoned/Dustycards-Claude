import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
import {
  getFastSuddenDropCoveredDays,
  getFastSuddenDropsData,
  getFastSuddenDropRollingWindow,
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

describe("getFastSuddenDropRollingWindow", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");

  it("always covers the rolling previous 24 hours", () => {
    const result = getFastSuddenDropRollingWindow(now);

    expect(result.startedAt.toISOString()).toBe("2026-07-09T12:00:00.000Z");
    expect(result.finishedAt?.toISOString()).toBe(now.toISOString());
    expect(result.status).toBe("rolling");
  });
});

describe("getFastSuddenDropsData", () => {
  it("keeps only drops introduced in the rolling 24-hour window", async () => {
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
    const currentSnapshotAt = new Date(now - 45 * 60 * 1000).toISOString();
    const previousSnapshotAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const staleChangedAt = new Date(now - 25 * 60 * 60 * 1000).toISOString();
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
    insertCard.run("moderate-drop", "Moderate Drop", "003", "Rare", "episode-1", "pokemon");
    insertCard.run("absolute-drop", "Absolute Drop", "004", "Rare", "episode-1", "pokemon");
    insertCard.run(
      "large-absolute-drop",
      "Large Absolute Drop",
      "005",
      "Rare",
      "episode-1",
      "pokemon"
    );

    const insertPrice = sqlite.prepare(
      `INSERT INTO "Price" (id, card_id, fetched_at, changed_at, cm_en_lowest_nm)
       VALUES (?, ?, ?, ?, ?)`
    );
    insertPrice.run("new-before", "new-drop", previousSnapshotAt, previousSnapshotAt, 150);
    insertPrice.run("new-after", "new-drop", currentSnapshotAt, currentSnapshotAt, 90);
    insertPrice.run("old-high", "old-drop", olderSnapshotAt, olderSnapshotAt, 150);
    insertPrice.run("old-low", "old-drop", currentSnapshotAt, staleChangedAt, 90);
    insertPrice.run("moderate-before", "moderate-drop", previousSnapshotAt, previousSnapshotAt, 40);
    insertPrice.run("moderate-after", "moderate-drop", currentSnapshotAt, currentSnapshotAt, 32);
    insertPrice.run("absolute-before", "absolute-drop", previousSnapshotAt, previousSnapshotAt, 1000);
    insertPrice.run("absolute-after", "absolute-drop", currentSnapshotAt, currentSnapshotAt, 994);
    insertPrice.run(
      "large-absolute-before",
      "large-absolute-drop",
      previousSnapshotAt,
      previousSnapshotAt,
      1000
    );
    insertPrice.run(
      "large-absolute-after",
      "large-absolute-drop",
      currentSnapshotAt,
      currentSnapshotAt,
      940
    );

    dbMock.$queryRawUnsafe.mockImplementation((sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params)
    );

    try {
      const result = await getFastSuddenDropsData("cm_en", "pokemon");
      const fullPageResult = await getFastSuddenDropsData("cm_en", "pokemon", 50, {
        minimumAmount: 50,
        minimumPercent: null,
      });

      expect(result.items.map((item) => item.cardId)).toEqual([
        "new-drop",
        "large-absolute-drop",
        "moderate-drop",
      ]);
      expect(result.items[0]?.change7d).toBe(-60);
      expect(result.preview.threshold).toBe(5);
      expect(result.refresh?.status).toBe("rolling");
      expect(fullPageResult.items.map((item) => item.cardId)).toEqual([
        "new-drop",
        "large-absolute-drop",
      ]);
      expect(fullPageResult.preview.threshold).toBe(50);
    } finally {
      sqlite.close();
    }
  });

  it("compares the displayed CardMarket English price without replacing it with an average", async () => {
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
    const currentSnapshotAt = new Date(now - 45 * 60 * 1000).toISOString();
    const previousSnapshotAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    sqlite.prepare(
      `INSERT INTO "Episode" (id, name, code, release_date) VALUES (?, ?, ?, ?)`
    ).run("eb03", "Heroines Edition", "EB03", "2026-01-01T00:00:00.000Z");
    sqlite.prepare(
      `INSERT INTO "Card" (id, name, card_number, rarity, episode_id, game)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("uta", "Uta", "EB03-061", "Manga Rare", "eb03", "one-piece");
    sqlite.prepare(
      `INSERT INTO "Card" (id, name, card_number, rarity, episode_id, game)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("gliscor", "Gliscor", "DP36", "Promo", "eb03", "one-piece");
    const insertPrice = sqlite.prepare(
      `INSERT INTO "Price" (
        id, card_id, fetched_at, changed_at, cm_en_lowest_nm,
        cm_fr_lowest_nm, cm_en_avg_7d, cm_en_avg_30d
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertPrice.run(
      "uta-before",
      "uta",
      previousSnapshotAt,
      previousSnapshotAt,
      950,
      599.99,
      800.9,
      707.9
    );
    insertPrice.run(
      "uta-after",
      "uta",
      currentSnapshotAt,
      currentSnapshotAt,
      815,
      599.99,
      37.12,
      41.35
    );
    insertPrice.run(
      "gliscor-before",
      "gliscor",
      previousSnapshotAt,
      previousSnapshotAt,
      1500,
      2.5,
      3.13,
      3.26
    );
    insertPrice.run(
      "gliscor-after",
      "gliscor",
      currentSnapshotAt,
      currentSnapshotAt,
      7,
      2.5,
      2.46,
      3.21
    );

    dbMock.$queryRawUnsafe.mockImplementation((sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params)
    );

    try {
      const result = await getFastSuddenDropsData("cm_en", "one-piece");

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.cardId).toBe("uta");
      expect(result.items[0]?.currentPrice).toBe(815);
      expect(result.items[0]?.change7d).toBe(-135);
      expect(result.items.some((item) => item.cardId === "gliscor")).toBe(false);
    } finally {
      sqlite.close();
    }
  });
});
