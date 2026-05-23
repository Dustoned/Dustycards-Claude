ALTER TABLE "CollectionCard" ADD COLUMN "for_sale" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CollectionCard_user_id_for_sale_idx" ON "CollectionCard"("user_id", "for_sale");
