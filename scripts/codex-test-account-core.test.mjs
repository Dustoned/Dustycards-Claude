import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  CODEX_TEST_EMAIL,
  CODEX_TEST_ROLE,
  analyzeCodexTestAccounts,
  consolidateCodexTestAccounts,
  findNewForeignKeyViolations,
} from "./codex-test-account-core.mjs";

function createDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE "User" (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      disabled INTEGER NOT NULL DEFAULT 0,
      email_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE "Session" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
    );
    CREATE TABLE "CollectionBinder" (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES "User"(id) ON DELETE CASCADE,
      name TEXT
    );
    CREATE TABLE "CollectionCard" (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES "User"(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL
    );
    CREATE TABLE "CollectionSealed" (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES "User"(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL
    );
    CREATE TABLE "CollectionWant" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      UNIQUE(user_id, card_id)
    );
    CREATE TABLE "Card" (
      id TEXT PRIMARY KEY,
      submitted_by_user_id TEXT
    );
  `);
  return db;
}

function insertUser(db, id, email, role = "admin") {
  db.prepare(
    `INSERT INTO "User" (` +
      `id, email, password_hash, role, disabled, email_verified_at, created_at, updated_at` +
      `) VALUES (?, ?, 'old-hash', ?, 0, '2026-01-01', '2026-01-01', '2026-01-01')`
  ).run(id, email, role);
}

describe("Codex Test-account consolidation", () => {
  it("only classifies violations absent from the FK baseline as new", () => {
    const baseline = [
      { table: "Legacy", rowid: 1, parent: "Missing", fkid: 0 },
      { table: "Legacy", rowid: 2, parent: "Missing", fkid: 0 },
    ];

    expect(findNewForeignKeyViolations(baseline, [...baseline])).toEqual([]);
    expect(findNewForeignKeyViolations(baseline, [baseline[1]])).toEqual([]);
    expect(
      findNewForeignKeyViolations(baseline, [
        baseline[0],
        { table: "NewProblem", rowid: 3, parent: "User", fkid: 1 },
      ])
    ).toEqual([{ table: "NewProblem", rowid: 3, parent: "User", fkid: 1 }]);
  });

  it("allows an unchanged pre-existing FK violation while consolidating", () => {
    const db = createDatabase();
    insertUser(db, "legacy-a", "old-ui@example.test");
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE "LegacyBrokenReference" (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES "User"(id)
      );
      INSERT INTO "LegacyBrokenReference" VALUES ('broken-row', 'missing-user');
    `);
    db.pragma("foreign_keys = ON");
    expect(db.pragma("foreign_key_check")).toHaveLength(1);

    const result = consolidateCodexTestAccounts(db, {
      passwordHash: "scrypt$v1$test-salt$test-hash",
      now: "2026-07-20T12:00:00.000Z",
    });

    expect(result.removedAccounts).toBe(1);
    expect(result.baselineForeignKeyProblems).toBe(1);
    expect(result.remainingForeignKeyProblems).toBe(1);
    expect(db.pragma("foreign_key_check")).toHaveLength(1);
    expect(
      db.prepare('SELECT role FROM "User" WHERE email = ?').get(CODEX_TEST_EMAIL).role
    ).toBe("user");
    db.close();
  });

  it("migrates fixture ownership, removes legacy test users, and is idempotent", () => {
    const db = createDatabase();
    insertUser(db, "real-user", "real@example.com", "admin");
    insertUser(db, "legacy-a", "ui-audit-admin@example.test");
    insertUser(db, "legacy-b", "playwright-smoke-admin@example.test");
    db.exec(`
      INSERT INTO "CollectionBinder" VALUES ('binder', 'legacy-a', 'Fixture');
      INSERT INTO "CollectionCard" VALUES ('copy', 'legacy-a', 'card-1');
      INSERT INTO "CollectionSealed" VALUES ('sealed', 'legacy-a', 'product-1');
      INSERT INTO "CollectionWant" VALUES ('want-a', 'legacy-a', 'card-1');
      INSERT INTO "CollectionWant" VALUES ('want-b', 'legacy-b', 'card-2');
      INSERT INTO "Card" VALUES ('card-1', 'legacy-a');
      INSERT INTO "Card" VALUES ('card-2', NULL);
      INSERT INTO "Session" VALUES ('legacy-session', 'legacy-a');
    `);

    const analysis = analyzeCodexTestAccounts(db);
    expect(analysis.candidates).toHaveLength(2);
    expect(analysis.ownedRows.CollectionCard).toBe(1);
    expect(analysis.ownedRows.CollectionWant).toBe(2);
    expect(analysis.discardedRows.Session).toBe(1);
    expect(analysis.uniqueConflicts.CollectionWant).toBe(0);

    const first = consolidateCodexTestAccounts(db, {
      passwordHash: "scrypt$v1$test-salt$test-hash",
      now: "2026-07-20T12:00:00.000Z",
    });
    expect(first.removedAccounts).toBe(2);

    const canonical = db
      .prepare('SELECT id, email, role, disabled FROM "User" WHERE email = ?')
      .get(CODEX_TEST_EMAIL);
    expect(canonical.role).toBe(CODEX_TEST_ROLE);
    expect(canonical.disabled).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(2);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM "CollectionWant" WHERE user_id = ?').get(
        canonical.id
      ).count
    ).toBe(2);
    expect(db.prepare('SELECT user_id FROM "CollectionCard"').get().user_id).toBe(canonical.id);
    expect(db.prepare('SELECT submitted_by_user_id FROM "Card" WHERE id = ?').get("card-1")
      .submitted_by_user_id).toBe(canonical.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "Session"').get().count).toBe(0);
    expect(db.pragma("foreign_key_check")).toEqual([]);

    const second = consolidateCodexTestAccounts(db, {
      passwordHash: "scrypt$v1$new-salt$new-hash",
      now: "2026-07-20T13:00:00.000Z",
    });
    expect(second.removedAccounts).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(2);
    expect(
      db.prepare('SELECT role FROM "User" WHERE email = ?').get(CODEX_TEST_EMAIL).role
    ).toBe("user");

    db.close();
  });

  it("refuses a merge that would violate a user-scoped uniqueness constraint", () => {
    const db = createDatabase();
    insertUser(db, "legacy-a", "first@example.test");
    insertUser(db, "legacy-b", "second@example.test");
    db.exec(`
      INSERT INTO "Card" VALUES ('card-1', NULL);
      INSERT INTO "CollectionWant" VALUES ('want-a', 'legacy-a', 'card-1');
      INSERT INTO "CollectionWant" VALUES ('want-b', 'legacy-b', 'card-1');
    `);

    const analysis = analyzeCodexTestAccounts(db);
    expect(analysis.uniqueConflicts.CollectionWant).toBe(1);
    expect(() =>
      consolidateCodexTestAccounts(db, {
        passwordHash: "scrypt$v1$test-salt$test-hash",
        now: "2026-07-20T12:00:00.000Z",
      })
    ).toThrow(/duplicate user-owned rows/i);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(2);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM "User" WHERE email = ?').get(CODEX_TEST_EMAIL)
        .count
    ).toBe(0);

    db.close();
  });
});
