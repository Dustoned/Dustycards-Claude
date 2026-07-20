import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  assertSnapshotIsSanitized,
  sanitizeAppSnapshot,
} from "./snapshot-sanitizer.mjs";

describe("app snapshot sanitation", () => {
  it("removes accounts and private/operational rows while retaining public market data", () => {
    const db = new Database(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT);
      CREATE TABLE "Session" (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
      );
      CREATE TABLE "CollectionWant" (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL
      );
      CREATE TABLE "CardPriceAlert" (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL
      );
      CREATE TABLE "SocialConnection" (
        id TEXT PRIMARY KEY,
        requester_id TEXT REFERENCES "User"(id) ON DELETE CASCADE,
        addressee_id TEXT REFERENCES "User"(id) ON DELETE CASCADE,
        user_a_id TEXT REFERENCES "User"(id) ON DELETE CASCADE,
        user_b_id TEXT REFERENCES "User"(id) ON DELETE CASCADE
      );
      CREATE TABLE "AppSetting" (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE "SyncJob" (id TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE "FirecrawlCreditLedger" (id TEXT PRIMARY KEY, details_json TEXT);
      CREATE TABLE "Card" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        submitted_by_user_id TEXT
      );
      CREATE TABLE "Price" (id TEXT PRIMARY KEY, card_id TEXT, price REAL);

      INSERT INTO "User" VALUES ('private-user', 'private@example.test', 'do-not-ship');
      INSERT INTO "Session" VALUES ('session', 'private-user');
      INSERT INTO "CollectionWant" VALUES ('want', 'private-user', 'card-1');
      INSERT INTO "CardPriceAlert" VALUES ('alert', 'private-user', 'card-1');
      INSERT INTO "SocialConnection" VALUES (
        'social', 'private-user', 'private-user', 'private-user', 'private-user'
      );
      INSERT INTO "AppSetting" VALUES ('internal', 'private');
      INSERT INTO "SyncJob" VALUES ('sync', 'running');
      INSERT INTO "FirecrawlCreditLedger" VALUES ('credit', '{"secret":true}');
      INSERT INTO "Card" VALUES ('card-1', 'Public card', 'private-user');
      INSERT INTO "Price" VALUES ('price-1', 'card-1', 42.50);
    `);

    const result = sanitizeAppSnapshot(db);

    expect(result.removedRows.User).toBe(1);
    expect(result.clearedReferences["Card.submitted_by_user_id"]).toBe(1);
    expect(() => assertSnapshotIsSanitized(db)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "Session"').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "CollectionWant"').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "AppSetting"').get().count).toBe(0);
    expect(db.prepare('SELECT name FROM "Card" WHERE id = ?').get("card-1").name).toBe(
      "Public card"
    );
    expect(db.prepare('SELECT price FROM "Price" WHERE id = ?').get("price-1").price).toBe(
      42.5
    );
    expect(
      db.prepare('SELECT submitted_by_user_id FROM "Card" WHERE id = ?').get("card-1")
        .submitted_by_user_id
    ).toBeNull();
    expect(db.pragma("foreign_key_check")).toEqual([]);

    db.close();
  });

  it("is compatible with an older snapshot schema that lacks newer private tables", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT);
      CREATE TABLE "Card" (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO "User" VALUES ('old-test', 'old@example.test', 'hash');
      INSERT INTO "Card" VALUES ('card-1', 'Still public');
    `);

    expect(() => sanitizeAppSnapshot(db)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "Card"').get().count).toBe(1);
    db.close();
  });
});
