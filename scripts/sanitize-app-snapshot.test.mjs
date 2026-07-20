import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseSnapshotSanitizerArgs,
  runSnapshotSanitizerCli,
  sanitizeSnapshotAtomically,
  verifySqliteFile,
} from "./sanitize-app-snapshot.mjs";

const temporaryDirectories = [];

function createTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "dustycards-snapshot-sanitize-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createSnapshotFixture(databasePath) {
  const db = new Database(databasePath);
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
    CREATE TABLE "Card" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      submitted_by_user_id TEXT
    );
    CREATE TABLE "Price" (id TEXT PRIMARY KEY, card_id TEXT, price REAL);

    INSERT INTO "User" VALUES ('test-user', 'test@example.test', 'private-hash');
    INSERT INTO "Session" VALUES ('session-1', 'test-user');
    INSERT INTO "CollectionWant" VALUES ('want-1', 'test-user', 'card-1');
    INSERT INTO "Card" VALUES ('card-1', 'Public card', 'test-user');
    INSERT INTO "Price" VALUES ('price-1', 'card-1', 42.50);
  `);
  db.close();
}

function rowCount(databasePath, table) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
  } finally {
    db.close();
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("snapshot sanitizer CLI", () => {
  it("requires an explicit database and a new backup path for apply", () => {
    expect(() => parseSnapshotSanitizerArgs([])).toThrow(/explicit --database/i);
    expect(() =>
      parseSnapshotSanitizerArgs(["--database", "snapshot.db", "--apply"])
    ).toThrow(/requires an explicit --backup/i);
    expect(() =>
      parseSnapshotSanitizerArgs([
        "--database",
        "snapshot.db",
        "--backup",
        "snapshot.backup.db",
      ])
    ).toThrow(/only used with --apply/i);
  });

  it("defaults to a read-only dry run", async () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, "snapshot.db");
    createSnapshotFixture(databasePath);
    const output = [];

    const result = await runSnapshotSanitizerCli(["--database", databasePath], {
      logger: { log: (message) => output.push(message) },
    });

    expect(result.mode).toBe("dry-run");
    expect(result.rowsToRemove).toBe(3);
    expect(result.referencesToClear).toBe(1);
    expect(result.wouldChange).toBe(true);
    expect(rowCount(databasePath, "User")).toBe(1);
    expect(output.at(-1)).toMatch(/no database changes/i);
  });

  it("creates a verified original backup before atomically sanitizing the source", async () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, "snapshot.db");
    const backupPath = join(directory, "backups", "snapshot-before-sanitize.db");
    createSnapshotFixture(databasePath);

    const result = await runSnapshotSanitizerCli(
      ["--database", databasePath, "--backup", backupPath, "--apply"],
      { logger: { log: () => {} } }
    );

    expect(result.mode).toBe("apply");
    expect(result.quickCheck).toBe("ok");
    expect(existsSync(backupPath)).toBe(true);
    expect(() => verifySqliteFile(backupPath, "Test backup")).not.toThrow();
    expect(rowCount(backupPath, "User")).toBe(1);
    expect(rowCount(databasePath, "User")).toBe(0);
    expect(rowCount(databasePath, "Session")).toBe(0);
    expect(rowCount(databasePath, "CollectionWant")).toBe(0);
    expect(rowCount(databasePath, "Card")).toBe(1);
    expect(rowCount(databasePath, "Price")).toBe(1);
  });

  it("never overwrites an existing backup and leaves the source unchanged", async () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, "snapshot.db");
    const backupPath = join(directory, "existing.db");
    createSnapshotFixture(databasePath);
    createSnapshotFixture(backupPath);

    await expect(
      runSnapshotSanitizerCli(
        ["--database", databasePath, "--backup", backupPath, "--apply"],
        { logger: { log: () => {} } }
      )
    ).rejects.toThrow(/refusing to overwrite/i);

    expect(rowCount(databasePath, "User")).toBe(1);
    expect(rowCount(backupPath, "User")).toBe(1);
  });
});

describe("atomic snapshot sanitation", () => {
  it("rolls back sanitation failures", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT);
      INSERT INTO "User" VALUES ('test-user', 'test@example.test');
      CREATE TRIGGER "prevent_user_delete"
      BEFORE DELETE ON "User"
      BEGIN
        SELECT RAISE(ABORT, 'forced sanitation failure');
      END;
    `);

    expect(() => sanitizeSnapshotAtomically(db)).toThrow(/forced sanitation failure/i);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(1);
    db.close();
  });

  it("rolls back when the sanitized result fails foreign_key_check", () => {
    const db = new Database(":memory:");
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT);
      CREATE TABLE "PublicParent" (id TEXT PRIMARY KEY);
      CREATE TABLE "PublicChild" (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES "PublicParent"(id)
      );
      INSERT INTO "User" VALUES ('test-user', 'test@example.test');
      INSERT INTO "PublicChild" VALUES ('broken-child', 'missing-parent');
    `);

    expect(() => sanitizeSnapshotAtomically(db)).toThrow(/foreign_key_check/i);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(1);
    db.close();
  });

  it("rolls back when quick_check verification fails after sanitation", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT);
      INSERT INTO "User" VALUES ('test-user', 'test@example.test');
    `);

    expect(() =>
      sanitizeSnapshotAtomically(db, {
        quickCheck: () => ["forced quick_check failure"],
      })
    ).toThrow(/quick_check failed/i);
    expect(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count).toBe(1);
    db.close();
  });
});
