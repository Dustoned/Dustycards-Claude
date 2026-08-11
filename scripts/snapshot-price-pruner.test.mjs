import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { prunePriceHistoryForSnapshot } from "./snapshot-price-pruner.mjs";

describe("snapshot Price pruning", () => {
  it("retains independent CardMarket, TCGPlayer and auxiliary observations", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE "Price" (
        "id" TEXT PRIMARY KEY,
        "card_id" TEXT NOT NULL,
        "fetched_at" TEXT NOT NULL,
        "cm_en_lowest_nm" REAL,
        "cm_de_lowest_nm" REAL,
        "cm_fr_lowest_nm" REAL,
        "cm_es_lowest_nm" REAL,
        "cm_it_lowest_nm" REAL,
        "cm_jp_lowest_nm" REAL,
        "cm_en_avg_7d" REAL,
        "cm_en_avg_30d" REAL,
        "tcp_market" REAL,
        "tcp_mid" REAL,
        "tcp_low" REAL
      );

      INSERT INTO "Price" VALUES
        ('obsolete', 'card-1', '2026-08-01T00:00:00Z', 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ('tcg-and-aux', 'card-1', '2026-08-08T00:00:00Z', NULL, 8, NULL, NULL, NULL, NULL, 9, 10, 12, 13, 11),
        ('cm-direct', 'card-1', '2026-08-09T00:00:00Z', 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ('latest-empty', 'card-1', '2026-08-10T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    `);

    prunePriceHistoryForSnapshot(db);

    const ids = db
      .prepare('SELECT "id" FROM "Price" ORDER BY "id"')
      .all()
      .map((row) => row.id);
    expect(ids).toEqual(["cm-direct", "latest-empty", "tcg-and-aux"]);
    db.close();
  });

  it("retains only the newest row when no market has a valid quote", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE "Price" (
        "id" TEXT PRIMARY KEY,
        "card_id" TEXT NOT NULL,
        "fetched_at" TEXT NOT NULL,
        "cm_en_lowest_nm" REAL,
        "cm_de_lowest_nm" REAL,
        "cm_fr_lowest_nm" REAL,
        "cm_es_lowest_nm" REAL,
        "cm_it_lowest_nm" REAL,
        "cm_jp_lowest_nm" REAL,
        "cm_en_avg_7d" REAL,
        "cm_en_avg_30d" REAL,
        "tcp_market" REAL,
        "tcp_mid" REAL,
        "tcp_low" REAL
      );
      INSERT INTO "Price" VALUES
        ('old-empty', 'card-1', '2026-08-01T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ('new-empty', 'card-1', '2026-08-02T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    `);

    prunePriceHistoryForSnapshot(db);
    expect(db.prepare('SELECT "id" FROM "Price"').all()).toEqual([{ id: "new-empty" }]);
    db.close();
  });
});
