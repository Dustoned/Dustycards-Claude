-- CreateTable
CREATE TABLE "SealedProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episode_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "tcggo_url" TEXT,
    "cardmarket_url" TEXT,
    "cardmarket_id" TEXT,
    "tcgplayer_id" TEXT,
    "cm_lowest" REAL,
    "cm_lowest_eu" REAL,
    "cm_lowest_de" REAL,
    "cm_lowest_fr" REAL,
    "cm_lowest_es" REAL,
    "cm_lowest_it" REAL,
    "cm_avg_7d" REAL,
    "cm_avg_30d" REAL,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SealedProduct_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SealedProduct_episode_id_idx" ON "SealedProduct"("episode_id");

-- CreateIndex
CREATE INDEX "SealedProduct_name_idx" ON "SealedProduct"("name");
