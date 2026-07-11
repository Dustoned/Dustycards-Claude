CREATE INDEX IF NOT EXISTS "Card_artist_idx" ON "Card"("artist");
CREATE INDEX IF NOT EXISTS "Card_game_rarity_idx" ON "Card"("game", "rarity");
