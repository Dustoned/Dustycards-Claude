"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { formatCurrency } from "@/lib/format";

export type EbayCardDemandMode = "raw" | "graded";

export interface EbayCardDemandHistoryPoint {
  date: string;
  activeCount: number;
  newCount: number;
  removedCount: number;
  medianAskEur: number | null;
}

export interface EbayCardDemandSummary {
  activeCount: number;
  new7d: number;
  removed7d: number;
  removalPressure7d: number | null;
  baseline30d: number | null;
  pressureChangePercent: number | null;
  medianAskEur: number | null;
  lowestAskEur: number | null;
  auctionCount: number;
  fixedCount: number;
}

export interface EbayCardDemandData {
  updatedAt: string;
  marketplaceId: string;
  mode: EbayCardDemandMode;
  sample: {
    observed: number;
    clean?: number;
    capped: boolean;
  };
  summary: EbayCardDemandSummary;
  history: EbayCardDemandHistoryPoint[];
}

export interface EbayCardDemandListing {
  itemId: string;
  title: string;
  imageUrl: string | null;
  itemWebUrl: string;
  totalEur: number | null;
  buyingOptions: string[];
  condition: string | null;
  languageCode: string | null;
  itemCreationDate: string | null;
  itemEndDate: string | null;
  sellerUsername: string | null;
  sellerFeedbackPercentage: string | null;
  rawDemandQualified: boolean;
}

