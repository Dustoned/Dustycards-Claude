export const CODEX_TEST_USER_ID = "codex-test-account";
export const CODEX_TEST_EMAIL = "codex-test@example.test";
export const CODEX_TEST_ROLE = "user";

const USER_ID_MIGRATIONS = [
  { table: "CollectionBinder", column: "user_id" },
  { table: "CollectionCard", column: "user_id" },
  { table: "CollectionSealed", column: "user_id" },
  { table: "CardSubmission", column: "user_id" },
  { table: "CollectionWant", column: "user_id", uniqueBy: ["card_id"] },
  { table: "CardPriceAlert", column: "user_id", uniqueBy: ["card_id"] },
  {
    table: "EbayListingCardOverride",
    column: "user_id",
    uniqueBy: ["marketplace_id", "item_id"],
  },
  {
    table: "EbayWatchedListing",
    column: "user_id",
    uniqueBy: ["marketplace_id", "item_id"],
  },
];

const DIRECT_USER_ID_REFERENCES = [
  { table: "Card", column: "submitted_by_user_id" },
];

const CASCADE_ONLY_REFERENCES = [
  { table: "Session", columns: ["user_id"] },
  { table: "EmailVerificationToken", columns: ["user_id"] },
  { table: "PasswordResetToken", columns: ["user_id"] },
  {
    table: "SocialConnection",
    columns: ["requester_id", "addressee_id", "user_a_id", "user_b_id"],
  },
];

function foreignKeyViolationKey(problem) {
  return [problem.table, problem.rowid, problem.parent, problem.fkid]
    .map((value) => String(value ?? ""))
    .join("\u001f");
}

export function findNewForeignKeyViolations(baseline, current) {
  const baselineKeys = new Set(baseline.map(foreignKeyViolationKey));
  return current.filter((problem) => !baselineKeys.has(foreignKeyViolationKey(problem)));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableNames(db) {
  return new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
  );
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function countRowsForUserIds(db, table, column, userIds) {
  if (userIds.length === 0) return 0;
  return db
    .prepare(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} ` +
        `WHERE ${quoteIdentifier(column)} IN (${placeholders(userIds)})`
    )
    .get(...userIds).count;
}

function countCascadeRows(db, table, columns, userIds) {
  if (userIds.length === 0) return 0;
  const clauses = columns.map(
    (column) => `${quoteIdentifier(column)} IN (${placeholders(userIds)})`
  );
  const params = columns.flatMap(() => userIds);
  return db
    .prepare(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE ${clauses.join(" OR ")}`
    )
    .get(...params).count;
}

function countUniqueConflicts(db, migration, userIds) {
  if (!migration.uniqueBy || userIds.length === 0) return 0;
  const keys = migration.uniqueBy.map(quoteIdentifier).join(", ");
  return db
    .prepare(
      `SELECT COUNT(*) AS count FROM (` +
        `SELECT ${keys} FROM ${quoteIdentifier(migration.table)} ` +
        `WHERE ${quoteIdentifier(migration.column)} IN (${placeholders(userIds)}) ` +
        `GROUP BY ${keys} HAVING COUNT(*) > 1` +
        `)`
    )
    .get(...userIds).count;
}

export function analyzeCodexTestAccounts(db) {
  const tables = tableNames(db);
  if (!tables.has("User")) {
    throw new Error('Database does not contain a "User" table.');
  }

  const canonical = db
    .prepare(
      `SELECT id, email, role, disabled, created_at FROM "User" WHERE lower(email) = ?`
    )
    .get(CODEX_TEST_EMAIL);
  const idCollision = db
    .prepare(`SELECT id, email FROM "User" WHERE id = ? AND lower(email) <> ?`)
    .get(CODEX_TEST_USER_ID, CODEX_TEST_EMAIL);
  const candidates = db
    .prepare(
      `SELECT id, email, role, disabled, created_at FROM "User" ` +
        `WHERE lower(email) LIKE '%@example.test' AND lower(email) <> ? ` +
        `ORDER BY created_at, id`
    )
    .all(CODEX_TEST_EMAIL);

  const candidateIds = candidates.map((candidate) => candidate.id);
  const targetId = canonical?.id ?? CODEX_TEST_USER_ID;
  const involvedIds = [...new Set([...candidateIds, targetId])];
  const ownedRows = {};
  const uniqueConflicts = {};
  const discardedRows = {};

  for (const migration of USER_ID_MIGRATIONS) {
    if (!tables.has(migration.table)) continue;
    ownedRows[migration.table] = countRowsForUserIds(
      db,
      migration.table,
      migration.column,
      candidateIds
    );
    if (migration.uniqueBy) {
      uniqueConflicts[migration.table] = countUniqueConflicts(
        db,
        migration,
        involvedIds
      );
    }
  }

  for (const reference of DIRECT_USER_ID_REFERENCES) {
    if (!tables.has(reference.table)) continue;
    ownedRows[`${reference.table}.${reference.column}`] = countRowsForUserIds(
      db,
      reference.table,
      reference.column,
      candidateIds
    );
  }

  for (const reference of CASCADE_ONLY_REFERENCES) {
    if (!tables.has(reference.table)) continue;
    discardedRows[reference.table] = countCascadeRows(
      db,
      reference.table,
      reference.columns,
      candidateIds
    );
  }

  return {
    canonical: canonical ?? null,
    targetId,
    idCollision: idCollision ?? null,
    candidates,
    ownedRows,
    discardedRows,
    uniqueConflicts,
  };
}

