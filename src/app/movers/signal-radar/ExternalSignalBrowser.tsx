"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Newspaper,
  PackageSearch,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import {
  CardListTile,
  CardListTileBody,
  CardListTileInsight,
  CardListTileLink,
  CardListTileMedia,
  CardListTilePrice,
} from "@/components/CardListTile";
import CollectionCardQuickActions from "@/components/CollectionCardQuickActions";
import EmptyState from "@/components/EmptyState";
import { SectionHeader } from "@/components/PageHeader";
import NewReleaseChasePanel from "@/app/movers/signal-radar/NewReleaseChasePanel";
import type {
  CardQuickActionData,
  CardQuickActionMap,
} from "@/lib/card-quick-actions";
import { textMatchesSearchQuery } from "@/lib/card-search";
import type { ExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import { formatCurrency } from "@/lib/format";
import type {
  ExternalCardSignal,
  ExternalMarketMode,
  ExternalPriceScenario,
  ExternalSignalConfidence,
  ExternalSignalSourceStatus,
} from "@/lib/external-signal-radar";
import { isWatchablePriceScenario } from "@/lib/external-market-intelligence-core";
import type { SignalRadarProgressivePayload } from "@/lib/signal-radar-progressive";

type ConfidenceFilter = "all" | Lowercase<ExternalSignalConfidence>;
type OriginFilter = "all" | "event" | "competitive" | "hybrid" | "structural";
type SortKey = "opportunity" | "confluence" | "signal" | "sealed" | "scarcity" | "meta" | "reach";

interface Props {
  signals: ExternalCardSignal[];
  sources: ExternalSignalSourceStatus[];
  generatedAt: string;
  newReleaseChases?: ExpansionChaseRadarData | null;
  cardQuickActions: CardQuickActionMap;
  progressiveHref?: string | null;
  totalSignalCount?: number;
}

const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "emerging", label: "Emerging" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "opportunity", label: "Best match" },
  { value: "confluence", label: "Setup" },
  { value: "signal", label: "Signal" },
  { value: "sealed", label: "Sealed pressure" },
  { value: "scarcity", label: "Scarcity" },
  { value: "meta", label: "Meta share" },
  { value: "reach", label: "Archetype reach" },
];

const ORIGIN_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "event", label: "Leaks & reveals" },
  { value: "competitive", label: "Tournament" },
  { value: "hybrid", label: "Hybrid" },
  { value: "structural", label: "Scarcity & value" },
];

const INITIAL_VISIBLE_SIGNALS = 12;
const VISIBLE_SIGNAL_STEP = 12;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getConfidenceClasses(confidence: ExternalSignalConfidence): string {
  if (confidence === "High") {
    return "border-emerald-300/22 bg-emerald-400/[0.1] text-emerald-200";
  }
  if (confidence === "Medium") {
    return "border-sky-300/20 bg-sky-400/[0.09] text-sky-200";
  }
  return "border-amber-300/20 bg-amber-400/[0.09] text-amber-200";
}

function getScenarioOutlookBadge(scenario: ExternalPriceScenario | null | undefined) {
  if (!scenario?.outlook) return null;
  if (scenario.outlook === "strong_up") {
    return {
      label: "Strong upside",
      classes: "border-emerald-300/20 bg-emerald-400/[0.09] text-emerald-200",
    };
  }
  if (scenario.outlook === "modest_up") {
    return {
      label: "Mild upside",
      classes: "border-sky-300/20 bg-sky-400/[0.08] text-sky-200",
    };
  }
  if (scenario.outlook === "down") {
    return {
      label: "Downside risk",
      classes: "border-rose-300/20 bg-rose-400/[0.08] text-rose-200",
    };
  }
  return {
    label: "Mostly flat",
    classes: "border-amber-300/20 bg-amber-400/[0.08] text-amber-200",
  };
}

export function getSignalExplanations(signal: ExternalCardSignal) {
  if (signal.sourceMode === "structural") {
    const market = signal.marketIntelligence;
    return [
      {
        label: "Structural setup",
        text: signal.reasons[0] ?? "Older, harder-to-replace supply is priced below its structural profile.",
      },
      {
        label: "Sealed pressure",
        text: market
          ? `${market.sealed.pressureLabel} (${market.sealed.pressureScore}/100). ${market.sealed.packPrice != null ? `Cheapest linked pack is about €${market.sealed.packPrice.toFixed(2)}.` : "No reliable single-pack price is stored yet."}`
          : "Sealed context is still loading.",
      },
      {
        label: "Grade potential",
        text: market?.graded.available
          ? `${market.graded.label ?? "Top grade"} market is ${market.graded.supplyLabel.toLowerCase()} with ${market.graded.sampleSize ?? "an unknown number of"} recent sold samples.`
          : "No reliable graded market match is stored for this card yet.",
      },
    ];
  }
  if (signal.sourceMode === "event" || signal.sourceMode === "hybrid") {
    const catalyst = signal.catalysts?.[0];
    const sourceCount = new Set((signal.catalysts ?? []).map((item) => item.sourceUrl)).size;
    return [
      {
        label: "What happened",
        text: catalyst?.headline ?? "A fresh set, reveal or character event was detected.",
      },
      {
        label: "Why this card is connected",
        text:
          catalyst?.explanation ??
          "The card shares the named Pokémon, character or set with the external event.",
      },
      {
        label: "Evidence quality",
        text: catalyst
          ? `${catalyst.evidenceLevel}${catalyst.contextLabel ? ` · ${catalyst.contextLabel}` : ""}. ${sourceCount} independent source${sourceCount === 1 ? "" : "s"} currently support this link.`
          : "The event is still collecting source confirmation.",
      },
    ];
  }
  const leadingDeck = signal.evidence[0]?.deckName ?? "its leading deck";
  const inclusion = signal.maxInclusionPercent.toFixed(0);
  const metaShare = signal.maxDeckSharePercent.toFixed(1);
  const archetypeReach = signal.archetypeCount;

  return [
    {
      label: "Used by players",
      text: `${inclusion}% of tracked ${leadingDeck} lists use it. That makes it a staple rather than a fringe choice.`,
    },
    {
      label: "Size of the opportunity",
      text: `${leadingDeck} is ${metaShare}% of the tracked field. More players on that deck can mean more buyers for its staples.`,
    },
    {
      label: "Demand spread",
      text:
        archetypeReach > 1
          ? `It is core in ${archetypeReach} leading deck types, so demand is not tied to one strategy.`
          : "It is currently core in one leading deck type, so this signal depends more on that strategy staying popular.",
    },
  ];
}

