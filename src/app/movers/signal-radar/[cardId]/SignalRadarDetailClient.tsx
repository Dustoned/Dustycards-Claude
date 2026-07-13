"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  Newspaper,
  PackageSearch,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import {
  getSignalExplanations,
  PriceScenarioChart,
} from "@/app/movers/signal-radar/ExternalSignalBrowser";
import CachedImage from "@/components/CachedImage";
import EbayCardDemandPanel from "@/components/ebay/EbayCardDemandPanel";
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
  prices: Array<{
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
    cm_jp_lowest_nm: number | null;
  }>;
  episode: {
    id: string;
    name: string;
    code: string | null;
    series: string | null;
    release_date: string | null;
  };
}

interface CardResearchResult {
  url: string;
  title: string;
  description: string | null;
  domain: string;
  sourceTier: "trusted" | "discovery";
  category: string;
  reason: string | null;
  direction: "positive" | "negative" | "neutral" | null;
}

interface CardResearchSnapshot {
  cardId: string;
  generatedAt: string;
  cached: boolean;
  provider: string;
  creditsUsed: number;
  queriesRun: number;
  results: CardResearchResult[];
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
    <section className={cx("overflow-hidden rounded-2xl border border-white/9 bg-[rgba(16,19,29,0.88)]", className)}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/7 px-4 py-3 sm:px-5 [@media(min-width:2200px)]:min-h-12 [@media(min-width:2200px)]:py-2.5">
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
      <div className="p-4 sm:p-5 [@media(min-width:2200px)]:p-3.5">{children}</div>
    </section>
  );
}

function MetricRow({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-3 border-b border-white/6 px-3 py-2.5 last:border-b-0 [@media(min-width:2200px)]:min-h-10 [@media(min-width:2200px)]:py-2">
      <span className="min-w-0 break-words text-[10px] font-medium leading-tight text-white/38">{label}</span>
      <span className="min-w-0 break-words text-right text-xs font-semibold leading-tight text-white/78">
        {value}
        {hint ? <span className="mt-0.5 block text-[9px] font-normal text-white/28">{hint}</span> : null}
      </span>
    </div>
  );
}

