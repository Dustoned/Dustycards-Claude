ALTER TABLE "SyncLog" ADD COLUMN "details_json" TEXT;

CREATE INDEX "Price_fetched_at_idx" ON "Price"("fetched_at");

CREATE INDEX "SyncLog_type_status_started_at_idx"
ON "SyncLog"("type", "status", "started_at");

CREATE INDEX "SyncLog_type_status_finished_at_idx"
ON "SyncLog"("type", "status", "finished_at");

CREATE INDEX "Card_native_history_synced_at_idx"
ON "Card"("native_history_synced_at");

CREATE INDEX "Card_tcggo_url_price_source_status_price_source_checked_at_idx"
ON "Card"("tcggo_url", "price_source_status", "price_source_checked_at");

CREATE INDEX "SealedProduct_native_history_synced_at_idx"
ON "SealedProduct"("native_history_synced_at");

CREATE INDEX "CollectionCard_card_id_added_at_idx"
ON "CollectionCard"("card_id", "added_at");

CREATE INDEX "CollectionCard_binder_id_added_at_idx"
ON "CollectionCard"("binder_id", "added_at");

CREATE INDEX "CollectionSealed_product_id_added_at_idx"
ON "CollectionSealed"("product_id", "added_at");
