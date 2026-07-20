/**
 * The app snapshot is a distributable fallback database. It may contain public
 * catalogue and market data, but it must never contain accounts, credentials,
 * sessions, private collections, wants, alerts, or operational secrets/state.
 *
 * Keep the order child-first: snapshot generation temporarily disables foreign
 * keys so it can also sanitize databases made with older Prisma schemas.
 */
export const PRIVATE_SNAPSHOT_TABLES = [
  "CollectionCardTag",
  "CollectionSealedTag",
  "SocialConnection",
  "Session",
  "EmailVerificationToken",
  "PasswordResetToken",
  "CardPriceAlert",
  "EbayListingCardOverride",
  "EbayWatchedListing",
  "CollectionWant",
  "CollectionCard",
  "CollectionSealed",
  "CollectionBinder",
  "CardSubmission",
  "User",
  "SyncLog",
  "SyncJob",
  "ApiQuotaSnapshot",
  "FirecrawlCreditLedger",
  "AppSetting",
];

const PRIVATE_SNAPSHOT_COLUMNS = [
  { table: "Card", column: "submitted_by_user_id" },
];

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function getTableNames(db) {
  return new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
  );
}

function hasColumn(db, table, column) {
  return db
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .some((row) => row.name === column);
}

export function inspectPrivateSnapshotData(db) {
  const tables = getTableNames(db);
  const tableRows = {};
  const nonNullColumns = {};

  for (const table of PRIVATE_SNAPSHOT_TABLES) {
    if (!tables.has(table)) continue;
    tableRows[table] = db
      .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`)
      .get().count;
  }

  for (const { table, column } of PRIVATE_SNAPSHOT_COLUMNS) {
    if (!tables.has(table) || !hasColumn(db, table, column)) continue;
    nonNullColumns[`${table}.${column}`] = db
      .prepare(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} ` +
          `WHERE ${quoteIdentifier(column)} IS NOT NULL`
      )
      .get().count;
  }

  return { tableRows, nonNullColumns };
}

export function assertSnapshotIsSanitized(db) {
  const inspection = inspectPrivateSnapshotData(db);
  const leaks = [
    ...Object.entries(inspection.tableRows).filter(([, count]) => count !== 0),
    ...Object.entries(inspection.nonNullColumns).filter(([, count]) => count !== 0),
  ];

  if (leaks.length > 0) {
    const detail = leaks.map(([name, count]) => `${name}=${count}`).join(", ");
    throw new Error(`Private data remained in app snapshot: ${detail}`);
  }

  return inspection;
}

export function sanitizeAppSnapshot(db) {
  const tables = getTableNames(db);
  const previousForeignKeys = Number(db.pragma("foreign_keys", { simple: true })) === 1;
  const removedRows = {};
  const clearedReferences = {};

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const table of PRIVATE_SNAPSHOT_TABLES) {
        if (!tables.has(table)) continue;
        removedRows[table] = db
          .prepare(`DELETE FROM ${quoteIdentifier(table)}`)
          .run().changes;
      }

      for (const { table, column } of PRIVATE_SNAPSHOT_COLUMNS) {
        if (!tables.has(table) || !hasColumn(db, table, column)) continue;
        clearedReferences[`${table}.${column}`] = db
          .prepare(
            `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column)} = NULL ` +
              `WHERE ${quoteIdentifier(column)} IS NOT NULL`
          )
          .run().changes;
      }
    })();
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }

  assertSnapshotIsSanitized(db);

  const foreignKeyProblems = db.pragma("foreign_key_check");
  if (foreignKeyProblems.length > 0) {
    throw new Error(
      `Sanitized snapshot failed foreign_key_check (${foreignKeyProblems.length} problem(s)).`
    );
  }

  return { removedRows, clearedReferences };
}
