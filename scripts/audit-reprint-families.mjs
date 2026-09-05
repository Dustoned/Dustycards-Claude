import Database from "better-sqlite3";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { haveSameKnownPrintingArtist, isEligiblePrintFamilyPair } from "../src/lib/print-family-policy.ts";

export function auditReprintFamilies(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const counts = { pairs: 0, eligible: 0, artistConflict: 0, missingArtist: 0, uncertainArtwork: 0, excludedByReview: 0, invalidIdentity: 0 };
    const samples = {};
    const models = {};
    let eligibleWithSupportedModel = 0;
    const rows = db.prepare(`SELECT r.source_card_id, r.target_card_id, r.match_method, r.image_similarity, r.model_version,
      s.name AS sourceName,s.artist AS sourceArtist,s.game AS sourceGame,s.episode_id AS sourceEpisode,
      t.name AS targetName,t.artist AS targetArtist,t.game AS targetGame,t.episode_id AS targetEpisode,
      o.decision FROM CardPrintingRelation r JOIN Card s ON s.id=r.source_card_id JOIN Card t ON t.id=r.target_card_id
      LEFT JOIN CardPrintingOverride o ON (o.source_card_id=r.source_card_id AND o.target_card_id=r.target_card_id) OR (o.source_card_id=r.target_card_id AND o.target_card_id=r.source_card_id)
      WHERE r.source_card_id < r.target_card_id`);
    for (const row of rows.iterate()) {
      counts.pairs++;
      models[row.model_version] = (models[row.model_version] || 0) + 1;
      const category = row.decision === "exclude" ? "excludedByReview" : row.sourceName !== row.targetName || row.sourceGame !== row.targetGame ? "invalidIdentity" : !row.sourceArtist?.trim() || !row.targetArtist?.trim() ? "missingArtist" : !haveSameKnownPrintingArtist(row.sourceArtist,row.targetArtist) ? "artistConflict" : isEligiblePrintFamilyPair(row.sourceEpisode,row.targetEpisode,row.sourceArtist,row.targetArtist,row.match_method,row.image_similarity) ? "eligible" : "uncertainArtwork";
      counts[category]++;
      if (category === "eligible" && ["reprint-v12-exact-rules", "reprint-v13-artwork-family", "reprint-v14-review-uncertainty"].includes(row.model_version)) eligibleWithSupportedModel++;
      samples[category] ??= [];
      if (samples[category].length < 12) samples[category].push(row);
    }
    return { auditedAt: new Date().toISOString(), cards: db.prepare("SELECT count(*) AS n FROM Card").get().n, ...counts, eligibleWithSupportedModel, models, samples };
  } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(auditReprintFamilies(path.resolve(process.argv[2] || "dustycards.db")), null, 2));
}
