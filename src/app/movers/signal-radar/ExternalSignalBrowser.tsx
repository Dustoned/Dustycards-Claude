"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  LoaderCircle,
  Newspaper,
  PackageSearch,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import EmptyState from "@/components/EmptyState";
import { SectionHeader } from "@/components/PageHeader";
import type { ModalCardData } from "@/components/card-modal/types";
import { textMatchesSearchQuery } from "@/lib/card-search";
import { formatCurrency } from "@/lib/format";
import type {
  ExternalCardSignal,
  ExternalMarketMode,
  ExternalPriceScenario,
  ExternalSignalConfidence,
  ExternalSignalSourceStatus,
} from "@/lib/external-signal-radar";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

type ConfidenceFilter = "all" | Lowercase<ExternalSignalConfidence>;
type OriginFilter = "all" | "event" | "competitive" | "hybrid" | "structural";
type SortKey = "opportunity" | "signal" | "sealed" | "scarcity" | "meta" | "reach";

interface Props {
  signals: ExternalCardSignal[];
  sources: ExternalSignalSourceStatus[];
  generatedAt: string;
}

const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceFilter; label: string }> = [
  { value: "all", label: "All signals" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "emerging", label: "Emerging" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "opportunity", label: "Opportunity" },
  { value: "signal", label: "Signal strength" },
  { value: "sealed", label: "Sealed pressure" },
  { value: "scarcity", label: "Scarcity" },
  { value: "meta", label: "Meta share" },
  { value: "reach", label: "Archetype reach" },
];

const ORIGIN_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
  { value: "all", label: "All origins" },
  { value: "event", label: "Set & reveal" },
  { value: "competitive", label: "Tournament" },
  { value: "hybrid", label: "Hybrid" },
  { value: "structural", label: "Scarcity & value" },
];

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

