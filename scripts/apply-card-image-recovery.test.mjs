import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { applyCardImageRecovery } from "./apply-card-image-recovery.mjs";

const temporary = [];
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dustycards-image-recovery-"));
  temporary.push(dir);
  fs.mkdirSync(path.join(dir, "public")); fs.mkdirSync(path.join(dir, "import"));
  const data = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).webp().toBuffer();
  const file = `${createHash("sha256").update(data).digest("hex")}.webp`;
  fs.writeFileSync(path.join(dir, "public", file), data);
  const manifest = { cards: [{ id: "a", name: "Card A", beforeImageUrl: "old", file }] };
  const manifestPath = path.join(dir, "import", "manifest.json");
  const databasePath = path.join(dir, "test.db");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const db = new Database(databasePath);
  db.exec("CREATE TABLE Card(id TEXT PRIMARY KEY, name TEXT, image_url TEXT); INSERT INTO Card VALUES ('a','Card A','old')"); db.close();
  return { dir, manifest, manifestPath, databasePath, file };
}
it("dry-runs, applies with rollback record, and is idempotent", async () => {
  const f = await fixture();
  expect(applyCardImageRecovery(f.manifestPath, f.databasePath).changed).toBe(1);
  expect(fs.readdirSync(path.join(f.dir, "import"))).toHaveLength(1);
  expect(applyCardImageRecovery(f.manifestPath, f.databasePath, true).changed).toBe(1);
  expect(fs.readdirSync(path.join(f.dir, "import")).some(n => n.startsWith("rollback-"))).toBe(true);
  expect(applyCardImageRecovery(f.manifestPath, f.databasePath, true).alreadyApplied).toBe(1);
});
it("does not overwrite image edits made after the audit", async () => {
  const f = await fixture(); const db = new Database(f.databasePath); db.exec("UPDATE Card SET image_url='newer'"); db.close();
  const result = applyCardImageRecovery(f.manifestPath, f.databasePath, true);
  expect(result.changed).toBe(0); expect(result.skipped).toHaveLength(1);
});
it("rejects changed bytes before updating the database", async () => {
  const f = await fixture(); fs.writeFileSync(path.join(f.dir, "public", f.file), "invalid");
  expect(() => applyCardImageRecovery(f.manifestPath, f.databasePath, true)).toThrow("Invalid image bytes");
});
it("rejects path traversal and duplicate card ids", async () => {
  const f = await fixture();
  f.manifest.cards.push(f.manifest.cards[0]); fs.writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
  expect(() => applyCardImageRecovery(f.manifestPath, f.databasePath, true)).toThrow("Invalid image recovery entry");
  f.manifest.cards = [{ ...f.manifest.cards[0], file: "../secret.webp" }]; fs.writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
  expect(() => applyCardImageRecovery(f.manifestPath, f.databasePath, true)).toThrow("Invalid image recovery entry");
});
