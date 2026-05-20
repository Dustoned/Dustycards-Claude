"use client";

import Image from "next/image";
import Link from "next/link";
import { memo } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { rarityBadge, formatCurrency } from "@/components/card-modal/utils";
import { getFixedTrackGridTemplate } from "@/lib/display-scale";
import { getExpansionHref } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CollectionMoverItem } from "@/lib/movers";

interface PreviewCardConfig {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  hrefLabel?: string;
  items: CollectionMoverItem[];
  reasonMode?: "raw" | "graded" | "target";
}

interface SpotlightConfig {
  title: string;
  item: CollectionMoverItem | null;
  windowKey: "7d" | "30d";
}

type TrendTone = "negative" | "positive" | "neutral";

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

function formatTileCurrency(value: number, currency: "EUR" | "USD"): string {
  if (Math.abs(value) >= 1000) {
    const symbol = currency === "EUR" ? "€" : "$";
    const sign = value < 0 ? "-" : "";
    const thousands = Math.abs(value) / 1000;
    const formatted =
      thousands >= 100
        ? thousands.toFixed(0)
        : thousands >= 10
          ? thousands.toFixed(0)
          : thousands.toFixed(1);

    return `${sign}${symbol}${formatted}K`;
  }

  if (Math.abs(value) >= 100) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  return formatCurrency(value, currency);
}

