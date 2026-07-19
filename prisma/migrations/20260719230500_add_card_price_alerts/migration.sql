CREATE TABLE "CardPriceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_price_eur" REAL,
    "baseline_price_eur" REAL,
    "baseline_price_at" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggered_at" DATETIME,
    "triggered_price_eur" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CardPriceAlert_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardPriceAlert_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CardPriceAlert_user_id_card_id_key" ON "CardPriceAlert"("user_id", "card_id");
CREATE INDEX "CardPriceAlert_enabled_updated_at_idx" ON "CardPriceAlert"("enabled", "updated_at");
CREATE INDEX "CardPriceAlert_card_id_enabled_idx" ON "CardPriceAlert"("card_id", "enabled");
