CREATE TABLE "CardSealedProduct" (
    "card_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "relation_type" TEXT NOT NULL DEFAULT 'included_promo',
    "source_name" TEXT,
    "source_url" TEXT,
    "confidence" REAL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("card_id", "product_id"),
    CONSTRAINT "CardSealedProduct_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardSealedProduct_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "SealedProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CardSealedProduct_card_id_idx" ON "CardSealedProduct"("card_id");
CREATE INDEX "CardSealedProduct_product_id_idx" ON "CardSealedProduct"("product_id");
CREATE INDEX "CardSealedProduct_relation_type_idx" ON "CardSealedProduct"("relation_type");
