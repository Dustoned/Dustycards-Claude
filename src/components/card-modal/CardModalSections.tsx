"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, LineChart, RefreshCw } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import CollectionWantButton from "@/components/CollectionWantButton";
import type { CardSize } from "@/components/SettingsProvider";
import { type SupportedGradedSlabCompany } from "@/lib/graded-slabs";
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

interface SectionShellProps {
  eyebrow?: string;
  title?: string;
  description?: string | null;
  children: ReactNode;
  className?: string;
}

interface MetricTileProps {
  label: string;
  value: ReactNode;
  hint?: string | null;
  accent?: "emerald" | "blue" | "violet" | "slate";
  className?: string;
}

interface MarketRowProps {
  label: string;
  value: ReactNode;
  hint?: string | null;
}

interface PriceMetric {
  label: string;
  value: string;
  hint?: string | null;
}

type PricingAccent = NonNullable<MetricTileProps["accent"]>;
type PriceStatusTone = "good" | "warning" | "danger" | "neutral";

interface HistoryPointView {
  date: string;
  label: string;
  value: number | null;
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

function getCurrentPriceCoverage(card: ModalCardData) {
  const cardMarketValues = [
    card.price?.cm_en_lowest_nm,
    card.price?.cm_de_lowest_nm,
    card.price?.cm_fr_lowest_nm,
    card.price?.cm_es_lowest_nm,
    card.price?.cm_it_lowest_nm,
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
      className={`inline-flex min-w-0 items-center text-[11px] font-semibold leading-none tabular-nums max-[640px]:text-[10px] ${getPriceStatusToneClass(
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
  const compactLatestPriceAge = latestPriceAge?.replace(/\s+ago$/, "") ?? null;
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
  const shortRefreshValue = !refreshInfo.hasFetchedAt
    ? "Pending"
    : !refreshInfo.autoRefreshEnabled
      ? "Manual"
      : refreshInfo.due
        ? "Due"
        : `Next ${formatRefreshCountdown(refreshInfo.remainingMs).replace(/\s+\d+s$/, "")}`;
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
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-none text-white/28 max-[640px]:gap-x-1 max-[640px]:text-[10px]">
        <PriceStatusInlineItem
          value={compactLatestPriceAge ? `Price ${compactLatestPriceAge}` : "No price"}
          title={`Latest price: ${latestPriceAge ?? "No price"}. ${
            latestPriceLabel ?? sourceCheckedLabel ?? "No source check yet"
          }`}
          tone={latestPriceTone}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={shortRefreshValue}
          title={`Refresh: ${refreshValue}. ${refreshHint}`}
          tone={refreshTone}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={sourceStatus.value}
          title={`Source: ${sourceStatus.value}. ${sourceStatus.hint}`}
          tone={sourceStatus.tone}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={`${coverage.currentCount}/${coverage.totalCount}`}
          title={`Data: ${coverage.currentCount}/${coverage.totalCount} sources. CM ${coverage.cardMarketCount}/${coverage.cardMarketTotal} / TCG ${coverage.tcgPlayerCount}/${coverage.tcgPlayerTotal}`}
          tone={coverageTone}
        />
        <span aria-hidden="true">/</span>
        <PriceStatusInlineItem
          value={historyPoints.length > 0 ? `${historyPoints.length} hist` : "No hist"}
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

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: SectionShellProps) {
  return (
    <section className={`card-modal-section rounded-[24px] border border-white/10 bg-white/[0.055] p-4 sm:p-6 max-[640px]:rounded-2xl max-[640px]:p-3 ${className}`}>
      {(eyebrow || title || description) && (
        <div className="mb-4 space-y-1.5 max-[640px]:mb-3">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40 max-[640px]:text-[10px] max-[640px]:tracking-[0.14em]">
              {eyebrow}
            </p>
          )}
          {title && <h3 className="text-xl font-semibold text-white max-[640px]:text-base">{title}</h3>}
          {description && <p className="text-base text-white/48 max-[640px]:text-sm">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent = "slate",
  className = "",
}: MetricTileProps) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-400/16 bg-emerald-400/[0.08]"
      : accent === "blue"
        ? "border-blue-400/16 bg-blue-400/[0.08]"
        : accent === "violet"
          ? "border-violet-400/16 bg-violet-400/[0.08]"
          : "border-white/10 bg-black/22";

  return (
    <div className={`card-modal-metric min-w-0 rounded-2xl border px-4 py-4 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-3 ${accentClass} ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/38 max-[640px]:text-[10px]">{label}</p>
      <p className="mt-2.5 break-words text-xl font-semibold tabular-nums text-white max-[640px]:mt-1.5 max-[640px]:text-lg">{value}</p>
      {hint && <p className="mt-1.5 text-sm text-white/42 max-[640px]:text-xs">{hint}</p>}
    </div>
  );
}

function MarketRow({ label, value, hint }: MarketRowProps) {
  return (
    <div className="card-modal-market-row flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36 max-[640px]:text-[10px]">{label}</p>
        {hint && <p className="mt-1 text-sm text-white/40 max-[640px]:text-xs">{hint}</p>}
      </div>
      <p className="min-w-0 break-words text-right text-lg font-semibold tabular-nums text-white max-[640px]:text-base">{value}</p>
    </div>
  );
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
      className="group inline-flex max-w-full items-center gap-0.5 rounded-full border border-sky-300/16 bg-sky-300/[0.06] px-1.5 py-0.5 text-[11px] text-sky-100 transition-colors hover:border-sky-200/32 hover:bg-sky-300/[0.1] hover:text-white"
    >
      <span className="min-w-0 truncate">{children}</span>
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
  const previewButtonClass =
    showGradedPreview && gradingCompanyLabel && gradingGradeLabel
      ? `group relative ${previewAspectClass} w-full overflow-hidden rounded-xl border border-transparent shadow-md shadow-black/20 transition-all duration-200 hover:scale-[1.01] hover:shadow-xl hover:shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35`
      : `group relative ${previewAspectClass} w-full overflow-hidden rounded-[4.75%] bg-[#d8d5cc] p-0 drop-shadow-[0_18px_38px_rgba(0,0,0,0.38)] transition-transform after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-2 after:ring-inset after:ring-white/14 hover:scale-[1.01]`;

  return (
    <aside
      className="mx-auto flex h-full max-w-[min(13rem,62vw)] flex-col gap-3 sm:max-w-full sm:gap-4 max-[640px]:max-w-[min(10.5rem,52vw)] max-[640px]:gap-1.5 lg:mx-0"
      style={{ width: mediaWidth }}
    >
      {card.image_url ? (
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onOpenThreeD();
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onOpenThreeD();
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
              className="rounded-[4.75%] object-fill"
              sizes={imageSize}
              loading="eager"
              unoptimized
            />
          )}
        </button>
      ) : (
        <div
          className={`${previewAspectClass} flex w-full items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.03] text-white/30 max-[640px]:rounded-2xl`}
        >
          ?
        </div>
      )}

    </aside>
  );
}

