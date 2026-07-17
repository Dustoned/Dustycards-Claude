// Offline backtest for the Signal Radar price scenario.
//
// Opens the app SQLite database READ-ONLY, samples the cards with the longest
// English-NM daily history, replays buildPriceScenario at historical as-of
// points with neutral external inputs (no catalysts, no eBay, neutral sealed)
// and scores the +90d/+180d predictions against realized prices.
//
// Usage:
//   node scripts/backtest-signal-radar.mjs [--cards 300] [--step 14]
//     [--min-days 420] [--out backtest-signal-radar-report.json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// db-paths.ts resolves the database relative to the working directory.
process.chdir(projectRoot);

function parseArgs(argv) {
  const options = {
    cards: 300,
    stepDays: 14,
    minDays: 420,
    out: "backtest-signal-radar-report.json",
    db: null,
  };
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--cards") options.cards = Number(argv[++index]);
    else if (arg === "--step") options.stepDays = Number(argv[++index]);
    else if (arg === "--min-days") options.minDays = Number(argv[++index]);
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--db") options.db = argv[++index];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!Number.isFinite(options.cards) || options.cards < 1) options.cards = 300;
  if (!Number.isFinite(options.stepDays) || options.stepDays < 1) options.stepDays = 14;
  if (!Number.isFinite(options.minDays) || options.minDays < 240) options.minDays = 420;
  return options;
}

// --- Minimal TS loader -------------------------------------------------------
// The harness lives in src/lib as TypeScript with "@/" imports. Node cannot
// load that directly, so the pure-lib module graph is transpiled into
// node_modules/.cache (bare imports still resolve against the project's
// node_modules from there) and imported from the cache.

const CACHE_DIR = path.join(projectRoot, "node_modules", ".cache", "signal-radar-backtest");
const emittedNames = new Map();

