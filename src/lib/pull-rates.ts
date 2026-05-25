import { db } from "@/lib/db";
import { normalizeRarityLabel } from "@/lib/rarity";

export const DEFAULT_PULL_RATE_SOURCE = "collectrics";
export const THEPRICEDEX_PULL_RATE_SOURCE = "pricedex";
export const PREFERRED_PULL_RATE_SOURCES = [
  THEPRICEDEX_PULL_RATE_SOURCE,
  DEFAULT_PULL_RATE_SOURCE,
] as const;
const COLLECTRICS_SET_API_BASE_URL = "https://mycollectrics.com/api/set";
const THEPRICEDEX_BASE_URL = "https://www.thepricedex.com";
const THEPRICEDEX_SITEMAP_URL = `${THEPRICEDEX_BASE_URL}/sitemap.xml`;

interface RawRecord {
  [key: string]: unknown;
}

interface ParsedPullRateRarity {
  normalizedRarity: string;
  rarityCode: string | null;
  rarityName: string;
  cardCount: number | null;
  perBoosterBox: number | null;
  pullRate: number | null;
  pullRateOdds: string | null;
  pullRateDenominator: number | null;
  specificPullDenominator: number | null;
  evTotal: number | null;
  evPriced: number | null;
  avgValueUsd: number | null;
  evPerPackUsd: number | null;
  psaPop10Base: number | null;
  psaPopTotalBase: number | null;
  psaAvgGemPct: number | null;
}

interface ParsedPullRateSet {
  setCode: string;
  setName: string | null;
  sourceUrl: string | null;
  sourceNote: string | null;
  generatedAt: string | null;
  releaseDate: string | null;
  pricesUpdatedAt: string | null;
  promoFlag: string | null;
  rarityBuckets: number | null;
  cardsCounted: number | null;
  boosterPackEvUsd: number | null;
  boosterBoxEvUsd: number | null;
  packsPerBoosterBox: number | null;
  cardsPerBoosterPack: number | null;
  psaPop10Base: number | null;
  psaPopTotalBase: number | null;
  psaAvgGemPct: number | null;
  rarities: ParsedPullRateRarity[];
}

export interface PullRateImportSummary {
  source: string;
  setsImported: number;
  rarityRowsImported: number;
  skippedRows: number;
  warnings: string[];
}

export interface PullRateFetchFailure {
  setCode: string;
  status: number | null;
  error: string;
}

export interface PullRateFetchSummary extends PullRateImportSummary {
  requestedSets: number;
  fetchedSets: number;
  failedSets: PullRateFetchFailure[];
}

export interface ThePriceDexPullRateFetchSummary extends PullRateFetchSummary {
  discoveredPages: number;
  matchedPages: number;
}

