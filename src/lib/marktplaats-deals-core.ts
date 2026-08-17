import { createHash } from "node:crypto";

export const MARKTPLAATS_REPORT_SCHEMA_VERSION = 1 as const;
export const MARKTPLAATS_DEAL_KINDS = ["raw", "graded", "expansion", "collection"] as const;
export const MARKTPLAATS_MATCH_STATUSES = ["matched", "shortlist", "review"] as const;

export type MarktplaatsDealKind = (typeof MARKTPLAATS_DEAL_KINDS)[number];
export type MarktplaatsMatchStatus = (typeof MARKTPLAATS_MATCH_STATUSES)[number];

export interface MarktplaatsReportDeal {
  externalId: string;
  kind: MarktplaatsDealKind;
  title: string;
  listingUrl: string;
  imageUrl: string | null;
  sellerName: string | null;
  location: string | null;
  cardId: string | null;
  episodeId: string | null;
  listingPriceEur: number;
  shippingEur: number | null;
  marketValueEur: number;
  savingsEur: number;
  discountPercent: number;
  condition: string | null;
  language: string | null;
  gradingCompany: string | null;
  gradingGrade: string | null;
  matchConfidence: number;
  matchStatus: MarktplaatsMatchStatus;
  matchNotes: string | null;
  descriptionChecked: boolean;
  descriptionSummary: string | null;
  offerContents: string | null;
  sourcePublishedAt: Date | null;
}

export interface NormalizedMarktplaatsReport {
  schemaVersion: typeof MARKTPLAATS_REPORT_SCHEMA_VERSION;
  scan: {
    id: string;
    startedAt: Date;
    finishedAt: Date;
    referenceExportedAt: Date | null;
    listingsChecked: number;
    completeCoverage: boolean;
    removedExternalIds: string[];
    warning: string | null;
  };
  deals: MarktplaatsReportDeal[];
}

export class MarktplaatsReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarktplaatsReportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MarktplaatsReportError(`${label} is required.`);
  }
  return value.trim().slice(0, maxLength);
}

function optionalString(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function finiteNumber(value: unknown, label: string, minimum: number): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number) || number < minimum) {
    throw new MarktplaatsReportError(`${label} must be at least ${minimum}.`);
  }
  return number;
}

function optionalMoney(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  return Number(finiteNumber(value, label, 0).toFixed(2));
}

