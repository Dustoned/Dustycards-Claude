"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, LineChart, Package, RefreshCw } from "lucide-react";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { DETAIL_MARKET_LINK_CLASS } from "@/components/detail-market-link-style";
import { buildSealedEbaySearchUrl } from "@/lib/ebay-search-url";
import { getExpansionHref } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { SealedMarketHistorySeriesKey } from "@/lib/price-history";
import { formatCurrency } from "./utils";
import type { SealedDetailResponse, SealedFeaturedCard } from "./types";

const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  ssr: false,
  loading: () => null,
});

interface SectionShellProps {
  eyebrow?: string;
  title?: string;
  description?: string | null;
  children: ReactNode;
  className?: string;
}

interface MetricTileProps {
  label: string;
  value: ReactNode;
  hint?: string | null;
  accent?: "emerald" | "amber" | "blue" | "slate";
  className?: string;
}

interface MarketRowProps {
  label: string;
  value: ReactNode;
  hint?: string | null;
}

interface PriceMetric {
  label: string;
  value: string;
  hint?: string | null;
}

type PricingAccent = NonNullable<MetricTileProps["accent"]>;
type PriceStatusTone = "good" | "warning" | "danger" | "neutral";

interface HistoryPointView {
  date: string;
  label: string;
  value: number | null;
}

const SHORT_STATUS_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const RELEASE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatSealedReleaseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : RELEASE_DATE_FORMATTER.format(date);
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: SectionShellProps) {
  return (
    <section className={`card-modal-section rounded-[24px] border border-white/10 bg-white/[0.055] p-4 sm:p-6 max-[640px]:rounded-2xl max-[640px]:p-3 ${className}`}>
      {(eyebrow || title || description) && (
        <div className="mb-4 space-y-1.5 max-[640px]:mb-3">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40 max-[640px]:text-[10px] max-[640px]:tracking-[0.14em]">
              {eyebrow}
            </p>
          )}
          {title && <h3 className="text-xl font-semibold text-white max-[640px]:text-base">{title}</h3>}
          {description && <p className="text-base text-white/48 max-[640px]:text-sm">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent = "slate",
  className = "",
}: MetricTileProps) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-400/16 bg-emerald-400/[0.08]"
      : accent === "amber"
        ? "border-amber-400/16 bg-amber-400/[0.08]"
        : accent === "blue"
          ? "border-blue-400/16 bg-blue-400/[0.08]"
          : "border-white/10 bg-black/22";

  return (
    <div className={`card-modal-metric min-w-0 rounded-2xl border px-4 py-4 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-3 ${accentClass} ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/38 max-[640px]:text-[10px]">{label}</p>
      <p className="mt-2.5 break-words text-xl font-semibold tabular-nums text-white max-[640px]:mt-1.5 max-[640px]:text-lg">{value}</p>
      {hint && <p className="mt-1.5 text-sm text-white/42 max-[640px]:text-xs">{hint}</p>}
    </div>
  );
}

function MarketRow({ label, value, hint }: MarketRowProps) {
  return (
    <div className="card-modal-market-row flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36 max-[640px]:text-[10px]">{label}</p>
        {hint && <p className="mt-1 text-sm text-white/40 max-[640px]:text-xs">{hint}</p>}
      </div>
      <p className="min-w-0 break-words text-right text-lg font-semibold tabular-nums text-white max-[640px]:text-base">
        {value}
      </p>
    </div>
  );
}

function MetaPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`card-modal-meta-pill inline-flex min-h-0 items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-medium leading-none text-white/68 max-[640px]:px-2 max-[640px]:py-0.5 max-[640px]:text-[10px] ${className}`}
    >
      {children}
    </span>
  );
}

function CompactDetailLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onClick}
      className="group inline-flex max-w-full items-center gap-0.5 rounded-full border border-sky-300/16 bg-sky-300/[0.06] px-1.5 py-0.5 text-[11px] text-sky-100 transition-colors hover:border-sky-200/32 hover:bg-sky-300/[0.1] hover:text-white"
    >
      <span className="min-w-0 truncate">{children}</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-sky-100/64 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
    </Link>
  );
}

function buildCollectionProduct(product: SealedDetailResponse) {
  return {
    id: product.id,
    name: product.name,
    image_url: product.image_url,
    episode: product.episode,
  };
}

function parseDateMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatShortStatusDate(value: string | null | undefined): string | null {
  const timestamp = parseDateMillis(value);
  if (timestamp == null) return null;
  return SHORT_STATUS_DATE_FORMATTER.format(timestamp);
}

function formatRelativeStatusAge(value: string | null | undefined, now: number): string | null {
  const timestamp = parseDateMillis(value);
  if (timestamp == null) return null;

  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

function getPriceStatusToneClass(tone: PriceStatusTone): string {
  if (tone === "good") return "text-emerald-300";
  if (tone === "warning") return "text-amber-300";
  if (tone === "danger") return "text-rose-300";
  return "text-white/72";
}

function PriceStatusInlineItem({
  value,
  title,
  tone = "neutral",
}: {
  value: string;
  title: string;
  tone?: PriceStatusTone;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center text-[11px] font-semibold leading-none tabular-nums max-[640px]:text-[10px] ${getPriceStatusToneClass(
        tone
      )}`}
      title={title}
    >
      {value}
    </span>
  );
}

