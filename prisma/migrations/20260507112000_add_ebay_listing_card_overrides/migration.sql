CREATE TABLE "EbayListingCardOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "card_id" TEXT,
    "status" TEXT NOT NULL,
    "title_snapshot" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "EbayListingCardOverride_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EbayListingCardOverride_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EbayListingCardOverride_user_id_marketplace_id_item_id_key"
ON "EbayListingCardOverride"("user_id", "marketplace_id", "item_id");

CREATE INDEX "EbayListingCardOverride_card_id_idx"
ON "EbayListingCardOverride"("card_id");

CREATE INDEX "EbayListingCardOverride_user_id_status_idx"
ON "EbayListingCardOverride"("user_id", "status");