function formatTileDelta(value: number | null | undefined, currency: "EUR" | "USD"): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatTileCurrency(value, currency)}`;
}

function formatScoreValue(value: number): string {
  if (Math.abs(value) >= 100) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }

  return value.toFixed(1);
}

function formatOptionalScore(value: number | null | undefined): string {
  return value == null ? "--" : formatScoreValue(value);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function getTrendTone(value: number | null | undefined): TrendTone {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value < 0 ? "negative" : "positive";
}

function sourcePillClasses(source: CollectionMoverItem["source"], toneValue?: number | null) {
  if (getTrendTone(toneValue) === "negative") {
    return "border-rose-400/18 bg-rose-400/[0.08] text-rose-200";
  }

  if (source === "graded") {
    return "border-amber-400/18 bg-amber-400/[0.08] text-amber-200";
  }

  return source === "tcgplayer"
    ? "border-blue-400/18 bg-blue-400/[0.08] text-blue-200"
    : "border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-200";
}

function getToneClass(value: number | null | undefined): string {
  if (value == null) {
    return "text-white/45";
  }

  if (value < 0) {
    return "text-rose-300";
  }

  if (value > 0) {
    return "text-emerald-300";
  }

  return "text-white/45";
}


function getCurrentPanelClasses(tone: TrendTone): {
  panel: string;
  label: string;
  icon: string;
} {
  if (tone === "negative") {
    return {
      panel: "border-rose-400/14 bg-rose-400/[0.08]",
      label: "text-rose-700/80 dark:text-rose-200/72",
      icon: "text-rose-700/60 dark:text-rose-200/60",
    };
  }

  if (tone === "positive") {
    return {
      panel: "border-emerald-400/14 bg-emerald-400/[0.08]",
      label: "text-emerald-700/80 dark:text-emerald-200/72",
      icon: "text-emerald-700/60 dark:text-emerald-200/60",
    };
  }

  return {
    panel: "border-white/8 bg-white/[0.04]",
    label: "text-white/34",
    icon: "text-white/34",
  };
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







type MoverDisplayMode = "raw" | "graded" | "target";

type MoverReasonTone = "emerald" | "rose" | "amber" | "sky" | "violet";

interface MoverReason {
  label: string;
  tone: MoverReasonTone;
}

function reasonChipClass(tone: MoverReasonTone): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/22 bg-emerald-400/[0.10] text-emerald-200";
    case "rose":
      return "border-rose-400/22 bg-rose-400/[0.10] text-rose-200";
    case "amber":
      return "border-amber-400/22 bg-amber-400/[0.10] text-amber-200";
    case "sky":
      return "border-sky-400/22 bg-sky-400/[0.10] text-sky-200";
    case "violet":
      return "border-violet-400/22 bg-violet-400/[0.10] text-violet-200";
  }
}

/**
 * Picks 0-2 short, human-readable reasons explaining why a card is on the list.
 * Pure: only reads existing fields on the mover item.
 */
export function getMoverReasons(
  item: CollectionMoverItem,
  mode: MoverDisplayMode
): MoverReason[] {
  const reasons: MoverReason[] = [];

  if (item.priceQuality.status === "suspicious") {
    return [{ label: item.priceQuality.reason ?? "Outlier ignored", tone: "rose" }];
  }

  if (item.priceQuality.status === "thin_history") {
    return [{ label: item.priceQuality.reason ?? "Thin history", tone: "amber" }];
  }

  if (mode === "target" && item.grading) {
    if (item.grading.valueMultiplier != null && item.grading.valueMultiplier >= 3) {
      reasons.push({
        label: `${item.grading.valueMultiplier.toFixed(1)}x grade upside`,
        tone: "emerald",
      });
    } else if (item.grading.valueMultiplier != null && item.grading.valueMultiplier >= 2) {
      reasons.push({
        label: `${item.grading.valueMultiplier.toFixed(1)}x graded`,
        tone: "emerald",
      });
    }
    if (
      item.grading.valueGap != null &&
      item.grading.valueGap >= 100 &&
      reasons.length < 2
    ) {
      reasons.push({
        label: `+${formatCurrency(item.grading.valueGap, "EUR")} gap`,
        tone: "amber",
      });
    }
    if (item.olderValueScore >= 5 && reasons.length < 2) {
      reasons.push({
        label: item.gradedLabel?.includes("10") ? "Old cheap 10" : "Older value",
        tone: "sky",
      });
    }
    if (
      item.grading.rawPrice != null &&
      item.grading.rawPrice <= 10 &&
      reasons.length < 2
    ) {
      reasons.push({ label: "Cheap entry", tone: "violet" });
    }
    return reasons.slice(0, 2);
  }

  // raw or graded
  if (item.change7dPct != null && item.change7dPct >= 15) {
    reasons.push({ label: `+${item.change7dPct.toFixed(0)}% 7d`, tone: "emerald" });
  } else if (item.change30dPct != null && item.change30dPct >= 30) {
    reasons.push({ label: `+${item.change30dPct.toFixed(0)}% 30d`, tone: "emerald" });
  } else if (item.change7dPct != null && item.change7dPct <= -10) {
    reasons.push({ label: `${item.change7dPct.toFixed(0)}% 7d`, tone: "rose" });
  }

  if (
    item.gapToPeakPct != null &&
    item.gapToPeakPct <= -40 &&
    reasons.length < 2
  ) {
    reasons.push({
      label: `${Math.round(item.gapToPeakPct)}% off peak`,
      tone: "violet",
    });
  } else if (item.olderValueScore >= 5 && reasons.length < 2) {
    reasons.push({
      label: item.releaseAgeYears != null ? `${Math.floor(item.releaseAgeYears)}y value` : "Older value",
      tone: "sky",
    });
  } else if (
    item.currentPrice != null &&
    item.currentPrice <= 15 &&
    item.rarityWeight >= 1.15 &&
    reasons.length < 2
  ) {
    reasons.push({ label: "Cheap & rare", tone: "sky" });
  } else if (
    item.changeFromLowPct != null &&
    item.changeFromLowPct >= 30 &&
    item.change7dPct != null &&
    item.change7dPct > 0 &&
    reasons.length < 2
  ) {
    reasons.push({ label: "Off the floor", tone: "amber" });
  }

  if (reasons.length === 0 && item.movementScore > 0) {
    reasons.push({ label: "Recent move", tone: "emerald" });
  }

  return reasons.slice(0, 1);
}

function MoverReasonChips({
  item,
  mode,
}: {
  item: CollectionMoverItem;
  mode: MoverDisplayMode;
}) {
  const reasons = getMoverReasons(item, mode);
  if (reasons.length === 0) return null;

  return (
    <>
      {reasons.map((reason) => (
        <span
          key={reason.label}
          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${reasonChipClass(
            reason.tone
          )}`}
        >
          {reason.label}
        </span>
      ))}
    </>
  );
}

