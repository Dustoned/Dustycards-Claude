ALTER TABLE "Episode" ADD COLUMN "source_status" TEXT;
ALTER TABLE "Episode" ADD COLUMN "source_checked_at" DATETIME;
ALTER TABLE "Episode" ADD COLUMN "source_actual_card_count" INTEGER;

CREATE INDEX "Episode_source_status_source_checked_at_idx"
ON "Episode"("source_status", "source_checked_at");
