"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, LineChart, Package, RefreshCw } from "lucide-react";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { getCachedImageUrl } from "@/lib/image-cache";
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

interface HistoryPointView {
  date: string;
  label: string;
  value: number | null;
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
        <div className="mb-5 space-y-2">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              {eyebrow}
            </p>
          )}
          {title && <h3 className="text-xl font-semibold text-white">{title}</h3>}
          {description && <p className="text-base text-white/48">{description}</p>}
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
    <div className={`card-modal-metric min-w-0 rounded-2xl border px-4 py-4 ${accentClass} ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2.5 break-words text-xl font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1.5 text-sm text-white/42">{hint}</p>}
    </div>
  );
}

function MarketRow({ label, value, hint }: MarketRowProps) {
  return (
    <div className="card-modal-market-row flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">{label}</p>
        {hint && <p className="mt-1 text-sm text-white/40">{hint}</p>}
      </div>
      <p className="min-w-0 break-words text-right text-lg font-semibold tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

function MetaPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-base font-medium text-white/68 ${className}`}
    >
      {children}
    </span>
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
  priceHistoryCount,
  priceFetchedAtLabel,
  onClose,
}: {
  product: SealedDetailResponse;
  mediaWidth: string;
  imageSize: string;
  imagePadding: string;
  priceHistoryCount: number;
  priceFetchedAtLabel: string | null;
  onClose: () => void;
}) {
  return (
    <aside
      className="mx-auto flex max-w-full flex-col gap-4 lg:sticky lg:top-8 lg:mx-0 lg:self-start"
      style={{ width: mediaWidth }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
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

      <SectionShell eyebrow="Product details" className="shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill className="text-blue-200">Sealed product</MetaPill>
          <MetaPill>{priceHistoryCount} history points</MetaPill>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-black/22 px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
              Set
            </p>
            <div className="mt-2 text-base font-medium text-white/84">
              {product.episode ? (
                <Link
                  href={`/expansions/${product.episode.id}?tab=sealed`}
                  prefetch={false}
                  onClick={onClose}
                  className="transition-colors hover:text-white"
                >
                  {product.episode.name}
                  {product.episode.code ? ` (${product.episode.code})` : ""}
                </Link>
              ) : (
                "--"
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/22 px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
              Last refresh
            </p>
            <p className="mt-2 text-base font-medium text-white/84">
              {priceFetchedAtLabel ?? "Not refreshed yet"}
            </p>
          </div>
        </div>
      </SectionShell>
    </aside>
  );
}

export function SealedModalHeroSection({
  product,
  titleClass,
  metaClassName,
  detailStatClass,
  priceHistoryCount,
  priceFetchedAtLabel,
  isBusy,
  refreshing,
  syncingHistory,
  actionError,
  onRefresh,
  onSyncHistory,
  onClose,
}: {
  product: SealedDetailResponse;
  titleClass: string;
  metaClassName: string;
  detailStatClass: string;
  priceHistoryCount: number;
  priceFetchedAtLabel: string | null;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  actionError: string | null;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onClose: () => void;
}) {
  const heroDetailStats = [
    {
      label: "Type",
      value: "Sealed product",
    },
    {
      label: "Set",
      value: product.episode ? (
        <Link
          href={`/expansions/${product.episode.id}?tab=sealed`}
          prefetch={false}
          onClick={onClose}
          className="inline-flex max-w-full items-center text-base font-medium text-white/84 transition-colors hover:text-white hover:underline underline-offset-2"
        >
          <span className="truncate">
            {product.episode.name}
            {product.episode.code ? ` (${product.episode.code})` : ""}
          </span>
        </Link>
      ) : (
        "--"
      ),
    },
    {
      label: "History",
      value: `${priceHistoryCount} points`,
    },
    {
      label: "Last refresh",
      value: priceFetchedAtLabel ?? "Not refreshed yet",
    },
  ];

  return (
    <SectionShell className="relative overflow-hidden border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_48%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_42%)]" />

      <div className="relative">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <h2 className={`${titleClass} break-words leading-tight font-bold text-white`}>
              {product.name}
            </h2>

            <div className={`mt-3 flex flex-wrap items-center gap-2.5 text-white/54 ${metaClassName}`}>
              <MetaPill className="text-blue-200">Sealed product</MetaPill>
              {product.episode && <MetaPill>{product.episode.code ?? product.episode.name}</MetaPill>}
              {priceHistoryCount > 0 && <MetaPill>{priceHistoryCount} history points</MetaPill>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-self-end xl:self-start">
            <button
              type="button"
              onClick={onSyncHistory}
              disabled={isBusy}
              className="inline-flex min-h-[46px] items-center gap-2.5 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-base font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LineChart className={`h-[18px] w-[18px] ${syncingHistory ? "animate-pulse" : ""}`} />
              {syncingHistory ? "Syncing..." : "Sync History"}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isBusy}
              className="inline-flex min-h-[46px] items-center gap-2.5 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-base font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-[18px] w-[18px] ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {heroDetailStats.map((stat) => (
            <div key={stat.label} className={`${detailStatClass} min-w-0`}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
                {stat.label}
              </p>
              <div className="mt-2 min-w-0 break-words text-base font-medium text-white/84">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

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
}: {
  productId: string;
  product: SealedDetailResponse;
  chartPoints: HistoryPointView[];
  currentValue: number | null;
  priceFetchedAtLabel: string | null;
  loading: boolean;
}) {
  const derivedAverage7d = getRecentHistoryAverage(chartPoints, 7);
  const derivedAverage30d = getRecentHistoryAverage(chartPoints, 30);
  const primaryMetrics: PriceMetric[] = [
    {
      label: "Current",
      value: formatCurrency(currentValue),
      hint: priceFetchedAtLabel ? `Updated ${priceFetchedAtLabel}` : null,
    },
    {
      label: "7D Avg",
      value: formatCurrency(derivedAverage7d ?? product.price.cm_avg_7d),
    },
    {
      label: "30D Avg",
      value: formatCurrency(derivedAverage30d ?? product.price.cm_avg_30d),
    },
    {
      label: "EU Only",
      value: formatCurrency(product.price.cm_lowest_eu),
    },
    {
      label: "DE",
      value: formatCurrency(product.price.cm_lowest_de),
    },
    {
      label: "FR",
      value: formatCurrency(product.price.cm_lowest_fr),
    },
    {
      label: "ES",
      value: formatCurrency(product.price.cm_lowest_es),
    },
    {
      label: "IT",
      value: formatCurrency(product.price.cm_lowest_it),
    },
  ].filter((metric, index) => index < 3 || metric.value !== "--");

  return (
    <SectionShell className="overflow-hidden">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            Price history
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/34">
            CardMarket sealed
          </p>
        </div>
      </div>

      <div id={`sealed-history-charts-${productId}`} className="min-h-0 overflow-hidden">
        <PriceHistoryPanel
          title="CardMarket History"
          currency="EUR"
          points={chartPoints}
          currentValue={currentValue}
          tone="dark"
          loading={loading}
          emptyText="No sealed price history yet"
        />
      </div>

      <SealedModalCurrentPricingPanel metrics={primaryMetrics} accent="emerald" />
    </SectionShell>
  );
}

export function SealedModalFooter({
  product,
  footerGridClass,
  cardMarketUrl,
  onClose,
}: {
  product: SealedDetailResponse;
  footerGridClass: string;
  cardMarketUrl: string | null;
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
      <div className={footerGroupClass}>
        <p className={footerGroupLabelClass}>Collection</p>
        <div className="mt-2 grid gap-2">
          <CollectionAddSealedButton
            product={buildCollectionProduct(product)}
            mode="button"
            theme="dark"
            label="Add to DustyCards"
            className="min-h-11 w-full"
          />
        </div>
      </div>

      <div className={footerGroupClass}>
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
