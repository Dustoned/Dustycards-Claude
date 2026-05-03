ALTER TABLE "Card" ADD COLUMN "ebay_sold_graded_synced_at" DATETIME;
ALTER TABLE "Card" ADD COLUMN "ebay_sold_graded_status" TEXT;
ALTER TABLE "Card" ADD COLUMN "ebay_sold_graded_checked_at" DATETIME;

UPDATE "Card"
SET
  "ebay_sold_graded_synced_at" = (
    SELECT MAX("fetched_at")
    FROM "CardEbaySoldGradedPrice"
    WHERE "CardEbaySoldGradedPrice"."card_id" = "Card"."id"
  ),
  "ebay_sold_graded_status" = 'synced',
  "ebay_sold_graded_checked_at" = (
    SELECT MAX("fetched_at")
    FROM "CardEbaySoldGradedPrice"
    WHERE "CardEbaySoldGradedPrice"."card_id" = "Card"."id"
  )
WHERE EXISTS (
  SELECT 1
  FROM "CardEbaySoldGradedPrice"
  WHERE "CardEbaySoldGradedPrice"."card_id" = "Card"."id"
);

CREATE INDEX "Card_ebay_sold_graded_synced_at_idx"
ON "Card"("ebay_sold_graded_synced_at");

CREATE INDEX "Card_ebay_sold_graded_status_ebay_sold_graded_checked_at_idx"
ON "Card"("ebay_sold_graded_status", "ebay_sold_graded_checked_at");
