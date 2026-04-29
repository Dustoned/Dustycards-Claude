CREATE TABLE "CardEbaySoldGradedPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ebay_sold',
    "label" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "median_price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sample_size" INTEGER,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardEbaySoldGradedPrice_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CardEbaySoldGradedPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ebay_sold',
    "label" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "median_price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sample_size" INTEGER,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardEbaySoldGradedPriceSnapshot_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CardEbaySoldGradedPrice_card_id_idx" ON "CardEbaySoldGradedPrice"("card_id");

CREATE INDEX "CardEbaySoldGradedPrice_card_id_source_idx" ON "CardEbaySoldGradedPrice"("card_id", "source");

CREATE INDEX "CardEbaySoldGradedPrice_company_grade_idx" ON "CardEbaySoldGradedPrice"("company", "grade");

CREATE UNIQUE INDEX "CardEbaySoldGradedPrice_card_id_source_label_key" ON "CardEbaySoldGradedPrice"("card_id", "source", "label");

CREATE INDEX "CardEbaySoldGradedPriceSnapshot_card_id_idx" ON "CardEbaySoldGradedPriceSnapshot"("card_id");

CREATE INDEX "CardEbaySoldGradedPriceSnapshot_card_id_source_label_fetched_at_idx" ON "CardEbaySoldGradedPriceSnapshot"("card_id", "source", "label", "fetched_at");

CREATE INDEX "CardEbaySoldGradedPriceSnapshot_fetched_at_idx" ON "CardEbaySoldGradedPriceSnapshot"("fetched_at");
