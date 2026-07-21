const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export const NEW_RELEASE_CHASE_WATCH_DAYS = 14;
export const NEW_RELEASE_CHASE_WATCH_MAX_CANDIDATES = 10;
export const NEW_RELEASE_CHASE_WATCH_MAX_PER_RUN = 2;
export const NEW_RELEASE_CHASE_WATCH_PROVIDER = "scrapedo";
export const NEW_RELEASE_CHASE_WATCH_SOURCE = "cardmarket-direct";

export type NewReleaseChaseWatchUiState =
  | "current"
  | "due_soon"
  | "queued"
  | "updating"
  | "delayed"
  | "paused"
  | "confirming"
  | "unavailable";

function normalizeChaseIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function cardNumberOrdinal(value: string | null | undefined): string {
  const text = (value ?? "").trim().toLocaleLowerCase("en");
  const relevant = text.includes("/") ? text.split("/", 1)[0] : text;
  return relevant.match(/\d+/g)?.at(-1)?.replace(/^0+(?=\d)/, "") ?? "";
}

function cardMarketProductId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).searchParams.get("idProduct")?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * CardMarket redirects numeric product URLs to canonical SEO URLs. Verify the
 * response against either the retained product id or an exact name + printed
 * ordinal so that a legitimate redirect is accepted without allowing a
 * different printing through.
 */
export function cardMarketChaseIdentityMatches(input: {
  expectedName: string;
  expectedCardNumber?: string | null;
  expectedProductId: string;
  parsedName?: string | null;
  parsedCardNumber?: string | null;
  resolvedUrl: string;
  targetUrl?: string | null;
}): boolean {
  const expectedName = normalizeChaseIdentity(input.expectedName);
  const parsedName = normalizeChaseIdentity(input.parsedName);
  if (!expectedName || !parsedName || expectedName !== parsedName) return false;

  const observedProductIds = [input.resolvedUrl, input.targetUrl]
    .map(cardMarketProductId)
    .filter((value): value is string => Boolean(value));
  if (
    observedProductIds.some((productId) => productId !== input.expectedProductId)
  ) {
    return false;
  }
  const productIdVerified = observedProductIds.includes(input.expectedProductId);

  const expectedNumber = cardNumberOrdinal(input.expectedCardNumber);
  const parsedNumber = cardNumberOrdinal(input.parsedCardNumber);
  if (expectedNumber && parsedNumber && expectedNumber !== parsedNumber) return false;
  if (expectedNumber && !parsedNumber && !productIdVerified) return false;

  return productIdVerified || Boolean(expectedNumber && parsedNumber);
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getNewReleaseChaseWatchCadence(input: {
  releaseDate: Date | string | null;
  firstSeenAt?: Date | string | null;
  candidateRank: number;
  now?: Date;
}): { active: boolean; cadenceMs: number | null; phase: "launch" | "settling" | "late" | "off" } {
  const now = input.now ?? new Date();
  const releaseDate = validDate(input.releaseDate);
  if (!releaseDate) return { active: false, cadenceMs: null, phase: "off" };

  const releaseAgeMs = now.getTime() - releaseDate.getTime();
  if (releaseAgeMs < 0 || releaseAgeMs > NEW_RELEASE_CHASE_WATCH_DAYS * DAY_MS) {
    return { active: false, cadenceMs: null, phase: "off" };
  }

  const firstSeenAt = validDate(input.firstSeenAt);
  const phaseStart = firstSeenAt && firstSeenAt > releaseDate ? firstSeenAt : releaseDate;
  const phaseAgeMs = Math.max(0, now.getTime() - phaseStart.getTime());
  const priority = input.candidateRank <= 3;

  if (phaseAgeMs < 2 * DAY_MS) {
    return {
      active: true,
      cadenceMs: priority ? 3 * HOUR_MS : 12 * HOUR_MS,
      phase: "launch",
    };
  }
  if (phaseAgeMs < 7 * DAY_MS) {
    return {
      active: true,
      cadenceMs: priority ? 6 * HOUR_MS : 12 * HOUR_MS,
      phase: "settling",
    };
  }
  return {
    active: true,
    cadenceMs: priority ? 12 * HOUR_MS : 24 * HOUR_MS,
    phase: "late",
  };
}

export function getNewReleaseChaseNextAttemptAt(input: {
  releaseDate: Date | string | null;
  firstSeenAt?: Date | string | null;
  candidateRank: number;
  lastSuccessAt?: Date | string | null;
  now?: Date;
}): Date | null {
  const now = input.now ?? new Date();
  const policy = getNewReleaseChaseWatchCadence({ ...input, now });
  if (!policy.active || policy.cadenceMs == null) return null;
  const lastSuccessAt = validDate(input.lastSuccessAt);
  return lastSuccessAt
    ? new Date(lastSuccessAt.getTime() + policy.cadenceMs)
    : now;
}

export function getNewReleaseChaseWatchUiState(input: {
  enabled: boolean;
  status?: string | null;
  nextAttemptAt?: Date | string | null;
  paused?: boolean;
  now?: Date;
}): NewReleaseChaseWatchUiState {
  if (!input.enabled) return "unavailable";
  if (input.paused) return "paused";
  if (input.status === "refreshing") return "updating";
  if (input.status === "queued") return "queued";
  if (input.status === "confirming") return "confirming";
  if (input.status === "unavailable" || input.status === "failed") return "unavailable";
  const now = input.now ?? new Date();
  const nextAttemptAt = validDate(input.nextAttemptAt);
  if (!nextAttemptAt) return "queued";
  const remainingMs = nextAttemptAt.getTime() - now.getTime();
  if (remainingMs < -15 * 60_000) return "delayed";
  if (remainingMs <= 15 * 60_000) return "due_soon";
  return "current";
}

export function getNewReleaseChaseCadenceBucket(
  now: Date,
  cadenceMs: number
): string {
  return String(Math.floor(now.getTime() / cadenceMs));
}

export function getNewReleaseChaseFailureDelayMs(
  failures: number,
  cadenceMs: number
): number {
  const exponent = Math.max(0, Math.min(5, Math.floor(failures)));
  return Math.min(cadenceMs, 30 * 60_000 * 2 ** exponent);
}

export interface ChasePriceGuardResult {
  accept: boolean;
  requiresConfirmation: boolean;
  confirmationCount: number;
}

export function evaluateNewReleaseChasePriceGuard(input: {
  currentPrice: number | null;
  observedPrice: number;
  pendingPrice?: number | null;
  pendingConfirmations?: number | null;
}): ChasePriceGuardResult {
  if (!Number.isFinite(input.observedPrice) || input.observedPrice <= 0 || input.observedPrice === 9001) {
    return { accept: false, requiresConfirmation: false, confirmationCount: 0 };
  }
  if (!input.currentPrice || input.currentPrice <= 0) {
    return { accept: true, requiresConfirmation: false, confirmationCount: 0 };
  }

  const ratio = input.observedPrice / input.currentPrice;
  const shock = ratio < 0.35 || ratio > 3;
  if (!shock) return { accept: true, requiresConfirmation: false, confirmationCount: 0 };

  const pendingPrice = input.pendingPrice ?? null;
  const matchesPending =
    pendingPrice != null &&
    pendingPrice > 0 &&
    Math.abs(input.observedPrice - pendingPrice) / pendingPrice <= 0.05;
  const confirmationCount = matchesPending
    ? Math.max(1, input.pendingConfirmations ?? 1) + 1
    : 1;
  return {
    accept: confirmationCount >= 2,
    requiresConfirmation: confirmationCount < 2,
    confirmationCount,
  };
}