export interface PullRateInfo {
  source: string;
  setCode: string;
  normalizedRarity: string;
  rarityName: string;
  pullRateOdds: string | null;
  specificPullOdds: string | null;
  pullRateWeight: number | null;
  pullRateDenominator: number | null;
  specificPullDenominator: number | null;
  psaAvgGemPct: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function normalizeSource(source: string | null | undefined): string {
  const value = source?.trim().toLowerCase();
  return value || DEFAULT_PULL_RATE_SOURCE;
}

function normalizeSetCode(value: unknown): string | null {
  const code = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const normalized = code.trim().toUpperCase();
  return normalized || null;
}

function uniqueSetCodes(values: unknown[]): string[] {
  return [...new Set(values.map(normalizeSetCode).filter((code): code is string => Boolean(code)))];
}

function normalizeFieldName(value: string): string {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getField(record: RawRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
    const normalized = normalizeFieldName(key);
    if (normalized in record) return record[normalized];
  }

  return undefined;
}

function toStringValue(value: unknown): string | null {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function toNumberValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let cleaned = String(value).trim().replace(/[$%]/g, "").replace(/\s+/g, " ");
  if (!cleaned) return null;
  const numberMatch = cleaned.match(/-?\d+(?:[.,]\d+)*(?:\.\d+)?/);
  if (!numberMatch) return null;
  cleaned = numberMatch[0];
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    const commaParts = cleaned.split(",");
    cleaned =
      commaParts.length > 1 && commaParts.slice(1).every((part) => part.length === 3)
        ? commaParts.join("")
        : cleaned.replace(",", ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntegerValue(value: unknown): number | null {
  const parsed = toNumberValue(value);
  return parsed == null ? null : Math.round(parsed);
}

function parsePullRateDenominatorFromOdds(value: unknown): number | null {
  const odds = toStringValue(value);
  if (!odds) return null;

  const slashMatch = odds.match(/\/\s*([0-9]+(?:[.,][0-9]+)?)/);
  if (slashMatch) {
    return toNumberValue(slashMatch[1]);
  }

  const textMatch = odds.match(/\b1\s+in\s+([0-9][0-9,]*(?:\.[0-9]+)?)\b/i);
  if (textMatch) {
    return toNumberValue(textMatch[1]);
  }

  if (/^[0-9]+(?:[.,][0-9]+)?$/.test(odds.trim())) {
    const plainNumber = toNumberValue(odds);
    return plainNumber && plainNumber > 1 ? plainNumber : null;
  }

  return null;
}

export function getPullRateDenominator(input: {
  pullRate?: number | null;
  pullRateOdds?: string | null;
}): number | null {
  const fromOdds = parsePullRateDenominatorFromOdds(input.pullRateOdds);
  if (fromOdds && fromOdds > 0) return fromOdds;

  const rate = input.pullRate;
  if (rate != null && Number.isFinite(rate) && rate > 0) {
    return 1 / rate;
  }

  return null;
}

export function getSpecificPullDenominator(input: {
  pullRateDenominator?: number | null;
  cardCount?: number | null;
}): number | null {
  const denominator = input.pullRateDenominator;
  const count = input.cardCount;

  if (
    denominator == null ||
    count == null ||
    !Number.isFinite(denominator) ||
    !Number.isFinite(count) ||
    denominator <= 0 ||
    count <= 0
  ) {
    return null;
  }

  return denominator * count;
}

export function getPullRateWeight(specificPullDenominator: number | null | undefined): number | null {
  if (
    specificPullDenominator == null ||
    !Number.isFinite(specificPullDenominator) ||
    specificPullDenominator <= 0
  ) {
    return null;
  }

  return round(clamp(0.82 + Math.log10(specificPullDenominator / 25) * 0.65, 0.85, 2.25));
}

export function formatPullRateOdds(denominator: number | null | undefined): string | null {
  if (denominator == null || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  const value = denominator >= 100 ? Math.round(denominator) : round(denominator, 2);
  return `1/${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;
}

function parseRarityRecord(record: RawRecord): ParsedPullRateRarity | null {
  const rarityName = toStringValue(getField(record, "rarity-name", "rarity_name", "rarity"));
  const normalizedRarity = normalizeRarityLabel(rarityName) ?? rarityName;
  if (!rarityName || !normalizedRarity) {
    return null;
  }

  const cardCount = toIntegerValue(getField(record, "card-count", "card_count", "cards"));
  const perBoosterBox = toNumberValue(
    getField(record, "per-booster-box", "per_booster_box", "booster-box-cards")
  );
  const pullRate = toNumberValue(getField(record, "pull-rate", "pull_rate"));
  const pullRateOdds = toStringValue(getField(record, "pull-rate-odds", "pull_rate_odds"));
  const pullRateDenominator = getPullRateDenominator({ pullRate, pullRateOdds });
  const specificPullDenominator = getSpecificPullDenominator({
    pullRateDenominator,
    cardCount,
  }) ?? parsePullRateDenominatorFromOdds(
    getField(record, "specific-card-odds", "specific_card_odds", "specific-pull-odds")
  );

  return {
    normalizedRarity,
    rarityCode: toStringValue(getField(record, "rarity-code", "rarity_code")),
    rarityName,
    cardCount,
    perBoosterBox,
    pullRate,
    pullRateOdds: pullRateOdds ?? formatPullRateOdds(pullRateDenominator),
    pullRateDenominator,
    specificPullDenominator,
    evTotal: toIntegerValue(getField(record, "ev-total", "ev_total", "total")),
    evPriced: toIntegerValue(getField(record, "ev-priced", "ev_priced", "priced")),
    avgValueUsd: toNumberValue(getField(record, "avg-value-usd", "avg_value_usd", "avg-value")),
    evPerPackUsd: toNumberValue(getField(record, "ev-per-pack-usd", "ev_per_pack_usd", "ev-pack")),
    psaPop10Base: toIntegerValue(getField(record, "psa-pop-10-base", "psa_pop_10_base")),
    psaPopTotalBase: toIntegerValue(getField(record, "psa-pop-total-base", "psa_pop_total_base")),
    psaAvgGemPct: toNumberValue(getField(record, "psa-avg-gem-pct", "psa_avg_gem_pct")),
  };
}

function parseCollectricsSetRecord(record: RawRecord): ParsedPullRateSet | null {
  const setCode = normalizeSetCode(getField(record, "set-code", "set_code", "code"));
  if (!setCode) return null;

  const breakdown = getField(record, "rarity-breakdown", "rarity_breakdown", "rarities");
  const rarityRecords = Array.isArray(breakdown)
    ? breakdown
    : breakdown && typeof breakdown === "object"
      ? Object.values(breakdown)
      : [];
  const rarities = rarityRecords
    .map((entry) => (entry && typeof entry === "object" ? parseRarityRecord(entry as RawRecord) : null))
    .filter((entry): entry is ParsedPullRateRarity => Boolean(entry));

  if (rarities.length === 0) return null;

  return {
    setCode,
    setName: toStringValue(getField(record, "set-name", "set_name", "name")),
    sourceUrl: toStringValue(getField(record, "source-url", "source_url")),
    sourceNote: toStringValue(getField(record, "source-note", "source_note")),
    generatedAt: toStringValue(getField(record, "generated-at", "generated_at")),
    releaseDate: toStringValue(getField(record, "release-date", "release_date")),
    pricesUpdatedAt: toStringValue(getField(record, "prices-updated-at", "prices_updated_at")),
    promoFlag: toStringValue(getField(record, "promo-flag", "promo_flag")),
    rarityBuckets:
      toIntegerValue(getField(record, "rarity-buckets", "rarity_buckets")) ?? rarities.length,
    cardsCounted: toIntegerValue(getField(record, "cards-counted", "cards_counted")),
    boosterPackEvUsd: toNumberValue(getField(record, "booster-pack-ev-usd", "booster_pack_ev_usd")),
    boosterBoxEvUsd: toNumberValue(getField(record, "booster-box-ev-usd", "booster_box_ev_usd")),
    packsPerBoosterBox: toNumberValue(
      getField(record, "packs-per-booster-box", "packs_per_booster_box")
    ),
    cardsPerBoosterPack: toNumberValue(
      getField(record, "cards-per-booster-pack", "cards_per_booster_pack")
    ),
    psaPop10Base: toIntegerValue(getField(record, "psa-pop-10-base", "psa_pop_10_base")),
    psaPopTotalBase: toIntegerValue(getField(record, "psa-pop-total-base", "psa_pop_total_base")),
    psaAvgGemPct: toNumberValue(getField(record, "psa-avg-gem-pct", "psa_avg_gem_pct")),
    rarities,
  };
}

function parseCsv(content: string): RawRecord[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeFieldName);
  return rows.slice(1).map((values) => {
    const record: RawRecord = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? "";
    });
    return record;
  });
}

function parseCsvPullRateSets(content: string): {
  sets: ParsedPullRateSet[];
  skippedRows: number;
} {
  const rows = parseCsv(content);
  const grouped = new Map<string, ParsedPullRateSet>();
  let skippedRows = 0;

  for (const row of rows) {
    const setCode = normalizeSetCode(getField(row, "set_code", "set-code", "code"));
    if (!setCode) {
      skippedRows += 1;
      continue;
    }

    const rarity = parseRarityRecord(row);
    if (!rarity) {
      skippedRows += 1;
      continue;
    }

    const existing = grouped.get(setCode);
    if (existing) {
      existing.rarities = [
        ...existing.rarities.filter((entry) => entry.normalizedRarity !== rarity.normalizedRarity),
        rarity,
      ];
      existing.rarityBuckets = existing.rarities.length;
      continue;
    }

    grouped.set(setCode, {
      setCode,
      setName: toStringValue(getField(row, "set_name", "set-name", "name")),
      sourceUrl: toStringValue(getField(row, "source_url", "source-url")),
      sourceNote: toStringValue(getField(row, "source_note", "source-note")),
      generatedAt: toStringValue(getField(row, "generated_at", "generated-at")),
      releaseDate: toStringValue(getField(row, "release_date", "release-date")),
      pricesUpdatedAt: toStringValue(getField(row, "prices_updated_at", "prices-updated-at")),
      promoFlag: toStringValue(getField(row, "promo_flag", "promo-flag")),
      rarityBuckets: 1,
      cardsCounted: toIntegerValue(getField(row, "cards_counted", "cards-counted")),
      boosterPackEvUsd: toNumberValue(getField(row, "booster_pack_ev_usd", "booster-pack-ev-usd")),
      boosterBoxEvUsd: toNumberValue(getField(row, "booster_box_ev_usd", "booster-box-ev-usd")),
      packsPerBoosterBox: toNumberValue(getField(row, "packs_per_booster_box", "packs-per-booster-box")),
      cardsPerBoosterPack: toNumberValue(getField(row, "cards_per_booster_pack", "cards-per-booster-pack")),
      psaPop10Base: toIntegerValue(getField(row, "set_psa_pop_10_base", "psa_pop_10_base")),
      psaPopTotalBase: toIntegerValue(getField(row, "set_psa_pop_total_base", "psa_pop_total_base")),
      psaAvgGemPct: toNumberValue(getField(row, "set_psa_avg_gem_pct", "psa_avg_gem_pct")),
      rarities: [rarity],
    });
  }

  return { sets: [...grouped.values()], skippedRows };
}

function parseJsonPullRateSets(value: unknown): {
  sets: ParsedPullRateSet[];
  skippedRows: number;
} {
  const inputs = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as RawRecord).sets)
      ? ((value as RawRecord).sets as unknown[])
      : [value];
  let skippedRows = 0;
  const sets: ParsedPullRateSet[] = [];

  for (const input of inputs) {
    if (!input || typeof input !== "object") {
      skippedRows += 1;
      continue;
    }

    const parsed = parseCollectricsSetRecord(input as RawRecord);
    if (!parsed) {
      skippedRows += 1;
      continue;
    }

    sets.push(parsed);
  }

  return { sets, skippedRows };
}

export function parsePullRateImportContent(content: string): {
  sets: ParsedPullRateSet[];
  skippedRows: number;
  warnings: string[];
} {
  const trimmed = content.trim();
  if (!trimmed) {
    return { sets: [], skippedRows: 0, warnings: ["Import content is empty."] };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return { ...parseJsonPullRateSets(parsed), warnings: [] };
    } catch (error) {
      return {
        sets: [],
        skippedRows: 0,
        warnings: [error instanceof Error ? error.message : "Could not parse JSON."],
      };
    }
  }

  return { ...parseCsvPullRateSets(trimmed), warnings: [] };
}

async function importParsedPullRateSets(input: {
  source: string;
  sets: ParsedPullRateSet[];
  skippedRows?: number;
  warnings?: string[];
}): Promise<PullRateImportSummary> {
  const source = normalizeSource(input.source);
  let setsImported = 0;
  let rarityRowsImported = 0;
  let skippedRows = input.skippedRows ?? 0;
  const warnings = [...(input.warnings ?? [])];
  const importedAt = new Date();

  for (const set of input.sets) {
    const uniqueRarities = [
      ...new Map(set.rarities.map((rarity) => [rarity.normalizedRarity, rarity])).values(),
    ];

    if (uniqueRarities.length === 0) {
      skippedRows += 1;
      continue;
    }

    const profile = await db.setPullRateProfile.upsert({
      where: {
        source_set_code: {
          source,
          set_code: set.setCode,
        },
      },
      create: {
        source,
        set_code: set.setCode,
        set_name: set.setName,
        source_url: set.sourceUrl,
        source_note: set.sourceNote,
        generated_at: set.generatedAt,
        release_date: set.releaseDate,
        prices_updated_at: set.pricesUpdatedAt,
        promo_flag: set.promoFlag,
        rarity_buckets: set.rarityBuckets ?? uniqueRarities.length,
        cards_counted: set.cardsCounted,
        booster_pack_ev_usd: set.boosterPackEvUsd,
        booster_box_ev_usd: set.boosterBoxEvUsd,
        packs_per_booster_box: set.packsPerBoosterBox,
        cards_per_booster_pack: set.cardsPerBoosterPack,
        psa_pop_10_base: set.psaPop10Base,
        psa_pop_total_base: set.psaPopTotalBase,
        psa_avg_gem_pct: set.psaAvgGemPct,
        imported_at: importedAt,
      },
      update: {
        set_name: set.setName,
        source_url: set.sourceUrl,
        source_note: set.sourceNote,
        generated_at: set.generatedAt,
        release_date: set.releaseDate,
        prices_updated_at: set.pricesUpdatedAt,
        promo_flag: set.promoFlag,
        rarity_buckets: set.rarityBuckets ?? uniqueRarities.length,
        cards_counted: set.cardsCounted,
        booster_pack_ev_usd: set.boosterPackEvUsd,
        booster_box_ev_usd: set.boosterBoxEvUsd,
        packs_per_booster_box: set.packsPerBoosterBox,
        cards_per_booster_pack: set.cardsPerBoosterPack,
        psa_pop_10_base: set.psaPop10Base,
        psa_pop_total_base: set.psaPopTotalBase,
        psa_avg_gem_pct: set.psaAvgGemPct,
        imported_at: importedAt,
      },
    });

    await db.setPullRateRarity.deleteMany({
      where: { profile_id: profile.id },
    });
    await db.setPullRateRarity.createMany({
      data: uniqueRarities.map((rarity) => ({
        profile_id: profile.id,
        source,
        set_code: set.setCode,
        normalized_rarity: rarity.normalizedRarity,
        rarity_code: rarity.rarityCode,
        rarity_name: rarity.rarityName,
        card_count: rarity.cardCount,
        per_booster_box: rarity.perBoosterBox,
        pull_rate: rarity.pullRate,
        pull_rate_odds: rarity.pullRateOdds,
        pull_rate_denominator: rarity.pullRateDenominator,
        specific_pull_denominator: rarity.specificPullDenominator,
        ev_total: rarity.evTotal,
        ev_priced: rarity.evPriced,
        avg_value_usd: rarity.avgValueUsd,
        ev_per_pack_usd: rarity.evPerPackUsd,
        psa_pop_10_base: rarity.psaPop10Base,
        psa_pop_total_base: rarity.psaPopTotalBase,
        psa_avg_gem_pct: rarity.psaAvgGemPct,
        imported_at: importedAt,
      })),
    });

    setsImported += 1;
    rarityRowsImported += uniqueRarities.length;
  }

  if (setsImported === 0 && warnings.length === 0) {
    warnings.push("No usable pull-rate rows found.");
  }

  return {
    source,
    setsImported,
    rarityRowsImported,
    skippedRows,
    warnings,
  };
}

export async function importPullRateData(input: {
  content: string;
  source?: string | null;
}): Promise<PullRateImportSummary> {
  const parsed = parsePullRateImportContent(input.content);
  return importParsedPullRateSets({
    source: normalizeSource(input.source),
    sets: parsed.sets,
    skippedRows: parsed.skippedRows,
    warnings: parsed.warnings,
  });
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlAttribute(html: string, attribute: string): string | null {
  const match = html.match(new RegExp(`\\b${escapeRegExp(attribute)}=["']([^"']*)["']`, "i"));
  return match ? decodeHtmlEntities(match[1]).trim() || null : null;
}

function extractMetaContent(html: string, key: string): string | null {
  const escapedKey = escapeRegExp(key);
  const metaMatch =
    html.match(new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escapedKey}["'])[^>]*>`, "i")) ??
    html.match(new RegExp(`<meta\\b(?=[^>]*http-equiv=["']${escapedKey}["'])[^>]*>`, "i"));
  return metaMatch ? extractHtmlAttribute(metaMatch[0], "content") : null;
}

function extractTables(html: string): string[] {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((match) => match[0]);
}

function parseHtmlTable(tableHtml: string): string[][] {
  return [...tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
    .map((rowMatch) => {
      const rowHtml = rowMatch[0];
      return [...rowHtml.matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)]
        .map((cellMatch) => stripHtml(cellMatch[0]))
        .filter((cell) => cell.length > 0);
    })
    .filter((row) => row.length > 0);
}

function findTableByHeader(html: string, requiredHeaders: string[]): string[][] | null {
  for (const table of extractTables(html)) {
    const rows = parseHtmlTable(table);
    const header = rows[0]?.map((cell) => cell.toLowerCase()) ?? [];
    if (requiredHeaders.every((required) => header.includes(required.toLowerCase()))) {
      return rows;
    }
  }

  return null;
}

function getTableCell(row: string[], headers: string[], headerName: string): string | null {
  const index = headers.findIndex((header) => header.toLowerCase() === headerName.toLowerCase());
  return index >= 0 ? row[index] ?? null : null;
}

function getNumberAfterLabel(text: string, label: string): number | null {
  const match = text.match(
    new RegExp(`${escapeRegExp(label)}\\s+([$]?[0-9][0-9.,]*(?:\\s+cards?)?)`, "i")
  );
  return match ? toNumberValue(match[1]) : null;
}

function parseThePriceDexDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;

  const longDateMatch = trimmed.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i
  );
  if (longDateMatch) {
    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const monthIndex = monthNames.indexOf(longDateMatch[1].toLowerCase());
    if (monthIndex >= 0) {
      return `${longDateMatch[3]}-${String(monthIndex + 1).padStart(2, "0")}-${longDateMatch[2].padStart(2, "0")}`;
    }
  }

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return trimmed || null;
}

