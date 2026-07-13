import Database from "better-sqlite3";

const db = new Database("dustycards.db", { readonly: true });
const suspiciousLimit = Math.max(0, Number.parseInt(process.argv[2] ?? "50", 10) || 0);

const rows = db.prepare(`
  SELECT
    c.id,
    c.game,
    c.name,
    c.printed_card_number,
    c.card_number,
    e.name AS episode_name,
    p.fetched_at,
    p.cm_en_lowest_nm,
    p.cm_de_lowest_nm,
    p.cm_fr_lowest_nm,
    p.cm_es_lowest_nm,
    p.cm_it_lowest_nm,
    p.cm_jp_lowest_nm,
    p.cm_en_avg_7d,
    p.cm_en_avg_30d,
    p.tcp_market,
    (
      SELECT previous.cm_en_lowest_nm
      FROM Price previous
      WHERE previous.card_id = c.id
        AND previous.cm_en_lowest_nm IS NOT NULL
        AND previous.id <> p.id
      ORDER BY previous.fetched_at DESC, previous.id DESC
      LIMIT 1
    ) AS previous_en
  FROM Card c
  INNER JOIN Episode e ON e.id = c.episode_id
  LEFT JOIN Price p ON p.id = (
    SELECT latest.id
    FROM Price latest
    WHERE latest.card_id = c.id
    ORDER BY latest.fetched_at DESC, latest.id DESC
    LIMIT 1
  )
`).all();

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function median(values) {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const audited = rows.map((row) => {
  const english = positive(row.cm_en_lowest_nm);
  const otherLanguages = [
    row.cm_de_lowest_nm,
    row.cm_fr_lowest_nm,
    row.cm_es_lowest_nm,
    row.cm_it_lowest_nm,
    row.cm_jp_lowest_nm,
  ].map(positive);
  const otherMedian = median(otherLanguages);
  const previousEnglish = positive(row.previous_en);
  return {
    ...row,
    english,
    otherMedian,
    previousEnglish,
    historyRatio: english != null && previousEnglish != null ? english / previousEnglish : null,
    languageRatio: english != null && otherMedian != null ? english / otherMedian : null,
  };
});

const hasLatest = audited.filter((row) => row.fetched_at != null);
const missingEnglish = hasLatest.filter((row) => row.english == null);
const missingEnglishWithOtherLanguage = missingEnglish.filter((row) => row.otherMedian != null);
const suspicious = audited
  .filter((row) => {
    const historyOutlier = row.historyRatio != null && (row.historyRatio < 0.4 || row.historyRatio > 2.5);
    const languageOutlier = row.languageRatio != null && (row.languageRatio < 0.3 || row.languageRatio > 3.5);
    return historyOutlier || languageOutlier;
  })
  .sort((left, right) => {
    const leftDistance = Math.max(
      left.historyRatio == null ? 1 : Math.max(left.historyRatio, 1 / left.historyRatio),
      left.languageRatio == null ? 1 : Math.max(left.languageRatio, 1 / left.languageRatio)
    );
    const rightDistance = Math.max(
      right.historyRatio == null ? 1 : Math.max(right.historyRatio, 1 / right.historyRatio),
      right.languageRatio == null ? 1 : Math.max(right.languageRatio, 1 / right.languageRatio)
    );
    return rightDistance - leftDistance;
  });

const darkrai = audited.find(
  (row) =>
    row.name === "Darkrai-EX" &&
    (row.printed_card_number === "107/108" || row.card_number === "107/108")
);

const result = {
  generatedAt: new Date().toISOString(),
  totals: {
    cards: audited.length,
    cardsWithLatestSnapshot: hasLatest.length,
    cardsWithEnglishNm: hasLatest.length - missingEnglish.length,
    cardsMissingEnglishNm: missingEnglish.length,
    cardsThatWouldHaveFallenBackToAnotherLanguage: missingEnglishWithOtherLanguage.length,
    suspiciousEnglishNmRecords: suspicious.length,
  },
  darkrai,
  topSuspicious: suspicious.slice(0, suspiciousLimit).map((row) => ({
    id: row.id,
    game: row.game,
    name: row.name,
    number: row.printed_card_number ?? row.card_number,
    episode: row.episode_name,
    fetchedAt: row.fetched_at,
    english: row.english,
    previousEnglish: row.previousEnglish,
    otherLanguageMedian: row.otherMedian,
    historyRatio: row.historyRatio,
    languageRatio: row.languageRatio,
  })),
};

console.log(JSON.stringify(result, null, 2));
db.close();