function formatSignedPercent(value: number | null): string {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function PriceScenarioChart({
  scenario,
  detailed = false,
}: {
  scenario: ExternalPriceScenario;
  detailed?: boolean;
}) {
  const values = [
    scenario.currentPrice,
    ...scenario.points.flatMap((point) => [point.low, point.base, point.high]),
  ];
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const rawSpread = Math.max(1, rawMaximum - rawMinimum);
  const minimum = Math.max(0, rawMinimum - rawSpread * 0.12);
  const maximum = rawMaximum + rawSpread * 0.12;
  const spread = Math.max(1, maximum - minimum);
  const width = detailed ? 720 : 100;
  const height = detailed ? 190 : 54;
  const plot = detailed
    ? { left: 58, right: 704, top: 15, bottom: 153 }
    : { left: 4, right: 96, top: 8, bottom: 48 };
  const x = [0, 1, 2, 3].map(
    (index) => plot.left + ((plot.right - plot.left) * index) / 3
  );
  const y = (value: number) =>
    plot.bottom - ((value - minimum) / spread) * (plot.bottom - plot.top);
  const baseValues = [scenario.currentPrice, ...scenario.points.map((point) => point.base)];
  const highValues = [scenario.currentPrice, ...scenario.points.map((point) => point.high)];
  const lowValues = [scenario.currentPrice, ...scenario.points.map((point) => point.low)];
  const band = [
    ...highValues.map((value, index) => `${x[index]},${y(value)}`),
    ...lowValues.map((value, index) => `${x[lowValues.length - 1 - index]},${y(lowValues[lowValues.length - 1 - index])}`),
  ].join(" ");
  const line = baseValues.map((value, index) => `${x[index]},${y(value)}`).join(" ");
  const tickValues = [maximum, minimum + spread / 2, minimum];
  const horizonLabels = ["Now", ...scenario.points.map((point) => `${point.days}d`)];
  const compactPrice = (value: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: scenario.currency,
      notation: "compact",
      maximumFractionDigits: value < 10 ? 2 : 0,
    }).format(value);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={detailed ? "h-40 w-full lg:h-44 [@media(min-width:2200px)]:h-48" : "h-20 w-full"}
      role="img"
      aria-label="Predicted low, base and high price path"
    >
      <defs>
        <linearGradient id={`scenario-${scenario.marketMode}-${detailed ? "detail" : "compact"}`} x1="0" x2="1">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={`scenario-line-${scenario.marketMode}-${detailed ? "detail" : "compact"}`} x1="0" x2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {tickValues.map((tick) => (
        <g key={tick}>
          <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.075)" strokeWidth={detailed ? 1 : 0.5} strokeDasharray={detailed ? "4 5" : undefined} />
          {detailed ? <text x={plot.left - 10} y={y(tick) + 4} textAnchor="end" fill="rgba(255,255,255,0.34)" fontSize="10">{compactPrice(tick)}</text> : null}
        </g>
      ))}
      <polygon points={band} fill={`url(#scenario-${scenario.marketMode}-${detailed ? "detail" : "compact"})`} />
      {detailed ? (
        <>
          <polyline points={highValues.map((value, index) => `${x[index]},${y(value)}`).join(" ")} fill="none" stroke="rgba(56,189,248,0.42)" strokeWidth="1.25" strokeDasharray="5 5" />
          <polyline points={lowValues.map((value, index) => `${x[index]},${y(value)}`).join(" ")} fill="none" stroke="rgba(251,113,133,0.36)" strokeWidth="1.25" strokeDasharray="5 5" />
        </>
      ) : null}
      <polyline points={line} fill="none" stroke={`url(#scenario-line-${scenario.marketMode}-${detailed ? "detail" : "compact"})`} strokeWidth={detailed ? 3 : 1.5} strokeLinecap="round" strokeLinejoin="round" />
      {baseValues.map((value, index) => (
        <g key={x[index]}>
          <circle cx={x[index]} cy={y(value)} r={detailed ? 6 : 1.5} fill="rgba(5,7,12,0.9)" stroke={index === 0 ? "#f8fafc" : "#7dd3fc"} strokeWidth={detailed ? 2.5 : 0} />
          {detailed ? <text x={x[index]} y={Math.max(11, y(value) - 11)} textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="10" fontWeight="700">{compactPrice(value)}</text> : null}
        </g>
      ))}
      {detailed ? horizonLabels.map((label, index) => <text key={label} x={x[index]} y={176} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10" fontWeight="600">{label}</text>) : null}
    </svg>
  );
}