function CompactMetric({
  label,
  value,
  toneValue,
}: {
  label: string;
  value: string;
  toneValue?: number | null;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-bold tabular-nums ${getToneClass(toneValue)}`}>
        {value}
      </p>
    </div>
  );
}

function buildCompactMetrics(
  item: CollectionMoverItem,
  mode: MoverDisplayMode
): Array<{
  label: string;
  value: string;
  toneValue?: number | null;
}> {
  const all: Array<{ label: string; value: string; toneValue?: number | null } | null> = [];

  if (mode === "target" && item.grading) {
    all.push(
      item.tcggoScore?.score != null
        ? { label: "TCGGO", value: formatOptionalScore(item.tcggoScore.score) }
        : null,
      { label: "Raw CM", value: formatCurrency(item.grading.rawPrice, "EUR") },
      {
        label: item.gradedLabel ?? "Graded",
        value: formatTileCurrency(item.grading.gradedPrice, "EUR"),
      },
      item.grading.valueGap != null
        ? {
            label: "Gap",
            value: formatTileDelta(item.grading.valueGap, "EUR"),
            toneValue: item.grading.valueGap,
          }
        : null,
      item.grading.valueMultiplier != null
        ? {
            label: "Multiplier",
            value: `${item.grading.valueMultiplier.toFixed(2)}x`,
            toneValue: item.grading.valueMultiplier - 1,
          }
        : null
    );
  } else if (mode === "graded") {
    all.push(
      item.tcggoScore?.score != null
        ? { label: "TCGGO", value: formatOptionalScore(item.tcggoScore.score) }
        : null,
      item.change7dPct != null
        ? { label: "7D", value: formatPercent(item.change7dPct), toneValue: item.change7dPct }
        : null,
      item.change30dPct != null
        ? { label: "30D", value: formatPercent(item.change30dPct), toneValue: item.change30dPct }
        : null,
      item.changeSinceTrackedPct != null
        ? {
            label: "Since Tracked",
            value: formatPercent(item.changeSinceTrackedPct),
            toneValue: item.changeSinceTrackedPct,
          }
        : null,
      item.cardmarketPrice != null
        ? { label: "Raw CM", value: formatOptionalCurrency(item.cardmarketPrice, "EUR") }
        : null
    );
  } else {
    all.push(
      item.tcggoScore?.score != null
        ? { label: "TCGGO", value: formatOptionalScore(item.tcggoScore.score) }
        : null,
      item.change7dPct != null
        ? { label: "7D", value: formatPercent(item.change7dPct), toneValue: item.change7dPct }
        : null,
      item.change30dPct != null
        ? { label: "30D", value: formatPercent(item.change30dPct), toneValue: item.change30dPct }
        : null,
      item.changeSinceTrackedPct != null
        ? {
            label: "Since",
            value: formatPercent(item.changeSinceTrackedPct),
            toneValue: item.changeSinceTrackedPct,
          }
        : null
    );
  }

  return all.filter((m): m is { label: string; value: string; toneValue?: number | null } =>
    m !== null
  );
}


const MoverTile = memo(function MoverTile({
  item,
  isLoading,
  displayMode,
  onOpen,
}: {
  item: CollectionMoverItem;
  isLoading: boolean;
  displayMode: MoverDisplayMode;
  onOpen: (cardId: string) => void;
}) {
  const open = () => onOpen(item.cardId);
  const mode = displayMode;
  const trendTone = getTrendTone(mode === "target" ? item.moverScore : item.movementScore);
  const currentPanelClasses = getCurrentPanelClasses(trendTone);
  const compactMetrics = buildCompactMetrics(item, mode);
  const primaryLabel =
    mode === "target" ? "Grade Score" : item.gradedLabel ? `Current ${item.gradedLabel}` : "Current";
  const primaryValue =
    mode === "target" ? formatScoreValue(item.moverScore) : formatTileCurrency(item.currentPrice, item.currency);
  const primaryHint =
    mode === "target" && item.grading
      ? `${formatCurrency(item.grading.rawPrice, "EUR")} raw to ${formatTileCurrency(
          item.grading.gradedPrice,
          "EUR"
        )} graded`
      : `${item.historyPoints} recent / ${item.lifetimeHistoryPoints} lifetime points`;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => handleOpenKey(event, open)}
      aria-label={`Open details for ${item.name}`}
      className="group relative flex h-full cursor-pointer flex-col rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-3 shadow-sm shadow-black/25 outline-none transition hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-emerald-400/60"
    >
      {isLoading ? (
        <div className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <div className="relative h-24 w-[4.4rem] shrink-0 bg-transparent drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]">
          {item.imageUrl ? (
            <Image
              src={getCachedImageUrl(item.imageUrl) ?? item.imageUrl}
              alt={item.name}
              fill
              className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="80px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/35">
              {item.name.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="block max-w-full truncate pr-1 text-base font-semibold leading-tight text-white transition-colors group-hover:text-emerald-200">
                {item.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/46">
                <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
                <span>/</span>
                <Link
                  href={getExpansionHref(item.episodeId)}
                  prefetch={false}
                  onClick={stopCardOpen}
                  className="truncate transition-colors hover:text-white hover:underline underline-offset-2"
                >
                  {item.episodeName}
                  {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
                </Link>
              </div>
            </div>

            <span
              className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sourcePillClasses(
                item.source,
                item.movementScore
              )}`}
            >
              {mode === "target" ? "Target" : item.sourceLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MoverReasonChips item={item} mode={mode} />
            {item.normalizedRarity ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${rarityBadge(
                  item.normalizedRarity
                )}`}
              >
              {item.normalizedRarity}
              </span>
            ) : null}
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                item.ownedCount > 0
                  ? "border-white/10 bg-white/[0.05] text-white/60"
                  : "border-white/8 bg-white/[0.035] text-white/40"
              }`}
            >
              {item.ownedCount > 0 ? `x${item.ownedCount} owned` : "Not owned"}
            </span>
            {item.gradedLabel ? (
              <span className="inline-flex rounded-full border border-amber-400/16 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-amber-200">
                {item.gradedLabel}
              </span>
            ) : null}
            {mode === "raw" && item.gradedPrices.length > 0 ? (
              <span className="inline-flex rounded-full border border-amber-400/16 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                {item.gradedPrices.length} graded
              </span>
            ) : null}
            {item.tcggoScore?.score != null ? (
              <span className="inline-flex rounded-full border border-sky-400/16 bg-sky-400/[0.08] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-sky-200">
                TCGGO {formatScoreValue(item.tcggoScore.score)}
                {item.tcggoScore.tier ? ` ${item.tcggoScore.tier}` : ""}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className={`rounded-2xl border px-3 py-3 ${currentPanelClasses.panel}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${currentPanelClasses.label}`}
                  >
                    {primaryLabel}
                  </p>
                  <p className="mt-2 break-words text-xl font-bold leading-tight tabular-nums text-white sm:text-2xl">
                    {primaryValue}
                  </p>
                </div>
                <BarChart3 className={`mt-0.5 h-4 w-4 shrink-0 ${currentPanelClasses.icon}`} />
              </div>
              <p className="mt-1 text-xs text-white/46">
                Updated {formatShortDate(item.latestFetchedAt)}
              </p>
              <p className="mt-2 line-clamp-2 text-[11px] text-white/42">
                {primaryHint}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {compactMetrics.map((metric) => (
                <CompactMetric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  toneValue={metric.toneValue}
                />
              ))}
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
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-white/16 hover:bg-black/[0.045] focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:hover:border-white/16 dark:hover:bg-white/[0.06]"
          : ""
      }`}
    >
      {isLoading ? (
        <div className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/75 shadow-sm dark:border-white/10 dark:bg-black/80 dark:text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/38">
        {title}
      </p>

      {item ? (
        <div className="mt-3 flex items-start gap-3">
          <div className="relative h-[4.5rem] w-14 shrink-0 bg-transparent drop-shadow-[0_6px_12px_rgba(0,0,0,0.16)]">
            {item.imageUrl ? (
              <Image
                src={getCachedImageUrl(item.imageUrl) ?? item.imageUrl}
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
            <p className="truncate text-base font-semibold text-white dark:text-white">
              {item.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-white/46">
              <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
              <span>/</span>
              <Link
                href={getExpansionHref(item.episodeId)}
                prefetch={false}
                onClick={stopCardOpen}
                className="truncate transition-colors hover:text-white hover:underline underline-offset-2 dark:hover:text-white"
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
              {item.gradedLabel ? (
                <span className="inline-flex rounded-full border border-amber-400/16 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                  {item.gradedLabel}
                </span>
              ) : null}
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
          Not enough recent history yet to show a clear winner here.
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
  reasonMode = "raw",
}: {
  title: string;
  eyebrow: string;
  description: string;
  items: CollectionMoverItem[];
  href: string;
  hrefLabel?: string;
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
  reasonMode?: MoverDisplayMode;
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/36">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-white dark:text-white">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/48">{description}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-tight text-white dark:text-white">
            {items.length.toLocaleString("en-US")}
          </p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-white/34">
            cards
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.slice(0, 4).map((item) => {
          const isLoading = loadingCardId === item.cardId;
          const displayScore = reasonMode === "target" ? item.moverScore : item.rankingScore;

          return (
            <button
              key={`${href}-${item.cardId}`}
              type="button"
              onClick={() => onOpenCard(item.cardId)}
              className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 text-left outline-none transition hover:border-white/16 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:border-white/8 dark:bg-white/[0.05] dark:hover:border-white/16 dark:hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-white dark:text-white">
                  {item.name}
                </p>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${getToneClass(displayScore)}`}>
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {displayScore >= 0 ? "+" : ""}
                  {displayScore.toFixed(1)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-white/46">
                <span className="truncate">
                  {item.episodeName}
                  {item.episodeCode ? ` (${item.episodeCode})` : ""}
                </span>
                <span>{formatCurrency(item.currentPrice, item.currency)}</span>
              </div>
              {(() => {
                const reasons = getMoverReasons(item, reasonMode);
                if (reasons.length === 0) return null;
                return (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {reasons.map((reason) => (
                      <span
                        key={reason.label}
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${reasonChipClass(
                          reason.tone
                        )}`}
                      >
                        {reason.label}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <Link
          href={href}
          prefetch={false}
          className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/75 transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-white"
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
              reasonMode={card.reasonMode ?? "raw"}
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
  displayMode,
  onOpenCard,
}: {
  movers: readonly CollectionMoverItem[];
  minTileWidth: string;
  loadingCardId: string | null;
  displayMode: MoverDisplayMode;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <div
      className="grid auto-rows-fr items-stretch gap-4"
      style={{
        gridTemplateColumns: getFixedTrackGridTemplate(minTileWidth),
        justifyContent: "stretch",
      }}
    >
      {movers.map((item) => (
        <MoverTile
          key={`${item.cardId}:${item.gradedLabel ?? item.source}`}
          item={item}
          isLoading={loadingCardId === item.cardId}
          displayMode={displayMode}
          onOpen={onOpenCard}
        />
      ))}
    </div>
  );
}
