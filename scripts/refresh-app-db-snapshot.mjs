import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LIVE_DB_PATH = resolve(__dirname, "../dustycards.db");
const SNAPSHOT_DB_PATH = resolve(__dirname, "../data/dustycards.app.db");
const TABLES_TO_CLEAR = [
  "CollectionCardTag",
  "CollectionCard",
  "CollectionSealedTag",
  "CollectionSealed",
  "CollectionBinder",
  "SyncLog",
  "ApiQuotaSnapshot",
];

function prunePriceHistoryForSnapshot(db) {
  db.exec(`
    DELETE FROM "Price"
    WHERE "id" NOT IN (
      SELECT "id"
      FROM (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "card_id"
            ORDER BY "fetched_at" DESC, "id" DESC
          ) AS "snapshot_rank"
        FROM "Price"
      )
      WHERE "snapshot_rank" = 1
    );

    DELETE FROM "CardGradedPriceSnapshot";
    INSERT INTO "CardGradedPriceSnapshot" ("id", "card_id", "label", "price", "fetched_at")
    SELECT
      'snapshot-' || "id",
      "card_id",
      "label",
      "price",
      "fetched_at"
    FROM "CardGradedPrice";

    DELETE FROM "CardEbaySoldGradedPriceSnapshot";
    INSERT INTO "CardEbaySoldGradedPriceSnapshot" (
      "id",
      "card_id",
      "source",
      "label",
      "company",
      "grade",
      "median_price",
      "currency",
      "sample_size",
      "fetched_at"
    )
    SELECT
      'snapshot-' || "id",
      "card_id",
      "source",
      "label",
      "company",
      "grade",
      "median_price",
      "currency",
      "sample_size",
      "fetched_at"
    FROM "CardEbaySoldGradedPrice";
  `);
}

if (!existsSync(LIVE_DB_PATH)) {
  throw new Error(`Live database not found at ${LIVE_DB_PATH}`);
}

mkdirSync(dirname(SNAPSHOT_DB_PATH), { recursive: true });

const liveDb = new Database(LIVE_DB_PATH, { readonly: true, fileMustExist: true });
await liveDb.backup(SNAPSHOT_DB_PATH);
liveDb.close();

const db = new Database(SNAPSHOT_DB_PATH);

try {
  db.pragma("foreign_keys = OFF");

  const clearTables = db.transaction(() => {
    for (const tableName of TABLES_TO_CLEAR) {
      db.prepare(`DELETE FROM "${tableName}"`).run();
    }
  });

  clearTables();
  prunePriceHistoryForSnapshot(db);
  db.pragma("foreign_keys = ON");
  db.exec("VACUUM");
} finally {
  db.close();
}

console.log(`App snapshot refreshed at ${SNAPSHOT_DB_PATH}`);
