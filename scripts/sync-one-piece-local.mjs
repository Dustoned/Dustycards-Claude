import "dotenv/config";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://cardmarket-api-tcg.p.rapidapi.com";
const GAME = "one-piece";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LIVE_DB_PATH = resolve(__dirname, "../dustycards.db");
const SNAPSHOT_DB_PATH = resolve(__dirname, "../data/dustycards.app.db");
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);
const episodeLimit = args.has("limit") ? Number(args.get("limit")) : null;

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${key}. Add it to .env before running this import.`);
  }
  return value;
}

function scopeId(id) {
  const value = String(id ?? "").trim();
  return value.startsWith(`${GAME}:`) ? value : `${GAME}:${value}`;
}

function buildCardMarketProductUrl(cardmarketId) {
  if (cardmarketId == null || String(cardmarketId).trim() === "") return null;
  const url = new URL("https://www.cardmarket.com/OnePiece/Products");
  url.searchParams.set("idProduct", String(cardmarketId));
  url.searchParams.set("language", "1");
  url.searchParams.set("minCondition", "2");
  return url.toString();
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractPrices(rawPrices) {
  const cm = rawPrices?.cardmarket;
  const tcp = rawPrices?.tcg_player;

  return {
    cm_en_lowest_nm: asNumber(cm?.lowest_near_mint),
    cm_de_lowest_nm: asNumber(cm?.lowest_near_mint_DE),
    cm_fr_lowest_nm: asNumber(cm?.lowest_near_mint_FR),
    cm_es_lowest_nm: asNumber(cm?.lowest_near_mint_ES),
    cm_it_lowest_nm: asNumber(cm?.lowest_near_mint_IT),
    cm_en_avg_30d: asNumber(cm?.["30d_average"]),
    cm_en_avg_7d: asNumber(cm?.["7d_average"]),
    tcp_market: asNumber(tcp?.market_price),
    tcp_mid: asNumber(tcp?.mid_price),
    tcp_low: asNumber(tcp?.low_price),
  };
}

function hasAnyPrice(price) {
  return Object.values(price).some((value) => value != null);
}

async function apiFetch(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "x-rapidapi-key": requireEnv("RAPIDAPI_KEY"),
      "x-rapidapi-host": requireEnv("RAPIDAPI_HOST"),
    },
  });

  if (!response.ok) {
    throw new Error(`TCGGO ${response.status}: ${path}`);
  }

  return response.json();
}

async function fetchAllEpisodes() {
  const episodes = [];
  let page = 1;

  while (true) {
    const payload = await apiFetch(`/${GAME}/episodes?page=${page}&per_page=100`);
    episodes.push(...(payload.data ?? []));
    const totalPages = payload.paging?.total ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }

  return episodeLimit == null ? episodes : episodes.slice(0, episodeLimit);
}

async function fetchCardsForEpisode(episodeId) {
  const cards = [];
  let page = 1;

  while (true) {
    const payload = await apiFetch(`/${GAME}/episodes/${episodeId}/cards?page=${page}&per_page=100`);
    cards.push(...(payload.data ?? []));
    const totalPages = payload.paging?.total ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }

  return cards;
}

function ensureLiveDb() {
  if (existsSync(LIVE_DB_PATH)) return;
  if (!existsSync(SNAPSHOT_DB_PATH)) {
    throw new Error(`No database found at ${LIVE_DB_PATH} or ${SNAPSHOT_DB_PATH}`);
  }

  mkdirSync(dirname(LIVE_DB_PATH), { recursive: true });
  copyFileSync(SNAPSHOT_DB_PATH, LIVE_DB_PATH);
}

ensureLiveDb();

const db = new Database(LIVE_DB_PATH);
db.pragma("foreign_keys = ON");

const upsertEpisode = db.prepare(`
  INSERT INTO "Episode" (
    id, game, name, code, release_date, card_count, logo_url, symbol_url, series,
    source_status, source_checked_at, source_actual_card_count, synced_at
  )
  VALUES (
    @id, @game, @name, @code, @release_date, @card_count, @logo_url, @symbol_url, @series,
    'ok', CURRENT_TIMESTAMP, @source_actual_card_count, CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    game = excluded.game,
    name = excluded.name,
    code = excluded.code,
    release_date = excluded.release_date,
    card_count = excluded.card_count,
    logo_url = excluded.logo_url,
    symbol_url = excluded.symbol_url,
    series = excluded.series,
    source_status = excluded.source_status,
    source_checked_at = CURRENT_TIMESTAMP,
    source_actual_card_count = excluded.source_actual_card_count,
    synced_at = CURRENT_TIMESTAMP
`);

const upsertCard = db.prepare(`
  INSERT INTO "Card" (
    id, game, episode_id, name, card_number, rarity, hp, supertype, subtypes, artist,
    image_url, tcggo_url, cardmarket_url, cardmarket_id, tcgplayer_id, updated_at
  )
  VALUES (
    @id, @game, @episode_id, @name, @card_number, @rarity, @hp, @supertype, @subtypes, @artist,
    @image_url, @tcggo_url, @cardmarket_url, @cardmarket_id, @tcgplayer_id, CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    game = excluded.game,
    episode_id = excluded.episode_id,
    name = excluded.name,
    card_number = excluded.card_number,
    rarity = excluded.rarity,
    hp = excluded.hp,
    supertype = excluded.supertype,
    subtypes = excluded.subtypes,
    artist = excluded.artist,
    image_url = excluded.image_url,
    tcggo_url = excluded.tcggo_url,
    cardmarket_url = excluded.cardmarket_url,
    cardmarket_id = excluded.cardmarket_id,
    tcgplayer_id = excluded.tcgplayer_id,
    updated_at = CURRENT_TIMESTAMP
`);

const insertPrice = db.prepare(`
  INSERT INTO "Price" (
    id, card_id, fetched_at,
    cm_en_lowest_nm, cm_de_lowest_nm, cm_fr_lowest_nm, cm_es_lowest_nm, cm_it_lowest_nm,
    cm_en_avg_30d, cm_en_avg_7d, tcp_market, tcp_mid, tcp_low
  )
  VALUES (
    @id, @card_id, CURRENT_TIMESTAMP,
    @cm_en_lowest_nm, @cm_de_lowest_nm, @cm_fr_lowest_nm, @cm_es_lowest_nm, @cm_it_lowest_nm,
    @cm_en_avg_30d, @cm_en_avg_7d, @tcp_market, @tcp_mid, @tcp_low
  )
`);

const importEpisode = db.transaction((episode, cards) => {
  const episodeId = scopeId(episode.id);

  upsertEpisode.run({
    id: episodeId,
    game: GAME,
    name: episode.name,
    code: episode.code ?? null,
    release_date: episode.released_at ?? null,
    card_count: Math.max(cards.length, episode.cards_total ?? 0),
    logo_url: episode.logo ?? null,
    symbol_url: episode.symbol ?? null,
    series: episode.series?.name ?? null,
    source_actual_card_count: cards.length,
  });

  for (const card of cards) {
    const cardId = scopeId(card.id);
    const cardmarketId = card.cardmarket_id != null ? String(card.cardmarket_id) : null;
    const tcgplayerId = card.tcgplayer_id != null ? String(card.tcgplayer_id) : null;
    const prices = extractPrices(card.prices);

    upsertCard.run({
      id: cardId,
      game: GAME,
      episode_id: episodeId,
      name: card.name,
      card_number: card.card_number != null ? String(card.card_number) : null,
      rarity: card.rarity ?? null,
      hp: typeof card.hp === "number" ? card.hp : null,
      supertype: card.supertype ?? null,
      subtypes: Array.isArray(card.subtypes) ? card.subtypes.join(",") : null,
      artist: card.artist?.name ?? null,
      image_url: card.image ?? (tcgplayerId ? `https://product-images.tcgplayer.com/fit-in/437x437/${tcgplayerId}.jpg` : null),
      tcggo_url: card.tcggo_url ?? null,
      cardmarket_url: buildCardMarketProductUrl(cardmarketId),
      cardmarket_id: cardmarketId,
      tcgplayer_id: tcgplayerId,
    });

    if (hasAnyPrice(prices)) {
      insertPrice.run({
        id: randomUUID(),
        card_id: cardId,
        ...prices,
      });
    }
  }
});

try {
  const episodes = await fetchAllEpisodes();
  let importedCards = 0;

  console.log(`Importing ${episodes.length} One Piece episodes into ${LIVE_DB_PATH}`);

  for (const [index, episode] of episodes.entries()) {
    const cards = await fetchCardsForEpisode(episode.id).catch((error) => {
      console.warn(`Skipping ${episode.name}: ${error.message}`);
      return [];
    });

    importEpisode(episode, cards);
    importedCards += cards.length;
    console.log(`${index + 1}/${episodes.length} ${episode.code ?? "--"} ${episode.name}: ${cards.length} cards`);
  }

  console.log(`Done. Imported ${episodes.length} episodes and ${importedCards} cards.`);
} finally {
  db.close();
}