function getSealedCurrentPriceCoverage(product: SealedDetailResponse) {
  const values = [
    product.price.cm_lowest,
    product.price.cm_lowest_eu,
    product.price.cm_lowest_de,
    product.price.cm_lowest_fr,
    product.price.cm_lowest_es,
    product.price.cm_lowest_it,
  ];

  return {
    currentCount: values.filter((value) => value != null).length,
    totalCount: values.length,
  };
}

function SealedPriceStatusLine({
  product,
  chartPoints,
}: {
  product: SealedDetailResponse;
  chartPoints: HistoryPointView[];
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const latestPriceAge = formatRelativeStatusAge(product.price_fetched_at, now);
  const compactLatestPriceAge = latestPriceAge?.replace(/\s+ago$/, "") ?? null;
  const latestPriceLabel = formatShortStatusDate(product.price_fetched_at);
  const historySyncedLabel = formatShortStatusDate(product.history_synced_at);
  const coverage = getSealedCurrentPriceCoverage(product);
  const hasSource = Boolean(product.cardmarket_url || product.cardmarket_id || product.tcggo_url);
  const sourceTone: PriceStatusTone = hasSource
    ? product.price_fetched_at
      ? "good"
      : "warning"
    : "danger";
  const coverageTone: PriceStatusTone =
    coverage.currentCount === 0
      ? "warning"
      : coverage.currentCount >= Math.ceil(coverage.totalCount / 2)
        ? "good"
        : "neutral";
  const historyTone: PriceStatusTone = chartPoints.some((point) => point.value != null)
    ? "neutral"
    : "warning";

  return (
    <div className="min-w-0 border-b border-white/8 pb-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-none text-white/28 max-[640px]:gap-x-1 max-[640px]:text-[10px]">
        <PriceStatusInlineItem
          value={compactLatestPriceAge ? `Price ${compactLatestPriceAge}` : "No price"}
          title={`Latest price: ${latestPriceAge ?? "No price"}. ${
            latestPriceLabel ?? "No source check yet"
          }`}
          tone={product.price_fetched_at ? "good" : "warning"}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={hasSource ? "CardMarket" : "No source"}
          title={
            hasSource
              ? "Source: CardMarket sealed data"
              : "Source: no CardMarket or TCGGO link stored"
          }
          tone={sourceTone}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={`${coverage.currentCount}/${coverage.totalCount}`}
          title={`Data: ${coverage.currentCount}/${coverage.totalCount} CardMarket price fields`}
          tone={coverageTone}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={chartPoints.length > 0 ? `${chartPoints.length} hist` : "No hist"}
          title={`History: ${
            chartPoints.length > 0 ? `${chartPoints.length} points` : "None"
          }. ${historySyncedLabel ? `Synced ${historySyncedLabel}` : "No history sync yet"}`}
          tone={historyTone}
        />
      </div>
    </div>
  );
}

function parseHistoryPointTimestamp(point: HistoryPointView): number | null {
  const raw = point.date.trim();
  if (!raw) return null;

  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`).getTime()
    : new Date(raw).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function getRecentHistoryAverage(points: HistoryPointView[], days: number): number | null {
  const validPoints = points
    .map((point) => ({
      timestamp: parseHistoryPointTimestamp(point),
      value: point.value,
    }))
    .filter(
      (point): point is { timestamp: number; value: number } =>
        point.timestamp != null && point.value != null && Number.isFinite(point.value)
    );

  if (validPoints.length === 0) return null;

  const latestTimestamp = Math.max(...validPoints.map((point) => point.timestamp));
  const cutoffTimestamp = latestTimestamp - days * 24 * 60 * 60 * 1000;
  const recentValues = validPoints
    .filter((point) => point.timestamp >= cutoffTimestamp)
    .map((point) => point.value);

  if (recentValues.length === 0) return null;

  const total = recentValues.reduce((sum, value) => sum + value, 0);
  return Number((total / recentValues.length).toFixed(2));
}

function SealedModalCurrentPricingPanel({
  metrics,
  accent,
}: {
  metrics: PriceMetric[];
  accent: PricingAccent;
}) {
  if (metrics.length === 0) return null;

  const [activePrimaryMetric, ...activeSecondaryMetrics] = metrics;

  return (
    <div className="card-modal-current-pricing-panel mt-4 border-t border-white/8 pt-4">
      <div className="card-modal-pricing-metrics grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <MetricTile
          label={activePrimaryMetric.label}
          value={activePrimaryMetric.value}
          hint={activePrimaryMetric.hint ?? null}
          accent={accent}
          className="min-h-[128px] max-[640px]:min-h-0"
        />

        <div className="card-modal-market-rows grid gap-4">
          {activeSecondaryMetrics.map((metric) => (
            <MarketRow
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SealedModalPreview({
  product,
  mediaWidth,
  imageSize,
  imagePadding,
}: {
  product: SealedDetailResponse;
  mediaWidth: string;
  imageSize: string;
  imagePadding: string;
}) {
  return (
    <aside
      className="mx-auto flex h-full max-w-[min(16rem,70vw)] flex-col gap-3 sm:max-w-full sm:gap-4 max-[640px]:max-w-[min(12.5rem,58vw)] max-[640px]:gap-1.5 lg:mx-0"
      style={{ width: mediaWidth }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)] max-[640px]:rounded-2xl">
        {product.image_url ? (
          <Image
            src={getCachedImageUrl(product.image_url) ?? product.image_url}
            alt={product.name}
            fill
            className={`object-contain ${imagePadding}`}
            sizes={imageSize}
            loading="eager"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-white/28" />
          </div>
        )}
      </div>
    </aside>
  );
}

function FeaturedCardTile({
  card,
  opening,
  onOpen,
}: {
  card: SealedFeaturedCard;
  opening: boolean;
  onOpen: () => void;
}) {
  const pullOdds =
    card.pull_rate_info?.specific_pull_odds ?? card.pull_rate_info?.pull_rate_odds ?? null;

  return (
    <button
      type="button"
      data-featured-card
      aria-busy={opening}
      onClick={onOpen}
      className={`group min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-1.5 text-left shadow-[0_10px_26px_rgba(0,0,0,0.20)] outline-none transition-all hover:-translate-y-0.5 hover:border-violet-300/30 hover:bg-white/[0.075] focus-visible:ring-2 focus-visible:ring-violet-300/55 ${opening ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-black/22 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
        {card.image_url ? (
          <Image
            src={getCachedImageUrl(card.image_url) ?? card.image_url}
            alt={card.name}
            fill
            className="object-fill"
            sizes="(max-width: 640px) 46vw, (max-width: 1536px) 22vw, (max-width: 1900px) 15vw, 8vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-white/[0.035] text-sm font-semibold text-white/30">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 px-0.5 pb-0.5 pt-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-xs font-bold leading-tight text-white">
              {card.name}
            </h3>
            <p className="mt-0.5 text-[10px] font-semibold text-white/38 min-[1900px]:hidden">
              {card.card_number ? `#${card.card_number}` : "Card number unavailable"}
            </p>
          </div>
          <p className="shrink-0 text-xs font-black tabular-nums text-white">
            {formatCurrency(card.market_price, card.market_currency)}
          </p>
        </div>

        <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
          <span className="max-w-full truncate rounded-full border border-violet-300/18 bg-violet-500/12 px-1.5 py-0.5 text-[9px] font-bold text-violet-100/88">
            {card.rarity ?? "Unknown rarity"}
          </span>
          <span
            className={`max-w-full truncate rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
              pullOdds
                ? "border-emerald-300/18 bg-emerald-400/10 text-emerald-100/82"
                : "border-white/8 bg-white/[0.035] text-white/38"
            }`}
          >
            {pullOdds ? `Pull ${pullOdds}` : "Pull rate unavailable"}
          </span>
        </div>
      </div>
    </button>
  );
}

export function SealedFeaturedCardsSection({
  product,
  loading,
  openingCardId,
  onOpenCard,
}: {
  product: SealedDetailResponse;
  loading: boolean;
  openingCardId: string | null;
  onOpenCard: (cardId: string) => void;
}) {
  const cards = product.featured_cards ?? [];
  const pricedCards = cards.filter((card) => card.market_price != null).length;
  const pullRateCards = cards.filter((card) => card.pull_rate_info != null).length;
  const topCard = cards.find((card) => card.market_price != null) ?? null;

  return (
    <section data-sealed-featured-cards className="min-w-0 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-3 sm:p-4">
      <div className="grid min-w-0 gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200/62">
            Set highlights
          </p>
          <h2 className="mt-0.5 text-xl font-black tracking-tight text-white sm:text-2xl">
            Featured Cards
          </h2>
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-white/46 min-[1900px]:hidden">
            The highest-value cards from {product.episode?.name ?? "the linked set"}. Pulls are
            never guaranteed; odds are shown only where local rarity data is available.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-white/8 bg-black/18 px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/34">Priced</p>
            <p className="mt-0.5 text-sm font-black tabular-nums text-white">{pricedCards}</p>
          </div>
          <div className="rounded-lg border border-white/8 bg-black/18 px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/34">Pull data</p>
            <p className="mt-0.5 text-sm font-black tabular-nums text-white">{pullRateCards}</p>
          </div>
          <div className="rounded-lg border border-white/8 bg-black/18 px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/34">Top card</p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-black tabular-nums text-white">
              {topCard ? formatCurrency(topCard.market_price, topCard.market_currency) : "--"}
            </p>
          </div>
        </div>
      </div>

      {loading && cards.length === 0 ? (
        <div
          className="sealed-featured-grid mx-auto mt-3 grid w-full gap-2"
          style={{ maxWidth: "269rem" }}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="aspect-[63/102] animate-pulse rounded-2xl bg-white/[0.055]" />
          ))}
        </div>
      ) : cards.length > 0 ? (
        <div
          className="sealed-featured-grid mx-auto mt-3 grid w-full gap-2"
          style={{ maxWidth: "269rem" }}
        >
          {cards.map((card) => (
            <FeaturedCardTile
              key={card.id}
              card={card}
              opening={openingCardId === card.id}
              onOpen={() => onOpenCard(card.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/12 px-4 py-10 text-center">
          <p className="font-semibold text-white/72">No linked set cards available</p>
          <p className="mt-1 text-sm text-white/40">
            This sealed product does not currently have enough local set data for highlights.
          </p>
        </div>
      )}
    </section>
  );
}

export function SealedModalHeroSection({
  product,
  titleClass,
  metaClassName,
  detailStatClass,
  isBusy,
  refreshing,
  syncingHistory,
  actionError,
  canManageSealedPrices,
  onRefresh,
  onSyncHistory,
  onAddedToCollection,
  onClose,
}: {
  product: SealedDetailResponse;
  titleClass: string;
  metaClassName: string;
  detailStatClass: string;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  actionError: string | null;
  canManageSealedPrices: boolean;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onAddedToCollection?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const collectionProduct = buildCollectionProduct(product);
  const collectionItem = product.collection_item ?? null;
  const collectionSummary = product.collection_summary ?? null;
  const collectionQuantity = collectionSummary?.quantity ?? collectionItem?.quantity ?? 0;
  const collectionPaidTotal =
    collectionSummary?.paid_total ??
    (collectionItem?.purchase_price_per_item != null
      ? Number((collectionItem.purchase_price_per_item * collectionItem.quantity).toFixed(2))
      : null);
  const headerMetaLabel = product.episode
    ? product.episode.code ?? product.episode.name
    : null;
  const paidStat =
    collectionPaidTotal != null
      ? {
          label: "Paid",
          value: formatCurrency(collectionPaidTotal, "EUR"),
        }
      : null;
  const officialReleaseDate = formatSealedReleaseDate(product.release_date);
  const setReleaseDate = formatSealedReleaseDate(product.episode?.release_date);
  const releaseDate = officialReleaseDate ?? setReleaseDate;
  const heroDetailStats = [
    {
      label: "Set",
      value: product.episode ? (
        <CompactDetailLink
          href={`${getExpansionHref(product.episode.id)}?tab=sealed`}
          onClick={onClose}
        >
          {product.episode.name}
        </CompactDetailLink>
      ) : (
        "--"
      ),
    },
    ...(paidStat ? [paidStat] : []),
    {
      label: "Type",
      value: "Sealed",
    },
    ...(releaseDate
      ? [
          {
            label: officialReleaseDate ? "Product release" : "Set release",
            value:
              officialReleaseDate && product.release_date_source_url ? (
                <a
                  href={product.release_date_source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-white/88 transition-colors hover:text-violet-100"
                >
                  {releaseDate}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                releaseDate
              ),
          },
        ]
      : []),
  ];
  const quickActionButtonClass =
    "!h-11 !w-11 !rounded-xl !border-white/10 !bg-white/[0.08] !p-0 hover:!border-white/18 hover:!bg-white/[0.13]";
  const utilityButtonClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] p-0 text-white/76 transition-colors hover:border-white/18 hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <SectionShell className="relative overflow-hidden border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))] !p-3 sm:!p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_48%),radial-gradient(circle_at_top_right,rgba(124,92,255,0.16),transparent_42%)]" />

      <div className="relative">
        <div className="grid gap-3 min-[2200px]:grid-cols-[minmax(0,1fr)_auto] min-[2200px]:items-start">
          <div className="min-w-0">
            <h2 className={`${titleClass} max-w-[34ch] break-words !text-[clamp(1.35rem,1.7vw,1.9rem)] font-bold leading-[1.08] text-white`}>
              {product.name}
            </h2>

            <div
              className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-white/44 max-[640px]:mt-1 max-[640px]:gap-x-1.5 max-[640px]:text-[10px] ${metaClassName}`}
            >
              {headerMetaLabel && <span className="whitespace-nowrap">{headerMetaLabel}</span>}
              <span className="whitespace-nowrap font-semibold text-fuchsia-200">
                Sealed product
              </span>
              <span
                className={`whitespace-nowrap ${
                  collectionQuantity > 0 ? "text-emerald-200/80" : "text-white/48"
                }`}
              >
                {collectionQuantity > 0 ? (
                  <>
                    <span className="max-[640px]:hidden">In DustyCards</span>
                    <span className="hidden max-[640px]:inline">Saved</span>
                  </>
                ) : (
                  <>
                    <span className="max-[640px]:hidden">Not in collection</span>
                    <span className="hidden max-[640px]:inline">Not saved</span>
                  </>
                )}
              </span>
              {collectionQuantity > 0 && (
                <span className="whitespace-nowrap text-white/44">x{collectionQuantity}</span>
              )}
            </div>
          </div>

          <div className="min-w-0 min-[2200px]:justify-self-end">
            <div
              className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-fit min-[2200px]:justify-end"
              aria-label="Quick actions"
            >
              <CollectionAddSealedButton
                product={collectionProduct}
                mode="icon"
                theme="dark"
                label={collectionQuantity > 0 ? "Add copy" : "Add"}
                className={quickActionButtonClass}
                onAdded={onAddedToCollection}
              />

              {canManageSealedPrices && (
                <>
                  <button
                    type="button"
                    onClick={onSyncHistory}
                    disabled={isBusy}
                    className={utilityButtonClass}
                    aria-label={
                      syncingHistory ? "Syncing sealed price history" : "Sync sealed price history"
                    }
                    title={syncingHistory ? "Syncing..." : "Sync history"}
                  >
                    <LineChart
                      className={`h-3.5 w-3.5 ${syncingHistory ? "animate-pulse" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isBusy}
                    className={utilityButtonClass}
                    aria-label={refreshing ? "Refreshing sealed prices" : "Refresh sealed prices"}
                    title={refreshing ? "Refreshing..." : "Refresh"}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 max-[640px]:mt-2 max-[640px]:grid-cols-2 sm:grid-cols-4">
          {heroDetailStats.map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 rounded-xl border border-white/8 bg-black/14 px-3 py-2 backdrop-blur-sm max-[640px]:px-2.5 max-[640px]:py-1.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
                {stat.label}
              </p>
              <div className="mt-1 min-w-0 line-clamp-2 text-[13px] font-semibold leading-snug text-white/82 [&_*]:line-clamp-2">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {collectionItem && (
          <>
            {collectionItem.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {collectionItem.tags.map((tag) => (
                  <MetaPill key={tag}>{tag}</MetaPill>
                ))}
              </div>
            )}

            {collectionItem.notes && (
              <div className={`mt-3 ${detailStatClass}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
                  Notes
                </p>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-base text-white/72">
                  {collectionItem.notes}
                </p>
              </div>
            )}
          </>
        )}

        {actionError && <p className="mt-4 text-base text-rose-300">{actionError}</p>}
      </div>
    </SectionShell>
  );
}

export function SealedModalHistorySection({
  productId,
  product,
  chartPoints,
  currentValue,
  priceFetchedAtLabel,
  loading,
  availableHistorySeries,
  activeHistorySeries,
  activeHistorySeriesLabel,
  onSelectHistorySeries,
}: {
  productId: string;
  product: SealedDetailResponse;
  chartPoints: HistoryPointView[];
  currentValue: number | null;
  priceFetchedAtLabel: string | null;
  loading: boolean;
  availableHistorySeries: Array<{
    key: SealedMarketHistorySeriesKey;
    label: string;
  }>;
  activeHistorySeries: SealedMarketHistorySeriesKey;
  activeHistorySeriesLabel: string;
  onSelectHistorySeries: (series: SealedMarketHistorySeriesKey) => void;
}) {
  const derivedAverage7d = getRecentHistoryAverage(chartPoints, 7);
  const derivedAverage30d = getRecentHistoryAverage(chartPoints, 30);
  const hasMultipleHistorySeries = availableHistorySeries.length > 1;
  const activeAverage7d =
    derivedAverage7d ?? (activeHistorySeries === "cm_market" ? product.price.cm_avg_7d : null);
  const activeAverage30d =
    derivedAverage30d ?? (activeHistorySeries === "cm_market" ? product.price.cm_avg_30d : null);
  const primaryMetrics: PriceMetric[] = [
    {
      label: "Current",
      value: formatCurrency(currentValue, "EUR"),
      hint: [
        hasMultipleHistorySeries ? `Using ${activeHistorySeriesLabel}` : null,
        priceFetchedAtLabel ? `Updated ${priceFetchedAtLabel}` : null,
      ]
        .filter(Boolean)
        .join(" / ") || null,
    },
    {
      label: "7D Avg",
      value: formatCurrency(activeAverage7d, "EUR"),
    },
    {
      label: "30D Avg",
      value: formatCurrency(activeAverage30d, "EUR"),
    },
  ];
  const historyPillClass =
    "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition-colors max-[640px]:h-7 max-[640px]:px-2";
  const chartTitle =
    activeHistorySeries === "cm_market"
      ? "CardMarket History"
      : `${activeHistorySeriesLabel} CardMarket History`;

  return (
    <SectionShell className="overflow-hidden max-[640px]:!p-2.5">
      <div className="mb-2.5 flex flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Price history
          </p>
          {hasMultipleHistorySeries ? (
            <div className="card-modal-series-picker flex min-w-0 flex-wrap gap-1.5 md:justify-end">
              {availableHistorySeries.map((series) => (
                <button
                  key={series.key}
                  type="button"
                  onClick={() => onSelectHistorySeries(series.key)}
                  className={`${historyPillClass} ${
                    activeHistorySeries === series.key
                      ? "border-white/24 bg-white/14 text-white"
                      : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                  }`}
                >
                  {series.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="inline-flex h-8 w-fit items-center justify-center rounded-full border border-white/10 px-3 text-[11px] font-semibold text-white/54 max-[640px]:h-7 max-[640px]:px-2">
              CardMarket
            </p>
          )}
        </div>

        <div id={`sealed-history-charts-${productId}`} className="min-h-0 overflow-hidden">
          <PriceHistoryPanel
            title={chartTitle}
            currency="EUR"
            points={chartPoints}
            currentValue={currentValue}
            tone="dark"
            loading={loading}
            emptyText="No sealed price history yet"
            rangeStorageKey={`sealed:${productId}:cardmarket`}
          />
        </div>

        <SealedPriceStatusLine product={product} chartPoints={chartPoints} />
      </div>

      <SealedModalCurrentPricingPanel metrics={primaryMetrics} accent="emerald" />
    </SectionShell>
  );
}

export function SealedModalFooter({
  product,
  footerGridClass,
  cardMarketUrl,
  onAddedToCollection,
  onClose,
}: {
  product: SealedDetailResponse;
  footerGridClass: string;
  cardMarketUrl: string | null;
  onAddedToCollection?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const footerGroupClass = "min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-2.5";
  const footerGroupLabelClass =
    "px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34";
  const marketGridClass =
    product.tcggo_url && cardMarketUrl ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className={footerGridClass}>
      <div className={`${footerGroupClass} lg:hidden`}>
        <p className={footerGroupLabelClass}>Collection</p>
        <div className="mt-2 grid gap-2">
          <CollectionAddSealedButton
            product={buildCollectionProduct(product)}
            mode="button"
            theme="dark"
            label="Add to DustyCards"
            className="min-h-11 w-full"
            onAdded={onAddedToCollection}
          />
        </div>
      </div>

      <div className={`${footerGroupClass} lg:col-span-2`}>
        <p className={footerGroupLabelClass}>Market</p>
        <div className={`mt-2 grid gap-2 ${marketGridClass}`}>
          {cardMarketUrl && (
            <a
              href={cardMarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={DETAIL_MARKET_LINK_CLASS}
            >
              CardMarket
              <ExternalLink className="h-4 w-4" />
            </a>
          )}

          <a
            href={buildSealedEbaySearchUrl({
              name: product.name,
              episodeName: product.episode?.name,
              episodeCode: product.episode?.code,
            })}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={DETAIL_MARKET_LINK_CLASS}
          >
            eBay Deals
            <ExternalLink className="h-4 w-4" />
          </a>

          {product.tcggo_url && (
            <a
              href={product.tcggo_url}
              target="_blank"
              rel="noopener noreferrer"
              className={DETAIL_MARKET_LINK_CLASS}
            >
              TCGGO
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
