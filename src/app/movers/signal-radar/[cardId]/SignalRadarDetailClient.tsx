"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Newspaper,
  PackageSearch,
  Radar,
  ShieldAlert,
  Sparkles,
  Tag,
  UserRound,
} from "lucide-react";
import {
  getSignalExplanations,
  PriceScenarioChart,
} from "@/app/movers/signal-radar/ExternalSignalBrowser";
import CachedImage from "@/components/CachedImage";
import { formatCurrency } from "@/lib/format";
import type { ExternalCardSignal, ExternalMarketMode } from "@/lib/external-signal-radar";
import { buildCardMarketProxyUrl, getSafeDirectCardMarketCardUrl } from "@/lib/cardmarket";
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import { getExpansionHref } from "@/lib/games";

export interface SignalRadarCardBasics {
  id: string;
  card_number: string | null;
  printed_card_number: string | null;
  rarity: string | null;
  hp: number | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  cardmarket_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    series: string | null;
    release_date: string | null;
  };
}

const FORECAST_TARGETS = [
  { key: "1.5x-90d", label: "1.5x", horizon: "90 days", minimum: 50 },
  { key: "2x-90d", label: "2x", horizon: "90 days", minimum: 100 },
  { key: "3x-180d", label: "3x", horizon: "180 days", minimum: 200 },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function signedPercent(value: number | null): string {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function AnalysisSection({
  eyebrow,
  title,
  icon,
  aside,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("overflow-hidden rounded-[1.35rem] border border-white/9 bg-[rgba(16,19,29,0.88)]", className)}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/7 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/12 bg-violet-400/[0.065] text-violet-200/75">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-white/30">{eyebrow}</p>
            <h2 className="mt-0.5 truncate text-sm font-bold text-white/88 sm:text-base">{title}</h2>
          </div>
        </div>
        {aside}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function MetricRow({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(7rem,0.65fr)_minmax(0,1fr)] items-center gap-3 border-b border-white/6 px-3 py-2.5 last:border-b-0">
      <span className="text-[10px] font-medium text-white/38">{label}</span>
      <span className="min-w-0 text-right text-xs font-semibold text-white/78">
        {value}
        {hint ? <span className="mt-0.5 block text-[9px] font-normal text-white/28">{hint}</span> : null}
      </span>
    </div>
  );
}

export default function SignalRadarDetailClient({
  signal,
  cardBasics,
}: {
  signal: ExternalCardSignal;
  cardBasics: SignalRadarCardBasics;
}) {
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const market = signal.marketIntelligence;
  const gradedAvailable = market?.graded.available ?? false;
  const scenario = marketMode === "graded" ? market?.gradedScenario : market?.rawScenario;
  const opportunity =
    marketMode === "graded" ? market?.gradedOpportunityScore : market?.rawOpportunityScore;
  const score = opportunity ?? signal.externalScore;
  const tier = score >= 80 ? "Breakout" : score >= 60 ? "Strong" : "Watch";
  const explanations = getSignalExplanations(signal);
  const catalysts = signal.catalysts ?? [];
  const displayPrice = scenario?.currentPrice ?? signal.currentPrice;
  const displayCurrency = scenario?.currency ?? signal.currency;
  const cardMarketHref =
    getSafeDirectCardMarketCardUrl(cardBasics.cardmarket_url, signal.game) ??
    buildCardMarketProxyUrl(signal.cardId);
  const ebayHref = buildCardEbaySearchUrl({
    name: signal.name,
    cardNumber: cardBasics.printed_card_number ?? cardBasics.card_number,
  });
  const releaseLabel = cardBasics.episode.release_date
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
        new Date(cardBasics.episode.release_date)
      )
    : "Unknown";

  return (
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)] 2xl:gap-6">
      <aside className="2xl:sticky 2xl:top-5">
        <div className="rounded-[1.5rem] border border-white/9 bg-[linear-gradient(155deg,rgba(22,25,37,0.96),rgba(10,12,19,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
          <div className="relative mx-auto aspect-[63/88] w-full max-w-[18rem] overflow-hidden rounded-[1rem] border border-white/12 bg-black/28 shadow-2xl shadow-black/35">
            {signal.imageUrl ? (
              <CachedImage
                sourceUrl={signal.imageUrl}
                alt={signal.name}
                fill
                priority
                sizes="(max-width: 1280px) 288px, 336px"
                className="object-contain"
              />
            ) : null}
          </div>
          <div className="mt-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-violet-100/72">#{signal.rank} Radar</span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">{signal.game === "one-piece" ? "One Piece" : "Pokemon"}</span>
            </div>
            <h1 className="mt-3 text-xl font-black tracking-tight text-white sm:text-2xl">{signal.name}</h1>
            <p className="mt-1 text-xs text-white/42">{signal.episodeName}{signal.cardNumber ? ` · ${signal.cardNumber}` : ""}</p>
            <p className="mt-0.5 text-[10px] text-white/30">{signal.rarity ?? "Rarity unavailable"}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={getExpansionHref(cardBasics.episode.id)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-violet-100/72 transition hover:border-violet-300/28 hover:text-white"
            >
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{cardBasics.episode.name}</span>
            </Link>
            {cardBasics.artist ? (
              <Link
                href={`/illustrators/${encodeURIComponent(cardBasics.artist)}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/9 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold text-white/56 transition hover:border-violet-300/20 hover:text-white"
              >
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{cardBasics.artist}</span>
              </Link>
            ) : null}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/8 bg-black/16">
            <MetricRow label="Card number" value={cardBasics.printed_card_number ?? cardBasics.card_number ?? "--"} />
            <MetricRow label="Rarity" value={cardBasics.rarity ?? "--"} />
            <MetricRow label="Type" value={[cardBasics.supertype, cardBasics.subtypes].filter(Boolean).join(" · ") || "--"} />
            <MetricRow label="HP" value={cardBasics.hp ?? "--"} />
            <MetricRow label="Series" value={cardBasics.episode.series ?? "--"} />
            <MetricRow label="Release" value={releaseLabel} />
          </div>
          <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/30">Current {marketMode} market</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-white">{displayPrice == null ? "--" : formatCurrency(displayPrice, displayCurrency)}</p>
            <p className="mt-1 text-[9px] text-white/30">Model horizon · {signal.horizon}</p>
          </div>
          <div className="mt-3 flex rounded-xl border border-white/8 bg-black/24 p-1">
            {(["raw", "graded"] as const).map((mode) => {
              const disabled = mode === "graded" && !gradedAvailable;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMarketMode(mode)}
                  className={cx(
                    "h-9 flex-1 rounded-lg text-[11px] font-semibold capitalize transition",
                    marketMode === mode
                      ? "bg-violet-500 text-white shadow-sm"
                      : disabled
                        ? "cursor-not-allowed text-white/20"
                        : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  {mode}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={cardMarketHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-sky-300/16 bg-sky-400/[0.07] text-[10px] font-bold text-sky-100/78 transition hover:border-sky-300/30 hover:bg-sky-400/[0.12]"
            >
              CardMarket <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href={ebayHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/16 bg-emerald-400/[0.07] text-[10px] font-bold text-emerald-100/78 transition hover:border-emerald-300/30 hover:bg-emerald-400/[0.12]"
            >
              eBay Deals <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </aside>

      <div className="grid min-w-0 gap-4 [@media(min-width:2200px)]:grid-cols-12 [@media(min-width:2200px)]:items-start">
        <section className="rounded-[1.5rem] border border-white/9 bg-[linear-gradient(135deg,rgba(26,28,43,0.96),rgba(13,16,25,0.96))] p-4 sm:p-5 [@media(min-width:2200px)]:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/55">Signal summary</p>
              <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Why {signal.name} is on the radar</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-white/42">{signal.pressureExplanation}</p>
            </div>
            <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.11em] text-emerald-100/75">{signal.confidence} confidence</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Opportunity", `${score}/100`, "violet"],
              ["Gold mine setup", `${market?.confluence.score ?? "--"}/100`, "fuchsia"],
              ["Signal tier", tier, "emerald"],
              ["Origin", signal.sourceMode === "structural" ? "Scarcity & value" : signal.sourceMode === "event" ? "Set & reveal" : signal.sourceMode === "hybrid" ? "Hybrid" : "Tournament", "sky"],
            ].map(([label, value, tone]) => (
              <div key={label} className={cx("rounded-xl border px-3 py-3", tone === "violet" ? "border-violet-300/14 bg-violet-400/[0.065]" : tone === "fuchsia" ? "border-fuchsia-300/14 bg-fuchsia-400/[0.055]" : tone === "emerald" ? "border-emerald-300/14 bg-emerald-400/[0.055]" : "border-sky-300/14 bg-sky-400/[0.05]")}>
                <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-white/32">{label}</p>
                <p className="mt-1 text-base font-black text-white/88">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <AnalysisSection className="[@media(min-width:2200px)]:col-span-7" eyebrow="Price model" title={`${marketMode === "graded" ? "Graded" : "Raw"} value scenario`} icon={<BarChart3 className="h-4 w-4" />} aside={scenario ? <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[9px] font-semibold text-white/42">{scenario.confidence} confidence</span> : null}>
          {scenario ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
              <div className="min-w-0 rounded-xl border border-violet-300/10 bg-violet-400/[0.035] p-3">
                <PriceScenarioChart scenario={scenario} />
              </div>
              <div className="overflow-hidden rounded-xl border border-white/8 bg-black/16">
                <div className="grid grid-cols-4 border-b border-white/7 px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/28">
                  <span>Horizon</span><span className="text-right">Low</span><span className="text-right">Base</span><span className="text-right">High</span>
                </div>
                {scenario.points.map((point) => (
                  <div key={point.days} className="grid min-h-12 grid-cols-4 items-center border-b border-white/6 px-3 text-[10px] last:border-b-0">
                    <strong className="text-white/65">{point.days} days</strong>
                    <span className="text-right text-rose-100/62">{formatCurrency(point.low, scenario.currency)}</span>
                    <span className="text-right font-bold text-white/82">{formatCurrency(point.base, scenario.currency)}</span>
                    <span className="text-right text-emerald-100/68">{formatCurrency(point.high, scenario.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-white/38">Not enough reliable market history for a price scenario.</p>}
        </AnalysisSection>

        <div className="grid gap-4 2xl:grid-cols-2 [@media(min-width:2200px)]:col-span-8">
          <AnalysisSection eyebrow="Supply & access" title="Sealed and scarcity" icon={<PackageSearch className="h-4 w-4" />}>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-amber-300/10 bg-amber-400/[0.025]">
                <MetricRow label="Sealed pressure" value={`${market?.sealed.pressureLabel ?? "--"} · ${market?.sealed.pressureScore ?? "--"}/100`} />
                <MetricRow label="Cheapest pack" value={market?.sealed.packPrice == null ? "--" : formatCurrency(market.sealed.packPrice, "EUR")} hint={market?.sealed.packName ?? undefined} />
                <MetricRow label="90-day sealed trend" value={signedPercent(market?.sealed.trend90dPct ?? null)} />
                <MetricRow label="Linked products" value={market?.sealed.productCount ?? 0} />
              </div>
              <div className="overflow-hidden rounded-xl border border-sky-300/10 bg-sky-400/[0.025]">
                <MetricRow label="Scarcity" value={`${market?.scarcity.label ?? "--"} · ${market?.scarcity.score ?? "--"}/100`} />
                <MetricRow label="Pull odds" value={market?.scarcity.pullOdds ?? "Unknown"} />
                <MetricRow label="Raw markets" value={market?.scarcity.rawMarketBreadth ?? 0} />
                <MetricRow label="90-day raw trend" value={signedPercent(market?.scarcity.rawTrend90dPct ?? null)} />
              </div>
            </div>
          </AnalysisSection>

          <AnalysisSection eyebrow="Demand quality" title="Collector, artist and grading" icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-fuchsia-300/10 bg-fuchsia-400/[0.025]">
                <MetricRow label="Confluence" value={`${market?.confluence.label ?? "--"} · ${market?.confluence.score ?? "--"}/100`} />
                <MetricRow label="Illustrator" value={market?.scarcity.artist ?? "Unknown"} hint={market?.scarcity.artistDemandScore == null ? undefined : `${market.scarcity.artistDemandScore}/100 demand`} />
                <MetricRow label="Character demand" value={`${market?.scarcity.collectorDemandScore ?? "--"}/100`} />
                <MetricRow label="Active drivers" value={market?.confluence.drivers.length ?? 0} hint={market?.confluence.drivers.join(" · ") || undefined} />
              </div>
              <div className="overflow-hidden rounded-xl border border-emerald-300/10 bg-emerald-400/[0.025]">
                <MetricRow label="Grading supply" value={market?.graded.supplyLabel ?? "Unknown"} />
                <MetricRow label="PSA 10 market" value={market?.graded.psa10Price == null ? "--" : formatCurrency(market.graded.psa10Price, market.graded.currency)} />
                <MetricRow label="PSA 9 market" value={market?.graded.psa9Price == null ? "--" : formatCurrency(market.graded.psa9Price, market.graded.currency)} />
                <MetricRow label="Gem rate" value={market?.graded.gemRatePct == null ? "--" : `${market.graded.gemRatePct.toFixed(1)}%`} hint="Exact card population API pending" />
              </div>
            </div>
          </AnalysisSection>
        </div>

        <AnalysisSection className="[@media(min-width:2200px)]:col-span-4" eyebrow="Historical calibration" title="Growth probability tracker" icon={<BrainCircuit className="h-4 w-4" />} aside={<span className="rounded-full border border-sky-300/12 bg-sky-400/[0.05] px-2.5 py-1 text-[9px] font-semibold text-sky-100/58">{signal.forecast?.modelVersion ?? "Learning"}</span>}>
          <div className="overflow-hidden rounded-xl border border-white/8 bg-black/16">
            <div className="grid grid-cols-[0.55fr_0.65fr_0.7fr_1.4fr] border-b border-white/7 px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/28">
              <span>Target</span><span>Horizon</span><span>Probability</span><span>Model progress</span>
            </div>
            {FORECAST_TARGETS.map((target) => {
              const summary = signal.forecast?.targets[target.key];
              const interval = summary?.status === "calibrated" ? summary.interval : null;
              return (
                <div key={target.key} className="grid min-h-14 grid-cols-[0.55fr_0.65fr_0.7fr_1.4fr] items-center border-b border-white/6 px-3 text-[10px] last:border-b-0">
                  <strong className="text-white/82">{target.label}</strong>
                  <span className="text-white/42">{target.horizon}</span>
                  <span className="font-bold text-sky-100/72">{interval ? `${Math.round(interval.estimate * 100)}%` : "Learning"}</span>
                  <span className="text-white/36">{interval && summary ? `${summary.hits}/${summary.samples} hits · ${Math.round(interval.lower * 100)}–${Math.round(interval.upper * 100)}%` : `${summary?.samples ?? 0}/${target.minimum} completed signals`}</span>
                </div>
              );
            })}
          </div>
        </AnalysisSection>

        <div className="grid gap-4 2xl:grid-cols-2 [@media(min-width:2200px)]:col-span-7">
          <AnalysisSection eyebrow="Investment thesis" title="Why it is on the radar" icon={<Radar className="h-4 w-4" />}>
            <div className="space-y-2">
              {explanations.map((item) => (
                <div key={item.label} className="flex gap-3 rounded-xl border border-white/7 bg-black/16 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/70" />
                  <div><p className="text-xs font-bold text-white/78">{item.label}</p><p className="mt-1 text-[10px] leading-4 text-white/42">{item.text}</p></div>
                </div>
              ))}
            </div>
          </AnalysisSection>

          <AnalysisSection eyebrow="Source evidence" title="External proof" icon={<ArrowUpRight className="h-4 w-4" />} aside={<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/28">{signal.horizon}</span>}>
            <div className="space-y-2">
              {signal.evidence.length ? signal.evidence.map((item) => (
                <Link key={`${item.deckUrl}:${item.deckName}`} href={item.deckUrl} target="_blank" rel="noreferrer" className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-white/7 bg-black/16 px-3 py-3 transition hover:border-violet-300/20">
                  <span className="truncate text-xs font-semibold text-white/72">{item.deckName}</span>
                  <span className="text-[10px] text-white/38">{item.deckSharePercent.toFixed(1)}% meta</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-200/72">{item.inclusionPercent.toFixed(0)}% inclusion <ArrowUpRight className="h-3 w-3" /></span>
                </Link>
              )) : <p className="rounded-xl border border-white/7 bg-black/16 p-3 text-[10px] leading-4 text-white/38">This structural setup uses DustyCards sealed history, CardMarket and eBay sold evidence instead of tournament decks.</p>}
            </div>
          </AnalysisSection>
        </div>

        <AnalysisSection className="[@media(min-width:2200px)]:col-span-5" eyebrow="72-hour external scan" title="News, catalysts and risk" icon={<Newspaper className="h-4 w-4" />} aside={<span className={cx("rounded-full border px-2.5 py-1 text-[9px] font-semibold", (signal.riskScore ?? 0) > 0 ? "border-rose-300/14 bg-rose-400/[0.06] text-rose-100/68" : "border-emerald-300/14 bg-emerald-400/[0.06] text-emerald-100/68")}>{(signal.riskScore ?? 0) > 0 ? "Risk detected" : "No active risk"}</span>}>
          {catalysts.length ? (
            <div className="overflow-hidden rounded-xl border border-white/8 bg-black/16">
              <div className="grid grid-cols-[0.55fr_1.5fr_0.65fr_0.6fr] border-b border-white/7 px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/28"><span>Type</span><span>Catalyst</span><span>Evidence</span><span>Direction</span></div>
              {catalysts.map((catalyst) => (
                <Link key={catalyst.id} href={catalyst.sourceUrl} target="_blank" rel="noreferrer" className="grid min-h-14 grid-cols-[0.55fr_1.5fr_0.65fr_0.6fr] items-center border-b border-white/6 px-3 text-[10px] transition last:border-b-0 hover:bg-white/[0.025]">
                  <span className="capitalize text-white/42">{catalyst.kind}</span><span className="truncate font-semibold text-white/72">{catalyst.headline}</span><span className="text-white/42">{catalyst.evidenceLevel}</span><span className={catalyst.direction === "negative" ? "text-rose-200/72" : catalyst.direction === "positive" ? "text-emerald-200/72" : "text-white/42"}>{catalyst.direction}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-white/7 bg-black/16 p-4"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/65" /><p className="text-[10px] leading-4 text-white/42">No fresh trusted news catalyst is linked to this card. The ranking currently comes from {signal.sourceMode === "structural" ? "structural scarcity and market context" : "competitive demand"}.</p></div>
          )}
        </AnalysisSection>
      </div>
    </div>
  );
}
