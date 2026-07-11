CREATE TABLE "SealedProductContentSet" (
    "product_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "source_name" TEXT,
    "source_url" TEXT,
    "confidence" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("product_id", "episode_id"),
    CONSTRAINT "SealedProductContentSet_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "SealedProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SealedProductContentSet_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SealedProductContentSet_episode_id_idx" ON "SealedProductContentSet"("episode_id");
CREATE INDEX "SealedProductContentSet_product_id_idx" ON "SealedProductContentSet"("product_id");