interface EbayCardDemandPayload {
  configured?: boolean;
  hasData: boolean;
  demand: EbayCardDemandData | null;
  listings: EbayCardDemandListing[];
  listingPage: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

interface EbayCardDemandPanelProps {
  cardId: string;
  initialMode?: EbayCardDemandMode;
  mode?: EbayCardDemandMode;
  onModeChange?: (mode: EbayCardDemandMode) => void;
  showModeControl?: boolean;
  className?: string;
  compact?: boolean;
  rail?: boolean;
}

interface JsonRecord {
  [key: string]: unknown;
}

const payloadCache = new Map<string, EbayCardDemandPayload>();
const requestCache = new Map<string, Promise<EbayCardDemandPayload>>();
const seededKeys = new Set<string>();
const DEMAND_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readCount(value: unknown): number {
  return Math.max(0, Math.round(readNumber(value) ?? 0));
}

function readMode(value: unknown, fallback: EbayCardDemandMode): EbayCardDemandMode {
  return value === "graded" || value === "raw" ? value : fallback;
}

function normalizeDemand(value: unknown, fallbackMode: EbayCardDemandMode): EbayCardDemandData | null {
  if (!isRecord(value) || !isRecord(value.summary)) return null;

  const summary = value.summary;
  const sample = isRecord(value.sample) ? value.sample : {};
  const history = Array.isArray(value.history)
    ? value.history.flatMap((point): EbayCardDemandHistoryPoint[] => {
        if (!isRecord(point)) return [];
        const date = readString(point.date);
        if (!date) return [];
        return [{
          date,
          activeCount: readCount(point.activeCount),
          newCount: readCount(point.newCount),
          removedCount: readCount(point.removedCount),
          medianAskEur: readNumber(point.medianAskEur),
        }];
      })
    : [];

  return {
    updatedAt: readString(value.updatedAt) ?? new Date().toISOString(),
    marketplaceId: readString(value.marketplaceId) ?? "EBAY_NL",
    mode: readMode(value.mode, fallbackMode),
    sample: {
      observed: readCount(sample.observed),
      clean: readNumber(sample.clean) == null ? undefined : readCount(sample.clean),
      capped: sample.capped === true,
    },
    summary: {
      activeCount: readCount(summary.activeCount),
      new7d: readCount(summary.new7d),
      removed7d: readCount(summary.removed7d),
      removalPressure7d: readNumber(summary.removalPressure7d),
      baseline30d: readNumber(summary.baseline30d),
      pressureChangePercent: readNumber(summary.pressureChangePercent),
      medianAskEur: readNumber(summary.medianAskEur),
      lowestAskEur: readNumber(summary.lowestAskEur),
      auctionCount: readCount(summary.auctionCount),
      fixedCount: readCount(summary.fixedCount),
    },
    history,
  };
}

function normalizeListing(value: unknown): EbayCardDemandListing | null {
  if (!isRecord(value)) return null;
  const itemId = readString(value.itemId);
  const title = readString(value.title);
  const itemWebUrl = readString(value.itemWebUrl);
  if (!itemId || !title || !itemWebUrl) return null;

  const total = isRecord(value.total) ? value.total : null;
  const cardCondition = isRecord(value.cardCondition) ? value.cardCondition : null;
  const language = isRecord(value.language) ? value.language : null;
  const seller = isRecord(value.seller) ? value.seller : null;
  const hasRawVerification = language != null || cardCondition != null;
  const rawDemandQualified = !hasRawVerification || (
    readString(language?.code) === "ENG" &&
    readString(language?.confidence) === "explicit" &&
    readString(cardCondition?.code) === "near_mint"
  );

  const listingType = readString(value.listingType);
  const buyingOptions = Array.isArray(value.buyingOptions)
    ? value.buyingOptions.filter((option): option is string => typeof option === "string")
    : listingType === "auction"
      ? ["AUCTION"]
      : listingType === "fixed"
        ? ["FIXED_PRICE"]
        : [];

  return {
    itemId,
    title,
    imageUrl: readString(value.imageUrl),
    itemWebUrl,
    totalEur: readNumber(value.totalEur) ?? readNumber(total?.valueEur),
    buyingOptions,
    condition:
      readString(cardCondition?.label) ?? readString(value.condition),
    languageCode:
      readString(value.languageCode) ?? readString(language?.code),
    itemCreationDate: readString(value.itemCreationDate) ?? readString(value.firstSeenAt),
    itemEndDate: readString(value.itemEndDate),
    sellerUsername:
      readString(value.sellerUsername) ?? readString(seller?.username),
    sellerFeedbackPercentage:
      readString(value.sellerFeedbackPercentage) ?? readString(seller?.feedbackPercentage),
    rawDemandQualified,
  };
}

function normalizePayload(value: unknown, mode: EbayCardDemandMode): EbayCardDemandPayload {
  const payload = isRecord(value) ? value : {};
  if (isRecord(payload.demand) && payload.demand.mode !== mode) {
    throw new Error("eBay demand response did not match the requested market mode.");
  }
  const demand = normalizeDemand(payload.demand, mode);
  const listingPage = isRecord(payload.listingPage) ? payload.listingPage : {};
  const normalizedListings = Array.isArray(payload.listings)
    ? payload.listings.flatMap((listing) => {
        const normalized = normalizeListing(listing);
        return normalized ? [normalized] : [];
      })
    : [];
  const listings = mode === "raw"
    ? normalizedListings.filter((listing) => listing.rawDemandQualified)
    : normalizedListings;
  const total = readNumber(listingPage.total) == null
    ? Math.max(demand?.summary.activeCount ?? 0, listings.length)
    : readCount(listingPage.total);
  const offset = readCount(listingPage.offset);
  const limit = Math.max(1, readCount(listingPage.limit) || listings.length || 12);

  return {
    configured: typeof payload.configured === "boolean" ? payload.configured : undefined,
    hasData: payload.hasData === true || demand != null,
    demand,
    listings,
    listingPage: {
      total,
      offset,
      limit,
      hasMore: listingPage.hasMore === true || offset + listings.length < total,
    },
  };
}

function isDemandStale(payload: EbayCardDemandPayload): boolean {
  const updatedAt = payload.demand?.updatedAt;
  if (!updatedAt) return true;

  const updatedAtMs = new Date(updatedAt).getTime();
  return !Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs >= DEMAND_REFRESH_INTERVAL_MS;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = isRecord(payload) ? readString(payload.error) : null;
      throw new Error(message ?? "eBay demand data could not be loaded.");
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("eBay demand took too long. Try again in a moment.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestDemand(
  cardId: string,
  mode: EbayCardDemandMode,
  forceRefresh: boolean
): Promise<EbayCardDemandPayload> {
  const key = `${cardId}:${mode}`;
  if (!forceRefresh) {
    const cached = payloadCache.get(key);
    if (cached && !isDemandStale(cached)) return cached;
    const pending = requestCache.get(key);
    if (pending) return pending;
  }

  const request = (async () => {
    let normalized: EbayCardDemandPayload;
    if (forceRefresh) {
      normalized = normalizePayload(
        await fetchJson(
          `/api/ebay/deals?cardId=${encodeURIComponent(cardId)}&mode=${mode}&profile=demand&buying=fixed&limit=50`
        ),
        mode
      );
      seededKeys.add(key);
    } else {
      normalized = normalizePayload(
        await fetchJson(`/api/cards/${encodeURIComponent(cardId)}/ebay-demand?mode=${mode}`),
        mode
      );

      const needsFreshObservation = !normalized.hasData || isDemandStale(normalized);
      if (normalized.configured !== false && needsFreshObservation && !seededKeys.has(key)) {
        normalized = normalizePayload(
          await fetchJson(
            `/api/ebay/deals?cardId=${encodeURIComponent(cardId)}&mode=${mode}&profile=demand&buying=fixed&limit=50`
          ),
          mode
        );
        seededKeys.add(key);
      }
    }

    payloadCache.set(key, normalized);
    return normalized;
  })();

  requestCache.set(key, request);
  try {
    return await request;
  } finally {
    if (requestCache.get(key) === request) requestCache.delete(key);
  }
}

async function requestListingPage(
  cardId: string,
  mode: EbayCardDemandMode,
  offset: number
): Promise<EbayCardDemandPayload> {
  return normalizePayload(
    await fetchJson(
      `/api/cards/${encodeURIComponent(cardId)}/ebay-demand?mode=${mode}&listingLimit=100&listingOffset=${offset}`
    ),
    mode
  );
}

function percentageValue(value: number | null): number | null {
  return value;
}

function formatPercent(value: number | null, signed = false): string {
  if (value == null) return "--";
  const percentage = percentageValue(value) ?? 0;
  return `${signed && percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buyingLabel(options: string[]): string {
  if (options.some((option) => option.toUpperCase().includes("AUCTION"))) return "Auction";
  if (options.some((option) => option.toUpperCase().includes("FIXED"))) return "Buy now";
  return "Listing";
}

function marketplaceLabel(value: string | null | undefined): string {
  const suffix = value?.replace(/^EBAY_/i, "").replaceAll("_", " ").trim();
  return suffix ? `eBay ${suffix}` : "eBay";
}

function DemandMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/7 bg-black/16 px-3 py-2.5">
      <p className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-white/30">{label}</p>
      <p
        className={`mt-1 text-lg font-black tabular-nums ${
          tone === "positive"
            ? "text-emerald-200/86"
            : tone === "negative"
              ? "text-rose-200/82"
              : "text-white/86"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[8px] text-white/28" title={detail}>{detail}</p>
    </div>
  );
}

function DemandVolumeChart({ history }: { history: EbayCardDemandHistoryPoint[] }) {
  const points = history.slice(-30);
  if (points.length < 2) {
    return (
      <div className="flex h-[7.5rem] items-center justify-center rounded-xl border border-dashed border-white/8 bg-black/12 px-4 text-center text-[10px] text-white/34">
        Baseline captured. The trend appears after the next daily observation.
      </div>
    );
  }

  const width = 360;
  const chartTop = 8;
  const activeBottom = 66;
  const activeHeight = activeBottom - chartTop;
  const maxActive = Math.max(1, ...points.map((point) => point.activeCount));
  const maxFlow = Math.max(1, ...points.flatMap((point) => [point.newCount, point.removedCount]));
  const slot = width / points.length;
  const barWidth = Math.max(2.5, slot - Math.min(3, slot * 0.22));

  return (
    <div className="rounded-xl border border-white/7 bg-black/14 p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] font-semibold text-white/34">
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-3 rounded-full bg-white/22" />Active</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-3 rounded-full bg-sky-300/70" />New</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-3 rounded-full bg-amber-300/70" />Removed est.</span>
        <span className="ml-auto">Last {points.length}d</span>
      </div>
      <svg
        viewBox={`0 0 ${width} 88`}
        role="img"
        aria-label="Daily active, new and no-longer-observed eBay listing volume"
        className="h-[5.5rem] w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <line x1="0" x2={width} y1={activeBottom} y2={activeBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <line x1="0" x2={width} y1="36" y2="36" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 4" />
        {points.map((point, index) => {
          const x = index * slot + (slot - barWidth) / 2;
          const activeBarHeight = (point.activeCount / maxActive) * activeHeight;
          const newBarHeight = (point.newCount / maxFlow) * Math.min(18, activeHeight * 0.32);
          const removedBarHeight = (point.removedCount / maxFlow) * 13;
          return (
            <g key={`${point.date}:${index}`}>
              <title>{`${point.date}: ${point.activeCount} active, ${point.newCount} new, ${point.removedCount} removed estimate`}</title>
              <rect x={x} y={activeBottom - activeBarHeight} width={barWidth} height={activeBarHeight} rx="1.4" fill="rgba(196,205,229,0.20)" />
              {point.newCount > 0 ? <rect x={x} y={activeBottom - newBarHeight} width={barWidth} height={newBarHeight} rx="1.4" fill="rgba(125,211,252,0.72)" /> : null}
              {point.removedCount > 0 ? <rect x={x} y={activeBottom + 2} width={barWidth} height={removedBarHeight} rx="1.4" fill="rgba(252,211,77,0.72)" /> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LatestListing({ listing }: { listing: EbayCardDemandListing }) {
  const seller = [
    listing.sellerUsername,
    listing.sellerFeedbackPercentage ? `${listing.sellerFeedbackPercentage}%` : null,
  ].filter(Boolean).join(" · ");

  return (
    <a
      href={listing.itemWebUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-white/7 bg-black/14 p-2 transition hover:border-violet-300/20 hover:bg-violet-400/[0.045]"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
        {listing.imageUrl ? (
          <CachedImage
            sourceUrl={listing.imageUrl}
            alt=""
            fill
            sizes="48px"
            className="object-contain p-0.5"
          />
        ) : (
          <ShoppingBag className="absolute inset-0 m-auto h-4 w-4 text-white/18" />
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[10px] font-semibold leading-3.5 text-white/70 transition group-hover:text-white/90">{listing.title}</p>
        <p className="mt-1 truncate text-[8px] text-white/30">
          {[buyingLabel(listing.buyingOptions), listing.condition, seller].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-black tabular-nums text-white/82">{formatCurrency(listing.totalEur, "EUR")}</p>
        <ArrowUpRight className="ml-auto mt-1 h-3 w-3 text-white/24 transition group-hover:text-violet-200/70" />
      </div>
    </a>
  );
}

export default function EbayCardDemandPanel({
  cardId,
  initialMode = "raw",
  mode: controlledMode,
  onModeChange,
  showModeControl = true,
  className = "",
  compact = false,
  rail = false,
}: EbayCardDemandPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [uncontrolledMode, setUncontrolledMode] = useState<EbayCardDemandMode>(initialMode);
  const mode = controlledMode ?? uncontrolledMode;
  const [payloadState, setPayloadState] = useState<{
    contextKey: string;
    payload: EbayCardDemandPayload;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllListings, setShowAllListings] = useState(false);
  const [loadedListings, setLoadedListings] = useState<EbayCardDemandListing[]>([]);
  const [listingTotal, setListingTotal] = useState(0);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const requestContextKey = `${cardId}:${mode}`;
  const requestContextRef = useRef(requestContextKey);
  const payload = payloadState?.contextKey === requestContextKey ? payloadState.payload : null;

  useEffect(() => {
    requestContextRef.current = requestContextKey;
    return () => {
      if (requestContextRef.current === requestContextKey) requestContextRef.current = "";
    };
  }, [requestContextKey]);

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const fallbackTimer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "260px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const contextKey = `${cardId}:${mode}`;
    queueMicrotask(() => {
      if (!active || requestContextRef.current !== contextKey) return;
      setLoading(true);
      setError(null);
      const cachedPayload = payloadCache.get(contextKey);
      setPayloadState(cachedPayload ? { contextKey, payload: cachedPayload } : null);
      void requestDemand(cardId, mode, false)
        .then((nextPayload) => {
          if (active && requestContextRef.current === contextKey) {
            setPayloadState({ contextKey, payload: nextPayload });
          }
        })
        .catch((requestError: unknown) => {
          if (active && requestContextRef.current === contextKey) {
            setError(requestError instanceof Error ? requestError.message : "eBay demand data could not be loaded.");
          }
        })
        .finally(() => {
          if (active && requestContextRef.current === contextKey) setLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [cardId, mode, visible]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setShowAllListings(false);
      setLoadedListings([]);
      setListingTotal(0);
      setListingsLoading(false);
      setListingsError(null);
      setRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [cardId, mode]);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoadedListings(payload.listings);
      setListingTotal(payload.listingPage.total);
    });
    return () => {
      active = false;
    };
  }, [payload]);

  const latestListings = useMemo(
    () => (showAllListings ? loadedListings : (payload?.listings ?? []).slice(0, compact ? 2 : 4)),
    [compact, loadedListings, payload?.listings, showAllListings]
  );

  const hasMoreListings = useMemo(
    () => loadedListings.length < listingTotal,
    [listingTotal, loadedListings.length]
  );

  async function loadListingPage(offset: number, replace: boolean) {
    const contextKey = `${cardId}:${mode}`;
    setListingsLoading(true);
    setListingsError(null);
    try {
      const nextPayload = await requestListingPage(cardId, mode, offset);
      if (requestContextRef.current !== contextKey) return;
      setListingTotal(nextPayload.listingPage.total);
      setLoadedListings((current) => {
        const merged = new Map<string, EbayCardDemandListing>();
        for (const listing of replace ? [] : current) merged.set(listing.itemId, listing);
        for (const listing of nextPayload.listings) merged.set(listing.itemId, listing);
        return [...merged.values()];
      });
    } catch (requestError) {
      if (requestContextRef.current === contextKey) {
        setListingsError(requestError instanceof Error ? requestError.message : "eBay listings could not be loaded.");
      }
    } finally {
      if (requestContextRef.current === contextKey) setListingsLoading(false);
    }
  }

  function openAllListings() {
    setShowAllListings(true);
    void loadListingPage(0, true);
  }

  function loadMoreListings() {
    void loadListingPage(loadedListings.length, false);
  }

  function selectMode(nextMode: EbayCardDemandMode) {
    if (nextMode === mode) return;
    requestContextRef.current = `${cardId}:${nextMode}`;
    if (controlledMode == null) setUncontrolledMode(nextMode);
    onModeChange?.(nextMode);
  }

  const displayedListingCount = latestListings.length;

  async function refresh() {
    const contextKey = `${cardId}:${mode}`;
    setRefreshing(true);
    setError(null);
    try {
      const nextPayload = await requestDemand(cardId, mode, true);
      if (requestContextRef.current === contextKey) {
        setPayloadState({ contextKey, payload: nextPayload });
      }
    } catch (requestError) {
      if (requestContextRef.current === contextKey) {
        setError(requestError instanceof Error ? requestError.message : "eBay demand data could not be refreshed.");
      }
    } finally {
      if (requestContextRef.current === contextKey) setRefreshing(false);
    }
  }

  const demand = payload?.demand ?? null;
  const summary = demand?.summary ?? null;
  const cappedSample = demand?.sample.capped === true;
  const pressureChange = percentageValue(summary?.pressureChangePercent ?? null);
  const pressureTone = pressureChange == null || pressureChange === 0
    ? "neutral"
    : pressureChange > 0
      ? "positive"
      : "negative";

  return (
    <section
      ref={panelRef}
      data-ebay-card-demand
      data-ebay-demand-layout={rail ? "rail" : compact ? "compact" : "default"}
      className={`min-w-0 overflow-hidden rounded-2xl border border-white/9 bg-[rgba(16,19,29,0.88)] ${className}`}
    >
      <header className={`grid min-h-14 items-center gap-3 border-b border-white/7 py-3 ${rail ? "px-3.5" : "px-4 sm:flex sm:flex-wrap sm:justify-between sm:px-5"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/12 bg-sky-400/[0.06] text-sky-200/72">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`font-bold text-white/88 ${rail ? "text-sm" : "text-sm sm:text-base"}`}>eBay market demand</h2>
              <span className="rounded-full border border-sky-300/12 bg-sky-400/[0.055] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-sky-100/64">
                {marketplaceLabel(demand?.marketplaceId)} · {mode === "raw" ? "Raw · EN · NM · Fixed" : "Graded · EN · Fixed"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[9px] text-white/32">
              {demand ? `${demand.sample.clean ?? demand.sample.observed} clean of ${demand.sample.observed} observed${demand.sample.capped ? " · sample capped" : ""}` : "Official eBay active-listing observations"}
            </p>
          </div>
        </div>
        <div className={showModeControl ? (rail ? "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2" : "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 sm:flex sm:w-auto") : "flex w-full justify-end sm:w-auto"}>
          {showModeControl ? (
            <div
              role="group"
              aria-label="eBay market mode"
              className={rail ? "dc-compact-segment grid h-9 min-w-0 grid-cols-2 overflow-hidden rounded-lg border border-white/8 bg-black/24 p-1" : "dc-compact-segment grid h-11 min-w-0 grid-cols-2 overflow-hidden rounded-xl border border-white/8 bg-black/24 p-0 sm:h-8 sm:min-w-[8.5rem] sm:rounded-lg sm:p-1"}
            >
              {(["raw", "graded"] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => selectMode(nextMode)}
                  aria-pressed={mode === nextMode}
                  className={`min-w-0 rounded-lg px-2.5 text-[10px] font-semibold capitalize transition sm:rounded-md sm:text-[9px] ${
                    mode === nextMode ? "bg-violet-500 text-white" : "text-white/42 hover:bg-white/[0.055] hover:text-white/72"
                  }`}
                >
                  {nextMode}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            aria-label="Refresh eBay demand"
            title="Refresh clean eBay listing observations"
            className={rail ? "dc-compact-icon-button flex h-9 w-10 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-white/42 transition hover:border-violet-300/20 hover:bg-violet-400/[0.07] hover:text-white/78 disabled:cursor-wait disabled:opacity-45" : "dc-compact-icon-button flex h-11 w-11 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-white/42 transition hover:border-violet-300/20 hover:bg-violet-400/[0.07] hover:text-white/78 disabled:cursor-wait disabled:opacity-45 sm:h-8 sm:w-8 sm:rounded-lg"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className={rail ? "p-3" : "p-3.5 sm:p-4"}>
        {!visible || (loading && !payload) ? (
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl border border-white/6 bg-white/[0.025]" />)}
          </div>
        ) : error && !payload ? (
          <div className="flex min-h-28 items-center justify-between gap-4 rounded-xl border border-rose-300/12 bg-rose-400/[0.035] px-4">
            <p className="text-[10px] leading-4 text-rose-100/65">{error}</p>
            <button type="button" onClick={() => void refresh()} className="shrink-0 rounded-lg border border-white/9 px-3 py-2 text-[9px] font-bold text-white/64 hover:bg-white/[0.05]">Try again</button>
          </div>
        ) : payload?.configured === false ? (
          <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/9 bg-black/12 px-5 text-center text-[10px] leading-4 text-white/38">
            eBay Browse credentials are not configured for this environment.
          </div>
        ) : !demand || demand.sample.clean === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-white/9 bg-black/12 px-5 text-center">
            <p className="text-[11px] font-semibold text-white/58">
              {demand ? "No verified matches in this observation" : "No clean listing baseline yet"}
            </p>
            <p className="mt-1 max-w-lg text-[9px] leading-4 text-white/32">
              {mode === "raw"
                ? "Only exact English, near-mint, fixed-price raw matches count; other languages, conditions and auctions are excluded."
                : "Only exact English, verified graded fixed-price matches count; raw cards and auctions are excluded."}
            </p>
          </div>
        ) : (
          <div className={`grid min-w-0 gap-3 ${compact ? "" : "xl:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)]"}`}>
            <div className="min-w-0">
              <div className={rail ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-4"}>
                <DemandMetric label={cappedSample ? "Active sample" : "Active"} value={String(summary?.activeCount ?? 0)} detail={`${summary?.fixedCount ?? 0} fixed-price listings`} />
                <DemandMetric label={cappedSample ? "New sample · 7d" : "New · 7d"} value={String(summary?.new7d ?? 0)} detail={cappedSample ? "Within the verified sample" : "Created on eBay this week"} />
                <DemandMetric label="Removed est. · 7d" value={cappedSample ? "--" : String(summary?.removed7d ?? 0)} detail={cappedSample ? "Unavailable on a capped sample" : "No longer observed; not confirmed sold"} />
                <DemandMetric label="Pressure vs 30d" value={cappedSample ? "--" : formatPercent(summary?.pressureChangePercent ?? null, true)} detail={cappedSample ? "Needs a complete observation" : `${formatPercent(summary?.removalPressure7d ?? null)} vs ${formatPercent(summary?.baseline30d ?? null)} baseline`} tone={cappedSample ? "neutral" : pressureTone} />
              </div>
              <div className="mt-3">
                <DemandVolumeChart history={demand.history} />
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-white/7 bg-black/12 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
                <div>
                  <p className="text-[10px] font-bold text-white/70">
                    {showAllListings ? "All active clean listings" : "Active clean listings"}
                  </p>
                  <p className="mt-0.5 text-[8px] text-white/28">Ask median {formatCurrency(summary?.medianAskEur, "EUR")} · low {formatCurrency(summary?.lowestAskEur, "EUR")}</p>
                </div>
                <div className="text-right text-[8px] text-white/28">
                  <span className="block font-semibold text-white/42">Showing {displayedListingCount} of {listingTotal}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatUpdatedAt(demand.updatedAt)}</span>
                </div>
              </div>
              {latestListings.length ? (
                <div
                  className={`grid gap-2 ${compact ? "" : showAllListings ? "sm:grid-cols-2 2xl:grid-cols-3" : "sm:grid-cols-2"} ${
                    showAllListings
                      ? "max-h-[min(55dvh,34rem)] overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(167,139,250,0.32)_transparent] [scrollbar-width:thin]"
                      : ""
                  }`}
                  data-ebay-listings-scroll={showAllListings ? "contained" : undefined}
                >
                  {latestListings.map((listing) => <LatestListing key={listing.itemId} listing={listing} />)}
                </div>
              ) : (
                <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-white/7 text-[9px] text-white/30">No current clean listings in this sample.</div>
              )}
              {listingsError ? <p className="mt-2 text-[9px] text-rose-200/60">{listingsError}</p> : null}
              {listingTotal > displayedListingCount || showAllListings ? (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-white/6 pt-2">
                  {!showAllListings ? (
                    <button
                      type="button"
                      onClick={openAllListings}
                      disabled={listingsLoading}
                      className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-violet-300/16 bg-violet-400/[0.07] px-3 text-[9px] font-bold text-violet-100/78 transition hover:bg-violet-400/[0.12] disabled:cursor-wait disabled:opacity-50"
                    >
                      {listingsLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                      View all {listingTotal} listings
                    </button>
                  ) : (
                    <>
                      {hasMoreListings ? (
                        <button
                          type="button"
                          onClick={loadMoreListings}
                          disabled={listingsLoading}
                          className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-violet-300/16 bg-violet-400/[0.07] px-3 text-[9px] font-bold text-violet-100/78 transition hover:bg-violet-400/[0.12] disabled:cursor-wait disabled:opacity-50"
                        >
                          {listingsLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                          Load next {Math.min(100, Math.max(0, listingTotal - loadedListings.length))}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowAllListings(false)}
                        className="min-h-8 rounded-lg border border-white/8 px-3 text-[9px] font-semibold text-white/44 transition hover:bg-white/[0.05] hover:text-white/70"
                      >
                        Collapse listings
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {error && payload ? <p className="mt-2 text-[9px] text-rose-200/58">Refresh failed: {error}</p> : null}
        <p className="mt-2 text-[8px] leading-3.5 text-white/24">
          Removed is an inventory-change estimate: a listing disappeared between observations and may have sold, ended, or been withdrawn. It is not a confirmed sale count.
        </p>
      </div>
    </section>
  );
}
