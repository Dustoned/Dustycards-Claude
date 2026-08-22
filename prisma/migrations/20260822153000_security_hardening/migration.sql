ALTER TABLE "User" ADD COLUMN "mfa_secret_encrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "mfa_recovery_codes_json" TEXT;
ALTER TABLE "User" ADD COLUMN "mfa_enabled_at" DATETIME;

ALTER TABLE "Session" ADD COLUMN "mfa_verified_at" DATETIME;

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "hits_json" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
CREATE INDEX "RateLimitBucket_expires_at_idx" ON "RateLimitBucket"("expires_at");

CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "ip_hash" TEXT,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SecurityEvent_event_type_created_at_idx" ON "SecurityEvent"("event_type", "created_at");
CREATE INDEX "SecurityEvent_severity_created_at_idx" ON "SecurityEvent"("severity", "created_at");
CREATE INDEX "SecurityEvent_user_id_created_at_idx" ON "SecurityEvent"("user_id", "created_at");
CREATE INDEX "SecurityEvent_created_at_idx" ON "SecurityEvent"("created_at");
