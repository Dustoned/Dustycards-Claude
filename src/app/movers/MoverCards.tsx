"use client";

import Image from "next/image";
import Link from "next/link";
import { memo } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { rarityBadge, formatCurrency } from "@/components/card-modal/utils";
import { getFixedTrackGridTemplate } from "@/lib/display-scale";
import type { CollectionMoverItem, MoverRecentPricePoint } from "@/lib/movers";

interface PreviewCardConfig {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  hrefLabel?: string;
  items: CollectionMoverItem[];
}

interface SpotlightConfig {
  title: string;
  item: CollectionMoverItem | null;
  windowKey: "7d" | "30d";
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined, currency: "EUR" | "USD"): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

function formatOptionalCurrency(
  value: number | null | undefined,
  currency: "EUR" | "USD"
): string {
  return value == null ? "--" : formatCurrency(value, currency);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function sourcePillClasses(source: CollectionMoverItem["source"]) {
  return source === "tcgplayer"
    ? "border-blue-400/18 bg-blue-400/[0.08] text-blue-700 dark:text-blue-200"
    : "border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200";
}

function getToneClass(value: number | null | undefined): string {
  if (value == null) {
    return "text-gray-500 dark:text-white/45";
  }

  if (value < 0) {
    return "text-rose-600 dark:text-rose-300";
  }

  if (value > 0) {
    return "text-emerald-600 dark:text-emerald-300";
  }

  return "text-gray-500 dark:text-white/45";
}

function getSparklineColor(value: number | null | undefined): string {
  if (value != null && value < 0) {
    return "#fb7185";
  }

  return "#10b981";
}

function getScorePillClass(value: number): string {
  if (value < 0) {
    return "border-rose-400/16 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200";
  }

  if (value > 0) {
    return "border-violet-400/16 bg-violet-400/[0.08] text-violet-700 dark:text-violet-200";
  }

  return "border-black/8 bg-black/[0.04] text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60";
}

function stopCardOpen(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function isNestedInteractiveTarget(event: KeyboardEvent<HTMLElement>): boolean {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }

  return (
    event.target !== event.currentTarget &&
    Boolean(event.target.closest("a,button,input,select,textarea"))
  );
}

function handleOpenKey(event: KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (isNestedInteractiveTarget(event)) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onOpen();
}

const MiniPriceSparkline = memo(function MiniPriceSparkline({
  series,
  toneValue,
}: {
  series: MoverRecentPricePoint[];
  toneValue: number | null | undefined;
}) {
  if (series.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-black/10 text-[11px] text-gray-400 dark:border-white/10 dark:text-white/35">
        No chart yet
      </div>
    );
  }

  const width = 220;
  const height = 64;
  const padding = 6;
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = series
    .map((point, index) => {
      const x =
        padding +
        (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
      const y = padding + ((max - point.value) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = getSparklineColor(toneValue);
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <div className="rounded-xl border border-black/8 bg-white/72 px-2.5 py-2 dark:border-white/8 dark:bg-white/[0.045]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-gray-400 dark:text-white/35">
        <span className="truncate">{first.label}</span>
        <span className="truncate text-right">{last.label}</span>
      </div>
    </div>
  );
});

function PriceSourceRow({
  label,
  value,
  currency,
  points,
  active,
}: {
  label: string;
  value: number | null;
  currency: "EUR" | "USD";
  points: number;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        active
          ? "border-emerald-400/20 bg-emerald-400/[0.08]"
          : "border-black/8 bg-white/70 dark:border-white/8 dark:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/34">
            {label}
          </p>
          <p className="mt-1 truncate text-sm font-bold tabular-nums text-gray-900 dark:text-white">
            {formatOptionalCurrency(value, currency)}
          </p>
        </div>
        {active ? (
          <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-200">
            Active
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-white/42">
        {points.toLocaleString()} history points
      </p>
    </div>
  );
}

function MoverMetricCard({
  label,
  percent,
  delta,
  hint,
  currency,
}: {
  label: string;
  percent: number | null;
  delta: number | null;
  hint: string;
  currency: "EUR" | "USD";
}) {
  return (
    <div className="min-w-0 border-t border-black/8 pt-3 dark:border-white/8">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
          {label}
        </p>
        <p className={`text-right text-sm font-semibold tabular-nums leading-tight ${getToneClass(percent)}`}>
          {formatPercent(percent)}
        </p>
      </div>
      <p className={`mt-1 truncate text-sm font-semibold leading-tight ${getToneClass(delta)}`}>
        {formatDelta(delta, currency)}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500 dark:text-white/42">
        {hint}
      </p>
    </div>
  );
}

const MoverTile = memo(function MoverTile({
  item,
  isLoading,
  onOpen,
}: {
  item: CollectionMoverItem;
  isLoading: boolean;
  onOpen: (cardId: string) => void;
}) {
  const open = () => onOpen(item.cardId);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => handleOpenKey(event, open)}
      aria-label={`Open details for ${item.name}`}
      className="group relative cursor-pointer rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 outline-none transition hover:-translate-y-0.5 hover:border-black/14 hover:bg-black/[0.045] focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06]"
    >
      {isLoading ? (
        <div className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white/90 text-gray-700 shadow-sm dark:border-white/10 dark:bg-black/80 dark:text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-black/8 bg-black/5 dark:border-white/10 dark:bg-white/[0.05]">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="80px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
              {item.name.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate pr-1 text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                {item.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-white/46">
                <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
                <span>/</span>
                <Link
                  href={`/expansions/${item.episodeId}`}
                  onClick={stopCardOpen}
                  className="truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
                >
                  {item.episodeName}
                  {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
                </Link>
              </div>
            </div>

            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourcePillClasses(
                item.source
              )}`}
            >
              {item.sourceLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.normalizedRarity ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${rarityBadge(
                  item.normalizedRarity
                )}`}
              >
                {item.normalizedRarity}
              </span>
            ) : null}
            <span className="inline-flex rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60">
              x{item.ownedCount} owned
            </span>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${getScorePillClass(
                item.moverScore
              )}`}
            >
              Score {item.moverScore.toFixed(1)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-2xl border border-emerald-400/14 bg-emerald-400/[0.08] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-200/72">
                    Current
                  </p>
                  <p className="mt-2 truncate text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatCurrency(item.currentPrice, item.currency)}
                  </p>
                </div>
                <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700/60 dark:text-emerald-200/60" />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/46">
                Updated {formatShortDate(item.latestFetchedAt)}
              </p>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-white/42">
                {item.historyPoints} recent / {item.lifetimeHistoryPoints} lifetime points
              </p>
            </div>

            <MiniPriceSparkline series={item.recentPriceSeries} toneValue={item.moverScore} />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <PriceSourceRow
              label="CardMarket"
              value={item.cardmarketPrice}
              currency="EUR"
              points={item.cardmarketHistoryPoints}
              active={item.source === "cardmarket"}
            />
            <PriceSourceRow
              label="TCGPlayer"
              value={item.tcgplayerPrice}
              currency="USD"
              points={item.tcgplayerHistoryPoints}
              active={item.source === "tcgplayer"}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MoverMetricCard
              label="7D"
              percent={item.change7dPct}
              delta={item.change7d}
              currency={item.currency}
              hint={item.change7dCoveredDays ? `${item.change7dCoveredDays}d window` : "Recent window"}
            />
            <MoverMetricCard
              label="30D"
              percent={item.change30dPct}
              delta={item.change30d}
              currency={item.currency}
              hint={item.change30dCoveredDays ? `${item.change30dCoveredDays}d window` : "Recent window"}
            />
            <MoverMetricCard
              label="Since Tracked"
              percent={item.changeSinceTrackedPct}
              delta={item.changeSinceTracked}
              currency={item.currency}
              hint={
                item.firstTrackedAt
                  ? `Started ${formatShortDate(item.firstTrackedAt)}${
                      item.trackedDays != null ? ` / ${item.trackedDays}d` : ""
                    }`
                  : item.trackedDays != null
                    ? `${item.trackedDays}d tracked`
                    : "No lifetime window"
              }
            />
            <MoverMetricCard
              label="From Low"
              percent={item.changeFromLowPct}
              delta={item.changeFromLow}
              currency={item.currency}
              hint={
                item.lowPrice != null
                  ? `Low ${formatCurrency(item.lowPrice, item.currency)}${
                      item.lowAt ? ` / ${formatShortDate(item.lowAt)}` : ""
                    }`
                  : "No low recorded"
              }
            />
            <MoverMetricCard
              label="Vs Peak"
              percent={item.gapToPeakPct}
              delta={item.gapToPeak}
              currency={item.currency}
              hint={
                item.highPrice != null
                  ? `Peak ${formatCurrency(item.highPrice, item.currency)}${
                      item.highAt ? ` / ${formatShortDate(item.highAt)}` : ""
                    }`
                  : "No peak recorded"
              }
            />
            <div className="min-w-0 border-t border-black/8 pt-3 dark:border-white/8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
                Weight
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-white/46">
                <span className="rounded-lg bg-black/[0.035] px-2 py-1 dark:bg-white/[0.04]">
                  Rarity {item.rarityWeight.toFixed(2)}
                </span>
                <span className="rounded-lg bg-black/[0.035] px-2 py-1 dark:bg-white/[0.04]">
                  Price {item.cheapnessWeight.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});

function MoverSpotlightCard({
  title,
  item,
  windowKey,
  isLoading,
  onOpenCard,
}: {
  title: string;
  item: CollectionMoverItem | null;
  windowKey: "7d" | "30d";
  isLoading: boolean;
  onOpenCard: (cardId: string) => void;
}) {
  const pct = windowKey === "7d" ? item?.change7dPct ?? null : item?.change30dPct ?? null;
  const delta = windowKey === "7d" ? item?.change7d ?? null : item?.change30d ?? null;
  const coveredDays =
    windowKey === "7d" ? item?.change7dCoveredDays ?? null : item?.change30dCoveredDays ?? null;
  const open = () => {
    if (item) {
      onOpenCard(item.cardId);
    }
  };

  return (
    <article
      role={item ? "button" : undefined}
      tabIndex={item ? 0 : undefined}
      onClick={item ? open : undefined}
      onKeyDown={item ? (event) => handleOpenKey(event, open) : undefined}
      className={`relative rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 outline-none transition dark:border-white/8 dark:bg-white/[0.04] ${
        item
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-black/14 hover:bg-black/[0.045] focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:hover:border-white/16 dark:hover:bg-white/[0.06]"
          : ""
      }`}
    >
      {isLoading ? (
        <div className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white/90 text-gray-700 shadow-sm dark:border-white/10 dark:bg-black/80 dark:text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/38">
        {title}
      </p>

      {item ? (
        <div className="mt-3 flex items-start gap-3">
          <div className="relative h-[4.5rem] w-14 shrink-0 overflow-hidden rounded-xl border border-black/8 bg-black/5 dark:border-white/10 dark:bg-white/[0.05]">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-contain"
                sizes="56px"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
                {item.name.slice(0, 2)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
              {item.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-white/46">
              <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
              <span>/</span>
              <Link
                href={`/expansions/${item.episodeId}`}
                onClick={stopCardOpen}
                className="truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
              >
                {item.episodeName}
                {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.normalizedRarity ? (
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${rarityBadge(
                    item.normalizedRarity
                  )}`}
                >
                  {item.normalizedRarity}
                </span>
              ) : null}
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourcePillClasses(item.source)}`}>
                {item.sourceLabel}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold tabular-nums ${getToneClass(pct)}`}>
              {formatPercent(pct)}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-white/48">
              {formatDelta(delta, item.currency)}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-white/32">
              {coveredDays != null ? `${coveredDays}d used` : "Recent"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-white/48">
          Nog niet genoeg recente history om hier een duidelijke winnaar te tonen.
        </p>
      )}
    </article>
  );
}

