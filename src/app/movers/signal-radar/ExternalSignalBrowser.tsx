"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  type KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Gem,
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
  CardListTileAnalysisLink,
  CardListTileBody,
  CardListTileFooter,
  CardListTileGrid,
  CardListTileHeader,
  CardListTileInsight,
  CardListTileLink,
  CardListTileMedia,
  CardListTileMetrics,
} from "@/components/CardListTile";
import CollectionCardQuickActions, {
  CollectionCardQuickActionsPlaceholder,
} from "@/components/CollectionCardQuickActions";
import EmptyState from "@/components/EmptyState";
import LiveForecastDataStatus from "@/components/LiveForecastDataStatus";
import { SectionHeader } from "@/components/PageHeader";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
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
import {
  getOlderHighRarityDisplayPrice,
  isOlderHighRarityValueSignal,
  isOlderHighRarityValueSignalAtLeastAge,
  type OlderHighRarityPriceSource,
} from "@/lib/older-high-rarity-value";
import {
  matchesPopularPokemonFilter,
  POPULAR_POKEMON_FILTER_OPTIONS,
  type PopularPokemonFilter,
} from "@/lib/popular-pokemon";
import {
  getSignalRadarSortOptions,
  resolveSignalRadarSortKey,
  type SignalRadarSortKey,
} from "@/lib/signal-radar-sort-options";
import type {
  SealedSignalRadarData,
  SealedSignalRadarItem,
} from "@/lib/sealed-signal-radar";
import {
  cacheSignalRadarFeed,
  CHASE_WATCH_RETRY_DELAY_MS,
  commitSignalRadarFeedResult,
  getCachedSignalRadarFeed,
  getChaseWatchRevalidateDelayMs,
  MIN_CHASE_WATCH_REVALIDATE_DELAY_MS,
  scheduleSignalRadarFeedStart,
  type OlderHighRarityValuePayload,
  type SignalRadarChaseWatchPayload,
  type SignalRadarProgressivePayload,
} from "@/lib/signal-radar-progressive";

type ConfidenceFilter = "all" | Lowercase<ExternalSignalConfidence>;
type OriginFilter =
  | "all"
  | "event"
  | "competitive"
  | "hybrid"
  | "structural"
  | "older-high-rarity";
type SealedHistoryFilter = "all" | "established" | "building";
const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

interface Props {
  signals: ExternalCardSignal[];
  sources: ExternalSignalSourceStatus[];
  generatedAt: string;
  newReleaseChases?: ExpansionChaseRadarData | null;
  cardQuickActions: CardQuickActionMap;
  progressiveHref?: string | null;
  olderHighRarityHref?: string | null;
  chaseWatchHref?: string | null;
  manualChaseRefreshHref?: string | null;
  totalSignalCount?: number;
  initialOrigin?: OriginFilter;
}

const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "emerging", label: "Emerging" },
];

const ORIGIN_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "event", label: "Leaks & reveals" },
  { value: "competitive", label: "Tournament" },
  { value: "hybrid", label: "Hybrid" },
  { value: "structural", label: "Scarcity & value" },
  { value: "older-high-rarity", label: "Old high-rarity value" },
];

const INITIAL_VISIBLE_SIGNALS = 12;
const VISIBLE_SIGNAL_STEP = 12;
const OLDER_HIGH_RARITY_AGE_OPTIONS = [5, 7, 10, 15, 20] as const;
const SINGLES_EXPANDED_STORAGE_KEY = "dustycards:signal-radar:singles-expanded";
const SEALED_EXPANDED_STORAGE_KEY = "dustycards:signal-radar:sealed-expanded";

function readStoredExpandedState(key: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // Storage can be unavailable in private browsing; the section stays open.
  }
  return null;
}

function storeExpandedState(key: string, expanded: boolean) {
  try {
    window.localStorage.setItem(key, String(expanded));
  } catch {
    // The control still works for the current page when storage is unavailable.
  }
}

