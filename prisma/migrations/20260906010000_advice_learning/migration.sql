CREATE TABLE "AdviceObservation" (
 "id" TEXT NOT NULL PRIMARY KEY, "owner_id" TEXT, "card_id" TEXT NOT NULL, "card_name" TEXT NOT NULL,
 "game" TEXT NOT NULL, "context" TEXT NOT NULL, "origin" TEXT NOT NULL, "model_version" TEXT NOT NULL,
 "label" TEXT NOT NULL, "score" REAL NOT NULL, "confidence" TEXT NOT NULL, "source" TEXT NOT NULL,
 "grade_label" TEXT, "currency" TEXT NOT NULL, "entry_price" REAL NOT NULL, "observed_at" DATETIME NOT NULL,
 "evidence_json" TEXT NOT NULL,
 CONSTRAINT "AdviceObservation_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AdviceOutcome" (
 "id" TEXT NOT NULL PRIMARY KEY, "observation_id" TEXT NOT NULL, "horizon_days" INTEGER NOT NULL,
 "due_at" DATETIME NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "correct" BOOLEAN, "return_pct" REAL,
 "end_price" REAL, "observed_days" INTEGER NOT NULL DEFAULT 0, "evaluated_at" DATETIME,
 CONSTRAINT "AdviceOutcome_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "AdviceObservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdviceObservation_owner_id_origin_observed_at_idx" ON "AdviceObservation"("owner_id","origin","observed_at");
CREATE INDEX "AdviceObservation_card_id_observed_at_idx" ON "AdviceObservation"("card_id","observed_at");
CREATE UNIQUE INDEX "AdviceOutcome_observation_id_horizon_days_key" ON "AdviceOutcome"("observation_id","horizon_days");
CREATE INDEX "AdviceOutcome_status_due_at_idx" ON "AdviceOutcome"("status","due_at");
