ALTER TABLE "ExternalSignalObservation" ADD COLUMN "entry_outlook" TEXT;
ALTER TABLE "ExternalSignalObservation" ADD COLUMN "entry_expected_return_pct_180" REAL;
ALTER TABLE "ExternalSignalObservation" ADD COLUMN "entry_opportunity_score" REAL;
ALTER TABLE "ExternalSignalObservation" ADD COLUMN "entry_scenario_json" TEXT;

ALTER TABLE "ExternalSignalOutcome" ADD COLUMN "realized_return_pct" REAL;
ALTER TABLE "ExternalSignalOutcome" ADD COLUMN "direction_hit" BOOLEAN;
ALTER TABLE "ExternalSignalOutcome" ADD COLUMN "band_within" BOOLEAN;
