import Database from "better-sqlite3";
import { existsSync, linkSync, mkdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSnapshotIsSanitized,
  inspectPrivateSnapshotData,
  sanitizeAppSnapshot,
} from "./snapshot-sanitizer.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/sanitize-app-snapshot.mjs --database <path>",
    "  node scripts/sanitize-app-snapshot.mjs --database <path> --backup <new-path> --apply",
    "",
    "The default is a read-only dry run. --apply always requires a new, explicit",
    "--backup path; existing backup files are never overwritten.",
  ].join("\n");
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

export function parseSnapshotSanitizerArgs(args) {
  const options = { apply: false, help: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--apply") {
      if (options.apply) throw new Error("--apply may only be provided once.");
      options.apply = true;
      continue;
    }
    if (argument === "--database") {
      if (options.database) throw new Error("--database may only be provided once.");
      options.database = readValue(args, index, "--database");
      index += 1;
      continue;
    }
    if (argument.startsWith("--database=")) {
      if (options.database) throw new Error("--database may only be provided once.");
      options.database = argument.slice("--database=".length);
      if (!options.database) throw new Error("--database requires a value.");
      continue;
    }
    if (argument === "--backup") {
      if (options.backup) throw new Error("--backup may only be provided once.");
      options.backup = readValue(args, index, "--backup");
      index += 1;
      continue;
    }
    if (argument.startsWith("--backup=")) {
      if (options.backup) throw new Error("--backup may only be provided once.");
      options.backup = argument.slice("--backup=".length);
      if (!options.backup) throw new Error("--backup requires a value.");
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (options.help) return options;
  if (!options.database) {
    throw new Error(`An explicit --database path is required.\n\n${usage()}`);
  }
  if (options.apply && !options.backup) {
    throw new Error("--apply requires an explicit --backup path.");
  }
  if (!options.apply && options.backup) {
    throw new Error("--backup is only used with --apply.");
  }

  return options;
}

function normalizePathForComparison(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function canonicalProspectivePath(path) {
  const absolutePath = resolve(path);
  if (existsSync(absolutePath)) return realpathSync(absolutePath);
  return join(realpathSync(dirname(absolutePath)), basename(absolutePath));
}

export function readQuickCheck(db) {
  const rows = db.pragma("quick_check");
  return rows.map((row) => String(Object.values(row)[0]));
}

function assertQuickCheck(messages, label) {
  if (messages.length === 1 && messages[0] === "ok") return;
  const detail = messages.length > 0 ? messages.join("; ") : "no result";
  throw new Error(`${label} quick_check failed: ${detail}`);
}

export function verifySqliteFile(databasePath, label = "SQLite database") {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    assertQuickCheck(readQuickCheck(db), label);
  } finally {
    db.close();
  }
}

/**
 * Build and verify a consistent SQLite backup without ever overwriting the
 * requested destination. The temporary backup lives beside the destination,
 * so publishing it with a hard link is atomic and fails if the path appeared
 * concurrently.
 */
export async function createVerifiedSqliteBackup(databasePath, backupPath) {
  const sourcePath = resolve(databasePath);
  const destinationPath = resolve(backupPath);

  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error(`Database not found: ${sourcePath}`);
  }
  if (existsSync(destinationPath)) {
    throw new Error(`Refusing to overwrite existing backup: ${destinationPath}`);
  }

  mkdirSync(dirname(destinationPath), { recursive: true });

  if (
    normalizePathForComparison(realpathSync(sourcePath)) ===
    normalizePathForComparison(canonicalProspectivePath(destinationPath))
  ) {
    throw new Error("Backup path must differ from the database path.");
  }

  const temporaryPath = join(
    dirname(destinationPath),
    `.${basename(destinationPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let published = false;

  try {
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(temporaryPath);
    } finally {
      source.close();
    }

    verifySqliteFile(temporaryPath, "Temporary backup");
    linkSync(temporaryPath, destinationPath);
    published = true;
    verifySqliteFile(destinationPath, "Backup");
    return destinationPath;
  } catch (error) {
    if (published && existsSync(destinationPath)) unlinkSync(destinationPath);
    throw error;
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

/**
 * Sanitize and verify inside one outer transaction. sanitizeAppSnapshot uses a
 * nested savepoint; any sanitation, foreign-key, or quick-check failure bubbles
 * through this transaction and restores the source database exactly as it was.
 */
export function sanitizeSnapshotAtomically(
  db,
  { quickCheck = readQuickCheck } = {}
) {
  if (db.inTransaction) {
    throw new Error("sanitizeSnapshotAtomically must own the outer transaction.");
  }

  const previousForeignKeys = Number(db.pragma("foreign_keys", { simple: true })) === 1;
  db.pragma("foreign_keys = OFF");

  try {
    return db.transaction(() => {
      const sanitation = sanitizeAppSnapshot(db);
      assertSnapshotIsSanitized(db);

      const foreignKeyProblems = db.pragma("foreign_key_check");
      if (foreignKeyProblems.length > 0) {
        throw new Error(
          `Sanitized snapshot failed foreign_key_check (${foreignKeyProblems.length} problem(s)).`
        );
      }

      const quickCheckMessages = quickCheck(db);
      assertQuickCheck(quickCheckMessages, "Sanitized snapshot");

      return {
        ...sanitation,
        quickCheck: quickCheckMessages[0],
        foreignKeyProblems: 0,
      };
    })();
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }
}

function summarizeInspection(db, databasePath) {
  const inspection = inspectPrivateSnapshotData(db);
  const rowsToRemove = Object.values(inspection.tableRows).reduce(
    (total, count) => total + count,
    0
  );
  const referencesToClear = Object.values(inspection.nonNullColumns).reduce(
    (total, count) => total + count,
    0
  );
  const quickCheck = readQuickCheck(db);
  assertQuickCheck(quickCheck, "Snapshot");

  return {
    mode: "dry-run",
    databasePath,
    rowsToRemove,
    referencesToClear,
    privateTableRows: inspection.tableRows,
    privateReferences: inspection.nonNullColumns,
    currentForeignKeyProblems: db.pragma("foreign_key_check").length,
    quickCheck: quickCheck[0],
    wouldChange: rowsToRemove + referencesToClear > 0,
  };
}

export async function runSnapshotSanitizerCli(args, { logger = console } = {}) {
  const options = parseSnapshotSanitizerArgs(args);
  if (options.help) {
    logger.log(usage());
    return { mode: "help" };
  }

  const databasePath = resolve(options.database);
  if (!existsSync(databasePath) || !statSync(databasePath).isFile()) {
    throw new Error(`Database not found: ${databasePath}`);
  }

  if (!options.apply) {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const summary = summarizeInspection(db, databasePath);
      logger.log(JSON.stringify(summary, null, 2));
      logger.log("Dry-run only. No database changes were made.");
      return summary;
    } finally {
      db.close();
    }
  }

  const backupPath = await createVerifiedSqliteBackup(databasePath, options.backup);
  const db = new Database(databasePath, { fileMustExist: true });

  try {
    db.pragma("busy_timeout = 10000");
    const sanitation = sanitizeSnapshotAtomically(db);
    const summary = {
      mode: "apply",
      databasePath,
      backupPath,
      removedRows: sanitation.removedRows,
      clearedReferences: sanitation.clearedReferences,
      foreignKeyProblems: sanitation.foreignKeyProblems,
      quickCheck: sanitation.quickCheck,
    };
    logger.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    db.close();
  }
}

const isMainModule =
  process.argv[1] &&
  normalizePathForComparison(resolve(process.argv[1])) ===
    normalizePathForComparison(fileURLToPath(import.meta.url));

if (isMainModule) {
  runSnapshotSanitizerCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