function assertSafeAnalysis(analysis) {
  if (analysis.idCollision) {
    throw new Error(
      `Canonical id ${CODEX_TEST_USER_ID} is already used by another email address.`
    );
  }

  const conflicts = Object.entries(analysis.uniqueConflicts).filter(([, count]) => count > 0);
  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to merge duplicate user-owned rows: ${conflicts
        .map(([table, count]) => `${table}=${count}`)
        .join(", ")}`
    );
  }
}

export function consolidateCodexTestAccounts(db, { passwordHash, now }) {
  if (!passwordHash || typeof passwordHash !== "string") {
    throw new Error("A password hash is required.");
  }
  if (!now || typeof now !== "string") {
    throw new Error("An ISO timestamp is required.");
  }

  db.pragma("foreign_keys = ON");
  const baselineForeignKeyProblems = db.pragma("foreign_key_check");
  const analysis = analyzeCodexTestAccounts(db);
  assertSafeAnalysis(analysis);
  const tables = tableNames(db);
  const candidateIds = analysis.candidates.map((candidate) => candidate.id);

  const result = db.transaction(() => {
    let targetId = analysis.canonical?.id ?? CODEX_TEST_USER_ID;

    if (analysis.canonical) {
      db.prepare(
        `UPDATE "User" SET password_hash = ?, role = ?, disabled = 0, ` +
          `email_verified_at = ?, updated_at = ? WHERE id = ?`
      ).run(passwordHash, CODEX_TEST_ROLE, now, now, targetId);
    } else {
      db.prepare(
        `INSERT INTO "User" (` +
          `id, email, password_hash, role, disabled, email_verified_at, created_at, updated_at` +
          `) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(
        targetId,
        CODEX_TEST_EMAIL,
        passwordHash,
        CODEX_TEST_ROLE,
        now,
        now,
        now
      );
    }

    const migratedRows = {};
    if (candidateIds.length > 0) {
      const sourcePlaceholders = placeholders(candidateIds);
      for (const migration of USER_ID_MIGRATIONS) {
        if (!tables.has(migration.table)) continue;
        migratedRows[migration.table] = db
          .prepare(
            `UPDATE ${quoteIdentifier(migration.table)} ` +
              `SET ${quoteIdentifier(migration.column)} = ? ` +
              `WHERE ${quoteIdentifier(migration.column)} IN (${sourcePlaceholders})`
          )
          .run(targetId, ...candidateIds).changes;
      }

      for (const reference of DIRECT_USER_ID_REFERENCES) {
        if (!tables.has(reference.table)) continue;
        migratedRows[`${reference.table}.${reference.column}`] = db
          .prepare(
            `UPDATE ${quoteIdentifier(reference.table)} ` +
              `SET ${quoteIdentifier(reference.column)} = ? ` +
              `WHERE ${quoteIdentifier(reference.column)} IN (${sourcePlaceholders})`
          )
          .run(targetId, ...candidateIds).changes;
      }

      db.prepare(`DELETE FROM "User" WHERE id IN (${sourcePlaceholders})`).run(
        ...candidateIds
      );
    }

    const remainingTestUsers = db
      .prepare(
        `SELECT id, email, role, disabled FROM "User" ` +
          `WHERE lower(email) LIKE '%@example.test' ORDER BY email`
      )
      .all();
    if (
      remainingTestUsers.length !== 1 ||
      remainingTestUsers[0].id !== targetId ||
      remainingTestUsers[0].email.toLowerCase() !== CODEX_TEST_EMAIL ||
      remainingTestUsers[0].role !== CODEX_TEST_ROLE ||
      Number(remainingTestUsers[0].disabled) !== 0
    ) {
      throw new Error("Canonical Codex Test-account invariant was not satisfied.");
    }

    const foreignKeyProblems = db.pragma("foreign_key_check");
    const newForeignKeyProblems = findNewForeignKeyViolations(
      baselineForeignKeyProblems,
      foreignKeyProblems
    );
    if (newForeignKeyProblems.length > 0) {
      throw new Error(
        `Account consolidation introduced ${newForeignKeyProblems.length} new ` +
          `foreign_key_check problem(s).`
      );
    }

    return {
      targetId,
      removedAccounts: candidateIds.length,
      migratedRows,
      baselineForeignKeyProblems: baselineForeignKeyProblems.length,
      remainingForeignKeyProblems: foreignKeyProblems.length,
    };
  })();

  return result;
}
