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
  db.pragma("foreign_keys = ON");
  db.exec("VACUUM");
} finally {
  db.close();
}

console.log(`App snapshot refreshed at ${SNAPSHOT_DB_PATH}`);