function getSignalExplanations(signal: ExternalCardSignal) {
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
  if (signal.sourceMode === "event") {
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

function PriceScenarioChart({ scenario }: { scenario: ExternalPriceScenario }) {
  const values = [
    scenario.currentPrice,
    ...scenario.points.flatMap((point) => [point.low, point.base, point.high]),
  ];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(1, maximum - minimum);
  const x = [4, 35, 66, 96];
  const y = (value: number) => 48 - ((value - minimum) / spread) * 40;
  const baseValues = [scenario.currentPrice, ...scenario.points.map((point) => point.base)];
  const highValues = [scenario.currentPrice, ...scenario.points.map((point) => point.high)];
  const lowValues = [scenario.currentPrice, ...scenario.points.map((point) => point.low)];
  const band = [
    ...highValues.map((value, index) => `${x[index]},${y(value)}`),
    ...lowValues.map((value, index) => `${x[lowValues.length - 1 - index]},${y(lowValues[lowValues.length - 1 - index])}`),
  ].join(" ");
  const line = baseValues.map((value, index) => `${x[index]},${y(value)}`).join(" ");
  return (
    <svg viewBox="0 0 100 54" className="h-20 w-full overflow-visible" role="img" aria-label="Predicted low, base and high price path">
      <defs>
        <linearGradient id={`scenario-${scenario.marketMode}`} x1="0" x2="1">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.22" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {[12, 28, 44].map((gridY) => (
        <line key={gridY} x1="2" x2="98" y1={gridY} y2={gridY} stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
      ))}
      <polygon points={band} fill={`url(#scenario-${scenario.marketMode})`} />
      <polyline points={line} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round" />
      {baseValues.map((value, index) => (
        <circle key={x[index]} cx={x[index]} cy={y(value)} r="1.5" fill={index === 0 ? "#f8fafc" : "#7dd3fc"} />
      ))}
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
          <p className="text-[8px] text-white/28">Artist {market.scarcity.artistDemandScore ?? "--"}/100</p>
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
          72h scan
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

function SignalCard({
  signal,
  marketMode,
  loading,
  onOpen,
}: {
  signal: ExternalCardSignal;
  marketMode: ExternalMarketMode;
  loading: boolean;
  onOpen: (cardId: string) => void;
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
    <article className="group relative min-w-0 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(145deg,rgba(21,24,35,0.98),rgba(12,14,22,0.98))] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition duration-200 hover:border-violet-300/22 sm:p-4">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/55 to-transparent opacity-65" />
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onOpen(signal.cardId)}
          disabled={loading}
          className="relative aspect-[63/88] w-[5.8rem] shrink-0 self-start overflow-hidden rounded-[0.7rem] border border-white/10 bg-black/25 text-left shadow-lg shadow-black/25 transition hover:border-violet-300/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:w-[7rem] 2xl:w-[7.5rem]"
          aria-label={`Open ${signal.name} card details`}
        >
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
          {loading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/65">
              <LoaderCircle className="h-5 w-5 animate-spin text-violet-200" />
            </span>
          ) : null}
          <span className="absolute left-1.5 top-1.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/75 px-1.5 text-[10px] font-black tabular-nums text-white shadow-sm">
            #{signal.rank}
          </span>
        </button>

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
              <button
                type="button"
                onClick={() => onOpen(signal.cardId)}
                disabled={loading}
                className="mt-2 block max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <h3 className="truncate text-base font-bold tracking-tight text-white transition group-hover:text-violet-100 sm:text-lg">
                  {signal.name}
                </h3>
              </button>
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

export default function ExternalSignalBrowser({ signals, sources, generatedAt }: Props) {
  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const activeCardRequestRef = useRef(0);
  const deferredSearch = useDeferredValue(search);

  const visibleSignals = useMemo(() => {
    const query = deferredSearch.trim();
    return signals
      .filter((signal) => {
        if (confidence !== "all" && signal.confidence.toLowerCase() !== confidence) return false;
        if (origin !== "all" && signal.sourceMode !== origin) return false;
        if (marketMode === "graded" && !signal.marketIntelligence?.graded.available) return false;
        if (!query) return true;
        return textMatchesSearchQuery(
          `${signal.name} ${signal.episodeName} ${signal.episodeCode ?? ""} ${signal.cardNumber ?? ""} ${signal.rarity ?? ""}`,
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
  }, [confidence, deferredSearch, marketMode, origin, signals, sortKey]);

  const openCard = useCallback(
    async (cardId: string) => {
      const requestId = activeCardRequestRef.current + 1;
      activeCardRequestRef.current = requestId;
      const cached = detailCache[cardId];
      if (cached) {
        setLoadingCardId(null);
        setSelectedCard(cached);
        setDetailError(null);
        return;
      }

      setLoadingCardId(cardId);
      setDetailError(null);
      try {
        const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Could not load card details");
        const data = (await response.json()) as ModalCardData;
        if (activeCardRequestRef.current !== requestId) return;
        setDetailCache((current) => ({ ...current, [cardId]: data }));
        setSelectedCard(data);
      } catch (error) {
        if (activeCardRequestRef.current !== requestId) return;
        setDetailError(error instanceof Error ? error.message : "Could not load card details");
      } finally {
        if (activeCardRequestRef.current === requestId) {
          setLoadingCardId((current) => (current === cardId ? null : current));
        }
      }
    },
    [detailCache]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="binder-panel rounded-[1.5rem] p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto] lg:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">Search signal cards</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search card, set or rarity..."
              className="h-10 w-full rounded-xl border border-white/9 bg-black/24 pl-10 pr-9 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-violet-400/35 focus:ring-2 focus:ring-violet-500/12"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/35 transition hover:bg-white/8 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-1">
            {CONFIDENCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setConfidence(option.value)}
                className={cx(
                  "h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold transition",
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
                  setVisibleLimit(24);
                }}
                className={cx(
                  "h-8 rounded-lg px-3 text-[11px] font-semibold capitalize transition",
                  marketMode === mode
                    ? "bg-violet-500 text-white shadow-sm"
                    : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3">
            <Newspaper className="h-4 w-4 text-white/32" />
            <span className="sr-only">Filter signal origin</span>
            <select
              value={origin}
              onChange={(event) => setOrigin(event.target.value as OriginFilter)}
              className="h-10 min-w-0 bg-transparent pr-2 text-[11px] font-semibold text-white/62 outline-none [color-scheme:dark]"
            >
              {ORIGIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3">
            <BarChart3 className="h-4 w-4 text-white/32" />
            <span className="sr-only">Sort signals</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-10 min-w-0 bg-transparent pr-2 text-[11px] font-semibold text-white/62 outline-none [color-scheme:dark]"
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

      <section className="rounded-[1.35rem] border border-violet-300/10 bg-violet-400/[0.035] p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(10rem,0.65fr)_repeat(3,minmax(0,1fr))] lg:items-start">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-violet-200/58">
              How to read this
            </p>
            <p className="mt-1 text-xs leading-5 text-white/52">
              Tournament, set-event and structural scarcity are separate entry paths. Raw and graded opportunity scores then add sealed, pull, supply and grading context.
            </p>
          </div>
          <div className="border-white/8 lg:border-l lg:pl-3">
            <p className="text-[11px] font-semibold text-white/78">Event connection</p>
            <p className="mt-1 text-[10px] leading-4 text-white/42">
              Exact card names rank strongest. Character or Pokémon matches spread the signal to older variants; set-only matches are deliberately weaker.
            </p>
          </div>
          <div className="border-white/8 lg:border-l lg:pl-3">
            <p className="text-[11px] font-semibold text-white/78">Scarcity setup</p>
            <p className="mt-1 text-[10px] leading-4 text-white/42">
              Set age, pack cost, pull difficulty, market breadth, gem-rate and artist track record identify hard-to-replace cards without needing current hype.
            </p>
          </div>
          <div className="border-white/8 lg:border-l lg:pl-3">
            <p className="text-[11px] font-semibold text-white/78">Price scenario</p>
            <p className="mt-1 text-[10px] leading-4 text-white/42">
              The 30, 90 and 180-day graph is a low/base/high model range. It responds to evidence and supply but remains a scenario, never a promised price.
            </p>
          </div>
        </div>
      </section>

      {detailError ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/18 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-100/80">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {detailError}
        </div>
      ) : null}

      <section>
        <SectionHeader
          eyebrow="External demand"
          title="Signal candidates"
          count={visibleSignals.length}
          description="Candidates from tournament demand, set and product events, plus structural scarcity. Use Raw or Graded to compare their separate opportunity paths."
          actions={
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/32">
              Updated {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Amsterdam",
              }).format(new Date(generatedAt))}
            </span>
          }
        />

        {visibleSignals.length > 0 ? (
          <div
            className="grid min-w-0 gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
            }}
          >
            {visibleSignals.slice(0, visibleLimit).map((signal) => (
              <SignalCard
                key={signal.cardId}
                signal={signal}
                marketMode={marketMode}
                loading={loadingCardId === signal.cardId}
                onOpen={(cardId) => void openCard(cardId)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Radar}
            title="No signals match these filters"
            description="Clear the search or choose another confidence level. If a source is temporarily unavailable, the last successful shared result remains cached."
            actionHref={null}
          />
        )}
        {visibleSignals.length > visibleLimit ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleLimit((current) => current + 24)}
              className="rounded-xl border border-violet-300/16 bg-violet-400/[0.07] px-5 py-2.5 text-xs font-semibold text-violet-100/78 transition hover:border-violet-300/28 hover:bg-violet-400/[0.12]"
            >
              Show 24 more · {visibleSignals.length - visibleLimit} remaining
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300/72" />
          <div>
            <p className="text-sm font-semibold text-white/78">Signal, not a promise</p>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-white/42">
              Scenario lines are modelled ranges, not guarantees or listing valuations. The separate 1.5x, 2x and 3x probabilities remain hidden until enough completed historical signals exist. Bans, rotation, supply and reprints can reverse any setup.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((source) => (
            <Link
              key={source.game}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition hover:bg-white/[0.07]",
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

      {selectedCard ? (
        <CardModal
          key={`${selectedCard.id}:${selectedCard.price_fetched_at ?? "none"}`}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      ) : null}
    </div>
  );
}