function parseDate(value: unknown, label: string, required: true): Date;
function parseDate(value: unknown, label: string, required?: false): Date | null;
function parseDate(value: unknown, label: string, required = false): Date | null {
  if (value == null || value === "") {
    if (required) throw new MarktplaatsReportError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string") {
    throw new MarktplaatsReportError(`${label} must be an ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new MarktplaatsReportError(`${label} must be an ISO timestamp.`);
  }
  return parsed;
}

function normalizeHttpUrl(value: unknown, label: string): string {
  const raw = requiredString(value, label, 2_000);
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("protocol");
    return url.toString();
  } catch {
    throw new MarktplaatsReportError(`${label} must be a valid http(s) URL.`);
  }
}

function normalizeListingUrl(value: unknown): string {
  const url = normalizeHttpUrl(value, "deal.listingUrl");
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname !== "marktplaats.nl" && !hostname.endsWith(".marktplaats.nl")) {
    throw new MarktplaatsReportError("deal.listingUrl must point to marktplaats.nl.");
  }
  return url;
}

function normalizeKind(value: unknown): MarktplaatsDealKind {
  if (MARKTPLAATS_DEAL_KINDS.includes(value as MarktplaatsDealKind)) {
    return value as MarktplaatsDealKind;
  }
  throw new MarktplaatsReportError("deal.kind must be raw, graded, expansion, or collection.");
}

function normalizeMatchStatus(value: unknown): MarktplaatsMatchStatus {
  const status = value ?? "matched";
  if (MARKTPLAATS_MATCH_STATUSES.includes(status as MarktplaatsMatchStatus)) {
    return status as MarktplaatsMatchStatus;
  }
  throw new MarktplaatsReportError("deal.matchStatus must be matched, shortlist, or review.");
}

function normalizeLanguage(value: unknown): string | null {
  const language = optionalString(value, 50);
  if (!language) return null;
  if (/^(en|eng|english)$/i.test(language)) return "English";
  return language;
}

export function buildMarktplaatsExternalId(listingUrl: string): string {
  const url = new URL(listingUrl);
  const stableUrl = `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  return `marktplaats-${createHash("sha256").update(stableUrl).digest("hex").slice(0, 24)}`;
}

function normalizeDeal(value: unknown, index: number): MarktplaatsReportDeal {
  if (!isRecord(value)) {
    throw new MarktplaatsReportError(`deals[${index}] must be an object.`);
  }
  const kind = normalizeKind(value.kind);
  const listingUrl = normalizeListingUrl(value.listingUrl);
  const cardId = optionalString(value.cardId, 200);
  const episodeId = optionalString(value.episodeId, 200);
  const matchStatus = normalizeMatchStatus(value.matchStatus);
  const descriptionChecked = value.descriptionChecked === true;
  const descriptionSummary = optionalString(value.descriptionSummary, 2_000);
  const offerContents = optionalString(value.offerContents, 2_000);
  const language = normalizeLanguage(value.language);
  const gradingCompany = optionalString(value.gradingCompany, 40)?.toUpperCase() ?? null;
  const gradingGrade = optionalString(value.gradingGrade, 40);

  if ((kind === "raw" || kind === "graded" || kind === "collection") && !cardId) {
    throw new MarktplaatsReportError(`deals[${index}].cardId is required for ${kind}.`);
  }
  if (kind === "expansion" && !episodeId) {
    throw new MarktplaatsReportError(`deals[${index}].episodeId is required for expansion.`);
  }
  const isVerifiedSelection = matchStatus === "matched" || matchStatus === "shortlist";
  if (kind === "graded" && isVerifiedSelection && (!gradingCompany || !gradingGrade)) {
    throw new MarktplaatsReportError(
      `deals[${index}] needs an exact gradingCompany and gradingGrade match.`
    );
  }
  if ((kind === "raw" || kind === "collection") && isVerifiedSelection && language !== "English") {
    throw new MarktplaatsReportError(
      `deals[${index}] must be explicitly English or marked for review.`
    );
  }
  if (isVerifiedSelection && (!descriptionChecked || !descriptionSummary)) {
    throw new MarktplaatsReportError(
      `deals[${index}] needs a checked description and descriptionSummary for a definitive match.`
    );
  }

  const listingPriceEur = Number(finiteNumber(value.listingPriceEur, "deal.listingPriceEur", 0.01).toFixed(2));
  const marketValueEur = Number(finiteNumber(value.marketValueEur, "deal.marketValueEur", 0.01).toFixed(2));
  if (matchStatus === "matched" && listingPriceEur >= marketValueEur) {
    throw new MarktplaatsReportError(`deals[${index}] is not below market value.`);
  }
  const savingsEur = Number((marketValueEur - listingPriceEur).toFixed(2));
  const discountPercent = Number(((savingsEur / marketValueEur) * 100).toFixed(1));
  const matchConfidence = finiteNumber(value.matchConfidence, "deal.matchConfidence", 0);
  if (matchConfidence > 1) {
    throw new MarktplaatsReportError("deal.matchConfidence cannot exceed 1.");
  }

  return {
    externalId:
      optionalString(value.externalId, 200) ?? buildMarktplaatsExternalId(listingUrl),
    kind,
    title: requiredString(value.title, `deals[${index}].title`, 500),
    listingUrl,
    imageUrl: value.imageUrl == null ? null : normalizeHttpUrl(value.imageUrl, `deals[${index}].imageUrl`),
    sellerName: optionalString(value.sellerName, 200),
    location: optionalString(value.location, 200),
    cardId,
    episodeId,
    listingPriceEur,
    shippingEur: optionalMoney(value.shippingEur, "deal.shippingEur"),
    marketValueEur,
    savingsEur,
    discountPercent,
    condition: optionalString(value.condition, 100),
    language,
    gradingCompany,
    gradingGrade,
    matchConfidence,
    matchStatus,
    matchNotes: optionalString(value.matchNotes, 1_000),
    descriptionChecked,
    descriptionSummary,
    offerContents,
    sourcePublishedAt: parseDate(value.sourcePublishedAt, "deal.sourcePublishedAt"),
  };
}

export function normalizeMarktplaatsReport(value: unknown): NormalizedMarktplaatsReport {
  if (!isRecord(value)) throw new MarktplaatsReportError("Report must be an object.");
  if (value.schemaVersion !== MARKTPLAATS_REPORT_SCHEMA_VERSION) {
    throw new MarktplaatsReportError(
      `schemaVersion must be ${MARKTPLAATS_REPORT_SCHEMA_VERSION}.`
    );
  }
  if (!isRecord(value.scan)) throw new MarktplaatsReportError("scan is required.");
  if (!Array.isArray(value.deals)) throw new MarktplaatsReportError("deals must be an array.");

  const startedAt = parseDate(value.scan.startedAt, "scan.startedAt", true);
  const finishedAt = parseDate(value.scan.finishedAt, "scan.finishedAt", true);
  if (finishedAt < startedAt) {
    throw new MarktplaatsReportError("scan.finishedAt cannot precede scan.startedAt.");
  }

  const deals = value.deals.map(normalizeDeal);
  const uniqueDeals = new Map<string, MarktplaatsReportDeal>();
  for (const deal of deals) uniqueDeals.set(deal.externalId, deal);
  const removedExternalIds = Array.isArray(value.scan.removedExternalIds)
    ? value.scan.removedExternalIds
        .map((entry) => optionalString(entry, 200))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    schemaVersion: MARKTPLAATS_REPORT_SCHEMA_VERSION,
    scan: {
      id: requiredString(value.scan.id, "scan.id", 200),
      startedAt,
      finishedAt,
      referenceExportedAt: parseDate(
        value.scan.referenceExportedAt,
        "scan.referenceExportedAt"
      ),
      listingsChecked: Math.floor(
        finiteNumber(value.scan.listingsChecked ?? 0, "scan.listingsChecked", 0)
      ),
      completeCoverage: value.scan.completeCoverage === true,
      removedExternalIds: [...new Set(removedExternalIds)],
      warning: optionalString(value.scan.warning, 1_000),
    },
    deals: [...uniqueDeals.values()],
  };
}

export function marktplaatsDealMateriallyChanged(
  previous: {
    listing_price_eur: number;
    shipping_eur: number | null;
    market_value_eur: number;
    match_status: string;
  },
  next: MarktplaatsReportDeal
): boolean {
  return (
    previous.listing_price_eur !== next.listingPriceEur ||
    previous.shipping_eur !== next.shippingEur ||
    previous.market_value_eur !== next.marketValueEur ||
    previous.match_status !== next.matchStatus
  );
}
