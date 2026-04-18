ALTER TABLE "Card" ADD COLUMN "price_source_status" TEXT;
ALTER TABLE "Card" ADD COLUMN "price_source_checked_at" DATETIME;

CREATE INDEX "Card_price_source_status_price_source_checked_at_idx"
ON "Card"("price_source_status", "price_source_checked_at");
