import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import {
  PROMO_ORIGIN_SOURCES,
  findPromoOriginProduct,
  getPromoOriginRawUrl,
  getPromoOriginSourceUrl,
  normalizePromoNumber,
  parsePromoOriginWikitext,
} from "@/lib/promo-origins";

const SOURCE_NAME = "Bulbapedia";
const SYNC_TYPE = "promo-origins";
const DEFAULT_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60_000;

interface PromoCardRow {
  id: string;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
}

interface SealedProductRow {
  id: string;
  name: string;
  releaseDate: string | null;
}

export interface PromoOriginSyncSummary {
  status: "success" | "partial" | "skipped";
  sourcesChecked: number;
  originsSaved: number;
  cardsCovered: number;
  productLinksSaved: number;
  unmatchedProducts: number;
  errors: string[];
}

function hasTable(database: BetterSqlite3.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  );
}

function isRefreshDue(database: BetterSqlite3.Database, refreshIntervalMs: number): boolean {
  if (!hasTable(database, "SyncLog")) return true;
  const row = database
    .prepare(
      `SELECT finished_at
       FROM "SyncLog"
       WHERE type = ? AND status = 'success' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 1`
    )
    .get(SYNC_TYPE) as { finished_at?: string | null } | undefined;
  const finishedAt = row?.finished_at ? new Date(row.finished_at).getTime() : Number.NaN;
  return !Number.isFinite(finishedAt) || Date.now() - finishedAt >= refreshIntervalMs;
}

