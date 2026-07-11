CREATE TABLE "SealedReleaseWatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "game" TEXT NOT NULL DEFAULT 'pokemon',
    "name" TEXT NOT NULL,
    "release_date" DATETIME NOT NULL,
    "image_url" TEXT,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "confidence" REAL,
    "matched_product_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "SealedReleaseWatch_source_url_key" ON "SealedReleaseWatch"("source_url");
CREATE INDEX "SealedReleaseWatch_game_release_date_idx" ON "SealedReleaseWatch"("game", "release_date");
CREATE INDEX "SealedReleaseWatch_matched_product_id_idx" ON "SealedReleaseWatch"("matched_product_id");
