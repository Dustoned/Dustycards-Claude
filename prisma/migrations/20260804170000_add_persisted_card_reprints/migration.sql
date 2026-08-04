-- Reprint evidence and verified relations are built by the background matcher.
-- Card-detail requests only read these rows and never call external providers.
CREATE TABLE "CardPrintingEvidence" (
    "card_id" TEXT NOT NULL PRIMARY KEY,
    "image_url" TEXT NOT NULL,
    "identity_json" TEXT,
    "artwork_hash_full" TEXT,
    "artwork_hash_illustration" TEXT,
    "source_status" TEXT NOT NULL,
    "source_checked_at" DATETIME NOT NULL,
    "match_status" TEXT,
    "match_version" TEXT,
    "matched_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CardPrintingEvidence_card_id_fkey"
      FOREIGN KEY ("card_id") REFERENCES "Card" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CardPrintingRelation" (
    "source_card_id" TEXT NOT NULL,
    "target_card_id" TEXT NOT NULL,
    "match_type" TEXT NOT NULL DEFAULT 'reprint',
    "match_method" TEXT NOT NULL,
    "image_similarity" REAL NOT NULL,
    "model_version" TEXT NOT NULL,
    "matched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("source_card_id", "target_card_id"),
    CONSTRAINT "CardPrintingRelation_source_card_id_fkey"
      FOREIGN KEY ("source_card_id") REFERENCES "Card" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardPrintingRelation_target_card_id_fkey"
      FOREIGN KEY ("target_card_id") REFERENCES "Card" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CardPrintingEvidence_match_status_matched_at_idx"
  ON "CardPrintingEvidence"("match_status", "matched_at");
CREATE INDEX "CardPrintingEvidence_match_version_matched_at_idx"
  ON "CardPrintingEvidence"("match_version", "matched_at");
CREATE INDEX "CardPrintingEvidence_source_status_source_checked_at_idx"
  ON "CardPrintingEvidence"("source_status", "source_checked_at");
CREATE INDEX "CardPrintingRelation_target_card_id_idx"
  ON "CardPrintingRelation"("target_card_id");
CREATE INDEX "CardPrintingRelation_model_version_matched_at_idx"
  ON "CardPrintingRelation"("model_version", "matched_at");