function MarketIntelligencePanel({
  signal,
  marketMode,
}: {
  signal: ExternalCardSignal;
  marketMode: ExternalMarketMode;
}) {
  const market = signal.marketIntelligence;
  if (!market) return null;
  const scenario = marketMode === "graded" ? market.gradedScenario : market.rawScenario;
  const score =
    marketMode === "graded" ? market.gradedOpportunityScore : market.rawOpportunityScore;
  const confluence =
    marketMode === "graded"
      ? market.gradedConfluence ?? market.confluence
      : market.rawConfluence ?? market.confluence;
  if (marketMode === "graded" && !market.graded.available) return null;
  return (
    <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(13rem,0.85fr)]">
      <div className="rounded-xl border border-violet-300/12 bg-violet-400/[0.045] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-violet-200/68">
              {marketMode === "graded" ? "Graded value path" : "Raw value path"}
            </p>
            <p className="mt-0.5 text-[9px] text-white/35">Model range · not a guaranteed target</p>
          </div>
          <span className="rounded-full border border-violet-300/14 bg-violet-400/[0.08] px-2 py-1 text-[10px] font-black text-violet-100">
            {score ?? "--"}/100
          </span>
        </div>
        {scenario ? (
          <>
            <PriceScenarioChart scenario={scenario} />
            <div className="grid grid-cols-3 gap-1.5">
              {scenario.points.map((point) => (
                <div key={point.days} className="rounded-lg border border-white/7 bg-black/18 px-2 py-1.5 text-center">
                  <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/32">{point.days}d</p>
                  <p className="mt-0.5 text-[10px] font-black text-white/76">{formatCurrency(point.base, scenario.currency)}</p>
                  <p className="text-[8px] text-white/30">{formatCurrency(point.low, scenario.currency)}–{formatCurrency(point.high, scenario.currency)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-[10px] text-white/38">Not enough price data for a scenario yet.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={cx(
          "col-span-2 rounded-xl border p-2.5",
          confluence.score >= 85
            ? "border-fuchsia-300/24 bg-gradient-to-r from-fuchsia-400/[0.1] to-amber-300/[0.06]"
            : confluence.score >= 70
              ? "border-violet-300/18 bg-violet-400/[0.06]"
              : "border-white/8 bg-white/[0.025]"
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-fuchsia-100/70">
              <Sparkles className="h-3 w-3" /> Factor confluence
            </div>
            <span className="text-[10px] font-black text-fuchsia-100">{confluence.score}/100</span>
          </div>
          <p className="mt-1 text-sm font-black text-white/88">{confluence.label}</p>
          <p className="mt-1 text-[9px] leading-4 text-white/42">
            {confluence.drivers.length > 0
              ? confluence.drivers.join(" · ")
              : "No multi-factor setup yet"}
          </p>
          <p className="mt-0.5 text-[8px] leading-3 text-white/28">
            Strong only when artist, character demand, pull difficulty and scarcity reinforce each other.
          </p>
        </div>
        <div className="rounded-xl border border-amber-300/12 bg-amber-400/[0.045] p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100/62">
            <PackageSearch className="h-3 w-3" /> Sealed
          </div>
          <p className="mt-1 text-sm font-black text-amber-100">{market.sealed.pressureLabel}</p>
          <p className="mt-1 text-[9px] leading-4 text-white/38">
            Pack {market.sealed.packPrice == null ? "--" : formatCurrency(market.sealed.packPrice, "EUR")} · {formatSignedPercent(market.sealed.trend30dPct ?? market.sealed.trend90dPct)}
          </p>
          <p className="text-[8px] text-white/28">{market.sealed.productCount} linked products</p>
        </div>
        <div className="rounded-xl border border-sky-300/12 bg-sky-400/[0.045] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100/62">Scarcity</p>
          <p className="mt-1 text-sm font-black text-sky-100">{market.scarcity.label}</p>
          <p className="mt-1 text-[9px] leading-4 text-white/38">
            Pull {market.scarcity.pullOdds ?? "unknown"} · {market.scarcity.rawMarketBreadth} markets
          </p>
          <p className="text-[8px] text-white/28">
            Artist {market.scarcity.artistDemandScore ?? "--"}/100 · character {market.scarcity.collectorDemandScore}/100
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-emerald-300/12 bg-emerald-400/[0.04] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-100/62">Grading supply</p>
            <span className="text-[9px] font-bold text-emerald-100/70">{market.graded.supplyLabel}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-[9px]">
            <span className="text-white/38">PSA 10 <strong className="block text-white/74">{market.graded.psa10Price == null ? "--" : formatCurrency(market.graded.psa10Price, market.graded.currency)}</strong></span>
            <span className="text-white/38">Gem-rate <strong className="block text-white/74">{market.graded.gemRatePct == null ? "--" : `${market.graded.gemRatePct.toFixed(1)}%`}</strong></span>
            <span className="text-white/38">PSA pop <strong className="block text-white/74">API pending</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

const FORECAST_TARGETS = [
  { key: "1.5x-90d", label: "1.5x", horizon: "90 days", minimum: 50 },
  { key: "2x-90d", label: "2x", horizon: "90 days", minimum: 100 },
  { key: "3x-180d", label: "3x", horizon: "180 days", minimum: 200 },
] as const;

function formatProbability(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ForecastPanel({ signal }: { signal: ExternalCardSignal }) {
  const referenceReady = signal.forecast
    ? Boolean(signal.forecast.priceBand)
    : signal.currency === "EUR" && signal.currentPrice != null && signal.currentPrice >= 1;
  const waitingLabel =
    signal.currentPrice != null && signal.currentPrice < 1
      ? "Below €1 model floor"
      : "Waiting for EUR reference";
  return (
    <div className="mt-3 rounded-xl border border-sky-300/12 bg-sky-400/[0.045] p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-sky-200/68">
            <BrainCircuit className="h-3 w-3" />
            Historical growth model
          </div>
          <p className="mt-1 text-[10px] leading-4 text-white/42">
            Comparable radar signals are followed forward; a target only counts after two separate price days.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-300/12 bg-sky-400/[0.06] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.11em] text-sky-100/62">
          {signal.forecast?.modelVersion ?? "learning"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {FORECAST_TARGETS.map((target) => {
          const summary = signal.forecast?.targets[target.key];
          const interval = summary?.status === "calibrated" ? summary.interval : null;
          const calibrated = Boolean(interval);
          const mainValue = interval
            ? formatProbability(interval.estimate)
            : referenceReady
              ? "Learning"
              : "Waiting";
          const progress = summary?.samples ?? 0;
          return (
            <div
              key={target.key}
              className="min-w-0 rounded-lg border border-white/7 bg-black/20 px-2 py-2"
              title={
                referenceReady
                  ? summary?.reason ?? summary?.cohortLabel ?? "Collecting comparable signals"
                  : waitingLabel
              }
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[11px] font-black text-white/82">{target.label}</span>
                <span className="text-[8px] font-semibold uppercase text-white/30">
                  {target.horizon}
                </span>
              </div>
              <p
                className={cx(
                  "mt-1 truncate text-[11px] font-bold",
                  calibrated ? "text-emerald-200" : "text-sky-100/72"
                )}
              >
                {mainValue}
              </p>
              <p className="mt-0.5 truncate text-[8px] tabular-nums text-white/32">
                {interval && summary
                  ? `${summary.hits}/${summary.samples} hits · ${formatProbability(interval.lower)}–${formatProbability(interval.upper)}`
                  : referenceReady
                    ? `${progress}/${target.minimum} completed signals`
                    : waitingLabel}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CatalystPanel({ signal }: { signal: ExternalCardSignal }) {
  const catalysts = signal.catalysts ?? [];
  return (
    <div className="mt-2 rounded-xl border border-white/8 bg-black/18 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/38">
          <Newspaper className="h-3 w-3" />
          News, supply & hype check
        </div>
        <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/28">
          Daily scan
        </span>
      </div>
      {catalysts.length ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {catalysts.slice(0, 2).map((catalyst) => (
            <Link
              key={catalyst.id}
              href={catalyst.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={cx(
                "min-w-0 rounded-lg border px-2.5 py-2 transition hover:bg-white/[0.05]",
                catalyst.direction === "positive"
                  ? "border-emerald-300/12 bg-emerald-400/[0.045]"
                  : catalyst.direction === "negative"
                    ? "border-rose-300/12 bg-rose-400/[0.045]"
                    : "border-white/7 bg-white/[0.02]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-semibold text-white/72">
                  {catalyst.headline}
                </span>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-white/32" />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[8px] font-bold uppercase tracking-[0.09em]">
                <span className="rounded-full border border-white/8 bg-black/18 px-1.5 py-0.5 text-white/48">
                  {catalyst.evidenceLevel}
                </span>
                {catalyst.contextLabel ? (
                  <span className="rounded-full border border-violet-300/12 bg-violet-400/[0.06] px-1.5 py-0.5 text-violet-100/62">
                    {catalyst.contextLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/38">
                {catalyst.explanation}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] leading-4 text-white/38">
          {signal.sourceMode === "structural"
            ? "No fresh news catalyst is required for this setup. Its ranking comes from sealed pressure, age, rarity, collector demand and grading context."
            : "No fresh trusted support, product, reprint, ban or social-hype catalyst is linked to this card yet. Its ranking currently comes from tournament demand only."}
        </p>
      )}
    </div>
  );
}

function CompactSignalCard({
  signal,
  marketMode,
  quickActionData,
  prioritizeImage = false,
}: {
  signal: ExternalCardSignal;
  marketMode: ExternalMarketMode;
  quickActionData: CardQuickActionData | undefined;
  prioritizeImage?: boolean;
}) {
  const scenario =
    marketMode === "graded"
      ? signal.marketIntelligence?.gradedScenario
      : signal.marketIntelligence?.rawScenario;
  const score =
    marketMode === "graded"
      ? signal.marketIntelligence?.gradedOpportunityScore
      : signal.marketIntelligence?.rawOpportunityScore;
  const effectiveScore = score ?? signal.externalScore;
  const confluence = signal.marketIntelligence
    ? marketMode === "graded"
      ? signal.marketIntelligence.gradedConfluence ?? signal.marketIntelligence.confluence
      : signal.marketIntelligence.rawConfluence ?? signal.marketIntelligence.confluence
    : undefined;
  const scarcity = signal.marketIntelligence?.scarcity;
  const ebayDemand =
    marketMode === "graded"
      ? signal.marketIntelligence?.gradedEbayDemand
      : signal.marketIntelligence?.ebayDemand;
  const launchWindow = scenario?.drivers.includes("launch price discovery") ?? false;
  const releaseStabilization = scenario?.drivers.includes("post-release stabilization") ?? false;
  const primaryCatalyst = signal.catalysts?.[0];
  const eventLinked = signal.sourceMode === "event" || signal.sourceMode === "hybrid";
  const primaryReason = [
    ...(eventLinked && primaryCatalyst ? [primaryCatalyst.headline] : []),
    ...(ebayDemand?.status === "ready" && ebayDemand.scoreAdjustment !== 0 && ebayDemand.reason
      ? [`${marketMode === "graded" ? "eBay graded" : "eBay NM-English"}: ${ebayDemand.reason}`]
      : []),
    ...(launchWindow
      ? ["Launch window: more upside potential with substantially higher uncertainty"]
      : releaseStabilization
        ? ["New-set stabilization is tempering the short-term forecast"]
        : []),
    ...(scarcity?.setRarityScore != null
      ? [`${signal.rarity ?? "Card rarity"} is ${scarcity.setRarityLabel.toLowerCase()} in this set (${scarcity.setRarityScore}/100)`]
      : []),
    ...(confluence?.drivers.length ? confluence.drivers : signal.reasons),
  ][0] ?? "Market evidence is still developing.";
  const base180 = scenario?.points.find((point) => point.days === 180)?.base ?? null;
  const scenarioChangePercent =
    scenario && base180 != null && scenario.currentPrice > 0
      ? ((base180 - scenario.currentPrice) / scenario.currentPrice) * 100
      : null;
  const detailHref = `/movers/signal-radar/${encodeURIComponent(signal.cardId)}?game=${signal.game}`;
  const outlookBadge = getScenarioOutlookBadge(scenario);

  return (
    <CardListTile
      interactive
      accent="radar"
      className="grid-cols-[clamp(6.75rem,30vw,7.25rem)_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)]"
      data-signal-card-id={signal.cardId}
    >
      <CardListTileLink
        href={detailHref}
        label={`Open full analysis for ${signal.name}`}
      />

      <CardListTileMedia
        imageUrl={signal.imageUrl}
        className="pointer-events-none relative z-[1]"
      >
        {signal.imageUrl ? (
          <CachedImage
            sourceUrl={signal.imageUrl}
            alt={signal.name}
            fill
            sizes="(max-width: 640px) 116px, 120px"
            loading={prioritizeImage ? "eager" : undefined}
            preload={prioritizeImage}
            className="object-contain"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/22">
            <Boxes className="h-7 w-7" />
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/75 px-1.5 text-[10px] font-black text-white">
          #{signal.rank}
        </span>
      </CardListTileMedia>

      <CardListTileBody className="pointer-events-none relative z-[1]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
            <div className="flex max-h-6 min-w-0 flex-wrap items-start gap-1.5 overflow-hidden sm:max-h-none">
              <span className={cx("rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em]", getConfidenceClasses(signal.confidence))}>
                {signal.confidence}
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/45">
                {signal.sourceMode === "structural" ? "Scarcity" : signal.sourceMode === "event" ? "Event" : signal.sourceMode === "hybrid" ? "Hybrid" : "Tournament"}
              </span>
              {outlookBadge ? (
                <span className={cx("hidden rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] sm:inline-flex", outlookBadge.classes)}>
                  {outlookBadge.label}
                </span>
              ) : null}
              {eventLinked && primaryCatalyst ? (
                <span className="hidden max-w-full truncate rounded-full border border-amber-300/15 bg-amber-400/[0.07] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-100/70 xl:inline-flex">
                  {primaryCatalyst.evidenceLevel} source
                </span>
              ) : null}
            </div>
          <CardListTilePrice
            label={marketMode}
            value={scenario ? formatCurrency(scenario.currentPrice, scenario.currency) : formatCurrency(signal.currentPrice, signal.currency)}
          />
          <h3 className="col-span-2 mt-1.5 truncate text-base font-bold leading-5 tracking-tight text-white transition group-hover/card-list:text-violet-100">
            {signal.name}
          </h3>
          <p className="col-span-2 mt-0.5 truncate text-[10px] leading-4 text-white/52">
            {signal.episodeName}{signal.cardNumber ? ` / ${signal.cardNumber}` : ""}{signal.rarity ? ` / ${signal.rarity}` : ""}
          </p>
        </div>

        <CardListTileInsight>
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/62" />
          <span className="line-clamp-2">
            <strong
              className="font-bold tabular-nums text-violet-100/76"
              title="Score combines the selected market scenario with the available demand and supply evidence."
            >
              Score {effectiveScore}
            </strong>
            <span className="hidden sm:inline">
              {scenario && base180 != null && scenarioChangePercent != null
                ? ` · ${formatCurrency(scenario.currentPrice, scenario.currency)} → ${formatCurrency(base180, scenario.currency)} (${scenarioChangePercent >= 0 ? "+" : ""}${scenarioChangePercent.toFixed(0)}%)`
                : ""}
            </span>
            {" · "}{primaryReason}
          </span>
        </CardListTileInsight>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
          {quickActionData ? (
            <div className="pointer-events-auto relative z-10 shrink-0">
              <CollectionCardQuickActions
                data={quickActionData}
                gradedLabel={
                  marketMode === "graded"
                    ? signal.marketIntelligence?.graded.label ?? null
                    : null
                }
              />
            </div>
          ) : (
            <span />
          )}
          <span className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 px-1.5 text-[10px] font-bold text-violet-200/72 transition group-hover/card-list:text-violet-100">
            Analysis
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </CardListTileBody>
    </CardListTile>
  );
}

export function ExternalSignalDetailCard({
  signal,
  marketMode,
}: {
  signal: ExternalCardSignal;
  marketMode: ExternalMarketMode;
}) {
  const primaryEvidence = signal.evidence.slice(0, 2);
  const explanations = getSignalExplanations(signal);
  const selectedScenario =
    marketMode === "graded"
      ? signal.marketIntelligence?.gradedScenario
      : signal.marketIntelligence?.rawScenario;
  const selectedScore =
    marketMode === "graded"
      ? signal.marketIntelligence?.gradedOpportunityScore
      : signal.marketIntelligence?.rawOpportunityScore;
  const selectedTier =
    (selectedScore ?? signal.externalScore) >= 80
      ? "Breakout"
      : (selectedScore ?? signal.externalScore) >= 60
        ? "Strong"
        : "Watch";

  return (
    <article
      className="group relative min-w-0 overflow-hidden rounded-[1.6rem] border border-[rgb(var(--dc-border-rgb)/0.92)] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.18)] transition duration-200 hover:border-violet-300/22 sm:p-4"
      style={{
        background:
          "linear-gradient(145deg, rgb(var(--dc-surface-elevated-rgb) / 0.98), rgb(var(--dc-surface-primary-rgb) / 0.98))",
      }}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/55 to-transparent opacity-65" />
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="relative aspect-[63/88] w-[8rem] shrink-0 self-start overflow-hidden rounded-[0.85rem] border border-white/10 bg-black/25 shadow-lg shadow-black/25 sm:w-[11rem] xl:w-[14rem]">
          {signal.imageUrl ? (
            <CachedImage
              sourceUrl={signal.imageUrl}
              alt={signal.name}
              fill
              sizes="(max-width: 640px) 96px, 128px"
              className="object-contain"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-white/22">
              <Boxes className="h-7 w-7" />
            </span>
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/75 px-1.5 text-[10px] font-black tabular-nums text-white shadow-sm">
            #{signal.rank}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cx(
                    "inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]",
                    getConfidenceClasses(signal.confidence)
                  )}
                >
                  {signal.confidence} confidence
                </span>
                <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  {signal.game === "one-piece" ? "One Piece" : "Pokemon"}
                </span>
                <span className="rounded-full border border-violet-300/12 bg-violet-400/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-100/62">
                  {signal.sourceMode === "event"
                    ? "Set & reveal"
                    : signal.sourceMode === "structural"
                      ? "Scarcity & value"
                    : signal.sourceMode === "hybrid"
                      ? "Hybrid"
                      : "Tournament"}
                </span>
              </div>
              <div className="mt-2 block max-w-full text-left">
                <h3 className="truncate text-base font-bold tracking-tight text-white transition group-hover:text-violet-100 sm:text-lg">
                  {signal.name}
                </h3>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-white/42 sm:text-xs">
                {signal.episodeName}
                {signal.cardNumber ? ` / ${signal.cardNumber}` : ""}
                {signal.rarity ? ` / ${signal.rarity}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/32">
                {marketMode === "graded" ? signal.marketIntelligence?.graded.label ?? "Graded market" : "Raw market"}
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-white sm:text-base">
                {selectedScenario
                  ? formatCurrency(selectedScenario.currentPrice, selectedScenario.currency)
                  : formatCurrency(signal.currentPrice, signal.currency)}
              </p>
            </div>
          </div>

          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
            <div className="rounded-xl border border-violet-300/14 bg-violet-400/[0.07] px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-200/68">
                <Radar className="h-3 w-3" />
                Opportunity score
              </div>
              <p className="mt-1 text-base font-black tabular-nums text-violet-100">
                {selectedScore ?? signal.externalScore}<span className="text-xs text-white/32">/100</span>
              </p>
              <p className="mt-0.5 text-[8px] text-white/32">
                {`External ${signal.externalScore} + sealed, rarity & supply`}
                {signal.sourceMode === "event" ? " · event-linked" : ""}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-300/14 bg-emerald-400/[0.065] px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200/68">
                <Sparkles className="h-3 w-3" />
                Signal tier
              </div>
              <p className="mt-1 text-base font-black tabular-nums text-emerald-100">
                {selectedTier}
              </p>
            </div>
          </div>

          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/35">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400 shadow-[0_0_16px_rgba(139,92,246,0.38)]"
              style={{ width: `${selectedScore ?? signal.externalScore}%` }}
            />
          </div>
          <MarketIntelligencePanel signal={signal} marketMode={marketMode} />
          {marketMode === "raw" ? <ForecastPanel signal={signal} /> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-xl border border-white/8 bg-black/18 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">
            Why it is on the radar
          </p>
          <ul className="mt-2 space-y-2">
            {explanations.map((explanation) => (
              <li
                key={explanation.label}
                className="flex items-start gap-2 text-[11px] leading-[1.45] text-white/63"
              >
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300/75" />
                <span>
                  <span className="font-semibold text-white/80">{explanation.label}:</span>{" "}
                  {explanation.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/18 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">
              External evidence
            </p>
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">
              {signal.horizon}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {primaryEvidence.map((item) => (
              <Link
                key={`${item.deckUrl}:${item.deckName}`}
                href={item.deckUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-2 text-[10px] transition hover:border-violet-300/20 hover:bg-violet-400/[0.06]"
              >
                <span className="min-w-0 truncate font-semibold text-white/68">{item.deckName}</span>
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-violet-200/75">
                  {item.inclusionPercent.toFixed(0)}% in deck
                  <ArrowUpRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
            {primaryEvidence.length === 0
              ? (signal.catalysts ?? []).slice(0, 2).map((catalyst) => (
                  <Link
                    key={catalyst.id}
                    href={catalyst.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-2 text-[10px] transition hover:border-violet-300/20 hover:bg-violet-400/[0.06]"
                  >
                    <span className="min-w-0 truncate font-semibold text-white/68">
                      {catalyst.sourceDomain}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-violet-200/75">
                      {catalyst.evidenceLevel}
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </Link>
                ))
              : null}
            {primaryEvidence.length === 0 && (signal.catalysts?.length ?? 0) === 0 ? (
              <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                <span className="rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-2 text-white/48">
                  DustyCards sealed history
                </span>
                <span className="rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-2 text-white/48">
                  CardMarket + eBay sold
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <CatalystPanel signal={signal} />

      <p className="mt-2.5 text-[9px] leading-4 text-white/28">
        {signal.pressureExplanation}. {signal.sourceMode === "structural"
          ? "Older supply can stay illiquid for long periods; confirm condition and real sold listings before buying."
          : "Competitive demand can change quickly after bans, reprints or new releases."}
      </p>
    </article>
  );
}

export default function ExternalSignalBrowser({
  signals: initialSignals,
  sources,
  generatedAt,
  newReleaseChases: initialNewReleaseChases,
  cardQuickActions: initialCardQuickActions,
  progressiveHref = null,
  totalSignalCount = initialSignals.length,
}: Props) {
  const [signals, setSignals] = useState(initialSignals);
  const [cardQuickActions, setCardQuickActions] = useState(initialCardQuickActions);
  const [newReleaseChases, setNewReleaseChases] = useState(initialNewReleaseChases);
  const [progressiveState, setProgressiveState] = useState<"loading" | "ready" | "error">(
    progressiveHref ? "loading" : "ready"
  );
  const [progressiveAttempt, setProgressiveAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_SIGNALS);
  const deferredSearch = useDeferredValue(search);
  const retryProgressiveLoad = useCallback(() => {
    setProgressiveState("loading");
    setProgressiveAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!progressiveHref) return;
    const controller = new AbortController();
    const href = progressiveHref;

    async function loadRemainingSignals() {
      try {
        const response = await fetch(href, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = (await response.json()) as SignalRadarProgressivePayload;
        if (controller.signal.aborted) return;
        setSignals(payload.signals);
        setCardQuickActions((current) => ({ ...payload.cardQuickActions, ...current }));
        setNewReleaseChases(payload.newReleaseChases);
        setProgressiveState("ready");
      } catch {
        if (!controller.signal.aborted) setProgressiveState("error");
      }
    }

    void loadRemainingSignals();
    return () => controller.abort();
  }, [progressiveAttempt, progressiveHref]);
  const newReleaseCardIds = useMemo(
    () => new Set(newReleaseChases?.cards.map((card) => card.cardId) ?? []),
    [newReleaseChases]
  );

  const visibleSignals = useMemo(() => {
    const query = deferredSearch.trim();
    return signals
      .filter((signal) => {
        if (newReleaseCardIds.has(signal.cardId)) return false;
        if (confidence !== "all" && signal.confidence.toLowerCase() !== confidence) return false;
        if (
          origin !== "all" &&
          (origin === "event"
            ? signal.sourceMode !== "event" && signal.sourceMode !== "hybrid"
            : signal.sourceMode !== origin)
        ) return false;
        if (marketMode === "graded" && !signal.marketIntelligence?.graded.available) return false;
        const selectedScenario =
          marketMode === "graded"
            ? signal.marketIntelligence?.gradedScenario
            : signal.marketIntelligence?.rawScenario;
        const selectedScore =
          marketMode === "graded"
            ? signal.marketIntelligence?.gradedOpportunityScore
            : signal.marketIntelligence?.rawOpportunityScore;
        const eventLinked =
          (signal.sourceMode === "event" || signal.sourceMode === "hybrid") &&
          (signal.catalysts?.length ?? 0) > 0;
        // The SSR preview deliberately contains the last persisted observations
        // without the expensive market enrichment. Keep those useful cards
        // visible while the progressive feed is loading (and on a retryable
        // feed error); once the definitive payload arrives, apply the normal
        // scenario gate to the fully enriched/ranked cohort.
        if (
          progressiveState === "ready" &&
          !eventLinked &&
          !isWatchablePriceScenario(selectedScenario, selectedScore)
        ) return false;
        if (!query) return true;
        return textMatchesSearchQuery(
          `${signal.name} ${signal.episodeName} ${signal.episodeCode ?? ""} ${signal.cardNumber ?? ""} ${signal.rarity ?? ""} ${(signal.catalysts ?? []).map((catalyst) => `${catalyst.headline} ${catalyst.contextLabel ?? ""}`).join(" ")}`,
          query
        );
      })
      .sort((left, right) => {
        if (sortKey === "opportunity") {
          const leftScore =
            marketMode === "graded"
              ? left.marketIntelligence?.gradedOpportunityScore
              : left.marketIntelligence?.rawOpportunityScore;
          const rightScore =
            marketMode === "graded"
              ? right.marketIntelligence?.gradedOpportunityScore
              : right.marketIntelligence?.rawOpportunityScore;
          return (rightScore ?? right.externalScore) - (leftScore ?? left.externalScore);
        }
        if (sortKey === "sealed") {
          return (
            (right.marketIntelligence?.sealed.pressureScore ?? 0) -
            (left.marketIntelligence?.sealed.pressureScore ?? 0)
          );
        }
        if (sortKey === "confluence") {
          return (
            (right.marketIntelligence?.confluence.score ?? 0) -
            (left.marketIntelligence?.confluence.score ?? 0)
          );
        }
        if (sortKey === "scarcity") {
          return (
            (right.marketIntelligence?.scarcity.score ?? 0) -
            (left.marketIntelligence?.scarcity.score ?? 0)
          );
        }
        if (sortKey === "meta") {
          return right.maxDeckSharePercent - left.maxDeckSharePercent;
        }
        if (sortKey === "reach") {
          return right.archetypeCount - left.archetypeCount || right.externalScore - left.externalScore;
        }
        return right.externalScore - left.externalScore || left.rank - right.rank;
      });
  }, [
    confidence,
    deferredSearch,
    marketMode,
    newReleaseCardIds,
    origin,
    progressiveState,
    signals,
    sortKey,
  ]);
  const chaseSectionOwnsEverySignal =
    signals.length > 0 && signals.every((signal) => newReleaseCardIds.has(signal.cardId));
  const filtersAreDefault =
    !deferredSearch.trim() && confidence === "all" && origin === "all" && marketMode === "raw";

  return (
    <div className="space-y-4 sm:space-y-5">
      {newReleaseChases ? (
        <NewReleaseChasePanel
          data={newReleaseChases}
          cardQuickActions={cardQuickActions}
        />
      ) : progressiveState === "loading" ? (
        <section
          className="binder-panel overflow-hidden rounded-[1.25rem] p-3 sm:p-4"
          aria-label="Loading new release chase analysis"
          aria-busy="true"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-violet-300/[0.09] motion-safe:animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-28 rounded-full bg-white/[0.07] motion-safe:animate-pulse" />
              <div className="h-5 max-w-md rounded-lg bg-white/[0.055] motion-safe:animate-pulse" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-14 rounded-xl border border-white/7 bg-white/[0.025] motion-safe:animate-pulse"
              />
            ))}
          </div>
          <span className="sr-only">Building the latest set chase read</span>
        </section>
      ) : null}

      <section className="binder-panel rounded-[1.25rem] p-2.5 sm:p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto] lg:items-center">
          <label className="relative col-span-2 block min-w-0 lg:col-span-1">
            <span className="sr-only">Search signal cards</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
              }}
              placeholder="Search cards..."
              className="h-11 w-full rounded-xl border border-white/9 bg-black/24 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-violet-400/35 focus:ring-2 focus:ring-violet-500/12"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
                }}
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-white/35 transition hover:bg-white/8 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="col-span-2 flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:col-span-1">
            {CONFIDENCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                  onClick={() => {
                    setConfidence(option.value);
                    setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
                  }}
                className={cx(
                  "min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold transition",
                  confidence === option.value
                    ? "bg-violet-500 text-white shadow-sm"
                    : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 gap-1 rounded-xl border border-white/8 bg-black/20 p-1" aria-label="Market mode">
            {(["raw", "graded"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setMarketMode(mode);
                  setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
                }}
                className={cx(
                  "min-h-11 min-w-0 flex-1 rounded-lg px-3 text-xs font-semibold capitalize transition lg:flex-none",
                  marketMode === mode
                    ? "bg-violet-500 text-white shadow-sm"
                    : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3">
            <Newspaper className="h-4 w-4 text-white/32" />
            <span className="sr-only">Filter signal origin</span>
            <select
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value as OriginFilter);
                setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
              }}
              className="h-11 min-w-0 bg-transparent pr-2 text-xs font-semibold text-white/62 outline-none [color-scheme:dark]"
            >
              {ORIGIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2 flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 lg:col-span-1">
            <BarChart3 className="h-4 w-4 text-white/32" />
            <span className="sr-only">Sort signals</span>
            <select
              value={sortKey}
              onChange={(event) => {
                setSortKey(event.target.value as SortKey);
                setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
              }}
              className="h-11 min-w-0 bg-transparent pr-2 text-xs font-semibold text-white/62 outline-none [color-scheme:dark]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Radar cards"
          count={progressiveState === "loading" ? totalSignalCount : visibleSignals.length}
          actions={
            <div className="flex items-center gap-2 text-[10px] font-medium text-white/32">
              {progressiveState === "loading" ? (
                <span className="inline-flex items-center gap-1.5" aria-live="polite">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300 motion-safe:animate-pulse" />
                  Loading full radar
                </span>
              ) : progressiveState === "error" ? (
                <button
                  type="button"
                  onClick={retryProgressiveLoad}
                  className="min-h-11 rounded-xl border border-amber-300/15 px-3 font-semibold text-amber-100/72 transition hover:bg-amber-300/[0.07]"
                >
                  Load all cards
                </button>
              ) : null}
              <span title="Time of the latest shared radar update">
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/Amsterdam",
                }).format(new Date(generatedAt))}
              </span>
            </div>
          }
        />

        {visibleSignals.length > 0 ? (
          <div
            className="grid min-w-0 gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 25rem), 1fr))",
            }}
          >
            {visibleSignals.slice(0, visibleLimit).map((signal, index) => (
              <CompactSignalCard
                key={signal.cardId}
                signal={signal}
                marketMode={marketMode}
                quickActionData={cardQuickActions[signal.cardId]}
                prioritizeImage={index === 0}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Radar}
            title={
              chaseSectionOwnsEverySignal && filtersAreDefault
                ? "New-set signals are shown above"
                : "No signals match these filters"
            }
            description={
              chaseSectionOwnsEverySignal && filtersAreDefault
                ? "Radar removed the duplicate cards from this general list."
                : "Clear the search or change a filter."
            }
            actionHref={null}
          />
        )}
        {visibleSignals.length > visibleLimit ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleLimit((current) => current + VISIBLE_SIGNAL_STEP)}
              className="min-h-11 rounded-xl border border-violet-300/16 bg-violet-400/[0.07] px-5 py-2.5 text-xs font-semibold text-violet-100/78 transition hover:border-violet-300/28 hover:bg-violet-400/[0.12]"
            >
              Show more ({visibleSignals.length - visibleLimit})
            </button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 border-t border-white/7 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-white/34">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300/62" />
          <span title="Prices are modelled ranges. Supply, reprints, bans and market conditions can change any setup.">
            Model signal, not a guarantee.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((source) => (
            <Link
              key={source.game}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={cx(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition hover:bg-white/[0.07]",
                source.ok
                  ? "border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-100/70"
                  : "border-rose-300/14 bg-rose-400/[0.055] text-rose-100/70"
              )}
            >
              {source.ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              {source.label}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
