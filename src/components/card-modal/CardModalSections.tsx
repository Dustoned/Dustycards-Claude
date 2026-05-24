"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BadgeEuro,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe2,
  LineChart,
  MoreHorizontal,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import CollectionWantButton from "@/components/CollectionWantButton";
import type { CardSize } from "@/components/SettingsProvider";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import {
  BGS_SUBGRADE_KEYS,
  formatBgsSubgradeName,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
  type SupportedGradedSlabCompany,
} from "@/lib/graded-slabs";
import {
  type CardEbaySoldGradedPriceHistorySeries,
  type CardGradedPriceHistorySeries,
  type CardMarketHistorySeriesKey,
} from "@/lib/price-history";
import {
  formatPriceRefreshedAt,
  formatRefreshCountdown,
  getPriceRefreshInfo,
} from "@/lib/price-refresh";
import type { CurrencyCode } from "@/lib/format";
import { getExpansionHref } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import { normalizeRarityLabel } from "@/lib/rarity";
import { formatCurrency } from "./utils";
import type { ModalCardCollectionItem, ModalCardData } from "./types";

const GradedSlabPreview = dynamic(() => import("@/components/GradedSlabPreview"), {
  ssr: false,
  loading: () => null,
});
const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  ssr: false,
  loading: () => null,
});

const ACTIVE_SEGMENT_CLASS =
  "border-violet-400/40 bg-violet-600 text-white";

type PriceStatusTone = "good" | "warning" | "danger" | "neutral";

interface HistoryPointView {
  date: string;
  label: string;
  value: number | null;
}

interface RecentPricePoint {
  label: string;
  value: number;
}

interface PriceHistoryStatusPoint {
  date: string;
  label: string;
}

const SHORT_STATUS_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function parseDateMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatShortStatusDate(value: string | null | undefined): string | null {
  const timestamp = parseDateMillis(value);
  if (timestamp == null) return null;
  return SHORT_STATUS_DATE_FORMATTER.format(timestamp);
}

