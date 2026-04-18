ALTER TABLE "Card" ADD COLUMN "cardmarket_url" TEXT;

CREATE INDEX "Card_episode_id_idx" ON "Card"("episode_id");
CREATE INDEX "Card_episode_id_card_number_idx" ON "Card"("episode_id", "card_number");
CREATE INDEX "Price_card_id_fetched_at_idx" ON "Price"("card_id", "fetched_at");
CREATE INDEX "SyncLog_status_started_at_idx" ON "SyncLog"("status", "started_at");
