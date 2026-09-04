"use client";

import {
  CheckCircle2,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CardDetailTab } from "@/components/card-detail/CardDetailShell";
import LiveForecastDataStatus from "@/components/LiveForecastDataStatus";
import type {
  ExternalCardSignal,
  ExternalMarketMode,
} from "@/lib/external-signal-radar";
import { formatCurrency } from "@/lib/format";

export type CardDetailResearchStatus = "idle" | "loading" | "success" | "error";

export interface CardDetailResearchResult {
  url: string;
  title: string;
  description?: string | null;
  domain: string;
  category: string;
  reason?: string | null;
}

export interface BuildCardDetailSignalTabsProps {
  signal: ExternalCardSignal | null;
  loading?: boolean;
  marketMode: ExternalMarketMode;
  selectedGradeLabel?: string | null;
  researchResults?: readonly CardDetailResearchResult[];
  researchStatus?: CardDetailResearchStatus;
  researchError?: string | null;
  researchPresentation?: "inline" | "dialog";
  onResearch: () => void;
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

function normalizeGradeLabel(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/[^A-Z0-9.]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function getUnsupportedGradeSelection(
  signal: ExternalCardSignal | null,
  marketMode: ExternalMarketMode,
  selectedGradeLabel: string | null | undefined
): { selected: string; modeled: string } | null {
  if (marketMode !== "graded" || !selectedGradeLabel) return null;
  const modeledGrade = signal?.marketIntelligence?.graded.label;
  if (!modeledGrade) return null;

  const selected = normalizeGradeLabel(selectedGradeLabel);
  const modeled = normalizeGradeLabel(modeledGrade);
  if (!selected || !modeled) return null;
  if (selected === modeled || selected.includes(modeled) || modeled.includes(selected)) return null;
  return { selected: selectedGradeLabel, modeled: modeledGrade };
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

function SignalState({
  kind,
  title,
  copy,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  copy: string;
}) {
  const Icon = kind === "loading" ? Loader2 : kind === "error" ? ShieldAlert : Sparkles;
  return (
    <div
      className={cx(
        "flex min-h-44 flex-col items-center justify-center rounded-2xl border px-6 text-center",
        kind === "error"
          ? "border-rose-300/14 bg-rose-400/[0.035]"
          : "border-dashed border-white/10 bg-black/14"
      )}
      data-card-detail-signal-state={kind}
    >
      <Icon
        className={cx(
          "h-6 w-6",
          kind === "loading" ? "animate-spin text-violet-200/72" : "text-white/28"
        )}
      />
      <h3 className="mt-3 text-sm font-bold text-white/76">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-white/42">{copy}</p>
    </div>
  );
}

function buildForecastPanel(
  signal: ExternalCardSignal | null,
  loading: boolean,
  marketMode: ExternalMarketMode,
  selectedGradeLabel: string | null | undefined
) {
  if (loading && !signal) {
    return (
      <div data-card-detail-signal-panel="forecast">
        <DetailSurface eyebrow="Base scenario" title="Forecast targets">
          <SignalState
            kind="loading"
            title="Building the forecast"
            copy="Checking prices, scarcity and demand."
          />
        </DetailSurface>
      </div>
    );
  }

  if (!signal) {
    return (
      <div data-card-detail-signal-panel="forecast">
        <DetailSurface eyebrow="Base scenario" title="Forecast targets">
          <SignalState
            kind="empty"
            title="No reliable forecast yet"
            copy="More market and scarcity data is needed for this printing."
          />
        </DetailSurface>
      </div>
    );
  }

  const unsupportedGrade = getUnsupportedGradeSelection(signal, marketMode, selectedGradeLabel);
  if (unsupportedGrade) {
    return (
      <div data-card-detail-signal-panel="forecast">
        <DetailSurface eyebrow="Base scenario" title="Forecast targets">
          <SignalState
            kind="empty"
            title={`No ${unsupportedGrade.selected} forecast yet`}
            copy={`The current graded model covers ${unsupportedGrade.modeled}. Choose Raw or ${unsupportedGrade.modeled} for a supported projection.`}
          />
        </DetailSurface>
      </div>
    );
  }

  const market = signal?.marketIntelligence;
  const effectiveMode = marketMode === "graded" && market?.graded.available ? "graded" : "raw";
  const scenario = effectiveMode === "graded" ? market?.gradedScenario : market?.rawScenario;
  const displayPrice =
    scenario?.currentPrice ??
    (effectiveMode === "graded" ? market?.graded.currentPrice : signal?.currentPrice) ??
    null;

  return (
    <div
      className="card-detail-section-grid"
      data-columns="2"
      data-card-detail-signal-panel="forecast"
    >
      <DetailSurface
        eyebrow="Base scenario"
        title="Forecast targets"
        copy={
          scenario?.outlook === "flat"
            ? "Prices are expected to stay near current levels. Ranges widen with uncertainty over time."
            : "A directional model, not a guaranteed price target."
        }
      >
        {scenario ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {scenario.points.map((point) => {
              const flatOutlook = scenario.outlook === "flat";
              const changePct =
                displayPrice != null && displayPrice > 0
                  ? ((point.base - displayPrice) / displayPrice) * 100
                  : null;
              const direction = getForecastDirection(undefined, changePct);
              return (
                <div
                  key={point.days}
                  className={cx("rounded-2xl border p-4", forecastTone(direction))}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.1em] opacity-55">
                    {point.days} days
                  </p>
                  <p className="mt-2 text-xl font-extrabold tabular-nums text-white/90">
                    {flatOutlook ? "≈ " : ""}
                    {formatCurrency(point.base, scenario.currency)}
                  </p>
                  <p className={cx("mt-1 text-sm font-bold", flatOutlook ? "text-white/44" : "tabular-nums")}>
                    {flatOutlook ? "No clear direction" : signedPercent(changePct)}
                  </p>
                  <p className="mt-3 text-xs text-white/38">
                    Range {formatCurrency(point.low, scenario.currency)}–
                    {formatCurrency(point.high, scenario.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <SignalState
            kind="empty"
            title="No reliable scenario yet"
            copy="Not enough evidence for reliable price targets."
          />
        )}
      </DetailSurface>

      <DetailSurface
        eyebrow="Live model validation"
        title="Past prediction results"
        copy="Results are measured after each prediction period ends."
      >
        <LiveForecastDataStatus forecast={signal.forecast} className="mb-3" />
        {!signal.forecast?.tracking ? (
          <div className="overflow-hidden rounded-2xl border border-white/8">
            {FORECAST_TARGETS.map((target) => {
              const summary = signal?.forecast?.targets[target.key];
              const interval = summary?.status === "calibrated" ? summary.interval : null;
              return (
                <div
                  key={target.key}
                  className="grid min-h-16 grid-cols-[0.55fr_0.8fr_1.35fr] items-center gap-3 border-b border-white/7 px-4 text-sm last:border-b-0"
                >
                  <strong className="text-white/82">{target.label}</strong>
                  <span className="text-white/46">{target.horizon}</span>
                  <span className="text-right font-semibold text-cyan-100/68">
                    {interval && summary
                      ? `${Math.round(interval.estimate * 100)}% · ${summary.hits}/${summary.samples} hits`
                      : (summary?.samples ?? 0) > 0
                        ? `${summary?.hits ?? 0} correct · ${Math.max(0, (summary?.samples ?? 0) - (summary?.hits ?? 0))} missed`
                        : "Tracking starts after the next scan"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </DetailSurface>
    </div>
  );
}

function buildAnalysisPanel(
  signal: ExternalCardSignal | null,
  loading: boolean,
  marketMode: ExternalMarketMode,
  selectedGradeLabel: string | null | undefined
) {
  const market = signal?.marketIntelligence;
  const unsupportedGrade = getUnsupportedGradeSelection(signal, marketMode, selectedGradeLabel);
  const effectiveMode =
    marketMode === "graded" && market?.graded.available && !unsupportedGrade ? "graded" : "raw";
  const confluence = market
    ? effectiveMode === "graded"
      ? market.gradedConfluence ?? market.confluence
      : market.rawConfluence ?? market.confluence
    : undefined;

  if (loading && !signal) {
    return (
      <div data-card-detail-signal-panel="analysis">
        <DetailSurface eyebrow="Signal analysis" title="Connecting the evidence">
          <SignalState
            kind="loading"
            title="Building the analysis"
            copy="Checking supply, collector demand and grading."
          />
        </DetailSurface>
      </div>
    );
  }

  if (!market) {
    return (
      <div data-card-detail-signal-panel="analysis">
        <DetailSurface eyebrow="Signal analysis" title="Analysis unavailable">
          <SignalState
            kind="empty"
            title="Not enough market evidence"
            copy="More data is needed on scarcity, sealed supply and graded demand."
          />
        </DetailSurface>
      </div>
    );
  }

  const drivers = (confluence?.drivers ?? signal?.reasons ?? []).slice(0, 6);
  return (
    <div
      className="card-detail-section-grid"
      data-columns="3"
      data-card-detail-signal-panel="analysis"
    >
      <DetailSurface eyebrow="Supply & access" title="Sealed and scarcity">
        <InfoGrid
          items={[
            ["Set lifecycle", market.sealed.lifecycleLabel ?? "Learning"],
            [
              "OOP likelihood",
              market.sealed.lifecycleOopProbability == null
                ? "--"
                : `${market.sealed.lifecycleOopProbability}%`,
            ],
            ["Sealed pressure", `${market.sealed.pressureLabel} · ${market.sealed.pressureScore}/100`],
            [
              "Cheapest pack",
              market.sealed.packPrice == null
                ? "--"
                : formatCurrency(market.sealed.packPrice, "EUR"),
            ],
            ["Scarcity", `${market.scarcity.label} · ${market.scarcity.score}/100`],
            ["Pull odds", market.scarcity.pullOdds ?? "Unknown"],
          ]}
        />
      </DetailSurface>

      <DetailSurface
        eyebrow="Demand quality"
        title="Collector and grading"
        copy={
          unsupportedGrade
            ? `${unsupportedGrade.selected} is selected; Radar currently models ${unsupportedGrade.modeled}. Raw confluence remains visible below.`
            : undefined
        }
      >
        <InfoGrid
          items={[
            ["Confluence", `${confluence?.label ?? "--"} · ${confluence?.score ?? "--"}/100`],
            ["Graded model", market.graded.label ?? "Not available"],
            [
              "Artist demand",
              market.scarcity.artistDemandScore == null
                ? "--"
                : `${market.scarcity.artistDemandScore}/100`,
            ],
            ["Collector demand", `${market.scarcity.collectorDemandScore}/100`],
            ["Grading supply", market.graded.supplyLabel],
            [
              "PSA 10 market",
              market.graded.psa10Price == null
                ? "--"
                : formatCurrency(market.graded.psa10Price, market.graded.currency),
            ],
            [
              "Gem rate",
              market.graded.gemRatePct == null
                ? "--"
                : `${market.graded.gemRatePct.toFixed(1)}%`,
            ],
          ]}
        />
      </DetailSurface>

      <DetailSurface eyebrow="Investment thesis" title="Active drivers">
        {drivers.length ? (
          <div className="space-y-3">
            {drivers.map((driver) => (
              <div
                key={driver}
                className="flex gap-3 rounded-2xl border border-white/8 bg-black/16 p-4"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-200/72" />
                <p className="text-sm font-semibold leading-5 text-white/66">{driver}</p>
              </div>
            ))}
          </div>
        ) : (
          <SignalState
            kind="empty"
            title="No confirmed drivers"
            copy="Market data does not yet support a clear price driver."
          />
        )}
      </DetailSurface>
    </div>
  );
}

function buildEvidencePanel({
  signal,
  loading,
  researchResults,
  researchStatus,
  researchError,
  researchPresentation,
  onResearch,
}: {
  signal: ExternalCardSignal | null;
  loading: boolean;
  researchResults: readonly CardDetailResearchResult[];
  researchStatus: CardDetailResearchStatus;
  researchError: string | null;
  researchPresentation: "inline" | "dialog";
  onResearch: () => void;
}) {
  const evidence = signal?.evidence ?? [];
  const catalysts = signal?.catalysts ?? [];
  const isResearching = researchStatus === "loading";
  const catalystUrls = new Set(catalysts.map((catalyst) => catalyst.sourceUrl));
  const visibleResearchResults = researchResults.filter((result, index, results) => {
    if (catalystUrls.has(result.url)) return false;
    return results.findIndex((candidate) => candidate.url === result.url) === index;
  });
  const showInlineResearch = researchPresentation === "inline";

  return (
    <div
      className="card-detail-section-grid"
      data-columns="2"
      data-card-detail-signal-panel="evidence"
    >
      <DetailSurface
        eyebrow="Source evidence"
        title="Tournament evidence"
        copy={signal?.horizon ?? "Deck usage and tournament sources for this printing."}
      >
        {loading && !signal ? (
          <SignalState
            kind="loading"
            title="Checking external evidence"
            copy="Matching sources to this printing."
          />
        ) : evidence.length ? (
          <div className="space-y-3">
            {evidence.map((item) => (
              <a
                key={`${item.deckUrl}:${item.deckName}`}
                href={item.deckUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/8 bg-black/16 px-4 py-3 transition hover:border-violet-300/22"
              >
                <span className="truncate text-sm font-bold text-white/74">{item.deckName}</span>
                <span className="text-sm font-bold text-violet-200/72">
                  {item.inclusionPercent.toFixed(0)}%
                </span>
                <span className="text-xs text-white/38">
                  {item.deckSharePercent.toFixed(1)}% meta share
                </span>
                <span className="text-right text-xs text-white/38">inclusion</span>
              </a>
            ))}
          </div>
        ) : (
          <SignalState
            kind="empty"
            title="No tournament sources yet"
            copy="This profile uses market, sealed and collector data."
          />
        )}
      </DetailSurface>

      <DetailSurface eyebrow="Daily scan" title="News and research">
        <button
          type="button"
          onClick={onResearch}
          disabled={isResearching}
          data-card-detail-research
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-500/[0.12] px-4 text-sm font-bold text-violet-50/90 transition hover:border-violet-200/34 hover:bg-violet-500/[0.2] disabled:cursor-wait disabled:opacity-60"
        >
          {isResearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {isResearching
            ? "Researching..."
            : researchResults.length
              ? "Refresh research"
              : "Research this card"}
        </button>

        {showInlineResearch && researchStatus === "error" ? (
          <div className="mt-4">
            <SignalState
              kind="error"
              title="Research failed"
              copy={researchError ?? "Try again when the external research service is available."}
            />
          </div>
        ) : null}

        {catalysts.length ? (
          <div className="mt-4 space-y-3">
            {catalysts.slice(0, 4).map((catalyst) => (
              <a
                key={catalyst.id}
                href={catalyst.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-white/8 bg-black/16 p-4 transition hover:border-violet-300/22"
              >
                <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.08em] text-white/36">
                  <span>{catalyst.kind}</span>
                  <span
                    className={
                      catalyst.direction === "negative"
                        ? "text-rose-200/70"
                        : catalyst.direction === "positive"
                          ? "text-emerald-200/70"
                          : "text-white/42"
                    }
                  >
                    {catalyst.direction}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold leading-5 text-white/74">
                  {catalyst.headline}
                </p>
                <p className="mt-1 text-sm leading-5 text-white/40">
                  {catalyst.explanation}
                </p>
              </a>
            ))}
          </div>
        ) : null}

        {showInlineResearch && visibleResearchResults.length ? (
          <div className="mt-4 space-y-3">
            {visibleResearchResults.slice(0, 5).map((result, index) => (
              <a
                key={`${result.url}:${index}`}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-white/8 bg-black/16 p-4 transition hover:border-violet-300/22"
              >
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white/36">
                  <span>{result.category}</span>
                  <span className="ml-auto text-violet-200/58">{result.domain}</span>
                </div>
                <p className="mt-2 text-sm font-bold leading-5 text-white/74">{result.title}</p>
                {result.reason ? (
                  <p className="mt-1 text-xs font-semibold leading-5 text-violet-100/62">
                    {result.reason}
                  </p>
                ) : null}
                {result.description ? (
                  <p className="mt-1 line-clamp-3 text-sm leading-5 text-white/40">
                    {result.description}
                  </p>
                ) : null}
              </a>
            ))}
          </div>
        ) : null}

        {!isResearching &&
        (!showInlineResearch || researchStatus !== "error") &&
        catalysts.length === 0 &&
        (showInlineResearch
          ? visibleResearchResults.length === 0
          : researchResults.length === 0) ? (
          <div className="mt-4 flex gap-3 rounded-2xl border border-white/8 bg-black/16 p-4">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/28" />
            <p className="text-sm leading-5 text-white/42">
              No recent news or research sources found.
            </p>
          </div>
        ) : null}
      </DetailSurface>
    </div>
  );
}

export function buildCardDetailSignalTabs({
  signal,
  loading = false,
  marketMode,
  selectedGradeLabel,
  researchResults = [],
  researchStatus = "idle",
  researchError = null,
  researchPresentation = "inline",
  onResearch,
}: BuildCardDetailSignalTabsProps): CardDetailTab[] {
  return [
    {
      id: "forecast",
      label: "Forecast",
      content: buildForecastPanel(signal, loading, marketMode, selectedGradeLabel),
    },
    {
      id: "analysis",
      label: "Analysis",
      content: buildAnalysisPanel(signal, loading, marketMode, selectedGradeLabel),
    },
    {
      id: "evidence",
      label: "Evidence",
      content: buildEvidencePanel({
        signal,
        loading,
        researchResults,
        researchStatus,
        researchError,
        researchPresentation,
        onResearch,
      }),
    },
  ];
}
