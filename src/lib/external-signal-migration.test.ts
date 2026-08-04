import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("external signal storage migration", () => {
  it("applies cleanly to SQLite with all dedupe and outcome tables", () => {
    const migrations = [
      "20260712190000_add_external_signal_forecasts",
      "20260712193000_add_external_signal_competitive_score",
      "20260804143000_add_external_signal_daily_prices",
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
          "ExternalSignalPriceObservation",
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

  it("backfills the latest verifiable quote for every card, source and UTC day", () => {
    const baseSql = [
      "20260712190000_add_external_signal_forecasts",
      "20260712193000_add_external_signal_competitive_score",
    ]
      .map((migration) =>
        fs.readFileSync(
          path.join(process.cwd(), "prisma", "migrations", migration, "migration.sql"),
          "utf8"
        )
      )
      .join("\n");
    const dailyPriceSql = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260804143000_add_external_signal_daily_prices",
        "migration.sql"
      ),
      "utf8"
    );
    const database = new BetterSqlite3(":memory:");
    try {
      database.exec(baseSql);
      const insertRun = database.prepare(
        `INSERT INTO "ExternalSignalRun"
          ("id", "kind", "status", "generated_at")
         VALUES (?, 'competitive', 'success', ?)`
      );
      insertRun.run("run-early", "2026-07-12 06:00:00");
      insertRun.run("run-late", "2026-07-12 18:00:00");
      insertRun.run("run-next-day", "2026-07-13 06:00:00");
      const insertObservation = database.prepare(
        `INSERT INTO "ExternalSignalObservation" (
          "id", "run_id", "card_id", "game", "card_name", "model_version",
          "reference_source", "reference_price", "reference_price_at",
          "external_score", "confidence", "pressure_label", "currency",
          "max_deck_share_percent", "max_inclusion_percent", "archetype_count",
          "reasons_json", "evidence_json", "observed_at"
        ) VALUES (?, ?, 'card-1', 'pokemon', 'Shaymin-EX', 'v9-calibrated-inputs',
          'cardmarket:avg7d', ?, ?, 80, 'Strong', 'Breakout', 'EUR',
          10, 80, 3, '[]', '[]', ?)`
      );
      insertObservation.run(
        "observation-early",
        "run-early",
        44,
        "2026-07-12 05:55:00",
        "2026-07-12 06:00:00"
      );
      insertObservation.run(
        "observation-late",
        "run-late",
        46,
        "2026-07-12 17:55:00",
        "2026-07-12 18:00:00"
      );
      insertObservation.run(
        "observation-next-day",
        "run-next-day",
        50,
        "2026-07-13 05:55:00",
        "2026-07-13 06:00:00"
      );

      database.exec(dailyPriceSql);

      const rows = database
        .prepare(
          `SELECT "reference_price", "source_price_at", "observed_at", "observed_day", "provenance"
           FROM "ExternalSignalPriceObservation"
           ORDER BY "observed_day"`
        )
        .all();
      expect(rows).toEqual([
        {
          reference_price: 46,
          source_price_at: "2026-07-12 17:55:00",
          observed_at: "2026-07-12 18:00:00",
          observed_day: "2026-07-12",
          provenance: "signal-scan-backfill",
        },
        {
          reference_price: 50,
          source_price_at: "2026-07-13 05:55:00",
          observed_at: "2026-07-13 06:00:00",
          observed_day: "2026-07-13",
          provenance: "signal-scan-backfill",
        },
      ]);
    } finally {
      database.close();
    }
  });
});
