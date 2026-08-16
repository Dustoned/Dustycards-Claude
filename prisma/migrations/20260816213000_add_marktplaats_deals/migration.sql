CREATE TABLE "MarktplaatsScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'codex',
    "reference_exported_at" DATETIME,
    "started_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "listings_checked" INTEGER NOT NULL DEFAULT 0,
    "deals_found" INTEGER NOT NULL DEFAULT 0,
    "new_deals_found" INTEGER NOT NULL DEFAULT 0,
    "warning" TEXT,
    "details_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "MarktplaatsDeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "external_id" TEXT NOT NULL,
    "scan_run_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "listing_url" TEXT NOT NULL,
    "image_url" TEXT,
    "seller_name" TEXT,
    "location" TEXT,
    "card_id" TEXT,
    "episode_id" TEXT,
    "listing_price_eur" REAL NOT NULL,
    "shipping_eur" REAL,
    "market_value_eur" REAL NOT NULL,
    "savings_eur" REAL NOT NULL,
    "discount_percent" REAL NOT NULL,
    "condition" TEXT,
    "language" TEXT,
    "grading_company" TEXT,
    "grading_grade" TEXT,
    "match_confidence" REAL NOT NULL,
    "match_status" TEXT NOT NULL DEFAULT 'matched',
    "match_notes" TEXT,
    "source_published_at" DATETIME,
    "first_seen_at" DATETIME NOT NULL,
    "last_seen_at" DATETIME NOT NULL,
    "last_changed_at" DATETIME NOT NULL,
    "removed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "MarktplaatsDeal_scan_run_id_fkey" FOREIGN KEY ("scan_run_id") REFERENCES "MarktplaatsScanRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarktplaatsDeal_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MarktplaatsDeal_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MarktplaatsDeal_external_id_key" ON "MarktplaatsDeal"("external_id");
CREATE INDEX "MarktplaatsScanRun_status_started_at_idx" ON "MarktplaatsScanRun"("status", "started_at");
CREATE INDEX "MarktplaatsScanRun_finished_at_idx" ON "MarktplaatsScanRun"("finished_at");
CREATE INDEX "MarktplaatsDeal_removed_at_discount_percent_idx" ON "MarktplaatsDeal"("removed_at", "discount_percent");
CREATE INDEX "MarktplaatsDeal_kind_removed_at_discount_percent_idx" ON "MarktplaatsDeal"("kind", "removed_at", "discount_percent");
CREATE INDEX "MarktplaatsDeal_scan_run_id_idx" ON "MarktplaatsDeal"("scan_run_id");
CREATE INDEX "MarktplaatsDeal_card_id_idx" ON "MarktplaatsDeal"("card_id");
CREATE INDEX "MarktplaatsDeal_episode_id_idx" ON "MarktplaatsDeal"("episode_id");
CREATE INDEX "MarktplaatsDeal_last_seen_at_idx" ON "MarktplaatsDeal"("last_seen_at");
