ALTER TABLE "Price" ADD COLUMN "source" TEXT;
ALTER TABLE "Price" ADD COLUMN "source_provider" TEXT;
ALTER TABLE "Price" ADD COLUMN "source_url" TEXT;

CREATE INDEX "Price_source_fetched_at_idx" ON "Price"("source", "fetched_at");

CREATE TABLE "NewReleaseChasePriceWatch" (
    "card_id" TEXT NOT NULL PRIMARY KEY,
    "episode_id" TEXT NOT NULL,
    "candidate_rank" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "first_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" DATETIME,
    "last_success_at" DATETIME,
    "next_attempt_at" DATETIME,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "last_error" TEXT,
    "candidate_price" REAL,
    "candidate_observed_at" DATETIME,
    "candidate_confirmations" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "NewReleaseChasePriceWatch_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NewReleaseChasePriceWatch_episode_id_candidate_rank_idx" ON "NewReleaseChasePriceWatch"("episode_id", "candidate_rank");
CREATE INDEX "NewReleaseChasePriceWatch_status_next_attempt_at_idx" ON "NewReleaseChasePriceWatch"("status", "next_attempt_at");
CREATE INDEX "NewReleaseChasePriceWatch_next_attempt_at_idx" ON "NewReleaseChasePriceWatch"("next_attempt_at");

CREATE TABLE "ScrapeDoCreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period_key" TEXT NOT NULL,
    "day_key" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "estimated_credits" INTEGER NOT NULL,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "remaining_credits" INTEGER,
    "source_url" TEXT,
    "details_json" TEXT,
    "reserved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ScrapeDoCreditLedger_idempotency_key_key" ON "ScrapeDoCreditLedger"("idempotency_key");
CREATE INDEX "ScrapeDoCreditLedger_period_key_status_idx" ON "ScrapeDoCreditLedger"("period_key", "status");
CREATE INDEX "ScrapeDoCreditLedger_day_key_status_idx" ON "ScrapeDoCreditLedger"("day_key", "status");
CREATE INDEX "ScrapeDoCreditLedger_consumer_period_key_status_idx" ON "ScrapeDoCreditLedger"("consumer", "period_key", "status");
CREATE INDEX "ScrapeDoCreditLedger_consumer_day_key_status_idx" ON "ScrapeDoCreditLedger"("consumer", "day_key", "status");
CREATE INDEX "ScrapeDoCreditLedger_status_expires_at_idx" ON "ScrapeDoCreditLedger"("status", "expires_at");
