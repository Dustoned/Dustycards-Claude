ALTER TABLE "CollectionCard" ADD COLUMN "sale_price" REAL;
ALTER TABLE "CollectionCard" ADD COLUMN "sold_at" DATETIME;

CREATE INDEX "CollectionCard_user_id_for_sale_sold_at_idx" ON "CollectionCard"("user_id", "for_sale", "sold_at");
CREATE INDEX "CollectionCard_sold_at_idx" ON "CollectionCard"("sold_at");
