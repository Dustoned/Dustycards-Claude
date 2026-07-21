"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Globe2,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import CardDetailShell, {
  type CardDetailSize,
  type CardDetailTab,
} from "@/components/card-detail/CardDetailShell";
import { CardDetailMediaSwitcher } from "@/components/card-detail/CardDetailMediaSwitcher";
import {
  CardDetailGradeSelect,
  CardDetailMarketControls,
} from "@/components/card-detail/CardDetailMarketControls";
import { buildCardDetailSignalTabs } from "@/components/card-detail/CardDetailSignalTabs";
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
import PriceHistoryPanel, {
  type PriceHistoryProjection,
  type PriceHistoryValuePoint,
} from "@/components/PriceHistoryPanel";
import { useSettings } from "@/components/SettingsProvider";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { resolveCardMarketCardUrl } from "@/lib/cardmarket";
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import type { ExternalCardSignal, ExternalMarketMode } from "@/lib/external-signal-radar";
import {
  getExpansionChaseFreshness,
  getExpansionChaseVerdict,
  type ExpansionChaseFreshness,
  type ExpansionChaseVerdictKey,
} from "@/lib/expansion-chase-radar-core";
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
const EbayCardDemandPanel = dynamic(() => import("@/components/ebay/EbayCardDemandPanel"), {
  loading: () => (
    <div
      className="h-40 rounded-2xl border border-white/7 bg-white/[0.025] motion-safe:animate-pulse"
      role="status"
      aria-label="Loading eBay demand"
    />
  ),
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
  tavilyCreditsUsed?: number;
  scrapedoCreditsUsed?: number;
  queriesRun: number;
  results: CardResearchResult[];
}

type ForecastDirection = "strong-rise" | "rise" | "flat" | "decline";

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

function getRadarEvidenceLabel(input: {
  signal: ExternalCardSignal;
  scenarioDrivers: string[];
  confluenceDrivers: string[];
  freshness: ExpansionChaseFreshness;
  scenarioConfidence: "High" | "Medium" | "Low" | undefined;
}): { label: "Main risk" | "Evidence"; value: string } {
  const negativeCatalyst = input.signal.catalysts?.find((catalyst) => catalyst.direction === "negative");
  if (negativeCatalyst) {
    return { label: "Main risk", value: negativeCatalyst.headline };
  }

  const riskDriver = input.scenarioDrivers.find((driver) =>
    /risk|reprint|supply|volatile|volatility|weak|declin|downside|thin|uncertain/i.test(driver)
  );
  if (riskDriver) return { label: "Main risk", value: riskDriver };
  if ((input.signal.riskScore ?? 0) >= 0.35) {
    return { label: "Main risk", value: "Elevated catalyst risk" };
  }
  if (input.freshness === "aging") {
    return { label: "Main risk", value: "Price quote is aging" };
  }
  if (input.scenarioConfidence === "Low") {
    return { label: "Main risk", value: "Limited forecast evidence" };
  }

  const evidence = input.confluenceDrivers[0] ?? input.scenarioDrivers[0] ?? input.signal.reasons[0];
  return {
    label: "Evidence",
    value: evidence ?? `${input.signal.evidence.length} verified market source${input.signal.evidence.length === 1 ? "" : "s"}`,
  };
}

function radarVerdictTone(key: ExpansionChaseVerdictKey): string {
  if (key === "strong_watch") return "text-cyan-100";
  if (key === "building") return "text-violet-100";
  if (key === "cooling" || key === "data_stale") return "text-amber-100";
  return "text-white/88";
}

function radarFreshnessLabel(freshness: ExpansionChaseFreshness): string {
  if (freshness === "fresh") return "Fresh market data";
  if (freshness === "aging") return "Aging market data";
  if (freshness === "stale") return "Stale market data";
  return "Freshness unknown";
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
                <span>
                  {research.provider === "scrapedo"
                    ? research.scrapedoCreditsUsed ?? 0
                    : research.provider === "tavily"
                      ? research.tavilyCreditsUsed ?? research.creditsUsed
                      : research.creditsUsed}{" "}
                  credits
                </span>
                {research.provider === "scrapedo" && research.creditsUsed > 0 ? (
                  <span>{research.creditsUsed} Firecrawl fallback credits</span>
                ) : null}
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
  backSetId = null,
}: {
  signal: ExternalCardSignal;
  card: ModalCardData;
  priceHistory: SignalRadarPriceHistoryData;
  initialResearch?: CardResearchSnapshot | null;
  detailSize?: CardDetailSize;
  backSetId?: string | null;
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
  const ownedCopyGradeLabel = [gradingCompanyLabel, gradingGradeLabel]
    .filter(Boolean)
    .join(" ");
  const radarGradedLabel =
    priceHistory.gradedLabel?.trim() || ownedCopyGradeLabel || "Graded";
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
  const researchResults = research?.results ?? [];
  const cardMarketHref = resolveCardMarketCardUrl({
    id: card.id,
    game: card.game,
    cardmarket_id: card.cardmarket_id,
    cardmarket_url: card.cardmarket_url,
  });
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
  const radarFreshness = useMemo(() => {
    const referenceDate = new Date(priceHistory.modelDate);
    if (!Number.isFinite(referenceDate.getTime())) return "unknown";
    const priceTimestamp =
      effectiveMode === "graded"
        ? card.ebay_sold_graded_synced_at ??
          card.ebay_sold_graded_checked_at ??
          card.price_fetched_at
        : card.price_fetched_at;
    return getExpansionChaseFreshness(priceTimestamp, referenceDate);
  }, [
    card.ebay_sold_graded_checked_at,
    card.ebay_sold_graded_synced_at,
    card.price_fetched_at,
    effectiveMode,
    priceHistory.modelDate,
  ]);
  const radarVerdict = getExpansionChaseVerdict({
    scenario,
    opportunityScore: score,
    freshness: radarFreshness,
    observedChange7dPct:
      effectiveMode === "raw" && displayPrice != null && card.price?.cm_en_avg_7d
        ? ((displayPrice - card.price.cm_en_avg_7d) / card.price.cm_en_avg_7d) * 100
        : null,
  });
  const radarEvidence = getRadarEvidenceLabel({
    signal,
    scenarioDrivers: scenario?.drivers ?? [],
    confluenceDrivers: confluence?.drivers ?? [],
    freshness: radarFreshness,
    scenarioConfidence: scenario?.confidence,
  });

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
      <DetailSurface
        title="Card profile"
        copy="The essential printing details, kept in one predictable place."
      >
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

      <section className="card-detail-surface" data-testid="signal-radar-verdict">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="card-detail-eyebrow">Radar verdict</p>
            <h2 className={cx("mt-2 text-2xl font-black tracking-[-0.025em]", radarVerdictTone(radarVerdict.key))}>
              {radarVerdict.label}
            </h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-400/[0.07] text-violet-100/76">
            <Radar className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-2 max-w-[54ch] text-sm leading-6 text-white/48">{radarVerdict.summary}</p>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white/38">
          <span
            className={cx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              radarFreshness === "fresh"
                ? "bg-cyan-300"
                : radarFreshness === "aging"
                  ? "bg-amber-300"
                  : "bg-white/30"
            )}
            aria-hidden="true"
          />
          {radarFreshnessLabel(radarFreshness)}
        </div>
        <div className="mt-4">
          <InfoGrid
            items={[
              ["Opportunity", `${score}/100`],
              ["180d", scenario?.confidence === "Low" ? "Learning" : signedPercent(forecastChangePct)],
              ["Confidence", scenario?.confidence ?? signal.confidence],
              [radarEvidence.label, radarEvidence.value],
            ]}
          />
        </div>
      </section>
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
    <div
      className="card-detail-section-grid card-detail-collection-grid"
      data-columns="2"
    >
      <CardModalOwnedCopyPanel card={card} collectionItem={collectionItem} showActions={false} />
      <CardModalActiveListingsPanel
        card={card}
        onOpenSealedProduct={setSelectedSealedProduct}
      />
    </div>
  );

  const signalTabs = buildCardDetailSignalTabs({
    signal,
    marketMode: effectiveMode,
    selectedGradeLabel: effectiveMode === "graded" ? radarGradedLabel : null,
    researchResults,
    researchStatus,
    researchError,
    researchPresentation: "dialog",
    onResearch: () => void runCardResearch(),
  });

  const tabs: CardDetailTab[] = orderCardDetailTabs("radar", [
    { id: "overview", label: "Overview", content: overviewPanel },
    { id: "market", label: "Market", content: marketPanel },
    { id: "collection", label: "Collection", content: collectionPanel },
    ...signalTabs,
  ]);

  return (
    <>
      <CardDetailShell
        mode="radar"
        detailSize={displaySettings.modalSize ?? detailSize}
        navigation={{
          label: "Back to Signal Radar",
          href: backSetId
            ? `/movers/signal-radar?game=${encodeURIComponent(signal.game)}&set=${encodeURIComponent(backSetId)}#new-release-chases`
            : `/movers/signal-radar?game=${encodeURIComponent(signal.game)}`,
        }}
        eyebrow={signal.manualResearch || signal.rank <= 0 ? "Signal Radar research profile" : `Signal Radar · Candidate #${signal.rank}`}
        title={card.name}
        subtitle={[card.episode_name, card.card_number ? `#${card.card_number}` : null].filter(Boolean).join(" · ")}
        badges={
          <span className="rounded-full border border-violet-300/18 bg-violet-400/[0.075] px-2.5 py-1 text-[11px] font-bold text-violet-100/78">{card.rarity ?? "Unclassified"}</span>
        }
        status={actionError ? <span className="text-sm font-semibold text-rose-200/78">{actionError}</span> : null}
        priceLabel={effectiveMode === "graded" ? `${radarGradedLabel} market` : "Raw market"}
        price={formatCurrency(displayPrice, displayCurrency)}
        priceMeta={horizonPoint ? "Base case · 180-day horizon" : signal.horizon}
        marketControls={
          <CardDetailMarketControls
            mode={effectiveMode}
            gradedAvailable={gradedAvailable}
            onModeChange={setMarketMode}
          />
        }
        kpis={[
          { label: "Opportunity", value: `${score}/100`, hint: effectiveMode === "graded" ? "Graded setup" : "Raw setup", tone: "violet" },
          { label: "Setup strength", value: `${confluence?.score ?? "--"}/100`, hint: confluence?.label ?? "Building", tone: "violet" },
          { label: "Confidence", value: signal.confidence, hint: signal.pressureLabel, tone: "cyan" },
          { label: "180-day model", value: scenario?.confidence === "Low" ? "Learning" : signedPercent(forecastChangePct), hint: scenario?.confidence === "Low" ? "Launch market" : horizonPoint ? formatCurrency(horizonPoint.base, scenario?.currency ?? displayCurrency) : "Learning", tone: forecastChangePct != null && forecastChangePct >= 0 ? "cyan" : "warning" },
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
            subtitle={effectiveMode === "raw" ? "English · Near Mint" : radarGradedLabel}
            headerLeadingAccessory={
              effectiveMode === "graded" ? (
                <CardDetailGradeSelect
                  options={[
                    {
                      value: radarGradedLabel || "Graded",
                      label: radarGradedLabel || "Graded",
                      detail: "Radar series",
                    },
                  ]}
                  selectedGrade={radarGradedLabel || "Graded"}
                />
              ) : (
                <span
                  className="inline-flex h-11 w-[5.75rem] items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2.5 text-[12px] font-black text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  data-card-detail-chart-series-control="language"
                >
                  <Globe2 className="h-3.5 w-3.5 shrink-0 text-violet-200/64" aria-hidden="true" />
                  EN
                </span>
              )
            }
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
