import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("external signal storage migration", () => {
  it("applies cleanly to SQLite with all dedupe and outcome tables", () => {
    const migrations = [
      "20260712190000_add_external_signal_forecasts",
      "20260712193000_add_external_signal_competitive_score",
    ];
    const sql = migrations
      .map((migration) =>
        fs.readFileSync(
          path.join(process.cwd(), "prisma", "migrations", migration, "migration.sql"),
          "utf8"
        )
      )
      .join("\n");
    const database = new BetterSqlite3(":memory:");
    try {
      database.pragma("foreign_keys = ON");
      database.exec(sql);
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tables).toEqual(
        expect.arrayContaining([
          "ExternalSignalRun",
          "ExternalSignalObservation",
          "ExternalSignalOutcome",
          "ExternalCatalystSource",
          "ExternalCardCatalyst",
          "FirecrawlCreditLedger",
        ])
      );
      expect(database.pragma("foreign_key_check")).toEqual([]);
      expect(
        database
          .prepare("PRAGMA table_info('ExternalSignalObservation')")
          .all()
          .some((row) => (row as { name: string }).name === "competitive_score")
      ).toBe(true);
    } finally {
      database.close();
    }
  });
});
