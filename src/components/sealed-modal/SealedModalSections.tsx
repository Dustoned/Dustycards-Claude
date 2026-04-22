"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LineChart, Package, RefreshCw } from "lucide-react";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { formatCurrency } from "./utils";
import type { SealedDetailResponse } from "./types";

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

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: SectionShellProps) {
  return (
    <section className={`rounded-[26px] border border-white/10 bg-white/[0.055] p-4 sm:p-5 ${className}`}>
      {(eyebrow || title || description) && (
        <div className="mb-4 space-y-1.5">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {eyebrow}
            </p>
          )}
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {description && <p className="text-sm text-white/48">{description}</p>}
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
    <div className={`rounded-2xl border px-3 py-3 ${accentClass} ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/42">{hint}</p>}
    </div>
  );
}

function MetaPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/68 ${className}`}
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
    <aside className={`mx-auto flex w-full max-w-full flex-col gap-4 lg:mx-0 ${mediaWidth}`}>
      <div className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        {product.image_url ? (
          <Image
            src={product.image_url}
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

      <SectionShell eyebrow="Product details">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill className="text-blue-200">Sealed product</MetaPill>
          <MetaPill>{priceHistoryCount} history points</MetaPill>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-black/22 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
              Set
            </p>
            <div className="mt-2 text-sm font-medium text-white/84">
              {product.episode ? (
                <Link
                  href={`/expansions/${product.episode.id}?tab=sealed`}
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

          <div className="rounded-2xl border border-white/8 bg-black/22 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
              Last refresh
            </p>
            <p className="mt-2 text-sm font-medium text-white/84">
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
  priceHistoryCount,
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
  priceHistoryCount: number;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  actionError: string | null;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onClose: () => void;
}) {
  return (
    <SectionShell className="overflow-hidden">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className={`${titleClass} leading-[0.98] font-bold text-white`}>{product.name}</h2>

          <div className={`mt-3 flex flex-wrap items-center gap-2.5 text-white/54 ${metaClassName}`}>
            <span>Sealed product</span>
            {priceHistoryCount > 0 && <span>{priceHistoryCount} history points</span>}
          </div>

          {product.episode && (
            <div className="mt-3">
              <Link
                href={`/expansions/${product.episode.id}?tab=sealed`}
                onClick={onClose}
                className="text-sm text-white/58 transition-colors hover:text-white/82 hover:underline underline-offset-2"
              >
                {product.episode.name}
                {product.episode.code && (
                  <span className="ml-1 opacity-60">({product.episode.code})</span>
                )}
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSyncHistory}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LineChart className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`} />
            {syncingHistory ? "Syncing..." : "Sync History"}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {actionError && <p className="mt-4 text-sm text-rose-300">{actionError}</p>}
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

  return (
    <SectionShell eyebrow="Market snapshot" title="Current pricing">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
              CardMarket
            </p>
            <p className="mt-1 text-sm text-white/44">Current market plus rolling averages</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {primaryMetrics.map((metric) => (
              <MetricTile
                key={metric.label}
                label={metric.label}
                value={metric.value}
                hint={metric.hint ?? null}
                accent={metric.accent}
              />
            ))}
          </div>
        </div>

        {regionalMetrics.length > 0 && (
          <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                Regional offers
              </p>
              <p className="mt-1 text-sm text-white/44">Alternative CardMarket regions</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
  chartPoints,
  currentValue,
  loading,
}: {
  chartPoints: Array<{ date: string; label: string; value: number | null }>;
  currentValue: number | null;
  loading: boolean;
}) {
  return (
    <SectionShell eyebrow="Price history" title="History chart">
      <PriceHistoryPanel
        title="CardMarket History"
        currency="EUR"
        points={chartPoints}
        currentValue={currentValue}
        tone="dark"
        loading={loading}
        emptyText="Nog geen sealed prijshistorie"
        layout="hero"
      />
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
  return (
    <div className={footerGridClass}>
      <CollectionAddSealedButton
        product={buildCollectionProduct(product)}
        mode="button"
        theme="dark"
        label="Add to DustyCards"
        className="rounded-2xl"
      />

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

      <button
        type="button"
        onClick={onClose}
        className="rounded-2xl bg-white/[0.08] px-6 py-3 font-semibold text-white/68 transition-colors hover:bg-white/[0.12] hover:text-white"
      >
        Close
      </button>
    </div>
  );
}
