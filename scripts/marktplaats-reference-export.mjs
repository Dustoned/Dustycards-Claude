// Read-only DustyCards reference export for the external Codex Marktplaats scan.
// The scan itself never runs inside Next.js; this bounded query only snapshots
// the catalogue values that the website already displays.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDatabase = process.env.DUSTYCARDS_DATABASE_PATH?.trim()
  ? path.resolve(process.env.DUSTYCARDS_DATABASE_PATH.trim())
  : path.join(projectRoot, "dustycards.db");
const snapshotDatabase = path.join(projectRoot, "data", "dustycards.app.db");

function parseArgs(argv) {
  const options = {
    database: fs.existsSync(defaultDatabase) ? defaultDatabase : snapshotDatabase,
    output: path.join(projectRoot, "data", "marktplaats", "reference-latest.json"),
  };
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--db") options.database = path.resolve(argv[++index]);
    else if (argument === "--out") options.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function finitePrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value !== 9001
    ? Number(value.toFixed(2))
    : null;
}

function loadSignalRadarSnapshot() {
  const snapshotPath = path.join(
    projectRoot,
    "data",
    "signal-radar-snapshots",
    "pokemon.json"
  );
  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    const signals = Array.isArray(parsed?.data?.signals) ? parsed.data.signals : [];
    return {
      writtenAt: typeof parsed?.writtenAt === "string" ? parsed.writtenAt : null,
      generatedAt:
        typeof parsed?.data?.generatedAt === "string" ? parsed.data.generatedAt : null,
      signals,
    };
  } catch {
    return { writtenAt: null, generatedAt: null, signals: [] };
  }
}

function parseGradeLabel(label, explicitCompany = null, explicitGrade = null) {
  const normalized = String(label ?? "").trim().toUpperCase();
  const company = explicitCompany?.trim().toUpperCase() ||
    normalized.match(/\b(PSA|BGS|CGC|SGC|ACE|TAG)\b/)?.[1] || null;
  const grade = explicitGrade?.trim() ||
    normalized.match(/(?:^|\s)(10|[1-9](?:\.5)?)(?:\s|$)/)?.[1] || null;
  return { company, grade };
}

const MIN_CARD_MARKET_VALUE_EUR = 5;

