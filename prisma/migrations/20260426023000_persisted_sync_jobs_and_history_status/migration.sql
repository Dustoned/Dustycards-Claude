ALTER TABLE "Card" ADD COLUMN "native_history_status" TEXT;
ALTER TABLE "Card" ADD COLUMN "native_history_checked_at" DATETIME;

ALTER TABLE "SealedProduct" ADD COLUMN "native_history_status" TEXT;
ALTER TABLE "SealedProduct" ADD COLUMN "native_history_checked_at" DATETIME;

UPDATE "Card"
SET
  "native_history_status" = 'synced',
  "native_history_checked_at" = "native_history_synced_at"
WHERE "native_history_synced_at" IS NOT NULL
  AND "native_history_status" IS NULL;

UPDATE "SealedProduct"
SET
  "native_history_status" = 'synced',
  "native_history_checked_at" = "native_history_synced_at"
WHERE "native_history_synced_at" IS NOT NULL
  AND "native_history_status" IS NULL;

CREATE TABLE "SyncJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "details_json" TEXT,
  "started_at" DATETIME,
  "finished_at" DATETIME,
  "heartbeat_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "SyncJob_type_key" ON "SyncJob"("type");
CREATE INDEX "SyncJob_status_updated_at_idx" ON "SyncJob"("status", "updated_at");
CREATE INDEX "SyncJob_type_status_idx" ON "SyncJob"("type", "status");

CREATE INDEX "Card_native_history_status_native_history_checked_at_idx"
ON "Card"("native_history_status", "native_history_checked_at");

CREATE INDEX "SealedProduct_native_history_status_native_history_checked_at_idx"
ON "SealedProduct"("native_history_status", "native_history_checked_at");
