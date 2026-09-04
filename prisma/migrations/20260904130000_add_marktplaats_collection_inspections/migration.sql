CREATE TABLE "MarktplaatsCollectionInspection" (
    "external_id" TEXT NOT NULL PRIMARY KEY,
    "scan_run_id" TEXT NOT NULL,
    "report_json" TEXT NOT NULL,
    "observed_at" DATETIME NOT NULL,
    "removed_at" DATETIME
);
CREATE INDEX "MarktplaatsCollectionInspection_removed_at_observed_at_idx" ON "MarktplaatsCollectionInspection"("removed_at", "observed_at");
