"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { LineChart, RefreshCw } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import IllustratorLink from "@/components/IllustratorLink";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import { type SupportedGradedSlabCompany } from "@/lib/graded-slabs";
import {
  type CardGradedPriceHistorySeries,
  type CardMarketHistorySeriesKey,
} from "@/lib/price-history";
import { getCachedImageUrl } from "@/lib/image-cache";
import { normalizeRarityLabel } from "@/lib/rarity";
import { formatCurrency, rarityBadge } from "./utils";
import type { ModalCardCollectionItem, ModalCardData } from "./types";

const GradedSlabPreview = dynamic(() => import("@/components/GradedSlabPreview"), {
  ssr: false,
  loading: () => null,
});
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
  accent?: "emerald" | "blue" | "violet" | "slate";
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
      : accent === "blue"
        ? "border-blue-400/16 bg-blue-400/[0.08]"
        : accent === "violet"
          ? "border-violet-400/16 bg-violet-400/[0.08]"
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
      <p className="min-w-0 break-words text-right text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function MetaPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`card-modal-meta-pill inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-base font-medium text-white/68 max-[640px]:px-2.5 max-[640px]:py-1 max-[640px]:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

function buildCollectionCard(card: ModalCardData) {
  return {
    id: card.id,
    name: card.name,
    image_url: card.image_url,
    episode: {
      id: card.episode_id,
      name: card.episode_name,
      code: card.episode_code,
    },
  };
}

export function CardModalPreview({
  card,
  mediaWidth,
  imageSize,
  previewAspectClass,
  showGradedPreview,
  gradingCompanyLabel,
  gradingGradeLabel,
  onOpenThreeD,
}: {
  card: ModalCardData;
  mediaWidth: string;
  imageSize: string;
  previewAspectClass: string;
  showGradedPreview: boolean;
  gradingCompanyLabel: SupportedGradedSlabCompany | null;
  gradingGradeLabel: string | null;
  onOpenThreeD: () => void;
}) {
  return (
    <aside
      className="mx-auto flex h-full max-w-[min(13rem,62vw)] flex-col gap-3 sm:max-w-full sm:gap-4 max-[640px]:max-w-[min(12rem,58vw)] max-[640px]:gap-1.5 lg:mx-0"
      style={{ width: mediaWidth }}
    >
      {card.image_url ? (
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onOpenThreeD();
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onOpenThreeD();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpenThreeD();
          }}
          className={`group relative ${previewAspectClass} w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-transform hover:scale-[1.01] max-[640px]:rounded-2xl`}
          aria-label={`Open ${card.name} in 3D`}
        >
          {showGradedPreview && gradingCompanyLabel && gradingGradeLabel ? (
            <GradedSlabPreview
              company={gradingCompanyLabel}
              grade={gradingGradeLabel}
              name={card.name}
              episodeName={card.episode_name}
              episodeCode={card.episode_code}
              cardNumber={card.card_number}
              imageUrl={card.image_url}
              alt={card.name}
              className="absolute inset-0"
              sizes={imageSize}
              loading="eager"
              priority
              variant="detail"
            />
          ) : (
            <Image
              src={getCachedImageUrl(card.image_url) ?? card.image_url}
              alt={card.name}
              fill
              className="object-contain"
              sizes={imageSize}
              loading="eager"
              unoptimized
            />
          )}
        </button>
      ) : (
        <div
          className={`${previewAspectClass} flex w-full items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.03] text-white/30 max-[640px]:rounded-2xl`}
        >
          ?
        </div>
      )}

      <div className="hidden sm:block">
        <PriceRefreshCountdown
          rarity={card.rarity}
          priceFetchedAt={card.price_fetched_at}
          priceSourceStatus={card.price_source_status}
          priceSourceCheckedAt={card.price_source_checked_at}
          compact
        />
      </div>
    </aside>
  );
}

