ALTER TABLE "SetPullRateProfile" ADD COLUMN "source_url" TEXT;
ALTER TABLE "SetPullRateProfile" ADD COLUMN "source_note" TEXT;
ALTER TABLE "SetPullRateProfile" ADD COLUMN "prices_updated_at" TEXT;
ALTER TABLE "SetPullRateProfile" ADD COLUMN "booster_pack_ev_usd" REAL;
ALTER TABLE "SetPullRateProfile" ADD COLUMN "booster_box_ev_usd" REAL;
ALTER TABLE "SetPullRateProfile" ADD COLUMN "packs_per_booster_box" REAL;
ALTER TABLE "SetPullRateProfile" ADD COLUMN "cards_per_booster_pack" REAL;

ALTER TABLE "SetPullRateRarity" ADD COLUMN "per_booster_box" REAL;
ALTER TABLE "SetPullRateRarity" ADD COLUMN "ev_total" INTEGER;
ALTER TABLE "SetPullRateRarity" ADD COLUMN "ev_priced" INTEGER;
ALTER TABLE "SetPullRateRarity" ADD COLUMN "avg_value_usd" REAL;
ALTER TABLE "SetPullRateRarity" ADD COLUMN "ev_per_pack_usd" REAL;

CREATE INDEX "SetPullRateProfile_source_imported_at_idx" ON "SetPullRateProfile"("source", "imported_at");