export default function SignalRadarDetailClient({
  signal,
  cardBasics,
  initialResearch = null,
}: {
  signal: ExternalCardSignal;
  cardBasics: SignalRadarCardBasics;
  initialResearch?: CardResearchSnapshot | null;
}) {
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const [mobileTab, setMobileTab] = useState<"info" | "forecast" | "demand" | "evidence">("info");
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchStatus, setResearchStatus] = useState<"idle" | "loading" | "success" | "error">(
    initialResearch ? "success" : "idle"
  );
  const [research, setResearch] = useState<CardResearchSnapshot | null>(initialResearch);
  const [researchError, setResearchError] = useState<string | null>(null);
  const market = signal.marketIntelligence;
  const gradedAvailable = market?.graded.available ?? false;
  const scenario = marketMode === "graded" ? market?.gradedScenario : market?.rawScenario;
  const opportunity =
    marketMode === "graded" ? market?.gradedOpportunityScore : market?.rawOpportunityScore;
  const score = opportunity ?? signal.externalScore;
  const tier = score >= 80 ? "Breakout" : score >= 60 ? "Strong" : "Watch";
  const explanations = getSignalExplanations(signal);
  const catalysts = signal.catalysts ?? [];
  const researchResults = research?.results ?? [];
  const latestRawPrice = cardBasics.prices[0];
  const rawMarketPrice = latestRawPrice
    ? latestRawPrice.cm_en_lowest_nm
    : null;
  const displayPrice =
    marketMode === "graded"
      ? scenario?.currentPrice ?? market?.graded.currentPrice ?? null
      : rawMarketPrice ?? signal.currentPrice;
  const displayCurrency =
    marketMode === "graded" ? scenario?.currency ?? market?.graded.currency ?? "EUR" : signal.currency;
  const scenarioUsesAverageBaseline =
    marketMode === "raw" &&
    rawMarketPrice != null &&
    scenario?.currentPrice != null &&
    Math.abs(rawMarketPrice - scenario.currentPrice) >= 0.01;
  const scenarioUsesReleaseStabilization =
    scenario?.drivers.includes("post-release stabilization") ?? false;
  const scenarioUsesLaunchWindow =
    scenario?.drivers.includes("launch price discovery") ?? false;
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

  useEffect(() => {
    if (!researchOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setResearchOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [researchOpen]);

  async function runCardResearch() {
    setResearchOpen(true);
    setResearchStatus("loading");
    setResearchError(null);

    try {
      const response = await fetch(
        `/api/movers/signal-radar/${encodeURIComponent(signal.cardId)}/research`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; research: CardResearchSnapshot }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Card research could not be completed.");
      }

      setResearch(payload.research);
      setResearchStatus("success");
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Card research could not be completed.");
      setResearchStatus("error");
    }
  }

  const researchGeneratedLabel = research?.generatedAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(research.generatedAt)
      )
    : null;

  const researchButton = (
    <button
      type="button"
      onClick={() => void runCardResearch()}
      disabled={researchStatus === "loading"}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-[linear-gradient(135deg,rgba(124,92,255,0.20),rgba(56,189,248,0.08))] px-3 text-[12px] font-bold text-violet-50/90 shadow-[0_12px_32px_rgba(83,54,180,0.12)] transition hover:border-violet-200/34 hover:bg-violet-400/[0.16] disabled:cursor-wait disabled:opacity-65 lg:min-h-10 lg:rounded-xl lg:text-[10px]"
    >
      {researchStatus === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Search className="h-4 w-4" />
      )}
      {researchStatus === "loading" ? "Researching this card..." : "Research this card"}
    </button>
  );

  return (
    <>
      <div className="relative overflow-hidden rounded-[1.65rem] border border-white/10 bg-[#090a0f] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)] lg:hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_18%,rgba(124,92,255,0.24),transparent_36%),radial-gradient(circle_at_22%_16%,rgba(56,189,248,0.10),transparent_32%)]" />

        <div className="relative flex flex-col items-center">
          <div className="relative aspect-[63/88] w-[min(58vw,15rem)] overflow-hidden rounded-[1rem] border border-white/12 bg-black/28 shadow-[0_26px_70px_rgba(0,0,0,0.52)]">
            {signal.imageUrl ? (
              <CachedImage
                sourceUrl={signal.imageUrl}
                alt={signal.name}
                fill
                priority
                sizes="58vw"
                className="object-contain"
              />
            ) : null}
          </div>
          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <a href={cardMarketHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.055] text-[12px] font-bold text-white/78 transition hover:border-violet-300/28 hover:bg-violet-400/[0.10]">
              CardMarket <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a href={ebayHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.055] text-[12px] font-bold text-white/78 transition hover:border-violet-300/28 hover:bg-violet-400/[0.10]">
              eBay Deals <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <div className="col-span-2">{researchButton}</div>
          </div>
        </div>

        <div className="relative mt-5">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-violet-300/18 bg-violet-500/12 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.11em] text-violet-100/78">{signal.manualResearch || signal.rank <= 0 ? "Research profile" : `#${signal.rank} radar`}</span>
            <span className="rounded-full border border-emerald-300/16 bg-emerald-400/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-100/70">{signal.confidence}</span>
            <span className="rounded-full border border-white/9 bg-white/[0.035] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/48">{tier}</span>
          </div>
          <h1 className="mt-3 text-[1.85rem] font-black leading-[1.02] tracking-tight text-white">{signal.name}</h1>
          <p className="mt-1.5 text-[13px] font-medium text-white/48">{signal.episodeName}{signal.cardNumber ? ` · ${signal.cardNumber}` : ""}{signal.rarity ? ` · ${signal.rarity}` : ""}</p>

          <div className="mt-4 grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-2.5">
            <div className="rounded-[1.15rem] border border-violet-300/14 bg-violet-400/[0.07] p-3.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-violet-100/45">Current {marketMode}</p>
              <p className="mt-1.5 text-[1.55rem] font-black tabular-nums text-white">{displayPrice == null ? "--" : formatCurrency(displayPrice, displayCurrency)}</p>
              <p className="mt-1 text-[9px] text-white/32">{signal.horizon}</p>
            </div>
            <div className="rounded-[1.15rem] border border-white/9 bg-black/22 p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-white/7 pb-2">
                <span className="text-[10px] text-white/38">Opportunity</span><strong className="text-sm text-white/88">{score}/100</strong>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[10px] text-white/38">Setup</span><strong className="text-sm text-fuchsia-100/82">{market?.confluence.score ?? "--"}/100</strong>
              </div>
            </div>
          </div>

          <div className="mt-3 flex rounded-2xl border border-white/8 bg-black/24 p-1">
            {(["raw", "graded"] as const).map((mode) => {
              const disabled = mode === "graded" && !gradedAvailable;
              return <button key={mode} type="button" disabled={disabled} onClick={() => setMarketMode(mode)} className={cx("min-h-10 flex-1 rounded-xl text-[12px] font-bold capitalize transition", marketMode === mode ? "bg-violet-600 text-white" : disabled ? "cursor-not-allowed text-white/18" : "text-white/45 hover:bg-white/[0.055]")}>{mode}</button>;
            })}
          </div>

          <nav className="mt-4 grid grid-cols-4 gap-1 rounded-2xl border border-white/8 bg-black/25 p-1">
            {([
              ["info", "Info"],
              ["forecast", "Forecast"],
              ["demand", "Demand"],
              ["evidence", "Evidence"],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setMobileTab(key)} className={cx("min-h-10 rounded-xl px-2 text-[12px] font-bold transition", mobileTab === key ? "bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,92,255,0.22)]" : "text-white/44 hover:bg-white/[0.055]")}>{label}</button>
            ))}
          </nav>

          {mobileTab === "info" ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-[1.35rem] border border-white/9 bg-black/18 p-2">
                {[
                  ["Expansion", cardBasics.episode.name],
                  ["Illustrator", cardBasics.artist ?? "Unknown"],
                  ["Card number", cardBasics.printed_card_number ?? cardBasics.card_number ?? "--"],
                  ["Release", releaseLabel],
                  ["Type", [cardBasics.supertype, cardBasics.subtypes].filter(Boolean).join(" · ") || "--"],
                  ["HP", cardBasics.hp ?? "--"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-white/7 bg-white/[0.025] p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/28">{label}</p>
                    <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-4 text-white/76">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={getExpansionHref(cardBasics.episode.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-3 text-[10px] font-semibold text-violet-100/72"><Tag className="h-3.5 w-3.5" />{cardBasics.episode.name}</Link>
                {cardBasics.artist ? <Link href={`/illustrators/${encodeURIComponent(cardBasics.artist)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/9 bg-white/[0.035] px-3 text-[10px] font-semibold text-white/56"><UserRound className="h-3.5 w-3.5" />{cardBasics.artist}</Link> : null}
              </div>
              <div className="space-y-2">
                {explanations.slice(0, 3).map((item) => <div key={item.label} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/72" /><div><p className="text-[12px] font-bold text-white/78">{item.label}</p><p className="mt-1 text-[10px] leading-4 text-white/40">{item.text}</p></div></div>)}
              </div>
            </div>
          ) : null}

          {mobileTab === "forecast" ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-[1.35rem] border border-white/9 bg-black/18 p-3">
                <div className="mb-2 flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/48">Price model</p><h2 className="mt-1 text-sm font-bold text-white/84">{marketMode === "graded" ? "Graded" : "Raw"} scenario{scenarioUsesAverageBaseline ? " · 7d average baseline" : ""}</h2></div>{scenario ? <span className="rounded-full border border-white/8 px-2 py-1 text-[9px] text-white/40">{scenario.confidence}</span> : null}</div>
                {scenario ? <><PriceScenarioChart scenario={scenario} detailed /><div className="mt-2 grid grid-cols-3 gap-2">{scenario.points.map((point) => <div key={point.days} className="rounded-xl border border-white/7 bg-white/[0.025] p-2.5 text-center"><p className="text-[9px] text-white/32">{point.days} days</p><p className="mt-1 text-[12px] font-black text-white/80">{formatCurrency(point.base, scenario.currency)}</p><p className="mt-1 text-[8px] text-white/28">{formatCurrency(point.low, scenario.currency)}–{formatCurrency(point.high, scenario.currency)}</p></div>)}</div>{scenarioUsesLaunchWindow ? <p className="mt-2 rounded-xl border border-fuchsia-300/10 bg-fuchsia-400/[0.04] px-3 py-2 text-[9px] leading-4 text-fuchsia-100/60">Launch price discovery is active: upside potential is higher during the first 6–8 weeks, but the forecast range is deliberately much wider.</p> : scenarioUsesReleaseStabilization ? <p className="mt-2 rounded-xl border border-sky-300/10 bg-sky-400/[0.04] px-3 py-2 text-[9px] leading-4 text-sky-100/58">New-set stabilization is active: positive short-term growth is deliberately tempered during the first year after release.</p> : null}</> : <p className="py-5 text-center text-xs text-white/38">Not enough reliable history.</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Sealed pressure", `${market?.sealed.pressureScore ?? "--"}/100`],
                  ["Cheapest pack", market?.sealed.packPrice == null ? "--" : formatCurrency(market.sealed.packPrice, "EUR")],
                  ["Scarcity", `${market?.scarcity.score ?? "--"}/100`],
                  ["Set rarity", market?.scarcity.setRarityLabel ?? "Unknown"],
                  ["Pull odds", market?.scarcity.pullOdds ?? "Unknown"],
                  ["Character demand", `${market?.scarcity.collectorDemandScore ?? "--"}/100`],
                  ["Gem rate", market?.graded.gemRatePct == null ? "--" : `${market.graded.gemRatePct.toFixed(1)}%`],
                ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.025] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/28">{label}</p><p className="mt-1.5 text-sm font-bold text-white/76">{value}</p></div>)}
              </div>
            </div>
          ) : null}

          {mobileTab === "demand" ? (
            <div className="mt-3">
              <EbayCardDemandPanel cardId={signal.cardId} compact />
            </div>
          ) : null}

          {mobileTab === "evidence" ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-[1.35rem] border border-white/9 bg-black/18 p-3">
                <div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/48">Source evidence</p><h2 className="mt-1 text-sm font-bold text-white/84">External proof</h2></div><span className="text-[9px] text-white/30">{signal.horizon}</span></div>
                <div className="mt-3 space-y-2">{signal.evidence.length ? signal.evidence.map((item) => <Link key={`${item.deckUrl}:${item.deckName}`} href={item.deckUrl} target="_blank" rel="noreferrer" className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-white/7 bg-white/[0.025] p-3"><span className="truncate text-[11px] font-semibold text-white/72">{item.deckName}</span><span className="text-[10px] font-bold text-violet-200/72">{item.inclusionPercent.toFixed(0)}%</span><span className="text-[9px] text-white/34">{item.deckSharePercent.toFixed(1)}% meta</span><span className="text-[9px] text-white/34">inclusion</span></Link>) : <p className="text-[10px] leading-4 text-white/38">This setup uses sealed, CardMarket and eBay evidence instead of tournament decks.</p>}</div>
              </div>
              <div className="rounded-[1.35rem] border border-white/9 bg-black/18 p-3">
                <div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/48">Daily scan</p><h2 className="mt-1 text-sm font-bold text-white/84">News, catalysts and risk</h2></div><span className={cx("rounded-full border px-2 py-1 text-[9px]", (signal.riskScore ?? 0) > 0 ? "border-rose-300/14 text-rose-100/68" : "border-emerald-300/14 text-emerald-100/68")}>{(signal.riskScore ?? 0) > 0 ? "Risk" : "Clear"}</span></div>
                <div className="mt-3 space-y-2">{catalysts.length ? catalysts.map((catalyst) => <Link key={catalyst.id} href={catalyst.sourceUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/7 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase text-white/34">{catalyst.kind}</span><span className={catalyst.direction === "negative" ? "text-[9px] text-rose-200/72" : "text-[9px] text-emerald-200/72"}>{catalyst.direction}</span></div><p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-white/72">{catalyst.headline}</p></Link>) : researchResults.length ? researchResults.slice(0, 4).map((result) => <Link key={result.url} href={result.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/7 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase text-white/34">{result.category}</span><span className="text-[9px] text-violet-200/64">{result.domain}</span></div><p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-white/72">{result.title}</p></Link>) : <div className="flex gap-3 rounded-xl border border-white/7 bg-white/[0.025] p-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/65" /><p className="text-[10px] leading-4 text-white/40">No fresh trusted catalyst is linked to this card yet.</p></div>}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

    <div className="hidden items-start gap-5 lg:grid lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] 2xl:grid-cols-[clamp(20rem,22vw,28rem)_minmax(0,1fr)] 2xl:gap-5">
      <aside className="2xl:sticky 2xl:top-5">
        <div className="p-1 [&>div:nth-child(n+3)]:hidden">
          <div className="relative mx-auto aspect-[63/88] w-full max-w-[28rem] overflow-hidden rounded-[1.15rem] border border-white/12 bg-black/28 shadow-[0_28px_80px_rgba(0,0,0,0.46)]">
            {signal.imageUrl ? (
              <CachedImage
                sourceUrl={signal.imageUrl}
                alt={signal.name}
                fill
                priority
                sizes="(max-width: 1535px) 336px, min(26vw, 512px)"
                className="object-contain"
              />
            ) : null}
          </div>
          <section className="mt-3 rounded-2xl border border-white/9 bg-[rgba(16,19,29,0.88)] p-3">
            <h2 className="text-sm font-bold text-white/88">Card Links</h2>
            <p className="mt-1 text-[10px] font-medium text-white/36">Compare this card on external markets.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={cardMarketHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-[10px] font-bold text-white/72 transition hover:border-violet-300/28 hover:bg-violet-400/[0.09] hover:text-white"
            >
              CardMarket <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href={ebayHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-[10px] font-bold text-white/72 transition hover:border-violet-300/28 hover:bg-violet-400/[0.09] hover:text-white"
            >
              eBay Deals <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            </div>
            <div className="mt-2">{researchButton}</div>
          </section>
          <div className="mt-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-violet-100/72">{signal.manualResearch || signal.rank <= 0 ? "Research profile" : `#${signal.rank} Radar`}</span>
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
        </div>
      </aside>

      <div className="signal-radar-detail-grid grid min-w-0 gap-4 [@media(min-width:1900px)]:grid-cols-12 [@media(min-width:1900px)]:items-stretch">
        <section className="flex h-full min-w-0 flex-col rounded-2xl border border-white/9 bg-[rgba(16,19,29,0.88)] p-4 [@media(min-width:1900px)]:col-span-5 [@media(min-width:1900px)]:col-start-1 [@media(min-width:1900px)]:row-start-1 [@media(min-width:2200px)]:col-span-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-violet-100/72">{signal.manualResearch || signal.rank <= 0 ? "Research profile" : `#${signal.rank} Radar`}</span>
            <span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">{signal.game === "one-piece" ? "One Piece" : "Pokemon"}</span>
            {signal.rarity ? <span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[9px] font-semibold text-white/45">{signal.rarity}</span> : null}
          </div>
          <h1 className="mt-3 text-[1.7rem] font-black tracking-tight text-white">{signal.name}</h1>
          <p className="mt-1 text-xs text-white/42">{signal.episodeName}{signal.cardNumber ? ` · ${signal.cardNumber}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={getExpansionHref(cardBasics.episode.id)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-violet-100/72 transition hover:border-violet-300/28 hover:text-white"><Tag className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{cardBasics.episode.name}</span></Link>
            {cardBasics.artist ? <Link href={`/illustrators/${encodeURIComponent(cardBasics.artist)}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/9 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold text-white/56 transition hover:border-violet-300/20 hover:text-white"><UserRound className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{cardBasics.artist}</span></Link> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 rounded-xl border border-white/8 bg-black/16 px-3">
            <MetricRow label="Card number" value={cardBasics.printed_card_number ?? cardBasics.card_number ?? "--"} />
            <MetricRow label="Rarity" value={cardBasics.rarity ?? "--"} />
            <MetricRow label="Type" value={[cardBasics.supertype, cardBasics.subtypes].filter(Boolean).join(" · ") || "--"} />
            <MetricRow label="Release" value={releaseLabel} />
          </div>
          <div className="mt-auto pt-3">
            <div className="flex items-end justify-between gap-4 rounded-xl border border-violet-300/12 bg-violet-400/[0.055] p-3">
              <div className="min-w-0">
              <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/30">Current {marketMode} market</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-white">{displayPrice == null ? "--" : formatCurrency(displayPrice, displayCurrency)}</p>
              </div>
              <div className="grid h-9 w-[11.5rem] shrink-0 grid-cols-2 rounded-lg border border-white/8 bg-black/30 p-1">
                {(["raw", "graded"] as const).map((mode) => {
                  const disabled = mode === "graded" && !gradedAvailable;
                  return <button key={mode} type="button" disabled={disabled} onClick={() => setMarketMode(mode)} className={cx("rounded-md px-3 text-[10px] font-semibold capitalize transition", marketMode === mode ? "bg-violet-500 text-white shadow-sm" : disabled ? "cursor-not-allowed text-white/20" : "text-white/48 hover:bg-white/[0.06] hover:text-white")}>{mode}</button>;
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-white/9 bg-[linear-gradient(135deg,rgba(26,28,43,0.96),rgba(13,16,25,0.96))] p-4 sm:p-5 [@media(min-width:1900px)]:col-span-5 [@media(min-width:1900px)]:col-start-1 [@media(min-width:1900px)]:row-start-2 [@media(min-width:2200px)]:col-span-4 [@media(min-width:2200px)]:p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/55">Signal summary</p>
              <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Why {signal.name} is on the radar</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-white/42">{signal.pressureExplanation}</p>
            </div>
            <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.11em] text-emerald-100/75">{signal.confidence} confidence</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 [@media(min-width:2200px)]:grid-cols-4">
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
          <div className="mt-3 hidden grid-cols-3 gap-2 [@media(min-width:2200px)]:grid">
            {explanations.slice(0, 3).map((item) => (
              <div key={item.label} className="min-w-0 rounded-xl border border-white/7 bg-black/14 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300/70" />
                  <p className="truncate text-[10px] font-bold text-white/72">{item.label}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-3.5 text-white/34">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <AnalysisSection className="2xl:col-span-7 2xl:col-start-6 2xl:row-start-1 [@media(min-width:2200px)]:col-span-8 [@media(min-width:2200px)]:col-start-5" eyebrow="Price model" title={`${marketMode === "graded" ? "Graded" : "Raw"} value scenario${scenarioUsesAverageBaseline ? " · 7d avg baseline" : ""}`} icon={<BarChart3 className="h-4 w-4" />} aside={scenario ? <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[9px] font-semibold text-white/42">{scenario.confidence} confidence</span> : null}>
          {scenario ? (
            <div className="grid gap-5 [@media(min-width:2200px)]:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
              <div className="min-w-0 rounded-xl border border-violet-300/10 bg-violet-400/[0.035] p-3">
                <PriceScenarioChart scenario={scenario} detailed />
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
              {scenarioUsesLaunchWindow ? <p className="xl:col-span-2 rounded-xl border border-fuchsia-300/10 bg-fuchsia-400/[0.04] px-3 py-2 text-[9px] leading-4 text-fuchsia-100/60">Launch price discovery is active: upside potential is higher during the first 6–8 weeks, but the forecast band is deliberately much wider because supply and demand are still forming.</p> : scenarioUsesReleaseStabilization ? <p className="xl:col-span-2 rounded-xl border border-sky-300/10 bg-sky-400/[0.04] px-3 py-2 text-[9px] leading-4 text-sky-100/58">New-set stabilization is active: positive short-term growth is deliberately tempered during the first year after release while supply and grading populations settle.</p> : null}
            </div>
          ) : <p className="text-xs text-white/38">Not enough reliable market history for a price scenario.</p>}
        </AnalysisSection>

          <EbayCardDemandPanel
            cardId={signal.cardId}
            compact
            className="[@media(min-width:1900px)]:col-span-5 [@media(min-width:1900px)]:col-start-1 [@media(min-width:1900px)]:row-start-2 [@media(min-width:2200px)]:col-span-4"
          />

          <AnalysisSection className="2xl:col-span-7 2xl:col-start-6 2xl:row-start-2 [@media(min-width:2200px)]:col-span-4 [@media(min-width:2200px)]:col-start-5" eyebrow="Supply & access" title="Sealed and scarcity" icon={<PackageSearch className="h-4 w-4" />}>
            <div className="grid gap-3 [@media(min-width:2200px)]:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-amber-300/10 bg-amber-400/[0.025]">
                <MetricRow label="Sealed pressure" value={`${market?.sealed.pressureLabel ?? "--"} · ${market?.sealed.pressureScore ?? "--"}/100`} />
                <MetricRow label="Cheapest pack" value={market?.sealed.packPrice == null ? "--" : formatCurrency(market.sealed.packPrice, "EUR")} hint={market?.sealed.packName ?? undefined} />
                <MetricRow label="90-day sealed trend" value={signedPercent(market?.sealed.trend90dPct ?? null)} />
                <MetricRow label="Linked products" value={market?.sealed.productCount ?? 0} />
              </div>
              <div className="overflow-hidden rounded-xl border border-sky-300/10 bg-sky-400/[0.025]">
                <MetricRow label="Scarcity" value={`${market?.scarcity.label ?? "--"} · ${market?.scarcity.score ?? "--"}/100`} />
                <MetricRow label="Set rarity" value={market?.scarcity.setRarityLabel ?? "Unknown"} hint={market?.scarcity.setRarityScore == null ? undefined : `${market.scarcity.setRarityScore}/100 within this set`} />
                <MetricRow label="Pull odds" value={market?.scarcity.pullOdds ?? "Unknown"} />
                <MetricRow label="90-day raw trend" value={signedPercent(market?.scarcity.rawTrend90dPct ?? null)} />
              </div>
            </div>
          </AnalysisSection>

          <AnalysisSection className="2xl:col-span-6 2xl:col-start-1 2xl:row-start-3 [@media(min-width:2200px)]:col-span-4 [@media(min-width:2200px)]:col-start-9 [@media(min-width:2200px)]:row-start-2" eyebrow="Demand quality" title="Collector, artist and grading" icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid gap-3 [@media(min-width:2200px)]:grid-cols-2">
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

        <AnalysisSection className="2xl:col-span-6 2xl:col-start-7 2xl:row-start-3 [@media(min-width:2200px)]:col-span-4 [@media(min-width:2200px)]:col-start-1" eyebrow="Historical calibration" title="Growth probability tracker" icon={<BrainCircuit className="h-4 w-4" />} aside={<span className="rounded-full border border-sky-300/12 bg-sky-400/[0.05] px-2.5 py-1 text-[9px] font-semibold text-sky-100/58">{signal.forecast?.modelVersion ?? "Learning"}</span>}>
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

          <AnalysisSection className="2xl:col-span-6 2xl:col-start-1 2xl:row-start-4 [@media(min-width:2200px)]:hidden" eyebrow="Investment thesis" title="Why it is on the radar" icon={<Radar className="h-4 w-4" />}>
            <div className="space-y-2">
              {explanations.map((item) => (
                <div key={item.label} className="flex gap-3 rounded-xl border border-white/7 bg-black/16 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/70" />
                  <div><p className="text-xs font-bold text-white/78">{item.label}</p><p className="mt-1 text-[10px] leading-4 text-white/42">{item.text}</p></div>
                </div>
              ))}
            </div>
          </AnalysisSection>

          <AnalysisSection className="2xl:col-span-6 2xl:col-start-7 2xl:row-start-4 [@media(min-width:2200px)]:col-span-4 [@media(min-width:2200px)]:col-start-5 [@media(min-width:2200px)]:row-start-3" eyebrow="Source evidence" title="External proof" icon={<ArrowUpRight className="h-4 w-4" />} aside={<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/28">{signal.horizon}</span>}>
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

        <AnalysisSection className="2xl:col-span-12 2xl:col-start-1 2xl:row-start-5 [@media(min-width:2200px)]:col-span-4 [@media(min-width:2200px)]:col-start-9 [@media(min-width:2200px)]:row-start-3" eyebrow="Daily external scan" title="News, catalysts and risk" icon={<Newspaper className="h-4 w-4" />} aside={<span className={cx("rounded-full border px-2.5 py-1 text-[9px] font-semibold", (signal.riskScore ?? 0) > 0 ? "border-rose-300/14 bg-rose-400/[0.06] text-rose-100/68" : "border-emerald-300/14 bg-emerald-400/[0.06] text-emerald-100/68")}>{(signal.riskScore ?? 0) > 0 ? "Risk detected" : "No active risk"}</span>}>
          {catalysts.length ? (
            <div className="overflow-hidden rounded-xl border border-white/8 bg-black/16">
              <div className="grid grid-cols-[0.55fr_1.5fr_0.65fr_0.6fr] border-b border-white/7 px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/28"><span>Type</span><span>Catalyst</span><span>Evidence</span><span>Direction</span></div>
              {catalysts.map((catalyst) => (
                <Link key={catalyst.id} href={catalyst.sourceUrl} target="_blank" rel="noreferrer" className="grid min-h-14 grid-cols-[0.55fr_1.5fr_0.65fr_0.6fr] items-center border-b border-white/6 px-3 text-[10px] transition last:border-b-0 hover:bg-white/[0.025]">
                  <span className="capitalize text-white/42">{catalyst.kind}</span><span className="truncate font-semibold text-white/72">{catalyst.headline}</span><span className="text-white/42">{catalyst.evidenceLevel}</span><span className={catalyst.direction === "negative" ? "text-rose-200/72" : catalyst.direction === "positive" ? "text-emerald-200/72" : "text-white/42"}>{catalyst.direction}</span>
                </Link>
              ))}
            </div>
          ) : researchResults.length ? (
            <div className="overflow-hidden rounded-xl border border-white/8 bg-black/16">
              {researchResults.slice(0, 5).map((result) => (
                <Link key={result.url} href={result.url} target="_blank" rel="noreferrer" className="grid min-h-14 grid-cols-[0.65fr_1.8fr_0.8fr] items-center gap-3 border-b border-white/6 px-3 text-[10px] transition last:border-b-0 hover:bg-white/[0.025]">
                  <span className="text-white/42">{result.category}</span>
                  <span className="truncate font-semibold text-white/72">{result.title}</span>
                  <span className="truncate text-right text-violet-200/58">{result.domain}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-white/7 bg-black/16 p-4"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/65" /><p className="text-[10px] leading-4 text-white/42">No fresh trusted news catalyst is linked to this card. The ranking currently comes from {signal.sourceMode === "structural" ? "structural scarcity and market context" : "competitive demand"}.</p></div>
          )}
        </AnalysisSection>
      </div>
    </div>
      {researchOpen ? (
        <div
          className="fixed inset-0 z-[230] flex items-end justify-center bg-black/76 px-0 pt-12 backdrop-blur-md sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResearchOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-research-title"
            className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.65rem] border border-white/12 bg-[linear-gradient(150deg,rgba(20,22,34,0.99),rgba(8,10,16,0.99))] shadow-[0_30px_100px_rgba(0,0,0,0.72)] sm:max-h-[82dvh] sm:rounded-[1.65rem]"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-400/[0.09] text-violet-100/80">
                    <Search className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-violet-200/48">Focused web research</p>
                    <h2 id="card-research-title" className="mt-0.5 truncate text-base font-black text-white/92 sm:text-lg">
                      {signal.name}
                    </h2>
                  </div>
                </div>
                <p className="mt-2 max-w-xl text-[10px] leading-4 text-white/40">
                  Searches specifically for this printing, its set, market catalysts, reprints, grading and collector demand.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResearchOpen(false)}
                aria-label="Close card research"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/9 bg-white/[0.035] text-white/50 transition hover:border-white/18 hover:bg-white/[0.075] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {researchStatus === "loading" ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-violet-300/12 bg-violet-400/[0.035] px-6 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/16 bg-violet-400/[0.09] text-violet-100/80">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-white/82">Researching this exact card</h3>
                  <p className="mt-1.5 max-w-sm text-[10px] leading-4 text-white/38">Checking trusted news, set information, reprint signals and relevant market context.</p>
                </div>
              ) : null}

              {researchStatus === "error" ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-rose-300/12 bg-rose-400/[0.035] px-6 text-center">
                  <ShieldAlert className="h-7 w-7 text-rose-200/72" />
                  <h3 className="mt-3 text-sm font-bold text-white/82">Research could not be completed</h3>
                  <p className="mt-1.5 max-w-md text-[10px] leading-4 text-white/42">{researchError}</p>
                  <button type="button" onClick={() => void runCardResearch()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[11px] font-bold text-white/72 transition hover:border-violet-300/24 hover:bg-violet-400/[0.09]">
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              ) : null}

              {researchStatus === "success" && research ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/18 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-semibold text-white/38">
                      <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 uppercase">{research.provider}</span>
                      <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1">{research.queriesRun} {research.queriesRun === 1 ? "query" : "queries"}</span>
                      <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1">{research.creditsUsed} {research.provider === "firecrawl" ? "Firecrawl" : "Tavily"} credits</span>
                      {research.cached ? <span className="rounded-full border border-sky-300/12 bg-sky-400/[0.05] px-2 py-1 text-sky-100/58">Cached</span> : null}
                      {researchGeneratedLabel ? <span>{researchGeneratedLabel}</span> : null}
                    </div>
                    <span className="text-[9px] text-white/28">Shared for 24 hours to save credits</span>
                  </div>

                  {research.results.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {research.results.map((result, index) => (
                        <a
                          key={`${result.url}:${index}`}
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex min-w-0 flex-col rounded-2xl border border-white/8 bg-white/[0.025] p-3.5 transition hover:border-violet-300/22 hover:bg-violet-400/[0.055]"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cx("rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.09em]", result.sourceTier === "trusted" ? "border-emerald-300/13 bg-emerald-400/[0.055] text-emerald-100/68" : "border-sky-300/12 bg-sky-400/[0.05] text-sky-100/58")}>{result.sourceTier}</span>
                            <span className="rounded-full border border-white/8 bg-black/18 px-2 py-1 text-[8px] font-semibold capitalize text-white/42">{result.category}</span>
                            {result.direction ? <span className={cx("ml-auto text-[8px] font-bold capitalize", result.direction === "positive" ? "text-emerald-200/68" : result.direction === "negative" ? "text-rose-200/68" : "text-white/34")}>{result.direction}</span> : null}
                          </div>
                          <h3 className="mt-3 line-clamp-2 text-[12px] font-bold leading-4 text-white/80 transition group-hover:text-white">{result.title}</h3>
                          {result.reason ? <p className="mt-2 flex items-start gap-1.5 text-[9px] font-semibold leading-4 text-violet-100/62"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300/65" />{result.reason}</p> : null}
                          {result.description ? <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-white/38">{result.description}</p> : null}
                          <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[9px] text-white/30">
                            <span className="truncate">{result.domain}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-violet-200/58">Open source <ArrowUpRight className="h-3 w-3" /></span>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-white/8 bg-black/18 px-6 text-center">
                      <Search className="h-7 w-7 text-white/24" />
                      <h3 className="mt-3 text-sm font-bold text-white/76">No card-specific sources found yet</h3>
                      <p className="mt-1.5 max-w-md text-[10px] leading-4 text-white/38">The search completed, but no reliable new result could be tied to this exact printing. This empty result is cached to avoid wasting search credits.</p>
                    </div>
                  )}

                  {catalysts.length ? (
                    <div className="rounded-2xl border border-white/8 bg-black/18 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-[8px] font-bold uppercase tracking-[0.14em] text-violet-200/44">Already on the radar</p><h3 className="mt-1 text-xs font-bold text-white/74">Existing linked catalysts</h3></div>
                        <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[9px] font-bold text-white/42">{catalysts.length}</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {catalysts.slice(0, 4).map((catalyst) => (
                          <Link key={catalyst.id} href={catalyst.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/7 bg-white/[0.025] p-3 transition hover:border-violet-300/20">
                            <div className="flex items-center justify-between gap-2"><span className="text-[8px] font-bold uppercase text-white/32">{catalyst.kind}</span><span className="text-[8px] text-white/30">{catalyst.evidenceLevel}</span></div>
                            <p className="mt-1.5 line-clamp-2 text-[10px] font-semibold leading-4 text-white/66">{catalyst.headline}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
