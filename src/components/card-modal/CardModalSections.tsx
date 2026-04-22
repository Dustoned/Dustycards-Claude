"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, LineChart, RefreshCw } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import GradedSlabPreview from "@/components/GradedSlabPreview";
import IllustratorLink from "@/components/IllustratorLink";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import { type SupportedGradedSlabCompany } from "@/lib/graded-slabs";
import { type CardMarketHistorySeriesKey } from "@/lib/price-history";
import { normalizeRarityLabel } from "@/lib/rarity";
import { formatCurrency, rarityBadge } from "./utils";
import type { ModalCardCollectionItem, ModalCardData } from "./types";

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
      : accent === "blue"
        ? "border-blue-400/16 bg-blue-400/[0.08]"
        : accent === "violet"
          ? "border-violet-400/16 bg-violet-400/[0.08]"
          : "border-white/10 bg-black/22";

  return (
    <div className={`rounded-2xl border px-3 py-3 ${accentClass} ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/42">{hint}</p>}
    </div>
  );
}

function MarketRow({ label, value, hint }: MarketRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">{label}</p>
        {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
      </div>
      <p className="shrink-0 text-base font-semibold tabular-nums text-white">{value}</p>
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
    <aside className={`mx-auto flex h-full w-full max-w-full flex-col gap-4 lg:mx-0 ${mediaWidth}`}>
      {card.image_url ? (
        <button
          type="button"
          onClick={onOpenThreeD}
          className={`group relative ${previewAspectClass} w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-transform hover:scale-[1.01]`}
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
              src={card.image_url}
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
          className={`${previewAspectClass} flex w-full items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.03] text-white/30`}
        >
          ?
        </div>
      )}

      <PriceRefreshCountdown
        rarity={card.rarity}
        priceFetchedAt={card.price_fetched_at}
        priceSourceStatus={card.price_source_status}
        priceSourceCheckedAt={card.price_source_checked_at}
        compact
      />
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
            onClick={onClose}
            className="inline-flex max-w-full items-center text-sm font-medium text-white/84 transition-colors hover:text-white hover:underline underline-offset-2"
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
  ];
  const collectionStats = [
    {
      label: "Purchase",
      value:
        collectionItem?.purchase_price != null
          ? formatCurrency(collectionItem.purchase_price, "EUR")
          : "--",
      show: collectionItem?.purchase_price != null,
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
            <h2 className={`${titleClass} leading-[0.98] font-bold text-white`}>{card.name}</h2>

            <div className={`mt-3 flex flex-wrap items-center gap-2.5 text-white/54 ${metaClassName}`}>
              {headerMetaLabel && (
                <span className="whitespace-nowrap font-medium text-white/58">{headerMetaLabel}</span>
              )}
              {normalizedRarity && (
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${rarityBadge(
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

          <div className="flex flex-wrap gap-2 xl:justify-self-end xl:self-start">
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

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {headerDetailStats.map((stat) => (
            <div key={stat.label} className={detailStatClass}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                {stat.label}
              </p>
              <div className="mt-1.5 text-sm font-medium text-white/84">{stat.value}</div>
            </div>
          ))}
        </div>

        {collectionItem ? (
          <>
            {collectionTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {collectionTags.map((tag) => (
                  <MetaPill key={tag}>{tag}</MetaPill>
                ))}
              </div>
            )}

            {collectionItem.notes && (
              <div className={`mt-3 ${detailStatClass}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                  Notes
                </p>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm text-white/72">
                  {collectionItem.notes}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="mt-3 rounded-[20px] border border-dashed border-white/8 bg-black/12 px-3 py-3 text-sm text-white/56">
            Add this card to DustyCards to save purchase details, condition, language and notes.
          </div>
        )}

        {refreshError && <p className="mt-4 text-sm text-rose-300">{refreshError}</p>}
      </div>
    </SectionShell>
  );
}

