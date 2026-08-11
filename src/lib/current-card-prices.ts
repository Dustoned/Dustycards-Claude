import { db } from "@/lib/db";

const SQLITE_SAFE_CHUNK_SIZE = 300;

export interface CurrentCardMarketFields {
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm?: number | null;
  tcp_market?: number | null;
  tcp_mid?: number | null;
  tcp_low?: number | null;
}

const CURRENT_PRICE_FIELDS = [
  "cm_en_lowest_nm",
  "cm_de_lowest_nm",
  "cm_fr_lowest_nm",
  "cm_es_lowest_nm",
  "cm_it_lowest_nm",
  "cm_jp_lowest_nm",
  "tcp_market",
  "tcp_mid",
  "tcp_low",
] as const;

type CurrentPriceField = (typeof CURRENT_PRICE_FIELDS)[number];
type HydratedCurrentPriceRow = {
  card_id: string;
} & Record<CurrentPriceField, number | null>;

function latestFieldSql(field: CurrentPriceField): string {
  return `(
    SELECT p."${field}"
    FROM "Price" p
    WHERE p."card_id" = requested."id"
      AND p."${field}" > 0
      AND p."${field}" <> 9001
    ORDER BY p."fetched_at" DESC, p."id" DESC
    LIMIT 1
  ) AS "${field}"`;
}

/**
 * Compact list queries intentionally load one newest CM-or-TCP row. Resolve
 * CardMarket and TCGPlayer independently so a source-pure observation from
 * either provider cannot hide the other provider's latest quote.
 */
export async function hydrateLatestCardMarketFields<
  P extends CurrentCardMarketFields,
  C extends { id: string; prices: P[] },
>(cards: readonly C[]): Promise<C[]> {
  const cardIds = [
    ...new Set(cards.filter((card) => card.prices[0] != null).map((card) => card.id)),
  ];
  if (cardIds.length === 0) return [...cards];

  const latestByCardId = new Map<string, HydratedCurrentPriceRow>();
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CHUNK_SIZE) {
    const chunk = cardIds.slice(index, index + SQLITE_SAFE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "(?)").join(", ");
    const rows = await db.$queryRawUnsafe<HydratedCurrentPriceRow[]>(
      `
      WITH requested("id") AS (VALUES ${placeholders})
      SELECT
        requested."id" AS "card_id",
        ${CURRENT_PRICE_FIELDS.map(latestFieldSql).join(",\n        ")}
      FROM requested
      `,
      ...chunk
    );
    for (const row of rows) latestByCardId.set(row.card_id, row);
  }

  return cards.map((card) => {
    const current = card.prices[0];
    if (!current) return card;
    const resolved = latestByCardId.get(card.id);
    if (!resolved) return card;
    return {
      ...card,
      prices: [
        {
          ...current,
          ...Object.fromEntries(
            CURRENT_PRICE_FIELDS.map((field) => [field, resolved[field]])
          ),
        } as P,
      ],
    };
  });
}
