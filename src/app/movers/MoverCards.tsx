"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { BarChart3, ChevronDown, Loader2 } from "lucide-react";
import { rarityBadge, formatCurrency } from "@/components/card-modal/utils";
import { getFixedTrackGridTemplate } from "@/lib/display-scale";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CollectionMoverItem, MoverGradedPrice, MoverRecentPricePoint } from "@/lib/movers";

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
    return "border-rose-400/18 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200";
  }

  if (source === "graded") {
    return "border-amber-400/18 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200";
  }

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
  if (getTrendTone(value) === "negative") {
    return "#fb7185";
  }

  return "#10b981";
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
    panel: "border-black/8 bg-white/70 dark:border-white/8 dark:bg-white/[0.04]",
    label: "text-gray-400 dark:text-white/34",
    icon: "text-gray-400 dark:text-white/34",
  };
}

function getActiveSourceClasses(tone: TrendTone): {
  row: string;
  pill: string;
} {
  if (tone === "negative") {
    return {
      row: "border-rose-400/20 bg-rose-400/[0.08]",
      pill: "bg-rose-500/12 text-rose-700 dark:text-rose-200",
    };
  }

  if (tone === "positive") {
    return {
      row: "border-emerald-400/20 bg-emerald-400/[0.08]",
      pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200",
    };
  }

  return {
    row: "border-black/8 bg-white/70 dark:border-white/8 dark:bg-white/[0.04]",
    pill: "bg-black/6 text-gray-500 dark:bg-white/8 dark:text-white/45",
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
  trendTone,
}: {
  label: string;
  value: number | null;
  currency: "EUR" | "USD";
  points: number;
  active: boolean;
  trendTone: TrendTone;
}) {
  const activeClasses = getActiveSourceClasses(trendTone);

  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        active ? activeClasses.row : "border-black/8 bg-white/70 dark:border-white/8 dark:bg-white/[0.04]"
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
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${activeClasses.pill}`}
          >
            Active
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-white/42">
        {points.toLocaleString("en-US")} history points
      </p>
    </div>
  );
}

function GradedPriceStats({
  prices,
  activeLabel,
}: {
  prices: MoverGradedPrice[];
  activeLabel?: string | null;
}) {
  if (prices.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-400/14 bg-amber-400/[0.07] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700/75 dark:text-amber-200/70">
          Graded
        </p>
        <span className="shrink-0 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
          {prices.length} {prices.length === 1 ? "label" : "labels"}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {prices.map((gradedPrice) => {
          const active = activeLabel === gradedPrice.label;

          return (
            <div
              key={gradedPrice.label}
              className={`min-w-0 rounded-lg px-2.5 py-2 ${
                active
                  ? "bg-amber-500/14 ring-1 ring-amber-500/20"
                  : "bg-white/72 dark:bg-white/[0.055]"
              }`}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-semibold text-amber-800/75 dark:text-amber-100/70">
                  {gradedPrice.label}
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency(gradedPrice.price, "EUR")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GradingOpportunityStats({ item }: { item: CollectionMoverItem }) {
  if (!item.grading) {
    return null;
  }

  const stats = [
    {
      label: "Raw CM",
      value: formatCurrency(item.grading.rawPrice, "EUR"),
    },
    {
      label: item.gradedLabel ?? "Graded",
      value: formatCurrency(item.grading.gradedPrice, "EUR"),
    },
    {
      label: "Gap",
      value: formatDelta(item.grading.valueGap, "EUR"),
    },
    {
      label: "Multiplier",
      value: `${item.grading.valueMultiplier.toFixed(2)}x`,
    },
  ];

  return (
    <div className="mt-3 rounded-xl border border-emerald-400/14 bg-emerald-400/[0.075] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/75 dark:text-emerald-200/70">
          Grade Target
        </p>
        <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-200">
          Score {item.grading.score.toFixed(1)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-lg bg-white/72 px-2.5 py-2 dark:bg-white/[0.055]">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800/60 dark:text-emerald-100/55">
              {stat.label}
            </p>
            <p className="mt-1 truncate text-sm font-bold tabular-nums text-gray-900 dark:text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TcggoScoreStats({ item }: { item: CollectionMoverItem }) {
  if (!item.tcggoScore) {
    return null;
  }

  const metrics = [
    { label: "Momentum", value: item.tcggoScore.momentum },
    { label: "Stability", value: item.tcggoScore.stability },
    { label: "Liquidity", value: item.tcggoScore.liquidity },
    { label: "Demand", value: item.tcggoScore.demand },
    { label: "Depth", value: item.tcggoScore.marketDepth },
    { label: "Premium", value: item.tcggoScore.gradePremium },
    { label: "RSI", value: item.tcggoScore.rsi },
  ].filter((metric) => metric.value != null);

  return (
    <div className="rounded-xl border border-sky-400/14 bg-sky-400/[0.07] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700/75 dark:text-sky-200/70">
          TCGGO Score
        </p>
        <span className="shrink-0 rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-200">
          {formatOptionalScore(item.tcggoScore.score)}
          {item.tcggoScore.tier ? ` / ${item.tcggoScore.tier}` : ""}
        </span>
      </div>
      {metrics.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 rounded-lg bg-white/72 px-2.5 py-2 dark:bg-white/[0.055]">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-800/60 dark:text-sky-100/55">
                {metric.label}
              </p>
              <p className="mt-1 truncate text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                {formatOptionalScore(metric.value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {item.tcggoScore.ath != null || item.tcggoScore.atl != null ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-sky-800/70 dark:text-sky-100/65">
          {item.tcggoScore.ath != null ? <span>ATH {formatCurrency(item.tcggoScore.ath, "EUR")}</span> : null}
          {item.tcggoScore.atl != null ? <span>ATL {formatCurrency(item.tcggoScore.atl, "EUR")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function MoverMetricRow({
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
  if (percent == null && delta == null) return null;

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-white/52">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-400 dark:text-white/40">
          {hint}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {percent != null ? (
          <p className={`text-sm font-bold tabular-nums leading-tight ${getToneClass(percent)}`}>
            {formatPercent(percent)}
          </p>
        ) : null}
        {delta != null ? (
          <p className={`mt-0.5 text-xs font-semibold tabular-nums leading-tight ${getToneClass(delta)}`}>
            {formatDelta(delta, currency)}
          </p>
        ) : null}
      </div>
    </div>
  );
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
      return "border-emerald-400/22 bg-emerald-400/[0.10] text-emerald-700 dark:text-emerald-200";
    case "rose":
      return "border-rose-400/22 bg-rose-400/[0.10] text-rose-700 dark:text-rose-200";
    case "amber":
      return "border-amber-400/22 bg-amber-400/[0.10] text-amber-700 dark:text-amber-200";
    case "sky":
      return "border-sky-400/22 bg-sky-400/[0.10] text-sky-700 dark:text-sky-200";
    case "violet":
      return "border-violet-400/22 bg-violet-400/[0.10] text-violet-700 dark:text-violet-200";
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

  return reasons.slice(0, 2);
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
    <div className="min-w-0 rounded-xl border border-black/8 bg-white/74 px-3 py-2 dark:border-white/8 dark:bg-white/[0.045]">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
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

function MoverExpandedDetails({
  item,
  detailsId,
  trendTone,
}: {
  item: CollectionMoverItem;
  detailsId: string;
  trendTone: TrendTone;
}) {
  const sourceRows = (() => {
    if (item.source === "graded") return [];
    const rows: Array<{
      label: string;
      value: number | null;
      currency: "EUR" | "USD";
      points: number;
      active: boolean;
    }> = [];
    if (item.cardmarketPrice != null || item.cardmarketHistoryPoints > 0) {
      rows.push({
        label: "CardMarket",
        value: item.cardmarketPrice,
        currency: "EUR",
        points: item.cardmarketHistoryPoints,
        active: item.source === "cardmarket",
      });
    }
    if (item.tcgplayerPrice != null || item.tcgplayerHistoryPoints > 0) {
      rows.push({
        label: "TCGPlayer",
        value: item.tcgplayerPrice,
        currency: "USD",
        points: item.tcgplayerHistoryPoints,
        active: item.source === "tcgplayer",
      });
    }
    return rows;
  })();

  const trendStats: Array<{
    label: string;
    percent: number | null;
    delta: number | null;
    hint: string;
  }> = [
    {
      label: "7D",
      percent: item.change7dPct,
      delta: item.change7d,
      hint: item.change7dCoveredDays ? `${item.change7dCoveredDays}d window` : "Recent",
    },
    {
      label: "30D",
      percent: item.change30dPct,
      delta: item.change30d,
      hint: item.change30dCoveredDays ? `${item.change30dCoveredDays}d window` : "Recent",
    },
    {
      label: "Since Tracked",
      percent: item.changeSinceTrackedPct,
      delta: item.changeSinceTracked,
      hint: item.firstTrackedAt
        ? `Since ${formatShortDate(item.firstTrackedAt)}${
            item.trackedDays != null ? ` / ${item.trackedDays}d` : ""
          }`
        : item.trackedDays != null
          ? `${item.trackedDays}d tracked`
          : "No lifetime window",
    },
    {
      label: "From Low",
      percent: item.changeFromLowPct,
      delta: item.changeFromLow,
      hint:
        item.lowPrice != null
          ? `Low ${formatCurrency(item.lowPrice, item.currency)}${
              item.lowAt ? ` / ${formatShortDate(item.lowAt)}` : ""
            }`
          : "",
    },
    {
      label: "Vs Peak",
      percent: item.gapToPeakPct,
      delta: item.gapToPeak,
      hint:
        item.highPrice != null
          ? `Peak ${formatCurrency(item.highPrice, item.currency)}${
              item.highAt ? ` / ${formatShortDate(item.highAt)}` : ""
            }`
          : "",
    },
  ];

  const visibleTrendStats = trendStats.filter(
    (stat) => stat.percent != null || stat.delta != null
  );

  const weightChips: Array<{ label: string; tone: "amber" | "neutral" }> = [];
  if (item.pullRateWeight != null) {
    weightChips.push({ label: `Odds ${item.pullRateWeight.toFixed(2)}`, tone: "amber" });
  }
  if (item.specificPullOdds) {
    weightChips.push({ label: `Pull ${item.specificPullOdds}`, tone: "neutral" });
  }
  weightChips.push({ label: `Rarity ${item.rarityWeight.toFixed(2)}`, tone: "neutral" });
  weightChips.push({ label: `Price ${item.cheapnessWeight.toFixed(2)}`, tone: "neutral" });

  const hasSparklineData = item.recentPriceSeries.length >= 2;

  return (
    <div
      id={detailsId}
      className="mt-4 space-y-4 border-t border-black/8 pt-4 dark:border-white/8"
    >
      {hasSparklineData ? (
        <MiniPriceSparkline series={item.recentPriceSeries} toneValue={item.moverScore} />
      ) : null}

      {sourceRows.length > 0 ? (
        <div
          className={`grid gap-2 ${sourceRows.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
        >
          {sourceRows.map((row) => (
            <PriceSourceRow
              key={row.label}
              label={row.label}
              value={row.value}
              currency={row.currency}
              points={row.points}
              active={row.active}
              trendTone={trendTone}
            />
          ))}
        </div>
      ) : null}

      <GradingOpportunityStats item={item} />
      <TcggoScoreStats item={item} />
      <GradedPriceStats prices={item.gradedPrices} activeLabel={item.gradedLabel} />

      {visibleTrendStats.length > 0 ? (
        <div className="rounded-xl border border-black/8 bg-white/72 px-4 py-2 dark:border-white/8 dark:bg-white/[0.04]">
          <p className="py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/34">
            Movement
          </p>
          <div className="divide-y divide-black/6 dark:divide-white/6">
            {visibleTrendStats.map((stat) => (
              <MoverMetricRow
                key={stat.label}
                label={stat.label}
                percent={stat.percent}
                delta={stat.delta}
                currency={item.currency}
                hint={stat.hint}
              />
            ))}
          </div>
        </div>
      ) : null}

      {weightChips.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/34">
            Weight
          </p>
          <div className="flex flex-wrap gap-1.5">
            {weightChips.map((chip) => (
              <span
                key={chip.label}
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums ${
                  chip.tone === "amber"
                    ? "border-amber-400/22 bg-amber-400/[0.10] text-amber-700 dark:text-amber-200"
                    : "border-black/8 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60"
                }`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const open = () => onOpen(item.cardId);
  const mode = displayMode;
  const trendTone = getTrendTone(item.moverScore);
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
  const detailsId = `mover-details-${item.cardId}-${item.gradedLabel ?? item.source}`;

  return (
    <article
      className="group relative rounded-2xl border border-black/8 bg-white/72 p-3 shadow-sm shadow-black/5 outline-none transition hover:-translate-y-0.5 hover:border-black/14 hover:bg-white/90 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06]"
    >
      {isLoading ? (
        <div className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white/90 text-gray-700 shadow-sm dark:border-white/10 dark:bg-black/80 dark:text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={open}
          className="relative h-24 w-[4.4rem] shrink-0 overflow-hidden rounded-xl border border-black/8 bg-black/5 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:border-white/10 dark:bg-white/[0.05]"
          aria-label={`Open details for ${item.name}`}
        >
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
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
              {item.name.slice(0, 2)}
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={open}
                className="block max-w-full truncate pr-1 text-left text-base font-semibold leading-tight text-gray-900 outline-none transition-colors hover:text-emerald-700 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:text-white dark:hover:text-emerald-200"
              >
                {item.name}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-white/46">
                <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
                <span>/</span>
                <Link
                  href={`/expansions/${item.episodeId}`}
                  prefetch={false}
                  onClick={stopCardOpen}
                  className="truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
                >
                  {item.episodeName}
                  {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
                </Link>
              </div>
            </div>

            <span
              className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sourcePillClasses(
                item.source,
                item.moverScore
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
                  ? "border-black/8 bg-white/80 text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60"
                  : "border-black/8 bg-black/[0.035] text-gray-400 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/40"
              }`}
            >
              {item.ownedCount > 0 ? `x${item.ownedCount} owned` : "Not owned"}
            </span>
            {item.gradedLabel ? (
              <span className="inline-flex rounded-full border border-amber-400/16 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-200">
                {item.gradedLabel}
              </span>
            ) : null}
            {mode === "raw" && item.gradedPrices.length > 0 ? (
              <span className="inline-flex rounded-full border border-amber-400/16 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                {item.gradedPrices.length} graded
              </span>
            ) : null}
            {item.tcggoScore?.score != null ? (
              <span className="inline-flex rounded-full border border-sky-400/16 bg-sky-400/[0.08] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-sky-700 dark:text-sky-200">
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
                  <p className="mt-2 break-words text-xl font-bold leading-tight tabular-nums text-gray-900 dark:text-white sm:text-2xl">
                    {primaryValue}
                  </p>
                </div>
                <BarChart3 className={`mt-0.5 h-4 w-4 shrink-0 ${currentPanelClasses.icon}`} />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/46">
                Updated {formatShortDate(item.latestFetchedAt)}
              </p>
              <p className="mt-2 line-clamp-2 text-[11px] text-gray-500 dark:text-white/42">
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

          <div className="mt-3 flex items-center justify-end gap-3 border-t border-black/8 pt-3 dark:border-white/8">
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={(event) => {
                event.stopPropagation();
                setDetailsOpen((current) => !current);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/8 bg-white/82 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-black/14 hover:text-gray-950 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:border-white/16 dark:hover:text-white"
            >
              More metrics
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {detailsOpen ? (
            <MoverExpandedDetails
              item={item}
              detailsId={detailsId}
              trendTone={trendTone}
            />
          ) : null}
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
            <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
              {item.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-white/46">
              <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
              <span>/</span>
              <Link
                href={`/expansions/${item.episodeId}`}
                prefetch={false}
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
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/48">{description}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
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
      className="grid items-start gap-4"
      style={{
        gridTemplateColumns: getFixedTrackGridTemplate(minTileWidth),
        justifyContent: "start",
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
