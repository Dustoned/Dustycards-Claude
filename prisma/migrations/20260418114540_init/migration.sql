-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "release_date" TEXT,
    "card_count" INTEGER,
    "logo_url" TEXT,
    "symbol_url" TEXT,
    "series" TEXT,
    "synced_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episode_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "card_number" TEXT,
    "rarity" TEXT,
    "hp" INTEGER,
    "supertype" TEXT,
    "subtypes" TEXT,
    "artist" TEXT,
    "image_url" TEXT,
    "tcggo_url" TEXT,
    "tcgid" TEXT,
    "cardmarket_id" TEXT,
    "tcgplayer_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Card_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cm_en_lowest_nm" REAL,
    "cm_de_lowest_nm" REAL,
    "cm_fr_lowest_nm" REAL,
    "cm_es_lowest_nm" REAL,
    "cm_it_lowest_nm" REAL,
    "cm_en_avg_30d" REAL,
    "cm_en_avg_7d" REAL,
    "tcp_market" REAL,
    "tcp_mid" REAL,
    "tcp_low" REAL,
    CONSTRAINT "Price_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateIndex
CREATE INDEX "Price_card_id_idx" ON "Price"("card_id");
