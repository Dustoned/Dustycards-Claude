ALTER TABLE "ExternalSignalObservation" ADD COLUMN "competitive_score" REAL NOT NULL DEFAULT 0;

UPDATE "ExternalSignalObservation"
SET "competitive_score" = "external_score";
