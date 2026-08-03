ALTER TABLE "Card" ADD COLUMN "market_score" REAL;
ALTER TABLE "Card" ADD COLUMN "market_score_momentum" REAL;
ALTER TABLE "Card" ADD COLUMN "market_score_liquidity" REAL;
ALTER TABLE "Card" ADD COLUMN "market_score_demand" REAL;
ALTER TABLE "Card" ADD COLUMN "market_score_updated_at" DATETIME;
CREATE INDEX "Card_market_score_updated_at_idx" ON "Card"("market_score_updated_at");
