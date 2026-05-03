"use client";

import dynamic from "next/dynamic";
import type { MouseEvent, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ExternalLink, LineChart, Package, RefreshCw } from "lucide-react";
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

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: SectionShellProps) {
  return (
    <section className={`rounded-[26px] border border-white/10 bg-white/[0.055] p-5 sm:p-6 ${className}`}>
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
    <div className={`min-w-0 rounded-2xl border px-4 py-4 ${accentClass} ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2.5 break-words text-xl font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1.5 text-sm text-white/42">{hint}</p>}
    </div>
  );
}

function MarketRow({ label, value, hint }: MarketRowProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
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

export function SealedModalPricingSection({
  product,
  primaryPrice,
  priceFetchedAtLabel,
}: {
  product: SealedDetailResponse;
  primaryPrice: number | null;
  priceFetchedAtLabel: string | null;
}) {
  const primaryMetrics = [
    {
      label: "Current",
      value: formatCurrency(primaryPrice),
      hint: priceFetchedAtLabel ? `Updated ${priceFetchedAtLabel}` : null,
      accent: "emerald" as const,
    },
    {
      label: "7D Avg",
      value: formatCurrency(product.price.cm_avg_7d),
      accent: "slate" as const,
    },
    {
      label: "30D Avg",
      value: formatCurrency(product.price.cm_avg_30d),
      accent: "slate" as const,
    },
  ];
  const regionalMetrics = [
    {
      label: "EU Only",
      value: formatCurrency(product.price.cm_lowest_eu),
      accent: "amber" as const,
    },
    {
      label: "DE",
      value: formatCurrency(product.price.cm_lowest_de),
      accent: "slate" as const,
    },
    {
      label: "FR",
      value: formatCurrency(product.price.cm_lowest_fr),
      accent: "slate" as const,
    },
    {
      label: "ES",
      value: formatCurrency(product.price.cm_lowest_es),
      accent: "slate" as const,
    },
    {
      label: "IT",
      value: formatCurrency(product.price.cm_lowest_it),
      accent: "slate" as const,
    },
  ].filter((metric) => metric.value !== "--");
  const [primaryMetric, ...secondaryMetrics] = primaryMetrics;

  return (
    <SectionShell title="Current pricing">
      <div className="grid gap-5">
        <div className="rounded-[24px] border border-white/10 bg-black/24 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/36">
                CardMarket
              </p>
              <p className="mt-1 text-sm text-white/44">Current market plus rolling averages</p>
            </div>
            <MetaPill>Sealed</MetaPill>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <MetricTile
              label={primaryMetric.label}
              value={primaryMetric.value}
              hint={primaryMetric.hint ?? null}
              accent="emerald"
              className="min-h-[128px]"
            />

            <div className="grid gap-4">
              {secondaryMetrics.map((metric) => (
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

        {regionalMetrics.length > 0 && (
          <div className="rounded-[24px] border border-white/10 bg-black/24 p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/36">
                Regional offers
              </p>
              <p className="mt-1 text-sm text-white/44">Alternative CardMarket regions</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {regionalMetrics.map((metric) => (
                <MetricTile
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  accent={metric.accent}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}

export function SealedModalHistorySection({
  productId,
  historyChartsOpen,
  chartPoints,
  currentValue,
  loading,
  onToggleHistoryCharts,
}: {
  productId: string;
  historyChartsOpen: boolean;
  chartPoints: Array<{ date: string; label: string; value: number | null }>;
  currentValue: number | null;
  loading: boolean;
  onToggleHistoryCharts: () => void;
}) {
  function handleToggleHistory(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.blur();
    const scroller = document.querySelector('[role="dialog"]') as HTMLElement | null;
    const scrollTop = scroller?.scrollTop ?? 0;

    onToggleHistoryCharts();

    [0, 40, 120, 260, 420, 760, 1400, 2200].forEach((delay) => {
      window.setTimeout(() => {
        if (scroller) {
          scroller.scrollTop = scrollTop;
        }
      }, delay);
    });
  }

  return (
    <SectionShell className="overflow-hidden">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleToggleHistory}
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={historyChartsOpen}
        aria-controls={`sealed-history-charts-${productId}`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            Price history
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">History chart</h3>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/68">
          {historyChartsOpen ? "Hide" : "Show"}
          <ChevronDown
            className={`h-5 w-5 transition-transform duration-300 ease-out motion-reduce:transition-none ${
              historyChartsOpen ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <div
        id={`sealed-history-charts-${productId}`}
        aria-hidden={!historyChartsOpen}
        className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out motion-reduce:transition-none ${
          historyChartsOpen
            ? "visible mt-5 grid-rows-[1fr] opacity-100"
            : "invisible mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <PriceHistoryPanel
            title="CardMarket History"
            currency="EUR"
            points={chartPoints}
            currentValue={currentValue}
            tone="dark"
            loading={loading}
            emptyText="No sealed price history yet"
            layout="hero"
          />
        </div>
      </div>
    </SectionShell>
  );
}

export function SealedModalFooter({
  product,
  footerGridClass,
  cardMarketUrl,
}: {
  product: SealedDetailResponse;
  footerGridClass: string;
  cardMarketUrl: string | null;
}) {
  return (
    <div className={`${footerGridClass} ${product.tcggo_url ? "xl:grid-cols-3" : ""}`}>
      <CollectionAddSealedButton
        product={buildCollectionProduct(product)}
        mode="button"
        theme="dark"
        label="Add to DustyCards"
        className="rounded-2xl"
      />

      {product.tcggo_url && (
        <a
          href={product.tcggo_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-center font-semibold text-white/78 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
          Open TCGGO
        </a>
      )}

      {cardMarketUrl && (
        <a
          href={cardMarketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Open CardMarket
        </a>
      )}
    </div>
  );
}
