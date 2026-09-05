import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { hashPassword, hashSessionToken } from "../../src/lib/auth-crypto";

test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });

const password = "Passkey-testing-only-4926!";
test("passkey registration, verified sign-in, replay protection and removal", async ({ page, context, baseURL }) => {
  if (!process.env.DUSTYCARDS_DATABASE_PATH || !baseURL || new URL(baseURL).hostname !== "localhost") throw new Error("Local disposable database required");
  const db = new Database(process.env.DUSTYCARDS_DATABASE_PATH); db.pragma("foreign_keys = ON"); db.pragma("busy_timeout = 5000");
  const id = `passkey-${randomUUID()}`, token = randomUUID(), now = new Date().toISOString();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  try {
    db.prepare("INSERT INTO User (id,email,password_hash,role,disabled,email_verified_at,created_at,updated_at) VALUES (?,?,?,'user',0,?,?,?)").run(id, `${id}@example.test`, await hashPassword(password), now, now, now);
    db.prepare("INSERT INTO Session (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)").run(id, id, hashSessionToken(token), new Date(Date.now()+3600000).toISOString(), now, now);
    await context.addCookies([{ name: "dustycards-session", value: token, url: baseURL }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/account?tab=security");
    await page.getByRole("button", { name: "Add passkey", exact: true }).click();
    await page.getByLabel("Passkey name", { exact: true }).fill("Test iPhone");
    await page.getByLabel("Confirm current password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Passkey added. You can now use it to sign in.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const stored = db.prepare("SELECT id,user_id FROM Passkey WHERE user_id = ?").get(id) as { id: string; user_id: string };
    expect(stored.user_id).toBe(id);
    // A wrong password cannot start a second enrollment or remove a credential.
    const wrong = await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: baseURL }, data: { action: "register-options", password: "wrong" } });
    expect(wrong.status()).toBe(401);
    await context.clearCookies();
    await page.goto("/login");
    let assertion: unknown;
    page.on("request", request => { if (request.url().endsWith("/api/auth/passkeys") && request.method() === "POST") { const body = request.postDataJSON(); if (body.action === "login-verify") assertion = body.response; } });
    await page.getByRole("button", { name: "Sign in with passkey" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    const cookie = (await context.cookies()).find(cookie => cookie.name === "dustycards-session");
    expect(cookie).toBeTruthy();
    const session = db.prepare("SELECT user_id,passkey_id,mfa_verified_at FROM Session WHERE token_hash=?").get(hashSessionToken(cookie!.value)) as { user_id: string; passkey_id: string; mfa_verified_at: string };
    expect(session.user_id).toBe(id); expect(session.passkey_id).toBe(stored.id); expect(session.mfa_verified_at).toBeTruthy();
    const replay = await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: baseURL }, data: { action: "login-verify", response: assertion } });
    expect(replay.status()).toBe(400);
    await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: baseURL }, data: { action: "login-options" } });
    const wrongChallenge = await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: baseURL }, data: { action: "login-verify", response: assertion } });
    expect(wrongChallenge.status()).toBe(400);
    await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: baseURL }, data: { action: "login-options" } });
    db.prepare("UPDATE PasskeyChallenge SET expires_at=?").run(new Date(0).toISOString());
    const expired = await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: baseURL }, data: { action: "login-verify", response: assertion } });
    expect(expired.status()).toBe(400);
    const crossOrigin = await context.request.post(`${baseURL}/api/auth/passkeys`, { headers: { Origin: "https://attacker.example" }, data: { action: "login-options" } });
    expect(crossOrigin.status()).toBe(403);
    await page.goto("/account?tab=security");
    await page.getByRole("button", { name: "Remove Test iPhone" }).click();
    await page.getByLabel("Confirm current password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Confirm removal" }).click();
    await expect.poll(() => db.prepare("SELECT count(*) AS n FROM Passkey WHERE user_id=?").get(id) as { n: number }).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM Session WHERE passkey_id=?").get(stored.id)).toEqual({ n: 0 });
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    db.prepare("DELETE FROM User WHERE id=?").run(id); db.close();
  }
});
