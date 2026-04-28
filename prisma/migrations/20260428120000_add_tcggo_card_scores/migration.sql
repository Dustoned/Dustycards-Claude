ALTER TABLE "Card" ADD COLUMN "tcggo_score" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_tier" TEXT;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_momentum" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_stability" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_liquidity" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_demand" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_market_depth" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_grade_premium" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_rsi" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_ath" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_atl" REAL;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_synced_at" DATETIME;
ALTER TABLE "Card" ADD COLUMN "tcggo_score_updated_at" DATETIME;

CREATE INDEX "Card_tcggo_score_idx" ON "Card"("tcggo_score");
CREATE INDEX "Card_tcggo_score_tier_idx" ON "Card"("tcggo_score_tier");
