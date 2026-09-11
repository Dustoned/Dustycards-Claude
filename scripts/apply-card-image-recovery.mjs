import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

export function applyCardImageRecovery(manifestPath, databasePath, apply = false) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.cards) || !manifest.cards.length || manifest.cards.length > 500) throw new Error("Invalid image recovery manifest");
  const root = path.resolve(path.dirname(manifestPath), "..");
  const seen = new Set();
  for (const card of manifest.cards) {
    if (typeof card.id !== "string" || !card.id || seen.has(card.id) || typeof card.name !== "string" ||
        !(card.beforeImageUrl === null || typeof card.beforeImageUrl === "string") ||
        !/^[a-f0-9]{64}\.webp$/.test(card.file)) throw new Error("Invalid image recovery entry");
    seen.add(card.id);
    const bytes = fs.readFileSync(path.join(root, "public", card.file));
    if (createHash("sha256").update(bytes).digest("hex") !== card.file.slice(0, 64) ||
        bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw new Error(`Invalid image bytes for ${card.id}`);
  }
  const db = new Database(databasePath, { readonly: !apply, fileMustExist: true, timeout: 10000 });
  try {
    const read = db.prepare("SELECT id, name, image_url FROM Card WHERE id = ?");
    const result = { changed: 0, alreadyApplied: 0, skipped: [], applied: apply };
    const execute = () => {
      const changes = [];
      for (const card of manifest.cards) {
        const current = read.get(card.id);
        const next = `/card-images/${card.file}`;
        if (current?.image_url === next) { result.alreadyApplied++; continue; }
        if (!current || current.name !== card.name || current.image_url !== card.beforeImageUrl) {
          result.skipped.push({ id: card.id, reason: "Card identity or image changed since audit" });
          continue;
        }
        changes.push({ id: card.id, before: current.image_url, after: next });
      }
      if (apply && changes.length) {
        // A small, targeted rollback file avoids copying the multi-GB price DB.
        const backup = path.join(path.dirname(manifestPath), `rollback-${Date.now()}.json`);
        fs.writeFileSync(backup, JSON.stringify(changes, null, 2), { flag: "wx", mode: 0o600 });
        const update = db.prepare("UPDATE Card SET image_url = ? WHERE id = ? AND image_url IS ?");
        for (const change of changes) {
          if (update.run(change.after, change.id, change.before).changes !== 1) throw new Error("Concurrent image change; rolled back");
        }
      }
      result.changed = changes.length;
    };
    if (apply) db.transaction(execute).immediate(); else execute();
    return result;
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , mode, manifestPath, databasePath] = process.argv;
  if (!["--apply", "--dry-run"].includes(mode) || !manifestPath || !databasePath) throw new Error("Usage: --apply|--dry-run manifest.json database.db");
  console.log(JSON.stringify(applyCardImageRecovery(manifestPath, databasePath, mode === "--apply")));
}
