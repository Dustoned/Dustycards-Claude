import "dotenv/config";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GAME = "one-piece";
const DEFAULT_RAPIDAPI_HOST = "one-piece-tcg-prices.p.rapidapi.com";
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

const requestLimit = Math.max(1, Number(args.get("requests") ?? args.get("limit") ?? 80));
const cardLimit = Math.max(1, Number(args.get("cards") ?? requestLimit * 20));
const scope = String(args.get("scope") ?? "unpriced");
const exactCardNumber = args.get("card-number")?.trim() ?? null;
const dryRun = args.has("dry-run");
const planOnly = args.has("plan-only");

function getEnv(key) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function requireApiKey() {
  const key = getEnv("ONE_PIECE_RAPIDAPI_KEY") ?? getEnv("RAPIDAPI_KEY");
  if (!key) {
    throw new Error("Missing ONE_PIECE_RAPIDAPI_KEY or RAPIDAPI_KEY in .env");
  }
  return key;
}

function getApiHost() {
  return getEnv("ONE_PIECE_RAPIDAPI_HOST") ?? DEFAULT_RAPIDAPI_HOST;
}

function getApiBaseUrl() {
  return getEnv("ONE_PIECE_RAPIDAPI_BASE_URL") ?? `https://${getApiHost()}`;
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasAnyPrice(price) {
  return Object.values(price).some((value) => value != null);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildCardMarketProductUrl(cardmarketId) {
  if (cardmarketId == null || String(cardmarketId).trim() === "") return null;
  const url = new URL("https://www.cardmarket.com/OnePiece/Products");
  url.searchParams.set("idProduct", String(cardmarketId));
  url.searchParams.set("language", "1");
  url.searchParams.set("minCondition", "2");
  return url.toString();
}

function extractPrices(card) {
  const cm = card?.prices?.cardmarket;
  const tcp = card?.prices?.tcgplayer ?? card?.prices?.tcg_player;

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

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function ensureLiveDb() {
  if (existsSync(LIVE_DB_PATH)) return;
  if (!existsSync(SNAPSHOT_DB_PATH)) {
    throw new Error(`No database found at ${LIVE_DB_PATH} or ${SNAPSHOT_DB_PATH}`);
  }

  mkdirSync(dirname(LIVE_DB_PATH), { recursive: true });
  copyFileSync(SNAPSHOT_DB_PATH, LIVE_DB_PATH);
}

function buildCandidateWhereClause() {
  if (exactCardNumber) {
    return {
      sql: "c.card_number = ?",
      params: [exactCardNumber],
    };
  }

  if (scope === "all") {
    return { sql: "1 = 1", params: [] };
  }

  if (scope === "collection") {
    return {
      sql: `(
        EXISTS (SELECT 1 FROM "CollectionCard" cc WHERE cc.card_id = c.id)
        OR EXISTS (SELECT 1 FROM "CollectionWant" cw WHERE cw.card_id = c.id)
      )`,
      params: [],
    };
  }

  if (scope === "unavailable") {
    return {
      sql: "c.price_source_status = 'unavailable'",
      params: [],
    };
  }

  return {
    sql: `(
      c.price_source_status = 'unavailable'
      OR latest_price.card_id IS NULL
      OR (
        latest_price.cm_en_lowest_nm IS NULL
        AND latest_price.cm_de_lowest_nm IS NULL
        AND latest_price.cm_fr_lowest_nm IS NULL
        AND latest_price.cm_es_lowest_nm IS NULL
        AND latest_price.cm_it_lowest_nm IS NULL
        AND latest_price.tcp_market IS NULL
      )
    )`,
    params: [],
  };
}

function getCandidates(db) {
  const where = buildCandidateWhereClause();
  return db.prepare(`
    WITH latest_price AS (
      SELECT *
      FROM (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
      )
      WHERE row_num = 1
    )
    SELECT
      c.id,
      c.name,
      c.card_number AS cardNumber,
      c.cardmarket_id AS cardmarketId,
      c.tcgplayer_id AS tcgplayerId,
      c.image_url AS imageUrl,
      c.tcggo_url AS tcggoUrl,
      c.cardmarket_url AS cardmarketUrl,
      c.price_source_status AS priceSourceStatus,
      CASE
        WHEN EXISTS (SELECT 1 FROM "CollectionCard" cc WHERE cc.card_id = c.id) THEN 1
        WHEN EXISTS (SELECT 1 FROM "CollectionWant" cw WHERE cw.card_id = c.id) THEN 1
        ELSE 0
      END AS userRelevant
    FROM "Card" c
    LEFT JOIN latest_price ON latest_price.card_id = c.id
    WHERE c.game = ?
      AND ${where.sql}
    ORDER BY
      userRelevant DESC,
      CASE WHEN c.price_source_status = 'unavailable' THEN 0 ELSE 1 END,
      c.updated_at ASC,
      c.card_number ASC,
      c.id ASC
    LIMIT ?
  `).all(GAME, ...where.params, cardLimit);
}

function planBatches(candidates) {
  const batches = [];
  const remaining = [...candidates];

  const withCardmarket = remaining.filter((card) => card.cardmarketId);
  for (const cards of chunk(withCardmarket, 20)) {
    batches.push({
      type: "cardmarket_ids",
      value: cards.map((card) => card.cardmarketId).join(","),
      cards,
    });
  }

  const cardmarketIds = new Set(withCardmarket.map((card) => card.id));
  const withoutCardmarket = remaining.filter((card) => !cardmarketIds.has(card.id));
  const withTcgplayer = withoutCardmarket.filter((card) => card.tcgplayerId);
  for (const cards of chunk(withTcgplayer, 20)) {
    batches.push({
      type: "tcgplayer_ids",
      value: cards.map((card) => card.tcgplayerId).join(","),
      cards,
    });
  }

  const tcgplayerIds = new Set(withTcgplayer.map((card) => card.id));
  const byCardNumber = new Map();
  for (const card of withoutCardmarket.filter((card) => !tcgplayerIds.has(card.id))) {
    if (!card.cardNumber) continue;
    const key = card.cardNumber.toUpperCase();
    byCardNumber.set(key, [...(byCardNumber.get(key) ?? []), card]);
  }

  for (const [cardNumber, cards] of byCardNumber) {
    batches.push({
      type: "card_number",
      value: cardNumber,
      cards,
    });
  }

  return batches.slice(0, requestLimit);
}

async function apiFetchCards(batch) {
  const key = requireApiKey();
  const url = new URL("/cards", getApiBaseUrl());
  url.searchParams.set(batch.type, batch.value);
  url.searchParams.set("per_page", "100");

  const response = await fetch(url, {
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": getApiHost(),
    },
  });

  if (!response.ok) {
    throw new Error(`One Piece price API ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function remoteId(value) {
  return value == null ? null : String(value);
}

function pickRemoteCard(localCard, remoteCards) {
  if (!Array.isArray(remoteCards) || remoteCards.length === 0) return null;

  const localCardmarketId = remoteId(localCard.cardmarketId);
  const localTcgplayerId = remoteId(localCard.tcgplayerId);
  const localCardNumber = normalizeText(localCard.cardNumber);
  const localName = normalizeText(localCard.name);

  return (
    remoteCards.find((card) => localCardmarketId && remoteId(card.cardmarket_id) === localCardmarketId) ??
    remoteCards.find((card) => localTcgplayerId && remoteId(card.tcgplayer_id) === localTcgplayerId) ??
    remoteCards.find(
      (card) =>
        normalizeText(card.card_number) === localCardNumber &&
        normalizeText(card.name) === localName
    ) ??
    remoteCards.find((card) => normalizeText(card.card_number) === localCardNumber) ??
    null
  );
}

ensureLiveDb();

const db = new Database(LIVE_DB_PATH);
db.pragma("foreign_keys = ON");

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

const updateCardSource = db.prepare(`
  UPDATE "Card"
  SET
    cardmarket_id = COALESCE(@cardmarket_id, cardmarket_id),
    tcgplayer_id = COALESCE(@tcgplayer_id, tcgplayer_id),
    tcggo_url = COALESCE(@tcggo_url, tcggo_url),
    cardmarket_url = COALESCE(@cardmarket_url, cardmarket_url),
    image_url = COALESCE(@image_url, image_url),
    price_source_status = @price_source_status,
    price_source_checked_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const writeResult = db.transaction((localCard, remoteCard, prices) => {
  const priced = hasAnyPrice(prices);
  if (priced) {
    insertPrice.run({
      id: randomUUID(),
      card_id: localCard.id,
      ...prices,
    });
  }

  updateCardSource.run({
    id: localCard.id,
    cardmarket_id: remoteCard?.cardmarket_id != null ? String(remoteCard.cardmarket_id) : null,
    tcgplayer_id: remoteCard?.tcgplayer_id != null ? String(remoteCard.tcgplayer_id) : null,
    tcggo_url: remoteCard?.tcggo_url ?? null,
    cardmarket_url:
      remoteCard?.links?.cardmarket ??
      buildCardMarketProductUrl(remoteCard?.cardmarket_id) ??
      null,
    image_url: remoteCard?.image ?? null,
    price_source_status: priced ? null : "unavailable",
  });
});

try {
  const candidates = getCandidates(db);
  const batches = planBatches(candidates);

  console.log(
    `One Piece price fallback: ${candidates.length} candidate cards, ${batches.length}/${requestLimit} planned requests, scope=${scope}${dryRun ? ", dry-run" : ""}${planOnly ? ", plan-only" : ""}`
  );

  for (const [index, batch] of batches.slice(0, 5).entries()) {
    console.log(
      `  ${index + 1}. ${batch.type}=${batch.value} (${batch.cards.length} local cards)`
    );
  }

  if (planOnly) {
    process.exit(0);
  }

  let requestsUsed = 0;
  let checkedCards = 0;
  let pricedCards = 0;
  let unavailableCards = 0;

  for (const [index, batch] of batches.entries()) {
    const payload = await apiFetchCards(batch);
    requestsUsed += 1;
    const remoteCards = payload.data ?? [];

    for (const localCard of batch.cards) {
      const remoteCard = pickRemoteCard(localCard, remoteCards);
      const prices = extractPrices(remoteCard);
      checkedCards += 1;

      if (hasAnyPrice(prices)) {
        pricedCards += 1;
      } else {
        unavailableCards += 1;
      }

      if (!dryRun) {
        writeResult(localCard, remoteCard, prices);
      }
    }

    console.log(
      `${index + 1}/${batches.length} ${batch.type}=${batch.value}: ${remoteCards.length} remote rows`
    );
  }

  console.log(
    `Done. Requests used: ${requestsUsed}. Checked ${checkedCards} cards; ${pricedCards} priced, ${unavailableCards} unavailable.${dryRun ? " No database writes." : ""}`
  );
} finally {
  db.close();
}