function normalizedGame(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizedQueryPart(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function dailyRotation(items, count, exportedAt, salt) {
  if (items.length <= count) return items;
  const dayNumber = Math.floor(new Date(exportedAt).getTime() / 86_400_000);
  let saltHash = 0;
  for (const character of salt) {
    saltHash = ((saltHash * 31) + character.charCodeAt(0)) >>> 0;
  }
  const start = ((dayNumber * count) + saltHash) % items.length;
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

function uniqueQueries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function takeDistinct(items, predicatesWithLimits) {
  const selected = [];
  const selectedKeys = new Set();
  for (const [predicate, limit] of predicatesWithLimits) {
    let taken = 0;
    for (const item of items) {
      const key = String(item.id ?? `${item.cardId}:${item.company}:${item.grade}`);
      if (taken >= limit) break;
      if (selectedKeys.has(key) || !predicate(item)) continue;
      selectedKeys.add(key);
      selected.push(item);
      taken += 1;
    }
  }
  return selected;
}

function buildSearchPlan({ cards, expansions, gradedPrices, radarSnapshot, exportedAt }) {
  const eligibleCards = cards
    .filter((card) =>
      normalizedGame(card.game) === "pokemon" &&
      card.marketValueEur >= MIN_CARD_MARKET_VALUE_EUR
    )
    .sort((left, right) =>
      right.marketValueEur - left.marketValueEur || left.id.localeCompare(right.id)
    );
  const cardEntry = (card, priority, radarSignal = null) => {
    const number = normalizedQueryPart(card.printedCardNumber ?? card.cardNumber);
    const name = normalizedQueryPart(card.name);
    const setCode = normalizedQueryPart(card.expansionCode);
    return {
      query: [name, number].filter(Boolean).join(" "),
      fallbackQuery: [name, setCode, "engels"].filter(Boolean).join(" "),
      purpose: "exact-card",
      priority,
      cardId: card.id,
      marketValueEur: card.marketValueEur,
      expected: {
        name: card.name,
        cardNumber: card.printedCardNumber ?? card.cardNumber,
        expansionName: card.expansionName,
        expansionCode: card.expansionCode,
      },
      signalRadar: radarSignal
        ? {
            rank: radarSignal.rank,
            pressureLabel: radarSignal.pressureLabel,
            externalScore: radarSignal.externalScore,
            confidence: radarSignal.confidence,
            reason:
              Array.isArray(radarSignal.reasons) && radarSignal.reasons.length
                ? radarSignal.reasons[0]
                : radarSignal.pressureExplanation ?? null,
          }
        : null,
    };
  };
  const eligibleCardsById = new Map(eligibleCards.map((card) => [card.id, card]));
  const radarCardRows = radarSnapshot.signals
    .filter((signal) => normalizedGame(signal.game) === "pokemon")
    .sort((left, right) => Number(left.rank ?? 999) - Number(right.rank ?? 999))
    .map((signal) => ({ signal, card: eligibleCardsById.get(String(signal.cardId)) ?? null }))
    .filter((entry) => entry.card)
    .slice(0, 24);
  const radarCardIds = new Set(radarCardRows.map((entry) => entry.card.id));
  const signalRadarCards = radarCardRows.map(({ signal, card }) =>
    cardEntry(card, "signal-radar", signal)
  );
  const nonRadarEligibleCards = eligibleCards.filter((card) => !radarCardIds.has(card.id));
  const alwaysCardRows = takeDistinct(nonRadarEligibleCards, [
    [(card) => card.marketValueEur >= 500 && card.marketValueEur <= 10_000, 4],
    [(card) => card.marketValueEur >= 50 && card.marketValueEur < 500, 4],
    [(card) => card.marketValueEur >= 5 && card.marketValueEur < 50, 4],
  ]);
  const alwaysCardIds = new Set(alwaysCardRows.map((card) => card.id));
  const alwaysCards = alwaysCardRows.map((card) => cardEntry(card, "daily-value-tier"));
  const rotatingCards = dailyRotation(
    nonRadarEligibleCards.filter((card) => !alwaysCardIds.has(card.id)),
    14,
    exportedAt,
    "raw-card-rotation"
  ).map((card) => cardEntry(card, "rotating-catalog"));

  const eligibleGraded = gradedPrices
    .filter((price) =>
      normalizedGame(price.game) === "pokemon" &&
      price.company &&
      price.grade &&
      price.marketValueEur >= MIN_CARD_MARKET_VALUE_EUR
    )
    .sort((left, right) =>
      right.marketValueEur - left.marketValueEur ||
      `${left.cardId}:${left.company}:${left.grade}`.localeCompare(
        `${right.cardId}:${right.company}:${right.grade}`
      )
    );
  const gradedEntry = (price, priority) => ({
    query: [
      normalizedQueryPart(price.cardName),
      normalizedQueryPart(price.printedCardNumber ?? price.cardNumber),
      price.company,
      price.grade,
    ].filter(Boolean).join(" "),
    fallbackQuery: [
      normalizedQueryPart(price.cardName),
      normalizedQueryPart(price.expansionCode),
      price.company,
      price.grade,
    ].filter(Boolean).join(" "),
    purpose: "exact-graded-card",
    priority,
    cardId: price.cardId,
    company: price.company,
    grade: price.grade,
    marketValueEur: price.marketValueEur,
    source: price.source,
  });
  const gradedKey = (price) => `${price.cardId}:${price.company}:${price.grade}`;
  const alwaysGradedRows = takeDistinct(eligibleGraded, [
    [(price) => price.company === "PSA" && price.marketValueEur >= 500, 2],
    [(price) => price.company === "PSA" && price.marketValueEur >= 100 && price.marketValueEur < 500, 2],
    [(price) => price.company === "PSA" && price.marketValueEur >= 5 && price.marketValueEur < 100, 2],
    [(price) => price.company === "CGC", 3],
    [(price) => price.company === "BGS", 3],
    [(price) => price.marketValueEur >= 500 && price.marketValueEur <= 25_000, 2],
    [(price) => price.marketValueEur >= 100 && price.marketValueEur < 500, 2],
    [(price) => price.marketValueEur >= 5 && price.marketValueEur < 100, 2],
  ]);
  const alwaysGradedKeys = new Set(alwaysGradedRows.map(gradedKey));
  const alwaysGraded = alwaysGradedRows.map((price) => gradedEntry(price, "daily-value-tier"));
  const rotatingGraded = dailyRotation(
    eligibleGraded.filter((price) => !alwaysGradedKeys.has(gradedKey(price))),
    24,
    exportedAt,
    "graded-card-rotation"
  ).map((price) => gradedEntry(price, "rotating-catalog"));

  const eligibleExpansions = expansions
    .filter((expansion) => normalizedGame(expansion.game) === "pokemon")
    .sort((left, right) =>
      right.marketValueEur - left.marketValueEur || left.id.localeCompare(right.id)
    );
  const expansionEntry = (expansion, priority) => ({
    query: `${normalizedQueryPart(expansion.name)} complete set engels`,
    fallbackQuery: `${normalizedQueryPart(expansion.name)} master set engels`,
    purpose: "complete-expansion",
    priority,
    episodeId: expansion.id,
    marketValueEur: expansion.marketValueEur,
    expected: {
      expansionName: expansion.name,
      expansionCode: expansion.code,
      totalCards: expansion.totalCards,
    },
  });
  const alwaysExpansionRows = takeDistinct(eligibleExpansions, [
    [(expansion) => expansion.marketValueEur >= 2_500, 4],
    [(expansion) => expansion.marketValueEur >= 1_000 && expansion.marketValueEur < 2_500, 4],
    [(expansion) => expansion.marketValueEur >= 500 && expansion.marketValueEur < 1_000, 4],
    [(expansion) => expansion.marketValueEur < 500, 4],
  ]);
  const alwaysExpansionIds = new Set(alwaysExpansionRows.map((expansion) => expansion.id));
  const alwaysExpansions = alwaysExpansionRows
    .map((expansion) => expansionEntry(expansion, "daily-high-value"));
  const rotatingExpansions = dailyRotation(
    eligibleExpansions.filter((expansion) => !alwaysExpansionIds.has(expansion.id)),
    16,
    exportedAt,
    "expansion-rotation"
  ).map((expansion) => expansionEntry(expansion, "rotating-catalog"));

  const rawDiscovery = [
    "pokemon kaarten engels",
    "pokemon kaart english",
  ].map((query) => ({ query, purpose: "raw-discovery", kind: "raw", sort: "DATE_DESC" }));
  const collectionDiscovery = [
    "pokemon collectie engels",
    "pokemon verzameling engels",
    "pokemon binder engels",
    "pokemon map kaarten engels",
    "pokemon kaarten verzameling english",
    "pokemon kaarten collectie english",
  ].map((query) => ({ query, purpose: "collection-discovery", kind: "collection", sort: "DATE_DESC" }));
  const expansionDiscovery = [
    "pokemon complete set engels",
    "pokemon master set engels",
    "pokemon masterset engels",
    "pokemon volledige set engels",
    "pokemon complete expansion engels",
    "pokemon complete pokemon set english",
    "pokemon volledige pokemon uitbreiding engels",
    "pokemon base set compleet engels",
  ].map((query) => ({ query, purpose: "expansion-discovery", kind: "expansion", sort: "DATE_DESC" }));
  const gradedDiscovery = [
    "pokemon graded engels",
    "pokemon graded kaart english",
    "pokemon PSA engels",
    "pokemon PSA 8 engels",
    "pokemon PSA 9 engels",
    "pokemon PSA 10 engels",
    "pokemon CGC 9 engels",
    "pokemon CGC 10 engels",
    "pokemon BGS 9 engels",
    "pokemon BGS 9.5 engels",
    "pokemon BGS 10 engels",
  ].map((query) => ({ query, purpose: "graded-discovery", kind: "graded", sort: "DATE_DESC" }));
  const discovery = uniqueQueries([
    ...gradedDiscovery,
    ...expansionDiscovery,
    ...collectionDiscovery,
    ...rawDiscovery,
  ]);

  const exactCards = uniqueQueries([...alwaysCards, ...rotatingCards]);
  const gradedCards = uniqueQueries([...alwaysGraded, ...rotatingGraded]);
  const completeExpansions = uniqueQueries([...alwaysExpansions, ...rotatingExpansions]);
  const primaryQueryCount =
    discovery.length +
    signalRadarCards.length +
    exactCards.length +
    gradedCards.length +
    completeExpansions.length;

  return {
    generatedFor: exportedAt.slice(0, 10),
    minimumCardMarketValueEur: MIN_CARD_MARKET_VALUE_EUR,
    strategy: "category-reserved-daily-rotation-v2",
    limits: {
      maxPrimaryQueries: primaryQueryCount,
      discoveryPagesPerQuery: 3,
      targetedPagesPerQuery: 1,
      maxDescriptionsToOpen: 180,
      descriptionQuotas: {
        graded: 60,
        expansion: 50,
        collection: 20,
        raw: 50,
      },
      minimumDelayMsBetweenSearches: 1_500,
    },
    instructions: [
      "Run every discovery query sorted newest-first and deduplicate candidates by Marktplaats m-id.",
      "Reserve the complete description quota for each category before letting another category use unused capacity.",
      "For graded and expansion candidates, continue through the reserved quota even when enough raw singles have already been found.",
      "Run each primary targeted query once. Use fallbackQuery only when the primary returns no plausible result.",
      "Open the full advert for every candidate before matching; title snippets never qualify as final evidence.",
      "Reject Catawiki, sponsored external links, auctions without a fixed price, lots with unclear contents, and cards below the minimum market value.",
      "Recheck every priorActiveDeals URL and record unavailable IDs in removedExternalIds.",
    ],
    discovery,
    discoveryByKind: {
      graded: gradedDiscovery,
      expansion: expansionDiscovery,
      collection: collectionDiscovery,
      raw: rawDiscovery,
    },
    signalRadarSnapshotAt: radarSnapshot.writtenAt,
    signalRadarGeneratedAt: radarSnapshot.generatedAt,
    signalRadarCards: uniqueQueries(signalRadarCards),
    exactCards,
    gradedCards,
    completeExpansions,
    eligibleCatalogCounts: {
      rawCards: eligibleCards.length,
      gradedPrices: eligibleGraded.length,
      expansions: eligibleExpansions.length,
    },
  };
}

function main() {
  const options = parseArgs(process.argv);
  if (!fs.existsSync(options.database)) {
    throw new Error(`DustyCards database not found: ${options.database}`);
  }

  const database = new Database(options.database, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  database.pragma("query_only = ON");
  database.pragma("busy_timeout = 5000");

  try {
    const exportedAt = new Date().toISOString();
    const cards = database.prepare(`
      WITH latest_price AS (
        SELECT card_id, cm_en_lowest_nm, fetched_at
        FROM (
          SELECT
            p.card_id,
            p.cm_en_lowest_nm,
            p.fetched_at,
            ROW_NUMBER() OVER (
              PARTITION BY p.card_id
              ORDER BY p.fetched_at DESC, p.id DESC
            ) AS row_num
          FROM "Price" p
          WHERE p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
        )
        WHERE row_num = 1
      )
      SELECT
        c.id,
        c.game,
        c.name,
        c.card_number AS cardNumber,
        c.printed_card_number AS printedCardNumber,
        c.version,
        c.rarity,
        c.image_url AS imageUrl,
        e.id AS episodeId,
        e.name AS expansionName,
        e.code AS expansionCode,
        lp.cm_en_lowest_nm AS marketValueEur,
        lp.fetched_at AS priceFetchedAt
      FROM "Card" c
      JOIN "Episode" e ON e.id = c.episode_id
      JOIN latest_price lp ON lp.card_id = c.id
      ORDER BY c.game, e.release_date DESC, e.name, c.card_number, c.name
    `).all().map((row) => ({ ...row, marketValueEur: finitePrice(row.marketValueEur) }));

    const expansionTotals = database.prepare(`
      WITH latest_price AS (
        SELECT card_id, cm_en_lowest_nm, fetched_at
        FROM (
          SELECT
            p.card_id,
            p.cm_en_lowest_nm,
            p.fetched_at,
            ROW_NUMBER() OVER (
              PARTITION BY p.card_id
              ORDER BY p.fetched_at DESC, p.id DESC
            ) AS row_num
          FROM "Price" p
          WHERE p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
        )
        WHERE row_num = 1
      )
      SELECT
        e.id,
        e.game,
        e.name,
        e.code,
        e.release_date AS releaseDate,
        COUNT(c.id) AS totalCards,
        COUNT(lp.card_id) AS pricedCards,
        ROUND(SUM(lp.cm_en_lowest_nm), 2) AS marketValueEur,
        MAX(lp.fetched_at) AS priceFetchedAt
      FROM "Episode" e
      JOIN "Card" c ON c.episode_id = e.id
      LEFT JOIN latest_price lp ON lp.card_id = c.id
      GROUP BY e.id, e.game, e.name, e.code, e.release_date
      HAVING COUNT(lp.card_id) > 0
      ORDER BY e.game, e.release_date DESC, e.name
    `).all().map((row) => ({ ...row, marketValueEur: finitePrice(row.marketValueEur) }));

    const cardMarketGraded = database.prepare(`
      SELECT
        gp.card_id AS cardId,
        gp.label,
        gp.price,
        gp.fetched_at AS fetchedAt,
        c.game,
        c.name AS cardName,
        c.card_number AS cardNumber,
        c.printed_card_number AS printedCardNumber,
        e.name AS expansionName,
        e.code AS expansionCode
      FROM "CardGradedPrice" gp
      JOIN "Card" c ON c.id = gp.card_id
      JOIN "Episode" e ON e.id = c.episode_id
      WHERE gp.price > 0 AND gp.price <> 9001
      ORDER BY gp.card_id, gp.label
    `).all().map((row) => ({
      ...row,
      ...parseGradeLabel(row.label),
      source: "cardmarket",
      currency: "EUR",
      marketValueEur: finitePrice(row.price),
    }));

    const ebaySoldGraded = database.prepare(`
      SELECT
        gp.card_id AS cardId,
        gp.label,
        gp.company,
        gp.grade,
        gp.median_price AS price,
        gp.currency,
        gp.sample_size AS sampleSize,
        gp.fetched_at AS fetchedAt,
        c.game,
        c.name AS cardName,
        c.card_number AS cardNumber,
        c.printed_card_number AS printedCardNumber,
        e.name AS expansionName,
        e.code AS expansionCode
      FROM "CardEbaySoldGradedPrice" gp
      JOIN "Card" c ON c.id = gp.card_id
      JOIN "Episode" e ON e.id = c.episode_id
      WHERE gp.median_price > 0 AND gp.median_price <> 9001
      ORDER BY gp.card_id, gp.company, gp.grade
    `).all().map((row) => ({
      ...row,
      ...parseGradeLabel(row.label, row.company, row.grade),
      source: "ebay_sold",
      marketValueEur: row.currency?.toUpperCase() === "EUR" ? finitePrice(row.price) : null,
    }));

    const hasDealTable = Boolean(
      database.prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'MarktplaatsDeal'`
      ).get()
    );
    const priorActiveDeals = hasDealTable
      ? database.prepare(`
          SELECT
            external_id AS externalId,
            listing_url AS listingUrl,
            title,
            kind,
            last_seen_at AS lastSeenAt
          FROM "MarktplaatsDeal"
          WHERE removed_at IS NULL
          ORDER BY last_seen_at ASC
        `).all()
      : [];

    const gradedPrices = [...cardMarketGraded, ...ebaySoldGraded];
    // Collection photo identification also needs printings with no current price.
    const collectionCatalog = database.prepare(`
      SELECT c.id, c.name, c.card_number AS cardNumber,
        c.printed_card_number AS printedCardNumber, c.version, c.rarity,
        c.image_url AS imageUrl, e.name AS expansionName, e.code AS expansionCode
      FROM "Card" c JOIN "Episode" e ON e.id = c.episode_id
      WHERE c.game = 'pokemon' ORDER BY e.name, c.name, c.card_number
    `).all();
    const hasInspections = database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'MarktplaatsCollectionInspection'`).get();
    const priorCollectionInspections = hasInspections ? database.prepare(`
      SELECT external_id AS externalId, observed_at AS observedAt, report_json AS reportJson
      FROM "MarktplaatsCollectionInspection" WHERE removed_at IS NULL ORDER BY observed_at ASC
    `).all().flatMap((row) => {
      try {
        const report = JSON.parse(row.reportJson);
        return [{ externalId: row.externalId, observedAt: row.observedAt, listingUrl: report.listingUrl, title: report.title }];
      } catch { return []; }
    }) : [];
    const radarSnapshot = loadSignalRadarSnapshot();
    const searchPlan = buildSearchPlan({
      cards,
      expansions: expansionTotals,
      gradedPrices,
      radarSnapshot,
      exportedAt,
    });
    const output = {
      schemaVersion: 1,
      exportedAt,
      source: "dustycards-read-only",
      pricingRules: {
        raw: "CardMarket English Near Mint lowest listing",
        expansion: "DustyCards total of current English Near Mint card values",
        graded: "CardMarket graded price; eBay sold median is included with its source currency",
        shipping: "Display separately and never include in deal calculations",
      },
      cards,
      expansions: expansionTotals,
      gradedPrices,
      searchPlan,
      priorActiveDeals,
      collectionCatalog,
      priorCollectionInspections,
      reportContract: {
        path: "data/marktplaats/report-latest.json",
        command: "npm run marktplaats:import -- --in data/marktplaats/report-latest.json",
        schemaVersion: 1,
        dealKinds: ["raw", "graded", "expansion", "collection"],
        collectionInspections: "Optional top-level collections array; bid-only adverts allowed here. Follow docs/marktplaats-collections.md. Inspect every original and crop. Prices are computed by the app, never supplied by the report. Use removedCollectionIds for unavailable m-ids.",
        note: "Open every candidate and read its full description. Every definitive match requires descriptionChecked=true plus a descriptionSummary and offerContents. Every matched raw deal must be explicitly English. Every matched graded deal needs an exact company and grade. Use matchStatus=review when uncertain. Recheck prior active URLs and put unavailable listing IDs in scan.removedExternalIds.",
      },
    };

    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    const temporaryPath = `${options.output}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, options.output);
    console.log(JSON.stringify({
      ok: true,
      output: options.output,
      exportedAt,
      cards: cards.length,
      expansions: expansionTotals.length,
      gradedPrices: output.gradedPrices.length,
      searchQueries:
        searchPlan.discovery.length +
        searchPlan.signalRadarCards.length +
        searchPlan.exactCards.length +
        searchPlan.gradedCards.length +
        searchPlan.completeExpansions.length,
      signalRadarQueries: searchPlan.signalRadarCards.length,
      priorActiveDeals: priorActiveDeals.length,
    }));
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  console.error("[marktplaats-reference-export]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
