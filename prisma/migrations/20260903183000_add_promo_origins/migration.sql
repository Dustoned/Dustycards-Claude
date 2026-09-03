-- Store the verified distribution source of promotional cards. An origin can
-- optionally link to an existing sealed product, but it can also be an event
-- or retailer distribution that has no sealed-product record.
CREATE TABLE "CardPromoOrigin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "product_id" TEXT,
    "origin_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "origin_type" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.95,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CardPromoOrigin_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardPromoOrigin_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "SealedProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CardPromoOrigin_card_id_normalized_name_key" ON "CardPromoOrigin"("card_id", "normalized_name");
CREATE INDEX "CardPromoOrigin_card_id_idx" ON "CardPromoOrigin"("card_id");
CREATE INDEX "CardPromoOrigin_product_id_idx" ON "CardPromoOrigin"("product_id");
CREATE INDEX "CardPromoOrigin_origin_type_idx" ON "CardPromoOrigin"("origin_type");
CREATE INDEX "CardPromoOrigin_source_name_idx" ON "CardPromoOrigin"("source_name");
