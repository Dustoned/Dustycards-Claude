import { test as base, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, hashSessionToken } from "@/lib/auth-crypto";
import { generateRecoveryCodes } from "@/lib/mfa";

// Run against a migrated, disposable database shared with the local test server:
// DUSTYCARDS_DATABASE_PATH=<absolute path> AUTH_MFA_ENCRYPTION_KEY=<test key>
// Each case owns its account and rate-limit buckets; no global tables are reset.
const test = base.extend<{
  account: {
    db: Database.Database;
    id: string;
    email: string;
    password: string;
    headers: Record<string, string>;
    authHeaders: Record<string, string>;
  };
}>({
  account: async ({ baseURL }, provideAccount) => {
    if (!process.env.DUSTYCARDS_DATABASE_PATH || !baseURL || new URL(baseURL).hostname !== "127.0.0.1") {
      throw new Error("Security smoke tests require a local server and DUSTYCARDS_DATABASE_PATH pointing to a migrated test database.");
    }
    const db = new Database(process.env.DUSTYCARDS_DATABASE_PATH, { fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    const id = `security-smoke-${randomUUID()}`;
    const email = `${id}@example.test`;
    const password = randomBytes(24).toString("base64url");
    const token = randomBytes(32).toString("base64url");
    const ip = `127.${[...randomBytes(3)].join(".")}`;
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60 * 60_000).toISOString();
    try {
      db.prepare(`INSERT INTO User
        (id, email, password_hash, role, disabled, email_verified_at, created_at, updated_at)
        VALUES (?, ?, ?, 'user', 0, ?, ?, ?)`)
        .run(id, email, await hashPassword(password), now, now, now);
      db.prepare(`INSERT INTO Session (id, user_id, token_hash, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, id, hashSessionToken(token), expires, now, now);
      const headers = { "x-forwarded-for": ip };
      await provideAccount({ db, id, email, password, headers, authHeaders: { ...headers, Cookie: `dustycards-session=${token}` } });
    } finally {
      db.prepare("DELETE FROM User WHERE id = ?").run(id);
      db.prepare("DELETE FROM RateLimitBucket WHERE key IN (?, ?)").run(`login:ip:${ip}`, `login:email:${email}`);
      db.close();
    }
  },
});

for (const role of ["user", "admin"] as const) {
  test(`${role} device sessions persist across clients and logout only revokes that device`, async ({ request, playwright, baseURL, account }) => {
    account.db.prepare("UPDATE User SET role = ? WHERE id = ?").run(role, account.id);
    const response = await request.post("/api/auth/login", {
      headers: account.headers, data: { email: account.email, password: account.password },
    });
    expect(response.status()).toBe(200);
    const state = await request.storageState();
    const cookie = state.cookies.find((entry) => entry.name === "dustycards-session");
    expect(cookie).toBeDefined();
    const days = role === "admin" ? 30 : 90;
    expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan((days - 1) * 86_400_000);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    const persisted = account.db.prepare("SELECT expires_at FROM Session WHERE token_hash = ?")
      .get(hashSessionToken(cookie!.value)) as { expires_at: number | string };
    expect(Math.abs(new Date(persisted.expires_at).getTime() - cookie!.expires * 1000)).toBeLessThan(2000);
    // A new client loading the persisted cookie represents reopening the browser.
    // The local production build uses HTTP, while its real deployment uses
    // HTTPS. Adapt only the test client's transport flag so its cookie jar can
    // send the production Secure cookie to this loopback HTTP server.
    const reopened = await playwright.request.newContext({
      baseURL,
      storageState: {
        ...state,
        cookies: state.cookies.map((entry) => ({ ...entry, secure: false })),
      },
    });
    try {
      expect((await reopened.get("/api/collection/binders")).status()).toBe(200);
      expect((await reopened.post("/api/auth/logout")).status()).toBe(200);
      expect((await reopened.get("/api/collection/binders")).status()).toBe(401);
      expect((await request.get("/api/collection/binders", {
        headers: { Cookie: `dustycards-session=${cookie!.value}` },
      })).status()).toBe(401);
      expect((await request.get("/api/collection/binders", { headers: account.authHeaders })).status()).toBe(200);
    } finally {
      await reopened.dispose();
    }
  });
}

test("concurrent logins reserve the account budget before password verification", async ({ request, account }) => {
  const responses = await Promise.all(Array.from({ length: 16 }, () => request.post("/api/auth/login", {
    headers: account.headers, data: { email: account.email, password: "incorrect-password" },
  })));
  expect(responses.filter((response) => response.status() === 401)).toHaveLength(8);
  expect(responses.filter((response) => response.status() === 429)).toHaveLength(8);
});

test("successful logins also count toward the reserved budget", async ({ request, account }) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post("/api/auth/login", {
      headers: account.headers, data: { email: account.email, password: account.password },
    });
    expect(response.status()).toBe(200);
  }
  const response = await request.post("/api/auth/login", {
    headers: account.headers, data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(429);
});

test("one recovery code creates only one session during concurrent logins", async ({ request, account }) => {
  test.skip(!process.env.AUTH_MFA_ENCRYPTION_KEY, "Set the same test MFA key on the test runner and server.");
  const recovery = generateRecoveryCodes(1);
  account.db.prepare("UPDATE User SET mfa_enabled_at = ?, mfa_recovery_codes_json = ? WHERE id = ?")
    .run(new Date().toISOString(), JSON.stringify(recovery.hashes), account.id);
  const responses = await Promise.all(Array.from({ length: 4 }, () => request.post("/api/auth/login", {
    headers: account.headers,
    data: { email: account.email, password: account.password, mfaCode: recovery.plain[0] },
  })));
  expect(responses.filter((response) => response.status() === 200)).toHaveLength(1);
  expect(responses.filter((response) => response.status() === 401)).toHaveLength(3);
  expect(account.db.prepare("SELECT COUNT(*) AS total FROM Session WHERE user_id = ?").get(account.id))
    .toEqual({ total: 2 }); // The fixture session plus the one successful login.
  const replay = await request.post("/api/auth/login", {
    headers: account.headers,
    data: { email: account.email, password: account.password, mfaCode: recovery.plain[0] },
  });
  expect(replay.status()).toBe(401);
});

test("changing a password revokes outstanding reset links and old sessions", async ({ request, account }) => {
  const resetToken = randomBytes(32).toString("base64url");
  account.db.prepare(`INSERT INTO PasswordResetToken (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(account.id, account.id, hashSessionToken(resetToken), new Date(Date.now() + 30 * 60_000).toISOString(), new Date().toISOString());
  const newPassword = randomBytes(24).toString("base64url");
  const changed = await request.post("/api/auth/change-password", {
    headers: account.authHeaders,
    data: { currentPassword: account.password, newPassword, newPasswordConfirm: newPassword },
  });
  expect(changed.status()).toBe(200);
  expect(account.db.prepare("SELECT COUNT(*) AS total FROM PasswordResetToken WHERE user_id = ?").get(account.id))
    .toEqual({ total: 0 });
  const reset = await request.post("/api/auth/reset-password", {
    headers: account.headers,
    data: { token: resetToken, password: "unwanted-reset-password", passwordConfirm: "unwanted-reset-password" },
  });
  expect(reset.status()).toBe(400);
  const staleSession = await request.get("/api/collection/binders", { headers: account.authHeaders });
  expect(staleSession.status()).toBe(401);
  const login = await request.post("/api/auth/login", {
    headers: account.headers, data: { email: account.email, password: newPassword },
  });
  expect(login.status()).toBe(200);
});

for (const operation of ["edit", "bulk move"] as const) {
  test(`a stale ${operation} preserves the sale and rolls back the whole selection`, async ({ request, account }) => {
    const card = account.db.prepare("SELECT id FROM Card WHERE game = 'pokemon' LIMIT 1").get() as { id: string };
    const ids = [randomUUID(), randomUUID()];
    const now = new Date().toISOString();
    for (const id of ids) {
      account.db.prepare(`INSERT INTO CollectionCard (id, user_id, card_id, for_sale, purchase_price, notes, added_at, updated_at)
        VALUES (?, ?, ?, 1, 12.5, 'Original note', ?, ?)`).run(id, account.id, card.id, now, now);
    }
    const sold = await request.post("/api/collection/cards/sold", {
      headers: account.authHeaders, data: { itemIds: [ids[0]], totalPrice: 25, feeTotal: 2, platform: "Test" },
    });
    expect(sold.status()).toBe(200);
    const query = account.db.prepare("SELECT id, for_sale, sale_price, sale_fee_eur, sale_platform, sold_at, purchase_price, notes FROM CollectionCard WHERE user_id = ? ORDER BY id");
    const before = query.all(account.id);
    const edit = operation === "edit"
      ? await request.patch(`/api/collection/cards/${ids[0]}`, {
          headers: account.authHeaders,
          data: { forSale: true, purchasePrice: 5, notes: "Stale edit" },
        })
      : await request.patch("/api/collection/cards", {
          headers: account.authHeaders, data: { itemIds: ids, forSale: true, totalPurchasePrice: 10 },
        });
    expect(edit.status()).toBe(409);
    expect(query.all(account.id)).toEqual(before);
    // The explicit undo-sale action must remain available.
    const undo = await request.delete("/api/collection/cards/sold", {
      headers: account.authHeaders, data: { itemIds: [ids[0]] },
    });
    expect(undo.status()).toBe(200);
    const ordinaryEdit = await request.patch(`/api/collection/cards/${ids[0]}`, {
      headers: account.authHeaders, data: { forSale: true, purchasePrice: 12.5, notes: "New note" },
    });
    expect(ordinaryEdit.status()).toBe(200);
  });
}
