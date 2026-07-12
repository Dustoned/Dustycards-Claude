CREATE TABLE "FirecrawlCreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period_key" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "estimated_credits" INTEGER NOT NULL,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "source_url" TEXT,
    "details_json" TEXT,
    "reserved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "FirecrawlCreditLedger_idempotency_key_key" ON "FirecrawlCreditLedger"("idempotency_key");
CREATE INDEX "FirecrawlCreditLedger_period_key_status_idx" ON "FirecrawlCreditLedger"("period_key", "status");
CREATE INDEX "FirecrawlCreditLedger_consumer_period_key_status_idx" ON "FirecrawlCreditLedger"("consumer", "period_key", "status");
CREATE INDEX "FirecrawlCreditLedger_status_expires_at_idx" ON "FirecrawlCreditLedger"("status", "expires_at");

CREATE TABLE "ExternalSignalRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_at" DATETIME,
    "finished_at" DATETIME,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "details_json" TEXT,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ExternalSignalRun_kind_status_requested_at_idx" ON "ExternalSignalRun"("kind", "status", "requested_at");
CREATE INDEX "ExternalSignalRun_kind_finished_at_idx" ON "ExternalSignalRun"("kind", "finished_at");
CREATE UNIQUE INDEX "ExternalSignalRun_kind_generated_at_key" ON "ExternalSignalRun"("kind", "generated_at");

CREATE TABLE "ExternalSignalObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "card_name" TEXT NOT NULL,
    "episode_code" TEXT,
    "card_number" TEXT,
    "model_version" TEXT NOT NULL DEFAULT 'v1',
    "price_band" TEXT,
    "reference_source" TEXT,
    "reference_price" REAL,
    "reference_price_at" DATETIME,
    "is_episode_entry" BOOLEAN NOT NULL DEFAULT false,
    "external_score" REAL NOT NULL,
    "confidence" TEXT NOT NULL,
    "pressure_label" TEXT NOT NULL,
    "current_price" REAL,
    "currency" TEXT NOT NULL,
    "max_deck_share_percent" REAL NOT NULL,
    "max_inclusion_percent" REAL NOT NULL,
    "archetype_count" INTEGER NOT NULL,
    "catalyst_score" REAL NOT NULL DEFAULT 0,
    "hype_score" REAL NOT NULL DEFAULT 0,
    "risk_score" REAL NOT NULL DEFAULT 0,
    "hit_rate_15x_90" REAL,
    "hit_rate_2x_90" REAL,
    "hit_rate_3x_180" REAL,
    "sample_size_90" INTEGER,
    "sample_size_180" INTEGER,
    "reasons_json" TEXT NOT NULL,
    "evidence_json" TEXT NOT NULL,
    "observed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalSignalObservation_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ExternalSignalRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExternalSignalObservation_run_id_card_id_key" ON "ExternalSignalObservation"("run_id", "card_id");
CREATE INDEX "ExternalSignalObservation_card_id_observed_at_idx" ON "ExternalSignalObservation"("card_id", "observed_at");
CREATE INDEX "ExternalSignalObservation_game_external_score_idx" ON "ExternalSignalObservation"("game", "external_score");
CREATE INDEX "ExternalSignalObservation_observed_at_idx" ON "ExternalSignalObservation"("observed_at");

CREATE TABLE "ExternalSignalOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entry_observation_id" TEXT NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "evaluated_at" DATETIME,
    "observed_days" INTEGER NOT NULL DEFAULT 0,
    "coverage_ratio" REAL NOT NULL DEFAULT 0,
    "max_reference_price" REAL,
    "max_multiplier" REAL,
    "end_reference_price" REAL,
    "hit_15x" BOOLEAN,
    "hit_2x" BOOLEAN,
    "hit_3x" BOOLEAN,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,

    CONSTRAINT "ExternalSignalOutcome_entry_observation_id_fkey" FOREIGN KEY ("entry_observation_id") REFERENCES "ExternalSignalObservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExternalSignalOutcome_entry_observation_id_horizon_days_key" ON "ExternalSignalOutcome"("entry_observation_id", "horizon_days");
CREATE INDEX "ExternalSignalOutcome_horizon_days_status_evaluated_at_idx" ON "ExternalSignalOutcome"("horizon_days", "status", "evaluated_at");
CREATE INDEX "ExternalSignalOutcome_entry_observation_id_idx" ON "ExternalSignalOutcome"("entry_observation_id");

CREATE TABLE "ExternalCatalystSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonical_url" TEXT NOT NULL,
    "url_hash" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "published_at" DATETIME,
    "first_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_scraped_at" DATETIME,
    "scrape_status" TEXT NOT NULL DEFAULT 'pending',
    "content_hash" TEXT,
    "content_excerpt" TEXT,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ExternalCatalystSource_canonical_url_key" ON "ExternalCatalystSource"("canonical_url");
CREATE UNIQUE INDEX "ExternalCatalystSource_url_hash_key" ON "ExternalCatalystSource"("url_hash");
CREATE INDEX "ExternalCatalystSource_game_last_seen_at_idx" ON "ExternalCatalystSource"("game", "last_seen_at");
CREATE INDEX "ExternalCatalystSource_source_type_last_seen_at_idx" ON "ExternalCatalystSource"("source_type", "last_seen_at");
CREATE INDEX "ExternalCatalystSource_scrape_status_last_seen_at_idx" ON "ExternalCatalystSource"("scrape_status", "last_seen_at");

CREATE TABLE "ExternalCardCatalyst" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_id" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "card_id" TEXT,
    "game" TEXT NOT NULL,
    "catalyst_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "strength" REAL NOT NULL,
    "headline" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence_excerpt" TEXT,
    "observed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,

    CONSTRAINT "ExternalCardCatalyst_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "ExternalCatalystSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExternalCardCatalyst_source_id_entity_key_catalyst_type_key" ON "ExternalCardCatalyst"("source_id", "entity_key", "catalyst_type");
CREATE INDEX "ExternalCardCatalyst_card_id_observed_at_idx" ON "ExternalCardCatalyst"("card_id", "observed_at");
CREATE INDEX "ExternalCardCatalyst_game_observed_at_idx" ON "ExternalCardCatalyst"("game", "observed_at");
CREATE INDEX "ExternalCardCatalyst_catalyst_type_direction_observed_at_idx" ON "ExternalCardCatalyst"("catalyst_type", "direction", "observed_at");
CREATE INDEX "ExternalCardCatalyst_expires_at_idx" ON "ExternalCardCatalyst"("expires_at");
