import "dotenv/config";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import Database from "better-sqlite3";

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("INITIAL_ADMIN_EMAIL must be set to a valid email address.");
}

if (password.length < 8) {
  throw new Error("INITIAL_ADMIN_PASSWORD must be at least 8 characters.");
}

function hashPassword(value) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(value, salt, 64).toString("base64url");
  return `scrypt$v1$${salt}$${hash}`;
}

const db = new Database("dustycards.db");
const now = new Date().toISOString();
const passwordHash = hashPassword(password);

const result = db.transaction(() => {
  const existing = db.prepare(`SELECT id FROM "User" WHERE email = ?`).get(email);
  const userId = existing?.id ?? randomUUID();

  if (existing) {
    db.prepare(
      `UPDATE "User"
       SET password_hash = ?, role = 'admin', disabled = false, updated_at = ?
       WHERE id = ?`
    ).run(passwordHash, now, userId);
  } else {
    db.prepare(
      `INSERT INTO "User" (id, email, password_hash, role, disabled, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', false, ?, ?)`
    ).run(userId, email, passwordHash, now, now);
  }

  const binders = db
    .prepare(`UPDATE "CollectionBinder" SET user_id = ? WHERE user_id IS NULL`)
    .run(userId).changes;
  const cards = db
    .prepare(`UPDATE "CollectionCard" SET user_id = ? WHERE user_id IS NULL`)
    .run(userId).changes;
  const sealed = db
    .prepare(`UPDATE "CollectionSealed" SET user_id = ? WHERE user_id IS NULL`)
    .run(userId).changes;

  return { userId, binders, cards, sealed };
})();

db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      email,
      userId: result.userId,
      claimed: {
        binders: result.binders,
        cards: result.cards,
        sealed: result.sealed,
      },
    },
    null,
    2
  )
);
