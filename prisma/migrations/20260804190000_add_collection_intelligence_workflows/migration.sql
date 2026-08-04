-- Reviewable reprint corrections keep human decisions separate from generated matches.
CREATE TABLE "CardPrintingOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "source_card_id" TEXT NOT NULL,
    "target_card_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CardPrintingOverride_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CardPrintingOverride_source_card_id_fkey"
      FOREIGN KEY ("source_card_id") REFERENCES "Card" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardPrintingOverride_target_card_id_fkey"
      FOREIGN KEY ("target_card_id") REFERENCES "Card" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CardPrintingOverride_source_card_id_target_card_id_key"
  ON "CardPrintingOverride"("source_card_id", "target_card_id");
CREATE INDEX "CardPrintingOverride_decision_updated_at_idx"
  ON "CardPrintingOverride"("decision", "updated_at");
CREATE INDEX "CardPrintingOverride_user_id_updated_at_idx"
  ON "CardPrintingOverride"("user_id", "updated_at");

-- Opening sessions connect sealed cost and every pulled collection copy.
CREATE TABLE "SealedOpeningSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "collection_sealed_id" TEXT,
    "sealed_product_id" TEXT NOT NULL,
    "title" TEXT,
    "packs_opened" INTEGER NOT NULL DEFAULT 1,
    "opened_cost_eur" REAL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "SealedOpeningSession_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SealedOpeningSession_collection_sealed_id_fkey"
      FOREIGN KEY ("collection_sealed_id") REFERENCES "CollectionSealed" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SealedOpeningSession_sealed_product_id_fkey"
      FOREIGN KEY ("sealed_product_id") REFERENCES "SealedProduct" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SealedOpeningSession_user_id_opened_at_idx"
  ON "SealedOpeningSession"("user_id", "opened_at");
CREATE INDEX "SealedOpeningSession_collection_sealed_id_idx"
  ON "SealedOpeningSession"("collection_sealed_id");
CREATE INDEX "SealedOpeningSession_sealed_product_id_opened_at_idx"
  ON "SealedOpeningSession"("sealed_product_id", "opened_at");
CREATE INDEX "SealedOpeningSession_status_updated_at_idx"
  ON "SealedOpeningSession"("status", "updated_at");

ALTER TABLE "CollectionCard" ADD COLUMN "opening_session_id" TEXT
  REFERENCES "SealedOpeningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionCard" ADD COLUMN "sale_fee_eur" REAL;
ALTER TABLE "CollectionCard" ADD COLUMN "sale_platform" TEXT;
CREATE INDEX "CollectionCard_opening_session_id_idx"
  ON "CollectionCard"("opening_session_id");

-- A scored call must move enough in both percentage and euros to be useful.
ALTER TABLE "ExternalSignalOutcome" ADD COLUMN "absolute_change_eur" REAL;
ALTER TABLE "ExternalSignalOutcome" ADD COLUMN "meaningful_move" BOOLEAN;
ALTER TABLE "ExternalSignalOutcome" ADD COLUMN "meaningful_direction_hit" BOOLEAN;
