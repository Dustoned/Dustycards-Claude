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

function parseGradeLabel(label, explicitCompany = null, explicitGrade = null) {
  const normalized = String(label ?? "").trim().toUpperCase();
  const company = explicitCompany?.trim().toUpperCase() ||
    normalized.match(/\b(PSA|BGS|CGC|SGC|ACE|TAG)\b/)?.[1] || null;
  const grade = explicitGrade?.trim() ||
    normalized.match(/(?:^|\s)(10|[1-9](?:\.5)?)(?:\s|$)/)?.[1] || null;
  return { company, grade };
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
      gradedPrices: [...cardMarketGraded, ...ebaySoldGraded],
      priorActiveDeals,
      reportContract: {
        path: "data/marktplaats/report-latest.json",
        command: "npm run marktplaats:import -- --in data/marktplaats/report-latest.json",
        schemaVersion: 1,
        dealKinds: ["raw", "graded", "expansion"],
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
