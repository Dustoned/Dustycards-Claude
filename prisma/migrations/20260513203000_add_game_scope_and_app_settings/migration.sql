ALTER TABLE "Episode" ADD COLUMN "game" TEXT NOT NULL DEFAULT 'pokemon';
ALTER TABLE "Card" ADD COLUMN "game" TEXT NOT NULL DEFAULT 'pokemon';
ALTER TABLE "SealedProduct" ADD COLUMN "game" TEXT NOT NULL DEFAULT 'pokemon';

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE INDEX "Episode_game_release_date_idx" ON "Episode"("game", "release_date");
CREATE INDEX "Episode_game_code_idx" ON "Episode"("game", "code");
CREATE INDEX "Card_game_episode_id_idx" ON "Card"("game", "episode_id");
CREATE INDEX "SealedProduct_game_episode_id_idx" ON "SealedProduct"("game", "episode_id");