export function CardModalPricingSection({
  card,
  availableCardMarketHistorySeries,
  activeCardMarketHistorySeries,
  activeCardMarketSeriesLabel,
  activeCardMarketCurrentValue,
  gradedPrices,
  gradingCompanyLabel,
  gradingGradeLabel,
  selectedGradedPrice,
  onSelectCardMarketHistorySeries,
  onSelectGradedLabel,
}: {
  card: ModalCardData;
  availableCardMarketHistorySeries: Array<{
    key: CardMarketHistorySeriesKey;
    label: string;
  }>;
  activeCardMarketHistorySeries: CardMarketHistorySeriesKey;
  activeCardMarketSeriesLabel: string;
  activeCardMarketCurrentValue: number | null;
  gradedPrices: Array<{ label: string; price: number }>;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  selectedGradedPrice: { label: string; price: number } | null;
  onSelectCardMarketHistorySeries: (series: CardMarketHistorySeriesKey) => void;
  onSelectGradedLabel: (label: string) => void;
}) {
  const hasMultipleCardMarketSeries = availableCardMarketHistorySeries.length > 1;
  const cardMarketMetrics: PriceMetric[] = [
    {
      label: "Current",
      value: formatCurrency(activeCardMarketCurrentValue, "EUR"),
      hint:
        hasMultipleCardMarketSeries ? `Using ${activeCardMarketSeriesLabel}` : null,
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
  const hasTcgPlayerPricing = [card.price?.tcp_market, card.price?.tcp_mid, card.price?.tcp_low].some(
    (value) => value != null
  );
  const [primaryCardMarketMetric, ...secondaryCardMarketMetrics] = cardMarketMetrics;
  const [primaryTcgMetric, ...secondaryTcgMetrics] = tcgMetrics;

  return (
    <SectionShell title="Current pricing">
      <div className={`grid gap-4 ${hasTcgPlayerPricing ? "xl:grid-cols-2" : ""}`}>
        <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
          <div className="mb-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                CardMarket
              </p>
              {!hasMultipleCardMarketSeries && <MetaPill>{activeCardMarketSeriesLabel}</MetaPill>}
            </div>
            {hasMultipleCardMarketSeries && (
              <div className="flex flex-wrap gap-1.5">
                {availableCardMarketHistorySeries.map((series) => (
                  <button
                    key={series.key}
                    type="button"
                    onClick={() => onSelectCardMarketHistorySeries(series.key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
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

          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <MetricTile
              label={primaryCardMarketMetric.label}
              value={primaryCardMarketMetric.value}
              hint={primaryCardMarketMetric.hint ?? null}
              accent="emerald"
              className="min-h-[108px]"
            />

            <div className="grid gap-3">
              {secondaryCardMarketMetrics.map((metric) => (
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

        {hasTcgPlayerPricing && (
          <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                TCGPlayer
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <MetricTile
                label={primaryTcgMetric.label}
                value={primaryTcgMetric.value}
                accent="blue"
                className="min-h-[108px]"
              />

              <div className="grid gap-3">
                {secondaryTcgMetrics.map((metric) => (
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
        )}
      </div>

      {gradedPrices.length > 0 && (
        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/24 p-3.5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                Graded
              </p>
              {gradingCompanyLabel && gradingGradeLabel && (
                <p className="mt-1 text-xs text-white/42">
                  Saved grade {gradingCompanyLabel} {gradingGradeLabel}
                </p>
              )}
            </div>

            {gradedPrices.length > 1 ? (
              <select
                value={selectedGradedPrice?.label ?? ""}
                onChange={(event) => onSelectGradedLabel(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm font-medium text-white outline-none transition-colors focus:border-white/18"
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
              <div className="rounded-2xl border border-violet-400/16 bg-violet-400/[0.08] px-3 py-2.5 text-sm font-semibold text-white/78">
                {selectedGradedPrice?.label ?? gradedPrices[0]?.label ?? "Graded"}
              </div>
            )}

            {selectedGradedPrice && (
              <p className="shrink-0 rounded-2xl border border-violet-400/16 bg-violet-400/[0.08] px-3 py-2.5 text-right text-xl font-semibold tabular-nums text-white">
                {formatCurrency(selectedGradedPrice.price, "EUR")}
              </p>
            )}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

export function CardModalHistorySection({
  cardId,
  historyChartsOpen,
  cardMarketHistory,
  activeCardMarketCurrentValue,
  onToggleHistoryCharts,
  tcgPlayerHistory,
  tcgPlayerCurrentValue,
}: {
  cardId: string;
  historyChartsOpen: boolean;
  cardMarketHistory: HistoryPointView[];
  activeCardMarketCurrentValue: number | null;
  onToggleHistoryCharts: () => void;
  tcgPlayerHistory: HistoryPointView[];
  tcgPlayerCurrentValue: number | null;
}) {
  return (
    <SectionShell className="overflow-hidden">
      <button
        type="button"
        onClick={onToggleHistoryCharts}
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={historyChartsOpen}
        aria-controls={`history-charts-${cardId}`}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            Price history
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">History charts</h3>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/68">
          {historyChartsOpen ? "Hide" : "Show"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${historyChartsOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {historyChartsOpen && (
        <div id={`history-charts-${cardId}`} className="mt-4 grid gap-4 xl:grid-cols-2">
          <PriceHistoryPanel
            title="CardMarket History"
            currency="EUR"
            points={cardMarketHistory}
            currentValue={activeCardMarketCurrentValue}
            tone="dark"
          />

          <PriceHistoryPanel
            title="TCGPlayer History"
            currency="USD"
            points={tcgPlayerHistory}
            currentValue={tcgPlayerCurrentValue}
            tone="dark"
          />
        </div>
      )}
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