function formatRelativeStatusAge(value: string | null | undefined, now: number): string | null {
  const timestamp = parseDateMillis(value);
  if (timestamp == null) return null;

  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

function getPriceHistoryPoints(card: ModalCardData): PriceHistoryStatusPoint[] {
  return card.price_history
    .filter((point) =>
      [
        point.cm_market,
        point.cm_market_en,
        point.cm_market_de,
        point.cm_market_fr,
        point.cm_market_es,
        point.cm_market_it,
        point.cm_avg_7d,
        point.cm_avg_30d,
        point.tcp_market,
      ].some((value) => value != null)
    )
    .map((point) => ({
      date: point.date,
      label: point.label,
    }));
}

function getRecentPricePoints(card: ModalCardData, limit = 6): RecentPricePoint[] {
  return card.price_history
    .map((point) => ({
      label: point.label,
      value:
        point.cm_market_en ??
        point.cm_market ??
        point.cm_market_de ??
        point.cm_market_fr ??
        point.cm_market_es ??
        point.cm_market_it ??
        point.tcp_market ??
        null,
    }))
    .filter((point): point is RecentPricePoint => point.value != null)
    .slice(-limit)
    .reverse();
}

function PreviousPriceRows({
  points,
  emptyClassName = "rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/42",
}: {
  points: readonly RecentPricePoint[];
  emptyClassName?: string;
}) {
  if (points.length === 0) {
    return <p className={emptyClassName}>No previous prices yet.</p>;
  }

  return (
    <div className="grid gap-0">
      {points.map((point) => (
        <div
          key={`${point.label}-${point.value}`}
          className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-2.5 last:border-b-0"
        >
          <span className="truncate text-xs text-white/52">{point.label}</span>
          <span className="text-sm font-semibold tabular-nums text-white/84">
            {formatCurrency(point.value, "EUR")}
          </span>
        </div>
      ))}
    </div>
  );
}

function getCurrentPriceCoverage(card: ModalCardData) {
  const cardMarketValues = [
    card.price?.cm_en_lowest_nm,
    card.price?.cm_de_lowest_nm,
    card.price?.cm_fr_lowest_nm,
    card.price?.cm_es_lowest_nm,
    card.price?.cm_it_lowest_nm,
    card.price?.cm_jp_lowest_nm,
  ];
  const tcgPlayerValues = [card.price?.tcp_market, card.price?.tcp_mid, card.price?.tcp_low];
  const cardMarketCount = cardMarketValues.filter((value) => value != null).length;
  const tcgPlayerCount = tcgPlayerValues.filter((value) => value != null).length;

  return {
    currentCount: cardMarketCount + tcgPlayerCount,
    totalCount: cardMarketValues.length + tcgPlayerValues.length,
    cardMarketCount,
    cardMarketTotal: cardMarketValues.length,
    tcgPlayerCount,
    tcgPlayerTotal: tcgPlayerValues.length,
  };
}

function getSourceStatusSummary(card: ModalCardData, checkedLabel: string | null): {
  value: string;
  hint: string;
  tone: PriceStatusTone;
} {
  if (!card.tcggo_url) {
    return {
      value: "No source",
      hint: "Missing TCGGO source link",
      tone: "danger",
    };
  }

  if (card.price_source_status === "unavailable") {
    return {
      value: "Unavailable",
      hint: checkedLabel ? `Checked ${checkedLabel}` : "Source returned no price",
      tone: "warning",
    };
  }

  if (card.price_fetched_at) {
    return {
      value: "Live",
      hint: checkedLabel ? `Source checked ${checkedLabel}` : "Source price available",
      tone: "good",
    };
  }

  if (card.price_source_checked_at) {
    return {
      value: "Checked",
      hint: `No price after ${checkedLabel ?? "last check"}`,
      tone: "warning",
    };
  }

  return {
    value: "Pending",
    hint: "Waiting for first source check",
    tone: "neutral",
  };
}

function getPriceStatusToneClass(tone: PriceStatusTone): string {
  if (tone === "good") return "text-emerald-300";
  if (tone === "warning") return "text-amber-300";
  if (tone === "danger") return "text-rose-300";
  return "text-white/72";
}

function PriceStatusInlineItem({
  value,
  title,
  tone = "neutral",
}: {
  value: string;
  title: string;
  tone?: PriceStatusTone;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1.5 text-[11px] font-semibold leading-none tabular-nums max-[640px]:px-2 max-[640px]:py-1 max-[640px]:text-[10px] ${getPriceStatusToneClass(
        tone
      )}`}
      title={title}
    >
      {value}
    </span>
  );
}

function CardPriceStatusLine({
  card,
  className = "",
}: {
  card: ModalCardData;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const refreshInfo = useMemo(
    () => getPriceRefreshInfo(card.rarity, card.price_fetched_at, now),
    [card.price_fetched_at, card.rarity, now]
  );
  const latestPriceLabel = formatPriceRefreshedAt(card.price_fetched_at);
  const latestPriceAge = formatRelativeStatusAge(card.price_fetched_at, now);
  const sourceCheckedLabel = formatShortStatusDate(card.price_source_checked_at);
  const sourceStatus = getSourceStatusSummary(card, sourceCheckedLabel);
  const historyPoints = getPriceHistoryPoints(card);
  const firstHistoryLabel = formatShortStatusDate(historyPoints[0]?.date ?? null);
  const latestHistoryLabel = formatShortStatusDate(
    historyPoints[historyPoints.length - 1]?.date ?? null
  );
  const coverage = getCurrentPriceCoverage(card);
  const refreshValue = !refreshInfo.hasFetchedAt
    ? "Pending"
    : !refreshInfo.autoRefreshEnabled
      ? "Manual"
      : refreshInfo.due
        ? "Due now"
        : formatRefreshCountdown(refreshInfo.remainingMs);
  const updatedValue = latestPriceAge ? `Updated ${latestPriceAge}` : "No price yet";
  const nextUpdateValue = !refreshInfo.hasFetchedAt
    ? "Update pending"
    : !refreshInfo.autoRefreshEnabled
      ? "Manual updates"
      : refreshInfo.due
        ? "Update due"
        : `Next update in ${formatRefreshCountdown(refreshInfo.remainingMs).replace(/\s+\d+s$/, "")}`;
  const refreshHint = !refreshInfo.hasFetchedAt
    ? refreshInfo.tier === "base"
      ? "First base sync"
      : "First price sync"
    : refreshInfo.autoRefreshEnabled
      ? refreshInfo.cadenceLabel
      : "Base price captured";
  const refreshTone: PriceStatusTone = refreshInfo.due
    ? refreshInfo.hasFetchedAt
      ? "warning"
      : "neutral"
    : "good";
  const latestPriceTone: PriceStatusTone = card.price_fetched_at
    ? card.price_source_status === "unavailable"
      ? "warning"
      : "good"
    : "warning";
  const coverageTone: PriceStatusTone =
    coverage.currentCount === 0
      ? "warning"
      : coverage.currentCount >= Math.ceil(coverage.totalCount / 2)
        ? "good"
        : "neutral";
  const historyHint =
    historyPoints.length > 0 && firstHistoryLabel && latestHistoryLabel
      ? `${firstHistoryLabel} - ${latestHistoryLabel}`
      : "No history yet";

  return (
    <div className={`min-w-0 border-b border-white/8 pb-2 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-none text-white/28 max-[640px]:gap-1 max-[640px]:text-[10px]">
        <PriceStatusInlineItem
          value={sourceStatus.value}
          title={`Source: ${sourceStatus.value}. ${sourceStatus.hint}`}
          tone={sourceStatus.tone}
        />
        <PriceStatusInlineItem
          value={updatedValue}
          title={`Latest price: ${latestPriceAge ?? "No price"}. ${
            latestPriceLabel ?? sourceCheckedLabel ?? "No source check yet"
          }`}
          tone={latestPriceTone}
        />
        <PriceStatusInlineItem
          value={nextUpdateValue}
          title={`Refresh: ${refreshValue}. ${refreshHint}`}
          tone={refreshTone}
        />
        <PriceStatusInlineItem
          value={`${coverage.currentCount} of ${coverage.totalCount} sources`}
          title={`Data: ${coverage.currentCount}/${coverage.totalCount} sources. CM ${coverage.cardMarketCount}/${coverage.cardMarketTotal} / TCG ${coverage.tcgPlayerCount}/${coverage.tcgPlayerTotal}`}
          tone={coverageTone}
        />
        <PriceStatusInlineItem
          value={historyPoints.length > 0 ? `${historyPoints.length} history points` : "No history yet"}
          title={`History: ${historyPoints.length > 0 ? `${historyPoints.length} points` : "None"}. ${historyHint}`}
          tone={historyPoints.length > 0 ? "neutral" : "warning"}
        />
      </div>
    </div>
  );
}

function parseHistoryPointTimestamp(point: HistoryPointView): number | null {
  const raw = point.date.trim();
  if (!raw) return null;

  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`).getTime()
    : new Date(raw).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function getRecentHistoryAverage(points: HistoryPointView[], days: number): number | null {
  const validPoints = points
    .map((point) => ({
      timestamp: parseHistoryPointTimestamp(point),
      value: point.value,
    }))
    .filter(
      (point): point is { timestamp: number; value: number } =>
        point.timestamp != null && point.value != null && Number.isFinite(point.value)
    );

  if (validPoints.length === 0) return null;

  const latestTimestamp = Math.max(...validPoints.map((point) => point.timestamp));
  const cutoffTimestamp = latestTimestamp - days * 24 * 60 * 60 * 1000;
  const recentValues = validPoints
    .filter((point) => point.timestamp >= cutoffTimestamp)
    .map((point) => point.value);

  if (recentValues.length === 0) return null;

  const total = recentValues.reduce((sum, value) => sum + value, 0);
  return Number((total / recentValues.length).toFixed(2));
}

function MetaPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`card-modal-meta-pill inline-flex min-h-0 items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-medium leading-none text-white/68 max-[640px]:px-2 max-[640px]:py-0.5 max-[640px]:text-[10px] ${className}`}
    >
      {children}
    </span>
  );
}

function CompactDetailLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onClick}
      className="group inline-flex max-w-full items-center gap-1 rounded-full border border-sky-300/16 bg-sky-300/[0.06] px-2.5 py-1 text-xs font-semibold text-sky-100 transition-colors hover:border-sky-200/32 hover:bg-sky-300/[0.1] hover:text-white"
    >
      <span className="min-w-0 break-words">{children}</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-sky-100/64 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
    </Link>
  );
}

function buildCollectionCard(card: ModalCardData) {
  return {
    id: card.id,
    name: card.name,
    image_url: card.image_url,
    episode: {
      id: card.episode_id,
      name: card.episode_name,
      code: card.episode_code,
    },
  };
}

type GradedPriceSource = "cardmarket" | "ebay";

interface GradedPriceDisplayRow {
  key: string;
  label: string;
  sourceType: GradedPriceSource;
  sourceLabel: string;
  value: number;
  currency: CurrencyCode;
  chartCurrency: CurrencyCode;
  chartCurrentValue: number | null;
  chartPoints: HistoryPointView[];
  hint: string | null;
  secondaryValue: string | null;
  savedMatch: boolean;
  sourceRank: number;
}

function normalizeGradedLookupValue(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/[^A-Z0-9.]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function normalizeGradedGradeToken(value: string | null | undefined): string {
  const normalized = normalizeGradingGradeLabel(value);
  if (!normalized) return "";

  const numericGrade = Number(normalized.replace(/[^\d.]/g, ""));
  if (/^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(numericGrade)) {
    return String(numericGrade);
  }

  return normalizeGradedLookupValue(normalized);
}

function getSavedGrading(collectionItem: ModalCardData["collection_item"] | null | undefined) {
  const company = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const grade = normalizeGradingGradeLabel(collectionItem?.grading_grade);

  return company && grade ? { company, grade } : null;
}

function buildSavedGradeCandidates(
  collectionItem: ModalCardData["collection_item"] | null | undefined
): string[] {
  const savedGrading = getSavedGrading(collectionItem);
  if (!savedGrading) return [];

  const grade = normalizeGradedGradeToken(savedGrading.grade);
  if (!grade) return [];

  const candidates = new Set<string>([
    normalizeGradedLookupValue(`${savedGrading.company} ${grade}`),
  ]);

  if (/^\d+(?:\.\d+)?$/.test(grade)) {
    candidates.add(normalizeGradedLookupValue(`${savedGrading.company} ${Number(grade)}`));
    if (!grade.includes(".")) {
      candidates.add(normalizeGradedLookupValue(`${savedGrading.company} ${grade}.0`));
    }
  }

  return [...candidates].filter(Boolean);
}

function gradedLabelMatchesSavedGrade(label: string, savedGradeCandidates: string[]): boolean {
  if (savedGradeCandidates.length === 0) return false;

  const normalizedLabel = normalizeGradedLookupValue(label);
  const compactLabel = normalizedLabel.replace(/\s+/g, "");

  return savedGradeCandidates.some((candidate) => {
    const compactCandidate = candidate.replace(/\s+/g, "");
    return (
      normalizedLabel === candidate ||
      compactLabel === compactCandidate ||
      normalizedLabel.startsWith(`${candidate} `) ||
      normalizedLabel.startsWith(`${candidate} -`) ||
      normalizedLabel.startsWith(`${candidate} /`) ||
      normalizedLabel.startsWith(`${candidate} (`)
    );
  });
}

function ebaySoldRowMatchesSavedGrade(
  price: NonNullable<ModalCardData["ebay_sold_graded_prices"]>[number],
  collectionItem: ModalCardData["collection_item"] | null | undefined,
  savedGradeCandidates: string[]
): boolean {
  const savedGrading = getSavedGrading(collectionItem);
  const structuredMatch =
    savedGrading &&
    normalizeGradedLookupValue(price.company) === normalizeGradedLookupValue(savedGrading.company) &&
    normalizeGradedGradeToken(price.grade) === normalizeGradedGradeToken(savedGrading.grade);

  return Boolean(structuredMatch) || gradedLabelMatchesSavedGrade(price.label, savedGradeCandidates);
}

function getGradedLabelNumericGrade(label: string): number {
  const matches = normalizeGradedLookupValue(label).match(/\b\d+(?:\.\d+)?\b/g);
  if (!matches || matches.length === 0) return -1;

  const lastMatch = matches[matches.length - 1];
  const grade = Number(lastMatch);
  return Number.isFinite(grade) ? grade : -1;
}

function sortGradedRows(rows: GradedPriceDisplayRow[]): GradedPriceDisplayRow[] {
  return [...rows].sort((a, b) => {
    if (a.savedMatch !== b.savedMatch) return a.savedMatch ? -1 : 1;
    const gradeDelta = getGradedLabelNumericGrade(b.label) - getGradedLabelNumericGrade(a.label);
    if (gradeDelta !== 0) return gradeDelta;
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    return a.label.localeCompare(b.label);
  });
}

function isPsa10GradedRow(row: GradedPriceDisplayRow): boolean {
  const compactLabel = normalizeGradedLookupValue(row.label).replace(/\s+/g, "");
  return compactLabel.startsWith("PSA") && getGradedLabelNumericGrade(row.label) === 10;
}

function getPreferredGradedRow(rows: GradedPriceDisplayRow[]): GradedPriceDisplayRow | null {
  return rows.find((row) => row.savedMatch) ?? rows.find(isPsa10GradedRow) ?? rows[0] ?? null;
}

function GradedSlabSelectControl({
  rows,
  selectedRow,
  onChange,
  className = "",
}: {
  rows: GradedPriceDisplayRow[];
  selectedRow: GradedPriceDisplayRow | null;
  onChange: (label: string) => void;
  className?: string;
}) {
  const label = selectedRow?.label ?? "Graded";
  const shellClass = `relative inline-flex h-8 max-w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 text-[11px] font-semibold leading-none text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors max-[640px]:h-7 max-[640px]:px-2 max-[640px]:text-[10px] ${className}`;

  if (rows.length <= 1) {
    return (
      <span className={shellClass}>
        <span className="whitespace-nowrap">{label}</span>
      </span>
    );
  }

  return (
    <label className={`${shellClass} cursor-pointer pr-7 hover:border-white/18 hover:bg-white/[0.055] hover:text-white`}>
      <span className="whitespace-nowrap">{label}</span>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-white/48" />
      <select
        aria-label="Select graded slab"
        value={selectedRow?.label ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {!selectedRow && (
          <option value="" disabled>
            Graded
          </option>
        )}
        {rows.map((row) => (
          <option key={row.key} value={row.label} className="bg-[#111214] text-white">
            {row.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function getGradedPriceRows(
  card: ModalCardData,
  collectionItem: ModalCardData["collection_item"] | null | undefined
): GradedPriceDisplayRow[] {
  const savedGradeCandidates = buildSavedGradeCandidates(collectionItem);
  const cardMarketHistoryByLabel = new Map(
    (card.graded_price_history ?? []).map((series) => [
      normalizeGradedLookupValue(series.label),
      series,
    ])
  );
  const ebaySoldHistoryByLabel = new Map(
    (card.ebay_sold_graded_price_history ?? []).map((series) => [
      normalizeGradedLookupValue(series.label),
      series,
    ])
  );
  const cardMarketRows: GradedPriceDisplayRow[] = (card.graded_prices ?? []).map(
    (price, index) => {
      const history = cardMarketHistoryByLabel.get(normalizeGradedLookupValue(price.label));

      return {
        key: `cardmarket-${price.label}-${index}`,
        label: price.label,
        sourceType: "cardmarket",
        sourceLabel: "CardMarket",
        value: price.price,
        currency: "EUR",
        chartCurrency: "EUR",
        chartCurrentValue: price.price,
        chartPoints: history?.points ?? [],
        hint: "Graded ask",
        secondaryValue: null,
        savedMatch: gradedLabelMatchesSavedGrade(price.label, savedGradeCandidates),
        sourceRank: 0,
      };
    }
  );
  const cardMarketCurrentLabels = new Set(
    cardMarketRows.map((row) => normalizeGradedLookupValue(row.label))
  );
  const cardMarketHistoryRows: GradedPriceDisplayRow[] = (
    card.graded_price_history ?? []
  ).flatMap((series, index) => {
    const normalizedLabel = normalizeGradedLookupValue(series.label);
    if (!normalizedLabel || cardMarketCurrentLabels.has(normalizedLabel)) return [];

    const latestValue = getLatestHistoryValue(series.points);
    if (latestValue == null) return [];

    const latestPoint = [...series.points]
      .reverse()
      .find((point) => point.value != null);

    return [
      {
        key: `cardmarket-history-${series.label}-${index}`,
        label: series.label,
        sourceType: "cardmarket",
        sourceLabel: "CardMarket history",
        value: latestValue,
        currency: "EUR",
        chartCurrency: "EUR",
        chartCurrentValue: latestValue,
        chartPoints: series.points,
        hint: latestPoint ? `Latest ${latestPoint.label}` : "Latest saved point",
        secondaryValue: null,
        savedMatch: gradedLabelMatchesSavedGrade(series.label, savedGradeCandidates),
        sourceRank: 2,
      },
    ];
  });
  const ebaySoldRows: GradedPriceDisplayRow[] = (card.ebay_sold_graded_prices ?? []).flatMap(
    (price, index) => {
      const rawCurrency = price.currency.toUpperCase();
      const displayCurrency: CurrencyCode | null =
        price.median_price_eur != null
          ? "EUR"
          : rawCurrency === "EUR" || rawCurrency === "USD"
            ? rawCurrency
            : null;
      const displayValue =
        price.median_price_eur ??
        (displayCurrency ? price.median_price : null);

      if (!displayCurrency || displayValue == null) return [];
      const history = ebaySoldHistoryByLabel.get(normalizeGradedLookupValue(price.label));
      const chartCurrency: CurrencyCode = history?.currency ?? displayCurrency;
      const chartCurrentValue =
        history && chartCurrency === history.currency
          ? getLatestHistoryValue(history.points) ?? displayValue
          : rawCurrency === chartCurrency
            ? price.median_price
            : displayValue;

      return [
        {
          key: `ebay-sold-${price.label}-${index}`,
          label: price.label,
          sourceType: "ebay",
          sourceLabel: "eBay sold",
          value: displayValue,
          currency: displayCurrency,
          chartCurrency,
          chartCurrentValue,
          chartPoints: history?.points ?? [],
          hint: [
            price.sample_size != null ? `${price.sample_size} sold` : null,
            price.fetched_at ? `Updated ${formatShortStatusDate(price.fetched_at)}` : null,
          ]
            .filter(Boolean)
            .join(" / ") || null,
          secondaryValue:
            rawCurrency === "USD" && price.median_price_eur != null
              ? formatCurrency(price.median_price, "USD")
              : null,
          savedMatch: ebaySoldRowMatchesSavedGrade(price, collectionItem, savedGradeCandidates),
          sourceRank: 1,
        },
      ];
    }
  );
  const ebaySoldCurrentLabels = new Set(
    ebaySoldRows.map((row) => normalizeGradedLookupValue(row.label))
  );
  const ebaySoldHistoryRows: GradedPriceDisplayRow[] = (
    card.ebay_sold_graded_price_history ?? []
  ).flatMap((series, index) => {
    const normalizedLabel = normalizeGradedLookupValue(series.label);
    if (!normalizedLabel || ebaySoldCurrentLabels.has(normalizedLabel)) return [];

    const latestValue = getLatestHistoryValue(series.points);
    if (latestValue == null) return [];

    const latestPoint = [...series.points]
      .reverse()
      .find((point) => point.value != null);

    return [
      {
        key: `ebay-sold-history-${series.label}-${index}`,
        label: series.label,
        sourceType: "ebay",
        sourceLabel: "eBay sold history",
        value: latestValue,
        currency: series.currency,
        chartCurrency: series.currency,
        chartCurrentValue: latestValue,
        chartPoints: series.points,
        hint: [
          series.latest_sample_size != null ? `${series.latest_sample_size} sold` : null,
          series.latest_fetched_at
            ? `Updated ${formatShortStatusDate(series.latest_fetched_at)}`
            : latestPoint
              ? `Latest ${latestPoint.label}`
              : null,
        ]
          .filter(Boolean)
          .join(" / ") || null,
        secondaryValue: null,
        savedMatch: gradedLabelMatchesSavedGrade(series.label, savedGradeCandidates),
        sourceRank: 3,
      },
    ];
  });

  return sortGradedRows([
    ...cardMarketRows,
    ...ebaySoldRows,
    ...cardMarketHistoryRows,
    ...ebaySoldHistoryRows,
  ]);
}

function getBgsSubgradeEntries(collectionItem: ModalCardData["collection_item"] | null | undefined) {
  const subgrades = collectionItem?.grading_subgrades ?? null;
  if (!subgrades) return [];

  return BGS_SUBGRADE_KEYS.flatMap((key) => {
    const value = subgrades[key];
    return value ? [{ key, label: formatBgsSubgradeName(key), value }] : [];
  });
}

function hasGradedDetailContent(
  card: ModalCardData,
  collectionItem: ModalCardData["collection_item"] | null | undefined,
  gradingCompanyLabel: string | null,
  gradingGradeLabel: string | null
): boolean {
  return Boolean(
    (gradingCompanyLabel && gradingGradeLabel) ||
      getBgsSubgradeEntries(collectionItem).length > 0 ||
      (card.graded_prices?.length ?? 0) > 0 ||
      (card.ebay_sold_graded_prices?.length ?? 0) > 0 ||
      (card.graded_price_history?.length ?? 0) > 0 ||
      (card.ebay_sold_graded_price_history?.length ?? 0) > 0
  );
}

function GradedPricingPanel({
  card,
  collectionItem,
  gradingCompanyLabel,
  gradingGradeLabel,
  compact = false,
  graphFirst = false,
  rangeScopePoints,
  rangeStorageKey,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  compact?: boolean;
  graphFirst?: boolean;
  rangeScopePoints?: HistoryPointView[];
  rangeStorageKey?: string;
}) {
  const rows = getGradedPriceRows(card, collectionItem);
  const cardMarketRows = rows.filter((row) => row.sourceType === "cardmarket");
  const ebayRows = rows.filter((row) => row.sourceType === "ebay");
  const fallbackSource: GradedPriceSource =
    getPreferredGradedRow(rows)?.sourceType ??
    (cardMarketRows.length > 0 ? "cardmarket" : "ebay");
  const [selectedSource, setSelectedSource] = useState<{
    cardId: string;
    source: GradedPriceSource;
  }>(() => ({ cardId: card.id, source: fallbackSource }));
  const selectedSourceForCard =
    selectedSource.cardId === card.id ? selectedSource.source : fallbackSource;
  const effectiveSource =
    selectedSourceForCard === "cardmarket" && cardMarketRows.length > 0
      ? "cardmarket"
      : selectedSourceForCard === "ebay" && ebayRows.length > 0
        ? "ebay"
        : fallbackSource;
  const sourceRows = effectiveSource === "cardmarket" ? cardMarketRows : ebayRows;
  const fallbackSlabLabel = getPreferredGradedRow(sourceRows)?.label ?? "";
  const [selectedSlab, setSelectedSlab] = useState<{
    cardId: string;
    source: GradedPriceSource;
    label: string;
  }>(() => ({ cardId: card.id, source: fallbackSource, label: fallbackSlabLabel }));
  const selectedSlabLabel =
    selectedSlab.cardId === card.id && selectedSlab.source === effectiveSource
      ? selectedSlab.label
      : "";
  const selectedSlabRow =
    sourceRows.find((row) => row.label === selectedSlabLabel) ??
    getPreferredGradedRow(sourceRows);
  const chartRow = selectedSlabRow;
  const subgradeEntries = getBgsSubgradeEntries(collectionItem);
  const savedGradeLabel =
    gradingCompanyLabel && gradingGradeLabel ? `${gradingCompanyLabel} ${gradingGradeLabel}` : null;
  const showSourceSwitch = cardMarketRows.length > 0 && ebayRows.length > 0;
  const sourceSummary =
    effectiveSource === "cardmarket"
      ? "CardMarket graded"
      : "eBay sold graded";
  const chartCurrency = chartRow?.chartCurrency ?? chartRow?.currency ?? "EUR";
  const sourceToggleClass =
    "grid h-8 min-w-[12rem] grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-[640px]:h-7 max-[640px]:min-w-[9.25rem]";
  const sourceToggleButtonClass =
    "min-w-0 rounded-[10px] px-2 text-center text-[11px] font-semibold leading-none transition-colors max-[640px]:px-1.5 max-[640px]:text-[10px]";
  const sourceToggleActiveClass =
    "bg-white/[0.13] text-white shadow-[0_1px_10px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.07)]";
  const sourceSwitchControl = showSourceSwitch ? (
    <div
      className={`card-modal-source-toggle ${
        graphFirst ? "sm:min-w-[12rem]" : "min-w-[12rem]"
      } ${sourceToggleClass}`}
    >
      {[
        { key: "cardmarket" as const, label: "CardMarket", available: cardMarketRows.length > 0 },
        { key: "ebay" as const, label: "eBay", available: ebayRows.length > 0 },
      ].map((source) => (
        <button
          key={source.key}
          type="button"
          disabled={!source.available}
          onClick={() => {
            if (!source.available) return;
            setSelectedSource({ cardId: card.id, source: source.key });
            setSelectedSlab({ cardId: card.id, source: source.key, label: "" });
          }}
          aria-pressed={effectiveSource === source.key && source.available}
          className={`${sourceToggleButtonClass} disabled:cursor-not-allowed disabled:opacity-35 ${
            effectiveSource === source.key && source.available
              ? sourceToggleActiveClass
              : "text-white/52 hover:bg-white/[0.06] hover:text-white/82"
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  ) : null;
  const slabSelectControl = (
    <GradedSlabSelectControl
      rows={sourceRows}
      selectedRow={selectedSlabRow}
      onChange={(label) =>
        setSelectedSlab({
          cardId: card.id,
          source: effectiveSource,
          label,
        })
      }
      className="max-w-[10rem] max-[640px]:max-w-[8.5rem]"
    />
  );
  const graphFirstHeaderLeadingAccessory =
    graphFirst && (sourceSwitchControl || slabSelectControl) ? (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {sourceSwitchControl}
        {slabSelectControl}
      </div>
    ) : null;

  if (
    !hasGradedDetailContent(card, collectionItem, gradingCompanyLabel, gradingGradeLabel)
  ) {
    return null;
  }

  return (
    <section className="min-w-0 self-start">
      {!graphFirst && (
        <div className="flex min-h-[4.25rem] min-w-0 flex-wrap items-center justify-between gap-2 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/70">
              <Award className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Graded</p>
              <p className="truncate text-xs font-medium text-white/46">
                {savedGradeLabel ?? sourceSummary}
              </p>
            </div>
          </div>

          {sourceSwitchControl}
        </div>
      )}

      {subgradeEntries.length > 0 && !compact && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {subgradeEntries.map((subgrade) => (
            <div
              key={subgrade.key}
              className="rounded-xl border border-white/8 bg-black/18 px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase text-white/36">
                {subgrade.label}
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-white">{subgrade.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`${graphFirst ? "mt-0" : "mt-3"} min-w-0`}>
        <PriceHistoryPanel
          title="Price History"
          currency={chartCurrency}
          points={chartRow?.chartPoints ?? []}
          currentValue={chartRow?.chartCurrentValue ?? chartRow?.value ?? null}
          headerLeadingAccessory={graphFirstHeaderLeadingAccessory}
          headerAccessory={graphFirst ? null : slabSelectControl}
          tone="dark"
          layout="hero"
          rangeScopePoints={rangeScopePoints}
          rangeStorageKey={rangeStorageKey ?? `card-graded-${card.id}-${effectiveSource}-${chartRow?.label ?? "none"}`}
          emptyText="No graded history yet"
        />
      </div>
    </section>
  );
}

export function CardModalDesktopActionGroup({
  card,
  collectionItem,
  isBusy,
  refreshing,
  syncingHistory,
  canManageCardPrices,
  removingCollectionItem,
  onRefresh,
  onSyncHistory,
  onRemoveCollectionItem,
  onAddedToCollection,
  onClose,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  canManageCardPrices: boolean;
  removingCollectionItem: boolean;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onRemoveCollectionItem: () => void;
  onAddedToCollection?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const collectionCard = buildCollectionCard(card);
  const locationLabel = collectionItem
    ? collectionItem.for_sale
      ? "For sale"
      : collectionItem.binder_name
      ? `In ${collectionItem.binder_name}`
      : "Loose single"
    : null;
  const iconButtonClass =
    "!inline-flex !h-10 !w-10 !items-center !justify-center !rounded-xl !border-violet-300/24 !bg-violet-600/22 !p-0 !text-violet-50 !transition-colors hover:!border-violet-200/42 hover:!bg-violet-500/32 hover:!text-white";
  const utilityButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] p-0 text-white/70 transition-colors hover:border-white/18 hover:bg-white/[0.085] hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" aria-label="Card actions">
      <CollectionAddCardButton
        card={collectionCard}
        mode="button"
        theme="dark"
        label={collectionItem ? "Add copy" : "Add to Collection"}
        className="!min-h-10 !rounded-xl !border-violet-300/24 !bg-violet-500/22 !px-4 !text-sm !font-bold !text-white hover:!border-violet-200/38 hover:!bg-violet-500/30"
        onAdded={onAddedToCollection}
      />

      <CollectionWantButton
        card={collectionCard}
        mode="button"
        theme="dark"
        label="Want"
        initialWanted={Boolean(card.want_item)}
        wantItemId={card.want_item?.id ?? null}
        className="!min-h-10 !rounded-xl !border-violet-300/24 !bg-violet-600/20 !px-3 !text-sm !font-bold !text-violet-50 hover:!border-violet-200/38 hover:!bg-violet-500/30"
      />

      {collectionItem && (
        <>
          <CollectionEditCardButton
            card={collectionCard}
            item={collectionItem}
            mode="icon"
            theme="dark"
            label="Edit"
            className={iconButtonClass}
            onSaved={onClose}
          />
          <button
            type="button"
            onClick={onRemoveCollectionItem}
            disabled={isBusy || removingCollectionItem}
            className={`${utilityButtonClass} border-rose-300/18 bg-rose-500/[0.09] text-rose-100 hover:border-rose-200/32 hover:bg-rose-500/18 active:bg-rose-500/22`}
            aria-label={
              removingCollectionItem
                ? "Removing this saved copy"
                : collectionItem.for_sale
                  ? "Remove this saved copy from For Sale"
                  : "Remove this saved copy from collection"
            }
            title={locationLabel ? `Remove this copy: ${locationLabel}` : "Remove this saved copy"}
          >
            <Trash2 className={`h-4 w-4 ${removingCollectionItem ? "animate-pulse" : ""}`} />
          </button>
        </>
      )}

      {canManageCardPrices && (
        <>
          <button
            type="button"
            onClick={onSyncHistory}
            disabled={isBusy}
            className={utilityButtonClass}
            aria-label={syncingHistory ? "Syncing price history" : "Sync price history"}
            title={syncingHistory ? "Syncing..." : "Sync history"}
          >
            <LineChart className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isBusy}
            className={utilityButtonClass}
            aria-label={refreshing ? "Refreshing prices" : "Refresh prices"}
            title={refreshing ? "Refreshing..." : "Refresh"}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </>
      )}
    </div>
  );
}

export function CardModalPreview({
  card,
  mediaWidth,
  imageSize,
  previewAspectClass,
  showGradedPreview,
  gradingCompanyLabel,
  gradingGradeLabel,
  gradedTileSize,
  onOpenThreeD,
}: {
  card: ModalCardData;
  mediaWidth: string;
  imageSize: string;
  previewAspectClass: string;
  showGradedPreview: boolean;
  gradingCompanyLabel: SupportedGradedSlabCompany | null;
  gradingGradeLabel: string | null;
  gradedTileSize: CardSize;
  onOpenThreeD: () => void;
}) {
  const previewFrameClass =
    "relative p-0";
  const previewButtonClass =
    showGradedPreview && gradingCompanyLabel && gradingGradeLabel
      ? `group relative ${previewAspectClass} w-full overflow-hidden rounded-[22px] border border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.3)] transition-all duration-200 hover:scale-[1.006] hover:border-white/16 hover:shadow-[0_18px_42px_rgba(0,0,0,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35`
      : getCardImageFrameClassName(
          card.image_url,
          `group relative ${previewAspectClass} w-full overflow-hidden rounded-[4.75%] border border-transparent bg-transparent p-0 shadow-[0_16px_40px_rgba(0,0,0,0.34)] transition-transform hover:scale-[1.006]`
        );

  return (
    <aside
      className="mx-auto flex h-full max-w-[min(20rem,78vw)] flex-col gap-3 sm:max-w-full sm:gap-4 max-[640px]:max-w-[min(20rem,78vw)] max-[640px]:gap-1.5 lg:mx-0"
      style={{ width: mediaWidth }}
    >
      <div className={previewFrameClass}>
        {card.image_url ? (
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onOpenThreeD();
            }}
            className={previewButtonClass}
            aria-label={`Open ${card.name} in 3D`}
          >
            {showGradedPreview && gradingCompanyLabel && gradingGradeLabel ? (
              <GradedSlabPreview
                company={gradingCompanyLabel}
                grade={gradingGradeLabel}
                name={card.name}
                episodeName={card.episode_name}
                episodeCode={card.episode_code}
                episodeSeries={card.episode_series}
                episodeReleaseDate={card.episode_release_date}
                cardNumber={card.card_number}
                bgsSubgrades={card.collection_item?.grading_subgrades ?? null}
                imageUrl={card.image_url}
                alt={card.name}
                className="absolute inset-0"
                sizes={imageSize}
                loading="eager"
                priority
                tileSize={gradedTileSize}
              />
            ) : (
              <Image
                src={getCachedImageUrl(card.image_url) ?? card.image_url}
                alt={card.name}
                fill
                className={getCardImageClassName(card.image_url, "rounded-[4.75%] object-fill")}
                sizes={imageSize}
                loading="eager"
                unoptimized
              />
            )}
          </button>
        ) : (
          <div
            className={`${previewAspectClass} flex w-full items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] text-white/30`}
          >
            ?
          </div>
        )}
      </div>

    </aside>
  );
}

function getFirstHistoryValue(points: HistoryPointView[]): number | null {
  for (const point of points) {
    if (point.value != null && Number.isFinite(point.value)) return point.value;
  }

  return null;
}

function formatSignedPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function MobileDetailIconButton({
  label,
  children,
  onClick,
  disabled = false,
  destructive = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-xl transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        destructive
          ? "border-rose-300/22 bg-rose-500/[0.12] text-rose-100 hover:border-rose-200/34 hover:bg-rose-500/20"
          : "border-white/12 bg-black/38 text-white/86 hover:border-white/24 hover:bg-white/[0.1]"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function MobileInfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-h-[4.75rem] min-w-0 items-start gap-2.5 rounded-2xl border border-white/10 bg-[#0b0b0d] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/68">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium leading-none text-white/42">{label}</p>
        <div className="mt-1 min-w-0 text-[13px] font-semibold leading-snug text-white/88">
          {value}
        </div>
      </div>
    </div>
  );
}

export function CardModalMobileShowcase({
  card,
  collectionItem,
  previewAspectClass,
  showGradedPreview,
  gradingCompanyLabel,
  gradingGradeLabel,
  gradedTileSize,
  cardMarketHistory,
  activeCardMarketCurrentValue,
  activeCardMarketSeriesLabel,
  storedCardMarketUrl,
  canManageCardPrices,
  isBusy,
  refreshing,
  syncingHistory,
  removingCollectionItem,
  onClose,
  onOpenThreeD,
  onOpenCardMarket,
  onRefresh,
  onSyncHistory,
  onRemoveCollectionItem,
  onAddedToCollection,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  previewAspectClass: string;
  showGradedPreview: boolean;
  gradingCompanyLabel: SupportedGradedSlabCompany | null;
  gradingGradeLabel: string | null;
  gradedTileSize: CardSize;
  cardMarketHistory: HistoryPointView[];
  activeCardMarketCurrentValue: number | null;
  activeCardMarketSeriesLabel: string;
  storedCardMarketUrl: string | null;
  canManageCardPrices: boolean;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  removingCollectionItem: boolean;
  onClose: () => void;
  onOpenThreeD: () => void;
  onOpenCardMarket: () => void;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onRemoveCollectionItem: () => void;
  onAddedToCollection?: () => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const collectionCard = buildCollectionCard(card);
  const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
  const metaPrefix = [card.episode_code, card.card_number ? `#${card.card_number}` : null]
    .filter(Boolean)
    .join(" ");
  const language = collectionItem?.language?.trim() || "English";
  const savedLabel = collectionItem?.for_sale ? "For sale" : collectionItem ? "Saved" : "Not saved";
  const conditionLabel =
    collectionItem?.condition ||
    (gradingCompanyLabel && gradingGradeLabel
      ? `${gradingCompanyLabel} ${gradingGradeLabel}`
      : "Near Mint");
  const showGradedTab = hasGradedDetailContent(
    card,
    collectionItem,
    gradingCompanyLabel,
    gradingGradeLabel
  );
  const pullOdds =
    card.pull_rate_info?.specific_pull_odds ?? card.pull_rate_info?.pull_rate_odds ?? "--";
  const overallSpend =
    collectionItem?.cost_basis_value ?? collectionItem?.purchase_price ?? null;
  const average7d =
    getRecentHistoryAverage(cardMarketHistory, 7) ?? card.price?.cm_en_avg_7d ?? null;
  const average30d =
    getRecentHistoryAverage(cardMarketHistory, 30) ?? card.price?.cm_en_avg_30d ?? null;
  const firstHistoryValue = getFirstHistoryValue(cardMarketHistory);
  const priceDeltaPercent =
    activeCardMarketCurrentValue != null &&
    firstHistoryValue != null &&
    firstHistoryValue !== 0
      ? ((activeCardMarketCurrentValue - firstHistoryValue) / Math.abs(firstHistoryValue)) * 100
      : null;
  const priceDeltaLabel = formatSignedPercent(priceDeltaPercent);
  const priceDeltaPositive = priceDeltaPercent == null || priceDeltaPercent >= 0;
  const recentPricePoints = getRecentPricePoints(card, 8);
  const mobileHistoryRangeScopePoints = [
    ...cardMarketHistory,
    ...(card.graded_price_history ?? []).flatMap((series) => series.points),
    ...(card.ebay_sold_graded_price_history ?? []).flatMap((series) => series.points),
  ];
  const tabs = [
    { key: "overview", label: "Info" },
    { key: "history", label: "Price" },
    ...(showGradedTab ? [{ key: "graded", label: "Graded" }] : []),
    { key: "previous-prices", label: "History" },
  ];
  const effectiveActiveTab = showGradedTab || activeTab !== "graded" ? activeTab : "overview";
  const showOverview = effectiveActiveTab === "overview";
  const showChart = effectiveActiveTab === "history";
  const showGraded = effectiveActiveTab === "graded";
  const showPreviousPrices = effectiveActiveTab === "previous-prices";
  const floatingButtonClass =
    "!h-11 !w-11 !rounded-full !border-white/12 !bg-black/38 !p-0 !text-white/86 !backdrop-blur-xl hover:!border-white/24 hover:!bg-white/[0.1]";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#050505] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(0.9rem+env(safe-area-inset-top))] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_24%,rgba(139,92,246,0.38),transparent_34%),radial-gradient(circle_at_30%_22%,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_52%)]" />

      <div className="relative z-20 flex items-center justify-between">
        <MobileDetailIconButton label="Back to collection" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </MobileDetailIconButton>

        <div className="relative flex items-center gap-2">
          <CollectionAddCardButton
            card={collectionCard}
            mode="icon"
            theme="dark"
            label={collectionItem ? "Add copy" : "Add"}
            className={floatingButtonClass}
            onAdded={onAddedToCollection}
          />
          <CollectionWantButton
            card={collectionCard}
            mode="icon"
            theme="dark"
            label="Want"
            initialWanted={Boolean(card.want_item)}
            wantItemId={card.want_item?.id ?? null}
            className={floatingButtonClass}
          />
          {collectionItem && (
            <CollectionEditCardButton
              card={collectionCard}
              item={collectionItem}
              mode="icon"
              theme="dark"
              label="Edit"
              className={floatingButtonClass}
              onSaved={onClose}
            />
          )}
          {collectionItem && !canManageCardPrices && (
            <MobileDetailIconButton
              label={collectionItem.for_sale ? "Remove from For Sale" : "Remove from collection"}
              onClick={onRemoveCollectionItem}
              disabled={isBusy || removingCollectionItem}
              destructive
            >
              <Trash2 className={`h-5 w-5 ${removingCollectionItem ? "animate-pulse" : ""}`} />
            </MobileDetailIconButton>
          )}
          {canManageCardPrices && (
            <MobileDetailIconButton
              label={moreOpen ? "Close more actions" : "More actions"}
              onClick={() => setMoreOpen((value) => !value)}
            >
              <MoreHorizontal className="h-5 w-5" />
            </MobileDetailIconButton>
          )}

          {moreOpen && canManageCardPrices && (
            <div className="absolute right-0 top-[3.25rem] z-40 min-w-52 overflow-hidden rounded-2xl border border-white/12 bg-[#0b0b0d]/94 p-1.5 text-sm font-semibold text-white shadow-[0_22px_70px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
              {collectionItem && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMoreOpen(false);
                    onRemoveCollectionItem();
                  }}
                  disabled={isBusy || removingCollectionItem}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-rose-100 transition-colors hover:bg-rose-500/12 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className={`h-4 w-4 ${removingCollectionItem ? "animate-pulse" : ""}`} />
                  Remove
                </button>
              )}
              {canManageCardPrices && (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMoreOpen(false);
                      onSyncHistory();
                    }}
                    disabled={isBusy}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-white/82 transition-colors hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LineChart className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`} />
                    History
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMoreOpen(false);
                      onRefresh();
                    }}
                    disabled={isBusy}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-white/82 transition-colors hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 mt-1 flex flex-col items-center">
        <div className="relative w-[min(58vw,18rem)] max-w-full min-[430px]:w-[min(55vw,18rem)]">
          <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-[radial-gradient(circle,rgba(168,85,247,0.34),rgba(16,185,129,0.12)_42%,transparent_70%)] blur-2xl" />
          {card.image_url ? (
            <button
              type="button"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenThreeD();
              }}
              className={
                showGradedPreview && gradingCompanyLabel && gradingGradeLabel
                  ? `relative ${previewAspectClass} w-full overflow-hidden rounded-[1.15rem] bg-transparent shadow-[0_28px_80px_rgba(0,0,0,0.52)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60`
                  : getCardImageFrameClassName(
                      card.image_url,
                      `relative ${previewAspectClass} w-full overflow-hidden rounded-[4.75%] bg-transparent shadow-[0_28px_80px_rgba(0,0,0,0.52)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60`
                    )
              }
              aria-label={`Open ${card.name} in 3D`}
            >
              {showGradedPreview && gradingCompanyLabel && gradingGradeLabel ? (
                <GradedSlabPreview
                  company={gradingCompanyLabel}
                  grade={gradingGradeLabel}
                  name={card.name}
                  episodeName={card.episode_name}
                  episodeCode={card.episode_code}
                  episodeSeries={card.episode_series}
                  episodeReleaseDate={card.episode_release_date}
                  cardNumber={card.card_number}
                  bgsSubgrades={card.collection_item?.grading_subgrades ?? null}
                  imageUrl={card.image_url}
                  alt={card.name}
                  className="absolute inset-0"
                  sizes="58vw"
                  loading="eager"
                  priority
                  tileSize={gradedTileSize}
                />
              ) : (
                <Image
                  src={getCachedImageUrl(card.image_url) ?? card.image_url}
                  alt={card.name}
                  fill
                  className={getCardImageClassName(card.image_url, "rounded-[4.75%] object-fill")}
                  sizes="58vw"
                  loading="eager"
                  priority
                  unoptimized
                />
              )}
            </button>
          ) : (
            <div className={`${previewAspectClass} flex w-full items-center justify-center rounded-[4.75%] border border-white/10 bg-white/[0.04] text-white/36`}>
              ?
            </div>
          )}
        </div>

      </div>

      <div className="relative z-10 mt-4">
        <div className="relative min-w-0">
          <span className="absolute right-0 top-0 shrink-0 rounded-full border border-violet-300/20 bg-violet-500/18 px-3 py-2 text-sm font-semibold text-violet-100 shadow-[0_14px_34px_rgba(109,40,217,0.18)]">
            {conditionLabel}
          </span>

          <div className="min-w-0">
            <h2 className="break-words pr-[7rem] text-[1.72rem] font-bold leading-[1.04] tracking-[-0.01em] text-white min-[390px]:text-[1.9rem]">
              {card.name}
            </h2>
            <p className="mt-1.5 text-[13px] font-medium leading-snug text-white/52 min-[390px]:text-[14px]">
              {metaPrefix || card.episode_name}
              {normalizedRarity && (
                <>
                  <span className="mx-1.5 text-white/28">·</span>
                  <span className="font-semibold text-fuchsia-200">{normalizedRarity}</span>
                </>
              )}
            </p>
            <p className="mt-1.5 flex items-center gap-3 text-[14px] font-semibold">
              <span className={collectionItem ? "text-emerald-300" : "text-white/42"}>
                {savedLabel}
              </span>
              <span className="text-white/46">{language}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] gap-2.5">
          <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[#0b0b0d] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <p className="max-w-full text-[1.42rem] font-bold leading-none tabular-nums text-white min-[390px]:text-[1.62rem]">
                {formatCurrency(activeCardMarketCurrentValue, "EUR")}
              </p>
              {priceDeltaLabel && (
                <p
                  className={`max-w-full text-[12px] font-semibold leading-none tabular-nums min-[390px]:text-[13px] ${
                    priceDeltaPositive ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {priceDeltaLabel}
                </p>
              )}
            </div>
            <p className="mt-2 truncate text-[12px] font-medium text-white/48">CardMarket</p>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-[#0b0b0d] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="flex items-center justify-between gap-1.5 border-b border-white/[0.07] pb-2">
              <p className="shrink-0 whitespace-nowrap text-[13px] font-medium text-white/46">
                7d avg
              </p>
              <p className="text-[15px] font-semibold tabular-nums text-white">
                {formatCurrency(average7d, "EUR")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-1.5 pt-2">
              <p className="shrink-0 whitespace-nowrap text-[13px] font-medium text-white/46">
                30d avg
              </p>
              <p className="text-[15px] font-semibold tabular-nums text-white">
                {formatCurrency(average30d, "EUR")}
              </p>
            </div>
          </div>
        </div>

        <nav
          className={`mt-5 grid min-w-0 ${
            showGradedTab ? "grid-cols-4" : "grid-cols-3"
          } gap-1 rounded-2xl border border-white/8 bg-black/22 p-1 text-[13px] font-bold text-white/48`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative min-h-10 min-w-0 rounded-xl px-2 transition-colors ${
                effectiveActiveTab === tab.key
                  ? "bg-violet-600 text-white"
                  : "hover:bg-white/[0.06] hover:text-white/78"
              }`}
            >
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </nav>

        {showOverview && (
          <div className="mt-3 rounded-[22px] border border-white/10 bg-[#09090a] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="grid grid-cols-2 gap-2">
              <MobileInfoRow
                icon={<Sparkles className="h-4 w-4" />}
                label="Set"
                value={
                  <Link
                    href={getExpansionHref(card.episode_id)}
                    prefetch={false}
                    onClick={onClose}
                    className="inline-flex max-w-full items-center gap-1 text-white transition-colors hover:text-violet-100"
                  >
                    <span className="line-clamp-2 min-w-0">{card.episode_name}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/34" />
                  </Link>
                }
              />
              <MobileInfoRow
                icon={<UserRound className="h-4 w-4" />}
                label="Artist"
                value={
                  card.artist ? (
                    <Link
                      href={`/illustrators/${encodeURIComponent(card.artist)}`}
                      prefetch={false}
                      onClick={onClose}
                      className="inline-flex max-w-full items-center gap-1 text-white transition-colors hover:text-violet-100"
                    >
                      <span className="line-clamp-2 min-w-0">{card.artist}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/34" />
                    </Link>
                  ) : (
                    "--"
                  )
                }
              />
              <MobileInfoRow
                icon={<BadgeEuro className="h-4 w-4" />}
                label="Pull odds"
                value={<span className="tabular-nums">{pullOdds}</span>}
              />
              <MobileInfoRow
                icon={<Star className="h-4 w-4" />}
                label="Rarity"
                value={normalizedRarity ?? "--"}
              />
              <MobileInfoRow
                icon={<ShoppingCart className="h-4 w-4" />}
                label="Overall spend"
                value={formatCurrency(overallSpend, "EUR")}
              />
              <MobileInfoRow
                icon={<Globe2 className="h-4 w-4" />}
                label="Language"
                value={language}
              />
            </div>
          </div>
        )}

        {showPreviousPrices && (
          <div className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Previous Prices</p>
                <p className="mt-1 text-xs font-medium text-white/42">Latest saved market points</p>
              </div>
              <span className="rounded-full border border-violet-300/18 bg-violet-500/[0.12] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-violet-100">
                History
              </span>
            </div>
            <div className="mt-3">
              <PreviousPriceRows
                points={recentPricePoints}
                emptyClassName="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-sm text-white/42"
              />
            </div>
          </div>
        )}

        {showGraded && (
          <div className="mt-3">
            <GradedPricingPanel
              card={card}
              collectionItem={collectionItem}
              gradingCompanyLabel={gradingCompanyLabel}
              gradingGradeLabel={gradingGradeLabel}
              compact
              graphFirst
              rangeScopePoints={mobileHistoryRangeScopePoints}
              rangeStorageKey={`card-mobile-${card.id}`}
            />
          </div>
        )}

        {showChart && (
          <div className="mt-3 rounded-[22px] border border-white/10 bg-[#09090a] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <PriceHistoryPanel
              title="Price History"
              currency="EUR"
              points={cardMarketHistory}
              currentValue={activeCardMarketCurrentValue}
              tone="dark"
              layout="hero"
              rangeScopePoints={mobileHistoryRangeScopePoints}
              rangeStorageKey={`card-mobile-${card.id}`}
              headerAccessory={
                <span className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-black/24 px-3 text-xs font-semibold text-white/76">
                  {activeCardMarketSeriesLabel}
                </span>
              }
            />
          </div>
        )}
      </div>

      <div className="relative z-10 mt-4 rounded-[22px] border border-white/12 bg-[#08080a]/98 p-2.5 shadow-[0_18px_42px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="grid grid-cols-[1.1fr_0.8fr_1fr] gap-2">
          <CollectionAddCardButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label={collectionItem ? "Add Copy" : "Add to Collection"}
            className="!min-h-12 !rounded-2xl !border-violet-300/35 !bg-violet-600/72 !px-2 !text-[13px] !font-bold !shadow-[0_16px_34px_rgba(109,40,217,0.28)]"
            onAdded={onAddedToCollection}
          />
          <CollectionWantButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label="Want"
            initialWanted={Boolean(card.want_item)}
            wantItemId={card.want_item?.id ?? null}
            className="!min-h-12 !rounded-2xl !border-violet-300/24 !bg-violet-600/22 !px-2 !text-[13px] !font-bold !text-violet-50 hover:!border-violet-200/38 hover:!bg-violet-500/30"
          />
          {storedCardMarketUrl ? (
            <a
              href={storedCardMarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.065] px-2 text-center text-[13px] font-bold text-white transition-colors hover:border-white/18 hover:bg-white/[0.1]"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>CardMarket</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={onOpenCardMarket}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.065] px-2 text-center text-[13px] font-bold text-white transition-colors hover:border-white/18 hover:bg-white/[0.1]"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>CardMarket</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type CardModalHeroVariant = "full" | "compact" | "details";

export function CardModalHeroSection({
  card,
  collectionItem,
  titleClass,
  metaClassName,
  detailStatClass,
  gradingCompanyLabel,
  gradingGradeLabel,
  refreshError,
  variant = "full",
  onClose,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  titleClass: string;
  metaClassName: string;
  detailStatClass: string;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  refreshError: string | null;
  variant?: CardModalHeroVariant;
  onClose: () => void;
}) {
  const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
  const typeLabel = [card.supertype, card.subtypes].filter(Boolean).join(" / ");
  const collectionTags = collectionItem?.tags ?? [];
  const collectionLanguage =
    collectionItem?.language && collectionItem.language.trim().length > 0
      ? collectionItem.language.trim()
      : null;
  const collectionLocationLabel = collectionItem
    ? collectionItem.binder_name
      ? `In ${collectionItem.binder_name}`
      : "Loose single"
    : null;
  const headerMeta = [
    card.episode_code ? card.episode_code : null,
    card.card_number ? `#${card.card_number}` : null,
  ].filter(Boolean);
  const headerMetaLabel = headerMeta.length > 0 ? headerMeta.join(" ") : null;
  const heroDetailStats = [
    {
      label: "Type",
      value: typeLabel || "--",
      wideMobile: false,
    },
    {
      label: "Set",
      value: (
        <CompactDetailLink href={getExpansionHref(card.episode_id)} onClick={onClose}>
          {card.episode_name}
        </CompactDetailLink>
      ),
      wideMobile: true,
    },
    {
      label: "Artist",
      value: card.artist ? (
        <CompactDetailLink
          href={`/illustrators/${encodeURIComponent(card.artist)}`}
          onClick={onClose}
        >
          {card.artist}
        </CompactDetailLink>
      ) : (
        "--"
      ),
      wideMobile: true,
    },
    ...(card.pull_rate_info
      ? [
          {
            label: "Pull Odds",
            value: (
              <div className="space-y-1">
                <p className="tabular-nums">
                  {card.pull_rate_info.specific_pull_odds ??
                    card.pull_rate_info.pull_rate_odds ??
                    "--"}
                </p>
                <p className="text-sm font-medium text-white/42 max-[640px]:text-[11px]">
                  {[
                    card.pull_rate_info.pull_rate_odds
                      ? `Rarity ${card.pull_rate_info.pull_rate_odds}`
                      : null,
                    card.pull_rate_info.psa_avg_gem_pct != null
                      ? `Gem ${(card.pull_rate_info.psa_avg_gem_pct * 100).toFixed(1)}%`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              </div>
            ),
            wideMobile: false,
          },
        ]
      : []),
  ];
  const collectionStats = [
    {
      label: "Location",
      value: collectionLocationLabel ?? "--",
      show: Boolean(collectionLocationLabel),
      wideMobile: true,
    },
    {
      label: collectionItem?.cost_basis_label ?? "Paid",
      value:
        collectionItem?.cost_basis_value != null
          ? formatCurrency(collectionItem.cost_basis_value, "EUR")
          : "--",
      show: collectionItem?.cost_basis_value != null,
      wideMobile: false,
    },
    {
      label: "Condition",
      value: collectionItem?.condition ?? "--",
      show: Boolean(collectionItem?.condition),
      wideMobile: false,
    },
  ];
  const visibleCollectionStats = collectionStats.filter((stat) => stat.show);
  const headerDetailStats = collectionItem
    ? [
        ...heroDetailStats.filter((stat) => stat.label !== "Type"),
        ...visibleCollectionStats.filter((stat) => stat.label !== "Condition"),
        ...heroDetailStats.filter((stat) => stat.label === "Type"),
        ...visibleCollectionStats.filter((stat) => stat.label === "Condition"),
      ]
    : heroDetailStats;
  const desktopDetailStats = headerDetailStats.filter(
    (stat) => stat.label !== "Set" && stat.label !== "Artist"
  );
  const showCollectionExtras = Boolean(
    collectionItem && (collectionTags.length > 0 || collectionItem.notes)
  );
  const hasDetailsPanelContent = desktopDetailStats.length > 0 || showCollectionExtras;
  const detailRows = (
    <>
      {desktopDetailStats.length > 0 && (
        <div className="grid border-y border-white/[0.08]">
          {desktopDetailStats.map((stat) => (
            <div
              key={stat.label}
              className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.07] py-2.5 last:border-b-0 2xl:grid-cols-[7.2rem_minmax(0,1fr)]"
            >
              <p className="text-sm font-medium text-white/42 2xl:text-[0.95rem]">
                {stat.label}
              </p>
              <div className="min-w-0 text-sm font-semibold leading-snug text-white/88 2xl:text-[0.95rem] [&_*]:max-w-full">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {collectionItem && (
        <>
          {collectionTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {collectionTags.map((tag) => (
                <MetaPill key={tag}>{tag}</MetaPill>
              ))}
            </div>
          )}

          {collectionItem.notes && (
            <div className={`mt-3 ${detailStatClass}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
                Notes
              </p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm text-white/72">
                {collectionItem.notes}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );

  if (variant === "details") {
    if (!hasDetailsPanelContent) return null;

    return (
      <section className="binder-panel min-w-0 rounded-[var(--ui-page-header-radius)] p-3.5 text-white sm:p-4">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/38">
              Details
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white/78">
              {card.episode_name}
            </p>
          </div>
        </div>
        {detailRows}
      </section>
    );
  }

  return (
    <section className="min-w-0 py-1 text-white">
      <div className="min-w-0">
        <div className="min-w-0">
          <h2 className={`${titleClass} !text-[2rem] font-bold leading-tight tracking-[-0.01em] text-white 2xl:!text-[2.35rem]`}>
            {card.name}
          </h2>

          <div
            className={`mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-white/48 ${metaClassName}`}
          >
            {headerMetaLabel && <span>{headerMetaLabel}</span>}
            {normalizedRarity && (
              <span className="rounded-full border border-violet-300/18 bg-violet-500/14 px-2.5 py-1 text-xs font-semibold text-violet-100">
                {normalizedRarity}
              </span>
            )}
            <span className={collectionItem ? "text-emerald-300" : "text-white/42"}>
              {collectionItem ? "Saved" : "Not saved"}
            </span>
            {collectionLanguage && <span>{collectionLanguage}</span>}
            {gradingCompanyLabel && gradingGradeLabel && (
              <span className="text-violet-200/80">
                {gradingCompanyLabel} {gradingGradeLabel}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <CompactDetailLink href={getExpansionHref(card.episode_id)} onClick={onClose}>
              {card.episode_name}
            </CompactDetailLink>
            {card.artist && (
              <CompactDetailLink
                href={`/illustrators/${encodeURIComponent(card.artist)}`}
                onClick={onClose}
              >
                {card.artist}
              </CompactDetailLink>
            )}
          </div>
        </div>

      </div>

      {variant === "full" && <div className="mt-5 2xl:mt-6">{detailRows}</div>}

      {refreshError && <p className="mt-4 text-sm text-rose-300">{refreshError}</p>}
    </section>
  );
}

function getLatestHistoryValue(points: HistoryPointView[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (value != null) return value;
  }

  return null;
}

export function CardModalHistorySection({
  historyChartMode,
  activeMarketSource,
  cardMarketHistory,
  activeCardMarketCurrentValue,
  showTcgPlayerSource,
  card,
  collectionItem,
  availableCardMarketHistorySeries,
  activeCardMarketHistorySeries,
  activeCardMarketSeriesLabel,
  onSelectMarketSource,
  onSelectCardMarketHistorySeries,
  onSelectHistoryChartMode,
  tcgPlayerHistory,
  tcgPlayerCurrentValue,
  gradedPriceHistory,
  ebaySoldGradedPriceHistory,
}: {
  historyChartMode: "market" | "graded";
  activeMarketSource: "cardmarket" | "tcgplayer";
  cardMarketHistory: HistoryPointView[];
  activeCardMarketCurrentValue: number | null;
  showTcgPlayerSource: boolean;
  card: ModalCardData;
  collectionItem: ModalCardCollectionItem | null;
  availableCardMarketHistorySeries: Array<{
    key: CardMarketHistorySeriesKey;
    label: string;
  }>;
  activeCardMarketHistorySeries: CardMarketHistorySeriesKey;
  activeCardMarketSeriesLabel: string;
  onSelectMarketSource: (source: "cardmarket" | "tcgplayer") => void;
  onSelectCardMarketHistorySeries: (series: CardMarketHistorySeriesKey) => void;
  onSelectHistoryChartMode: (mode: "market" | "graded") => void;
  tcgPlayerHistory: HistoryPointView[];
  tcgPlayerCurrentValue: number | null;
  gradedPriceHistory: CardGradedPriceHistorySeries[];
  ebaySoldGradedPriceHistory: CardEbaySoldGradedPriceHistorySeries[];
}) {
  const savedGradeCandidates = buildSavedGradeCandidates(collectionItem);
  const allGradedRows = getGradedPriceRows(card, collectionItem);
  const gradedRows =
    savedGradeCandidates.length > 0
      ? allGradedRows.filter((row) => row.savedMatch)
      : allGradedRows;
  const cardMarketGradedRows = gradedRows.filter((row) => row.sourceType === "cardmarket");
  const ebayGradedRows = gradedRows.filter((row) => row.sourceType === "ebay");
  const hasCardMarketGradedData = cardMarketGradedRows.length > 0;
  const hasEbaySoldGradedData = ebayGradedRows.length > 0;
  const hasGradedData = hasCardMarketGradedData || hasEbaySoldGradedData;
  const effectiveHistoryChartMode = hasGradedData ? historyChartMode : "market";
  const fallbackGradedSource: GradedPriceSource =
    getPreferredGradedRow(gradedRows)?.sourceType ??
    (cardMarketGradedRows.length > 0 ? "cardmarket" : "ebay");
  const [gradedSelection, setGradedSelection] = useState<{
    cardId: string;
    source: GradedPriceSource;
    label: string;
  }>(() => ({
    cardId: card.id,
    source: fallbackGradedSource,
    label: "",
  }));
  const selectedGradedSource =
    gradedSelection.cardId === card.id ? gradedSelection.source : fallbackGradedSource;
  const effectiveGradedSource =
    selectedGradedSource === "cardmarket" && cardMarketGradedRows.length > 0
      ? "cardmarket"
      : selectedGradedSource === "ebay" && ebayGradedRows.length > 0
        ? "ebay"
        : fallbackGradedSource;
  const gradedSourceRows =
    effectiveGradedSource === "cardmarket" ? cardMarketGradedRows : ebayGradedRows;
  const selectedGradedSlabLabel =
    gradedSelection.cardId === card.id ? gradedSelection.label : "";
  const selectedGradedRow =
    gradedSourceRows.find((row) => row.label === selectedGradedSlabLabel) ??
    getPreferredGradedRow(gradedSourceRows);
  const gradedChartCurrency =
    selectedGradedRow?.chartCurrency ?? selectedGradedRow?.currency ?? "EUR";
  const showGradedSourceToggle = cardMarketGradedRows.length > 0 && ebayGradedRows.length > 0;

  const activeMarketHistory =
    activeMarketSource === "tcgplayer"
      ? {
          currency: "USD" as const,
          currentValue: tcgPlayerCurrentValue,
          points: tcgPlayerHistory,
          title: "TCGPlayer History",
        }
      : {
          currency: "EUR" as const,
          currentValue: activeCardMarketCurrentValue,
          points: cardMarketHistory,
          title: "CardMarket History",
        };
  const hasMultipleCardMarketSeries = availableCardMarketHistorySeries.length > 1;
  const showCardMarketSeriesPicker =
    effectiveHistoryChartMode === "market" &&
    activeMarketSource === "cardmarket" &&
    hasMultipleCardMarketSeries;
  const showRawSourceToggle = effectiveHistoryChartMode === "market" && showTcgPlayerSource;
  const historyRangeScopePoints = [
    ...activeMarketHistory.points,
    ...gradedPriceHistory.flatMap((series) => series.points),
    ...ebaySoldGradedPriceHistory.flatMap((series) => series.points),
  ];
  const historyPillClass =
    "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition-colors max-[640px]:h-7 max-[640px]:px-1.5 max-[640px]:text-[10px]";
  const historySourceToggleClass =
    "grid h-8 w-[13rem] min-w-[10.5rem] max-w-full grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-[640px]:h-7 max-[640px]:w-[10.5rem]";
  const historyModeToggleClass =
    "grid h-9 w-[10.5rem] min-w-[9rem] max-w-full grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/24 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-[640px]:h-8 max-[640px]:w-[9.5rem]";
  const historyModeToggleButtonClass =
    "min-w-0 rounded-[10px] px-2 text-center text-[11px] font-bold leading-none transition-colors max-[640px]:px-1.5 max-[640px]:text-[10px]";
  const historySourceToggleButtonClass =
    "min-w-0 rounded-[10px] px-2 text-center text-[11px] font-semibold leading-none transition-colors max-[640px]:px-1.5 max-[640px]:text-[10px]";
  const historySourceToggleActiveClass =
    "bg-white/[0.13] text-white shadow-[0_1px_10px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.07)]";
  const chartHeaderChipClass =
    "inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-black/24 px-3 text-xs font-semibold text-white/76";
  const historyModeSwitchControl = hasGradedData ? (
    <div className={`card-modal-mode-toggle ${historyModeToggleClass}`}>
      {[
        { key: "market" as const, label: "Raw" },
        { key: "graded" as const, label: "Graded" },
      ].map((mode) => (
        <button
          key={mode.key}
          type="button"
          onClick={() => onSelectHistoryChartMode(mode.key)}
          aria-pressed={effectiveHistoryChartMode === mode.key}
          className={`${historyModeToggleButtonClass} ${
            effectiveHistoryChartMode === mode.key
              ? ACTIVE_SEGMENT_CLASS
              : "text-white/52 hover:bg-white/[0.06] hover:text-white/82"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  ) : null;
  const cardMarketSeriesPickerControl =
    effectiveHistoryChartMode === "market" && showCardMarketSeriesPicker ? (
      <div className="card-modal-series-picker card-modal-history-series-picker flex min-w-0 flex-wrap items-center gap-1">
        {availableCardMarketHistorySeries.map((series) => (
          <button
            key={series.key}
            type="button"
            onClick={() => onSelectCardMarketHistorySeries(series.key)}
            className={`${historyPillClass} ${
              activeCardMarketHistorySeries === series.key
                ? ACTIVE_SEGMENT_CLASS
                : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
            }`}
          >
            {series.label}
          </button>
        ))}
      </div>
    ) : null;
  const rawSourceSwitchControl = showRawSourceToggle ? (
    <div className={`card-modal-source-toggle ${historySourceToggleClass}`}>
      {[
        { key: "cardmarket" as const, label: "CardMarket" },
        { key: "tcgplayer" as const, label: "TCGPlayer" },
      ].map((source) => (
        <button
          key={source.key}
          type="button"
          onClick={() => onSelectMarketSource(source.key)}
          aria-pressed={activeMarketSource === source.key}
          className={`${historySourceToggleButtonClass} ${
            activeMarketSource === source.key
              ? historySourceToggleActiveClass
              : "text-white/52 hover:bg-white/[0.06] hover:text-white/82"
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  ) : null;
  const gradedSourceSwitchControl = showGradedSourceToggle ? (
    <div className={`card-modal-source-toggle ${historySourceToggleClass}`}>
      {[
        { key: "cardmarket" as const, label: "CardMarket" },
        { key: "ebay" as const, label: "eBay" },
      ].map((source) => (
        <button
          key={source.key}
          type="button"
          onClick={() => {
            setGradedSelection({ cardId: card.id, source: source.key, label: "" });
          }}
          aria-pressed={effectiveGradedSource === source.key}
          className={`${historySourceToggleButtonClass} ${
            effectiveGradedSource === source.key
              ? historySourceToggleActiveClass
              : "text-white/52 hover:bg-white/[0.06] hover:text-white/82"
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  ) : null;
  const historyHeaderLeadingAccessory =
    historyModeSwitchControl || cardMarketSeriesPickerControl || gradedSourceSwitchControl ? (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {historyModeSwitchControl}
        {cardMarketSeriesPickerControl}
        {effectiveHistoryChartMode === "graded" ? gradedSourceSwitchControl : null}
      </div>
    ) : null;
  const rawHeaderAccessory =
    rawSourceSwitchControl ?? (
      <span className={chartHeaderChipClass}>
        {activeMarketSource === "cardmarket" ? activeCardMarketSeriesLabel : "Market"}
      </span>
    );
  const gradedSlabSelectControl = (
    <GradedSlabSelectControl
      rows={gradedSourceRows}
      selectedRow={selectedGradedRow}
      onChange={(label) =>
        setGradedSelection({
          cardId: card.id,
          source: effectiveGradedSource,
          label,
        })
      }
      className="max-w-[10rem] max-[640px]:max-w-[8.5rem]"
    />
  );
  const gradedHeaderLeadingAccessory = (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {historyModeSwitchControl}
      {gradedSourceSwitchControl}
      {gradedSlabSelectControl}
    </div>
  );
  return (
    <section className="min-w-0 text-white">
      <div className="flex flex-col gap-3">
        {effectiveHistoryChartMode === "graded" ? (
          <>
            <div className="min-w-0">
              <PriceHistoryPanel
                title="Price History"
                currency={gradedChartCurrency}
                points={selectedGradedRow?.chartPoints ?? []}
                currentValue={selectedGradedRow?.chartCurrentValue ?? selectedGradedRow?.value ?? null}
                headerLeadingAccessory={gradedHeaderLeadingAccessory}
                tone="dark"
                layout="hero"
                rangeScopePoints={historyRangeScopePoints}
                rangeStorageKey={`card-history-${card.id}`}
                emptyText="No graded history yet"
              />
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0">
              <PriceHistoryPanel
                title="Price History"
                currency={activeMarketHistory.currency}
                points={activeMarketHistory.points}
                currentValue={activeMarketHistory.currentValue}
                headerLeadingAccessory={historyHeaderLeadingAccessory}
                headerAccessory={rawHeaderAccessory}
                tone="dark"
                layout="hero"
                rangeScopePoints={historyRangeScopePoints}
                rangeStorageKey={`card-history-${card.id}`}
              />
            </div>

            <CardPriceStatusLine card={card} className="!border-b-0 !pb-0" />
          </>
        )}
      </div>
    </section>
  );
}

const CARD_MODAL_SUPPORT_PANEL_CLASS =
  "min-w-0 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.022))] p-4";
const CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS = "text-sm font-semibold text-white";
const CARD_MODAL_MARKET_BUTTON_CLASS =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-center text-sm font-semibold text-white/82 transition-colors hover:border-white/18 hover:bg-white/[0.08] hover:text-white";

function getOwnedCopyPrice(
  card: ModalCardData,
  collectionItem: ModalCardCollectionItem | null
): number | null {
  return (
    collectionItem?.cost_basis_value ??
    collectionItem?.purchase_price ??
    card.price?.cm_en_lowest_nm ??
    card.price?.cm_de_lowest_nm ??
    card.price?.cm_fr_lowest_nm ??
    card.price?.cm_es_lowest_nm ??
    card.price?.cm_it_lowest_nm ??
    card.price?.cm_jp_lowest_nm ??
    null
  );
}

function getRecentDesktopPricePoints(card: ModalCardData): Array<{ label: string; value: number }> {
  return card.price_history
    .map((point) => ({
      label: point.label,
      value:
        point.cm_market_en ??
        point.cm_market ??
        point.cm_market_de ??
        point.cm_market_fr ??
        point.cm_market_es ??
        point.cm_market_it ??
        point.tcp_market ??
        null,
    }))
    .filter((point): point is { label: string; value: number } => point.value != null)
    .slice(-5)
    .reverse();
}

export function CardModalOwnedCopyPanel({
  card,
  collectionItem,
  onAddedToCollection,
  className = "",
}: {
  card: ModalCardData;
  collectionItem: ModalCardCollectionItem | null;
  onAddedToCollection?: () => void | Promise<void>;
  className?: string;
}) {
  const collectionCard = buildCollectionCard(card);
  const ownedPrice = getOwnedCopyPrice(card, collectionItem);

  return (
    <section className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>
          {collectionItem?.for_sale ? "For Sale Copy" : "Owned Copy"}
        </h3>
        {collectionItem && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        {card.image_url && (
          <div
            className={getCardImageFrameClassName(
              card.image_url,
              "relative aspect-[63/88] w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]"
            )}
          >
            <Image
              src={getCachedImageUrl(card.image_url) ?? card.image_url}
              alt={card.name}
              fill
              sizes="64px"
              className={getCardImageClassName(card.image_url, "object-fill")}
              unoptimized
            />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/88">
            {collectionItem?.condition ?? "Not saved yet"}
          </p>
          <p className="mt-1 text-xs text-white/46">
            {collectionItem?.language ?? "English"}
          </p>
          <p className="mt-3 text-lg font-semibold tabular-nums text-white">
            {formatCurrency(ownedPrice, "EUR")}
          </p>
          {collectionItem?.for_sale ? (
            <p className="mt-1 truncate text-xs text-amber-200/62">For sale</p>
          ) : collectionItem?.binder_name ? (
            <p className="mt-1 truncate text-xs text-white/42">{collectionItem.binder_name}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <CollectionAddCardButton
          card={collectionCard}
          mode="button"
          theme="dark"
          label={collectionItem ? "Add Another Copy" : "Add to Collection"}
          className="!min-h-10 !rounded-xl !border-violet-300/24 !bg-violet-600/22 !text-sm !font-semibold !text-violet-50 hover:!border-violet-200/38 hover:!bg-violet-500/30"
          onAdded={onAddedToCollection}
        />
        <CollectionWantButton
          card={collectionCard}
          mode="button"
          theme="dark"
          label="Want"
          initialWanted={Boolean(card.want_item)}
          wantItemId={card.want_item?.id ?? null}
          className="!min-h-10 !rounded-xl !border-violet-300/20 !bg-violet-600/18 !text-sm !font-semibold !text-violet-50 hover:!border-violet-200/36 hover:!bg-violet-500/28"
        />
      </div>
    </section>
  );
}

export function CardModalRecentPricesPanel({
  card,
  className = "",
}: {
  card: ModalCardData;
  className?: string;
}) {
  const recentPricePoints = getRecentDesktopPricePoints(card);

  return (
    <section className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>Recent Prices</h3>
        <span className="text-xs font-semibold text-violet-200/80">View All</span>
      </div>
      <div className="mt-3 grid gap-0">
        {recentPricePoints.length > 0 ? (
          recentPricePoints.map((point) => (
            <div
              key={`${point.label}-${point.value}`}
              className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-2.5 last:border-b-0"
            >
              <span className="truncate text-xs text-white/52">{point.label}</span>
              <span className="text-sm font-semibold tabular-nums text-white/84">
                {formatCurrency(point.value, "EUR")}
              </span>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/42">
            No recent market points yet.
          </p>
        )}
      </div>
    </section>
  );
}

export function CardModalActiveListingsPanel({
  card,
  storedCardMarketUrl,
  onOpenCardMarket,
  className = "",
}: {
  card: ModalCardData;
  storedCardMarketUrl: string | null;
  onOpenCardMarket: () => void;
  className?: string;
}) {
  return (
    <section className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>Active Listings</h3>
        <span className="text-xs font-semibold text-violet-200/80">Market</span>
      </div>
      <div className="mt-4 grid gap-2">
        {storedCardMarketUrl ? (
          <a
            href={storedCardMarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={CARD_MODAL_MARKET_BUTTON_CLASS}
          >
            CardMarket
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <button type="button" onClick={onOpenCardMarket} className={CARD_MODAL_MARKET_BUTTON_CLASS}>
            CardMarket
            <ExternalLink className="h-4 w-4" />
          </button>
        )}

        <a
          href={buildCardEbaySearchUrl({
            name: card.name,
            cardNumber: card.card_number,
            gradingCompany: normalizeGradingCompanyLabel(card.collection_item?.grading_company),
            gradingGrade: normalizeGradingGradeLabel(card.collection_item?.grading_grade),
          })}
          target="_blank"
          rel="noopener noreferrer"
          className={CARD_MODAL_MARKET_BUTTON_CLASS}
        >
          eBay Deals
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

export function CardModalFooter({
  card,
  collectionItem,
  storedCardMarketUrl,
  onOpenCardMarket,
  onAddedToCollection,
}: {
  card: ModalCardData;
  collectionItem: ModalCardCollectionItem | null;
  storedCardMarketUrl: string | null;
  onOpenCardMarket: () => void;
  onAddedToCollection?: () => void | Promise<void>;
}) {
  return (
    <div className="mt-1">
      <div className="grid gap-4 lg:grid-cols-3">
        <CardModalOwnedCopyPanel
          card={card}
          collectionItem={collectionItem}
          onAddedToCollection={onAddedToCollection}
        />
        <CardModalRecentPricesPanel card={card} />
        <CardModalActiveListingsPanel
          card={card}
          storedCardMarketUrl={storedCardMarketUrl}
          onOpenCardMarket={onOpenCardMarket}
        />
      </div>
    </div>
  );
}