export function CardModalHeroSection({
  card,
  collectionItem,
  titleClass,
  metaClassName,
  detailStatClass,
  gradingCompanyLabel,
  gradingGradeLabel,
  isBusy,
  refreshing,
  syncingHistory,
  refreshError,
  canManageCardPrices,
  onRefresh,
  onSyncHistory,
  onAddedToCollection,
  onClose,
}: {
  card: ModalCardData;
  collectionItem: ModalCardData["collection_item"] | null;
  titleClass: string;
  metaClassName: string;
  detailStatClass: string;
  gradingCompanyLabel: string | null;
  gradingGradeLabel: string | null;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  refreshError: string | null;
  canManageCardPrices: boolean;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onAddedToCollection?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const collectionCard = buildCollectionCard(card);
  const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
  const typeLabel = [card.supertype, card.subtypes].filter(Boolean).join(" / ");
  const collectionTags = collectionItem?.tags ?? [];
  const collectionLanguage =
    collectionItem?.language && collectionItem.language.trim().length > 0
      ? collectionItem.language.trim()
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
  const quickActionButtonClass =
    "!h-8 !w-8 !rounded-xl !border-white/10 !bg-white/[0.08] !p-0 hover:!border-white/18 hover:!bg-white/[0.13] max-[640px]:!h-8 max-[640px]:!w-8";
  const utilityButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] p-0 text-white/76 transition-colors hover:border-white/18 hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <SectionShell className="relative overflow-hidden border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))] !p-3 sm:!p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_48%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_42%)]" />

      <div className="relative">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <h2 className={`${titleClass} break-words !text-[1.45rem] font-bold leading-tight text-white sm:!text-[1.9rem]`}>
              {card.name}
            </h2>

            <div
              className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-white/44 max-[640px]:mt-1 max-[640px]:gap-x-1.5 max-[640px]:text-[10px] ${metaClassName}`}
            >
              {headerMetaLabel && (
                <span className="whitespace-nowrap">
                  {headerMetaLabel}
                </span>
              )}
              {normalizedRarity && (
                <span
                  className="whitespace-nowrap font-semibold text-fuchsia-200"
                  title={card.rarity ?? normalizedRarity}
                >
                  {normalizedRarity}
                </span>
              )}
              <span
                className={`whitespace-nowrap ${
                  collectionItem ? "text-emerald-200/80" : "text-white/48"
                }`}
              >
                {collectionItem ? (
                  <>
                    <span className="max-[640px]:hidden">In DustyCards</span>
                    <span className="hidden max-[640px]:inline">Saved</span>
                  </>
                ) : (
                  <>
                    <span className="max-[640px]:hidden">Not in collection</span>
                    <span className="hidden max-[640px]:inline">Not saved</span>
                  </>
                )}
              </span>
              {collectionLanguage && (
                <span className="whitespace-nowrap text-white/44">{collectionLanguage}</span>
              )}
              {gradingCompanyLabel && gradingGradeLabel && (
                <span className="whitespace-nowrap text-violet-200/80">
                  {gradingCompanyLabel} {gradingGradeLabel}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 xl:justify-self-end">
            <div
              className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-fit xl:justify-end"
              aria-label="Quick actions"
            >
              <CollectionAddCardButton
                card={collectionCard}
                mode="icon"
                theme="dark"
                label={collectionItem ? "Add copy" : "Add"}
                className={quickActionButtonClass}
                onAdded={onAddedToCollection}
              />

              {!collectionItem && (
                <CollectionWantButton
                  card={collectionCard}
                  mode="icon"
                  theme="dark"
                  label="Want"
                  initialWanted={Boolean(card.want_item)}
                  wantItemId={card.want_item?.id ?? null}
                  className={quickActionButtonClass}
                />
              )}

              {collectionItem && (
                <CollectionEditCardButton
                  card={collectionCard}
                  item={collectionItem}
                  mode="icon"
                  theme="dark"
                  label="Edit"
                  className={quickActionButtonClass}
                  onSaved={onClose}
                />
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
                    <LineChart
                      className={`h-3.5 w-3.5 ${syncingHistory ? "animate-pulse" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isBusy}
                    className={utilityButtonClass}
                    aria-label={refreshing ? "Refreshing prices" : "Refresh prices"}
                    title={refreshing ? "Refreshing..." : "Refresh"}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-1.5 max-[640px]:mt-2 max-[640px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {headerDetailStats.map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 rounded-xl border border-white/8 bg-black/14 px-3 py-2 backdrop-blur-sm max-[640px]:px-2.5 max-[640px]:py-1.5"
            >
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/32 max-[640px]:tracking-[0.1em]">
                {stat.label}
              </p>
              <div className="mt-1 min-w-0 truncate text-[13px] font-semibold leading-snug text-white/82 max-[640px]:text-[12px] [&_*]:truncate">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

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
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-base text-white/72">
                  {collectionItem.notes}
                </p>
              </div>
            )}
          </>
        )}

        {refreshError && <p className="mt-4 text-base text-rose-300">{refreshError}</p>}
      </div>
    </SectionShell>
  );
}

