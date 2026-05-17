ALTER TABLE "CollectionWant" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "CollectionWant" ADD COLUMN "source_episode_id" TEXT;
ALTER TABLE "CollectionWant" ADD COLUMN "dismissed_at" DATETIME;

CREATE INDEX "CollectionWant_source_idx" ON "CollectionWant"("source");
CREATE INDEX "CollectionWant_source_episode_id_idx" ON "CollectionWant"("source_episode_id");
CREATE INDEX "CollectionWant_dismissed_at_idx" ON "CollectionWant"("dismissed_at");
