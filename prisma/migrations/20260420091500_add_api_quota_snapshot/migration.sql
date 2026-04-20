CREATE TABLE IF NOT EXISTS "ApiQuotaSnapshot" (
    "source" TEXT NOT NULL PRIMARY KEY,
    "requests_limit" INTEGER,
    "requests_remaining" INTEGER,
    "requests_used" INTEGER,
    "quota_resets_at" DATETIME,
    "observed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ApiQuotaSnapshot_quota_resets_at_idx"
ON "ApiQuotaSnapshot"("quota_resets_at");
