"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { getSignalExplanations } from "@/app/movers/signal-radar/ExternalSignalBrowser";
import CardDetailShell, {
  type CardDetailSize,
  type CardDetailTab,
} from "@/components/card-detail/CardDetailShell";
import { CardDetailMediaSwitcher } from "@/components/card-detail/CardDetailMediaSwitcher";
import { CardDetailMarketControls } from "@/components/card-detail/CardDetailMarketControls";
import { orderCardDetailTabs } from "@/components/card-detail/card-detail-tabs";
import {
  CardModalActiveListingsPanel,
  CardModalDesktopActionGroup,
  CardModalMarketSignalPanel,
  CardModalOwnedCopyPanel,
  CardModalPreview,
  CardModalRecentPricesPanel,
} from "@/components/card-modal/CardModalSections";
import type { ModalCardData } from "@/components/card-modal/types";
import EbayCardDemandPanel from "@/components/ebay/EbayCardDemandPanel";
import PriceHistoryPanel, {
  type PriceHistoryProjection,
  type PriceHistoryValuePoint,
} from "@/components/PriceHistoryPanel";
import { useSettings } from "@/components/SettingsProvider";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { buildCardMarketProxyUrl, getSafeDirectCardMarketCardUrl } from "@/lib/cardmarket";
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import type { ExternalCardSignal, ExternalMarketMode } from "@/lib/external-signal-radar";
import { formatCurrency } from "@/lib/format";
import {
  GRADED_SLAB_ASPECT_CLASS,
  RAW_CARD_ASPECT_CLASS,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import { getExpansionHref } from "@/lib/games";
import { buildAttachedBasePrediction } from "@/lib/signal-price-history";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import useModalA11y from "@/lib/useModalA11y";

const CardThreeViewer = dynamic(() => import("@/app/expansions/[id]/CardThreeViewer"), {
  ssr: false,
  loading: () => null,
});
const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

export interface SignalRadarPriceHistoryData {
  raw: PriceHistoryValuePoint[];
  rawCurrency: "EUR";
  graded: PriceHistoryValuePoint[];
  gradedCurrency: "EUR" | "USD";
  gradedLabel: string | null;
  modelDate: string;
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

type ForecastDirection = "strong-rise" | "rise" | "flat" | "decline";

const FORECAST_TARGETS = [
  { key: "1.5x-90d", label: "1.5×", horizon: "90 days", minimum: 50 },
  { key: "2x-90d", label: "2×", horizon: "90 days", minimum: 100 },
  { key: "3x-180d", label: "3×", horizon: "180 days", minimum: 200 },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function signedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function getForecastDirection(
  outlook: "strong_up" | "modest_up" | "flat" | "down" | undefined,
  changePct: number | null
): ForecastDirection {
  if (outlook === "strong_up") return "strong-rise";
  if (outlook === "modest_up") return "rise";
  if (outlook === "down") return "decline";
  if (outlook === "flat") return "flat";
  if (changePct == null || Math.abs(changePct) < 4) return "flat";
  if (changePct < 0) return "decline";
  return changePct >= 20 ? "strong-rise" : "rise";
}

function forecastTone(direction: ForecastDirection): string {
  if (direction === "strong-rise") {
    return "border-cyan-300/18 bg-cyan-400/[0.055] text-cyan-100/84";
  }
  if (direction === "rise") {
    return "border-emerald-300/16 bg-emerald-400/[0.05] text-emerald-100/80";
  }
  if (direction === "decline") {
    return "border-rose-300/16 bg-rose-400/[0.05] text-rose-100/80";
  }
  return "border-white/10 bg-white/[0.035] text-white/66";
}

function DetailSurface({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  children: ReactNode;
}) {
  return (
    <section className="card-detail-surface">
      {eyebrow ? <p className="card-detail-eyebrow">{eyebrow}</p> : null}
      <h2 className={cx("card-detail-surface-title", eyebrow ? "mt-2" : "")}>{title}</h2>
      {copy ? <p className="card-detail-surface-copy">{copy}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="card-detail-info-grid">
      {items.map(([label, value], index) => (
        <div key={`${label}-${index}`} className="card-detail-info-cell">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResearchDialog({
  signal,
  research,
  status,
  error,
  onClose,
  onRetry,
}: {
  signal: ExternalCardSignal;
  research: CardResearchSnapshot | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useBodyScrollLock(true);
  useModalA11y({ dialogRef, onClose });

  return (
    <div
      className="fixed inset-0 z-[270] flex items-end justify-center bg-black/78 px-0 pt-12 backdrop-blur-md sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-research-title"
        tabIndex={-1}
        className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.65rem] border border-white/12 bg-[linear-gradient(150deg,rgba(20,19,30,0.995),rgba(8,8,13,0.995))] shadow-[0_30px_100px_rgba(0,0,0,0.72)] sm:max-h-[82dvh] sm:rounded-[1.65rem]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="card-detail-eyebrow">Focused web research</p>
            <h2 id="card-research-title" className="mt-1 truncate text-xl font-extrabold text-white/92">
              {signal.name}
            </h2>
            <p className="mt-1 text-sm text-white/42">
              Printing-specific catalysts, reprints, grading and collector demand.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card research"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/58 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {status === "loading" ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-violet-300/13 bg-violet-400/[0.035] px-6 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-violet-200/78" />
              <h3 className="mt-4 text-base font-bold text-white/84">Researching this exact printing</h3>
              <p className="mt-1.5 max-w-md text-sm leading-6 text-white/42">
                Checking trusted news, reprint signals and relevant market context.
              </p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-rose-300/13 bg-rose-400/[0.035] px-6 text-center">
              <ShieldAlert className="h-7 w-7 text-rose-200/72" />
              <h3 className="mt-3 text-base font-bold text-white/84">Research could not be completed</h3>
              <p className="mt-1.5 max-w-md text-sm leading-6 text-white/44">{error}</p>
              <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-bold text-white/76 transition hover:border-violet-300/24 hover:bg-violet-400/[0.09]">
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </div>
          ) : null}

          {status === "success" && research ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-black/18 px-4 py-3 text-xs font-semibold text-white/42">
                <span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 uppercase">{research.provider}</span>
                <span>{research.queriesRun} {research.queriesRun === 1 ? "query" : "queries"}</span>
                <span>{research.creditsUsed} credits</span>
                {research.cached ? <span className="text-cyan-100/65">Cached for 24 hours</span> : null}
              </div>
              {research.results.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {research.results.map((result, index) => (
                    <a
                      key={`${result.url}:${index}`}
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-w-0 flex-col rounded-2xl border border-white/8 bg-white/[0.025] p-4 transition hover:border-violet-300/22 hover:bg-violet-400/[0.055]"
                    >
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white/38">
                        <span>{result.category}</span>
                        <span className="ml-auto text-violet-200/58">{result.domain}</span>
                      </div>
                      <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-white/82 group-hover:text-white">{result.title}</h3>
                      {result.reason ? <p className="mt-2 text-xs font-semibold leading-5 text-violet-100/62">{result.reason}</p> : null}
                      {result.description ? <p className="mt-2 line-clamp-3 text-sm leading-5 text-white/40">{result.description}</p> : null}
                      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold text-violet-200/62">
                        Open source <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/8 bg-black/18 px-6 text-center">
                  <Search className="h-7 w-7 text-white/24" />
                  <h3 className="mt-3 text-base font-bold text-white/76">No reliable card-specific source found</h3>
                  <p className="mt-1.5 max-w-md text-sm leading-6 text-white/40">The completed search found no new source that could safely be tied to this printing.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function SignalRadarDetailClient({
  signal,
  card,
  priceHistory,
  initialResearch = null,
  detailSize = "medium",
}: {
  signal: ExternalCardSignal;
  card: ModalCardData;
  priceHistory: SignalRadarPriceHistoryData;
  initialResearch?: CardResearchSnapshot | null;
  detailSize?: CardDetailSize;
}) {
  const router = useRouter();
  const { displaySettings, currentUserRole } = useSettings();
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [selectedSealedProduct, setSelectedSealedProduct] = useState<SealedModalProductData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [removingCollectionItem, setRemovingCollectionItem] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchStatus, setResearchStatus] = useState<"idle" | "loading" | "success" | "error">(
    initialResearch ? "success" : "idle"
  );
  const [research, setResearch] = useState<CardResearchSnapshot | null>(initialResearch);
  const [researchError, setResearchError] = useState<string | null>(null);

  const collectionItem = card.collection_item ?? null;
  const gradingCompanyLabel = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  const showGradedPreview = Boolean(gradingCompanyLabel && gradingGradeLabel);
  const radarGradedLabel =
    priceHistory.gradedLabel ??
    [gradingCompanyLabel, gradingGradeLabel].filter(Boolean).join(" ") ??
    "Graded";
  const market = signal.marketIntelligence;
  const gradedAvailable = market?.graded.available ?? false;
  const effectiveMode = marketMode === "graded" && gradedAvailable ? "graded" : "raw";
  const scenario = effectiveMode === "graded" ? market?.gradedScenario : market?.rawScenario;
  const opportunity =
    effectiveMode === "graded" ? market?.gradedOpportunityScore : market?.rawOpportunityScore;
  const score = opportunity ?? signal.externalScore;
  const confluence = market
    ? effectiveMode === "graded"
      ? market.gradedConfluence ?? market.confluence
      : market.rawConfluence ?? market.confluence
    : undefined;
  const activeHistory = effectiveMode === "graded" ? priceHistory.graded : priceHistory.raw;
  const activeHistoryCurrency =
    effectiveMode === "graded" ? priceHistory.gradedCurrency : priceHistory.rawCurrency;
  const rawMarketPrice = card.price?.cm_en_lowest_nm ?? signal.currentPrice;
  const displayPrice =
    effectiveMode === "graded"
      ? scenario?.currentPrice ?? market?.graded.currentPrice ?? null
      : rawMarketPrice;
  const displayCurrency =
    effectiveMode === "graded" ? scenario?.currency ?? market?.graded.currency ?? "EUR" : "EUR";
  const predictionPoints = useMemo(
    () =>
      scenario
        ? buildAttachedBasePrediction({
            history: activeHistory,
            currentPrice: displayPrice,
            points: scenario.points,
            modelDate: priceHistory.modelDate,
          })
        : [],
    [activeHistory, displayPrice, priceHistory.modelDate, scenario]
  );
  const horizonPoint = scenario?.points.find((point) => point.days === 180) ?? scenario?.points.at(-1);
  const forecastChangePct =
    scenario?.expectedReturnPct180 ??
    (displayPrice != null && displayPrice > 0 && horizonPoint
      ? ((horizonPoint.base - displayPrice) / displayPrice) * 100
      : null);
  const forecastDirection = getForecastDirection(scenario?.outlook, forecastChangePct);
  const projection: PriceHistoryProjection | null =
    predictionPoints.length > 1
      ? {
          label: "Dusty forecast",
          points: predictionPoints,
          tone: forecastDirection,
          summary: signedPercent(forecastChangePct),
        }
      : null;
  const explanations = getSignalExplanations(signal);
  const catalysts = signal.catalysts ?? [];
  const researchResults = research?.results ?? [];
  const cardMarketHref =
    getSafeDirectCardMarketCardUrl(card.cardmarket_url, card.game) ?? buildCardMarketProxyUrl(card.id);
  const ebayHref = buildCardEbaySearchUrl({
    name: card.name,
    cardNumber: card.card_number,
    gradingCompany: gradingCompanyLabel,
    gradingGrade: gradingGradeLabel,
  });
  const releaseLabel = card.episode_release_date
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(card.episode_release_date))
    : "Unknown";
  const isBusy = refreshing || syncingHistory;

  async function runCardAction(action: "refresh" | "sync-history") {
    if (action === "refresh") {
      setRefreshing(true);
    } else {
      setSyncingHistory(true);
    }
    setActionError(null);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not update card prices");
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update card prices");
    } finally {
      if (action === "refresh") {
        setRefreshing(false);
      } else {
        setSyncingHistory(false);
      }
    }
  }

  async function removeCurrentCollectionItem() {
    if (!collectionItem || collectionItem.read_only || removingCollectionItem) return;
    if (!window.confirm("Remove this saved copy from your collection?")) return;
    setRemovingCollectionItem(true);
    setActionError(null);
    try {
      const response = await fetch("/api/collection/cards", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: collectionItem.id }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not remove this copy");
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not remove this copy");
    } finally {
      setRemovingCollectionItem(false);
    }
  }

  async function runCardResearch() {
    setResearchOpen(true);
    setResearchStatus("loading");
    setResearchError(null);
    try {
      const response = await fetch(
        `/api/movers/signal-radar/${encodeURIComponent(signal.cardId)}/research`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
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

  const overviewPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <DetailSurface eyebrow="Card profile" title="The printing at a glance" copy="Canonical card facts stay in the same place as every other detail view.">
        <InfoGrid
          items={[
            ["Expansion", <Link key="set" href={getExpansionHref(card.episode_id)} className="text-violet-200/82 hover:text-white">{card.episode_name}</Link>],
            ["Card number", card.card_number ? `#${card.card_number}` : "--"],
            ["Rarity", card.rarity ?? "--"],
            ["Illustrator", card.artist ? <Link key="artist" href={`/illustrators/${encodeURIComponent(card.artist)}`} className="text-violet-200/82 hover:text-white">{card.artist}</Link> : "--"],
            ["Type", [card.supertype, card.subtypes].filter(Boolean).join(" · ") || "--"],
            ["HP", card.hp ?? "--"],
            ["Release", releaseLabel],
            ["Pull odds", card.pull_rate_info?.specific_pull_odds ?? card.pull_rate_info?.pull_rate_odds ?? "Unknown"],
          ]}
        />
      </DetailSurface>

      <DetailSurface eyebrow="Signal summary" title={`Why ${card.name} is on the radar`} copy={signal.pressureExplanation}>
        <div className="grid gap-3 sm:grid-cols-2">
          {explanations.slice(0, 4).map((item) => (
            <div key={item.label} className="flex gap-3 rounded-2xl border border-white/8 bg-black/16 p-4">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/72" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white/80">{item.label}</p>
                <p className="mt-1 text-sm leading-5 text-white/42">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </DetailSurface>
    </div>
  );

  const marketPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <CardModalMarketSignalPanel
        signal={signal}
        card={card}
        onNavigate={() => undefined}
        showFullAnalysisLink={false}
      />
      <div className="card-detail-section-grid">
        <CardModalRecentPricesPanel card={card} />
        <EbayCardDemandPanel
          cardId={card.id}
          mode={effectiveMode}
          onModeChange={setMarketMode}
          showModeControl={false}
        />
      </div>
    </div>
  );

  const collectionPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <CardModalOwnedCopyPanel card={card} collectionItem={collectionItem} showActions={false} />
      <CardModalActiveListingsPanel
        card={card}
        onOpenSealedProduct={setSelectedSealedProduct}
      />
    </div>
  );

  const forecastPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <DetailSurface eyebrow="Base scenario" title="Forecast targets" copy="A directional model, not a guaranteed price target.">
        {scenario ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {scenario.points.map((point) => {
              const changePct = displayPrice && displayPrice > 0
                ? ((point.base - displayPrice) / displayPrice) * 100
                : null;
              const direction = getForecastDirection(undefined, changePct);
              return (
                <div key={point.days} className={cx("rounded-2xl border p-4", forecastTone(direction))}>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] opacity-55">{point.days} days</p>
                  <p className="mt-2 text-xl font-extrabold tabular-nums text-white/90">{formatCurrency(point.base, scenario.currency)}</p>
                  <p className="mt-1 text-sm font-bold tabular-nums">{signedPercent(changePct)}</p>
                  <p className="mt-3 text-xs text-white/38">Range {formatCurrency(point.low, scenario.currency)}–{formatCurrency(point.high, scenario.currency)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/42">No reliable scenario is available yet.</p>
        )}
      </DetailSurface>

      <DetailSurface eyebrow="Historical calibration" title="Growth probability tracker" copy={signal.forecast?.modelVersion ?? "The model is still learning from completed signals."}>
        <div className="overflow-hidden rounded-2xl border border-white/8">
          {FORECAST_TARGETS.map((target) => {
            const summary = signal.forecast?.targets[target.key];
            const interval = summary?.status === "calibrated" ? summary.interval : null;
            return (
              <div key={target.key} className="grid min-h-16 grid-cols-[0.55fr_0.8fr_1.35fr] items-center gap-3 border-b border-white/7 px-4 text-sm last:border-b-0">
                <strong className="text-white/82">{target.label}</strong>
                <span className="text-white/46">{target.horizon}</span>
                <span className="text-right font-semibold text-cyan-100/68">
                  {interval && summary ? `${Math.round(interval.estimate * 100)}% · ${summary.hits}/${summary.samples} hits` : `Learning · ${summary?.samples ?? 0}/${target.minimum}`}
                </span>
              </div>
            );
          })}
        </div>
      </DetailSurface>
    </div>
  );

  const analysisPanel = (
    <div className="card-detail-section-grid" data-columns="3">
      <DetailSurface eyebrow="Supply & access" title="Sealed and scarcity">
        <InfoGrid items={[
          ["Set lifecycle", market?.sealed.lifecycleLabel ?? "Learning"],
          ["OOP likelihood", market?.sealed.lifecycleOopProbability == null ? "--" : `${market.sealed.lifecycleOopProbability}%`],
          ["Sealed pressure", `${market?.sealed.pressureLabel ?? "--"} · ${market?.sealed.pressureScore ?? "--"}/100`],
          ["Cheapest pack", market?.sealed.packPrice == null ? "--" : formatCurrency(market.sealed.packPrice, "EUR")],
          ["Scarcity", `${market?.scarcity.label ?? "--"} · ${market?.scarcity.score ?? "--"}/100`],
          ["Pull odds", market?.scarcity.pullOdds ?? "Unknown"],
        ]} />
      </DetailSurface>

      <DetailSurface eyebrow="Demand quality" title="Collector and grading">
        <InfoGrid items={[
          ["Confluence", `${confluence?.label ?? "--"} · ${confluence?.score ?? "--"}/100`],
          ["Artist demand", market?.scarcity.artistDemandScore == null ? "--" : `${market.scarcity.artistDemandScore}/100`],
          ["Collector demand", `${market?.scarcity.collectorDemandScore ?? "--"}/100`],
          ["Grading supply", market?.graded.supplyLabel ?? "Unknown"],
          ["PSA 10 market", market?.graded.psa10Price == null ? "--" : formatCurrency(market.graded.psa10Price, market.graded.currency)],
          ["Gem rate", market?.graded.gemRatePct == null ? "--" : `${market.graded.gemRatePct.toFixed(1)}%`],
        ]} />
      </DetailSurface>

      <DetailSurface eyebrow="Investment thesis" title="Active drivers">
        <div className="space-y-3">
          {(confluence?.drivers ?? signal.reasons).slice(0, 6).map((driver) => (
            <div key={driver} className="flex gap-3 rounded-2xl border border-white/8 bg-black/16 p-4">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-200/72" />
              <p className="text-sm font-semibold leading-5 text-white/66">{driver}</p>
            </div>
          ))}
        </div>
      </DetailSurface>
    </div>
  );

  const evidencePanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <DetailSurface eyebrow="Source evidence" title="External proof" copy={signal.horizon}>
        <div className="space-y-3">
          {signal.evidence.length ? signal.evidence.map((item) => (
            <Link key={`${item.deckUrl}:${item.deckName}`} href={item.deckUrl} target="_blank" rel="noreferrer" className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/8 bg-black/16 px-4 py-3 transition hover:border-violet-300/22">
              <span className="truncate text-sm font-bold text-white/74">{item.deckName}</span>
              <span className="text-sm font-bold text-violet-200/72">{item.inclusionPercent.toFixed(0)}%</span>
              <span className="text-xs text-white/38">{item.deckSharePercent.toFixed(1)}% meta share</span>
              <span className="text-right text-xs text-white/38">inclusion</span>
            </Link>
          )) : (
            <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-white/42">This structural profile uses sealed, CardMarket and eBay evidence instead of tournament decks.</p>
          )}
        </div>
      </DetailSurface>

      <DetailSurface eyebrow="Daily scan" title="News, catalysts and research">
        <button
          type="button"
          onClick={() => void runCardResearch()}
          disabled={researchStatus === "loading"}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-500/[0.12] px-4 text-sm font-bold text-violet-50/90 transition hover:border-violet-200/34 hover:bg-violet-500/[0.2] disabled:cursor-wait disabled:opacity-60"
        >
          {researchStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {researchStatus === "loading" ? "Researching this card..." : research ? "Refresh focused research" : "Research this card"}
        </button>
        <div className="mt-4 space-y-3">
          {catalysts.length ? catalysts.slice(0, 6).map((catalyst) => (
            <Link key={catalyst.id} href={catalyst.sourceUrl} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/8 bg-black/16 p-4 transition hover:border-violet-300/22">
              <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.08em] text-white/36">
                <span>{catalyst.kind}</span>
                <span className={catalyst.direction === "negative" ? "text-rose-200/70" : catalyst.direction === "positive" ? "text-emerald-200/70" : "text-white/42"}>{catalyst.direction}</span>
              </div>
              <p className="mt-2 text-sm font-bold leading-5 text-white/74">{catalyst.headline}</p>
              <p className="mt-1 text-sm leading-5 text-white/40">{catalyst.explanation}</p>
            </Link>
          )) : researchResults.length ? researchResults.slice(0, 5).map((result) => (
            <Link key={result.url} href={result.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/8 bg-black/16 p-4 transition hover:border-violet-300/22">
              <p className="text-sm font-bold text-white/74">{result.title}</p>
              <p className="mt-1 text-xs text-violet-200/58">{result.domain}</p>
            </Link>
          )) : (
            <div className="flex gap-3 rounded-2xl border border-white/8 bg-black/16 p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/68" />
              <p className="text-sm leading-5 text-white/42">No fresh trusted catalyst is linked to this printing yet.</p>
            </div>
          )}
        </div>
      </DetailSurface>
    </div>
  );

  const tabs: CardDetailTab[] = orderCardDetailTabs("radar", [
    { id: "overview", label: "Overview", content: overviewPanel },
    { id: "market", label: "Market", content: marketPanel },
    { id: "collection", label: "Collection", content: collectionPanel },
    { id: "forecast", label: "Forecast", content: forecastPanel },
    { id: "analysis", label: "Analysis", content: analysisPanel },
    { id: "evidence", label: "Evidence", content: evidencePanel },
  ]);

  return (
    <>
      <CardDetailShell
        mode="radar"
        detailSize={displaySettings.modalSize ?? detailSize}
        navigation={{
          label: "Back to Signal Radar",
          href: `/movers/signal-radar?game=${encodeURIComponent(signal.game)}`,
        }}
        eyebrow={signal.manualResearch || signal.rank <= 0 ? "Signal Radar research profile" : `Signal Radar · Candidate #${signal.rank}`}
        title={card.name}
        subtitle={[card.episode_name, card.card_number ? `#${card.card_number}` : null].filter(Boolean).join(" · ")}
        badges={
          <span className="rounded-full border border-violet-300/18 bg-violet-400/[0.075] px-2.5 py-1 text-[11px] font-bold text-violet-100/78">{card.rarity ?? "Unclassified"}</span>
        }
        status={actionError ? <span className="text-sm font-semibold text-rose-200/78">{actionError}</span> : null}
        priceLabel={`Current ${effectiveMode} market`}
        price={formatCurrency(displayPrice, displayCurrency)}
        priceMeta={horizonPoint ? "Base case · 180-day horizon" : signal.horizon}
        marketControls={
          <CardDetailMarketControls
            mode={effectiveMode}
            gradedAvailable={gradedAvailable}
            onModeChange={setMarketMode}
            gradeOptions={
              gradedAvailable
                ? [{ value: radarGradedLabel || "Graded", label: radarGradedLabel || "Graded", detail: "Radar series" }]
                : []
            }
            selectedGrade={radarGradedLabel || "Graded"}
          />
        }
        kpis={[
          { label: "Opportunity", value: `${score}/100`, hint: effectiveMode === "graded" ? "Graded setup" : "Raw setup", tone: "violet" },
          { label: "Setup strength", value: `${confluence?.score ?? "--"}/100`, hint: confluence?.label ?? "Building", tone: "violet" },
          { label: "Confidence", value: signal.confidence, hint: signal.pressureLabel, tone: "cyan" },
          { label: "180-day model", value: signedPercent(forecastChangePct), hint: horizonPoint ? formatCurrency(horizonPoint.base, scenario?.currency ?? displayCurrency) : "Learning", tone: forecastChangePct != null && forecastChangePct >= 0 ? "cyan" : "warning" },
        ]}
        media={
          <CardDetailMediaSwitcher
            cardName={card.name}
            threeDimensionalAvailable={Boolean(card.image_url)}
            twoDimensional={
              <CardModalPreview
                card={card}
                mediaWidth="100%"
                imageSize="(max-width: 639px) 72vw, (max-width: 1535px) 30vw, 480px"
                previewAspectClass={showGradedPreview ? GRADED_SLAB_ASPECT_CLASS : RAW_CARD_ASPECT_CLASS}
                showGradedPreview={showGradedPreview}
                gradingCompanyLabel={gradingCompanyLabel}
                gradingGradeLabel={gradingGradeLabel}
                gradedTileSize={displaySettings.cardSize}
                onOpenThreeD={() => setThreeDOpen(true)}
              />
            }
            renderThreeDimensional={(showTwoDimensional) =>
              card.image_url ? (
                <CardThreeViewer
                  key={`${card.id}-inline`}
                  card={card}
                  frontImageUrl={card.image_url}
                  cardMarketUrl={cardMarketHref}
                  showGradedSlabPreview={showGradedPreview}
                  variant="inline"
                  onClose={showTwoDimensional}
                />
              ) : null
            }
          />
        }
        mediaActions={
          <div className="card-detail-market-links">
            <a href={cardMarketHref} target="_blank" rel="noopener noreferrer" className="card-detail-market-link">CardMarket <ArrowUpRight className="h-3.5 w-3.5" /></a>
            <a href={ebayHref} target="_blank" rel="noopener noreferrer" className="card-detail-market-link">eBay Deals <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
        }
        chart={
          <PriceHistoryPanel
            title="Price history"
            currency={activeHistoryCurrency}
            points={activeHistory}
            currentValue={displayPrice}
            showCurrentValue={false}
            subtitle={effectiveMode === "raw" ? "English · Near Mint" : priceHistory.gradedLabel ?? "Graded"}
            tone="dark"
            layout="hero"
            rangeScopePoints={activeHistory}
            rangeStorageKey={`signal-history-${signal.cardId}-${effectiveMode}`}
            emptyText="No reliable price history yet"
            projection={projection}
          />
        }
        actions={
          <CardModalDesktopActionGroup
            card={card}
            collectionItem={collectionItem}
            isBusy={isBusy}
            refreshing={refreshing}
            syncingHistory={syncingHistory}
            canManageCardPrices={currentUserRole === "admin"}
            removingCollectionItem={removingCollectionItem}
            onRefresh={() => void runCardAction("refresh")}
            onSyncHistory={() => void runCardAction("sync-history")}
            onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
            onAddedToCollection={() => router.refresh()}
            onClose={() => router.refresh()}
            cardMarketHref={cardMarketHref}
          />
        }
        tabs={tabs}
        mobileChartTabs={["market", "forecast"]}
      />

      {threeDOpen && card.image_url ? (
        <CardThreeViewer
          card={card}
          frontImageUrl={card.image_url}
          cardMarketUrl={cardMarketHref}
          showGradedSlabPreview={showGradedPreview}
          onClose={() => setThreeDOpen(false)}
        />
      ) : null}

      {selectedSealedProduct ? (
        <SealedProductModal product={selectedSealedProduct} onClose={() => setSelectedSealedProduct(null)} />
      ) : null}

      {researchOpen ? (
        <ResearchDialog
          signal={signal}
          research={research}
          status={researchStatus}
          error={researchError}
          onClose={() => setResearchOpen(false)}
          onRetry={() => void runCardResearch()}
        />
      ) : null}
    </>
  );
}
