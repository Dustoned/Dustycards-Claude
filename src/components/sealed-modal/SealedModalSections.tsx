"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, LineChart, Package, RefreshCw } from "lucide-react";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { getExpansionHref } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { SealedMarketHistorySeriesKey } from "@/lib/price-history";
import { formatCurrency } from "./utils";
import type { SealedDetailResponse } from "./types";

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
  ];
  const quickActionButtonClass =
    "!h-8 !w-8 !rounded-xl !border-white/10 !bg-white/[0.08] !p-0 hover:!border-white/18 hover:!bg-white/[0.13] max-[640px]:!h-8 max-[640px]:!w-8";
  const utilityButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] p-0 text-white/76 transition-colors hover:border-white/18 hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <SectionShell className="relative overflow-hidden border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))] !p-3 sm:!p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_48%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_42%)]" />

      <div className="relative">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <h2 className={`${titleClass} break-words !text-[1.45rem] font-bold leading-tight text-white sm:!text-[1.9rem]`}>
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

          <div className="min-w-0 xl:justify-self-end">
            <div
              className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-fit xl:justify-end"
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

        <div className="mt-3 grid gap-1.5 max-[640px]:mt-2 max-[640px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {heroDetailStats.map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 rounded-xl border border-white/8 bg-black/14 px-3 py-2 backdrop-blur-sm max-[640px]:px-2.5 max-[640px]:py-1.5"
            >
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/32 max-[640px]:tracking-[0.1em]">
                {stat.label}
              </p>
              <div className="mt-1 min-w-0 truncate text-[13px] font-semibold leading-snug text-white/82 max-[640px]:text-[12px] [&_*]:truncate">
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
  const marketButtonBase =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors";
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
              className={`${marketButtonBase} bg-blue-600 hover:bg-blue-500`}
            >
              CardMarket
              <ExternalLink className="h-4 w-4" />
            </a>
          )}

          <Link
            href={`/deals?mode=sealed&productId=${encodeURIComponent(product.id)}`}
            prefetch={false}
            onClick={onClose}
            className={`${marketButtonBase} bg-emerald-600 hover:bg-emerald-500`}
          >
            eBay Deals
            <ExternalLink className="h-4 w-4" />
          </Link>

          {product.tcggo_url && (
            <a
              href={product.tcggo_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${marketButtonBase} border border-white/12 bg-white/[0.06] text-white/78 hover:border-white/20 hover:bg-white/[0.1] hover:text-white`}
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