export function CardModalHeroSection({
  card,
  collectionItem,
  titleClass,
  metaClassName,
  detailStatClass,
  gradingCompanyLabel,
  gradingGradeLabel,
  isBusy,
  refreshing,
  syncingHistory,
  refreshError,
  canManageCardPrices,
  onRefresh,
  onSyncHistory,
  onClose,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  titleClass: string;
  metaClassName: string;
  detailStatClass: string;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  refreshError: string | null;
  canManageCardPrices: boolean;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onClose: () => void;
}) {
  const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
  const typeLabel = [card.supertype, card.subtypes].filter(Boolean).join(" / ");
  const collectionTags = collectionItem?.tags ?? [];
  const collectionLanguage =
    collectionItem?.language && collectionItem.language.trim().length > 0
      ? collectionItem.language.trim()
      : null;
  const headerMeta = [
    card.episode_code ? card.episode_code : null,
    card.card_number ? `#${card.card_number}` : null,
  ].filter(Boolean);
  const headerMetaLabel = headerMeta.length > 0 ? headerMeta.join(" ") : null;
  const heroDetailStats = [
    {
      label: "Type",
      value: typeLabel || "--",
    },
    {
      label: "Set",
      value: (
        <div>
          <Link
            href={`/expansions/${card.episode_id}`}
            prefetch={false}
            onClick={onClose}
            className="inline-flex max-w-full items-center text-base font-medium text-white/84 transition-colors hover:text-white hover:underline underline-offset-2"
          >
            <span className="truncate">{card.episode_name}</span>
          </Link>
        </div>
      ),
    },
    {
      label: "Artist",
      value: card.artist ? (
        <IllustratorLink
          artist={card.artist}
          onClick={onClose}
          className="transition-colors hover:text-white hover:underline underline-offset-2"
        />
      ) : (
        "--"
      ),
    },
    ...(card.pull_rate_info
      ? [
          {
            label: "Pull Odds",
            value: (
              <div className="space-y-1">
                <p className="tabular-nums">
                  {card.pull_rate_info.specific_pull_odds ??
                    card.pull_rate_info.pull_rate_odds ??
                    "--"}
                </p>
                <p className="text-sm font-medium text-white/42">
                  {[
                    card.pull_rate_info.pull_rate_odds
                      ? `Rarity ${card.pull_rate_info.pull_rate_odds}`
                      : null,
                    card.pull_rate_info.psa_avg_gem_pct != null
                      ? `Gem ${(card.pull_rate_info.psa_avg_gem_pct * 100).toFixed(1)}%`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              </div>
            ),
          },
        ]
      : []),
  ];
  const collectionStats = [
    {
      label: collectionItem?.cost_basis_label ?? "Paid",
      value:
        collectionItem?.cost_basis_value != null
          ? formatCurrency(collectionItem.cost_basis_value, "EUR")
          : "--",
      show: collectionItem?.cost_basis_value != null,
    },
    {
      label: "Condition",
      value: collectionItem?.condition ?? "--",
      show: Boolean(collectionItem?.condition),
    },
  ];
  const headerDetailStats = collectionItem
    ? [...heroDetailStats, ...collectionStats.filter((stat) => stat.show)]
    : heroDetailStats;

  return (
    <SectionShell className="relative overflow-hidden border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_48%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_42%)]" />

      <div className="relative">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <h2 className={`${titleClass} break-words leading-tight font-bold text-white`}>
              {card.name}
            </h2>

            <div className={`mt-3 flex flex-wrap items-center gap-2.5 text-white/54 max-[640px]:mt-2 max-[640px]:gap-1.5 ${metaClassName}`}>
              {headerMetaLabel && (
                <span className="whitespace-nowrap font-medium text-white/58">{headerMetaLabel}</span>
              )}
              {normalizedRarity && (
                <span
                  className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold sm:text-base max-[640px]:px-2.5 max-[640px]:py-1 max-[640px]:text-[11px] ${rarityBadge(
                    card.rarity
                  )}`}
                >
                  {normalizedRarity}
                </span>
              )}
              <MetaPill className={collectionItem ? "text-emerald-200" : "text-white/60"}>
                {collectionItem ? "In DustyCards" : "Not in collection"}
              </MetaPill>
              {collectionLanguage && <MetaPill>{collectionLanguage}</MetaPill>}
              {gradingCompanyLabel && gradingGradeLabel && (
                <MetaPill className="text-violet-200">
                  {gradingCompanyLabel} {gradingGradeLabel}
                </MetaPill>
              )}
            </div>
          </div>

          {canManageCardPrices && (
            <div className="flex flex-wrap gap-2 max-[640px]:mt-3 max-[640px]:grid max-[640px]:grid-cols-2 xl:justify-self-end xl:self-start">
              <button
                type="button"
                onClick={onSyncHistory}
                disabled={isBusy}
                className="inline-flex min-h-[46px] items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-base font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50 max-[640px]:min-h-[38px] max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[11px]"
              >
                <LineChart
                  className={`h-[18px] w-[18px] max-[640px]:h-[14px] max-[640px]:w-[14px] ${
                    syncingHistory ? "animate-pulse" : ""
                  }`}
                />
                {syncingHistory ? "Syncing..." : "Sync History"}
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isBusy}
                className="inline-flex min-h-[46px] items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-base font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50 max-[640px]:min-h-[38px] max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[11px]"
              >
                <RefreshCw
                  className={`h-[18px] w-[18px] max-[640px]:h-[14px] max-[640px]:w-[14px] ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 max-[640px]:hidden sm:grid-cols-2 xl:grid-cols-4">
          {headerDetailStats.map((stat) => (
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

        {collectionItem ? (
          <>
            {collectionTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 max-[640px]:hidden">
                {collectionTags.map((tag) => (
                  <MetaPill key={tag}>{tag}</MetaPill>
                ))}
              </div>
            )}

            {collectionItem.notes && (
              <div className={`mt-3 max-[640px]:hidden ${detailStatClass}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
                  Notes
                </p>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-base text-white/72">
                  {collectionItem.notes}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="mt-3 rounded-[20px] border border-dashed border-white/8 bg-black/12 px-4 py-3.5 text-base text-white/56 max-[640px]:hidden">
            Add this card to DustyCards to save purchase details, condition, language and notes.
          </div>
        )}

        {refreshError && <p className="mt-4 text-base text-rose-300">{refreshError}</p>}
      </div>
    </SectionShell>
  );
}

function CardModalCurrentPricingPanel({
  card,
  activePricingSource,
  availableCardMarketHistorySeries,
  activeCardMarketHistorySeries,
  activeCardMarketSeriesLabel,
  activeCardMarketCurrentValue,
  ignoredCardMarketCurrentValue,
  onSelectCardMarketHistorySeries,
}: {
  card: ModalCardData;
  activePricingSource: "cardmarket" | "tcgplayer";
  availableCardMarketHistorySeries: Array<{
    key: CardMarketHistorySeriesKey;
    label: string;
  }>;
  activeCardMarketHistorySeries: CardMarketHistorySeriesKey;
  activeCardMarketSeriesLabel: string;
  activeCardMarketCurrentValue: number | null;
  ignoredCardMarketCurrentValue: number | null;
  onSelectCardMarketHistorySeries: (series: CardMarketHistorySeriesKey) => void;
}) {
  const hasMultipleCardMarketSeries = availableCardMarketHistorySeries.length > 1;
  const cardMarketMetrics: PriceMetric[] = [
    {
      label: "Current",
      value: formatCurrency(activeCardMarketCurrentValue, "EUR"),
      hint:
        ignoredCardMarketCurrentValue != null
          ? `Ignored suspicious ${formatCurrency(ignoredCardMarketCurrentValue, "EUR")}`
          : hasMultipleCardMarketSeries
            ? `Using ${activeCardMarketSeriesLabel}`
            : null,
    },
    {
      label: "7D Avg",
      value: formatCurrency(card.price?.cm_en_avg_7d ?? null, "EUR"),
    },
    {
      label: "30D Avg",
      value: formatCurrency(card.price?.cm_en_avg_30d ?? null, "EUR"),
    },
  ];
  const tcgMetrics: PriceMetric[] = [
    {
      label: "Current",
      value: formatCurrency(card.price?.tcp_market ?? null, "USD"),
    },
    {
      label: "TCP Mid",
      value: formatCurrency(card.price?.tcp_mid ?? null, "USD"),
    },
    {
      label: "TCP Low",
      value: formatCurrency(card.price?.tcp_low ?? null, "USD"),
    },
  ];
  const [primaryCardMarketMetric, ...secondaryCardMarketMetrics] = cardMarketMetrics;
  const [primaryTcgMetric, ...secondaryTcgMetrics] = tcgMetrics;
  const activePrimaryMetric =
    activePricingSource === "tcgplayer" ? primaryTcgMetric : primaryCardMarketMetric;
  const activeSecondaryMetrics =
    activePricingSource === "tcgplayer" ? secondaryTcgMetrics : secondaryCardMarketMetrics;

  return (
    <div className="card-modal-current-pricing-panel mt-4 border-t border-white/8 pt-4">
      <div className="card-modal-pricing-header mb-3 flex flex-col justify-start space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/36">
            Current pricing / {activePricingSource === "tcgplayer" ? "TCGPlayer" : "CardMarket"}
          </p>

          {activePricingSource === "cardmarket" && !hasMultipleCardMarketSeries && (
            <MetaPill>{activeCardMarketSeriesLabel}</MetaPill>
          )}
        </div>

        {activePricingSource === "cardmarket" && hasMultipleCardMarketSeries && (
          <div className="card-modal-series-picker flex flex-wrap gap-2">
            {availableCardMarketHistorySeries.map((series) => (
              <button
                key={series.key}
                type="button"
                onClick={() => onSelectCardMarketHistorySeries(series.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  activeCardMarketHistorySeries === series.key
                    ? "border-white/24 bg-white/14 text-white"
                    : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                }`}
              >
                {series.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card-modal-pricing-metrics grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <MetricTile
          label={activePrimaryMetric.label}
          value={activePrimaryMetric.value}
          hint={activePrimaryMetric.hint ?? null}
          accent={activePricingSource === "tcgplayer" ? "blue" : "emerald"}
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

export function CardModalPricingSection({
  gradedPrices,
  ebaySoldGradedPrices,
  gradingCompanyLabel,
  gradingGradeLabel,
  selectedGradedPrice,
  selectedEbaySoldGradedPrice,
  onSelectGradedLabel,
  onSelectEbaySoldGradedLabel,
}: {
  gradedPrices: Array<{ label: string; price: number }>;
  ebaySoldGradedPrices: NonNullable<ModalCardData["ebay_sold_graded_prices"]>;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  selectedGradedPrice: { label: string; price: number } | null;
  selectedEbaySoldGradedPrice:
    | NonNullable<ModalCardData["ebay_sold_graded_prices"]>[number]
    | null;
  onSelectGradedLabel: (label: string) => void;
  onSelectEbaySoldGradedLabel: (label: string) => void;
}) {
  const hasCardMarketGradedPricing = gradedPrices.length > 0;
  const hasEbayGradedPricing = ebaySoldGradedPrices.length > 0;
  const [activeGradedSource, setActiveGradedSource] = useState<"cardmarket" | "ebay">(
    "cardmarket"
  );
  const effectiveGradedSource =
    activeGradedSource === "ebay" && hasEbayGradedPricing
      ? "ebay"
      : hasCardMarketGradedPricing
        ? "cardmarket"
        : "ebay";
  const showGradedSourceToggle = hasCardMarketGradedPricing && hasEbayGradedPricing;
  const selectedEbaySoldCurrency = selectedEbaySoldGradedPrice?.currency === "EUR" ? "EUR" : "USD";
  const selectedEbaySoldMedianEur =
    selectedEbaySoldGradedPrice?.median_price_eur ??
    (selectedEbaySoldGradedPrice?.currency === "EUR"
      ? selectedEbaySoldGradedPrice.median_price
      : null);
  const selectedEbaySoldDisplayCurrency = selectedEbaySoldMedianEur != null ? "EUR" : selectedEbaySoldCurrency;
  const selectedEbaySoldDisplayPrice =
    selectedEbaySoldMedianEur ?? selectedEbaySoldGradedPrice?.median_price ?? null;
  const selectedEbaySoldSampleLabel =
    selectedEbaySoldGradedPrice?.sample_size != null
      ? `${selectedEbaySoldGradedPrice.sample_size} sold`
      : "Sold median";
  const selectedEbaySoldOriginalLabel =
    selectedEbaySoldGradedPrice &&
    selectedEbaySoldGradedPrice.currency.toUpperCase() === "USD" &&
    selectedEbaySoldMedianEur != null
      ? `${formatCurrency(selectedEbaySoldGradedPrice.median_price, "USD")} USD`
      : null;
  const ownedGradeLabel =
    gradingCompanyLabel && gradingGradeLabel ? `${gradingCompanyLabel} ${gradingGradeLabel}` : null;
  const selectedEbaySoldMetaLabel = [selectedEbaySoldSampleLabel, selectedEbaySoldOriginalLabel]
    .filter(Boolean)
    .join(" / ");

  if (!hasCardMarketGradedPricing && !hasEbayGradedPricing) {
    return null;
  }

  return (
    <SectionShell title="Graded pricing">
      <div className="card-modal-compare-card rounded-[24px] border border-white/10 bg-black/24 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              {showGradedSourceToggle ? (
                <div className="card-modal-source-toggle inline-flex overflow-hidden rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {[
                    { key: "cardmarket" as const, label: "CardMarket" },
                    { key: "ebay" as const, label: "eBay sold" },
                  ].map((source) => (
                    <button
                      key={source.key}
                      type="button"
                      onClick={() => setActiveGradedSource(source.key)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        effectiveGradedSource === source.key
                          ? "bg-white text-gray-950"
                          : "text-white/48 hover:text-white/78"
                      }`}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/36">
                  {effectiveGradedSource === "ebay" ? "eBay graded" : "CardMarket graded"}
                </p>
              )}

              {effectiveGradedSource === "ebay" && (
                <MetaPill>{selectedEbaySoldDisplayCurrency}</MetaPill>
              )}
            </div>

            <p className="mt-1.5 text-sm text-white/42">
              {effectiveGradedSource === "ebay"
                ? ownedGradeLabel
                  ? `Completed sales median. Owned grade: ${ownedGradeLabel}`
                  : "Completed sales median for the selected grade."
                : ownedGradeLabel
                  ? `Owned grade: ${ownedGradeLabel}`
                  : "Select a benchmark grade for comparison."}
            </p>
          </div>

          {effectiveGradedSource === "cardmarket" ? (
            hasCardMarketGradedPricing && gradedPrices.length > 1 ? (
              <select
                value={selectedGradedPrice?.label ?? ""}
                onChange={(event) => onSelectGradedLabel(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-base font-medium text-white outline-none transition-colors focus:border-white/18"
              >
                {gradedPrices.map((gradedPrice) => (
                  <option
                    key={gradedPrice.label}
                    value={gradedPrice.label}
                    className="bg-[#111214] text-white"
                  >
                    {gradedPrice.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-2xl border border-violet-400/16 bg-violet-400/[0.08] px-4 py-3 text-base font-semibold text-white/78">
                {selectedGradedPrice?.label ?? gradedPrices[0]?.label ?? "Graded"}
              </div>
            )
          ) : ebaySoldGradedPrices.length > 1 ? (
            <select
              value={selectedEbaySoldGradedPrice?.label ?? ""}
              onChange={(event) => onSelectEbaySoldGradedLabel(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-base font-medium text-white outline-none transition-colors focus:border-white/18"
            >
              {ebaySoldGradedPrices.map((gradedPrice) => (
                <option
                  key={gradedPrice.label}
                  value={gradedPrice.label}
                  className="bg-[#111214] text-white"
                >
                  {gradedPrice.label}
                  {gradedPrice.sample_size != null ? ` (${gradedPrice.sample_size})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-2xl border border-sky-400/16 bg-sky-400/[0.08] px-4 py-3 text-base font-semibold text-white/78">
              {selectedEbaySoldGradedPrice?.label ?? ebaySoldGradedPrices[0]?.label ?? "eBay"}
            </div>
          )}

          {effectiveGradedSource === "cardmarket" ? (
            selectedGradedPrice && (
              <p className="shrink-0 rounded-2xl border border-violet-400/16 bg-violet-400/[0.08] px-4 py-3 text-right text-2xl font-semibold tabular-nums text-white">
                {formatCurrency(selectedGradedPrice.price, "EUR")}
              </p>
            )
          ) : selectedEbaySoldGradedPrice ? (
            <div className="shrink-0 rounded-2xl border border-sky-400/16 bg-sky-400/[0.08] px-4 py-3 text-right">
              <p className="text-2xl font-semibold tabular-nums text-white">
                {formatCurrency(selectedEbaySoldDisplayPrice, selectedEbaySoldDisplayCurrency)}
              </p>
              <p className="mt-1 text-sm font-medium text-white/48">
                {selectedEbaySoldMetaLabel}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </SectionShell>
  );
}

export function CardModalHistorySection({
  historyChartMode,
  activeMarketSource,
  cardMarketHistory,
  activeCardMarketCurrentValue,
  ignoredCardMarketCurrentValue,
  showTcgPlayerSource,
  card,
  availableCardMarketHistorySeries,
  activeCardMarketHistorySeries,
  activeCardMarketSeriesLabel,
  onSelectMarketSource,
  onSelectCardMarketHistorySeries,
  onSelectHistoryChartMode,
  tcgPlayerHistory,
  tcgPlayerCurrentValue,
  gradedPriceHistory,
  selectedGradedHistory,
  selectedGradedHistoryCurrentValue,
  onSelectGradedLabel,
}: {
  historyChartMode: "market" | "graded";
  activeMarketSource: "cardmarket" | "tcgplayer";
  cardMarketHistory: HistoryPointView[];
  activeCardMarketCurrentValue: number | null;
  ignoredCardMarketCurrentValue: number | null;
  showTcgPlayerSource: boolean;
  card: ModalCardData;
  availableCardMarketHistorySeries: Array<{
    key: CardMarketHistorySeriesKey;
    label: string;
  }>;
  activeCardMarketHistorySeries: CardMarketHistorySeriesKey;
  activeCardMarketSeriesLabel: string;
  onSelectMarketSource: (source: "cardmarket" | "tcgplayer") => void;
  onSelectCardMarketHistorySeries: (series: CardMarketHistorySeriesKey) => void;
  onSelectHistoryChartMode: (mode: "market" | "graded") => void;
  tcgPlayerHistory: HistoryPointView[];
  tcgPlayerCurrentValue: number | null;
  gradedPriceHistory: CardGradedPriceHistorySeries[];
  selectedGradedHistory: CardGradedPriceHistorySeries | null;
  selectedGradedHistoryCurrentValue: number | null;
  onSelectGradedLabel: (label: string) => void;
}) {
  const hasGradedHistory = gradedPriceHistory.some((series) =>
    series.points.some((point) => point.value != null)
  );
  const effectiveHistoryChartMode = hasGradedHistory ? historyChartMode : "market";
  const activeMarketHistory =
    activeMarketSource === "tcgplayer"
      ? {
          currency: "USD" as const,
          currentValue: tcgPlayerCurrentValue,
          points: tcgPlayerHistory,
          title: "TCGPlayer History",
        }
      : {
          currency: "EUR" as const,
          currentValue: activeCardMarketCurrentValue,
          points: cardMarketHistory,
          title: "CardMarket History",
        };

  return (
    <SectionShell className="overflow-hidden">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            Price history
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">History charts</h3>
        </div>

        {showTcgPlayerSource && (
          <div className="card-modal-source-toggle inline-flex overflow-hidden rounded-full border border-white/10 bg-white/[0.04] p-1">
            {[
              { key: "cardmarket" as const, label: "CardMarket" },
              { key: "tcgplayer" as const, label: "TCGPlayer" },
            ].map((source) => (
              <button
                key={source.key}
                type="button"
                onClick={() => onSelectMarketSource(source.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeMarketSource === source.key
                    ? "bg-white text-gray-950"
                    : "text-white/48 hover:text-white/78"
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 overflow-hidden">
          {hasGradedHistory && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {[
                { key: "market" as const, label: "Raw prices" },
                { key: "graded" as const, label: "Graded" },
              ].map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => onSelectHistoryChartMode(mode.key)}
                  className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    effectiveHistoryChartMode === mode.key
                      ? "border-white/24 bg-white/14 text-white"
                      : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}

          {effectiveHistoryChartMode === "graded" && selectedGradedHistory ? (
            <div className="space-y-4 pb-1">
              {gradedPriceHistory.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {gradedPriceHistory.map((series) => (
                    <button
                      key={series.label}
                      type="button"
                      onClick={() => onSelectGradedLabel(series.label)}
                      className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        selectedGradedHistory.label === series.label
                          ? "border-violet-300/30 bg-violet-400/16 text-violet-100"
                          : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                      }`}
                    >
                      {series.label}
                    </button>
                  ))}
                </div>
              )}

              <PriceHistoryPanel
                title={`${selectedGradedHistory.label} History`}
                currency="EUR"
                points={selectedGradedHistory.points}
                currentValue={selectedGradedHistoryCurrentValue}
                tone="dark"
              />
            </div>
          ) : (
            <PriceHistoryPanel
              title={activeMarketHistory.title}
              currency={activeMarketHistory.currency}
              points={activeMarketHistory.points}
              currentValue={activeMarketHistory.currentValue}
              tone="dark"
            />
          )}
      </div>

      <CardModalCurrentPricingPanel
        card={card}
        activePricingSource={activeMarketSource}
        availableCardMarketHistorySeries={availableCardMarketHistorySeries}
        activeCardMarketHistorySeries={activeCardMarketHistorySeries}
        activeCardMarketSeriesLabel={activeCardMarketSeriesLabel}
        activeCardMarketCurrentValue={activeCardMarketCurrentValue}
        ignoredCardMarketCurrentValue={ignoredCardMarketCurrentValue}
        onSelectCardMarketHistorySeries={onSelectCardMarketHistorySeries}
      />
    </SectionShell>
  );
}

export function CardModalFooter({
  card,
  collectionItem,
  footerGridClass,
  storedCardMarketUrl,
  onOpenCardMarket,
  onClose,
}: {
  card: ModalCardData;
  collectionItem: ModalCardCollectionItem | null;
  footerGridClass: string;
  storedCardMarketUrl: string | null;
  onOpenCardMarket: () => void;
  onClose: () => void;
}) {
  const collectionCard = buildCollectionCard(card);

  return (
    <div className={footerGridClass}>
      <CollectionAddCardButton
        card={collectionCard}
        mode="button"
        theme="dark"
        label="Add to DustyCards"
        className="rounded-2xl"
      />

      {collectionItem && (
        <CollectionEditCardButton
          card={collectionCard}
          item={collectionItem}
          mode="button"
          theme="dark"
          label="Edit card"
          className="rounded-2xl"
          onSaved={onClose}
        />
      )}

      {storedCardMarketUrl ? (
        <a
          href={storedCardMarketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Open CardMarket
        </a>
      ) : (
        <button
          type="button"
          onClick={onOpenCardMarket}
          className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Open CardMarket
        </button>
      )}
    </div>
  );
}
