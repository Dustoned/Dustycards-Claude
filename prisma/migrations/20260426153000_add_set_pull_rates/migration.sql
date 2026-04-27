-- CreateTable
CREATE TABLE "SetPullRateProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'collectrics',
    "set_code" TEXT NOT NULL,
    "set_name" TEXT,
    "generated_at" TEXT,
    "release_date" TEXT,
    "promo_flag" TEXT,
    "rarity_buckets" INTEGER,
    "cards_counted" INTEGER,
    "psa_pop_10_base" INTEGER,
    "psa_pop_total_base" INTEGER,
    "psa_avg_gem_pct" REAL,
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SetPullRateRarity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profile_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "set_code" TEXT NOT NULL,
    "normalized_rarity" TEXT NOT NULL,
    "rarity_code" TEXT,
    "rarity_name" TEXT NOT NULL,
    "card_count" INTEGER,
    "pull_rate" REAL,
    "pull_rate_odds" TEXT,
    "pull_rate_denominator" REAL,
    "specific_pull_denominator" REAL,
    "psa_pop_10_base" INTEGER,
    "psa_pop_total_base" INTEGER,
    "psa_avg_gem_pct" REAL,
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SetPullRateRarity_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "SetPullRateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SetPullRateProfile_source_set_code_key" ON "SetPullRateProfile"("source", "set_code");

-- CreateIndex
CREATE INDEX "SetPullRateProfile_set_code_idx" ON "SetPullRateProfile"("set_code");

-- CreateIndex
CREATE INDEX "SetPullRateProfile_imported_at_idx" ON "SetPullRateProfile"("imported_at");

-- CreateIndex
CREATE UNIQUE INDEX "SetPullRateRarity_profile_id_normalized_rarity_key" ON "SetPullRateRarity"("profile_id", "normalized_rarity");

-- CreateIndex
CREATE INDEX "SetPullRateRarity_source_set_code_idx" ON "SetPullRateRarity"("source", "set_code");

-- CreateIndex
CREATE INDEX "SetPullRateRarity_source_set_code_normalized_rarity_idx" ON "SetPullRateRarity"("source", "set_code", "normalized_rarity");