function CardModalCurrentPricingPanel({
  metrics,
  accent,
}: {
  metrics: PriceMetric[];
  accent: PricingAccent;
}) {
  if (metrics.length === 0) return null;

  const [activePrimaryMetric, ...activeSecondaryMetrics] = metrics;

  return (
    <div className="card-modal-current-pricing-panel mt-4 border-t border-white/8 pt-4">
      <div className="card-modal-pricing-metrics grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <MetricTile
          label={activePrimaryMetric.label}
          value={activePrimaryMetric.value}
          hint={activePrimaryMetric.hint ?? null}
          accent={accent}
          className="min-h-[128px] max-[640px]:min-h-0"
        />

        <div className="card-modal-market-rows grid gap-4">
          {activeSecondaryMetrics.map((metric) => (
            <MarketRow
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function getLatestHistoryValue(points: HistoryPointView[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (value != null) return value;
  }

  return null;
}

function getUniqueGradeLabels(...labelGroups: string[][]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const group of labelGroups) {
    for (const label of group) {
      const normalized = label.replace(/\s+/g, " ").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      labels.push(normalized);
    }
  }

  return labels;
}

function getEbaySoldDisplayInfo(
  price: NonNullable<ModalCardData["ebay_sold_graded_prices"]>[number] | null,
  history: CardEbaySoldGradedPriceHistorySeries | null
) {
  const historyValue = history ? getLatestHistoryValue(history.points) : null;
  const currency = price?.median_price_eur != null
    ? "EUR"
    : price?.currency?.toUpperCase() === "EUR"
      ? "EUR"
      : history?.currency ?? "USD";
  const value =
    price?.median_price_eur ??
    price?.median_price ??
    historyValue ??
    null;
  const sampleSize = price?.sample_size ?? history?.latest_sample_size ?? null;
  const originalUsd =
    price &&
    price.currency.toUpperCase() === "USD" &&
    price.median_price_eur != null
      ? formatCurrency(price.median_price, "USD")
      : null;

  return {
    currency: currency as CurrencyCode,
    value,
    sampleSize,
    originalUsd,
  };
}

export function CardModalHistorySection({
  historyChartMode,
  activeMarketSource,
  cardMarketHistory,
  activeCardMarketCurrentValue,
  ignoredCardMarketCurrentValue,
  showTcgPlayerSource,
  card,
  availableCardMarketHistorySeries,
  activeCardMarketHistorySeries,
  activeCardMarketSeriesLabel,
  onSelectMarketSource,
  onSelectCardMarketHistorySeries,
  onSelectHistoryChartMode,
  tcgPlayerHistory,
  tcgPlayerCurrentValue,
  gradedPrices,
  gradedPriceHistory,
  selectedGradedHistory,
  selectedGradedPrice,
  selectedGradedHistoryCurrentValue,
  onSelectGradedLabel,
  gradedSource,
  onSelectGradedSource,
  ebaySoldGradedPrices,
  selectedEbaySoldGradedPrice,
  ebaySoldGradedPriceHistory,
  selectedEbaySoldGradedHistory,
  onSelectEbaySoldGradedLabel,
}: {
  historyChartMode: "market" | "graded";
  activeMarketSource: "cardmarket" | "tcgplayer";
  cardMarketHistory: HistoryPointView[];
  activeCardMarketCurrentValue: number | null;
  ignoredCardMarketCurrentValue: number | null;
  showTcgPlayerSource: boolean;
  card: ModalCardData;
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
  gradedPrices: Array<{ label: string; price: number }>;
  gradedPriceHistory: CardGradedPriceHistorySeries[];
  selectedGradedHistory: CardGradedPriceHistorySeries | null;
  selectedGradedPrice: { label: string; price: number } | null;
  selectedGradedHistoryCurrentValue: number | null;
  onSelectGradedLabel: (label: string) => void;
  gradedSource: "cardmarket" | "ebay";
  onSelectGradedSource: (source: "cardmarket" | "ebay") => void;
  ebaySoldGradedPrices: NonNullable<ModalCardData["ebay_sold_graded_prices"]>;
  selectedEbaySoldGradedPrice:
    | NonNullable<ModalCardData["ebay_sold_graded_prices"]>[number]
    | null;
  ebaySoldGradedPriceHistory: CardEbaySoldGradedPriceHistorySeries[];
  selectedEbaySoldGradedHistory: CardEbaySoldGradedPriceHistorySeries | null;
  onSelectEbaySoldGradedLabel: (label: string) => void;
}) {
  const hasCardMarketGradedHistory = gradedPriceHistory.some((series) =>
    series.points.some((point) => point.value != null)
  );
  const hasEbaySoldGradedHistory = ebaySoldGradedPriceHistory.some((series) =>
    series.points.some((point) => point.value != null)
  );
  const hasCardMarketGradedData = hasCardMarketGradedHistory || gradedPrices.length > 0;
  const hasEbaySoldGradedData = hasEbaySoldGradedHistory || ebaySoldGradedPrices.length > 0;
  const hasGradedData = hasCardMarketGradedData || hasEbaySoldGradedData;
  const effectiveHistoryChartMode = hasGradedData ? historyChartMode : "market";
  const effectiveGradedSource =
    gradedSource === "ebay" && hasEbaySoldGradedData
      ? "ebay"
      : hasCardMarketGradedData
        ? "cardmarket"
        : "ebay";
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
  const showGradedSourceToggle = hasCardMarketGradedData && hasEbaySoldGradedData;
  const derivedCardMarketAverage7d = getRecentHistoryAverage(cardMarketHistory, 7);
  const derivedCardMarketAverage30d = getRecentHistoryAverage(cardMarketHistory, 30);
  const activeCardMarketAverage7d =
    derivedCardMarketAverage7d ??
    (activeCardMarketHistorySeries === "cm_market_en" ? card.price?.cm_en_avg_7d ?? null : null);
  const activeCardMarketAverage30d =
    derivedCardMarketAverage30d ??
    (activeCardMarketHistorySeries === "cm_market_en" ? card.price?.cm_en_avg_30d ?? null : null);
  const selectedGradedPoints = selectedGradedHistory?.points ?? [];
  const selectedGradedCurrentValue =
    selectedGradedPrice?.price ??
    selectedGradedHistoryCurrentValue ??
    getLatestHistoryValue(selectedGradedPoints);
  const selectedGradedAverage7d = getRecentHistoryAverage(selectedGradedPoints, 7);
  const selectedGradedAverage30d = getRecentHistoryAverage(selectedGradedPoints, 30);
  const ebaySoldDisplay = getEbaySoldDisplayInfo(
    selectedEbaySoldGradedPrice,
    selectedEbaySoldGradedHistory
  );
  const rawPricingMetrics: PriceMetric[] =
    activeMarketSource === "tcgplayer"
      ? [
          {
            label: "Current",
            value: formatCurrency(card.price?.tcp_market ?? null, "USD"),
          },
          {
            label: "TCP Mid",
            value: formatCurrency(card.price?.tcp_mid ?? null, "USD"),
          },
          {
            label: "TCP Low",
            value: formatCurrency(card.price?.tcp_low ?? null, "USD"),
          },
        ]
      : [
          {
            label: "Current",
            value: formatCurrency(activeCardMarketCurrentValue, "EUR"),
            hint:
              ignoredCardMarketCurrentValue != null
                ? `Ignored suspicious ${formatCurrency(ignoredCardMarketCurrentValue, "EUR")}`
                : showCardMarketSeriesPicker
                  ? `Using ${activeCardMarketSeriesLabel}`
                  : null,
          },
          {
            label: "7D Avg",
            value: formatCurrency(activeCardMarketAverage7d, "EUR"),
          },
          {
            label: "30D Avg",
            value: formatCurrency(activeCardMarketAverage30d, "EUR"),
          },
        ];
  const gradedCardMarketMetrics: PriceMetric[] = [
    {
      label: "Current",
      value: formatCurrency(selectedGradedCurrentValue, "EUR"),
      hint: selectedGradedPrice?.label ?? selectedGradedHistory?.label ?? null,
    },
    {
      label: "7D Avg",
      value: formatCurrency(selectedGradedAverage7d, "EUR"),
    },
    {
      label: "30D Avg",
      value: formatCurrency(selectedGradedAverage30d, "EUR"),
    },
  ];
  const ebaySoldMetrics: PriceMetric[] = [
    {
      label: "eBay Sold",
      value: formatCurrency(ebaySoldDisplay.value, ebaySoldDisplay.currency),
      hint:
        ebaySoldDisplay.sampleSize != null
          ? `${ebaySoldDisplay.sampleSize} sold listings`
          : "Recent sold listings",
    },
    ...(ebaySoldDisplay.originalUsd
      ? [{ label: "Original", value: ebaySoldDisplay.originalUsd }]
      : []),
  ];
  const activePricingMetrics =
    effectiveHistoryChartMode === "graded"
      ? effectiveGradedSource === "ebay"
        ? ebaySoldMetrics
        : gradedCardMarketMetrics
      : rawPricingMetrics;
  const activePricingAccent: PricingAccent =
    effectiveHistoryChartMode === "graded"
      ? effectiveGradedSource === "ebay"
        ? "blue"
        : "violet"
      : activeMarketSource === "tcgplayer"
        ? "blue"
        : "emerald";
  const activeGradedHistory =
    effectiveGradedSource === "ebay"
      ? {
          currency: ebaySoldDisplay.currency,
          currentValue: ebaySoldDisplay.value,
          points: selectedEbaySoldGradedHistory?.points ?? [],
          title: selectedEbaySoldGradedHistory
            ? `${selectedEbaySoldGradedHistory.label} eBay sold`
            : "eBay Sold",
        }
      : {
          currency: "EUR" as const,
          currentValue: selectedGradedCurrentValue,
          points: selectedGradedPoints,
          title: selectedGradedHistory
            ? `${selectedGradedHistory.label} CardMarket`
            : "CardMarket Graded",
        };
  const cardMarketGradeLabels = getUniqueGradeLabels(
    gradedPriceHistory.map((series) => series.label),
    gradedPrices.map((price) => price.label)
  );
  const ebaySoldGradeLabels = getUniqueGradeLabels(
    ebaySoldGradedPriceHistory.map((series) => series.label),
    ebaySoldGradedPrices.map((price) => price.label)
  );
  const activeGradeLabels =
    effectiveGradedSource === "ebay" ? ebaySoldGradeLabels : cardMarketGradeLabels;
  const activeGradeValue =
    effectiveGradedSource === "ebay"
      ? selectedEbaySoldGradedHistory?.label ?? selectedEbaySoldGradedPrice?.label ?? ""
      : selectedGradedHistory?.label ?? selectedGradedPrice?.label ?? "";
  const historyPillClass =
    "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition-colors max-[640px]:h-7 max-[640px]:px-2";
  const historySegmentClass =
    "inline-flex h-8 min-w-0 !w-auto overflow-hidden rounded-full border border-white/10 bg-white/[0.04] p-0.5 max-[640px]:h-7 max-[640px]:!w-full";
  const historySegmentButtonClass =
    "min-w-0 flex-1 rounded-full px-3 text-[11px] font-semibold transition-colors sm:flex-none max-[640px]:px-2.5";
  return (
    <SectionShell className="overflow-hidden max-[640px]:!p-2.5">
      <div className="mb-2.5 flex flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
              Price history
            </p>

            {hasGradedData && (
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "market" as const, label: "Raw" },
                  { key: "graded" as const, label: "Graded" },
                ].map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => onSelectHistoryChartMode(mode.key)}
                    className={`${historyPillClass} ${
                      effectiveHistoryChartMode === mode.key
                        ? "border-white/24 bg-white/14 text-white"
                        : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:justify-end">
            {effectiveHistoryChartMode === "market" && showCardMarketSeriesPicker && (
              <div className="card-modal-series-picker card-modal-history-series-picker flex min-w-0 flex-wrap justify-end gap-1.5">
                {availableCardMarketHistorySeries.map((series) => (
                  <button
                    key={series.key}
                    type="button"
                    onClick={() => onSelectCardMarketHistorySeries(series.key)}
                    className={`${historyPillClass} ${
                      activeCardMarketHistorySeries === series.key
                        ? "border-white/24 bg-white/14 text-white"
                        : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                    }`}
                  >
                    {series.label}
                  </button>
                ))}
              </div>
            )}

            {effectiveHistoryChartMode === "market" && showRawSourceToggle && (
              <div className={`card-modal-source-toggle ${historySegmentClass}`}>
                {[
                  { key: "cardmarket" as const, label: "CardMarket" },
                  { key: "tcgplayer" as const, label: "TCGPlayer" },
                ].map((source) => (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() => onSelectMarketSource(source.key)}
                    className={`${historySegmentButtonClass} ${
                      activeMarketSource === source.key
                        ? "bg-white text-gray-950"
                        : "text-white/48 hover:text-white/78"
                    }`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            )}

            {effectiveHistoryChartMode === "graded" && showGradedSourceToggle && (
              <div className={`card-modal-source-toggle ${historySegmentClass}`}>
                {[
                  { key: "cardmarket" as const, label: "CardMarket" },
                  { key: "ebay" as const, label: "eBay sold" },
                ].map((source) => (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() => onSelectGradedSource(source.key)}
                    className={`${historySegmentButtonClass} ${
                      effectiveGradedSource === source.key
                        ? "bg-white text-gray-950"
                        : "text-white/48 hover:text-white/78"
                    }`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {effectiveHistoryChartMode === "graded" ? (
          <div className="space-y-3 pb-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {!showGradedSourceToggle && (
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/36">
                  {effectiveGradedSource === "ebay" ? "eBay sold" : "CardMarket"}
                </p>
              )}

              <div className="min-w-0 sm:min-w-[11rem]">
                {activeGradeLabels.length > 1 ? (
                  <select
                    value={activeGradeValue}
                    onChange={(event) => {
                      if (effectiveGradedSource === "ebay") {
                        onSelectEbaySoldGradedLabel(event.target.value);
                      } else {
                        onSelectGradedLabel(event.target.value);
                      }
                    }}
                    className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white outline-none transition-colors focus:border-white/18"
                  >
                    {activeGradeLabels.map((label) => (
                      <option key={label} value={label} className="bg-[#111214] text-white">
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="h-9 truncate rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/72">
                    {activeGradeValue || "Graded"}
                  </div>
                )}
              </div>
            </div>

            <PriceHistoryPanel
              title={activeGradedHistory.title}
              currency={activeGradedHistory.currency}
              points={activeGradedHistory.points}
              currentValue={activeGradedHistory.currentValue}
              tone="dark"
            />
          </div>
        ) : (
          <div className="min-h-0 overflow-hidden">
            <PriceHistoryPanel
              title={activeMarketHistory.title}
              currency={activeMarketHistory.currency}
              points={activeMarketHistory.points}
              currentValue={activeMarketHistory.currentValue}
              tone="dark"
            />
          </div>
        )}

        <CardPriceStatusLine card={card} />
      </div>

      <CardModalCurrentPricingPanel
        metrics={activePricingMetrics}
        accent={activePricingAccent}
      />
    </SectionShell>
  );
}

export function CardModalFooter({
  card,
  collectionItem,
  footerGridClass,
  storedCardMarketUrl,
  onOpenCardMarket,
  onAddedToCollection,
  onClose,
}: {
  card: ModalCardData;
  collectionItem: ModalCardCollectionItem | null;
  footerGridClass: string;
  storedCardMarketUrl: string | null;
  onOpenCardMarket: () => void;
  onAddedToCollection?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const collectionCard = buildCollectionCard(card);
  const footerGroupClass = "min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-2.5";
  const footerGroupLabelClass =
    "px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34";
  const marketButtonBase =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors";

  return (
    <div className={footerGridClass}>
      <div className={`${footerGroupClass} lg:hidden`}>
        <p className={footerGroupLabelClass}>Collection</p>
        <div className={`mt-2 grid gap-2 ${collectionItem ? "sm:grid-cols-2" : ""}`}>
          <CollectionAddCardButton
            card={collectionCard}
            mode="button"
            theme="dark"
            label="Add to DustyCards"
            className="min-h-11 w-full"
            onAdded={onAddedToCollection}
          />

          {collectionItem && (
            <CollectionEditCardButton
              card={collectionCard}
              item={collectionItem}
              mode="button"
              theme="dark"
              label="Edit card"
              className="min-h-11 w-full"
              onSaved={onClose}
            />
          )}
        </div>
      </div>

      <div className={`${footerGroupClass} lg:col-span-2`}>
        <p className={footerGroupLabelClass}>Market</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {storedCardMarketUrl ? (
            <a
              href={storedCardMarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${marketButtonBase} bg-blue-600 hover:bg-blue-500`}
            >
              CardMarket
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              onClick={onOpenCardMarket}
              className={`${marketButtonBase} bg-blue-600 hover:bg-blue-500`}
            >
              CardMarket
              <ExternalLink className="h-4 w-4" />
            </button>
          )}

          <Link
            href={`/deals?cardId=${encodeURIComponent(card.id)}`}
            prefetch={false}
            className={`${marketButtonBase} bg-emerald-600 hover:bg-emerald-500`}
          >
            eBay Deals
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
