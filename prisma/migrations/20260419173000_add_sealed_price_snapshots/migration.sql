-- CreateTable
CREATE TABLE "SealedPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cm_lowest" REAL,
    "cm_lowest_eu" REAL,
    "cm_lowest_de" REAL,
    "cm_lowest_fr" REAL,
    "cm_lowest_es" REAL,
    "cm_lowest_it" REAL,
    "cm_avg_7d" REAL,
    "cm_avg_30d" REAL
);

-- CreateIndex
CREATE INDEX "SealedPriceSnapshot_product_id_idx" ON "SealedPriceSnapshot"("product_id");

-- CreateIndex
CREATE INDEX "SealedPriceSnapshot_product_id_fetched_at_idx" ON "SealedPriceSnapshot"("product_id", "fetched_at");

-- CreateIndex
CREATE INDEX "SealedPriceSnapshot_episode_id_fetched_at_idx" ON "SealedPriceSnapshot"("episode_id", "fetched_at");
