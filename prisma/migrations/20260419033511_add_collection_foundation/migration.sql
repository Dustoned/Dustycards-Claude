-- CreateTable
CREATE TABLE "CollectionBinder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "episode_id" TEXT,
    "accent_color" TEXT,
    "icon_name" TEXT,
    "notes" TEXT,
    "base_purchase_price" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CollectionBinder_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "binder_id" TEXT,
    "purchase_price" REAL,
    "condition" TEXT,
    "language" TEXT,
    "notes" TEXT,
    "grading_company" TEXT,
    "grading_grade" TEXT,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CollectionCard_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CollectionCard_binder_id_fkey" FOREIGN KEY ("binder_id") REFERENCES "CollectionBinder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionCardTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection_card_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "CollectionCardTag_collection_card_id_fkey" FOREIGN KEY ("collection_card_id") REFERENCES "CollectionCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionSealed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "purchase_price_per_item" REAL,
    "notes" TEXT,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CollectionSealed_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "SealedProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionSealedTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection_sealed_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "CollectionSealedTag_collection_sealed_id_fkey" FOREIGN KEY ("collection_sealed_id") REFERENCES "CollectionSealed" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CollectionBinder_type_idx" ON "CollectionBinder"("type");

-- CreateIndex
CREATE INDEX "CollectionBinder_episode_id_idx" ON "CollectionBinder"("episode_id");

-- CreateIndex
CREATE INDEX "CollectionBinder_created_at_idx" ON "CollectionBinder"("created_at");

-- CreateIndex
CREATE INDEX "CollectionCard_card_id_idx" ON "CollectionCard"("card_id");

-- CreateIndex
CREATE INDEX "CollectionCard_binder_id_idx" ON "CollectionCard"("binder_id");

-- CreateIndex
CREATE INDEX "CollectionCard_added_at_idx" ON "CollectionCard"("added_at");

-- CreateIndex
CREATE INDEX "CollectionCardTag_collection_card_id_idx" ON "CollectionCardTag"("collection_card_id");

-- CreateIndex
CREATE INDEX "CollectionCardTag_label_idx" ON "CollectionCardTag"("label");

-- CreateIndex
CREATE INDEX "CollectionSealed_product_id_idx" ON "CollectionSealed"("product_id");

-- CreateIndex
CREATE INDEX "CollectionSealed_added_at_idx" ON "CollectionSealed"("added_at");

-- CreateIndex
CREATE INDEX "CollectionSealedTag_collection_sealed_id_idx" ON "CollectionSealedTag"("collection_sealed_id");

-- CreateIndex
CREATE INDEX "CollectionSealedTag_label_idx" ON "CollectionSealedTag"("label");