function RadarSectionToggle({
  expanded,
  label,
  onToggle,
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/9 bg-white/[0.035] px-3 text-[11px] font-semibold text-white/58 transition hover:border-violet-300/20 hover:bg-violet-400/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      {expanded ? "Collapse" : "Expand"}
      <ChevronDown
        className={cx("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
        aria-hidden="true"
      />
    </button>
  );
}

function getReleaseYear(value: string | null | undefined): string | null {
  return value?.match(/^(\d{4})/)?.[1] ?? null;
}

function formatRadarGeneratedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

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

function getOutlookBadge(outlook: ExternalPriceScenario["outlook"] | null | undefined) {
  if (!outlook) return null;
  if (outlook === "strong_up") {
    return {
      label: "Strong upside",
      classes: "border-emerald-300/20 bg-emerald-400/[0.09] text-emerald-200",
    };
  }
  if (outlook === "modest_up") {
    return {
      label: "Mild upside",
      classes: "border-sky-300/20 bg-sky-400/[0.08] text-sky-200",
    };
  }
  if (outlook === "down") {
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

function getScenarioOutlookBadge(scenario: ExternalPriceScenario | null | undefined) {
  return getOutlookBadge(scenario?.outlook);
}

export function getSignalExplanations(signal: ExternalCardSignal) {
  const hypeReset = signal.marketIntelligence?.hypeReset;
  if (hypeReset) {
    const currency = signal.currency === "USD" ? "$" : "€";
    return [
      {
        label: hypeReset.label,
        text: hypeReset.explanation,
      },
      {
        label: "Former hype peak",
        text: `The tracked market previously held near ${currency}${hypeReset.peakPrice.toFixed(2)} and now sits around ${currency}${hypeReset.supportPrice.toFixed(2)}.`,
      },
      {
        label: "Falling-knife check",
        text: `The latest ${hypeReset.stableDays}-day band is only ${hypeReset.rangePct.toFixed(1)}% wide; a renewed breakdown removes this setup automatically.`,
      },
    ];
  }
  if (signal.sourceMode === "structural") {
    const market = signal.marketIntelligence;
    return [
      {
        label: isOlderHighRarityValueSignal(signal)
          ? "Old high-rarity value"
          : "Structural setup",
        text: signal.reasons[0] ?? "Older, harder-to-replace supply is priced below its structural profile.",
      },
      {
        label: "Sealed pressure",
        text: market
          ? `${market.sealed.pressureLabel} (${market.sealed.pressureScore}/100). ${market.sealed.packPrice != null ? `Cheapest linked pack is about €${market.sealed.packPrice.toFixed(2)}.` : "No reliable single-pack price is stored yet."}`
          : "Sealed market context is incomplete.",
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
          <stop offset="0" stopColor="var(--dc-primary)" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="var(--dc-primary-hover)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--dc-cyan)" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={`scenario-line-${scenario.marketMode}-${detailed ? "detail" : "compact"}`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--dc-primary-soft)" />
          <stop offset="1" stopColor="var(--dc-cyan)" />
        </linearGradient>
      </defs>
      {tickValues.map((tick) => (
        <g key={tick}>
          <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} stroke="rgb(var(--dc-border-rgb) / 0.72)" strokeWidth={detailed ? 1 : 0.5} strokeDasharray={detailed ? "4 5" : undefined} />
          {detailed ? <text x={plot.left - 10} y={y(tick) + 4} textAnchor="end" fill="rgb(var(--dc-text-muted-rgb) / 0.78)" fontSize="10">{compactPrice(tick)}</text> : null}
        </g>
      ))}
      <polygon points={band} fill={`url(#scenario-${scenario.marketMode}-${detailed ? "detail" : "compact"})`} />
      {detailed ? (
        <>
          <polyline points={highValues.map((value, index) => `${x[index]},${y(value)}`).join(" ")} fill="none" stroke="rgb(var(--dc-cyan-rgb) / 0.48)" strokeWidth="1.25" strokeDasharray="5 5" />
          <polyline points={lowValues.map((value, index) => `${x[index]},${y(value)}`).join(" ")} fill="none" stroke="rgb(var(--dc-negative-rgb) / 0.42)" strokeWidth="1.25" strokeDasharray="5 5" />
        </>
      ) : null}
      <polyline points={line} fill="none" stroke={`url(#scenario-line-${scenario.marketMode}-${detailed ? "detail" : "compact"})`} strokeWidth={detailed ? 3 : 1.5} strokeLinecap="round" strokeLinejoin="round" />
      {baseValues.map((value, index) => (
        <g key={x[index]}>
          <circle cx={x[index]} cy={y(value)} r={detailed ? 6 : 1.5} fill="var(--dc-surface-primary)" stroke={index === 0 ? "var(--dc-text-primary)" : "var(--dc-cyan)"} strokeWidth={detailed ? 2.5 : 0} />
          {detailed ? <text x={x[index]} y={Math.max(11, y(value) - 11)} textAnchor="middle" fill="rgb(var(--dc-text-primary-rgb) / 0.78)" fontSize="10" fontWeight="700">{compactPrice(value)}</text> : null}
        </g>
      ))}
      {detailed ? horizonLabels.map((label, index) => <text key={label} x={x[index]} y={176} textAnchor="middle" fill="rgb(var(--dc-text-muted-rgb) / 0.82)" fontSize="10" fontWeight="600">{label}</text>) : null}
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
            <p className="mt-0.5 text-[9px] text-white/35">
              {scenario?.outlook === "flat"
                ? "No clear direction · price expected to hold near current level"
                : "Model range · not a guaranteed target"}
            </p>
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
  { key: "1.5x-30d", label: "1.5x", horizon: "30 days", minimum: 40 },
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
            Live outcome learning
          </div>
          <p className="mt-1 text-[10px] leading-4 text-white/42">
            Every hit and miss is followed on the same price source; finished cohorts can improve future ranking.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-300/12 bg-sky-400/[0.06] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.11em] text-sky-100/62">
          {signal.forecast?.modelVersion ?? "learning"}
        </span>
      </div>
      <LiveForecastDataStatus forecast={signal.forecast} className="mt-2" />
      {!signal.forecast?.tracking ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-4">
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
                      ? progress > 0
                        ? `${summary?.hits ?? 0} correct · ${Math.max(0, progress - (summary?.hits ?? 0))} missed`
                        : "Tracking starts after the next model scan"
                      : waitingLabel}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
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
  const olderHighRarityPriceLabel = isOlderHighRarityValueSignal(signal)
    ? signal.currency === "USD"
      ? signal.olderHighRarityPrices?.tcgplayerEur != null
        ? `TCGPlayer · ≈ ${formatCurrency(signal.olderHighRarityPrices.tcgplayerEur, "EUR")}`
        : "TCGPlayer · USD"
      : "CardMarket · EN NM"
    : null;
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
      layout="showcase"
      data-signal-card-id={signal.cardId}
    >
      <CardListTileLink
        href={detailHref}
        label={`Open full analysis for ${signal.name}`}
        // The complete Radar feed can expose dozens of detail links at once.
        // Prefetching them together creates invisible multi-second database
        // bursts and delays the collector's next real navigation.
        prefetch={false}
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
        <CardListTileHeader
          badges={
            <>
              <span className={cx("rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em]", getConfidenceClasses(signal.confidence))}>
                {signal.confidence}
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/45">
                {signal.marketIntelligence?.hypeReset
                  ? "Hype reset"
                  : isOlderHighRarityValueSignal(signal)
                    ? "Old high-rarity"
                    : signal.sourceMode === "structural"
                      ? "Scarcity"
                      : signal.sourceMode === "event"
                        ? "Event"
                        : signal.sourceMode === "hybrid"
                          ? "Hybrid"
                          : "Tournament"}
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
            </>
          }
          priceLabel={olderHighRarityPriceLabel ?? marketMode}
          priceValue={
            isOlderHighRarityValueSignal(signal)
              ? formatCurrency(signal.currentPrice, signal.currency)
              : scenario
                ? formatCurrency(scenario.currentPrice, scenario.currency)
                : formatCurrency(signal.currentPrice, signal.currency)
          }
          title={signal.name}
          meta={
            <span className="truncate">
              {signal.episodeName}{signal.cardNumber ? ` / ${signal.cardNumber}` : ""}{signal.rarity ? ` / ${signal.rarity}` : ""}
            </span>
          }
        />

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
              {!isOlderHighRarityValueSignal(signal) &&
              scenario &&
              base180 != null &&
              scenarioChangePercent != null
                ? ` · ${formatCurrency(scenario.currentPrice, scenario.currency)} → ${formatCurrency(base180, scenario.currency)} (${scenarioChangePercent >= 0 ? "+" : ""}${scenarioChangePercent.toFixed(0)}%)`
                : ""}
            </span>
            {" · "}{primaryReason}
          </span>
        </CardListTileInsight>

        <CardListTileFooter
          data-signal-card-footer
          className="max-[359px]:flex-col max-[359px]:items-stretch max-[359px]:gap-1"
        >
          <CardListTileAnalysisLink
            data-signal-analysis-link
            className="max-[359px]:w-full max-[359px]:justify-center"
          >
            Analysis
            <ChevronRight className="h-3.5 w-3.5 max-[359px]:hidden" />
          </CardListTileAnalysisLink>
          {quickActionData ? (
            <div className="pointer-events-auto relative z-10 shrink-0 max-[359px]:self-end">
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
            <CollectionCardQuickActionsPlaceholder className="pointer-events-auto relative z-10 max-[359px]:self-end" />
          )}
        </CardListTileFooter>
      </CardListTileBody>
    </CardListTile>
  );
}

function formatSealedTrend(value: number | null): string {
  if (value == null) return "Learning";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function sealedTrendClass(value: number | null): string {
  if (value == null || Math.abs(value) < 0.1) return "text-white/42";
  return value > 0 ? "text-emerald-200" : "text-rose-200";
}

function sealedHistoryLabel(item: SealedSignalRadarItem): string {
  if (item.historyStatus === "established") return "90d ready";
  if (item.historyStatus === "building") return "30d ready";
  return "Learning";
}

function SealedSignalCard({
  item,
  onOpen,
}: {
  item: SealedSignalRadarItem;
  onOpen: (product: SealedModalProductData) => void;
}) {
  const openProduct = () => onOpen(item.modalProduct);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProduct();
    }
  };
  const outlook = getOutlookBadge(item.outlook);

  return (
    <CardListTile
      interactive
      accent="radar"
      layout="showcase"
      role="button"
      tabIndex={0}
      aria-label={`Open sealed analysis for ${item.name}`}
      onClick={openProduct}
      onKeyDown={onKeyDown}
      data-sealed-signal-id={item.productId}
    >
      <CardListTileMedia
        imageUrl={item.imageUrl}
        kind="product"
        className="pointer-events-none relative z-[1]"
      >
        {item.imageUrl ? (
          <CachedImage
            sourceUrl={item.imageUrl}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 116px, 120px"
            className="object-contain p-2"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/25">
            <PackageSearch className="h-8 w-8" />
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/75 px-1.5 text-[10px] font-black text-white">
          #{item.rank}
        </span>
      </CardListTileMedia>

      <CardListTileBody className="pointer-events-none relative z-[1]">
        <CardListTileHeader
          badges={
            <>
              <span
                className={cx(
                  "rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em]",
                  getConfidenceClasses(item.confidence)
                )}
              >
                {item.confidence}
              </span>
              <span className="rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-violet-100/72">
                Sealed
              </span>
              <span
                className={cx(
                  "rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em]",
                  item.historyStatus === "established"
                    ? "border-emerald-300/16 bg-emerald-400/[0.07] text-emerald-100/70"
                    : item.historyStatus === "building"
                      ? "border-sky-300/16 bg-sky-400/[0.07] text-sky-100/70"
                      : "border-amber-300/16 bg-amber-400/[0.07] text-amber-100/70"
                )}
              >
                {sealedHistoryLabel(item)}
              </span>
              {outlook ? (
                <span
                  className={cx(
                    "hidden rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] sm:inline-flex",
                    outlook.classes
                  )}
                >
                  {outlook.label}
                </span>
              ) : null}
            </>
          }
          priceLabel="EU market"
          priceValue={formatCurrency(item.currentPrice, item.currency)}
          title={item.name}
          meta={
            <span className="truncate">
              {item.episodeName}
              {item.episodeCode ? ` · ${item.episodeCode}` : ""}
              {` · ${item.categoryLabel}`}
            </span>
          }
        />

        <CardListTileMetrics
          className="grid-cols-3 sm:grid-cols-3"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
        >
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/30">Score</p>
            <p className="mt-0.5 text-[12px] font-bold tabular-nums text-violet-100/82">
              {item.score}/100
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/30">30d</p>
            <p className={cx("mt-0.5 truncate text-[12px] font-bold tabular-nums", sealedTrendClass(item.trend30dPct))}>
              {formatSealedTrend(item.trend30dPct)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/30">90d</p>
            <p className={cx("mt-0.5 truncate text-[12px] font-bold tabular-nums", sealedTrendClass(item.trend90dPct))}>
              {formatSealedTrend(item.trend90dPct)}
            </p>
          </div>
        </CardListTileMetrics>

        <CardListTileInsight>
          {item.riskLabel ? (
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/68" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/62" />
          )}
          <span className="line-clamp-2">
            <strong className="font-bold text-violet-100/76">{item.pressureLabel}</strong>
            {` · ${item.riskLabel ?? item.reasons[0]}`}
          </span>
        </CardListTileInsight>

        <CardListTileFooter>
          <CardListTileAnalysisLink>
            Sealed analysis
            <ChevronRight className="h-3.5 w-3.5" />
          </CardListTileAnalysisLink>
          <span className="text-right text-[9px] font-semibold tabular-nums text-white/35">
            {item.historyDays} price days
          </span>
        </CardListTileFooter>
      </CardListTileBody>
    </CardListTile>
  );
}

function SealedRadarSection({
  data,
  state,
  onRetry,
  expanded,
  onToggle,
  pokemonFilter,
}: {
  data: SealedSignalRadarData | null;
  state: "loading" | "ready" | "error";
  onRetry: () => void;
  expanded: boolean;
  onToggle: () => void;
  pokemonFilter: PopularPokemonFilter;
}) {
  const [historyFilter, setHistoryFilter] = useState<SealedHistoryFilter>("all");
  const [visibleLimit, setVisibleLimit] = useState(6);
  const [selectedProduct, setSelectedProduct] = useState<SealedModalProductData | null>(null);
  const visibleItems = useMemo(() => {
    const items = (data?.items ?? []).filter((item) =>
      matchesPopularPokemonFilter(`${item.name} ${item.episodeName}`, pokemonFilter)
    );
    if (historyFilter === "established") {
      return items.filter((item) => item.historyStatus === "established");
    }
    if (historyFilter === "building") {
      return items.filter((item) => item.historyStatus !== "established");
    }
    return items;
  }, [data?.items, historyFilter, pokemonFilter]);

  if (!expanded && !data) {
    return (
      <section>
        <SectionHeader
          title="Sealed radar"
          count={state === "loading" ? "…" : 0}
          actions={
            <RadarSectionToggle
              expanded={expanded}
              label="sealed radar"
              onToggle={onToggle}
            />
          }
        />
      </section>
    );
  }

  if (state === "loading" && !data) {
    return (
      <section className="binder-panel rounded-[1.25rem] p-3 sm:p-4" aria-busy="true">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-300/[0.09] motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 rounded-full bg-white/[0.07] motion-safe:animate-pulse" />
            <div className="h-4 max-w-sm rounded-full bg-white/[0.05] motion-safe:animate-pulse" />
          </div>
        </div>
        <span className="sr-only">Building sealed Signal Radar</span>
      </section>
    );
  }
  if (state === "error" && !data) {
    return (
      <section className="binder-panel flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] p-3 sm:p-4">
        <div>
          <p className="text-xs font-semibold text-white/72">Sealed Radar could not be loaded</p>
          <p className="mt-1 text-[10px] text-white/38">The singles Radar is still available.</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl border border-amber-300/15 px-3 text-xs font-semibold text-amber-100/72 transition hover:bg-amber-300/[0.07]"
        >
          Retry
        </button>
      </section>
    );
  }
  if (!data || data.items.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <SectionHeader
        title="Sealed radar"
        count={visibleItems.length}
        actions={
          <div className="flex max-w-full items-center gap-2">
            {expanded ? (
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {([
                  ["all", "Best"],
                  ["established", "90d ready"],
                  ["building", "Building"],
                ] as const).map(([value, filterLabel]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setHistoryFilter(value);
                      setVisibleLimit(6);
                    }}
                    className={cx(
                      "min-h-9 shrink-0 rounded-lg px-2.5 text-[10px] font-semibold transition",
                      historyFilter === value
                        ? "bg-violet-500 text-white"
                        : "text-white/45 hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    {filterLabel}
                  </button>
                ))}
              </div>
            ) : null}
            <RadarSectionToggle
              expanded={expanded}
              label="sealed radar"
              onToggle={onToggle}
            />
          </div>
        }
      />
      <div className={expanded ? "contents" : "hidden"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[9px] font-medium text-white/34">
        <span>{data.ready90dProducts.toLocaleString("en-US")} products with 90d evidence</span>
        <span>{data.buildingProducts.toLocaleString("en-US")} building 30d history</span>
        <span>{data.learningProducts.toLocaleString("en-US")} still learning</span>
      </div>
      {visibleItems.length > 0 ? (
        <CardListTileGrid>
          {visibleItems.slice(0, visibleLimit).map((item) => (
            <SealedSignalCard key={item.productId} item={item} onOpen={setSelectedProduct} />
          ))}
        </CardListTileGrid>
      ) : (
        <EmptyState
          icon={PackageSearch}
          title={pokemonFilter === "all" ? "No sealed products in this history stage" : "No matching Pokémon products"}
          description={pokemonFilter === "all" ? "History collection continues automatically." : "Choose All Pokémon to show the complete sealed Radar."}
          actionHref={null}
        />
      )}
      {visibleItems.length > visibleLimit ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleLimit((current) => current + 6)}
            className="min-h-11 rounded-xl border border-violet-300/16 bg-violet-400/[0.07] px-5 py-2.5 text-xs font-semibold text-violet-100/78 transition hover:border-violet-300/28 hover:bg-violet-400/[0.12]"
          >
            Show more sealed ({visibleItems.length - visibleLimit})
          </button>
        </div>
      ) : null}
      </div>
      {selectedProduct ? (
        <SealedProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </section>
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
      className="group relative min-w-0 overflow-hidden rounded-[1.6rem] border border-[rgb(var(--dc-border-rgb)/0.92)] p-3 shadow-[0_18px_55px_var(--dc-shadow-color)] transition duration-200 hover:border-violet-300/22 sm:p-4"
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
                    : isOlderHighRarityValueSignal(signal)
                      ? "Old high-rarity value"
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
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400 shadow-[0_0_16px_rgb(var(--dc-primary-rgb)/0.38)]"
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
  olderHighRarityHref = null,
  chaseWatchHref = null,
  manualChaseRefreshHref = null,
  totalSignalCount = initialSignals.length,
  initialOrigin = "all",
}: Props) {
  const [signals, setSignals] = useState(initialSignals);
  const [sealedRadar, setSealedRadar] = useState<SealedSignalRadarData | null>(null);
  const [cardQuickActions, setCardQuickActions] = useState(initialCardQuickActions);
  const [newReleaseChases, setNewReleaseChases] = useState(initialNewReleaseChases);
  const [chaseState, setChaseState] = useState<"loading" | "ready" | "error">(
    initialNewReleaseChases || !chaseWatchHref ? "ready" : "loading"
  );
  const [chaseAttempt, setChaseAttempt] = useState(0);
  const [progressiveState, setProgressiveState] = useState<"loading" | "ready" | "error">(
    progressiveHref ? "loading" : "ready"
  );
  const [progressiveAttempt, setProgressiveAttempt] = useState(0);
  const [olderHighRaritySignals, setOlderHighRaritySignals] = useState<
    ExternalCardSignal[] | null
  >(null);
  const [olderHighRarityTotal, setOlderHighRarityTotal] = useState<number | null>(null);
  const [olderHighRarityState, setOlderHighRarityState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(initialOrigin === "older-high-rarity" ? "loading" : "idle");
  const [olderHighRarityAttempt, setOlderHighRarityAttempt] = useState(
    initialOrigin === "older-high-rarity" ? 1 : 0
  );
  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>(initialOrigin);
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const [sortKey, setSortKey] = useState<SignalRadarSortKey>("opportunity");
  const [releaseYear, setReleaseYear] = useState("all");
  const [minimumOlderAgeYears, setMinimumOlderAgeYears] = useState(5);
  const [olderHighRarityPriceSource, setOlderHighRarityPriceSource] =
    useState<OlderHighRarityPriceSource>("cardmarket");
  const [popularPokemonFilter, setPopularPokemonFilter] =
    useState<PopularPokemonFilter>("all");
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_SIGNALS);
  const [singlesExpanded, setSinglesExpanded] = useState(true);
  const [sealedExpanded, setSealedExpanded] = useState(true);
  const deferredSearch = useDeferredValue(search);
  const retryProgressiveLoad = useCallback(() => {
    setProgressiveState("loading");
    setProgressiveAttempt((current) => current + 1);
  }, []);
  const retryChaseLoad = useCallback(() => {
    setChaseState("loading");
    setChaseAttempt((current) => current + 1);
  }, []);
  const loadOlderHighRaritySignals = useCallback(() => {
    if (!olderHighRarityHref || olderHighRaritySignals) return;
    setOlderHighRarityState("loading");
    setOlderHighRarityAttempt((current) => current + 1);
  }, [olderHighRarityHref, olderHighRaritySignals]);

  useEffect(() => {
    const storedSingles = readStoredExpandedState(SINGLES_EXPANDED_STORAGE_KEY);
    const storedSealed = readStoredExpandedState(SEALED_EXPANDED_STORAGE_KEY);
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (storedSingles != null) setSinglesExpanded(storedSingles);
      if (storedSealed != null) setSealedExpanded(storedSealed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSinglesExpanded = useCallback(() => {
    setSinglesExpanded((current) => {
      const next = !current;
      storeExpandedState(SINGLES_EXPANDED_STORAGE_KEY, next);
      return next;
    });
  }, []);
  const toggleSealedExpanded = useCallback(() => {
    setSealedExpanded((current) => {
      const next = !current;
      storeExpandedState(SEALED_EXPANDED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!progressiveHref) return;
    const href = progressiveHref;
    const cached = getCachedSignalRadarFeed(href);
    const hasCachedFeed = Boolean(cached);
    let active = true;
    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setSignals(cached.signals);
        setSealedRadar(cached.sealedRadar);
        setProgressiveState("ready");
      });
    }

    async function loadRemainingSignals(signal: AbortSignal) {
      try {
        const response = await fetch(href, {
          cache: "default",
          credentials: "same-origin",
          signal,
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = (await response.json()) as SignalRadarProgressivePayload;
        commitSignalRadarFeedResult(signal, () => {
          cacheSignalRadarFeed(href, payload);
          setSignals(payload.signals);
          setSealedRadar(payload.sealedRadar);
          setCardQuickActions((current) => ({ ...payload.cardQuickActions, ...current }));
          if (payload.newReleaseChases) setNewReleaseChases(payload.newReleaseChases);
          setProgressiveState("ready");
        });
      } catch {
        if (!signal.aborted && !hasCachedFeed) setProgressiveState("error");
      }
    }

    // Give the already rendered Radar cards (and the leading detail prefetch)
    // a short uncontended window. SQLite work in the full cohort enrichment is
    // intentionally heavy; starting it in the same instant as a card tap made
    // that detail request wait for the feed to finish. If navigation happens
    // during this window, cleanup cancels the timer and the feed never starts.
    const cancelLoad = scheduleSignalRadarFeedStart(progressiveAttempt, loadRemainingSignals);
    return () => {
      active = false;
      cancelLoad();
    };
  }, [progressiveAttempt, progressiveHref]);
  useEffect(() => {
    if (!olderHighRarityHref || olderHighRarityAttempt === 0) return;
    const href = olderHighRarityHref;
    const controller = new AbortController();

    async function loadFullOlderHighRarityCohort() {
      try {
        const response = await fetch(href, {
          cache: "default",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = (await response.json()) as OlderHighRarityValuePayload;
        if (controller.signal.aborted) return;
        setOlderHighRaritySignals(payload.signals);
        setOlderHighRarityTotal(payload.total);
        setCardQuickActions((current) => ({
          ...payload.cardQuickActions,
          ...current,
        }));
        setOlderHighRarityState("ready");
      } catch {
        if (!controller.signal.aborted) setOlderHighRarityState("error");
      }
    }

    void loadFullOlderHighRarityCohort();
    return () => controller.abort();
  }, [olderHighRarityAttempt, olderHighRarityHref]);
  useEffect(() => {
    if (!chaseWatchHref || newReleaseChases) return;
    const href = chaseWatchHref;
    const controller = new AbortController();

    async function loadInitialChaseWatch() {
      try {
        const response = await fetch(href, {
          cache: "default",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = (await response.json()) as SignalRadarChaseWatchPayload;
        if (controller.signal.aborted) return;
        setNewReleaseChases(payload.newReleaseChases);
        setCardQuickActions((current) => ({
          ...(payload.cardQuickActions ?? {}),
          ...current,
        }));
        setChaseState("ready");
      } catch {
        if (!controller.signal.aborted) setChaseState("error");
      }
    }

    void loadInitialChaseWatch();
    return () => controller.abort();
  }, [chaseAttempt, chaseWatchHref, newReleaseChases]);
  useEffect(() => {
    const nextRefreshAt = newReleaseChases?.priceWatch.nextRefreshAt;
    if (!chaseWatchHref || !newReleaseChases?.priceWatch.enabled || !nextRefreshAt) return;

    const controller = new AbortController();
    let timer: number | null = null;
    const schedule = (delayMs: number) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), delayMs);
    };
    const refresh = async () => {
      if (document.visibilityState !== "visible") {
        schedule(MIN_CHASE_WATCH_REVALIDATE_DELAY_MS);
        return;
      }
      try {
        const response = await fetch(chaseWatchHref, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = (await response.json()) as SignalRadarChaseWatchPayload;
        if (controller.signal.aborted) return;
        setNewReleaseChases(payload.newReleaseChases);
        setCardQuickActions((current) => ({
          ...(payload.cardQuickActions ?? {}),
          ...current,
        }));
        const nextDelay = getChaseWatchRevalidateDelayMs(
          payload.newReleaseChases?.priceWatch.nextRefreshAt
        );
        if (nextDelay != null) schedule(nextDelay);
      } catch {
        if (!controller.signal.aborted) schedule(CHASE_WATCH_RETRY_DELAY_MS);
      }
    };
    const initialDelay = getChaseWatchRevalidateDelayMs(nextRefreshAt);
    if (initialDelay != null) schedule(initialDelay);
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        new Date(nextRefreshAt).getTime() <= Date.now()
      ) {
        schedule(MIN_CHASE_WATCH_REVALIDATE_DELAY_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [chaseWatchHref, newReleaseChases?.priceWatch.enabled, newReleaseChases?.priceWatch.nextRefreshAt]);
  const newReleaseCardIds = useMemo(
    () => new Set(newReleaseChases?.cards.map((card) => card.cardId) ?? []),
    [newReleaseChases]
  );
  const activeSignalCohort =
    origin === "older-high-rarity" && olderHighRaritySignals
      ? olderHighRaritySignals
      : signals;
  const releaseYears = useMemo(
    () =>
      Array.from(
        new Set(
          activeSignalCohort
            .map((signal) => getReleaseYear(signal.episodeReleaseDate))
            .filter((year): year is string => Boolean(year))
        )
      ).sort((left, right) => right.localeCompare(left)),
    [activeSignalCohort]
  );
  const activeReleaseYear = releaseYears.includes(releaseYear) ? releaseYear : "all";
  const olderHighRarityActive = origin === "older-high-rarity";
  const activeSortOptions = getSignalRadarSortOptions(olderHighRarityActive);
  const activeSortKey = resolveSignalRadarSortKey(sortKey, olderHighRarityActive);
  const olderHighRarityCount = useMemo(
    () =>
      olderHighRarityTotal ??
      olderHighRaritySignals?.length ??
      signals.filter(isOlderHighRarityValueSignal).length,
    [olderHighRaritySignals, olderHighRarityTotal, signals]
  );

  const visibleSignals = useMemo(() => {
    const query = deferredSearch.trim();
    return activeSignalCohort
      .flatMap((signal) => {
        if (origin !== "older-high-rarity") return [signal];
        const displayPrice =
          getOlderHighRarityDisplayPrice(
            signal.olderHighRarityPrices,
            olderHighRarityPriceSource,
          ) ??
          (olderHighRarityPriceSource === "cardmarket" &&
          signal.currentPrice != null &&
          signal.currentPrice > 0
            ? {
                value: signal.currentPrice,
                currency: signal.currency,
                convertedEur:
                  signal.currency === "EUR" ? signal.currentPrice : null,
              }
            : null);
        if (!displayPrice) return [];
        return [
          {
            ...signal,
            currentPrice: displayPrice.value,
            currency: displayPrice.currency,
          },
        ];
      })
      .filter((signal) => {
        if (newReleaseCardIds.has(signal.cardId)) return false;
        if (confidence !== "all" && signal.confidence.toLowerCase() !== confidence) return false;
        if (
          origin !== "all" &&
          (origin === "older-high-rarity"
            ? !isOlderHighRarityValueSignal(signal)
            : origin === "event"
              ? signal.sourceMode !== "event" && signal.sourceMode !== "hybrid"
              : signal.sourceMode !== origin)
        ) return false;
        if (
          origin === "older-high-rarity" &&
          !isOlderHighRarityValueSignalAtLeastAge(signal, minimumOlderAgeYears)
        ) return false;
        if (
          !matchesPopularPokemonFilter(signal.name, popularPokemonFilter)
        ) return false;
        if (marketMode === "graded" && !signal.marketIntelligence?.graded.available) return false;
        if (
          activeReleaseYear !== "all" &&
          getReleaseYear(signal.episodeReleaseDate) !== activeReleaseYear
        ) return false;
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
          !isOlderHighRarityValueSignal(signal) &&
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
        if (activeSortKey === "price_asc" || activeSortKey === "price_desc") {
          const leftPrice =
            origin === "older-high-rarity"
              ? left.currentPrice
              : (marketMode === "graded"
                  ? left.marketIntelligence?.gradedScenario?.currentPrice
                  : left.marketIntelligence?.rawScenario?.currentPrice) ?? left.currentPrice;
          const rightPrice =
            origin === "older-high-rarity"
              ? right.currentPrice
              : (marketMode === "graded"
                  ? right.marketIntelligence?.gradedScenario?.currentPrice
                  : right.marketIntelligence?.rawScenario?.currentPrice) ?? right.currentPrice;
          if (leftPrice == null && rightPrice == null) return left.rank - right.rank;
          if (leftPrice == null) return 1;
          if (rightPrice == null) return -1;
          return activeSortKey === "price_asc" ? leftPrice - rightPrice : rightPrice - leftPrice;
        }
        if (activeSortKey === "release_newest" || activeSortKey === "release_oldest") {
          const leftDate = left.episodeReleaseDate ?? "";
          const rightDate = right.episodeReleaseDate ?? "";
          if (!leftDate && !rightDate) return left.rank - right.rank;
          if (!leftDate) return 1;
          if (!rightDate) return -1;
          const difference = leftDate.localeCompare(rightDate);
          return activeSortKey === "release_oldest" ? difference : -difference;
        }
        if (activeSortKey === "rarity_cohort") {
          return (
            (left.olderHighRarityValue?.rarityCohortSize ?? Number.POSITIVE_INFINITY) -
              (right.olderHighRarityValue?.rarityCohortSize ?? Number.POSITIVE_INFINITY) ||
            left.rank - right.rank
          );
        }
        if (activeSortKey === "history") {
          return (
            (right.olderHighRarityValue?.historyPoints ?? 0) -
              (left.olderHighRarityValue?.historyPoints ?? 0) ||
            left.rank - right.rank
          );
        }
        if (activeSortKey === "opportunity") {
          if (origin === "older-high-rarity") return left.rank - right.rank;
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
        if (activeSortKey === "sealed") {
          return (
            (right.marketIntelligence?.sealed.pressureScore ?? 0) -
            (left.marketIntelligence?.sealed.pressureScore ?? 0)
          );
        }
        if (activeSortKey === "confluence") {
          return (
            (right.marketIntelligence?.confluence.score ?? 0) -
            (left.marketIntelligence?.confluence.score ?? 0)
          );
        }
        if (activeSortKey === "scarcity") {
          return (
            (right.marketIntelligence?.scarcity.score ?? 0) -
            (left.marketIntelligence?.scarcity.score ?? 0)
          );
        }
        if (activeSortKey === "meta") {
          return right.maxDeckSharePercent - left.maxDeckSharePercent;
        }
        if (activeSortKey === "reach") {
          return right.archetypeCount - left.archetypeCount || right.externalScore - left.externalScore;
        }
        return right.externalScore - left.externalScore || left.rank - right.rank;
      });
  }, [
    confidence,
    activeReleaseYear,
    deferredSearch,
    marketMode,
    minimumOlderAgeYears,
    newReleaseCardIds,
    olderHighRarityPriceSource,
    origin,
    popularPokemonFilter,
    progressiveState,
    activeSignalCohort,
    activeSortKey,
  ]);
  const chaseSectionOwnsEverySignal =
    signals.length > 0 && signals.every((signal) => newReleaseCardIds.has(signal.cardId));
  const filtersAreDefault =
    !deferredSearch.trim() &&
    confidence === "all" &&
    origin === "all" &&
    marketMode === "raw" &&
    activeReleaseYear === "all" &&
    popularPokemonFilter === "all";

  return (
    <div className="space-y-4 sm:space-y-5">
      {newReleaseChases ? (
        <NewReleaseChasePanel
          data={newReleaseChases}
          cardQuickActions={cardQuickActions}
          pokemonFilter={popularPokemonFilter}
          manualRefreshHref={manualChaseRefreshHref}
          onDataChange={setNewReleaseChases}
        />
      ) : chaseState === "loading" ? (
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
      ) : chaseState === "error" ? (
        <section className="binder-panel rounded-[1.25rem] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white/72">
                Chase Watch could not be loaded
              </p>
              <p className="mt-1 text-[10px] text-white/38">
                The general Radar is still available.
              </p>
            </div>
            <button
              type="button"
              onClick={retryChaseLoad}
              className="min-h-11 rounded-xl border border-amber-300/15 px-3 text-xs font-semibold text-amber-100/72 transition hover:bg-amber-300/[0.07]"
            >
              Retry Chase Watch
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-2.5">
        <SectionHeader
          title="Singles radar"
          count={progressiveState === "loading" ? totalSignalCount : visibleSignals.length}
          actions={
            <div className="flex items-center gap-2 text-[10px] font-medium text-white/32">
              {singlesExpanded && progressiveState === "loading" ? (
                <span className="inline-flex items-center gap-1.5" aria-live="polite">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300 motion-safe:animate-pulse" />
                  Loading full radar
                </span>
              ) : singlesExpanded && progressiveState === "error" ? (
                <button
                  type="button"
                  onClick={retryProgressiveLoad}
                  className="min-h-11 rounded-xl border border-amber-300/15 px-3 font-semibold text-amber-100/72 transition hover:bg-amber-300/[0.07]"
                >
                  Load all cards
                </button>
              ) : null}
              {singlesExpanded ? (
                <span className="hidden sm:inline" title="Time of the latest shared radar update">
                  {formatRadarGeneratedAt(generatedAt)}
                </span>
              ) : null}
              <RadarSectionToggle
                expanded={singlesExpanded}
                label="singles radar"
                onToggle={toggleSinglesExpanded}
              />
            </div>
          }
        />

        <div className={singlesExpanded ? "contents" : "hidden"}>
      <section className="binder-panel rounded-[1.25rem] p-2.5 sm:p-3">
        <button
          type="button"
          onClick={() => {
            const nextOrigin = origin === "older-high-rarity" ? "all" : "older-high-rarity";
            setOrigin(nextOrigin);
            if (nextOrigin === "older-high-rarity") loadOlderHighRaritySignals();
            setMarketMode("raw");
            setReleaseYear("all");
            setSortKey("opportunity");
            setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
          }}
          aria-pressed={origin === "older-high-rarity"}
          className={cx(
            "mb-2.5 flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition sm:px-4",
            origin === "older-high-rarity"
              ? "border-amber-300/35 bg-amber-300/[0.11] shadow-[0_12px_36px_rgba(251,191,36,0.08)]"
              : "border-amber-300/14 bg-amber-300/[0.045] hover:border-amber-300/25 hover:bg-amber-300/[0.075]"
          )}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.09] text-amber-200">
            <Gem className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-amber-50 sm:text-sm">
              Old high-rarity value
            </span>
            <span className="mt-0.5 block text-[10px] leading-4 text-white/42 sm:text-[11px]">
              5+ years old, strict chase rarities, EUR 15-600 and a small rarity tier inside the set.
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-amber-300/18 bg-black/20 px-2.5 py-1 text-[10px] font-black tabular-nums text-amber-100/78">
            {olderHighRarityState === "loading" && olderHighRarityTotal == null
              ? "Loading"
              : olderHighRarityState === "error" && olderHighRarityTotal == null
                ? "Retry"
                : olderHighRarityCount}
          </span>
        </button>
        {origin === "older-high-rarity" ? (
          <div className="mb-2.5 rounded-xl border border-amber-300/16 bg-amber-300/[0.035] p-2.5 sm:p-3">
            <div className="grid min-w-0 gap-2.5 lg:grid-cols-[auto_minmax(21rem,1fr)_auto] lg:items-end">
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-100/58">
                  Pricing
                </legend>
                <div
                  role="group"
                  aria-label="Old high-rarity price source"
                  className="grid min-w-0 grid-cols-2 rounded-lg border border-amber-300/14 bg-black/24 p-1"
                >
                  {([
                    ["cardmarket", "CM Europe"],
                    ["tcgplayer", "TCP US"],
                  ] as const).map(([source, label]) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => {
                        setOlderHighRarityPriceSource(source);
                        setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
                      }}
                      aria-pressed={olderHighRarityPriceSource === source}
                      className={cx(
                        "min-h-9 rounded-md px-3 text-[11px] font-black transition",
                        olderHighRarityPriceSource === source
                          ? "bg-amber-300 text-amber-950 shadow-sm"
                          : "text-white/48 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-100/58">
                  Minimum age
                </legend>
                <div
                  role="group"
                  aria-label="Minimum card age"
                  className="grid min-w-0 grid-cols-5 gap-1 rounded-lg border border-amber-300/14 bg-black/24 p-1"
                >
                  {OLDER_HIGH_RARITY_AGE_OPTIONS.map((ageYears) => (
                    <button
                      key={ageYears}
                      type="button"
                      onClick={() => {
                        setMinimumOlderAgeYears(ageYears);
                        setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
                      }}
                      aria-pressed={minimumOlderAgeYears === ageYears}
                      className={cx(
                        "min-h-9 min-w-0 rounded-md px-1 text-[11px] font-black tabular-nums transition sm:px-2",
                        minimumOlderAgeYears === ageYears
                          ? "bg-amber-300 text-amber-950 shadow-sm"
                          : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                      )}
                    >
                      <span>{ageYears}+</span>
                      <span className="hidden xl:inline"> years</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <span className="inline-flex min-h-11 items-center justify-center self-end rounded-lg border border-amber-300/14 bg-black/24 px-3 text-[10px] font-bold tabular-nums text-amber-100/60">
                {visibleSignals.length} matches
              </span>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-white/34 sm:text-[10px]">
              TCGPlayer stays in USD; its converted euro reference is shown on each card. This switch only affects this Radar view.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(14rem,1fr)_auto_auto_repeat(4,minmax(9rem,11rem))] 2xl:items-center">
          <label className="relative block min-w-0 sm:col-span-2 lg:col-span-2 2xl:col-span-1">
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

          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:col-span-2 lg:col-span-1 2xl:col-span-1">
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

          <label
            className="relative flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 pl-3 pr-9 transition hover:border-violet-300/22 hover:bg-white/[0.035] focus-within:border-violet-400/35 focus-within:ring-2 focus-within:ring-violet-500/10"
            title="Applies to Chase Watch, singles and sealed Radar"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-white/32" />
            <span className="sr-only">Filter the entire Signal Radar by Pokémon</span>
            <select
              value={popularPokemonFilter}
              onChange={(event) => {
                setPopularPokemonFilter(event.target.value as PopularPokemonFilter);
                setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
              }}
              className="h-11 min-w-0 flex-1 appearance-none bg-transparent pr-1 text-xs font-semibold text-white/68 outline-none [color-scheme:dark]"
            >
              {POPULAR_POKEMON_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-white/32" />
          </label>

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

          <label className="relative flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 pl-3 pr-9 transition hover:border-violet-300/22 hover:bg-white/[0.035] focus-within:border-violet-400/35 focus-within:ring-2 focus-within:ring-violet-500/10">
            <Newspaper className="h-4 w-4 text-white/32" />
            <span className="sr-only">Filter signal origin</span>
            <select
              value={origin}
              onChange={(event) => {
                const nextOrigin = event.target.value as OriginFilter;
                setOrigin(nextOrigin);
                if (nextOrigin === "older-high-rarity") loadOlderHighRaritySignals();
                setSortKey("opportunity");
                setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
              }}
              className="h-11 min-w-0 flex-1 appearance-none bg-transparent pr-1 text-xs font-semibold text-white/68 outline-none [color-scheme:dark]"
            >
              {ORIGIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-white/32" />
          </label>

          {releaseYears.length > 1 ? (
            <label className="relative flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 pl-3 pr-9 transition hover:border-violet-300/22 hover:bg-white/[0.035] focus-within:border-violet-400/35 focus-within:ring-2 focus-within:ring-violet-500/10">
              <CalendarDays className="h-4 w-4 text-white/32" />
              <span className="sr-only">Filter signals by release year</span>
              <select
                value={activeReleaseYear}
                onChange={(event) => {
                  setReleaseYear(event.target.value);
                  setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
                }}
                className="h-11 min-w-0 flex-1 appearance-none bg-transparent pr-1 text-xs font-semibold text-white/68 outline-none [color-scheme:dark]"
              >
                <option value="all">All years</option>
                {releaseYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-white/32" />
            </label>
          ) : null}

          <label className="relative flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-black/20 pl-3 pr-9 transition hover:border-violet-300/22 hover:bg-white/[0.035] focus-within:border-violet-400/35 focus-within:ring-2 focus-within:ring-violet-500/10">
            <BarChart3 className="h-4 w-4 text-white/32" />
            <span className="sr-only">Sort signals</span>
            <select
              value={activeSortKey}
              onChange={(event) => {
                setSortKey(event.target.value as SignalRadarSortKey);
                setVisibleLimit(INITIAL_VISIBLE_SIGNALS);
              }}
              className="h-11 min-w-0 flex-1 appearance-none bg-transparent pr-1 text-xs font-semibold text-white/68 outline-none [color-scheme:dark]"
            >
              {activeSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-white/32" />
          </label>
        </div>
      </section>

      <section>
        {visibleSignals.length > 0 ? (
          <CardListTileGrid>
            {visibleSignals.slice(0, visibleLimit).map((signal, index) => (
              <CompactSignalCard
                key={signal.cardId}
                signal={signal}
                marketMode={marketMode}
                quickActionData={cardQuickActions[signal.cardId]}
                prioritizeImage={index === 0}
              />
            ))}
          </CardListTileGrid>
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
        </div>
      </section>

      <SealedRadarSection
        data={sealedRadar}
        state={progressiveState}
        onRetry={retryProgressiveLoad}
        expanded={sealedExpanded}
        onToggle={toggleSealedExpanded}
        pokemonFilter={popularPokemonFilter}
      />

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
