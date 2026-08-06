"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BadgeEuro,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Flag,
  Globe2,
  Info,
  LineChart,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Package,
  Radar,
  RefreshCw,
  Repeat2,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CachedImage from "@/components/CachedImage";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import type { CollectionCardSavedDetail } from "@/lib/collection-client-events";
import CollectionWantButton from "@/components/CollectionWantButton";
import { CardDetailMobileActionPortal } from "@/components/card-detail/CardDetailShell";
import CardDetailMobileMarketAction from "@/components/card-detail/CardDetailMobileMarketAction";
import CardPriceAlertButton from "@/components/card-detail/CardPriceAlertButton";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import ReadableInfoTooltip from "@/components/card-detail/ReadableInfoTooltip";
import EbayCardDemandPanel from "@/components/ebay/EbayCardDemandPanel";
import { DETAIL_MARKET_LINK_CLASS } from "@/components/detail-market-link-style";
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
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import { normalizeRarityLabel } from "@/lib/rarity";
import {
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
} from "@/components/modal-glass-styles";
import { formatCurrency } from "./utils";
import type { ModalCardCollectionItem, ModalCardData } from "./types";

const GradedSlabPreview = dynamic(() => import("@/components/GradedSlabPreview"), {
  ssr: false,
  loading: () => null,
});
const ACTIVE_SEGMENT_CLASS =
  "!border-[rgb(var(--dc-primary-rgb)/0.38)] !bg-[rgb(var(--dc-primary-rgb)/0.12)] !text-[var(--dc-primary)] shadow-[inset_0_1px_0_var(--dc-sheen)]";

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
const RELEASE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
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

