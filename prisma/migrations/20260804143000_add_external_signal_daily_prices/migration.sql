CREATE TABLE "ExternalSignalPriceObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "reference_source" TEXT NOT NULL,
    "reference_price" REAL NOT NULL,
    "source_price_at" DATETIME,
    "observed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observed_day" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ExternalSignalPriceObservation_card_id_reference_source_observed_day_key"
ON "ExternalSignalPriceObservation"("card_id", "reference_source", "observed_day");
CREATE INDEX "ExternalSignalPriceObservation_card_id_reference_source_observed_at_idx"
ON "ExternalSignalPriceObservation"("card_id", "reference_source", "observed_at");
CREATE INDEX "ExternalSignalPriceObservation_observed_at_idx"
ON "ExternalSignalPriceObservation"("observed_at");

-- Recover every verifiable historic Signal Radar quote already stored in a
-- six-hour scan. The latest scan on each UTC day wins, matching the live
-- evaluator's daily-collapse rule. Both hits and misses are preserved.
INSERT OR IGNORE INTO "ExternalSignalPriceObservation" (
    "id",
    "card_id",
    "reference_source",
    "reference_price",
    "source_price_at",
    "observed_at",
    "observed_day",
    "provenance",
    "created_at"
)
SELECT
    lower(hex(randomblob(16))),
    observation."card_id",
    observation."reference_source",
    observation."reference_price",
    observation."reference_price_at",
    observation."observed_at",
    substr(observation."observed_at", 1, 10),
    'signal-scan-backfill',
    CURRENT_TIMESTAMP
FROM "ExternalSignalObservation" observation
INNER JOIN (
    SELECT
        "card_id",
        "reference_source",
        substr("observed_at", 1, 10) AS "observed_day",
        MAX("observed_at") AS "latest_observed_at"
    FROM "ExternalSignalObservation"
    WHERE "reference_source" IS NOT NULL
      AND "reference_price" IS NOT NULL
      AND "reference_price" > 0
    GROUP BY "card_id", "reference_source", substr("observed_at", 1, 10)
) latest
  ON latest."card_id" = observation."card_id"
 AND latest."reference_source" = observation."reference_source"
 AND latest."latest_observed_at" = observation."observed_at"
WHERE observation."reference_price" IS NOT NULL
  AND observation."reference_price" > 0;
