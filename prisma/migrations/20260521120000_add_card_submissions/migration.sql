-- Add Firecrawl-backed submitted cards and Japanese CardMarket prices.
ALTER TABLE "Episode" ADD COLUMN "is_user_submitted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Card" ADD COLUMN "is_user_submitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Card" ADD COLUMN "submitted_by_user_id" TEXT;

ALTER TABLE "Price" ADD COLUMN "cm_jp_lowest_nm" REAL;

CREATE TABLE "CardSubmission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "game" TEXT NOT NULL DEFAULT 'pokemon',
  "input_name" TEXT NOT NULL,
  "input_set_name" TEXT NOT NULL,
  "input_card_number" TEXT,
  "input_cardmarket_url" TEXT,
  "normalized_key" TEXT NOT NULL,
  "duplicate_card_id" TEXT,
  "card_id" TEXT,
  "episode_id" TEXT,
  "official_card_id" TEXT,
  "detected_name" TEXT,
  "detected_set_name" TEXT,
  "detected_card_number" TEXT,
  "detected_language" TEXT,
  "cardmarket_url" TEXT,
  "cardmarket_id" TEXT,
  "image_url" TEXT,
  "nm_price_eur" REAL,
  "confidence" REAL,
  "warnings_json" TEXT,
  "firecrawl_search_json" TEXT,
  "firecrawl_scrape_json" TEXT,
  "search_count" INTEGER NOT NULL DEFAULT 0,
  "scrape_count" INTEGER NOT NULL DEFAULT 0,
  "credits_used" INTEGER NOT NULL DEFAULT 0,
  "last_scraped_at" DATETIME,
  "migrated_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "CardSubmission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CardSubmission_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CardSubmission_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CardSubmission_official_card_id_fkey" FOREIGN KEY ("official_card_id") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Episode_is_user_submitted_idx" ON "Episode"("is_user_submitted");
CREATE INDEX "Card_is_user_submitted_idx" ON "Card"("is_user_submitted");
CREATE INDEX "Card_submitted_by_user_id_idx" ON "Card"("submitted_by_user_id");
CREATE INDEX "CardSubmission_user_id_created_at_idx" ON "CardSubmission"("user_id", "created_at");
CREATE INDEX "CardSubmission_status_created_at_idx" ON "CardSubmission"("status", "created_at");
CREATE INDEX "CardSubmission_normalized_key_status_idx" ON "CardSubmission"("normalized_key", "status");
CREATE INDEX "CardSubmission_card_id_idx" ON "CardSubmission"("card_id");
CREATE INDEX "CardSubmission_episode_id_idx" ON "CardSubmission"("episode_id");
CREATE INDEX "CardSubmission_official_card_id_idx" ON "CardSubmission"("official_card_id");
CREATE INDEX "CardSubmission_cardmarket_id_idx" ON "CardSubmission"("cardmarket_id");
