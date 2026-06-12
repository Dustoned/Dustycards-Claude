CREATE TABLE "EbayWatchedListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "item_web_url" TEXT NOT NULL,
    "image_url" TEXT,
    "card_id" TEXT,
    "sealed_product_id" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'raw',
    "price_eur" REAL,
    "reference_eur" REAL,
    "discount_percent" REAL,
    "seller_username" TEXT,
    "item_end_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EbayWatchedListing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EbayWatchedListing_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EbayWatchedListing_user_id_marketplace_id_item_id_key" ON "EbayWatchedListing"("user_id", "marketplace_id", "item_id");

CREATE INDEX "EbayWatchedListing_user_id_created_at_idx" ON "EbayWatchedListing"("user_id", "created_at");

CREATE INDEX "EbayWatchedListing_card_id_idx" ON "EbayWatchedListing"("card_id");
