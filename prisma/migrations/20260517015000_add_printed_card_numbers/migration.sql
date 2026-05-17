ALTER TABLE "Episode" ADD COLUMN "printed_card_count" INTEGER;
ALTER TABLE "Card" ADD COLUMN "printed_card_number" TEXT;
CREATE INDEX "Episode_printed_card_count_idx" ON "Episode"("printed_card_count");
CREATE INDEX "Card_printed_card_number_idx" ON "Card"("printed_card_number");
