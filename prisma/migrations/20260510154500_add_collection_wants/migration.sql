CREATE TABLE "CollectionWant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CollectionWant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionWant_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CollectionWant_user_id_card_id_key"
ON "CollectionWant"("user_id", "card_id");

CREATE INDEX "CollectionWant_user_id_idx"
ON "CollectionWant"("user_id");

CREATE INDEX "CollectionWant_card_id_idx"
ON "CollectionWant"("card_id");

CREATE INDEX "CollectionWant_created_at_idx"
ON "CollectionWant"("created_at");
