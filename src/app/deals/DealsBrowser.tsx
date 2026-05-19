"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Search,
  TrendingDown,
} from "lucide-react";
import type { ModalCardData } from "@/components/CardModal";
import { formatCurrency, type CurrencyCode } from "@/lib/format";
import { getExpansionHref } from "@/lib/games";

type DealMode = "raw" | "graded" | "sealed";
type BuyingMode = "fixed" | "auction" | "all";
type ConditionFilter =
  | "all"
  | "mint"
  | "near_mint"
  | "excellent"
  | "light_play"
  | "moderate_play"
  | "heavy_play"
  | "damaged"
  | "unknown";
type CardConditionCode = Exclude<ConditionFilter, "all">;
type DealSort = "deal" | "price_asc" | "condition_best" | "condition_worst" | "newest";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

interface DealReference {
  label: string;
  valueEur: number | null;
  source: string;
}

interface MatchedCard {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url?: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

interface CardMatchCandidate {
  card: MatchedCard;
  confidence: number;
  reason: string;
}

interface CardMatch {
  status: "matched" | "review" | "unmatched";
  confidence: number;
  reason: string;
  source: "auto" | "confirmed" | "ignored";
  card: MatchedCard | null;
  candidates: CardMatchCandidate[];
  isGradedListing: boolean;
  gradingCompany: string | null;
  gradingGrade: string | null;
}

interface ListingLanguage {
  code: "ENG" | "JPN" | "KOR" | "CHN" | "OTHER" | "UNKNOWN";
  label: string;
  confidence: "explicit" | "unconfirmed";
  reason: string;
}

interface ListingCardCondition {
  code: CardConditionCode;
  label: string;
  rank: number;
  confidence: "explicit" | "unconfirmed";
  reason: string;
}

interface DealListing {
  itemId: string;
  title: string;
  imageUrl: string | null;
  itemWebUrl: string;
  condition: string | null;
  cardCondition: ListingCardCondition;
  language: ListingLanguage;
  isGradedListing: boolean;
  gradingReason: string | null;
  buyingOptions: string[];
  price: {
    value: number;
    currency: string;
    valueEur: number | null;
  };
  shipping: {
    value: number | null;
    currency: string | null;
    valueEur: number | null;
  };
  total: {
    value: number;
    currency: string;
    valueEur: number | null;
  };
  seller: {
    username: string | null;
    feedbackPercentage: string | null;
    feedbackScore: number | null;
  };
  locationCountry: string | null;
  itemCreationDate: string | null;
  itemEndDate: string | null;
  discountPercent: number | null;
  differenceEur: number | null;
  dealScore: number | null;
  dealTone: "great" | "good" | "fair" | "high" | "unknown";
  reference: DealReference;
  cardMatch: CardMatch;
}

interface DealsResponse {
  configured: boolean;
  query: string;
  marketplaceId: string;
  deliveryCountry: string | null;
  buyingMode: BuyingMode;
  total: number;
  listings: DealListing[];
  directSearchUrl: string;
  reference: DealReference;
  mode: DealMode;
  card: {
    id: string;
    name: string;
    card_number: string | null;
    image_url: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
    };
    has_saved_grade: boolean;
  } | null;
  sealedProduct: {
    id: string;
    name: string;
    image_url: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
    };
  } | null;
  error?: string;
}

interface EbayRateLimitRate {
  count: number | null;
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  timeWindow: number | null;
}

interface EbayRateLimitStatus {
  configured: boolean;
  apiContext: string;
  apiName: string;
  marketplaceId: string;
  resources: Array<{
    name: string;
    rates: EbayRateLimitRate[];
  }>;
  summary: (EbayRateLimitRate & {
    apiContext: string;
    apiName: string;
    resourceName: string;
  }) | null;
  refreshedAt: string;
  error?: string;
}

interface CardSearchResult {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
}

const DEFAULT_RESPONSE: DealsResponse = {
  configured: false,
  query: "",
  marketplaceId: "EBAY_NL",
  deliveryCountry: "NL",
  buyingMode: "fixed",
  total: 0,
  listings: [],
  directSearchUrl: "https://www.ebay.nl/sch/i.html?_sacat=183454",
  reference: {
    label: "No DustyCards price",
    valueEur: null,
    source: "none",
  },
  mode: "raw",
  card: null,
  sealedProduct: null,
};