export async function syncPromoOrigins(
  database: BetterSqlite3.Database,
  options: {
    force?: boolean;
    refreshIntervalMs?: number;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<PromoOriginSyncSummary> {
  if (!hasTable(database, "CardPromoOrigin")) {
    return {
      status: "skipped",
      sourcesChecked: 0,
      originsSaved: 0,
      cardsCovered: 0,
      productLinksSaved: 0,
      unmatchedProducts: 0,
      errors: ["CardPromoOrigin table is not available yet"],
    };
  }
  if (
    !options.force &&
    !isRefreshDue(database, options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS)
  ) {
    return {
      status: "skipped",
      sourcesChecked: 0,
      originsSaved: 0,
      cardsCovered: 0,
      productLinksSaved: 0,
      unmatchedProducts: 0,
      errors: [],
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const products = database
    .prepare(
      `SELECT sp.id, sp.name, COALESCE(sp.release_date, e.release_date) AS releaseDate
       FROM "SealedProduct" sp
       INNER JOIN "Episode" e ON e.id = sp.episode_id
       WHERE sp.game = 'pokemon'
       ORDER BY sp.name ASC`
    )
    .all() as SealedProductRow[];
  const coveredCardIds = new Set<string>();
  const errors: string[] = [];
  let sourcesChecked = 0;
  let originsSaved = 0;
  let productLinksSaved = 0;
  let unmatchedProducts = 0;

  const upsertOrigin = database.prepare(
    `INSERT INTO "CardPromoOrigin" (
       id, card_id, product_id, origin_name, normalized_name, origin_type,
       source_name, source_url, confidence, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(card_id, normalized_name) DO UPDATE SET
       product_id = excluded.product_id,
       origin_name = excluded.origin_name,
       origin_type = excluded.origin_type,
       source_name = excluded.source_name,
       source_url = excluded.source_url,
       confidence = excluded.confidence,
       updated_at = CURRENT_TIMESTAMP`
  );
  const upsertProductLink = database.prepare(
    `INSERT INTO "CardSealedProduct" (
       card_id, product_id, relation_type, source_name, source_url,
       confidence, notes, created_at, updated_at
     ) VALUES (?, ?, 'included_promo', ?, ?, 0.92, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(card_id, product_id) DO UPDATE SET
       relation_type = 'included_promo',
       source_name = excluded.source_name,
       source_url = excluded.source_url,
       confidence = excluded.confidence,
       notes = excluded.notes,
       updated_at = CURRENT_TIMESTAMP`
  );

  for (const source of PROMO_ORIGIN_SOURCES) {
    try {
      const episode = database
        .prepare(`SELECT id FROM "Episode" WHERE game = 'pokemon' AND name = ? LIMIT 1`)
        .get(source.episodeName) as { id: string } | undefined;
      if (!episode) {
        errors.push(`${source.episodeName}: expansion not found`);
        continue;
      }

      const response = await fetchImpl(getPromoOriginRawUrl(source.pageTitle), {
        headers: { "user-agent": "DustyCards/1.0 promo-origin-sync" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsedOrigins = parsePromoOriginWikitext(await response.text());
      if (parsedOrigins.length === 0) throw new Error("no promo origins parsed");
      sourcesChecked += 1;
      const eraProducts = products.filter((product) => {
        if (!product.releaseDate) return true;
        const year = new Date(product.releaseDate).getUTCFullYear();
        return Number.isFinite(year) && year >= source.minYear && year <= source.maxYear;
      });

      const cards = database
        .prepare(
          `SELECT id, name, card_number, printed_card_number
           FROM "Card"
           WHERE episode_id = ?
           ORDER BY id ASC`
        )
        .all(episode.id) as PromoCardRow[];
      const cardsByNumber = new Map<string, PromoCardRow[]>();
      for (const card of cards) {
        const numbers = [card.card_number, card.printed_card_number]
          .map(normalizePromoNumber)
          .filter((value): value is string => Boolean(value));
        for (const number of new Set(numbers)) {
          cardsByNumber.set(number, [...(cardsByNumber.get(number) ?? []), card]);
        }
      }

      const sourceUrl = getPromoOriginSourceUrl(source.pageTitle);
      database.transaction(() => {
        const cardIds = cards.map((card) => card.id);
        if (cardIds.length > 0) {
          const placeholders = cardIds.map(() => "?").join(",");
          database
            .prepare(
              `DELETE FROM "CardPromoOrigin"
               WHERE source_name = ? AND card_id IN (${placeholders})`
            )
            .run(SOURCE_NAME, ...cardIds);
          database
            .prepare(
              `DELETE FROM "CardSealedProduct"
               WHERE source_name = ? AND card_id IN (${placeholders})`
            )
            .run(SOURCE_NAME, ...cardIds);
        }

        for (const origin of parsedOrigins) {
          const matchingCards = cardsByNumber.get(origin.promoNumber) ?? [];
          for (const card of matchingCards) {
            const product = origin.originType === "sealed_product"
              ? findPromoOriginProduct(origin.originName, card.name, eraProducts)
              : null;
            upsertOrigin.run(
              randomUUID(),
              card.id,
              product?.id ?? null,
              origin.originName,
              origin.normalizedName,
              origin.originType,
              SOURCE_NAME,
              sourceUrl,
              0.98
            );
            originsSaved += 1;
            coveredCardIds.add(card.id);
            if (product) {
              upsertProductLink.run(
                card.id,
                product.id,
                SOURCE_NAME,
                sourceUrl,
                `Promo distribution: ${origin.originName}`
              );
              productLinksSaved += 1;
            } else if (origin.originType === "sealed_product") {
              unmatchedProducts += 1;
            }
          }
        }
      })();
    } catch (error) {
      errors.push(
        `${source.episodeName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const status = errors.length === 0 ? "success" : "partial";
  const summary: PromoOriginSyncSummary = {
    status,
    sourcesChecked,
    originsSaved,
    cardsCovered: coveredCardIds.size,
    productLinksSaved,
    unmatchedProducts,
    errors,
  };
  if (hasTable(database, "SyncLog")) {
    database
      .prepare(
        `INSERT INTO "SyncLog" (
           id, type, status, message, details_json, started_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run(
        randomUUID(),
        SYNC_TYPE,
        status,
        status === "success" ? "Promo origins refreshed" : "Promo origins partially refreshed",
        JSON.stringify(summary)
      );
  }
  return summary;
}
