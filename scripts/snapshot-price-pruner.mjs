function validSql(column) {
  return `"${column}" IS NOT NULL AND "${column}" > 0 AND "${column}" <> 9001`;
}

const validEnglish = validSql("cm_en_lowest_nm");
const validTcgPlayer = ["tcp_market", "tcp_mid", "tcp_low"]
  .map((column) => validSql(column))
  .join(" OR ");
const validAuxiliary = [
  "cm_de_lowest_nm",
  "cm_fr_lowest_nm",
  "cm_es_lowest_nm",
  "cm_it_lowest_nm",
  "cm_jp_lowest_nm",
  "cm_en_avg_7d",
  "cm_en_avg_30d",
]
  .map((column) => validSql(column))
  .join(" OR ");

/**
 * Keep a compact but source-complete current-price snapshot per card. A direct
 * CardMarket row and a TCGPlayer row can be different observations, so keeping
 * only the newest Price row would silently discard one market on a fresh DB.
 */
export function prunePriceHistoryForSnapshot(db) {
  db.exec(`
    WITH "ranked_prices" AS (
      SELECT
        "id",
        "card_id",
        (${validEnglish}) AS "has_english",
        (${validTcgPlayer}) AS "has_tcgplayer",
        (${validAuxiliary}) AS "has_auxiliary",
        ROW_NUMBER() OVER (
          PARTITION BY "card_id"
          ORDER BY "fetched_at" DESC, "id" DESC
        ) AS "overall_rank",
        ROW_NUMBER() OVER (
          PARTITION BY "card_id"
          ORDER BY
            CASE WHEN (${validEnglish}) THEN 0 ELSE 1 END,
            "fetched_at" DESC,
            "id" DESC
        ) AS "english_rank",
        ROW_NUMBER() OVER (
          PARTITION BY "card_id"
          ORDER BY
            CASE WHEN (${validTcgPlayer}) THEN 0 ELSE 1 END,
            "fetched_at" DESC,
            "id" DESC
        ) AS "tcgplayer_rank",
        ROW_NUMBER() OVER (
          PARTITION BY "card_id"
          ORDER BY
            CASE WHEN (${validAuxiliary}) THEN 0 ELSE 1 END,
            "fetched_at" DESC,
            "id" DESC
        ) AS "auxiliary_rank"
      FROM "Price"
    ),
    "retained_prices" AS (
      SELECT "id"
      FROM "ranked_prices"
      WHERE
        "overall_rank" = 1
        OR ("has_english" = 1 AND "english_rank" = 1)
        OR ("has_tcgplayer" = 1 AND "tcgplayer_rank" = 1)
        OR ("has_auxiliary" = 1 AND "auxiliary_rank" = 1)
    )
    DELETE FROM "Price"
    WHERE "id" NOT IN (SELECT "id" FROM "retained_prices");
  `);
}
