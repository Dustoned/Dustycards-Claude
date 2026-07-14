-- CreateTable
CREATE TABLE "SetLifecycleObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episode_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "oop_probability" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "release_age_days" INTEGER,
    "product_count" INTEGER NOT NULL DEFAULT 0,
    "priced_product_count" INTEGER NOT NULL DEFAULT 0,
    "pack_product_count" INTEGER NOT NULL DEFAULT 0,
    "latest_product_release_at" DATETIME,
    "latest_supply_observed_at" DATETIME,
    "trend_30d_pct" REAL,
    "trend_90d_pct" REAL,
    "explicit_oop" BOOLEAN NOT NULL DEFAULT false,
    "active_reprint" BOOLEAN NOT NULL DEFAULT false,
    "evidence_json" TEXT,
    "model_version" TEXT NOT NULL,
    "observation_bucket" DATETIME NOT NULL,
    "observed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SetLifecycleObservation_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SetLifecycleObservation_episode_id_observation_bucket_model_version_key" ON "SetLifecycleObservation"("episode_id", "observation_bucket", "model_version");

-- CreateIndex
CREATE INDEX "SetLifecycleObservation_episode_id_observed_at_idx" ON "SetLifecycleObservation"("episode_id", "observed_at");

-- CreateIndex
CREATE INDEX "SetLifecycleObservation_status_confidence_observed_at_idx" ON "SetLifecycleObservation"("status", "confidence", "observed_at");

-- CreateIndex
CREATE INDEX "SetLifecycleObservation_observation_bucket_model_version_idx" ON "SetLifecycleObservation"("observation_bucket", "model_version");
