import Database from "better-sqlite3";

const API_BASE = process.env.DUSTYCARDS_API_BASE ?? "http://127.0.0.1:3000";
const CONCURRENCY = Number(process.env.DUSTYCARDS_EBAY_BACKFILL_CONCURRENCY ?? 4);
const REQUEST_TIMEOUT_MS = 90_000;

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshCard(card) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/api/cards/${encodeURIComponent(card.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text.slice(0, 500) };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        quotaExceeded: Boolean(data?.quotaExceeded),
        error: data?.error ?? `HTTP ${response.status}`,
      };
    }

    const ebayRows = Array.isArray(data?.ebay_sold_graded_prices)
      ? data.ebay_sold_graded_prices.length
      : 0;

    return { ok: true, ebayRows };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      quotaExceeded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function loadCardsWithoutEbayPrices() {
  const db = new Database("dustycards.db", { readonly: true });
  try {
    return db
      .prepare(
        `
          WITH latest_price AS (
            SELECT
              p.card_id,
              COALESCE(
                p.cm_en_lowest_nm,
                p.cm_de_lowest_nm,
                p.cm_fr_lowest_nm,
                p.cm_es_lowest_nm,
                p.cm_it_lowest_nm,
                p.tcp_market,
                0
              ) AS market_value,
              ROW_NUMBER() OVER (
                PARTITION BY p.card_id
                ORDER BY p.fetched_at DESC, p.id DESC
              ) AS price_rank
            FROM Price p
          ),
          graded AS (
            SELECT DISTINCT card_id FROM CardGradedPrice
          ),
          ebay AS (
            SELECT DISTINCT card_id FROM CardEbaySoldGradedPrice
          )
          SELECT
            c.id,
            c.name,
            c.card_number,
            CASE WHEN graded.card_id IS NULL THEN 0 ELSE 1 END AS has_graded,
            COALESCE(latest_price.market_value, 0) AS market_value
          FROM Card c
          LEFT JOIN latest_price
            ON latest_price.card_id = c.id
           AND latest_price.price_rank = 1
          LEFT JOIN graded
            ON graded.card_id = c.id
          LEFT JOIN ebay
            ON ebay.card_id = c.id
          WHERE ebay.card_id IS NULL
          ORDER BY has_graded DESC, market_value DESC, c.updated_at DESC, c.id ASC
        `
      )
      .all();
  } finally {
    db.close();
  }
}

async function main() {
  const cards = loadCardsWithoutEbayPrices();

  console.log(`[${now()}] Starting eBay sold graded backfill`);
  console.log(`[${now()}] API: ${API_BASE}`);
  console.log(`[${now()}] Queue: ${cards.length} cards without eBay sold graded prices`);
  console.log(`[${now()}] Concurrency: ${CONCURRENCY}`);

  let nextIndex = 0;
  let processed = 0;
  let successes = 0;
  let errors = 0;
  let cardsWithEbay = 0;
  let ebayRows = 0;
  let quotaExceeded = false;

  async function worker(workerId) {
    while (!quotaExceeded) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= cards.length) return;

      const card = cards[index];
      const result = await refreshCard(card);
      processed += 1;

      if (result.ok) {
        successes += 1;
        if (result.ebayRows > 0) {
          cardsWithEbay += 1;
          ebayRows += result.ebayRows;
          console.log(
            `[${now()}] eBay ${result.ebayRows} rows | ${card.id} ${card.name} ${
              card.card_number ?? ""
            }`
          );
        }
      } else {
        errors += 1;
        console.log(
          `[${now()}] error status=${result.status} quota=${result.quotaExceeded} | ${
            card.id
          } ${card.name}: ${result.error}`
        );
        if (result.quotaExceeded || result.status === 429) {
          quotaExceeded = true;
          return;
        }
        await sleep(750);
      }

      if (processed % 25 === 0) {
        console.log(
          `[${now()}] progress ${processed}/${cards.length} | ok=${successes} errors=${errors} cardsWithEbay=${cardsWithEbay} ebayRows=${ebayRows}`
        );
      }
    }

    console.log(`[${now()}] worker ${workerId} stopping because quota was exceeded`);
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => worker(index + 1)));

  console.log(
    `[${now()}] done processed=${processed} ok=${successes} errors=${errors} cardsWithEbay=${cardsWithEbay} ebayRows=${ebayRows} quotaExceeded=${quotaExceeded}`
  );
}

main().catch((error) => {
  console.error(`[${now()}] fatal`, error);
  process.exitCode = 1;
});
