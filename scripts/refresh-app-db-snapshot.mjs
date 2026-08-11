import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSnapshotIsSanitized,
  sanitizeAppSnapshot,
} from "./snapshot-sanitizer.mjs";
import { prunePriceHistoryForSnapshot } from "./snapshot-price-pruner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LIVE_DB_PATH = resolve(__dirname, "../dustycards.db");
const SNAPSHOT_DB_PATH = resolve(__dirname, "../data/dustycards.app.db");

function refreshCurrentGradedSnapshots(db) {
  db.exec(`
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
  const sanitation = sanitizeAppSnapshot(db);
  prunePriceHistoryForSnapshot(db);
  refreshCurrentGradedSnapshots(db);
  db.pragma("foreign_keys = ON");
  assertSnapshotIsSanitized(db);

  const quickCheck = db.pragma("quick_check", { simple: true });
  if (quickCheck !== "ok") {
    throw new Error(`App snapshot quick_check failed: ${quickCheck}`);
  }

  db.exec("VACUUM");

  const removedPrivateRows = Object.values(sanitation.removedRows).reduce(
    (total, count) => total + count,
    0
  );
  console.log(`Removed ${removedPrivateRows} private/operational rows from app snapshot.`);
} finally {
  db.close();
}

console.log(`App snapshot refreshed at ${SNAPSHOT_DB_PATH}`);
