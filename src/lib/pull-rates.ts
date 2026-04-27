import { db } from "@/lib/db";
import { normalizeRarityLabel } from "@/lib/rarity";

export const DEFAULT_PULL_RATE_SOURCE = "collectrics";
const COLLECTRICS_SET_API_BASE_URL = "https://mycollectrics.com/api/set";

interface RawRecord {
  [key: string]: unknown;
}

interface ParsedPullRateRarity {
  normalizedRarity: string;
  rarityCode: string | null;
  rarityName: string;
  cardCount: number | null;
  pullRate: number | null;
  pullRateOdds: string | null;
  pullRateDenominator: number | null;
  specificPullDenominator: number | null;
  psaPop10Base: number | null;
  psaPopTotalBase: number | null;
  psaAvgGemPct: number | null;
}

interface ParsedPullRateSet {
  setCode: string;
  setName: string | null;
  generatedAt: string | null;
  releaseDate: string | null;
  promoFlag: string | null;
  rarityBuckets: number | null;
  cardsCounted: number | null;
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

  const cleaned = String(value).trim().replace(/[$,%]/g, "").replace(",", ".");
  if (!cleaned) return null;

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

  const plainNumber = toNumberValue(odds);
  return plainNumber && plainNumber > 1 ? plainNumber : null;
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
  const pullRate = toNumberValue(getField(record, "pull-rate", "pull_rate"));
  const pullRateOdds = toStringValue(getField(record, "pull-rate-odds", "pull_rate_odds"));
  const pullRateDenominator = getPullRateDenominator({ pullRate, pullRateOdds });
  const specificPullDenominator = getSpecificPullDenominator({
    pullRateDenominator,
    cardCount,
  });

  return {
    normalizedRarity,
    rarityCode: toStringValue(getField(record, "rarity-code", "rarity_code")),
    rarityName,
    cardCount,
    pullRate,
    pullRateOdds: pullRateOdds ?? formatPullRateOdds(pullRateDenominator),
    pullRateDenominator,
    specificPullDenominator,
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
    generatedAt: toStringValue(getField(record, "generated-at", "generated_at")),
    releaseDate: toStringValue(getField(record, "release-date", "release_date")),
    promoFlag: toStringValue(getField(record, "promo-flag", "promo_flag")),
    rarityBuckets:
      toIntegerValue(getField(record, "rarity-buckets", "rarity_buckets")) ?? rarities.length,
    cardsCounted: toIntegerValue(getField(record, "cards-counted", "cards_counted")),
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
      generatedAt: toStringValue(getField(row, "generated_at", "generated-at")),
      releaseDate: toStringValue(getField(row, "release_date", "release-date")),
      promoFlag: toStringValue(getField(row, "promo_flag", "promo-flag")),
      rarityBuckets: 1,
      cardsCounted: toIntegerValue(getField(row, "cards_counted", "cards-counted")),
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

export async function importPullRateData(input: {
  content: string;
  source?: string | null;
}): Promise<PullRateImportSummary> {
  const source = normalizeSource(input.source);
  const parsed = parsePullRateImportContent(input.content);
  let setsImported = 0;
  let rarityRowsImported = 0;
  let skippedRows = parsed.skippedRows;
  const warnings = [...parsed.warnings];
  const importedAt = new Date();

  for (const set of parsed.sets) {
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
        generated_at: set.generatedAt,
        release_date: set.releaseDate,
        promo_flag: set.promoFlag,
        rarity_buckets: set.rarityBuckets ?? uniqueRarities.length,
        cards_counted: set.cardsCounted,
        psa_pop_10_base: set.psaPop10Base,
        psa_pop_total_base: set.psaPopTotalBase,
        psa_avg_gem_pct: set.psaAvgGemPct,
        imported_at: importedAt,
      },
      update: {
        set_name: set.setName,
        generated_at: set.generatedAt,
        release_date: set.releaseDate,
        promo_flag: set.promoFlag,
        rarity_buckets: set.rarityBuckets ?? uniqueRarities.length,
        cards_counted: set.cardsCounted,
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
        pull_rate: rarity.pullRate,
        pull_rate_odds: rarity.pullRateOdds,
        pull_rate_denominator: rarity.pullRateDenominator,
        specific_pull_denominator: rarity.specificPullDenominator,
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

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
      select: { set_code: true },
    });
    const existingCodes = new Set(existingProfiles.map((profile) => profile.set_code));
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

export async function getPullRateInfoForSetRarity(input: {
  setCode: string | null | undefined;
  rarity: string | null | undefined;
  source?: string | null;
}): Promise<PullRateInfo | null> {
  const setCode = normalizeSetCode(input.setCode);
  const normalizedRarity = normalizeRarityLabel(input.rarity) ?? input.rarity?.trim() ?? null;
  if (!setCode || !normalizedRarity) return null;

  const rarity = await db.setPullRateRarity.findFirst({
    where: {
      source: normalizeSource(input.source),
      set_code: setCode,
      normalized_rarity: normalizedRarity,
    },
  });

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
