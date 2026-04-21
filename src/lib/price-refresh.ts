import { normalizeRarityLabel } from "@/lib/rarity";

export type PriceRefreshTier = "base" | "low" | "medium" | "high";

interface PriceRefreshPolicy {
  tier: PriceRefreshTier;
  tierLabel: string;
  cadenceLabel: string;
  intervalMs: number;
  autoRefreshEnabled: boolean;
}

export interface PriceRefreshInfo extends PriceRefreshPolicy {
  due: boolean;
  hasFetchedAt: boolean;
  nextRefreshAt: number | null;
  remainingMs: number;
}

const HOUR_MS = 60 * 60 * 1000;

const PRICE_REFRESH_POLICIES: Record<PriceRefreshTier, PriceRefreshPolicy> = {
  base: {
    tier: "base",
    tierLabel: "Base price",
    cadenceLabel: "First sync, then manual only",
    intervalMs: Number.POSITIVE_INFINITY,
    autoRefreshEnabled: false,
  },
  low: {
    tier: "low",
    tierLabel: "Low refresh",
    cadenceLabel: "Every 24h",
    intervalMs: 24 * HOUR_MS,
    autoRefreshEnabled: true,
  },
  medium: {
    tier: "medium",
    tierLabel: "Medium refresh",
    cadenceLabel: "Every 24h",
    intervalMs: 24 * HOUR_MS,
    autoRefreshEnabled: true,
  },
  high: {
    tier: "high",
    tierLabel: "High refresh",
    cadenceLabel: "Every 12h",
    intervalMs: 12 * HOUR_MS,
    autoRefreshEnabled: true,
  },
};

const BASE_PRICE_ONLY_RARITIES = new Set(["Common", "Uncommon"]);
const MEDIUM_REFRESH_RARITIES = new Set(["Rare"]);

export function formatPriceRefreshedAt(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getPriceRefreshTier(rarity: string | null | undefined): PriceRefreshTier {
  const normalized = normalizeRarityLabel(rarity);

  if (!normalized) return "high";
  if (BASE_PRICE_ONLY_RARITIES.has(normalized)) return "base";
  if (MEDIUM_REFRESH_RARITIES.has(normalized)) return "medium";
  if (normalized.includes("Rare Holo")) return "medium";

  return "high";
}

export function getPriceRefreshPolicy(rarity: string | null | undefined): PriceRefreshPolicy {
  return PRICE_REFRESH_POLICIES[getPriceRefreshTier(rarity)];
}

export function getPriceRefreshInfo(
  rarity: string | null | undefined,
  priceFetchedAt: string | null,
  now = Date.now()
): PriceRefreshInfo {
  const policy = getPriceRefreshPolicy(rarity);

  if (!priceFetchedAt) {
    return {
      ...policy,
      due: true,
      hasFetchedAt: false,
      nextRefreshAt: null,
      remainingMs: 0,
    };
  }

  const fetchedAt = new Date(priceFetchedAt).getTime();
  if (Number.isNaN(fetchedAt)) {
    return {
      ...policy,
      due: true,
      hasFetchedAt: false,
      nextRefreshAt: null,
      remainingMs: 0,
    };
  }

  if (!policy.autoRefreshEnabled) {
    return {
      ...policy,
      due: false,
      hasFetchedAt: true,
      nextRefreshAt: null,
      remainingMs: Number.POSITIVE_INFINITY,
    };
  }

  const nextRefreshAt = fetchedAt + policy.intervalMs;
  const remainingMs = Math.max(0, nextRefreshAt - now);

  return {
    ...policy,
    due: remainingMs === 0,
    hasFetchedAt: true,
    nextRefreshAt,
    remainingMs,
  };
}

export function formatRefreshCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const segments: string[] = [];

  if (days > 0) {
    segments.push(`${days}d`, `${String(hours).padStart(2, "0")}h`, `${String(minutes).padStart(2, "0")}m`);
    return segments.join(" ");
  }

  if (hours > 0) {
    segments.push(`${hours}h`, `${String(minutes).padStart(2, "0")}m`, `${String(seconds).padStart(2, "0")}s`);
    return segments.join(" ");
  }

  if (minutes > 0) {
    segments.push(`${minutes}m`, `${String(seconds).padStart(2, "0")}s`);
    return segments.join(" ");
  }

  return `${seconds}s`;
}
