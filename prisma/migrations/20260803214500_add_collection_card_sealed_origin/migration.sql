ALTER TABLE "CollectionCard"
ADD COLUMN "origin_sealed_product_id" TEXT
REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCard"
ADD COLUMN "purchase_price_source" TEXT;

CREATE INDEX "CollectionCard_origin_sealed_product_id_idx"
ON "CollectionCard"("origin_sealed_product_id");