const CONDITION_OPTIONS: Array<{ value: ConditionFilter; label: string }> = [
  { value: "all", label: "All conditions" },
  { value: "mint", label: "Mint" },
  { value: "near_mint", label: "NM" },
  { value: "excellent", label: "EX" },
  { value: "light_play", label: "LP" },
  { value: "moderate_play", label: "MP" },
  { value: "heavy_play", label: "HP" },
  { value: "damaged", label: "DMG" },
  { value: "unknown", label: "Unknown" },
];

const SORT_OPTIONS: Array<{ value: DealSort; label: string }> = [
  { value: "deal", label: "Best deal" },
  { value: "price_asc", label: "Lowest price" },
  { value: "condition_best", label: "Best condition" },
  { value: "condition_worst", label: "Worst condition" },
  { value: "newest", label: "Newest" },
];

function formatMaybeCurrency(value: number | null | undefined, currency: string | null): string {
  if (value == null) return "--";
  if (currency === "EUR" || currency === "USD") {
    return formatCurrency(value, currency as CurrencyCode);
  }

  return `${value.toFixed(2)} ${currency ?? ""}`.trim();
}

function formatPercent(value: number | null): string {
  if (value == null) return "--";
  return `${value >= 0 ? "-" : "+"}${Math.abs(value).toFixed(1)}%`;
}

function formatInteger(value: number | null | undefined): string {
  return value == null ? "--" : value.toLocaleString("en-US");
}

function formatResetTime(value: string | null | undefined): string {
  if (!value) return "Reset unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Reset unknown";

  return `Reset ${date.toLocaleString("nl-NL", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  })}`;
}

function rateLimitToneClass(status: EbayRateLimitStatus | null): string {
  const remaining = status?.summary?.remaining;
  const limit = status?.summary?.limit;
  if (remaining == null || limit == null || limit <= 0) {
    return "border-gray-400/14 bg-gray-400/[0.06]";
  }

  const ratio = remaining / limit;
  if (ratio <= 0.1) return "border-rose-400/14 bg-rose-400/[0.08]";
  if (ratio <= 0.25) return "border-amber-400/14 bg-amber-400/[0.08]";
  return "border-emerald-400/14 bg-emerald-400/[0.06]";
}

function dealToneClass(tone: DealListing["dealTone"]): string {
  if (tone === "great") return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200";
  if (tone === "good") return "border-lime-400/20 bg-lime-400/[0.08] text-lime-700 dark:text-lime-200";
  if (tone === "fair") return "border-sky-400/18 bg-sky-400/[0.07] text-sky-700 dark:text-sky-200";
  if (tone === "high") return "border-rose-400/18 bg-rose-400/[0.07] text-rose-700 dark:text-rose-200";
  return "border-black/8 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/55";
}

function matchBadgeClass(match: CardMatch): string {
  if (match.status === "matched") {
    return "border-emerald-400/20 bg-emerald-400/[0.1] text-emerald-700 dark:text-emerald-200";
  }
  if (match.status === "review") {
    return "border-amber-400/22 bg-amber-400/[0.1] text-amber-700 dark:text-amber-100";
  }
  return "border-black/8 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/55";
}

function matchLabel(match: CardMatch): string {
  if (match.source === "ignored") return "Ignored";
  if (match.status === "matched" && match.card) {
    return `Matched: ${match.card.name}${match.card.card_number ? ` #${match.card.card_number}` : ""}`;
  }
  if (match.status === "review") return "Review match";
  return "No card match";
}

function languageBadgeClass(language: ListingLanguage): string {
  if (language.code === "ENG") {
    return "border-emerald-400/22 bg-emerald-400/[0.11] text-emerald-700 dark:text-emerald-200";
  }

  if (language.code === "UNKNOWN") {
    return "border-amber-400/22 bg-amber-400/[0.1] text-amber-700 dark:text-amber-100";
  }

  return "border-rose-400/20 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200";
}

function conditionBadgeClass(condition: ListingCardCondition): string {
  if (condition.code === "unknown") {
    return "border-gray-400/20 bg-gray-400/[0.09] text-gray-600 dark:text-white/55";
  }

  if (condition.rank >= 6) {
    return "border-emerald-400/22 bg-emerald-400/[0.11] text-emerald-700 dark:text-emerald-200";
  }

  if (condition.rank >= 4) {
    return "border-sky-400/22 bg-sky-400/[0.1] text-sky-700 dark:text-sky-100";
  }

  if (condition.rank >= 2) {
    return "border-amber-400/22 bg-amber-400/[0.1] text-amber-700 dark:text-amber-100";
  }

  return "border-rose-400/20 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200";
}