function formatReleaseDate(value: string | null | undefined): { date: string; year: string } | null {
  const timestamp = parseDateMillis(value);
  if (timestamp == null) return null;
  const date = new Date(timestamp);

  return {
    date: RELEASE_DATE_FORMATTER.format(date),
    year: String(date.getUTCFullYear()),
  };
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
      value: point.cm_market_en ?? null,
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
  kind,
  value,
  mobileValue,
  title,
  tone = "neutral",
}: {
  kind: "source" | "updated" | "next" | "coverage" | "history";
  value: string;
  mobileValue?: string;
  title: string;
  tone?: PriceStatusTone;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1.5 text-[11px] font-semibold leading-none tabular-nums max-[640px]:px-2 max-[640px]:py-1 max-[640px]:text-[10px] ${getPriceStatusToneClass(
        tone
      )}`}
      title={title}
      data-card-detail-price-status-item={kind}
    >
      <span className={mobileValue ? "max-[640px]:hidden" : undefined}>{value}</span>
      {mobileValue ? <span className="hidden max-[640px]:inline">{mobileValue}</span> : null}
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
    <div
      className={`min-w-0 border-b border-white/8 pb-2 ${className}`}
      data-card-detail-price-status
    >
      <div className="card-detail-price-status-items flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-none text-white/28 max-[640px]:flex-nowrap max-[640px]:gap-1 max-[640px]:overflow-x-auto max-[640px]:text-[10px]">
        <PriceStatusInlineItem
          kind="source"
          value={sourceStatus.value}
          title={`Source: ${sourceStatus.value}. ${sourceStatus.hint}`}
          tone={sourceStatus.tone}
        />
        <PriceStatusInlineItem
          kind="updated"
          value={updatedValue}
          mobileValue={latestPriceAge ?? "No price"}
          title={`Latest price: ${latestPriceAge ?? "No price"}. ${
            latestPriceLabel ?? sourceCheckedLabel ?? "No source check yet"
          }`}
          tone={latestPriceTone}
        />
        <PriceStatusInlineItem
          kind="next"
          value={nextUpdateValue}
          mobileValue={
            !refreshInfo.hasFetchedAt
              ? "Pending"
              : !refreshInfo.autoRefreshEnabled
                ? "Manual"
                : refreshInfo.due
                  ? "Due now"
                  : formatRefreshCountdown(refreshInfo.remainingMs).replace(/\s+\d+s$/, "")
          }
          title={`Refresh: ${refreshValue}. ${refreshHint}`}
          tone={refreshTone}
        />
        <PriceStatusInlineItem
          kind="coverage"
          value={`${coverage.currentCount} of ${coverage.totalCount} sources`}
          mobileValue={`${coverage.currentCount}/${coverage.totalCount} sources`}
          title={`Data: ${coverage.currentCount}/${coverage.totalCount} sources. CM ${coverage.cardMarketCount}/${coverage.cardMarketTotal} / TCG ${coverage.tcgPlayerCount}/${coverage.tcgPlayerTotal}`}
          tone={coverageTone}
        />
        <PriceStatusInlineItem
          kind="history"
          value={historyPoints.length > 0 ? `${historyPoints.length} history points` : "No history yet"}
          mobileValue={historyPoints.length > 0 ? `${historyPoints.length} pts` : "No history"}
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

const BUY_SIGNAL_STEPS = [
  { key: "strong_sell", label: "STRONG SELL" },
  { key: "sell", label: "SELL" },
  { key: "hold", label: "HOLD" },
  { key: "buy", label: "BUY" },
  { key: "strong_buy", label: "STRONG BUY" },
] as const;

function getBuySignalConfidenceClass(confidence: string): string {
  if (confidence === "high") {
    return "border-emerald-200/18 bg-emerald-300/[0.075] text-emerald-100/84";
  }
  if (confidence === "medium") {
    return "border-amber-200/18 bg-amber-300/[0.075] text-amber-100/84";
  }
  return "border-white/12 bg-white/[0.06] text-white/58";
}

function getBuySignalEvidenceClass(tone: string): string {
  if (tone === "positive") return "border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-100";
  if (tone === "negative") return "border-rose-300/14 bg-rose-400/[0.055] text-rose-100";
  if (tone === "warning") return "border-amber-300/14 bg-amber-400/[0.055] text-amber-100";
  return "border-white/8 bg-white/[0.035] text-white/76";
}

function getBuySignalMarkerClass(label: string): string {
  if (label === "strong_sell" || label === "sell") {
    return "border-rose-100/90 bg-rose-400 shadow-[0_0_0_4px_rgba(251,113,133,0.12),0_0_16px_rgba(251,113,133,0.22)]";
  }
  if (label === "buy" || label === "strong_buy") {
    return "border-emerald-100/90 bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.11),0_0_16px_rgba(52,211,153,0.20)]";
  }
  return "border-violet-100/90 bg-violet-400 shadow-[0_0_0_4px_rgb(var(--dc-primary-rgb)/0.12),0_0_16px_rgb(var(--dc-primary-rgb)/0.20)]";
}

function getBuySignalTrackClass(compact: boolean): string {
  const height = compact ? "h-2" : "h-2.5";
  return `${height} relative overflow-visible rounded-full border border-white/[0.065] bg-[linear-gradient(90deg,rgb(var(--dc-negative-rgb)/0.30)_0%,rgba(255,255,255,0.075)_34%,rgb(var(--dc-primary-rgb)/0.18)_50%,rgba(255,255,255,0.075)_66%,rgb(var(--dc-success-rgb)/0.28)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_16px_rgb(var(--dc-primary-rgb)/0.08)]`;
}

function getBuySignalReasonItems(
  signal: NonNullable<ModalCardData["buy_signal"]>,
  limit: number
) {
  const reasons = signal.reasons.map((reason) => ({
    key: `reason:${reason}`,
    label: reason,
    className: "border-white/8 bg-white/[0.04] text-white/68",
  }));
  const warnings = signal.warnings.map((warning) => ({
    key: `warning:${warning}`,
    label: warning,
    className: "border-amber-200/14 bg-amber-300/[0.055] text-amber-100/76",
  }));

  return [...reasons, ...warnings].slice(0, limit);
}

export function CardModalBuySignalPanel({
  signal,
  compact = false,
}: {
  signal: ModalCardData["buy_signal"] | null | undefined;
  compact?: boolean;
}) {
  if (!signal) return null;

  const markerPercent = Math.min(Math.max(signal.marker_percent ?? signal.score, 2), 98);
  const evidence = signal.evidence.slice(0, 6);
  const warnings = signal.warnings.slice(0, 2);
  const compactReasonItems = getBuySignalReasonItems(signal, 3);
  const reasonItems = getBuySignalReasonItems(signal, 5);

  if (compact) {
    return (
      <section
        data-buy-signal-panel
        className="min-w-0 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.024))] px-3 py-2.5 shadow-[inset_0_1px_0_rgb(var(--dc-primary-soft-rgb)/0.06)]"
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.12em] text-white/46">
              Buy Signal
            </span>
            <span title="Based on saved market data, price history, and eBay sold graded samples">
              <Info
                className="h-3.5 w-3.5 shrink-0 text-white/30"
                aria-hidden="true"
              />
            </span>
            <span className="min-w-0 truncate text-[12px] font-black text-white">
              {signal.label_text}
            </span>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase leading-none ${getBuySignalConfidenceClass(
              signal.confidence
            )}`}
            title={`${signal.confidence.toUpperCase()} confidence`}
          >
            {signal.confidence}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-[0.08em] text-white/38">
            Sell
          </span>
          <div className={getBuySignalTrackClass(true)}>
            <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0))]" />
            <span
              className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${getBuySignalMarkerClass(
                signal.label
              )}`}
              style={{ left: `${markerPercent}%` }}
            />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.08em] text-white/38">
            Buy
          </span>
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-white/[0.065] pt-2">
          <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-white/34">
            Why
          </span>
          {compactReasonItems.map((item) => (
            <span
              key={item.key}
              className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-snug ${item.className}`}
              title={item.label}
            >
              {item.label}
            </span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      data-buy-signal-panel
      className={`min-w-0 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.024))] shadow-[inset_0_1px_0_rgb(var(--dc-primary-soft-rgb)/0.06)] ${
        compact ? "p-3.5" : "p-4"
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 truncate text-sm font-semibold text-white">Buy Signal</h3>
          <span title="Based on saved market data, price history, and eBay sold graded samples">
            <Info
              className="h-3.5 w-3.5 shrink-0 text-white/36"
              aria-hidden="true"
            />
          </span>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-none ${getBuySignalConfidenceClass(
            signal.confidence
          )}`}
          title={`${signal.confidence.toUpperCase()} confidence`}
        >
          {signal.confidence.toUpperCase()}
        </span>
      </div>

      <div className={compact ? "mt-3" : "mt-4"}>
        <div className={getBuySignalTrackClass(false)}>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0))]" />
          <span
            className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${getBuySignalMarkerClass(
              signal.label
            )}`}
            style={{ left: `${markerPercent}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[9px] font-black uppercase leading-tight text-white/38 max-[420px]:text-[8px]">
          {BUY_SIGNAL_STEPS.map((step) => (
            <span
              key={step.key}
              className={signal.label === step.key ? "text-white/86" : undefined}
            >
              {step.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-white/[0.065] pt-3">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.13em] text-white/34">
          Why
        </span>
        {reasonItems.map((item) => (
          <span
            key={item.key}
            className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold ${item.className}`}
            title={item.label}
          >
            {item.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/68">
          {signal.market_mode === "graded" ? "Graded" : "Raw"}
        </span>
        <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/68">
          {signal.context === "owned" ? "Owned" : "Market"}
        </span>
        <span className="rounded-full border border-violet-300/16 bg-violet-400/[0.08] px-2.5 py-1 text-[11px] font-bold text-violet-100">
          {signal.label_text}
        </span>
      </div>

      <div
        className={`mt-3 grid min-w-0 gap-2 ${
          compact ? "grid-cols-2 min-[720px]:grid-cols-4" : "grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {evidence.map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className={`min-w-0 rounded-xl border px-2.5 py-2 ${getBuySignalEvidenceClass(item.tone)}`}
          >
            <p className="truncate text-[10px] font-semibold text-white/42">{item.label}</p>
            <p className="mt-1 truncate text-[12px] font-bold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
          {warnings.map((warning) => (
            <span
              key={warning}
              className="rounded-full border border-amber-300/14 bg-amber-400/[0.055] px-2 py-1 text-[10px] font-semibold text-amber-100/82"
            >
              {warning}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function CardModalMarketSignalPanel({
  signal,
  card,
  loading = false,
  onNavigate,
  className = "",
  showFullAnalysisLink = true,
}: {
  signal: ModalCardData["signal_summary"] | null | undefined;
  card: ModalCardData;
  loading?: boolean;
  onNavigate: () => void;
  className?: string;
  showFullAnalysisLink?: boolean;
}) {
  const stats = card.market_stats;
  const updatedLabel = formatShortStatusDate(stats?.updated_at);
  const scoreSummary = stats
    ? stats.score == null
      ? "The score appears once there is enough price and demand data for this card."
      : "One overall number that combines price trend, stability, liquidity, demand and graded-market activity."
    : "Market insights appear here once enough price and demand data is collected.";
  const analysisLinkLabel = signal ? "Open full analysis" : "Open Signal Radar";

  return (
    <section
      data-card-market-stats
      data-signal-summary-panel
      data-signal-source={signal ? "external" : "market"}
      className={`card-detail-surface relative min-w-0 ${className}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/14 bg-violet-400/[0.055] text-violet-100/72">
            <LineChart className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/38">
              Market intelligence
              {loading && !stats ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            </p>
            <h3 className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-white/90">
              Market score
            </h3>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.07em] ${stats ? getMarketStatsTierClass(stats.tier) : "border-white/10 bg-white/[0.04] text-white/46"}`}>
          {stats?.tier ?? "Building"}
        </span>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 border-y border-white/[0.07] py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/38">
            DustyCards score
          </p>
          <div className="mt-1 flex items-end gap-1.5">
            <span className="text-4xl font-black tabular-nums tracking-[-0.06em] text-white/94">
              {formatMarketStatsNumber(stats?.score ?? null)}
            </span>
            <span className="pb-1 text-xs font-bold text-white/30">/100</span>
          </div>
        </div>
        <div className="min-w-0 sm:border-l sm:border-white/[0.07] sm:pl-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/38">
            Data confidence
          </p>
          <p className="mt-1 text-sm font-bold capitalize text-white/78">
            {stats?.confidence ?? "Building"}
          </p>
          <p className="mt-1 text-sm leading-5 text-white/50">
            {scoreSummary}
          </p>
        </div>
      </div>

      {stats ? (
        <CardModalMarketStatsContent stats={stats} />
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm font-medium leading-5 text-white/42">
          Market drivers appear as saved price and demand evidence becomes available.
        </div>
      )}

      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-white/34">
          {stats ? (
            <span>{stats.data_points} saved price {stats.data_points === 1 ? "point" : "points"}</span>
          ) : null}
          {stats?.tcggo?.score != null ? (
            <span>TCGGO {formatMarketStatsNumber(stats.tcggo.score)}</span>
          ) : null}
          {updatedLabel ? <span>{updatedLabel}</span> : null}
        </div>
        {showFullAnalysisLink ? (
          <Link
            href={`/movers/signal-radar/${encodeURIComponent(card.id)}?game=${encodeURIComponent(card.game)}`}
            prefetch={false}
            onClick={onNavigate}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-500/[0.1] px-3.5 text-sm font-bold text-violet-50/86 transition hover:border-violet-200/34 hover:bg-violet-500/[0.17]"
          >
            {analysisLinkLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
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
  variant = "compact",
  valueMode = "label",
}: {
  rows: GradedPriceDisplayRow[];
  selectedRow: GradedPriceDisplayRow | null;
  onChange: (value: string) => void;
  className?: string;
  variant?: "compact" | "chart";
  valueMode?: "label" | "key";
}) {
  const label = selectedRow?.label ?? "Graded";
  const shellClass =
    variant === "chart"
      ? `relative inline-flex h-11 w-[5.75rem] max-w-full items-center justify-start rounded-xl border border-white/10 bg-black/25 pl-2.5 pr-7 text-[12px] font-black leading-none text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors ${className}`
      : `relative inline-flex h-8 max-w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 text-[11px] font-semibold leading-none text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors max-[640px]:h-7 max-[640px]:px-2 max-[640px]:text-[10px] ${className}`;
  const chartControlProps =
    variant === "chart" ? { "data-card-detail-chart-series-control": "grade" } : {};
  const controlLabel =
    variant === "chart" ? (
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-black leading-4">{label}</span>
        {selectedRow?.sourceLabel ? (
          <span className="block truncate text-[9px] font-semibold leading-3 tracking-[-0.01em] text-white/42">
            {selectedRow.sourceLabel}
          </span>
        ) : null}
      </span>
    ) : (
      <span className="whitespace-nowrap">{label}</span>
    );

  if (rows.length <= 1) {
    return (
      <span className={shellClass} {...chartControlProps}>
        {controlLabel}
      </span>
    );
  }

  return (
    <label
      className={`${shellClass} cursor-pointer hover:border-white/18 hover:bg-white/[0.055] hover:text-white`}
      data-card-detail-grade-control
      {...chartControlProps}
    >
      {controlLabel}
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-white/48" />
      <select
        aria-label="Select graded slab"
        value={selectedRow ? (valueMode === "key" ? selectedRow.key : selectedRow.label) : ""}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {!selectedRow && (
          <option value="" disabled>
            Graded
          </option>
        )}
        {rows.map((row) => (
          <option
            key={row.key}
            value={valueMode === "key" ? row.key : row.label}
            className="bg-[var(--dc-surface-primary)] text-[var(--dc-text-primary)]"
          >
            {row.label} - {row.sourceLabel}
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

export interface CardModalGradedDisplayPrice {
  selectionKey: string;
  source: GradedPriceSource;
  label: string;
  sourceLabel: string;
  value: number;
  currency: CurrencyCode;
  hint: string | null;
}

function toGradedDisplayPrice(
  row: GradedPriceDisplayRow | null
): CardModalGradedDisplayPrice | null {
  if (!row) return null;
  return {
    selectionKey: row.key,
    source: row.sourceType,
    label: row.label,
    sourceLabel: row.sourceLabel,
    value: row.chartCurrentValue ?? row.value,
    currency: row.chartCurrency,
    hint: row.hint,
  };
}

export function getCardModalGradedDisplayPrices(
  card: ModalCardData,
  collectionItem: ModalCardData["collection_item"] | null | undefined
): CardModalGradedDisplayPrice[] {
  const rows = getGradedPriceRows(card, collectionItem);
  const savedRows = rows.filter((row) => row.savedMatch);
  return (savedRows.length > 0 ? savedRows : rows)
    .map((row) => toGradedDisplayPrice(row))
    .filter((price): price is CardModalGradedDisplayPrice => price != null);
}

export function getPreferredCardModalGradedDisplayPrice(
  card: ModalCardData,
  collectionItem: ModalCardData["collection_item"] | null | undefined
): CardModalGradedDisplayPrice | null {
  const rows = getGradedPriceRows(card, collectionItem);
  const savedRows = rows.filter((row) => row.savedMatch);
  return toGradedDisplayPrice(getPreferredGradedRow(savedRows.length > 0 ? savedRows : rows));
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
  rangeStorageLegacyKey,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  compact?: boolean;
  graphFirst?: boolean;
  rangeScopePoints?: HistoryPointView[];
  rangeStorageKey?: string;
  rangeStorageLegacyKey?: string;
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
    "flex min-w-0 items-center gap-1";
  const sourceToggleButtonClass =
    "inline-flex min-h-8 min-w-0 items-center justify-center rounded-lg border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] px-2.5 text-center text-[11px] font-bold leading-none text-[rgb(var(--dc-text-primary-rgb)/0.62)] transition-colors hover:border-[rgb(var(--dc-primary-rgb)/0.28)] hover:bg-[rgb(var(--dc-primary-rgb)/0.07)] hover:text-[var(--dc-text-primary)] max-[640px]:min-h-7 max-[640px]:px-2 max-[640px]:text-[10px]";
  const sourceToggleActiveClass =
    "!border-[rgb(var(--dc-primary-rgb)/0.38)] !bg-[rgb(var(--dc-primary-rgb)/0.12)] !text-[var(--dc-primary)] shadow-[inset_0_1px_0_var(--dc-sheen)]";
  const sourceSwitchControl = showSourceSwitch ? (
    <div
      className={`card-modal-source-toggle ${sourceToggleClass}`}
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
          rangeStorageLegacyKey={rangeStorageLegacyKey}
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
  onLivePriceCheck,
  onSyncHistory,
  onRemoveCollectionItem,
  onAddedToCollection,
  onCollectionItemSaved,
  onClose,
  onResearchSignal,
  researchingSignal = false,
  cardMarketHref,
  onOpenCardMarket,
  onPriceAlertOpenChange,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  canManageCardPrices: boolean;
  removingCollectionItem: boolean;
  onRefresh: () => void;
  onLivePriceCheck?: () => void;
  onSyncHistory: () => void;
  onRemoveCollectionItem: () => void;
  onAddedToCollection?: () => void | Promise<void>;
  onCollectionItemSaved?: (detail: CollectionCardSavedDetail) => void | Promise<void>;
  onClose: () => void;
  onResearchSignal?: () => void;
  researchingSignal?: boolean;
  cardMarketHref?: string;
  onOpenCardMarket?: () => void;
  onPriceAlertOpenChange?: (open: boolean) => void;
}) {
  const collectionCard = buildCollectionCard(card);
  const readOnlyCollectionItem = Boolean(collectionItem?.read_only);
  const canManageCollectionItem = Boolean(collectionItem && !readOnlyCollectionItem);
  const locationLabel = collectionItem
    ? collectionItem.for_sale
      ? "For sale"
      : collectionItem.binder_name
      ? `In ${collectionItem.binder_name}`
      : "Loose single"
    : null;
  const menuButtonClass =
    "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-white/68 transition hover:bg-white/[0.065] hover:text-white disabled:cursor-not-allowed disabled:opacity-45";
  const hasOverflowActions = canManageCollectionItem || Boolean(onResearchSignal) || canManageCardPrices;
  const mobileMarketClass =
    "flex min-h-11 w-full min-w-0 max-w-full items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.045] px-2 text-[13px] font-bold text-white/72 transition hover:border-violet-200/28 hover:bg-violet-500/[0.12] hover:text-white";
  const ebayHref = buildCardEbaySearchUrl({
    name: card.name,
    cardNumber: card.card_number,
    gradingCompany: normalizeGradingCompanyLabel(card.collection_item?.grading_company),
    gradingGrade: normalizeGradingGradeLabel(card.collection_item?.grading_grade),
  });

  return (
    <div
      className="card-detail-action-cluster min-w-0 items-center justify-end gap-2"
      aria-label="Card actions"
    >
      <CardDetailMobileActionPortal>
        <div
          className="card-detail-primary-actions min-w-0 items-center justify-end gap-2"
          role="group"
          aria-label="Primary card actions"
          data-card-detail-primary-actions
        >
          <CollectionAddCardButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label="Add copy"
            className="!min-h-11 !flex-1 !whitespace-nowrap !rounded-xl !border-violet-300/24 !bg-violet-500/22 !px-2.5 !text-[13px] !font-bold !text-white hover:!border-violet-200/38 hover:!bg-violet-500/30 sm:!px-4 sm:!text-sm lg:!flex-none"
            onAdded={onAddedToCollection}
          />

          <CollectionWantButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label="Want"
            initialWanted={Boolean(card.want_item)}
            wantItemId={card.want_item?.id ?? null}
            className="!min-h-11 !flex-1 !whitespace-nowrap !rounded-xl !border-violet-300/20 !bg-violet-600/16 !px-2.5 !text-[13px] !font-bold !text-violet-50 hover:!border-violet-200/36 hover:!bg-violet-500/26 sm:!px-4 sm:!text-sm lg:!flex-none"
          />

          {onOpenCardMarket || cardMarketHref ? (
            <CardDetailMobileMarketAction
              cardMarketHref={cardMarketHref}
              ebayHref={ebayHref}
              onOpenCardMarket={onOpenCardMarket}
              className={mobileMarketClass}
            />
          ) : null}
        </div>
      </CardDetailMobileActionPortal>

      <CardPriceAlertButton
        cardId={card.id}
        cardName={card.name}
        onOpenChange={onPriceAlertOpenChange}
      />

      {hasOverflowActions ? (
      <details
        className="group/card-actions relative shrink-0"
        data-card-detail-overflow-actions
      >
        <summary
          className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-white/66 transition marker:hidden hover:border-white/18 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
          aria-label="More card actions"
          title="More card actions"
        >
          <MoreHorizontal className="h-5 w-5" />
        </summary>
        <div className="card-detail-overflow-menu absolute right-0 top-[calc(100%+0.55rem)] z-[245] w-56 overflow-hidden rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-glass-strong)] p-1.5 shadow-[0_22px_70px_var(--dc-shadow-color)] backdrop-blur-2xl">
          {canManageCollectionItem && collectionItem ? (
            <CollectionEditCardButton
              card={collectionCard}
              item={collectionItem}
              mode="button"
              theme="dark"
              label="Edit saved copy"
              className="!min-h-11 !w-full !justify-start !rounded-xl !border-0 !bg-transparent !px-3 !text-sm !font-semibold !text-white/68 hover:!bg-white/[0.065] hover:!text-white"
              onSaved={async (detail) => {
                await onCollectionItemSaved?.(detail);
                onClose();
              }}
            />
          ) : null}
          {canManageCollectionItem && collectionItem ? (
          <button
            type="button"
            onClick={onRemoveCollectionItem}
            disabled={isBusy || removingCollectionItem}
            className={`${menuButtonClass} text-rose-100/76 hover:bg-rose-500/[0.11] hover:text-rose-50`}
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
            {removingCollectionItem ? "Removing copy..." : "Remove saved copy"}
          </button>
          ) : null}

          {onResearchSignal ? (
            <button
              type="button"
              onClick={onResearchSignal}
              disabled={researchingSignal}
              className={menuButtonClass}
            >
              {researchingSignal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {researchingSignal ? "Building analysis..." : "Research signal"}
            </button>
          ) : null}

          {canManageCardPrices ? (
            <div className="mt-1 border-t border-white/[0.07] pt-1">
          {onLivePriceCheck ? (
          <button
            type="button"
            onClick={onLivePriceCheck}
            disabled={isBusy}
            className={menuButtonClass}
            aria-label="Check CardMarket English Near Mint price now"
          >
            <BadgeEuro className="h-4 w-4" />
            Check CardMarket now
          </button>
          ) : null}
          <button
            type="button"
            onClick={onSyncHistory}
            disabled={isBusy}
            className={menuButtonClass}
            aria-label={syncingHistory ? "Syncing price history" : "Sync price history"}
            title={syncingHistory ? "Syncing..." : "Sync history"}
          >
            <LineChart className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`} />
            {syncingHistory ? "Syncing history..." : "Sync price history"}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isBusy}
            className={menuButtonClass}
            aria-label={refreshing ? "Refreshing prices" : "Refresh prices"}
            title={refreshing ? "Refreshing..." : "Refresh"}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing prices..." : "Refresh prices"}
          </button>
            </div>
          ) : null}
        </div>
      </details>
      ) : null}
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
            aria-label={`Open fullscreen 3D viewer for ${card.name}`}
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
              <CachedImage
                sourceUrl={card.image_url}
                alt={card.name}
                fill
                className={getCardImageClassName(card.image_url, "rounded-[4.75%] object-fill")}
                sizes={imageSize}
                loading="eager"
                fetchPriority="high"
                priority
                unoptimized
              />
            )}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/16 bg-black/58 text-white/78 opacity-75 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <Maximize2 className="h-4 w-4" />
            </span>
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
      data-mobile-detail-icon
      data-destructive={destructive ? "true" : "false"}
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
  wide = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      data-mobile-info-row
      className={`flex min-h-[4.75rem] min-w-0 items-start gap-2.5 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] p-2.5 shadow-[inset_0_1px_0_var(--dc-sheen)] ${
        wide ? "col-span-2" : ""
      }`}
    >
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
  onResearchSignal,
  researchingSignal,
  signalResearchError,
  signalSummary,
  signalSummaryLoading,
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
  onResearchSignal: () => void;
  researchingSignal: boolean;
  signalResearchError: string | null;
  signalSummary: ModalCardData["signal_summary"] | null | undefined;
  signalSummaryLoading: boolean;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const collectionCard = buildCollectionCard(card);
  const readOnlyCollectionItem = Boolean(collectionItem?.read_only);
  const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
  const metaPrefix = [card.episode_code, card.card_number ? `#${card.card_number}` : null]
    .filter(Boolean)
    .join(" ");
  const language = collectionItem?.language?.trim() || "Market: English NM";
  const savedLabel = readOnlyCollectionItem
    ? "Shared"
    : collectionItem?.for_sale
      ? "For sale"
      : collectionItem
        ? "Saved"
        : "Not saved";
  const conditionLabel =
    collectionItem?.condition ||
    (gradingCompanyLabel && gradingGradeLabel
      ? `${gradingCompanyLabel} ${gradingGradeLabel}`
      : "Raw market");
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
  const releaseDate = formatReleaseDate(card.episode_release_date);
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
    { key: "demand", label: "Demand" },
    { key: "previous-prices", label: "History" },
  ];
  const effectiveActiveTab = showGradedTab || activeTab !== "graded" ? activeTab : "overview";
  const showOverview = effectiveActiveTab === "overview";
  const showChart = effectiveActiveTab === "history";
  const showGraded = effectiveActiveTab === "graded";
  const showDemand = effectiveActiveTab === "demand";
  const showPreviousPrices = effectiveActiveTab === "previous-prices";
  const floatingButtonClass =
    "!h-11 !w-11 !rounded-full !border-[rgb(var(--dc-border-rgb)/0.9)] !bg-[var(--dc-surface-glass)] !p-0 !text-[rgb(var(--dc-text-primary-rgb)/0.86)] !backdrop-blur-xl hover:!border-[rgb(var(--dc-primary-rgb)/0.3)] hover:!bg-[var(--dc-surface-hover)]";

  return (
    <div data-mobile-showcase-root className="relative min-h-dvh overflow-hidden bg-[var(--dc-bg-main)] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(0.9rem+env(safe-area-inset-top))] text-[var(--dc-text-primary)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_24%,rgb(var(--dc-primary-rgb)/0.28),transparent_34%),radial-gradient(circle_at_30%_22%,rgb(var(--dc-cyan-rgb)/0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_52%)]" />

      <div className="relative z-20 flex items-center justify-between">
        <MobileDetailIconButton label="Back to collection" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </MobileDetailIconButton>

        <div className="relative flex items-center gap-2">
          <CollectionAddCardButton
            card={collectionCard}
            mode="icon"
            theme="dark"
            label={collectionItem && !readOnlyCollectionItem ? "Add copy" : "Add"}
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
          {collectionItem && !readOnlyCollectionItem && (
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
          {collectionItem && !readOnlyCollectionItem && !canManageCardPrices && (
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
            <div data-mobile-action-sheet className="absolute right-0 top-[3.25rem] z-40 min-w-52 overflow-hidden rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-glass-strong)] p-1.5 text-sm font-semibold text-[var(--dc-text-primary)] shadow-[0_22px_70px_var(--dc-shadow-color)] backdrop-blur-2xl">
              {collectionItem && !readOnlyCollectionItem && (
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
          <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-[radial-gradient(circle,rgb(var(--dc-primary-rgb)/0.28),rgb(var(--dc-cyan-rgb)/0.10)_42%,transparent_70%)] blur-2xl" />
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
                <CachedImage
                  sourceUrl={card.image_url}
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
          <span className="absolute right-0 top-0 shrink-0 rounded-full border border-violet-300/20 bg-violet-500/18 px-3 py-2 text-sm font-semibold text-violet-100 shadow-[0_14px_34px_rgb(var(--dc-primary-rgb)/0.18)]">
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
          <div data-mobile-showcase-card className="overflow-hidden rounded-[18px] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] p-3.5 shadow-[inset_0_1px_0_var(--dc-sheen)]">
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

          <div data-mobile-showcase-card className="rounded-[18px] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] px-3.5 py-3 shadow-[inset_0_1px_0_var(--dc-sheen)]">
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
          data-mobile-showcase-tabs
          className={`mt-5 grid min-w-0 ${
            showGradedTab ? "grid-cols-5" : "grid-cols-4"
          } gap-1 rounded-2xl border border-white/8 bg-black/22 p-1 text-[11px] font-bold text-white/48 min-[390px]:text-[13px]`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative min-h-10 min-w-0 rounded-xl px-1 transition-colors min-[390px]:px-2 ${
                effectiveActiveTab === tab.key
                  ? "bg-violet-600 text-white"
                  : "hover:bg-white/[0.06] hover:text-white/78"
              }`}
            >
              <span className="block truncate">{tab.label}</span>
            </button>
          ))}
        </nav>

        {showOverview && (
          <div data-mobile-showcase-card className="mt-3 rounded-[22px] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] p-3 shadow-[inset_0_1px_0_var(--dc-sheen)]">
            <div className="grid grid-cols-2 gap-2">
              <MobileInfoRow
                icon={<Sparkles className="h-4 w-4" />}
                label="Expansion"
                wide
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
                label="Illustrator"
                wide
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
              <MobileInfoRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="Release"
                wide
                value={
                  releaseDate ? (
                    <span>
                      {releaseDate.date}
                      <span className="ml-1.5 text-white/42">Set year {releaseDate.year}</span>
                    </span>
                  ) : (
                    "--"
                  )
                }
              />
            </div>
          </div>
        )}

        {showPreviousPrices && (
          <div data-mobile-showcase-card className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
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
              rangeStorageKey={`card-history-${card.id}`}
              rangeStorageLegacyKey={`card-mobile-${card.id}`}
            />
          </div>
        )}

        {showChart && (
          <div data-mobile-showcase-card className="mt-3 rounded-[22px] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] p-2.5 shadow-[inset_0_1px_0_var(--dc-sheen)]">
            <PriceHistoryPanel
              title="Price History"
              currency="EUR"
              points={cardMarketHistory}
              currentValue={activeCardMarketCurrentValue}
              tone="dark"
              layout="hero"
              rangeScopePoints={mobileHistoryRangeScopePoints}
              rangeStorageKey={`card-history-${card.id}`}
              rangeStorageLegacyKey={`card-mobile-${card.id}`}
              headerAccessory={
                <span className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-black/24 px-3 text-xs font-semibold text-white/76">
                  {activeCardMarketSeriesLabel}
                </span>
              }
            />
          </div>
        )}
      </div>

      <div className="relative z-10 mt-4">
        <CardModalMarketSignalPanel
          signal={signalSummary}
          card={card}
          loading={signalSummaryLoading}
          onNavigate={onClose}
        />
      </div>

      {showDemand ? (
        <div className="relative z-10 mt-4">
          <EbayCardDemandPanel cardId={card.id} compact />
        </div>
      ) : null}

      <div data-mobile-sticky-actions className="relative z-10 mt-4 rounded-[22px] border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-glass-strong)] p-2.5 shadow-[0_18px_42px_var(--dc-shadow-color),inset_0_1px_0_var(--dc-sheen)]">
        <div className="grid grid-cols-[1.1fr_0.8fr_1fr] gap-2">
          <CollectionAddCardButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label={collectionItem && !readOnlyCollectionItem ? "Add Copy" : "Add to Collection"}
            className="!min-h-12 !rounded-2xl !border-violet-300/35 !bg-violet-600/72 !px-2 !text-[13px] !font-bold !shadow-[0_16px_34px_rgb(var(--dc-primary-rgb)/0.24)]"
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
        <button
          type="button"
          onClick={onResearchSignal}
          disabled={researchingSignal}
          className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-violet-300/24 bg-[linear-gradient(135deg,rgb(var(--dc-primary-rgb)/0.24),rgb(var(--dc-cyan-rgb)/0.08))] px-3 text-[13px] font-bold text-violet-50 transition hover:border-violet-200/38 hover:bg-violet-500/[0.20] disabled:cursor-wait disabled:opacity-60"
        >
          {researchingSignal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          {researchingSignal ? "Building signal analysis..." : "Research this card"}
        </button>
        {signalResearchError ? (
          <p className="px-2 pt-2 text-center text-[10px] font-medium text-rose-200/72">
            {signalResearchError}
          </p>
        ) : null}
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
  const readOnlyCollectionItem = Boolean(collectionItem?.read_only);
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
  const releaseDate = formatReleaseDate(card.episode_release_date);
  const releaseDetailStat = {
    label: "Release",
    value: releaseDate ? (
      <div className="space-y-0.5">
        <p>{releaseDate.date}</p>
        <p className="text-sm font-medium text-white/42 max-[640px]:text-[11px]">
          Set year {releaseDate.year}
        </p>
      </div>
    ) : (
      "--"
    ),
    wideMobile: true,
  };
  const heroDetailStats = [
    {
      label: "Type",
      value: typeLabel || "--",
      wideMobile: false,
    },
    {
      label: "Expansion",
      value: (
        <CompactDetailLink href={getExpansionHref(card.episode_id)} onClick={onClose}>
          {card.episode_name}
        </CompactDetailLink>
      ),
      wideMobile: true,
    },
    {
      label: "Illustrator",
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
        releaseDetailStat,
      ]
    : [...heroDetailStats, releaseDetailStat];
  const desktopDetailStats = headerDetailStats;
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
          <h2 className={`${titleClass} !text-[2rem] font-bold leading-tight text-white 2xl:!text-[2.35rem]`}>
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
              {collectionItem ? (readOnlyCollectionItem ? "Shared" : "Saved") : "Not saved"}
            </span>
            {collectionLanguage && <span>{collectionLanguage}</span>}
            {gradingCompanyLabel && gradingGradeLabel && (
              <span className="text-violet-200/80">
                {gradingCompanyLabel} {gradingGradeLabel}
              </span>
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
  showCurrentValue = true,
  showModeControl = true,
  showGradedSelectionControl = true,
  selectedGradedDisplayPrice,
  onGradedDisplayPriceChange,
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
  showCurrentValue?: boolean;
  showModeControl?: boolean;
  showGradedSelectionControl?: boolean;
  selectedGradedDisplayPrice?: CardModalGradedDisplayPrice | null;
  onGradedDisplayPriceChange?: (price: CardModalGradedDisplayPrice | null) => void;
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
  const controlledGradedRow = selectedGradedDisplayPrice
    ? gradedRows.find((row) => row.key === selectedGradedDisplayPrice.selectionKey) ??
      gradedRows.find(
        (row) =>
          row.sourceType === selectedGradedDisplayPrice.source &&
          row.label === selectedGradedDisplayPrice.label
      ) ??
      null
    : null;
  const selectedGradedSource =
    controlledGradedRow?.sourceType ??
    (gradedSelection.cardId === card.id ? gradedSelection.source : fallbackGradedSource);
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
    controlledGradedRow ??
    gradedSourceRows.find((row) => row.label === selectedGradedSlabLabel) ??
    getPreferredGradedRow(gradedSourceRows);
  const gradedChartCurrency =
    selectedGradedRow?.chartCurrency ?? selectedGradedRow?.currency ?? "EUR";

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
  const showCardMarketSeriesPicker =
    effectiveHistoryChartMode === "market" &&
    activeMarketSource === "cardmarket" &&
    availableCardMarketHistorySeries.length > 0;
  const showRawSourceToggle = effectiveHistoryChartMode === "market" && showTcgPlayerSource;
  const historyRangeScopePoints = [
    ...activeMarketHistory.points,
    ...gradedPriceHistory.flatMap((series) => series.points),
    ...ebaySoldGradedPriceHistory.flatMap((series) => series.points),
  ];
  const historySourceToggleClass =
    "flex min-w-0 max-w-full items-center gap-1";
  const historyModeToggleClass =
    "flex h-11 min-w-0 max-w-full shrink-0 items-center gap-1";
  const historyModeToggleButtonClass =
    "inline-flex min-h-10 min-w-[4.4rem] items-center justify-center rounded-xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] px-2 text-center text-[12px] font-bold leading-none text-[rgb(var(--dc-text-primary-rgb)/0.58)] transition-colors hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]";
  const historySourceToggleButtonClass =
    "inline-flex min-h-9 min-w-0 items-center justify-center rounded-lg border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] px-2.5 text-center text-[11px] font-bold leading-none text-[rgb(var(--dc-text-primary-rgb)/0.62)] transition-colors hover:border-[rgb(var(--dc-primary-rgb)/0.28)] hover:bg-[rgb(var(--dc-primary-rgb)/0.07)] hover:text-[var(--dc-text-primary)]";
  const historySourceToggleActiveClass =
    "!border-[rgb(var(--dc-primary-rgb)/0.38)] !bg-[rgb(var(--dc-primary-rgb)/0.12)] !text-[var(--dc-primary)] shadow-[inset_0_1px_0_var(--dc-sheen)]";
  const chartHeaderChipClass =
    "inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-black/24 px-3 text-xs font-semibold text-white/76";
  const historyModeSwitchControl = hasGradedData && showModeControl ? (
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
              : ""
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  ) : null;
  const cardMarketSeriesPickerControl =
    effectiveHistoryChartMode === "market" && showCardMarketSeriesPicker ? (
      <label
        className="relative inline-flex h-11 w-[5.75rem] shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/25 pl-2.5 pr-7 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/18 hover:text-white focus-within:border-violet-300/34 focus-within:ring-2 focus-within:ring-violet-300/35"
        data-card-detail-language-control
        data-card-detail-chart-series-control="language"
      >
        <Globe2 className="h-3.5 w-3.5 shrink-0 text-violet-200/64" aria-hidden="true" />
        <span className="text-[12px] font-black">
          {availableCardMarketHistorySeries.find(
            (series) => series.key === activeCardMarketHistorySeries
          )?.label ?? activeCardMarketSeriesLabel}
        </span>
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-white/38" />
        <select
          aria-label="Select market language"
          value={activeCardMarketHistorySeries}
          onChange={(event) =>
            onSelectCardMarketHistorySeries(event.target.value as CardMarketHistorySeriesKey)
          }
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {availableCardMarketHistorySeries.map((series) => (
            <option key={series.key} value={series.key} className="bg-[var(--dc-surface-primary)] text-[var(--dc-text-primary)]">
              {series.label}
            </option>
          ))}
        </select>
      </label>
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
              : ""
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  ) : null;
  const historyHeaderPrimaryControls = historyModeSwitchControl ? (
      <div className="dc-compact-segment-row flex min-w-0 shrink-0 flex-nowrap items-center gap-1.5">
        {historyModeSwitchControl}
      </div>
    ) : null;
  const historyHeaderLeadingAccessory =
    historyHeaderPrimaryControls || cardMarketSeriesPickerControl ? (
      <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5">
        {historyHeaderPrimaryControls}
        {cardMarketSeriesPickerControl}
      </div>
    ) : null;
  const rawHeaderAccessory =
    rawSourceSwitchControl ?? (
      showCardMarketSeriesPicker ? null : (
        <span className={chartHeaderChipClass}>
          {activeMarketSource === "cardmarket" ? activeCardMarketSeriesLabel : "Market"}
        </span>
      )
    );
  const gradedSlabSelectControl = showGradedSelectionControl ? (
    <GradedSlabSelectControl
      rows={gradedRows}
      selectedRow={selectedGradedRow}
      onChange={(selectionKey) => {
        const nextRow = gradedRows.find((row) => row.key === selectionKey) ?? null;
        setGradedSelection({
          cardId: card.id,
          source: nextRow?.sourceType ?? effectiveGradedSource,
          label: nextRow?.label ?? "",
        });
        onGradedDisplayPriceChange?.(toGradedDisplayPrice(nextRow));
      }}
      variant="chart"
      valueMode="key"
    />
  ) : null;
  const gradedHeaderLeadingAccessory = historyModeSwitchControl || gradedSlabSelectControl ? (
    <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5">
      {historyModeSwitchControl}
      {gradedSlabSelectControl}
    </div>
  ) : null;
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
                showCurrentValue={showCurrentValue}
                headerLeadingAccessory={gradedHeaderLeadingAccessory}
                headerStatus={<CardPriceStatusLine card={card} className="!border-b-0 !pb-0" />}
                tone="dark"
                layout="hero"
                stabilizeMobileHeader
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
                showCurrentValue={showCurrentValue}
                headerLeadingAccessory={historyHeaderLeadingAccessory}
                headerAccessory={rawHeaderAccessory}
                headerStatus={<CardPriceStatusLine card={card} className="!border-b-0 !pb-0" />}
                tone="dark"
                layout="hero"
                stabilizeMobileHeader
                rangeScopePoints={historyRangeScopePoints}
                rangeStorageKey={`card-history-${card.id}`}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const CARD_MODAL_SUPPORT_PANEL_CLASS =
  "min-w-0 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.022))] p-4";
const CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS = "text-sm font-semibold text-white";

const MARKET_STATS_METRICS = [
  {
    key: "momentum",
    label: "Momentum",
    description:
      "Is the price going up or down? Based on the last 7, 30 and 90 days. 50 is neutral — higher means the price is rising.",
  },
  {
    key: "stability",
    label: "Stability",
    description:
      "How steady the price is. A high score means smooth movement without wild day-to-day jumps.",
  },
  {
    key: "liquidity",
    label: "Liquidity",
    description:
      "How easy it is to buy or sell this card right now, based on how many copies are actually listed on eBay.",
  },
  {
    key: "grade_premium",
    label: "Grade Premium",
    description:
      "How much more a top-graded copy (PSA 10, BGS 9.5 or CGC 10) is worth compared to an ungraded one.",
  },
  {
    key: "demand",
    label: "Demand",
    description:
      "How fast listings disappear compared to how many new ones show up. Listings vanishing quickly usually means more buyers.",
  },
  {
    key: "market_depth",
    label: "Market Depth",
    description:
      "How widely this card is traded overall: CardMarket languages, eBay stock and graded sales combined.",
  },
] as const;

function MarketStatsInfo({ label, description }: { label: string; description: string }) {
  return <ReadableInfoTooltip label={label} description={description} />;
}

function getMarketStatsTierClass(tier: NonNullable<ModalCardData["market_stats"]>["tier"]): string {
  if (tier === "STRONG" || tier === "POSITIVE") {
    return "border-emerald-300/20 bg-emerald-400/[0.1] text-emerald-200";
  }
  if (tier === "CAUTION" || tier === "WEAK") {
    return "border-amber-300/20 bg-amber-400/[0.1] text-amber-100";
  }
  if (tier === "BUILDING") {
    return "border-white/10 bg-white/[0.045] text-white/48";
  }
  return "border-cyan-300/20 bg-cyan-400/[0.09] text-cyan-100";
}

function getMarketStatsBarClass(value: number | null): string {
  if (value == null) return "bg-white/16";
  if (value >= 65) return "bg-gradient-to-r from-emerald-500 to-cyan-300";
  if (value >= 45) return "bg-gradient-to-r from-sky-500 to-cyan-300";
  return "bg-gradient-to-r from-amber-500 to-orange-300";
}

function formatMarketStatsNumber(value: number | null, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}${suffix}`;
}

function MarketStatsMetricRow({
  stats,
  metric,
}: {
  stats: NonNullable<ModalCardData["market_stats"]>;
  metric: (typeof MARKET_STATS_METRICS)[number];
}) {
  const value = stats.metrics[metric.key];
  const comparison = stats.tcggo?.[metric.key] ?? null;
  const marketSource = metric.key === "liquidity"
    ? stats.metric_sources.liquidity
    : metric.key === "demand"
      ? stats.metric_sources.demand
      : null;
  let sourceLabel: string | null = null;
  let sourceDescription = "";
  if (marketSource === "ebay_inventory" || marketSource === "ebay_lifecycle") {
    sourceLabel = "eBay";
  } else if (marketSource === "ebay_sales_proxy") {
    sourceLabel = "sold proxy";
    sourceDescription = metric.key === "liquidity"
      ? " We do not have a live count of ungraded listings for this card, so this is an estimate based on graded eBay sales and CardMarket data. It does not affect the total score."
      : " We do not have enough listing history for this card yet, so this is an estimate based on graded eBay sales and the recent price trend. It does not affect the total score.";
  } else if (marketSource === "market_proxy") {
    sourceLabel = "proxy";
    sourceDescription = " No live eBay stock data for this card yet, so this is an estimate based on CardMarket data. It does not affect the total score.";
  } else if (marketSource === "price_proxy") {
    sourceLabel = "proxy";
    sourceDescription = " Not enough listing history for this card yet, so this is an estimate based on the recent price trend. It does not affect the total score.";
  } else if (marketSource === "neutral_prior") {
    sourceLabel = "neutral";
    sourceDescription = " Not enough data yet — this bar is a neutral placeholder and does not affect the total score.";
  }
  const description = `${metric.description}${sourceDescription}`;

  return (
    <div
      data-market-metric={metric.key}
      data-market-source={marketSource ?? undefined}
      className="min-w-0"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold text-white/62">
          <span className="truncate">{metric.label}</span>
          <MarketStatsInfo label={metric.label} description={description} />
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm font-bold tabular-nums text-white/82">
          {sourceLabel ? (
            <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/32">
              {sourceLabel}
            </span>
          ) : null}
          {comparison != null && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/34">
              TCGGO {formatMarketStatsNumber(comparison)}
            </span>
          )}
          {formatMarketStatsNumber(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${getMarketStatsBarClass(value)}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function MarketStatsFact({
  label,
  description,
  value,
  comparison,
}: {
  label: string;
  description: string;
  value: string;
  comparison?: string | null;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/16 px-3 py-3">
      <span className="flex min-w-0 items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white/40">
        {label}
        <MarketStatsInfo label={label} description={description} />
      </span>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-white/86">{value}</p>
      {comparison && (
        <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-white/32">
          TCGGO {comparison}
        </p>
      )}
    </div>
  );
}

function CardModalMarketStatsContent({
  stats,
}: {
  stats: NonNullable<ModalCardData["market_stats"]>;
}) {
  const rsiDetail = stats.rsi == null
    ? "Shows whether a card looks overheated (above 70) or like a dip (below 30). It needs at least 15 saved price points before it can be calculated."
    : "Shows whether the card looks overheated or cheap right now. Above 70 means the price may have risen too fast; below 30 may be a buying dip.";

  return (
    <>
      <div className="mt-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/42">
          Market drivers
        </p>
        <div className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
          {MARKET_STATS_METRICS.map((metric) => (
            <MarketStatsMetricRow key={metric.key} stats={stats} metric={metric} />
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/16 px-3 py-3">
          <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white/38">
            RSI
            <MarketStatsInfo label="RSI" description={rsiDetail} />
          </span>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-base font-bold tabular-nums text-white/82">
              {formatMarketStatsNumber(stats.rsi)}
            </p>
            <p className={`truncate text-[11px] font-semibold ${stats.rsi_label === "Overbought" ? "text-rose-300/72" : stats.rsi_label === "Oversold" ? "text-sky-300/72" : "text-white/34"}`}>
              {stats.rsi_label ?? "Building"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/16 px-3 py-3">
          <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white/38">
            Volatility
            <MarketStatsInfo
              label="Volatility"
              description="How wildly the price swings. A higher percentage means bigger ups and downs over time."
            />
          </span>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-base font-bold tabular-nums text-white/82">
              {formatMarketStatsNumber(stats.volatility_percent, "%")}
            </p>
            <p className="text-[11px] font-semibold text-white/34">Annualized</p>
          </div>
        </div>
      </div>

      <details className="group/market-details mt-3 rounded-xl border border-white/[0.07] bg-black/14 open:bg-black/20">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-bold text-white/56 marker:hidden">
          <span>More market details</span>
          <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/30">
            <span className="hidden truncate min-[390px]:inline">ATH · ATL · grading</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/market-details:rotate-180" />
          </span>
        </summary>

        <div className="border-t border-white/[0.06] p-3">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            <MarketStatsFact
              label="ATH"
              description="All-time high: the highest price we have ever recorded for this card."
              value={formatCurrency(stats.ath, "EUR")}
              comparison={stats.tcggo?.ath == null ? null : formatCurrency(stats.tcggo.ath, "EUR")}
            />
            <MarketStatsFact
              label="ATL"
              description="All-time low: the lowest price we have ever recorded for this card."
              value={formatCurrency(stats.atl, "EUR")}
              comparison={stats.tcggo?.atl == null ? null : formatCurrency(stats.tcggo.atl, "EUR")}
            />
            <MarketStatsFact
              label="Lang spread"
              description="The price gap between the cheapest and most expensive language version of this card on CardMarket right now."
              value={formatCurrency(stats.language_spread, "EUR")}
              comparison={stats.language_spread_percent == null ? null : `${formatMarketStatsNumber(stats.language_spread_percent, "%")} range`}
            />
          </div>

          <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/16 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white/42">
                Graded vs raw
                <MarketStatsInfo
                  label="Graded versus raw"
                  description="What graded copies of this exact card actually sell for, compared to the ungraded price. Real eBay sales count more than asking prices."
                />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-white/30">EUR</span>
            </div>
            <div className="mt-1">
              {stats.graded_comparisons.length > 0 ? (
                stats.graded_comparisons.map((comparison) => (
                  <div key={`${comparison.label}-${comparison.source}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] py-2 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-white/74">{comparison.label}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-white/34">
                        {comparison.source === "ebay_sold"
                          ? `eBay sold${comparison.sample_size ? ` · ${comparison.sample_size} sale${comparison.sample_size === 1 ? "" : "s"}` : ""} · ${comparison.reliability} evidence`
                          : `CardMarket graded quote · ${comparison.reliability} evidence`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold tabular-nums text-white/84">
                        {formatCurrency(comparison.price_eur, "EUR")}
                      </p>
                      <p className="mt-0.5 text-xs font-black tabular-nums text-amber-200/78">
                        {comparison.raw_multiple == null ? "--" : `${formatMarketStatsNumber(comparison.raw_multiple)}x raw`}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-3 text-center text-[13px] font-medium text-white/36">
                  No usable graded comparison yet.
                </p>
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] font-medium leading-relaxed text-white/32">
            When data is missing, that part stays neutral. These stats are helpful signals, not a guarantee.
          </p>
        </div>
      </details>
    </>
  );
}

function getOwnedCopyPrice(
  card: ModalCardData,
  collectionItem: ModalCardCollectionItem | null
): number | null {
  return (
    collectionItem?.cost_basis_value ??
    collectionItem?.purchase_price ??
    card.price?.cm_en_lowest_nm ??
    [...card.price_history].reverse().find((point) => point.cm_market_en != null)?.cm_market_en ??
    null
  );
}

function getRecentDesktopPricePoints(card: ModalCardData): Array<{ label: string; value: number }> {
  return card.price_history
    .map((point) => ({
      label: point.label,
      value:
        point.cm_market_en ?? null,
    }))
    .filter((point): point is { label: string; value: number } => point.value != null)
    .slice(-5)
    .reverse();
}

function OwnedCopyCardImage({
  sourceUrl,
  alt,
}: {
  sourceUrl: string;
  alt: string;
}) {
  const [loadedAspect, setLoadedAspect] = useState<{
    sourceUrl: string;
    ratio: number;
  } | null>(null);
  const aspectRatio = loadedAspect?.sourceUrl === sourceUrl ? loadedAspect.ratio : 63 / 88;

  return (
    <div
      data-owned-copy-card-frame
      className={getCardImageFrameClassName(
        sourceUrl,
        "relative w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10"
      )}
      style={{ aspectRatio }}
    >
      <CachedImage
        sourceUrl={sourceUrl}
        alt={alt}
        fill
        sizes="72px"
        className={getCardImageClassName(sourceUrl, "object-contain")}
        style={{ objectFit: "contain" }}
        unoptimized
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            setLoadedAspect({ sourceUrl, ratio: naturalWidth / naturalHeight });
          }
        }}
      />
    </div>
  );
}

export function CardModalOwnedCopyPanel({
  card,
  collectionItem,
  onAddedToCollection,
  className = "",
  showActions = true,
}: {
  card: ModalCardData;
  collectionItem: ModalCardCollectionItem | null;
  onAddedToCollection?: () => void | Promise<void>;
  className?: string;
  showActions?: boolean;
}) {
  const collectionCard = buildCollectionCard(card);
  if (!collectionItem) {
    return (
      <section className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} flex flex-col ${className}`}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/52">
            <Package className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className={CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>Collection status</h3>
            <p className="mt-0.5 text-xs text-white/46">Not in your collection</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-white/52">
          Add a copy to save its condition, language and purchase price.
        </p>
        {showActions ? <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-2">
          <CollectionAddCardButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label="Add to Collection"
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
        </div> : null}
      </section>
    );
  }
  const ownedPrice = getOwnedCopyPrice(card, collectionItem);
  const readOnlyCollectionItem = Boolean(collectionItem?.read_only);
  const usesSealedPriceBasis = collectionItem?.purchase_price_source === "sealed_origin";
  const priceLabel = usesSealedPriceBasis
    ? "Sealed basis"
    : collectionItem?.cost_basis_value != null
      ? "Cost basis"
      : collectionItem?.purchase_price != null
        ? "Purchase price"
        : "English NM market";

  return (
    <section
      className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} card-detail-owned-copy flex flex-col ${className}`}
      data-card-detail-owned-copy
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/42">
            Collection copy
          </p>
          <h3 className={`mt-1 ${CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}`}>
            {readOnlyCollectionItem
              ? "Shared Copy"
              : collectionItem?.for_sale
                ? "For Sale Copy"
                : collectionItem
                  ? "Owned Copy"
                  : "Add to Collection"}
          </h3>
        </div>
        {collectionItem && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-300/18 bg-violet-500/16 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-100/86">
            <Sparkles className="h-3.5 w-3.5" />
            {readOnlyCollectionItem ? "Shared" : collectionItem.for_sale ? "For sale" : "Owned"}
          </span>
        )}
      </div>

      <div
        className={
          card.image_url
            ? "mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
            : "mt-3"
        }
      >
        {card.image_url && <OwnedCopyCardImage sourceUrl={card.image_url} alt={card.name} />}
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/9 bg-white/[0.045] px-2 py-1 text-[11px] font-semibold text-white/82">
              {collectionItem.condition ?? "Unknown"}
            </span>
            <span className="truncate text-[11px] font-medium text-white/42">
              {collectionItem.language ?? "Language unknown"}
            </span>
          </div>

          <dl className="mt-3 grid min-w-0 grid-cols-[0.85fr_1.15fr] gap-2">
            <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/16 px-2.5 py-2">
              <dt className="truncate text-[9px] font-bold uppercase tracking-[0.11em] text-white/32">
                {priceLabel}
              </dt>
              <dd className="mt-1 truncate text-sm font-bold tabular-nums text-white/90">
                {formatCurrency(ownedPrice, "EUR")}
              </dd>
            </div>
            <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/16 px-2.5 py-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.11em] text-white/32">
                Location
              </dt>
              <dd className={`mt-1 truncate text-xs font-semibold ${collectionItem.for_sale ? "text-amber-200/76" : "text-white/68"}`}>
                {collectionItem.for_sale ? "For sale" : collectionItem.binder_name ?? "Singles"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {collectionItem.origin_sealed_product ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-amber-300/14 bg-amber-300/[0.045] p-2.5">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/9 bg-white/[0.04]">
            {collectionItem.origin_sealed_product.image_url ? (
              <CachedImage
                sourceUrl={collectionItem.origin_sealed_product.image_url}
                alt=""
                fill
                sizes="40px"
                className="object-contain p-1"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-amber-100/48">
                <Package className="h-4 w-4" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-amber-100/44">
              Pulled from sealed
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-white/76">
              {collectionItem.origin_sealed_product.name}
            </p>
            {usesSealedPriceBasis && collectionItem.origin_sealed_product.price_basis != null ? (
              <p className="mt-0.5 text-[10px] text-white/38">
                Sealed reference {formatCurrency(collectionItem.origin_sealed_product.price_basis, "EUR")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showActions ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <CollectionAddCardButton
          card={collectionCard}
          mode="button"
          theme="dark"
          label={collectionItem && !readOnlyCollectionItem ? "Add Another Copy" : "Add to Collection"}
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
      </div> : null}
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
    <section className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} flex flex-col ${className}`}>
      <h3 className={CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>Recent Prices</h3>
      <div className="mt-3 grid flex-1 auto-rows-fr gap-0">
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

export function CardModalRelatedPrintingsPanel({
  card,
  onNavigate,
}: {
  card: ModalCardData;
  onNavigate?: () => void;
  context?: "standard" | "radar";
}) {
  const [allPrintingsOpen, setAllPrintingsOpen] = useState(false);
  const [reportingPrintingId, setReportingPrintingId] = useState<string | null>(null);
  const [reportedPrintingId, setReportedPrintingId] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const printings = card.related_printings ?? [];

  async function reportIncorrectPrinting(printing: NonNullable<ModalCardData["related_printings"]>[number]) {
    if (reportingPrintingId) return;
    setReportingPrintingId(printing.id);
    setReportError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "reprint",
          message: `Incorrect reprint match: ${card.name} [${card.id}] is linked to ${printing.name} (${printing.episode_name} ${printing.card_number ?? "no number"}) [${printing.id}].`,
          pageUrl: window.location.href,
        }),
      });
      if (!response.ok) throw new Error("Could not report this match");
      setReportedPrintingId(printing.id);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not report this match");
    } finally {
      setReportingPrintingId(null);
    }
  }

  useEffect(() => {
    if (!allPrintingsOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAllPrintingsOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [allPrintingsOpen]);

  if (printings.length === 0) return null;

  const visiblePrintings = printings.slice(0, 4);
  const hasMore = printings.length > visiblePrintings.length;

  const currentPrice = card.price?.cm_en_lowest_nm ?? null;
  const availablePrices = printings
    .map((printing) => printing.price)
    .filter((price): price is number => price != null);
  const comparisonPrices = currentPrice == null
    ? availablePrices
    : [currentPrice, ...availablePrices];
  const lowestPrice = comparisonPrices.length > 0 ? Math.min(...comparisonPrices) : null;
  const allPrintings = [
    {
      id: card.id,
      name: card.name,
      card_number: card.card_number,
      version: card.version ?? null,
      rarity: card.rarity,
      image_url: card.image_url,
      episode_id: card.episode_id,
      episode_name: card.episode_name,
      episode_release_date: card.episode_release_date,
      price: currentPrice,
      isCurrent: true,
    },
    ...printings.map((printing) => ({ ...printing, isCurrent: false })),
  ];

  return (
    <>
      <section
        className={`card-detail-surface card-detail-related-printings ${printings.length === 1 ? "card-detail-related-printings--compact" : ""}`}
        data-card-related-printings
      >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="card-detail-eyebrow">Print family</p>
          <h2 className="card-detail-surface-title mt-1.5">Related printings</h2>
          <p className="card-detail-surface-copy">
            Pre-matched from card rules, artwork and print variants.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-violet-300/16 bg-violet-400/[0.07] px-2.5 py-1 text-[11px] font-bold text-violet-100/72">
          {printings.length + 1} editions
        </span>
      </div>

      <div className="card-detail-printing-rail mt-4" aria-label="Other card printings">
        {visiblePrintings.map((printing) => {
          const isLowest = printing.price != null && printing.price === lowestPrice;
          const isCheaper =
            printing.price != null && currentPrice != null && printing.price < currentPrice;
          const detailHref = `${getExpansionHref(printing.episode_id)}?card=${encodeURIComponent(printing.id)}`;
          const savings = isCheaper && currentPrice && printing.price != null
            ? Math.round((1 - printing.price / currentPrice) * 100)
            : null;
          const releaseYear = printing.episode_release_date?.slice(0, 4) ?? null;

          return (
            <Link
              key={printing.id}
              href={detailHref}
              onClick={onNavigate}
              className="card-detail-printing-card group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"
              aria-label={`View ${printing.name} from ${printing.episode_name}`}
            >
              <div
                className={getCardImageFrameClassName(
                  printing.image_url,
                  "relative aspect-[63/88] w-[4.35rem] shrink-0 self-start overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-[0_10px_20px_rgba(0,0,0,0.22)]"
                )}
              >
                {printing.image_url ? (
                  <CachedImage
                    sourceUrl={printing.image_url}
                    alt=""
                    fill
                    sizes="70px"
                    className={getCardImageClassName(printing.image_url, "object-contain")}
                    unoptimized
                  />
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col py-0.5">
                <div className="flex min-w-0 items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white/92">
                      {printing.episode_name}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-white/36">
                      {printing.card_number ? `#${printing.card_number}` : "No number"}
                      {releaseYear ? ` · ${releaseYear}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/24 transition group-hover:text-violet-200/70" />
                </div>

                <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-white/30">
                  {printing.version ?? printing.rarity ?? "Standard printing"}
                </p>

                <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                  <div>
                    <p className="text-base font-black tabular-nums text-white/94">
                      {printing.price == null ? "No price" : formatCurrency(printing.price, "EUR")}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-white/28">
                      English NM
                    </p>
                  </div>
                  {isLowest || isCheaper ? (
                    <span className="shrink-0 rounded-full border border-emerald-300/14 bg-emerald-400/[0.06] px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-emerald-200/78">
                      {isLowest ? "Lowest" : savings != null ? `${savings}% less` : "Cheaper"}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {hasMore || printings.length > 1 ? (
        <button
          type="button"
          onClick={() => setAllPrintingsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={allPrintingsOpen}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/15 bg-violet-400/[0.055] px-4 text-sm font-bold text-violet-100/78 transition hover:border-violet-300/25 hover:bg-violet-400/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"
        >
          Compare all {printings.length + 1} editions
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
      </section>

      {allPrintingsOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`${modalCenteredMobileOverlayClass} z-[420]`}
              data-card-printings-dialog-overlay
              onClick={(event) => {
                event.stopPropagation();
                setAllPrintingsOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="card-printings-dialog-title"
                data-card-printings-dialog
                className={`${modalCenteredPanelClass} max-w-[72rem]`}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <header className={modalCompactHeaderClass}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-400/[0.08] text-violet-200/80 max-[640px]:h-9 max-[640px]:w-9">
                      <Repeat2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/48">
                        Print family · {allPrintings.length} editions
                      </p>
                      <h2
                        id="card-printings-dialog-title"
                        className="mt-1 truncate text-xl font-black text-white max-[640px]:text-lg"
                      >
                        {card.name}
                      </h2>
                      <p className="mt-1 text-xs font-medium text-white/42 max-[640px]:line-clamp-1">
                        Compare every related printing without leaving card detail.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setAllPrintingsOpen(false)}
                    className={modalCloseButtonClass}
                    aria-label="Close print comparison"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>

                <div className={`${modalBodyClass} !pt-3`}>
                  {reportError ? (
                    <p className="mb-2 rounded-xl border border-rose-300/14 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-100">
                      {reportError}
                    </p>
                  ) : null}
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {allPrintings.map((printing) => {
                      const releaseYear = printing.episode_release_date?.slice(0, 4) ?? null;
                      const isLowest = printing.price != null && printing.price === lowestPrice;
                      const detailHref = `${getExpansionHref(printing.episode_id)}?card=${encodeURIComponent(printing.id)}`;

                      return (
                        <article
                          key={printing.id}
                          className={`grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border p-2.5 ${
                            printing.isCurrent
                              ? "border-violet-300/22 bg-violet-400/[0.075]"
                              : "border-white/[0.075] bg-white/[0.025]"
                          }`}
                        >
                          <div
                            className={getCardImageFrameClassName(
                              printing.image_url,
                              "relative aspect-[63/88] w-[4.5rem] overflow-hidden rounded-lg border border-white/10 bg-black/20"
                            )}
                          >
                            {printing.image_url ? (
                              <CachedImage
                                sourceUrl={printing.image_url}
                                alt=""
                                fill
                                sizes="72px"
                                className={getCardImageClassName(printing.image_url, "object-contain")}
                                unoptimized
                              />
                            ) : null}
                          </div>

                          <div className="flex min-w-0 flex-col py-0.5">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white/92">
                                  {printing.episode_name}
                                </p>
                                <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-white/38">
                                  {printing.card_number ? `#${printing.card_number}` : "No number"}
                                  {releaseYear ? ` · ${releaseYear}` : ""}
                                </p>
                              </div>
                              {printing.isCurrent ? (
                                <span className="shrink-0 rounded-full border border-violet-300/18 bg-violet-400/[0.08] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-violet-100/78">
                                  Current
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-white/30">
                              {printing.version ?? printing.rarity ?? "Standard printing"}
                            </p>

                            <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                              <div>
                                <p className="text-base font-black tabular-nums text-white/94">
                                  {printing.price == null ? "No price" : formatCurrency(printing.price, "EUR")}
                                </p>
                                <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-white/28">
                                  English NM
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {isLowest ? (
                                  <span className="rounded-full border border-emerald-300/14 bg-emerald-400/[0.06] px-2 py-1 text-[8px] font-black uppercase tracking-[0.07em] text-emerald-200/80">
                                    Lowest
                                  </span>
                                ) : null}
                                {!printing.isCurrent && "match_type" in printing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void reportIncorrectPrinting(printing)}
                                      disabled={reportingPrintingId === printing.id || reportedPrintingId === printing.id}
                                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/9 bg-white/[0.025] px-2.5 text-[10px] font-bold text-white/44 transition hover:border-rose-300/18 hover:text-rose-100 disabled:cursor-default disabled:text-emerald-200/70"
                                    >
                                      {reportingPrintingId === printing.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
                                      {reportedPrintingId === printing.id ? "Reported" : "Not correct"}
                                    </button>
                                    <Link
                                      href={detailHref}
                                      onClick={() => {
                                        setAllPrintingsOpen(false);
                                        onNavigate?.();
                                      }}
                                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/9 bg-white/[0.035] px-2.5 text-[10px] font-bold text-white/58 transition hover:border-violet-300/22 hover:text-violet-100"
                                    >
                                      Open
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    </Link>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function CardModalActiveListingsPanel({
  card,
  onOpenSealedProduct,
  onClose,
  className = "",
  compact = false,
}: {
  card: ModalCardData;
  onOpenSealedProduct?: (product: NonNullable<ModalCardData["sealed_products"]>[number]) => void;
  onClose?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const sealedProducts = (card.sealed_products ?? []).slice(0, compact ? 8 : 4);
  const sealedProductCount = card.sealed_product_count ?? card.sealed_products?.length ?? 0;

  return (
    <section
      className={`${
        compact
          ? "card-detail-sealed-strip min-w-0 rounded-[20px] border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-elevated-rgb)/0.82),rgb(var(--dc-surface-primary-rgb)/0.92))] p-3 shadow-[inset_0_1px_0_var(--dc-sheen)]"
          : CARD_MODAL_SUPPORT_PANEL_CLASS
      } flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className={compact ? "text-sm font-extrabold text-[var(--dc-text-primary)]" : CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>Find in Sealed</h3>
          {!compact ? (
            <p className="mt-1 truncate text-[11px] font-medium text-white/38">
              Products connected to {card.episode_name}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--dc-primary-rgb)/0.18)] bg-[rgb(var(--dc-primary-rgb)/0.07)] px-2 py-1 text-[10px] font-semibold text-[var(--dc-primary)]">
            <Package className="h-3 w-3" />
            {sealedProductCount}
          </span>
          {compact ? (
            <Link
              href={`/cards/${encodeURIComponent(card.id)}/sealed`}
              prefetch={false}
              onClick={onClose}
              className="text-[10px] font-bold text-[rgb(var(--dc-text-primary-rgb)/0.48)] transition-colors hover:text-[var(--dc-primary)] hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>
      </div>

      {sealedProducts.length > 0 ? (
        <div
          className={
            compact
              ? "card-detail-sealed-product-rail mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
              : "mt-3 grid grid-cols-2 gap-2"
          }
        >
          {sealedProducts.map((product) => {
            const price =
              product.price.cm_lowest_eu ??
              product.price.cm_lowest ??
              product.price.cm_lowest_de ??
              product.price.cm_lowest_fr ??
              product.price.cm_lowest_es ??
              product.price.cm_lowest_it;

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onOpenSealedProduct?.(product)}
                disabled={!onOpenSealedProduct}
                className={`group flex min-w-0 items-center gap-3 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.76)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.62)] p-2.5 text-left transition-colors hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:bg-[rgb(var(--dc-primary-rgb)/0.055)] disabled:cursor-default ${compact ? "w-[min(15rem,76vw)] shrink-0 snap-start" : ""}`}
              >
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/8 bg-black/20 2xl:h-[4.5rem] 2xl:w-[4.5rem]">
                  {product.image_url ? (
                    <CachedImage
                      sourceUrl={product.image_url}
                      alt={product.name}
                      fill
                      sizes="(max-width: 1536px) 64px, 72px"
                      className="object-contain p-1"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-white/25">
                      <Package className="h-5 w-5" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[11px] font-semibold leading-4 text-white/78 transition-colors group-hover:text-white">
                    {product.name}
                  </span>
                  <span className="mt-1 block text-xs font-bold tabular-nums text-violet-200/88">
                    {price == null ? "Price unavailable" : formatCurrency(price, "EUR")}
                  </span>
                  {product.match_type === "mixed_pack" ? (
                    <span className="mt-1 inline-flex rounded-full border border-amber-300/14 bg-amber-300/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-amber-100/70">
                      Mixed packs
                    </span>
                  ) : product.match_type === "included_promo" ? (
                    <span className="mt-1 inline-flex rounded-full border border-sky-300/14 bg-sky-300/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-sky-100/70">
                      Included promo
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 px-3 py-6 text-center">
          <p className="text-xs font-medium leading-5 text-white/38">
            No matching sealed products are linked to this set yet.
          </p>
        </div>
      )}

      {!compact ? (
        <>
          <Link
            href={`/cards/${encodeURIComponent(card.id)}/sealed`}
            prefetch={false}
            onClick={onClose}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-400/22 bg-violet-500/[0.10] px-3 text-sm font-semibold text-violet-100 transition-colors hover:border-violet-300/35 hover:bg-violet-500/[0.16] hover:text-white"
          >
            View every product containing this card
            <ChevronRight className="h-4 w-4" />
          </Link>
          <p className="mt-2 text-[10px] font-medium leading-relaxed text-white/28">
            Includes set packs, verified mixed products and directly included promos.
          </p>
        </>
      ) : null}
    </section>
  );
}

export function CardModalCardLinksPanel({
  card,
  storedCardMarketUrl,
  onOpenCardMarket,
  onResearchSignal,
  researchingSignal = false,
  signalResearchError = null,
  className = "",
}: {
  card: ModalCardData;
  storedCardMarketUrl: string | null;
  onOpenCardMarket: () => void;
  onResearchSignal?: () => void;
  researchingSignal?: boolean;
  signalResearchError?: string | null;
  className?: string;
}) {
  return (
    <section className={`${CARD_MODAL_SUPPORT_PANEL_CLASS} flex flex-col ${className}`}>
      <div>
        <h3 className={CARD_MODAL_SUPPORT_PANEL_TITLE_CLASS}>Card Links</h3>
        <p className="mt-1 text-[11px] font-medium text-white/38">
          Compare this specific card on external markets.
        </p>
      </div>

      <div className="mt-4 grid gap-2">
        {storedCardMarketUrl ? (
          <a
            href={storedCardMarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={DETAIL_MARKET_LINK_CLASS}
          >
            CardMarket
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <button type="button" onClick={onOpenCardMarket} className={DETAIL_MARKET_LINK_CLASS}>
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
          className={DETAIL_MARKET_LINK_CLASS}
        >
          eBay Deals
          <ExternalLink className="h-4 w-4" />
        </a>

        {onResearchSignal ? (
          <button
            type="button"
            onClick={onResearchSignal}
            disabled={researchingSignal}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/24 bg-[linear-gradient(135deg,rgb(var(--dc-primary-rgb)/0.22),rgb(var(--dc-cyan-rgb)/0.07))] px-3 text-sm font-semibold text-violet-50 transition hover:border-violet-200/38 hover:bg-violet-500/[0.18] disabled:cursor-wait disabled:opacity-60"
          >
            {researchingSignal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {researchingSignal ? "Building signal analysis..." : "Research this card"}
          </button>
        ) : null}
      </div>

      {signalResearchError ? (
        <p className="mt-2 text-[10px] font-medium leading-4 text-rose-200/72">
          {signalResearchError}
        </p>
      ) : null}

      <p className="mt-auto pt-4 text-[10px] font-medium leading-relaxed text-white/28">
        Opens in a new tab; sealed-product links are kept in their own panel.
      </p>
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
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <CardModalOwnedCopyPanel
          card={card}
          collectionItem={collectionItem}
          onAddedToCollection={onAddedToCollection}
        />
        <CardModalRecentPricesPanel card={card} />
        <CardModalActiveListingsPanel
          card={card}
        />
        <CardModalCardLinksPanel
          card={card}
          storedCardMarketUrl={storedCardMarketUrl}
          onOpenCardMarket={onOpenCardMarket}
        />
      </div>
    </div>
  );
}
