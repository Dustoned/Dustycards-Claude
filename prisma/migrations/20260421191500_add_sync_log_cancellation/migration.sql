ALTER TABLE "SyncLog" ADD COLUMN "cancel_requested_at" DATETIME;

CREATE INDEX "SyncLog_cancel_requested_at_idx" ON "SyncLog"("cancel_requested_at");