function PocketPreviewCard({
  title,
  eyebrow,
  description,
  items,
  href,
  hrefLabel = "Open page",
  loadingCardId,
  onOpenCard,
}: {
  title: string;
  eyebrow: string;
  description: string;
  items: CollectionMoverItem[];
  href: string;
  hrefLabel?: string;
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/36">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/48">{description}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {items.length.toLocaleString()}
          </p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-white/34">
            cards
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.slice(0, 4).map((item) => {
          const isLoading = loadingCardId === item.cardId;

          return (
            <button
              key={`${href}-${item.cardId}`}
              type="button"
              onClick={() => onOpenCard(item.cardId)}
              className="min-w-0 rounded-2xl border border-black/8 bg-white/75 px-3 py-3 text-left outline-none transition hover:border-black/14 hover:bg-white focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:border-white/8 dark:bg-white/[0.05] dark:hover:border-white/16 dark:hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {item.name}
                </p>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${getToneClass(item.moverScore)}`}>
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {item.moverScore >= 0 ? "+" : ""}
                  {item.moverScore.toFixed(1)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-white/46">
                <span className="truncate">
                  {item.episodeName}
                  {item.episodeCode ? ` (${item.episodeCode})` : ""}
                </span>
                <span>{formatCurrency(item.currentPrice, item.currency)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <Link
          href={href}
          className="inline-flex items-center rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-black/16 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/75 dark:hover:border-white/16 dark:hover:text-white"
        >
          {hrefLabel}
        </Link>
      </div>
    </article>
  );
}

export function MoverSpotlightSections({
  spotlights,
  previewCards,
  loadingCardId,
  onOpenCard,
}: {
  spotlights: SpotlightConfig[];
  previewCards: PreviewCardConfig[];
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <>
      {spotlights.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {spotlights.map((spotlight) => (
            <MoverSpotlightCard
              key={`${spotlight.title}-${spotlight.item?.cardId ?? "none"}`}
              title={spotlight.title}
              item={spotlight.item}
              windowKey={spotlight.windowKey}
              isLoading={loadingCardId === spotlight.item?.cardId}
              onOpenCard={onOpenCard}
            />
          ))}
        </section>
      ) : null}

      {previewCards.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {previewCards.map((card) => (
            <PocketPreviewCard
              key={card.href}
              eyebrow={card.eyebrow}
              title={card.title}
              description={card.description}
              items={card.items}
              href={card.href}
              hrefLabel={card.hrefLabel}
              loadingCardId={loadingCardId}
              onOpenCard={onOpenCard}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

export function MoverGrid({
  movers,
  minTileWidth,
  loadingCardId,
  onOpenCard,
}: {
  movers: readonly CollectionMoverItem[];
  minTileWidth: string;
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: getFixedTrackGridTemplate(minTileWidth),
        justifyContent: "start",
      }}
    >
      {movers.map((item) => (
        <MoverTile
          key={item.cardId}
          item={item}
          isLoading={loadingCardId === item.cardId}
          onOpen={onOpenCard}
        />
      ))}
    </div>
  );
}
