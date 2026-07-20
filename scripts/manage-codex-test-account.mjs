import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import {
  CODEX_TEST_EMAIL,
  CODEX_TEST_ROLE,
  analyzeCodexTestAccounts,
  consolidateCodexTestAccounts,
} from "./codex-test-account-core.mjs";

const PASSWORD_ENV_NAME = "DUSTYCARDS_CODEX_TEST_PASSWORD";

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/manage-codex-test-account.mjs --database <path> --backup <path> --apply",
    "  node scripts/manage-codex-test-account.mjs --database <path>  # dry-run (default)",
    "",
    `Password: set ${PASSWORD_ENV_NAME}, or pass --password <value>.`,
    "The password is required for dry-run and apply, and is never printed.",
    "Apply always requires a new, explicit --backup path.",
  ].join("\n");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$v1$${salt}$${hash}`;
}

async function createVerifiedBackup(databasePath, backupPath) {
  if (databasePath === backupPath) {
    throw new Error("Backup path must differ from the database path.");
  }
  if (existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite existing backup: ${backupPath}`);
  }

  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(backupPath);
  } finally {
    source.close();
  }

  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = backup.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") {
      throw new Error(`Backup quick_check failed: ${quickCheck}`);
    }
  } finally {
    backup.close();
  }
}

function summarize(analysis) {
  return {
    mode: "dry-run",
    canonicalEmail: CODEX_TEST_EMAIL,
    canonicalRole: CODEX_TEST_ROLE,
    canonicalExists: Boolean(analysis.canonical),
    legacyAccounts: analysis.candidates.map(({ id, email, role, disabled, created_at }) => ({
      id,
      email,
      role,
      disabled: Boolean(disabled),
      createdAt: created_at,
    })),
    rowsToMigrate: analysis.ownedRows,
    privateRowsRemovedWithLegacyAccounts: analysis.discardedRows,
    uniqueConflicts: analysis.uniqueConflicts,
    idCollision: analysis.idCollision,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const databaseOption = readOption(args, "--database");
  if (!databaseOption || databaseOption.startsWith("--")) {
    throw new Error(`An explicit --database path is required.\n\n${usage()}`);
  }
  const databasePath = resolve(databaseOption);
  if (!existsSync(databasePath)) {
    throw new Error(`Database not found: ${databasePath}`);
  }

  const passwordOption = readOption(args, "--password");
  const password = passwordOption ?? process.env[PASSWORD_ENV_NAME];
  if (!password || password.length < 12) {
    throw new Error(
      `Provide a password of at least 12 characters via ${PASSWORD_ENV_NAME} or --password.`
    );
  }

  const apply = args.includes("--apply");
  if (!apply) {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      console.log(JSON.stringify(summarize(analyzeCodexTestAccounts(db)), null, 2));
      console.log("Dry-run only. No database changes were made.");
    } finally {
      db.close();
    }
    return;
  }

  const backupOption = readOption(args, "--backup");
  if (!backupOption || backupOption.startsWith("--")) {
    throw new Error("--apply requires an explicit --backup path.");
  }
  const backupPath = resolve(backupOption);
  await createVerifiedBackup(databasePath, backupPath);

  const db = new Database(databasePath, { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 10000");
    const before = analyzeCodexTestAccounts(db);
    const result = consolidateCodexTestAccounts(db, {
      passwordHash: hashPassword(password),
      now: new Date().toISOString(),
    });
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          canonicalEmail: CODEX_TEST_EMAIL,
          canonicalRole: CODEX_TEST_ROLE,
          backupPath,
          removedAccounts: result.removedAccounts,
          migratedRows: result.migratedRows,
          discardedPrivateRows: before.discardedRows,
          baselineForeignKeyProblems: result.baselineForeignKeyProblems,
          remainingForeignKeyProblems: result.remainingForeignKeyProblems,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