function parseConditionFilter(value: string | null): ConditionFilter {
  return CONDITION_OPTIONS.some((option) => option.value === value)
    ? (value as ConditionFilter)
    : "all";
}

function parseDealSort(value: string | null): DealSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as DealSort) : "deal";
}

function getDefaultBuyingMode(mode: DealMode): BuyingMode {
  return mode === "sealed" ? "all" : "fixed";
}

function buildDealsHref(input: {
  pathname: string;
  q: string;
  cardId: string | null;
  productId: string | null;
  mode: DealMode;
  buying: BuyingMode;
  condition: ConditionFilter;
  sort: DealSort;
}) {
  const params = new URLSearchParams();
  const trimmedQuery = input.q.trim();
  if (input.cardId) params.set("cardId", input.cardId);
  if (input.productId) params.set("productId", input.productId);
  if (trimmedQuery && !input.cardId && !input.productId) params.set("q", trimmedQuery);
  if (input.mode !== "raw") params.set("mode", input.mode);
  if (input.buying !== getDefaultBuyingMode(input.mode)) params.set("buying", input.buying);
  if (input.condition !== "all") params.set("condition", input.condition);
  if (input.sort !== "deal") params.set("sort", input.sort);
  const query = params.toString();
  return query ? `${input.pathname}?${query}` : input.pathname;
}

function compareDealListings(a: DealListing, b: DealListing, sort: DealSort): number {
  if (sort === "price_asc") {
    return (a.total.valueEur ?? a.total.value) - (b.total.valueEur ?? b.total.value);
  }

  if (sort === "condition_best" || sort === "condition_worst") {
    const direction = sort === "condition_best" ? -1 : 1;
    const conditionDiff = (a.cardCondition.rank - b.cardCondition.rank) * direction;
    if (conditionDiff !== 0) return conditionDiff;
    return (a.total.valueEur ?? a.total.value) - (b.total.valueEur ?? b.total.value);
  }

  if (sort === "newest") {
    const aTime = a.itemCreationDate ? Date.parse(a.itemCreationDate) : 0;
    const bTime = b.itemCreationDate ? Date.parse(b.itemCreationDate) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return (a.total.valueEur ?? a.total.value) - (b.total.valueEur ?? b.total.value);
  }

  const aScore = a.dealScore ?? Number.NEGATIVE_INFINITY;
  const bScore = b.dealScore ?? Number.NEGATIVE_INFINITY;
  if (aScore !== bScore) return bScore - aScore;
  return (a.total.valueEur ?? a.total.value) - (b.total.valueEur ?? b.total.value);
}

function ResultSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-48 animate-pulse rounded-2xl border border-black/8 bg-black/[0.035] dark:border-white/8 dark:bg-white/[0.045]"
        />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  marketplaceId,
  busy,
  onConfirmMatch,
  onIgnoreMatch,
  onResetMatch,
  onOpenCard,
}: {
  listing: DealListing;
  marketplaceId: string;
  busy: boolean;
  onConfirmMatch: (listing: DealListing, cardId: string) => Promise<void>;
  onIgnoreMatch: (listing: DealListing) => Promise<void>;
  onResetMatch: (listing: DealListing) => Promise<void>;
  onOpenCard: (cardId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cardQuery, setCardQuery] = useState(
    listing.cardMatch.card?.name ?? listing.title.replace(/\bpokemon\b/gi, "").slice(0, 80)
  );
  const [cardResults, setCardResults] = useState<CardSearchResult[]>([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [cardSearchError, setCardSearchError] = useState<string | null>(null);
  const totalEur = listing.total.valueEur;
  const rawTotal = formatMaybeCurrency(listing.total.value, listing.total.currency);
  const totalLabel =
    totalEur != null ? formatCurrency(totalEur, "EUR") : rawTotal;
  const reference = listing.reference;
  const shippingLabel =
    listing.shipping.value == null
      ? "Shipping unknown"
      : `Ship ${formatMaybeCurrency(
          listing.shipping.valueEur ?? listing.shipping.value,
          listing.shipping.valueEur != null ? "EUR" : listing.shipping.currency
        )}`;
  const match = listing.cardMatch;
  const language = listing.language;
  const cardCondition = listing.cardCondition;
  const hasOverride = match.source === "confirmed" || match.source === "ignored";

  useEffect(() => {
    if (!pickerOpen) return;

    const trimmed = cardQuery.trim();
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setCardSearchLoading(true);
      setCardSearchError(null);
      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const payload = (await response.json()) as {
            singles?: CardSearchResult[];
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error ?? "Could not search cards");
          }
          setCardResults((payload.singles ?? []).slice(0, 6));
        } catch (caught) {
          if (caught instanceof Error && caught.name === "AbortError") return;
          setCardSearchError(caught instanceof Error ? caught.message : "Could not search cards");
        } finally {
          setCardSearchLoading(false);
        }
      })();
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cardQuery, pickerOpen]);

  return (
    <article className="binder-panel grid min-w-0 gap-3 rounded-2xl p-3 sm:grid-cols-[96px_minmax(0,1fr)]">
      <a
        href={listing.itemWebUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative aspect-square overflow-hidden rounded-xl border border-white/8 bg-black/24"
      >
        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/35">
            eBay
          </div>
        )}
      </a>

      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={listing.itemWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors hover:text-emerald-200"
            >
              {listing.title}
            </a>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-medium text-white/45">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-bold ${languageBadgeClass(
                  language
                )}`}
                title={language.reason}
              >
                {language.label}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-bold ${conditionBadgeClass(
                  cardCondition
                )}`}
                title={cardCondition.reason}
              >
                {cardCondition.label}
              </span>
              {listing.isGradedListing && (
                <span
                  className="inline-flex items-center rounded-full border border-violet-400/20 bg-violet-400/[0.1] px-2 py-0.5 font-bold text-violet-100"
                  title={listing.gradingReason ?? "Graded-looking listing"}
                >
                  Graded
                </span>
              )}
              {listing.condition && <span>{listing.condition}</span>}
              {listing.locationCountry && <span>{listing.locationCountry}</span>}
              <span>{listing.buyingOptions.join(" / ") || "Listing"}</span>
              <span>{marketplaceId}</span>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${dealToneClass(
              listing.dealTone
            )}`}
          >
            {formatPercent(listing.discountPercent)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${matchBadgeClass(
              match
            )}`}
            title={match.reason}
          >
            {match.status === "matched" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{matchLabel(match)}</span>
          </span>
          <span className="text-[11px] font-semibold text-white/35">
            {match.confidence > 0 ? `${match.confidence}%` : "--"}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Total
            </p>
            <p className="mt-1 text-base font-bold tabular-nums text-white">
              {totalLabel}
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Versus
            </p>
            <p className="mt-1 text-base font-bold tabular-nums text-white">
              {listing.differenceEur == null
                ? "--"
                : `${listing.differenceEur >= 0 ? "+" : "-"}${formatCurrency(
                    Math.abs(listing.differenceEur),
                    "EUR"
                  )}`}
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Base
            </p>
            <p className="mt-1 truncate text-base font-bold tabular-nums text-white">
              {formatCurrency(reference.valueEur, "EUR")}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-xs font-medium text-white/42">
            {shippingLabel}
            {listing.seller.username ? ` / ${listing.seller.username}` : ""}
            {listing.seller.feedbackPercentage ? ` / ${listing.seller.feedbackPercentage}%` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {match.card && (
              <button
                type="button"
                onClick={() => onOpenCard(match.card!.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05]"
              >
                DustyCards
              </button>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen((current) => !current)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05]"
            >
              Change
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onIgnoreMatch(listing)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
            >
              Ignore
            </button>
            {hasOverride && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onResetMatch(listing)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
                title="Reset manual match"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <a
              href={listing.itemWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-950 transition-colors hover:bg-white/86"
            >
              Open
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {pickerOpen && (
          <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.04] px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
              <input
                value={cardQuery}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setCardQuery(nextQuery);
                  if (nextQuery.trim().length < 2) {
                    setCardResults([]);
                  }
                }}
                className="h-full min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder:text-white/35"
                placeholder="Search DustyCards card"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="mt-2 grid gap-1.5">
              {cardSearchLoading && (
                <p className="px-2 py-1 text-xs font-semibold text-white/35">
                  Searching...
                </p>
              )}
              {cardSearchError && (
                <p className="px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-200">
                  {cardSearchError}
                </p>
              )}
              {!cardSearchLoading &&
                cardResults.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onConfirmMatch(listing, card.id).then(() => setPickerOpen(false));
                    }}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-xs font-semibold transition-colors hover:bg-white/[0.055] disabled:cursor-wait disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-white">
                        {card.name}
                        {card.card_number ? ` #${card.card_number}` : ""}
                      </span>
                      <span className="block truncate text-white/42">
                        {card.episode_name}
                        {card.episode_code ? ` / ${card.episode_code}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-white/35">Use</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default function DealsBrowser() {
  const router = useRouter();
  const pathname = usePathname() ?? "/deals";
  const searchParams = useSearchParams();
  const cardId = searchParams.get("cardId");
  const productId = searchParams.get("productId");
  const paramQuery = cardId || productId ? "" : (searchParams.get("q") ?? "");
  const modeParam = searchParams.get("mode");
  const paramMode: DealMode =
    productId ? "sealed" : modeParam === "graded" || modeParam === "sealed" ? modeParam : "raw";
  const buyingParam = searchParams.get("buying");
  const paramBuying =
    buyingParam === "fixed" || buyingParam === "auction" || buyingParam === "all"
      ? buyingParam
      : getDefaultBuyingMode(paramMode);
  const paramCondition = parseConditionFilter(searchParams.get("condition"));
  const paramSort = parseDealSort(searchParams.get("sort"));
  const [query, setQuery] = useState(paramQuery);
  const [mode, setMode] = useState<DealMode>(paramMode);
  const [buying, setBuying] = useState<BuyingMode>(paramBuying);
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>(paramCondition);
  const [sort, setSort] = useState<DealSort>(paramSort);
  const [data, setData] = useState<DealsResponse>(DEFAULT_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedConfig, setHasLoadedConfig] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [suggestedCards, setSuggestedCards] = useState<CardSearchResult[]>([]);
  const [suggestionsQuery, setSuggestionsQuery] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<EbayRateLimitStatus | null>(null);
  const [rateLimitLoading, setRateLimitLoading] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [overrideBusyItemId, setOverrideBusyItemId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasSearch = Boolean(paramQuery.trim() || cardId || productId);

  const requestPath = useMemo(() => {
    if (!hasSearch) return null;

    const params = new URLSearchParams();
    if (paramQuery.trim()) params.set("q", paramQuery.trim());
    if (cardId) params.set("cardId", cardId);
    if (productId) params.set("productId", productId);
    if (paramMode !== "raw") params.set("mode", paramMode);
    if (paramBuying !== getDefaultBuyingMode(paramMode)) params.set("buying", paramBuying);
    if (refreshNonce > 0) params.set("_r", String(refreshNonce));
    return `/api/ebay/deals?${params.toString()}`;
  }, [cardId, hasSearch, paramBuying, paramMode, paramQuery, productId, refreshNonce]);

  useEffect(() => {
    if (!requestPath) {
      abortRef.current?.abort();
      const resetTimer = window.setTimeout(() => {
        setData(DEFAULT_RESPONSE);
        setError(null);
        setLoading(false);
        setHasLoadedConfig(false);
      }, 0);

      return () => window.clearTimeout(resetTimer);
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const startTimer = window.setTimeout(() => {
      if (abortRef.current !== controller) return;
      setLoading(true);
      setError(null);
    }, 0);

    void (async () => {
      try {
        const response = await fetch(requestPath, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as DealsResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load eBay deals");
        }
        if (abortRef.current === controller) {
          setData(payload);
          setHasLoadedConfig(true);
        }
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        if (abortRef.current === controller) {
          setError(caught instanceof Error ? caught.message : "Could not load eBay deals");
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    })();

    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
    };
  }, [requestPath]);

  useEffect(() => {
    const controller = new AbortController();
    const startTimer = window.setTimeout(() => {
      setRateLimitLoading(true);
      setRateLimitError(null);
    }, 0);

    void (async () => {
      try {
        const response = await fetch("/api/ebay/rate-limit", {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as EbayRateLimitStatus & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load eBay API limit");
        }
        setRateLimit(payload);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setRateLimit(null);
        setRateLimitError(
          caught instanceof Error ? caught.message : "Could not load eBay API limit"
        );
      } finally {
        if (!controller.signal.aborted) {
          setRateLimitLoading(false);
        }
      }
    })();

    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (mode === "sealed" || trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      setSuggestionsError(null);
      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const payload = (await response.json()) as {
            singles?: CardSearchResult[];
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error ?? "Could not search cards");
          }
          if (active) {
            setSuggestionsQuery(trimmed);
            setSuggestedCards((payload.singles ?? []).slice(0, 8));
          }
        } catch (caught) {
          if (caught instanceof Error && caught.name === "AbortError") return;
          if (active) {
            setSuggestedCards([]);
            setSuggestionsError(caught instanceof Error ? caught.message : "Could not search cards");
          }
        } finally {
          if (active) {
            setSuggestionsLoading(false);
          }
        }
      })();
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    const nextCardId = nextQuery ? null : cardId;
    const nextProductId = nextQuery ? null : productId;
    setQuery(nextQuery);
    router.replace(
      buildDealsHref({
        pathname,
        q: nextQuery,
        cardId: nextCardId,
        productId: nextProductId,
        mode,
        buying,
        condition: conditionFilter,
        sort,
      })
    );
  }

  function searchSuggestedCard(cardToSearch: CardSearchResult) {
    const nextQuery = mode === "graded" ? cardToSearch.name : "";
    const nextCardId = mode === "graded" ? null : cardToSearch.id;
    setQuery(nextQuery);
    router.replace(
      buildDealsHref({
        pathname,
        q: nextQuery,
        cardId: nextCardId,
        productId: null,
        mode,
        buying,
        condition: conditionFilter,
        sort,
      })
    );
  }

  async function saveListingOverride(input: {
    listing: DealListing;
    status: "confirmed" | "ignored";
    cardId?: string;
  }) {
    setOverrideBusyItemId(input.listing.itemId);
    try {
      const response = await fetch("/api/ebay/listing-card-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplaceId: data.marketplaceId,
          itemId: input.listing.itemId,
          title: input.listing.title,
          status: input.status,
          cardId: input.cardId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save match");
      }
      setRefreshNonce((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save match");
    } finally {
      setOverrideBusyItemId(null);
    }
  }

  async function resetListingOverride(listing: DealListing) {
    setOverrideBusyItemId(listing.itemId);
    try {
      const response = await fetch("/api/ebay/listing-card-match", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplaceId: data.marketplaceId,
          itemId: listing.itemId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not reset match");
      }
      setRefreshNonce((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset match");
    } finally {
      setOverrideBusyItemId(null);
    }
  }

  async function openCardDetail(cardIdToOpen: string) {
    setLoadingCardId(cardIdToOpen);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardIdToOpen)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ModalCardData & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load card details");
      }
      setSelectedCard(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load card details");
    } finally {
      setLoadingCardId((current) => (current === cardIdToOpen ? null : current));
    }
  }

  const visibleListings = useMemo(() => {
    return [...data.listings]
      .filter(
        (listing) =>
          data.mode === "sealed" ||
          conditionFilter === "all" || listing.cardCondition.code === conditionFilter
      )
      .sort((a, b) => compareDealListings(a, b, sort));
  }, [conditionFilter, data.listings, data.mode, sort]);
  const visibleData = useMemo(
    () => ({
      ...data,
      listings: visibleListings,
      total: visibleListings.length,
    }),
    [data, visibleListings]
  );
  const exactCardSuggestions = useMemo(
    () =>
      mode !== "sealed" && suggestionsQuery === query.trim()
        ? suggestedCards.filter((card) => card.id !== visibleData.card?.id)
        : [],
    [mode, query, suggestedCards, suggestionsQuery, visibleData.card?.id]
  );
  const visibleLoading = hasSearch && loading;
  const visibleError = hasSearch ? error : null;
  const bestListing = visibleData.listings[0] ?? null;
  const referenceLabel =
    visibleData.reference.valueEur != null
      ? `${visibleData.reference.label} ${formatCurrency(visibleData.reference.valueEur, "EUR")}`
      : visibleData.reference.label;

  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex w-full flex-col gap-3 sm:gap-5">
        <section className="binder-panel rounded-2xl px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] xl:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                Market scan
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                eBay Deals
              </h1>
              {referenceLabel !== "No DustyCards price" && (
                <p className="mt-2 text-sm font-semibold text-white/45">
                  Reference: {referenceLabel}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-emerald-400/14 bg-emerald-400/[0.06] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/65">
                  Best
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {bestListing?.total.valueEur != null
                    ? formatCurrency(bestListing.total.valueEur, "EUR")
                    : "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-sky-400/14 bg-sky-400/[0.06] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/65">
                  Delta
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {bestListing?.discountPercent != null
                    ? formatPercent(bestListing.discountPercent)
                    : "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-violet-400/14 bg-violet-400/[0.06] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200/65">
                  Listings
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {visibleData.listings.length.toLocaleString("en-US")}
                </p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${rateLimitToneClass(rateLimit)}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                  eBay API left
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {rateLimitLoading ? "--" : formatInteger(rateLimit?.summary?.remaining)}
                </p>
                <p className="mt-1 truncate text-[11px] font-semibold text-white/45">
                  {rateLimitError
                    ? "Limit unavailable"
                    : rateLimit?.configured === false
                      ? "Keys missing"
                      : rateLimit?.summary?.limit != null
                        ? `of ${formatInteger(rateLimit.summary.limit)} / ${formatResetTime(
                            rateLimit.summary.reset
                          )}`
                        : "Limit unknown"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <form
          onSubmit={submitSearch}
          className="binder-panel rounded-2xl p-2.5"
        >
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex min-h-[46px] min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3">
              <Search className="h-4 w-4 shrink-0 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={visibleData.query || (mode === "sealed" ? "Pokemon sealed product" : "Pokemon card")}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/35"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <button
              type="submit"
              className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-gray-950 transition-colors hover:bg-white/86"
            >
              Search
            </button>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Type
              </span>
              <select
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value as DealMode;
                  setMode(nextMode);
                  if (buying === getDefaultBuyingMode(mode)) {
                    setBuying(getDefaultBuyingMode(nextMode));
                  }
                }}
                className="min-h-[40px] w-full rounded-xl border border-white/8 bg-black/20 px-3 text-sm font-semibold text-white outline-none"
              >
                <option value="raw">Raw</option>
                <option value="graded">Graded</option>
                <option value="sealed">Sealed</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Buying
              </span>
              <select
                value={buying}
                onChange={(event) => setBuying(event.target.value as BuyingMode)}
                className="min-h-[40px] w-full rounded-xl border border-white/8 bg-black/20 px-3 text-sm font-semibold text-white outline-none"
              >
                <option value="fixed">Buy It Now</option>
                <option value="auction">Auctions</option>
                <option value="all">All</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Condition
              </span>
              <select
                value={conditionFilter}
                onChange={(event) => setConditionFilter(event.target.value as ConditionFilter)}
                className="min-h-[40px] w-full rounded-xl border border-white/8 bg-black/20 px-3 text-sm font-semibold text-white outline-none"
                title="Filter offers by detected card condition"
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Sort
              </span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as DealSort)}
                className="min-h-[40px] w-full rounded-xl border border-white/8 bg-black/20 px-3 text-sm font-semibold text-white outline-none"
                title="Sort offers"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>

        {mode !== "sealed" && (query.trim().length >= 2 || suggestionsLoading) && (
          <section className="binder-panel rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white">
                DustyCards kaarten
              </h2>
              {suggestionsLoading && (
                <span className="text-xs font-semibold text-white/35">
                  Searching...
                </span>
              )}
            </div>
            {suggestionsError ? (
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-200">
                {suggestionsError}
              </p>
            ) : exactCardSuggestions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {exactCardSuggestions.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => searchSuggestedCard(card)}
                    className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-2 text-left transition-colors hover:bg-white/[0.055]"
                  >
                    {card.image_url ? (
                        <span className="relative aspect-[63/88] w-11 overflow-hidden rounded-md bg-black/24">
                        <Image
                          src={card.image_url}
                          alt={card.name}
                          fill
                          sizes="44px"
                          className="object-contain"
                          unoptimized
                        />
                      </span>
                    ) : (
                      <span className="flex aspect-[63/88] w-11 items-center justify-center rounded-md bg-black/24 text-[10px] font-semibold text-white/35">
                        Card
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">
                        {card.name}
                        {card.card_number ? ` #${card.card_number}` : ""}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-white/42">
                        {card.episode_name}
                        {card.episode_code ? ` / ${card.episode_code}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-gray-950">
                      {mode === "graded" ? "Search" : "Exact"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              !suggestionsLoading && (
                <p className="text-xs font-semibold text-white/42">
                  Geen databasekaarten gevonden.
                </p>
              )
            )}
          </section>
        )}

        {visibleData.card && (
          <section className="binder-panel grid gap-3 rounded-2xl p-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
            {visibleData.card.image_url ? (
              <div className="relative aspect-[63/88] w-16 overflow-hidden rounded-lg bg-black/24">
                <Image
                  src={visibleData.card.image_url}
                  alt={visibleData.card.name}
                  fill
                  sizes="72px"
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex aspect-[63/88] w-16 items-center justify-center rounded-lg bg-black/24 text-xs text-white/35">
                Card
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {visibleData.card.name}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-white/45">
                {visibleData.card.episode.name}
                {visibleData.card.card_number ? ` / #${visibleData.card.card_number}` : ""}
              </p>
            </div>
            <Link
              href={`/search?q=${encodeURIComponent(visibleData.card.name)}`}
              prefetch={false}
              className="inline-flex justify-center rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05]"
            >
              DustyCards
            </Link>
          </section>
        )}

        {visibleData.sealedProduct && (
          <section className="binder-panel grid gap-3 rounded-2xl p-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
            {visibleData.sealedProduct.image_url ? (
              <div className="relative aspect-square w-16 overflow-hidden rounded-lg bg-black/24">
                <Image
                  src={visibleData.sealedProduct.image_url}
                  alt={visibleData.sealedProduct.name}
                  fill
                  sizes="72px"
                  className="object-contain p-1"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex aspect-square w-16 items-center justify-center rounded-lg bg-black/24 text-xs text-white/35">
                Sealed
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {visibleData.sealedProduct.name}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-white/45">
                {visibleData.sealedProduct.episode.name}
                {visibleData.sealedProduct.episode.code
                  ? ` / ${visibleData.sealedProduct.episode.code}`
                  : ""}
              </p>
            </div>
            <Link
              href={`${getExpansionHref(visibleData.sealedProduct.episode.id)}?tab=sealed`}
              prefetch={false}
              className="inline-flex justify-center rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05]"
            >
              DustyCards
            </Link>
          </section>
        )}

        {hasLoadedConfig && !visibleData.configured && (
          <section className="rounded-2xl border border-amber-400/18 bg-amber-400/[0.08] p-4 text-sm font-medium text-amber-900 dark:text-amber-100">
            eBay API keys missing. Add `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` to `.env`, then create a Production keyset in the eBay developer portal.
            {visibleData.directSearchUrl && (
              <a
                href={visibleData.directSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex font-bold underline underline-offset-2"
              >
                Open eBay search
              </a>
            )}
          </section>
        )}

        {visibleError && (
          <section className="rounded-2xl border border-rose-400/18 bg-rose-400/[0.08] p-4 text-sm font-medium text-rose-800 dark:text-rose-100">
            {visibleError}
          </section>
        )}

        {visibleLoading ? (
          <ResultSkeleton />
        ) : visibleData.listings.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-white">Listings</h2>
              <a
                href={visibleData.directSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-xs font-semibold text-white/68 transition-colors hover:bg-white/[0.05]"
              >
                eBay
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {visibleData.listings.map((listing, index) => (
                <ListingCard
                  key={`${listing.itemId}-${index}`}
                  listing={listing}
                  marketplaceId={visibleData.marketplaceId}
                  busy={
                    overrideBusyItemId === listing.itemId ||
                    (listing.cardMatch.card ? loadingCardId === listing.cardMatch.card.id : false)
                  }
                  onConfirmMatch={(targetListing, targetCardId) =>
                    saveListingOverride({
                      listing: targetListing,
                      status: "confirmed",
                      cardId: targetCardId,
                    })
                  }
                  onIgnoreMatch={(targetListing) =>
                    saveListingOverride({ listing: targetListing, status: "ignored" })
                  }
                  onResetMatch={resetListingOverride}
                  onOpenCard={(targetCardId) => void openCardDetail(targetCardId)}
                />
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-6 text-sm font-medium text-white/45">
            {data.listings.length > 0
              ? "No offers match these filters."
              : paramQuery.trim() || cardId || productId
                ? "No eBay listings loaded."
                : "No search yet."}
          </section>
        )}

        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/45">
            <TrendingDown className="h-4 w-4" />
            <span>Reference: {visibleData.reference.label}</span>
            <span>/</span>
            <span>Shipping is included when eBay returns it.</span>
          </div>
        </section>
      </div>
      {selectedCard && (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
