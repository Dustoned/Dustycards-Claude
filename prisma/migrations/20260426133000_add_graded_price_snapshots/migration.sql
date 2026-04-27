-- CreateTable
CREATE TABLE "CardGradedPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardGradedPriceSnapshot_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CardGradedPriceSnapshot_card_id_idx" ON "CardGradedPriceSnapshot"("card_id");

-- CreateIndex
CREATE INDEX "CardGradedPriceSnapshot_card_id_label_fetched_at_idx" ON "CardGradedPriceSnapshot"("card_id", "label", "fetched_at");

-- CreateIndex
CREATE INDEX "CardGradedPriceSnapshot_fetched_at_idx" ON "CardGradedPriceSnapshot"("fetched_at");

-- Seed current graded prices as the first local history point.
INSERT INTO "CardGradedPriceSnapshot" (
    "id",
    "card_id",
    "label",
    "price",
    "fetched_at"
)
SELECT
    'seed-' || cgp."id",
    cgp."card_id",
    cgp."label",
    cgp."price",
    COALESCE(cgp."fetched_at", CURRENT_TIMESTAMP)
FROM "CardGradedPrice" cgp;