function resolveTsSpecifier(spec, fromFile) {
  let base = null;
  if (spec.startsWith("@/")) base = path.join(projectRoot, "src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else return null;
  const candidates = [`${base}.ts`, `${base}.tsx`, base, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (/\.tsx?$/.test(candidate) && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function emitTsModule(absPath) {
  let outName = emittedNames.get(absPath);
  if (outName) return outName;
  outName =
    path.relative(projectRoot, absPath).replace(/[\\/]/g, "__").replace(/\.tsx?$/, "") +
    ".mjs";
  // Registered before recursing so import cycles terminate.
  emittedNames.set(absPath, outName);
  const source = fs.readFileSync(absPath, "utf8");
  const output = ts.transpileModule(source, {
    fileName: absPath,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const rewritten = output.replace(
    /((?:^|[^\w$])(?:from|import)\s*\(?\s*)(["'])([^"'\n]+)\2/g,
    (match, prefix, quote, spec) => {
      const resolved = resolveTsSpecifier(spec, absPath);
      if (!resolved) return match;
      return `${prefix}${quote}./${emitTsModule(resolved)}${quote}`;
    }
  );
  fs.writeFileSync(path.join(CACHE_DIR, outName), rewritten);
  return outName;
}

async function importTsModule(relPath) {
  const outName = emitTsModule(path.join(projectRoot, relPath));
  return import(pathToFileURL(path.join(CACHE_DIR, outName)).href);
}

fs.rmSync(CACHE_DIR, { recursive: true, force: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const { runCardBacktest, summarizeBacktest } = await importTsModule(
  "src/lib/signal-radar-backtest.ts"
);
const { buildDailyMarketHistory } = await importTsModule("src/lib/robust-price-history.ts");
const { LIVE_DB_PATH, APP_DB_SNAPSHOT_PATH } = await importTsModule("src/lib/db-paths.ts");

// --- Database ---------------------------------------------------------------

const options = parseArgs(process.argv);
const dbPath = options.db ?? (fs.existsSync(LIVE_DB_PATH) ? LIVE_DB_PATH : APP_DB_SNAPSHOT_PATH);
if (!fs.existsSync(dbPath)) {
  console.error(`No database found at ${dbPath}.`);
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

function parseFetchedAt(value) {
  if (typeof value === "number") return new Date(value);
  const text = String(value).replace(" ", "T");
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
}

// Prisma stores DateTime as TEXT; a numeric epoch column gets the same
// day-bucketing through SQLite instead of substr.
const probe = db
  .prepare("SELECT fetched_at AS fetchedAt FROM Price WHERE cm_en_lowest_nm IS NOT NULL LIMIT 1")
  .get();
if (!probe) {
  console.error("The Price table has no English-NM observations.");
  process.exit(1);
}
const dayExpr =
  typeof probe.fetchedAt === "number"
    ? "date(p.fetched_at / 1000, 'unixepoch')"
    : "substr(p.fetched_at, 1, 10)";

const cards = db
  .prepare(
    `SELECT p.card_id AS cardId, c.name AS name, c.game AS game,
            COUNT(DISTINCT ${dayExpr}) AS dayCount
     FROM Price p
     INNER JOIN Card c ON c.id = p.card_id
     WHERE p.cm_en_lowest_nm IS NOT NULL AND p.cm_en_lowest_nm > 0 AND p.cm_en_lowest_nm <> 9001
     GROUP BY p.card_id
     HAVING COUNT(DISTINCT ${dayExpr}) >= ?
     ORDER BY dayCount DESC, p.card_id ASC
     LIMIT ?`
  )
  .all(options.minDays, options.cards);

if (cards.length === 0) {
  console.error(`No cards with at least ${options.minDays} daily EN-NM points.`);
  process.exit(1);
}
console.error(`Backtesting ${cards.length} cards from ${path.relative(projectRoot, dbPath)}...`);

const priceStatement = db.prepare(
  `SELECT fetched_at AS fetchedAt, cm_en_lowest_nm AS value
   FROM Price
   WHERE card_id = ? AND cm_en_lowest_nm IS NOT NULL
   ORDER BY fetched_at ASC, id ASC`
);

// --- Backtest ---------------------------------------------------------------

const perCard = [];
const allResults = [];
let done = 0;
for (const card of cards) {
  const rows = priceStatement.all(card.cardId);
  // Same dedup-by-day rule as the radar: buildDailyMarketHistory collapses
  // refresh rows into one median EN-NM observation per UTC day.
  const daily = buildDailyMarketHistory(
    rows.map((row) => ({
      observedAt: parseFetchedAt(row.fetchedAt),
      primaryValue: row.value,
    }))
  );
  const predictions = runCardBacktest(daily, { stepDays: options.stepDays });
  done++;
  if (done % 50 === 0) console.error(`  ${done}/${cards.length} cards done`);
  if (predictions.length === 0) continue;
  allResults.push(predictions);
  perCard.push({
    cardId: card.cardId,
    name: card.name,
    game: card.game,
    dayCount: card.dayCount,
    predictionCount: predictions.length,
    predictions,
  });
}
db.close();

const summary = summarizeBacktest(allResults);

// --- Output -----------------------------------------------------------------

const formatRate = (value) => (value == null ? "-" : `${(value * 100).toFixed(1)}%`);
const formatPct = (value) => (value == null ? "-" : `${value.toFixed(1)}%`);
console.log("");
console.log(
  `Signal Radar backtest: ${summary.scoredPredictions}/${summary.totalPredictions} scored ` +
    `predictions over ${perCard.length} cards (neutral external inputs)`
);
console.table(
  Object.entries(summary.byOutlook).map(([outlook, stats]) => ({
    outlook,
    samples: stats.samples,
    "direction hit": formatRate(stats.directionHitRate),
    "band coverage": formatRate(stats.bandCoverage),
    "mean |err|": formatPct(stats.meanAbsErrorPct),
    "mean predicted": formatPct(stats.meanPredictedPct),
    "mean realized": formatPct(stats.meanRealizedPct),
  }))
);

const reportPath = path.resolve(projectRoot, options.out);
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      dbPath: path.relative(projectRoot, dbPath),
      options: {
        cards: options.cards,
        stepDays: options.stepDays,
        minHistoryDays: options.minDays,
        horizonsDays: [90, 180],
        externalInputs: "neutral (no catalysts, no eBay, neutral sealed)",
      },
      cardsSampled: cards.length,
      cardsWithPredictions: perCard.length,
      summary,
      cards: perCard,
    },
    null,
    2
  )
);
console.log(`Report written to ${path.relative(projectRoot, reportPath)}`);
