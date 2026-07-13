-- eBay demand is based on clean active-listing observations. Disappeared
-- listings are deliberately stored as "removed", not as confirmed sales.
CREATE TABLE "CardEbayDemandListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT,
    "item_web_url" TEXT NOT NULL,
    "listing_type" TEXT NOT NULL,
    "buying_options_json" TEXT NOT NULL,
    "price_eur" REAL,
    "shipping_eur" REAL,
    "total_eur" REAL,
    "currency" TEXT NOT NULL,
    "condition" TEXT,
    "seller_username" TEXT,
    "item_creation_date" DATETIME,
    "item_end_date" DATETIME,
    "first_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "missed_scan_count" INTEGER NOT NULL DEFAULT 0,
    "last_missed_on" DATETIME,
    "removed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CardEbayDemandListing_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CardEbayDemandSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "snapshot_date" DATETIME NOT NULL,
    "observed_count" INTEGER NOT NULL,
    "clean_count" INTEGER NOT NULL,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "active_count" INTEGER NOT NULL,
    "new_count" INTEGER NOT NULL,
    "removed_count" INTEGER NOT NULL,
    "median_ask_eur" REAL,
    "lowest_ask_eur" REAL,
    "highest_ask_eur" REAL,
    "auction_count" INTEGER NOT NULL DEFAULT 0,
    "fixed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CardEbayDemandSnapshot_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CardEbayDemandListing_card_id_marketplace_id_mode_item_id_key" ON "CardEbayDemandListing"("card_id", "marketplace_id", "mode", "item_id");
CREATE INDEX "CardEbayDemandListing_card_id_marketplace_id_mode_removed_at_idx" ON "CardEbayDemandListing"("card_id", "marketplace_id", "mode", "removed_at");
CREATE INDEX "CardEbayDemandListing_card_id_marketplace_id_mode_last_seen_at_idx" ON "CardEbayDemandListing"("card_id", "marketplace_id", "mode", "last_seen_at");
CREATE INDEX "CardEbayDemandListing_item_id_marketplace_id_idx" ON "CardEbayDemandListing"("item_id", "marketplace_id");
CREATE INDEX "CardEbayDemandListing_removed_at_idx" ON "CardEbayDemandListing"("removed_at");
CREATE UNIQUE INDEX "CardEbayDemandSnapshot_card_id_marketplace_id_mode_snapshot_date_key" ON "CardEbayDemandSnapshot"("card_id", "marketplace_id", "mode", "snapshot_date");
CREATE INDEX "CardEbayDemandSnapshot_card_id_marketplace_id_mode_snapshot_date_idx" ON "CardEbayDemandSnapshot"("card_id", "marketplace_id", "mode", "snapshot_date");
CREATE INDEX "CardEbayDemandSnapshot_snapshot_date_idx" ON "CardEbayDemandSnapshot"("snapshot_date");