function getThePriceDexSetName(html: string): string | null {
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) {
    return ogTitle.replace(/\s+-\s+Pull Rates.*$/i, "").trim() || null;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return null;
  return stripHtml(titleMatch[1]).replace(/\s+Pull Rates.*$/i, "").trim() || null;
}

function getThePriceDexSourceNote(pageText: string): string | null {
  const match = pageText.match(
    /(Card values assume Near Mint condition[\s\S]*?Prices last updated\s+[A-Z][a-z]+ \d{1,2}, \d{4}\.)/
  );
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function buildThePriceDexRarityRecord(input: {
  rarityName: string;
  pullRateOdds?: string | null;
  perBoosterBox?: string | null;
  specificCardOdds?: string | null;
  evTotal?: string | null;
  evPriced?: string | null;
  avgValueUsd?: string | null;
  evPerPackUsd?: string | null;
}): ParsedPullRateRarity | null {
  const rarityName = input.rarityName.trim();
  if (!rarityName || rarityName.toLowerCase() === "total") return null;

  const normalizedRarity = normalizeRarityLabel(rarityName) ?? rarityName;
  const pullRateDenominator = parsePullRateDenominatorFromOdds(input.pullRateOdds);
  const specificPullDenominator = parsePullRateDenominatorFromOdds(input.specificCardOdds);

  return {
    normalizedRarity,
    rarityCode: null,
    rarityName,
    cardCount: toIntegerValue(input.evTotal),
    perBoosterBox: toNumberValue(input.perBoosterBox),
    pullRate:
      pullRateDenominator != null && pullRateDenominator > 0 ? 1 / pullRateDenominator : null,
    pullRateOdds: toStringValue(input.pullRateOdds),
    pullRateDenominator,
    specificPullDenominator,
    evTotal: toIntegerValue(input.evTotal),
    evPriced: toIntegerValue(input.evPriced),
    avgValueUsd: toNumberValue(input.avgValueUsd),
    evPerPackUsd: toNumberValue(input.evPerPackUsd),
    psaPop10Base: null,
    psaPopTotalBase: null,
    psaAvgGemPct: null,
  };
}

export function parseThePriceDexPullRatePage(input: {
  html: string;
  url: string;
}): ParsedPullRateSet | null {
  const pageText = stripHtml(input.html);
  const setCode = normalizeSetCode(pageText.match(/\bSet Code:\s*([A-Z0-9]+)/i)?.[1]);
  if (!setCode) return null;

  const pullRateTable = findTableByHeader(input.html, [
    "Rarity",
    "Pull Rate",
    "Specific Card Odds",
  ]);
  const expectedValueTable = findTableByHeader(input.html, [
    "Rarity",
    "Total",
    "Priced",
    "Avg Value",
    "EV/Pack",
  ]);
  if (!pullRateTable || !expectedValueTable) return null;

  const rarityByName = new Map<string, ParsedPullRateRarity>();
  const pullRateHeaders = pullRateTable[0] ?? [];
  for (const row of pullRateTable.slice(1)) {
    const rarity = buildThePriceDexRarityRecord({
      rarityName: getTableCell(row, pullRateHeaders, "Rarity") ?? "",
      pullRateOdds: getTableCell(row, pullRateHeaders, "Pull Rate"),
      perBoosterBox: getTableCell(row, pullRateHeaders, "Per Booster Box"),
      specificCardOdds: getTableCell(row, pullRateHeaders, "Specific Card Odds"),
    });
    if (rarity) rarityByName.set(rarity.rarityName.toLowerCase(), rarity);
  }

  const expectedValueHeaders = expectedValueTable[0] ?? [];
  for (const row of expectedValueTable.slice(1)) {
    const evRarity = buildThePriceDexRarityRecord({
      rarityName: getTableCell(row, expectedValueHeaders, "Rarity") ?? "",
      evTotal: getTableCell(row, expectedValueHeaders, "Total"),
      evPriced: getTableCell(row, expectedValueHeaders, "Priced"),
      avgValueUsd: getTableCell(row, expectedValueHeaders, "Avg Value"),
      evPerPackUsd: getTableCell(row, expectedValueHeaders, "EV/Pack"),
    });
    if (!evRarity) continue;

    const key = evRarity.rarityName.toLowerCase();
    const existing = rarityByName.get(key);
    rarityByName.set(key, {
      ...evRarity,
      ...(existing ?? {}),
      cardCount: evRarity.evTotal ?? existing?.cardCount ?? null,
      evTotal: evRarity.evTotal,
      evPriced: evRarity.evPriced,
      avgValueUsd: evRarity.avgValueUsd,
      evPerPackUsd: evRarity.evPerPackUsd,
    });
  }

  const rarities = [...rarityByName.values()];
  if (rarities.length === 0) return null;

  const releaseDate = parseThePriceDexDate(
    pageText.match(/\bReleased:\s*(\d{4}\/\d{2}\/\d{2})/i)?.[1] ?? null
  );
  const pricesUpdatedAt = parseThePriceDexDate(
    pageText.match(/\bPrices last updated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i)?.[1] ?? null
  );
  const generatedAt =
    parseThePriceDexDate(extractMetaContent(input.html, "last-modified")) ?? pricesUpdatedAt;
  const evCardCount = rarities.reduce((total, rarity) => total + (rarity.evTotal ?? 0), 0);

  return {
    setCode,
    setName: getThePriceDexSetName(input.html),
    sourceUrl: input.url,
    sourceNote: getThePriceDexSourceNote(pageText),
    generatedAt,
    releaseDate,
    pricesUpdatedAt,
    promoFlag: null,
    rarityBuckets: rarities.length,
    cardsCounted:
      toIntegerValue(pageText.match(/\b(\d+)\s+Cards\b/i)?.[1]) ??
      (evCardCount > 0 ? evCardCount : null),
    boosterPackEvUsd: getNumberAfterLabel(pageText, "Booster Pack EV"),
    boosterBoxEvUsd: getNumberAfterLabel(pageText, "Booster Box EV"),
    packsPerBoosterBox: getNumberAfterLabel(pageText, "Packs Per Booster Box"),
    cardsPerBoosterPack: getNumberAfterLabel(pageText, "Cards Per Booster Pack"),
    psaPop10Base: null,
    psaPopTotalBase: null,
    psaAvgGemPct: null,
    rarities,
  };
}

export function extractThePriceDexPullRateUrls(sitemapXml: string): string[] {
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+\/set\/[^<]+\/pull-rates)<\/loc>/gi)]
    .map((match) => decodeHtmlEntities(match[1]).trim())
    .filter((url) => url.startsWith(THEPRICEDEX_BASE_URL));
  return [...new Set(urls)];
}

