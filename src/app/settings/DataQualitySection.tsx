"use client";

import { useState } from "react";
import Link from "next/link";
import type { DataQualityItem } from "@/lib/data-quality";

interface DataQualityMetric {
  key: string;
  label: string;
  shortLabel: string;
  value: number;
  total?: number;
  hint: string;
  priority: "high" | "medium" | "low";
}

interface DataQualitySectionProps {
  cards: {
    total: number;
    missingImages: number;
    missingSourceUrls: number;
    missingPrices: number;
    knownUnavailable: number;
    missingRarity: number;
    duplicateCandidates: number;
    stalePrices: number;
    emptyHistory: number;
  };
  sealed: {
    total: number;
    missingImages: number;
    missingSourceUrls: number;
    missingPrices: number;
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPercent(value: number): string {
  if (value >= 99.95) return "100%";
  if (value >= 10) return `${value.toFixed(0)}%`;
  return `${value.toFixed(1)}%`;
}

function formatIssueRate(value: number, total?: number): string | null {
  if (!total) return null;
  const rate = (value / total) * 100;
  if (rate === 0) return "0%";
  if (rate < 0.1) return "<0.1%";
  return formatPercent(rate);
}

function getCoverage(metrics: DataQualityMetric[]): number {
  const scopedMetrics = metrics.filter(
    (metric) => metric.total != null && metric.total > 0
  );
  const possibleChecks = scopedMetrics.reduce(
    (total, metric) => total + (metric.total ?? 0),
    0
  );
  if (possibleChecks === 0) return 100;

  const openChecks = scopedMetrics.reduce((total, metric) => {
    const cappedValue = Math.min(metric.value, metric.total ?? metric.value);
    return total + cappedValue;
  }, 0);

  return Math.max(0, ((possibleChecks - openChecks) / possibleChecks) * 100);
}

function getCoverageTone(coverage: number): string {
  if (coverage >= 98) return "text-emerald-700 dark:text-emerald-300";
  if (coverage >= 90) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

function getSignalTone(metric: DataQualityMetric): string {
  if (metric.value === 0) return "text-emerald-700 dark:text-emerald-300";

  const rate = metric.total ? metric.value / metric.total : metric.value > 0 ? 1 : 0;
  if (metric.priority === "high" && rate >= 0.01) {
    return "text-rose-700 dark:text-rose-300";
  }
  if (rate >= 0.05 || metric.value >= 100) return "text-rose-700 dark:text-rose-300";
  return "text-amber-700 dark:text-amber-300";
}

function priorityWeight(priority: DataQualityMetric["priority"]): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function getEpisodeHref(item: DataQualityItem): string {
  const base =
    item.game === "one-piece"
      ? `/one-piece/expansions/${encodeURIComponent(item.episodeId)}`
      : `/expansions/${encodeURIComponent(item.episodeId)}`;
  return item.kind === "sealed" ? `${base}?tab=sealed` : base;
}

function SummaryTile({
  label,
  value,
  hint,
  title,
  toneClass = "text-gray-950 dark:text-white",
}: {
  label: string;
  value: string;
  hint: string;
  title?: string;
  toneClass?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-black/6 bg-black/[0.02] px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 whitespace-nowrap text-sm font-bold leading-tight tabular-nums ${toneClass}`}
        title={title ?? value}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-white/45" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function SignalPill({
  metric,
  selected,
  onSelect,
}: {
  metric: DataQualityMetric;
  selected: boolean;
  onSelect: (metric: DataQualityMetric) => void;
}) {
  const rate = formatIssueRate(metric.value, metric.total);

  return (
    <button
      type="button"
      onClick={() => onSelect(metric)}
      className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected
          ? "border-sky-400/50 bg-sky-400/[0.08]"
          : "border-black/6 hover:border-black/15 dark:border-white/8 dark:hover:border-white/20"
      }`}
      title={`${metric.label}: ${formatCount(metric.value)}. ${metric.hint} Click to inspect.`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {metric.shortLabel}
        </p>
        {rate ? <span className="shrink-0 text-[10px] text-gray-400">{rate}</span> : null}
      </div>
      <p className={`mt-1 whitespace-nowrap text-sm font-bold tabular-nums ${getSignalTone(metric)}`}>
        {formatCount(metric.value)}
      </p>
    </button>
  );
}

function QualityRow({
  label,
  total,
  coverage,
  metrics,
  gridClass,
  selectedKey,
  onSelect,
}: {
  label: string;
  total: number;
  coverage: number;
  metrics: DataQualityMetric[];
  gridClass: string;
  selectedKey: string | null;
  onSelect: (metric: DataQualityMetric) => void;
}) {
  const openSignals = metrics.reduce((sum, metric) => sum + metric.value, 0);

  return (
    <div className="min-w-0 rounded-xl border border-black/6 bg-black/[0.015] p-3 dark:border-white/8 dark:bg-white/[0.025]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
          <p className="text-[11px] text-gray-500 dark:text-white/45">
            {formatCount(total)} tracked / {formatCount(openSignals)} open signals
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className={`text-sm font-bold tabular-nums ${getCoverageTone(coverage)}`}>
            {formatPercent(coverage)}
          </p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400">coverage</p>
        </div>
      </div>
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${gridClass}`}>
        {metrics.map((metric) => (
          <SignalPill
            key={metric.key}
            metric={metric}
            selected={selectedKey === metric.key}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function IssueDetailPanel({
  metric,
  items,
  loading,
  error,
  onClose,
}: {
  metric: DataQualityMetric;
  items: DataQualityItem[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{metric.label}</p>
          <p className="text-[11px] text-gray-500 dark:text-white/45">{metric.hint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-white"
        >
          Close
        </button>
      </div>

      {loading && <p className="py-3 text-sm text-gray-400">Loading affected items...</p>}
      {!loading && error && <p className="py-3 text-sm text-rose-500 dark:text-rose-300">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="py-3 text-sm text-emerald-700 dark:text-emerald-300">
          No affected items. This signal is clean.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <ul className="max-h-72 divide-y divide-black/5 overflow-y-auto dark:divide-white/8">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">
                    {item.name}
                    {item.detail ? (
                      <span className="ml-1.5 text-xs text-gray-400">{item.detail}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-gray-500 dark:text-white/45">
                    {item.episodeName}
                  </p>
                </div>
                <Link
                  href={getEpisodeHref(item)}
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-sky-600 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
                >
                  Open set
                </Link>
              </li>
            ))}
          </ul>
          {metric.value > items.length && (
            <p className="mt-2 text-[11px] text-gray-400">
              Showing first {formatCount(items.length)} of {formatCount(metric.value)} affected items.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function DataQualitySection({ cards, sealed }: DataQualitySectionProps) {
  const [selectedMetric, setSelectedMetric] = useState<DataQualityMetric | null>(null);
  const [detailItems, setDetailItems] = useState<DataQualityItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function selectMetric(metric: DataQualityMetric) {
    if (selectedMetric?.key === metric.key) {
      setSelectedMetric(null);
      return;
    }

    setSelectedMetric(metric);
    setDetailItems([]);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/admin/data-quality?issue=${encodeURIComponent(metric.key)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        items?: DataQualityItem[];
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.items) {
        throw new Error(payload.error ?? "Could not load affected items");
      }
      setDetailItems(payload.items);
    } catch (caught) {
      setDetailError(
        caught instanceof Error ? caught.message : "Could not load affected items"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  const cardMetrics: DataQualityMetric[] = [
    {
      key: "card-source",
      label: "Missing source URLs",
      shortLabel: "Source",
      value: cards.missingSourceUrls,
      total: cards.total,
      hint: "Cards without a TCGGO source.",
      priority: "high",
    },
    {
      key: "card-prices",
      label: "Missing CardMarket EN/NM",
      shortLabel: "No price",
      value: cards.missingPrices,
      total: cards.total,
      hint: "Released Pokémon cards without a valid English Near Mint CardMarket quote. Confirmed no-listing and upcoming cards are excluded.",
      priority: "high",
    },
    {
      key: "card-stale-prices",
      label: "Stale prices",
      shortLabel: "Stale",
      value: cards.stalePrices,
      total: cards.total,
      hint: "Cards whose price source has not been checked in 14+ days.",
      priority: "medium",
    },
    {
      key: "card-empty-history",
      label: "Empty price history",
      shortLabel: "History",
      value: cards.emptyHistory,
      total: cards.total,
      hint: "Cards with only a single price snapshot, so no trend can be drawn.",
      priority: "medium",
    },
    {
      key: "card-images",
      label: "Missing images",
      shortLabel: "Images",
      value: cards.missingImages,
      total: cards.total,
      hint: "Cards without an image URL.",
      priority: "medium",
    },
    {
      key: "card-rarity",
      label: "Missing rarity",
      shortLabel: "Rarity",
      value: cards.missingRarity,
      total: cards.total,
      hint: "Cards without rarity metadata.",
      priority: "medium",
    },
    {
      key: "card-duplicates",
      label: "True duplicates",
      shortLabel: "Dupes",
      value: cards.duplicateCandidates,
      hint: "Extra rows sharing game, set, number, name AND source URL. Variants (alt arts, parallels) are not counted.",
      priority: "low",
    },
  ];
  const knownUnavailableMetric: DataQualityMetric = {
    key: "card-price-unavailable",
    label: "Source unpriced (TCGgo)",
    shortLabel: "Unpriced @ source",
    value: cards.knownUnavailable,
    hint: "TCGgo has no price for these cards. Upstream limitation; excluded from the quality score.",
    priority: "low",
  };
  const sealedMetrics: DataQualityMetric[] = [
    {
      key: "sealed-source",
      label: "Missing source URLs",
      shortLabel: "Source",
      value: sealed.missingSourceUrls,
      total: sealed.total,
      hint: "Sealed products without a TCGGO source.",
      priority: "high",
    },
    {
      key: "sealed-prices",
      label: "No price data",
      shortLabel: "No price",
      value: sealed.missingPrices,
      total: sealed.total,
      hint: "Sealed products without a current EU market quote; averages alone do not count as a price.",
      priority: "high",
    },
    {
      key: "sealed-images",
      label: "Missing images",
      shortLabel: "Images",
      value: sealed.missingImages,
      total: sealed.total,
      hint: "Sealed products without an image URL.",
      priority: "medium",
    },
  ];

  const allMetrics = [...cardMetrics, ...sealedMetrics];
  const totalIssues = allMetrics.reduce((total, metric) => total + metric.value, 0);
  const totalRecords = cards.total + sealed.total;
  const overallCoverage = getCoverage(allMetrics);
  const topSignal =
    allMetrics
      .filter((metric) => metric.value > 0)
      .sort((a, b) => {
        const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        return b.value - a.value;
      })[0] ?? null;

  return (
    <section className="settings-panel glass min-w-0 rounded-2xl p-5 shadow-md shadow-black/5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Data Quality Center
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Coverage checks for source links, prices, media, and metadata. Click a signal to see the affected items.
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            totalIssues === 0
              ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200"
              : "border-amber-400/25 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200"
          }`}
        >
          {totalIssues === 0 ? "Clean" : `${formatCount(totalIssues)} signals`}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <SummaryTile
          label="Quality score"
          value={formatPercent(overallCoverage)}
          hint="source, price, image, metadata"
          toneClass={getCoverageTone(overallCoverage)}
        />
        <SummaryTile
          label="Open signals"
          value={formatCount(totalIssues)}
          hint="duplicates included separately"
          toneClass={totalIssues === 0 ? getCoverageTone(100) : "text-amber-700 dark:text-amber-300"}
        />
        <SummaryTile
          label="Tracked records"
          value={formatCount(totalRecords)}
          hint={`${formatCount(cards.total)} cards / ${formatCount(sealed.total)} sealed`}
        />
        <SummaryTile
          label="Top fix"
          value={topSignal ? topSignal.label : "None"}
          hint={
            topSignal
              ? `${formatCount(topSignal.value)} affected${
                  formatIssueRate(topSignal.value, topSignal.total)
                    ? ` / ${formatIssueRate(topSignal.value, topSignal.total)}`
                    : ""
                }`
              : "No open data quality signals"
          }
          title={topSignal ? `${topSignal.label}: ${topSignal.hint}` : "No open data quality signals"}
        />
      </div>

      <div className="grid gap-2">
        <QualityRow
          label="Cards"
          total={cards.total}
          coverage={getCoverage(cardMetrics)}
          metrics={cardMetrics}
          gridClass="xl:grid-cols-7"
          selectedKey={selectedMetric?.key ?? null}
          onSelect={selectMetric}
        />
        {cards.knownUnavailable > 0 && (
          <p className="px-1 text-[11px] text-gray-500 dark:text-white/40">
            {formatCount(cards.knownUnavailable)} cards have no price at the source (TCGgo) —
            upstream limitation, excluded from the signals above.{" "}
            <button
              type="button"
              onClick={() => selectMetric(knownUnavailableMetric)}
              className="font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
            >
              {selectedMetric?.key === knownUnavailableMetric.key ? "Hide list" : "View list"}
            </button>
          </p>
        )}
        <QualityRow
          label="Sealed"
          total={sealed.total}
          coverage={getCoverage(sealedMetrics)}
          metrics={sealedMetrics}
          gridClass="xl:grid-cols-5"
          selectedKey={selectedMetric?.key ?? null}
          onSelect={selectMetric}
        />
        {selectedMetric && (
          <IssueDetailPanel
            metric={selectedMetric}
            items={detailItems}
            loading={detailLoading}
            error={detailError}
            onClose={() => setSelectedMetric(null)}
          />
        )}
      </div>
    </section>
  );
}
