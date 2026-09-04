import { test as base, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashSessionToken } from "@/lib/auth-crypto";
import { DEFAULT_APPEARANCE_SETTINGS } from "@/lib/appearance-themes";
import sharp from "sharp";
import jsQR from "jsqr";

const test = base.extend<{ accountSession: void }>({
  accountSession: async ({ context, baseURL }, provideSession) => {
    if (!process.env.DUSTYCARDS_DATABASE_PATH || !baseURL || new URL(baseURL).hostname !== "127.0.0.1") {
      throw new Error("Account UI tests require a local server and a disposable migrated DUSTYCARDS_DATABASE_PATH.");
    }
    const db = new Database(process.env.DUSTYCARDS_DATABASE_PATH, { fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    const id = `account-ui-${randomUUID()}`;
    const token = randomUUID();
    const now = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO User (id, email, password_hash, role, disabled, email_verified_at, created_at, updated_at)
        VALUES (?, ?, 'unused-ui-test-hash', 'user', 0, ?, ?, ?)`).run(id, `${id}@example.test`, now, now, now);
      db.prepare(`INSERT INTO Session (id, user_id, token_hash, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, id, hashSessionToken(token), new Date(Date.now() + 3_600_000).toISOString(), now, now);
      await context.addCookies([{ name: "dustycards-session", value: token, url: baseURL }]);
      await provideSession();
    } finally {
      db.prepare("DELETE FROM User WHERE id = ?").run(id);
      db.close();
    }
  },
});

test("authenticator setup displays a locally generated, decodable QR code", async ({ page, accountSession }) => {
  void accountSession;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/account?tab=security");
  const prepared = page.waitForResponse((response) => response.url().endsWith("/api/auth/mfa") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const response = await prepared;
  expect(response.headers()["cache-control"]).toBe("no-store");
  const { uri, qrCode } = await response.json();
  const qr = page.getByRole("img", { name: "Authenticator setup QR code" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", qrCode);
  const { data, info } = await sharp(Buffer.from(qrCode.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(uri);
  await expect(page.getByRole("link", { name: "Open in authenticator app" })).toHaveAttribute("href", uri);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  if (process.env.AUDIT_FOLLOWUP_SCREENSHOTS) await page.screenshot({ path: `${process.env.AUDIT_FOLLOWUP_SCREENSHOTS}/390-authenticator-qr.png`, fullPage: true });
});

test("verification resend uses the edited address displayed to the user", async ({ page }) => {
  await page.route("**/api/auth/resend-verification", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/login?verify=sent&email=old%40example.test");
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await expect(page.getByText("Send a fresh verification link to new@example.test.")).toBeVisible();
  const request = page.waitForRequest("**/api/auth/resend-verification");
  await page.getByRole("button", { name: "Resend verification email" }).click();
  expect((await request).postDataJSON().email).toBe("new@example.test");
  await expect(page.getByRole("status").filter({ hasText: "Verification email sent to new@example.test." })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("");
  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeDisabled();
});

for (const width of [390, 1440]) {
  test(`account security feedback and recovery codes survive tab changes at ${width}px`, async ({ page, context, accountSession }) => {
    void accountSession;
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript((appearance) => {
      localStorage.setItem("dustycards-settings", JSON.stringify({ appearance: { ...appearance, preset: "porcelain-studio" } }));
    }, DEFAULT_APPEARANCE_SETTINGS);
    expect((await page.request.put("/api/account/settings", {
      data: { settings: { appearance: { ...DEFAULT_APPEARANCE_SETTINGS, preset: "porcelain-studio" } } },
    })).ok()).toBe(true);
    const recoveryCodes = ["ABCD-1234", "EFGH-5678"];
    let enabledAttempt = false;
    await page.route("**/api/auth/mfa", async (route) => {
      if (route.request().postDataJSON().action === "prepare") {
        return route.fulfill({ json: { secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/DustyCards?secret=JBSWY3DPEHPK3PXP" } });
      }
      if (!enabledAttempt) {
        enabledAttempt = true;
        return route.fulfill({ status: 400, json: { error: "Invalid authenticator code" } });
      }
      return route.fulfill({ json: { recoveryCodes } });
    });
    await page.goto("/account");
    await page.getByRole("tab", { name: "Security", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-appearance-scheme", "light");
    const passwordButtonColors = await page.getByRole("button", { name: "Save password" }).evaluate((button) => {
      const style = getComputedStyle(button);
      return { foreground: style.color, background: style.backgroundColor };
    });
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(passwordButtonColors.foreground);
    const background = luminance(passwordButtonColors.background);
    expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await page.getByRole("button", { name: "Copy setup key" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("JBSWY3DPEHPK3PXP");
    await page.getByLabel("Six-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify and enable" }).click();
    await expect(page.locator("#account-mfa-error")).toHaveText("Invalid authenticator code");
    await expect(page.getByLabel("Six-digit code")).toHaveAttribute("aria-describedby", "account-mfa-error");
    await expect(page.getByLabel("Current password", { exact: true })).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#account-security-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Verify and enable" }).click();
    await expect(page.getByText(recoveryCodes[0], { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.getByRole("tab", { name: "Security", exact: true }).click();
    await expect(page.getByText(recoveryCodes[0], { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy recovery codes" }).click();
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(recoveryCodes.join("\n"));
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download codes" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("dustycards-recovery-codes.txt");
    expect(await readFile((await file.path())!, "utf8")).toContain(recoveryCodes.join("\n"));
    await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeDisabled();
    await page.getByLabel("I have saved my recovery codes somewhere private.").check();
    await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
