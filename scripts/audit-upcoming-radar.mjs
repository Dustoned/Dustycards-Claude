import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { createUpcomingCatalogPolicy } from "../src/lib/upcoming-catalog-policy.ts";

const db = new Database(process.argv[2] ?? "dustycards.db", { readonly: true, fileMustExist: true });
try {
  const sets = db.prepare("SELECT name,release_date FROM Episode WHERE game='pokemon'").all();
  const policy = createUpcomingCatalogPolicy(sets, new Date().toISOString().slice(0, 10));
  const sources = db.prepare("SELECT title,metadata_json FROM ExternalCatalystSource WHERE game='pokemon'").all();
  const expiredStories = sources.flatMap((source) => {
    let reveals = [];
    try { reveals = (JSON.parse(source.metadata_json ?? "{}").upcomingReveals ?? []).map((reveal) => ({ ...reveal, episodeName: reveal.episodeName ?? source.title })); } catch { /* missing metadata */ }
    return source.title && !policy.showStory(source.title, reveals) ? [source.title] : [];
  });
  let radar = [];
  try { radar = JSON.parse(readFileSync("data/signal-radar-snapshots/one-piece.json", "utf8")).data.signals; } catch { /* no snapshot */ }
  const cardById = db.prepare("SELECT id,name,game FROM Card WHERE id=?");
  console.log(JSON.stringify({ expiredStories, onePieceCards: db.prepare("SELECT COUNT(*) AS n FROM Card WHERE game='one-piece'").get().n,
    radarCards: radar.map((signal) => ({ id: signal.cardId, exists: Boolean(cardById.get(signal.cardId)) })),
    examples: ["one-piece:28995", "one-piece:51333"].map((id) => cardById.get(id) ?? { id, missing: true }),
  }, null, 2));
} finally { db.close(); }
