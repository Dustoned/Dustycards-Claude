import BetterSqlite3 from "better-sqlite3";
import { LIVE_DB_PATH } from "@/lib/db-paths";
import { syncPromoOrigins } from "@/lib/promo-origin-sync";

const database = new BetterSqlite3(LIVE_DB_PATH, { timeout: 5_000 });
database.pragma("journal_mode = WAL");
database.pragma("busy_timeout = 5000");

try {
  const summary = await syncPromoOrigins(database, { force: process.argv.includes("--force") });
  console.log(JSON.stringify(summary));
  if (summary.status === "partial") process.exitCode = 1;
} finally {
  database.close();
}