async function fetchThePriceDexPullRateUrls(fetchImpl: FetchLike): Promise<string[]> {
  const response = await fetchImpl(THEPRICEDEX_SITEMAP_URL, {
    cache: "no-store",
    headers: {
      accept: "application/xml,text/xml,text/plain",
      "user-agent": "DustyCards ThePriceDex pull-rate import (manual user initiated)",
    },
  });
  if (!response.ok) {
    throw new Error(`ThePriceDex sitemap fetch failed: ${response.status} ${response.statusText}`);
  }

  return extractThePriceDexPullRateUrls(await response.text());
}

async function fetchThePriceDexPullRatePage(input: {
  url: string;
  fetchImpl: FetchLike;
}): Promise<{ ok: true; set: ParsedPullRateSet } | { ok: false; failure: PullRateFetchFailure }> {
  try {
    const response = await input.fetchImpl(input.url, {
      cache: "no-store",
      headers: {
        accept: "text/html",
        "user-agent": "DustyCards ThePriceDex pull-rate import (manual user initiated)",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        failure: {
          setCode: input.url,
          status: response.status,
          error: response.statusText || "ThePriceDex page fetch failed.",
        },
      };
    }

    const parsed = parseThePriceDexPullRatePage({
      html: await response.text(),
      url: input.url,
    });
    if (!parsed) {
      return {
        ok: false,
        failure: {
          setCode: input.url,
          status: null,
          error: "No usable ThePriceDex pull-rate table found.",
        },
      };
    }

    return { ok: true, set: parsed };
  } catch (error) {
    return {
      ok: false,
      failure: {
        setCode: input.url,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function buildCollectricsSetApiUrl(setCode: string): string {
  const normalized = normalizeSetCode(setCode);
  if (!normalized) {
    throw new Error("A set code is required for Collectrics fetches.");
  }

  return `${COLLECTRICS_SET_API_BASE_URL}/${encodeURIComponent(normalized)}`;
}

async function getLocalPullRateSetCodes(input: {
  source: string;
  missingOnly: boolean;
  limit: number | null;
}): Promise<string[]> {
  const episodes = await db.episode.findMany({
    where: {
      code: { not: null },
    },
    orderBy: [
      { release_date: "desc" },
      { name: "asc" },
    ],
    select: { code: true },
  });
  let setCodes = uniqueSetCodes(episodes.map((episode) => episode.code));

  if (input.missingOnly && setCodes.length > 0) {
    const existingProfiles = await db.setPullRateProfile.findMany({
      where: {
        source: input.source,
        set_code: { in: setCodes },
      },
      select: {
        set_code: true,
        promo_flag: true,
        rarity_buckets: true,
      },
    });
    const existingCodes = new Set(
      existingProfiles
        .filter(
          (profile) =>
            profile.promo_flag !== "collectrics_unavailable" &&
            (profile.rarity_buckets ?? 0) > 0
        )
        .map((profile) => profile.set_code)
    );
    setCodes = setCodes.filter((code) => !existingCodes.has(code));
  }

  return input.limit == null ? setCodes : setCodes.slice(0, input.limit);
}

async function markCollectricsUnavailableProfiles(input: {
  source: string;
  failures: PullRateFetchFailure[];
}): Promise<void> {
  const unavailableSetCodes = uniqueSetCodes(
    input.failures
      .filter((failure) => failure.status === 404)
      .map((failure) => failure.setCode)
  );
  const importedAt = new Date();

  for (const setCode of unavailableSetCodes) {
    const profile = await db.setPullRateProfile.upsert({
      where: {
        source_set_code: {
          source: input.source,
          set_code: setCode,
        },
      },
      create: {
        source: input.source,
        set_code: setCode,
        set_name: null,
        generated_at: null,
        release_date: null,
        promo_flag: "collectrics_unavailable",
        rarity_buckets: 0,
        cards_counted: null,
        psa_pop_10_base: null,
        psa_pop_total_base: null,
        psa_avg_gem_pct: null,
        imported_at: importedAt,
      },
      update: {
        set_name: null,
        generated_at: null,
        release_date: null,
        promo_flag: "collectrics_unavailable",
        rarity_buckets: 0,
        cards_counted: null,
        psa_pop_10_base: null,
        psa_pop_total_base: null,
        psa_avg_gem_pct: null,
        imported_at: importedAt,
      },
    });

    await db.setPullRateRarity.deleteMany({
      where: { profile_id: profile.id },
    });
  }
}

async function fetchCollectricsSetJson(input: {
  setCode: string;
  fetchImpl: FetchLike;
}): Promise<{ ok: true; data: unknown } | { ok: false; failure: PullRateFetchFailure }> {
  const setCode = normalizeSetCode(input.setCode);
  if (!setCode) {
    return {
      ok: false,
      failure: {
        setCode: String(input.setCode),
        status: null,
        error: "Invalid set code.",
      },
    };
  }

  const url = buildCollectricsSetApiUrl(setCode);

  try {
    const response = await input.fetchImpl(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "DustyCards pull-rate import (manual user initiated)",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        failure: {
          setCode,
          status: response.status,
          error: response.status === 404 ? "No Collectrics set endpoint found." : response.statusText,
        },
      };
    }

    return { ok: true, data: (await response.json()) as unknown };
  } catch (error) {
    return {
      ok: false,
      failure: {
        setCode,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function fetchAndImportCollectricsPullRates(input: {
  setCodes?: unknown[] | null;
  missingOnly?: boolean | null;
  limit?: number | null;
  source?: string | null;
  fetchImpl?: FetchLike;
  requestDelayMs?: number | null;
} = {}): Promise<PullRateFetchSummary> {
  const source = normalizeSource(input.source);
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
      ? Math.floor(input.limit)
      : null;
  const setCodes = input.setCodes
    ? uniqueSetCodes(input.setCodes).slice(0, limit ?? undefined)
    : await getLocalPullRateSetCodes({
        source,
        missingOnly: input.missingOnly ?? true,
        limit,
      });
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestDelayMs = Math.max(0, Math.floor(input.requestDelayMs ?? 80));
  const fetchedSets: unknown[] = [];
  const failedSets: PullRateFetchFailure[] = [];

  for (const [index, setCode] of setCodes.entries()) {
    const result = await fetchCollectricsSetJson({ setCode, fetchImpl });

    if (result.ok) {
      fetchedSets.push(result.data);
    } else {
      failedSets.push(result.failure);
    }

    if (requestDelayMs > 0 && index < setCodes.length - 1) {
      await wait(requestDelayMs);
    }
  }

  const importSummary =
    fetchedSets.length > 0
      ? await importPullRateData({
          source,
          content: JSON.stringify(fetchedSets),
        })
      : {
          source,
          setsImported: 0,
          rarityRowsImported: 0,
          skippedRows: 0,
          warnings: setCodes.length === 0 ? ["No local set codes need pull-rate data."] : [],
        };

  if (failedSets.some((failure) => failure.status === 404)) {
    await markCollectricsUnavailableProfiles({ source, failures: failedSets });
  }

  return {
    ...importSummary,
    requestedSets: setCodes.length,
    fetchedSets: fetchedSets.length,
    failedSets,
  };
}

export async function fetchAndImportThePriceDexPullRates(input: {
  setCodes?: unknown[] | null;
  missingOnly?: boolean | null;
  limit?: number | null;
  source?: string | null;
  fetchImpl?: FetchLike;
  requestDelayMs?: number | null;
} = {}): Promise<ThePriceDexPullRateFetchSummary> {
  const source = normalizeSource(input.source ?? THEPRICEDEX_PULL_RATE_SOURCE);
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
      ? Math.floor(input.limit)
      : null;
  const targetSetCodes = input.setCodes
    ? uniqueSetCodes(input.setCodes)
    : await getLocalPullRateSetCodes({
        source,
        missingOnly: input.missingOnly ?? true,
        limit: null,
      });
  const targetSetCodeSet = new Set(targetSetCodes);
  const existingSetCodes =
    input.missingOnly === false || targetSetCodes.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db.setPullRateProfile.findMany({
              where: {
                source,
                set_code: { in: targetSetCodes },
                rarity_buckets: { gt: 0 },
              },
              select: { set_code: true },
            })
          ).map((profile) => profile.set_code)
        );
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestDelayMs = Math.max(0, Math.floor(input.requestDelayMs ?? 350));
  const urls = await fetchThePriceDexPullRateUrls(fetchImpl);
  const fetchedSets: ParsedPullRateSet[] = [];
  const failedSets: PullRateFetchFailure[] = [];
  let matchedPages = 0;

  for (const [index, url] of urls.entries()) {
    const result = await fetchThePriceDexPullRatePage({ url, fetchImpl });

    if (result.ok) {
      const setCode = result.set.setCode;
      const matchesTarget = targetSetCodeSet.size === 0 || targetSetCodeSet.has(setCode);
      if (matchesTarget) {
        matchedPages += 1;
        if (!existingSetCodes.has(setCode)) {
          fetchedSets.push(result.set);
        }
      }
    } else {
      failedSets.push(result.failure);
    }

    if (limit != null && fetchedSets.length >= limit) {
      break;
    }

    if (requestDelayMs > 0 && index < urls.length - 1) {
      await wait(requestDelayMs);
    }
  }

  const importSummary =
    fetchedSets.length > 0
      ? await importParsedPullRateSets({
          source,
          sets: fetchedSets.slice(0, limit ?? undefined),
        })
      : {
          source,
          setsImported: 0,
          rarityRowsImported: 0,
          skippedRows: 0,
          warnings:
            targetSetCodes.length === 0
              ? ["No local set codes need ThePriceDex pull-rate data."]
              : ["No matching ThePriceDex pull-rate pages needed import."],
        };

  return {
    ...importSummary,
    requestedSets: targetSetCodes.length,
    fetchedSets: fetchedSets.length,
    failedSets,
    discoveredPages: urls.length,
    matchedPages,
  };
}

export async function getPullRateInfoForSetRarity(input: {
  setCode: string | null | undefined;
  rarity: string | null | undefined;
  source?: string | null;
}): Promise<PullRateInfo | null> {
  const setCode = normalizeSetCode(input.setCode);
  const normalizedRarity = normalizeRarityLabel(input.rarity) ?? input.rarity?.trim() ?? null;
  if (!setCode || !normalizedRarity) return null;
  const sources = input.source
    ? [normalizeSource(input.source)]
    : [...PREFERRED_PULL_RATE_SOURCES];

  const rarities = await db.setPullRateRarity.findMany({
    where: {
      source: { in: sources },
      set_code: setCode,
      normalized_rarity: normalizedRarity,
    },
  });
  const rarity = rarities.sort(
    (a, b) => sources.indexOf(a.source) - sources.indexOf(b.source)
  )[0];

  if (!rarity) return null;

  return {
    source: rarity.source,
    setCode: rarity.set_code,
    normalizedRarity: rarity.normalized_rarity,
    rarityName: rarity.rarity_name,
    pullRateOdds: rarity.pull_rate_odds ?? formatPullRateOdds(rarity.pull_rate_denominator),
    specificPullOdds: formatPullRateOdds(rarity.specific_pull_denominator),
    pullRateWeight: getPullRateWeight(rarity.specific_pull_denominator),
    pullRateDenominator: rarity.pull_rate_denominator,
    specificPullDenominator: rarity.specific_pull_denominator,
    psaAvgGemPct: rarity.psa_avg_gem_pct,
  };
}

export function buildPullRateInfoFromRarity(input: {
  source: string;
  setCode: string;
  normalizedRarity: string;
  rarityName: string;
  pullRateOdds: string | null;
  pullRateDenominator: number | null;
  specificPullDenominator: number | null;
  psaAvgGemPct: number | null;
}): PullRateInfo {
  return {
    source: input.source,
    setCode: input.setCode,
    normalizedRarity: input.normalizedRarity,
    rarityName: input.rarityName,
    pullRateOdds: input.pullRateOdds ?? formatPullRateOdds(input.pullRateDenominator),
    specificPullOdds: formatPullRateOdds(input.specificPullDenominator),
    pullRateWeight: getPullRateWeight(input.specificPullDenominator),
    pullRateDenominator: input.pullRateDenominator,
    specificPullDenominator: input.specificPullDenominator,
    psaAvgGemPct: input.psaAvgGemPct,
  };
}
