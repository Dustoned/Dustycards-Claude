"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, LineChart, RefreshCw } from "lucide-react";
import CardThreeViewer from "@/app/expansions/[id]/CardThreeViewer";
import GradedSlabPreview from "@/components/GradedSlabPreview";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import { useSettings, type ModalSize } from "@/components/SettingsProvider";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import IllustratorLink from "@/components/IllustratorLink";
import {
  buildCardMarketProductUrl,
  buildCardMarketProxyUrl,
  isDirectCardMarketUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";
import {
  GRADED_SLAB_ASPECT_CLASS,
  RAW_CARD_ASPECT_CLASS,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import {
  CARD_MARKET_HISTORY_SERIES,
  getCardMarketHistorySeriesCurrentValue,
  getCardMarketHistorySeriesValue,
  hasCardMarketHistorySeries,
  type CardMarketHistorySeriesKey,
  type CardPriceHistoryPoint,
} from "@/lib/price-history";
import { normalizeRarityLabel } from "@/lib/rarity";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

export interface ModalCardData {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | string | null;
  image_url: string | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
  tcggo_url: string | null;
  price_source_status: string | null;
  price_source_checked_at: string | null;
  price_fetched_at: string | null;
  price: {
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
    tcp_market: number | null;
    tcp_mid: number | null;
    tcp_low: number | null;
    cm_en_avg_7d: number | null;
    cm_en_avg_30d: number | null;
  } | null;
  graded_prices?: Array<{
    label: string;
    price: number;
  }>;
  price_history: CardPriceHistoryPoint[];
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  collection_item?: {
    id: string;
    binder_id: string | null;
    purchase_price: number | null;
    condition: string | null;
    language: string | null;
    notes: string | null;
    tags: string[];
    grading_company: string | null;
    grading_grade: string | null;
  } | null;
}

interface Props {
  card: ModalCardData;
  onClose: () => void;
}

type CurrencyCode = "EUR" | "USD";

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

const RARITY_BADGE: Record<string, string> = {
  Common: "bg-black/6 dark:bg-white/8 text-gray-500 dark:text-gray-400",
  Uncommon: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  Rare: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  "Rare Holo": "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  "Rare Ultra": "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  "Ultra Rare": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "Secret Rare": "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  "Amazing Rare": "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
  Promo: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "Radiant Rare": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "ACE SPEC Rare": "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
  "Double Rare": "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
  "Illustration Rare": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Special Illustration Rare": "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  "Hyper Rare": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "Shiny Rare": "bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300",
  "Shiny Ultra Rare": "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  "Rare Rainbow": "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300",
  "Rare Holo EX": "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  "Rare Holo V": "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  "Rare Holo GX": "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  "Trainer Gallery Rare Holo": "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  "Rare Holo LV.X": "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
  "Rare Holo VSTAR": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "Rare Shiny": "bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300",
  "Rare Shiny GX": "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  "Rare BREAK": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "Rare Prism Star": "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
  "Rare Prime": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Classic Collection": "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300",
  "Rare Holo Star": "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  LEGEND: "bg-stone-100 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300",
  "Rare Shining": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "Rare ACE": "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
  "Art Rare": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Special Art Rare": "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  "Mega Hyper Rare": "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300",
  "Black White Rare": "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300",
};

function formatCurrency(value: number | null | undefined, currency: CurrencyCode = "EUR"): string {
  if (value == null) return "--";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function rarityBadge(rarity: string | null): string {
  return (
    RARITY_BADGE[normalizeRarityLabel(rarity) ?? ""] ??
    "bg-black/5 dark:bg-white/6 text-gray-500 dark:text-gray-400"
  );
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: SectionShellProps) {
  return (
    <section className={`rounded-[26px] border border-white/10 bg-white/[0.055] p-4 sm:p-5 ${className}`}>
      {(eyebrow || title || description) && (
        <div className="mb-4 space-y-1.5">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {eyebrow}
            </p>
          )}
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {description && <p className="text-sm text-white/48">{description}</p>}
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
    <div className={`rounded-2xl border px-3 py-3 ${accentClass} ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/42">{hint}</p>}
    </div>
  );
}

function MarketRow({ label, value, hint }: MarketRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">{label}</p>
        {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
      </div>
      <p className="shrink-0 text-base font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function MetaPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/68 ${className}`}
    >
      {children}
    </span>
  );
}

function normalizeGradePickerValue(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/\s+/g, " ").trim() ?? "";
}

function getPreferredGradedLabel(
  prices: Array<{ label: string; price: number }>,
  company: string | null | undefined,
  grade: string | null | undefined
): string | null {
  if (prices.length === 0) return null;

  const normalizedCompany = normalizeGradePickerValue(company);
  const normalizedGrade = normalizeGradePickerValue(grade);

  if (normalizedCompany && normalizedGrade) {
    const preferredKey = `${normalizedCompany} ${normalizedGrade}`;
    const matchedPrice = prices.find((price) => {
      const normalizedLabel = normalizeGradePickerValue(price.label);
      return (
        normalizedLabel === preferredKey ||
        normalizedLabel.startsWith(`${preferredKey} `) ||
        normalizedLabel.includes(preferredKey)
      );
    });

    if (matchedPrice) {
      return matchedPrice.label;
    }
  }

  return prices[0]?.label ?? null;
}

export default function CardModal({ card, onClose }: Props) {
  useBodyScrollLock();

  const [modalCard, setModalCard] = useState(card);
  const { settings } = useSettings();
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [historyChartsOpen, setHistoryChartsOpen] = useState(false);
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const [selectedGradedLabel, setSelectedGradedLabel] = useState<string | null>(
    () => getPreferredGradedLabel(card.graded_prices ?? [], card.collection_item?.grading_company, card.collection_item?.grading_grade)
  );

  const ms: ModalSize = settings.modalSize;
  const wide = settings.widescreen;
  const mediaWidth =
    ms === "small"
      ? wide
        ? "w-[14rem] sm:w-[15rem] xl:w-[16rem]"
        : "w-40 sm:w-44 xl:w-48"
      : ms === "large"
        ? wide
          ? "w-[24rem] sm:w-[27rem] xl:w-[30rem]"
          : "w-72 sm:w-80 xl:w-[24rem]"
        : wide
          ? "w-[17rem] sm:w-[18.5rem] xl:w-[20.5rem]"
          : "w-52 sm:w-60 xl:w-[18rem]";
  const imageSize =
    ms === "small"
      ? wide
        ? "256px"
        : "192px"
      : ms === "large"
        ? wide
          ? "560px"
          : "448px"
        : wide
          ? "336px"
          : "272px";
  const maxW =
    ms === "small"
      ? wide
        ? "max-w-[58rem]"
        : "max-w-[50rem]"
      : ms === "large"
        ? wide
          ? "max-w-[104rem]"
          : "max-w-[90rem]"
        : wide
          ? "max-w-[76rem]"
          : "max-w-[66rem]";
  const pad =
    ms === "small"
      ? "p-3 sm:p-4"
      : ms === "large"
        ? "p-6 sm:p-7 xl:p-8"
        : "p-4 sm:p-5";
  const gridGap =
    ms === "small"
      ? "gap-3 sm:gap-4"
      : ms === "large"
        ? "gap-6 sm:gap-8 xl:gap-10"
        : "gap-4 sm:gap-5";
  const titleCls =
    ms === "small"
      ? "text-[1.45rem] sm:text-[1.6rem]"
      : ms === "large"
        ? "text-[2.45rem] sm:text-[2.85rem] xl:text-[3.15rem]"
        : "text-[1.9rem] sm:text-[2.1rem]";
  const metaCls =
    ms === "small"
      ? "text-[13px]"
      : ms === "large"
        ? "text-base sm:text-[17px]"
        : "text-sm sm:text-[14px]";

  const gradedPrices = modalCard.graded_prices ?? [];
  const gradingCompanyLabel = normalizeGradingCompanyLabel(
    modalCard.collection_item?.grading_company
  );
  const gradingGradeLabel = normalizeGradingGradeLabel(
    modalCard.collection_item?.grading_grade
  );
  const showGradedPreview = Boolean(gradingCompanyLabel && gradingGradeLabel);
  const previewAspectClass = showGradedPreview
    ? GRADED_SLAB_ASPECT_CLASS
    : RAW_CARD_ASPECT_CLASS;
  const isBusy = refreshing || syncingHistory;
  const normalizedRarity = normalizeRarityLabel(modalCard.rarity) ?? modalCard.rarity;
  const typeLabel = [modalCard.supertype, modalCard.subtypes].filter(Boolean).join(" / ");
  const collectionItem = modalCard.collection_item ?? null;
  const collectionTags = collectionItem?.tags ?? [];
  const availableCardMarketHistorySeries = CARD_MARKET_HISTORY_SERIES.filter((series) =>
    hasCardMarketHistorySeries(modalCard.price_history, series.key)
  );
  const activeCardMarketHistorySeries = availableCardMarketHistorySeries.some(
    (series) => series.key === cardMarketHistorySeries
  )
    ? cardMarketHistorySeries
    : availableCardMarketHistorySeries[0]?.key ?? "cm_market_en";
  const activeCardMarketSeriesLabel =
    availableCardMarketHistorySeries.find((series) => series.key === activeCardMarketHistorySeries)
      ?.label ?? "EN";
  const cardMarketHistory = modalCard.price_history.map((point) => ({
    date: point.date,
    label: point.label,
    value:
      availableCardMarketHistorySeries.length > 0
        ? getCardMarketHistorySeriesValue(point, activeCardMarketHistorySeries)
        : point.cm_market,
  }));
  const tcgPlayerHistory = modalCard.price_history.map((point) => ({
    date: point.date,
    label: point.label,
    value: point.tcp_market,
  }));
  const activeCardMarketCurrentValue =
    availableCardMarketHistorySeries.length > 0
      ? getCardMarketHistorySeriesCurrentValue(
          modalCard.price,
          activeCardMarketHistorySeries
        )
      : modalCard.price?.cm_en_lowest_nm ??
        modalCard.price?.cm_de_lowest_nm ??
        modalCard.price?.cm_fr_lowest_nm ??
        modalCard.price?.cm_es_lowest_nm ??
        modalCard.price?.cm_it_lowest_nm ??
        null;
  const preferredGradedLabel = getPreferredGradedLabel(
    gradedPrices,
    gradingCompanyLabel,
    gradingGradeLabel
  );
  const selectedGradedPrice =
    gradedPrices.find((price) => price.label === selectedGradedLabel) ??
    gradedPrices.find((price) => price.label === preferredGradedLabel) ??
    null;

  async function runCardAction(action: "refresh" | "sync-history") {
    if (action === "refresh") {
      setRefreshing(true);
    } else {
      setSyncingHistory(true);
    }
    setRefreshError(null);

    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      const data = (await response.json()) as ModalCardData & {
        error?: string;
        activeType?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ??
            (action === "refresh"
              ? "Could not refresh this card"
              : "Could not import price history for this card")
        );
      }

      setModalCard((prev) => ({
        ...data,
        collection_item: data.collection_item ?? prev.collection_item ?? null,
      }));
      setResolvedUrl(null);
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : action === "refresh"
            ? "Could not refresh this card"
            : "Could not import price history for this card"
      );
    } finally {
      if (action === "refresh") {
        setRefreshing(false);
      } else {
        setSyncingHistory(false);
      }
    }
  }

  function getCardMarketUrl(): string | null {
    const stored = resolvedUrl ?? modalCard.cardmarket_url;
    if (isDirectCardMarketUrl(stored)) return withCardMarketFilters(stored);
    if (modalCard.cardmarket_id) return buildCardMarketProductUrl(modalCard.cardmarket_id);
    return stored;
  }

  async function openCardMarket() {
    let targetUrl = getCardMarketUrl() ?? buildCardMarketProxyUrl(modalCard.id);
    if (!isDirectCardMarketUrl(targetUrl)) {
      try {
        const res = await fetch(`/api/cm-url?card_id=${encodeURIComponent(modalCard.id)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          const direct =
            typeof data.url === "string" && isDirectCardMarketUrl(data.url)
              ? withCardMarketFilters(data.url)
              : null;
          if (direct) {
            setResolvedUrl(direct);
            targetUrl = direct;
          }
        }
      } catch {
        // fall through with proxy URL
      }
    }
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  const storedCardMarketUrl = getCardMarketUrl();
  const headerMeta = [
    modalCard.episode_code ? modalCard.episode_code : null,
    modalCard.card_number ? `#${modalCard.card_number}` : null,
  ].filter(Boolean);
  const headerMetaLabel = headerMeta.length > 0 ? headerMeta.join(" ") : null;
  const collectionLanguage =
    collectionItem?.language && collectionItem.language.trim().length > 0
      ? collectionItem.language.trim()
      : null;
  const heroDetailStats = [
    {
      label: "Type",
      value: typeLabel || "--",
    },
    {
      label: "Set",
      value: (
        <div>
          <Link
            href={`/expansions/${modalCard.episode_id}`}
            onClick={onClose}
            className="inline-flex max-w-full items-center text-sm font-medium text-white/84 transition-colors hover:text-white hover:underline underline-offset-2"
          >
            <span className="truncate">{modalCard.episode_name}</span>
          </Link>
        </div>
      ),
    },
    {
      label: "Artist",
      value: modalCard.artist ? (
        <IllustratorLink
          artist={modalCard.artist}
          onClick={onClose}
          className="transition-colors hover:text-white hover:underline underline-offset-2"
        />
      ) : (
        "--"
      ),
    },
  ];
  const collectionStats = [
    {
      label: "Purchase",
      value:
        collectionItem?.purchase_price != null
          ? formatCurrency(collectionItem.purchase_price, "EUR")
          : "--",
      show: collectionItem?.purchase_price != null,
    },
    {
      label: "Condition",
      value: collectionItem?.condition ?? "--",
      show: Boolean(collectionItem?.condition),
    },
  ];
  const headerDetailStats = collectionItem
    ? [...heroDetailStats, ...collectionStats.filter((stat) => stat.show)]
    : heroDetailStats;
  const cardMarketMetrics = [
    {
      label: "Current",
      value: formatCurrency(activeCardMarketCurrentValue, "EUR"),
      hint:
        availableCardMarketHistorySeries.length > 1 ? `Using ${activeCardMarketSeriesLabel}` : null,
      accent: "emerald" as const,
    },
    {
      label: "7D Avg",
      value: formatCurrency(modalCard.price?.cm_en_avg_7d ?? null, "EUR"),
      accent: "slate" as const,
    },
    {
      label: "30D Avg",
      value: formatCurrency(modalCard.price?.cm_en_avg_30d ?? null, "EUR"),
      accent: "slate" as const,
    },
  ];
  const tcgMetrics = [
    {
      label: "Current",
      value: formatCurrency(modalCard.price?.tcp_market ?? null, "USD"),
      hint: null,
      accent: "blue" as const,
    },
    {
      label: "TCP Mid",
      value: formatCurrency(modalCard.price?.tcp_mid ?? null, "USD"),
      hint: null,
      accent: "slate" as const,
    },
    {
      label: "TCP Low",
      value: formatCurrency(modalCard.price?.tcp_low ?? null, "USD"),
      hint: null,
      accent: "slate" as const,
    },
  ];
  const hasTcgPlayerPricing = [
    modalCard.price?.tcp_market,
    modalCard.price?.tcp_mid,
    modalCard.price?.tcp_low,
  ].some((value) => value != null);
  const detailStatClass =
    ms === "small"
      ? "rounded-[16px] border border-white/8 bg-black/18 px-2.5 py-2 backdrop-blur-sm"
      : ms === "large"
        ? "rounded-[22px] border border-white/8 bg-black/18 px-4 py-3.5 backdrop-blur-sm"
        : "rounded-[18px] border border-white/8 bg-black/18 px-3 py-2.5 backdrop-blur-sm";
  const footerPad =
    ms === "small"
      ? "px-3 pb-3 sm:px-4 sm:pb-4"
      : ms === "large"
        ? "px-6 pb-6 sm:px-7 sm:pb-7 xl:px-8 xl:pb-8"
        : "px-4 pb-4 sm:px-5 sm:pb-5";
  const footerGridClass = collectionItem
    ? `grid gap-3 ${footerPad} sm:grid-cols-2 xl:grid-cols-4`
    : `grid gap-3 ${footerPad} sm:grid-cols-2 xl:grid-cols-3`;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(14px)" }}
        onClick={onClose}
      >
        <div
          className={`${maxW} glass max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain rounded-[32px] shadow-[0_32px_90px_rgba(0,0,0,0.52)]`}
          style={{
            background: "rgba(10,10,12,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={`${pad}`}>
            <div className={`grid ${gridGap} lg:grid-cols-[auto_minmax(0,1fr)] lg:items-stretch`}>
              <aside className={`mx-auto flex h-full w-full max-w-full flex-col gap-4 lg:mx-0 ${mediaWidth}`}>
                {modalCard.image_url ? (
                  <button
                    type="button"
                    onClick={() => setThreeDOpen(true)}
                    className={`group relative ${previewAspectClass} w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-transform hover:scale-[1.01]`}
                    aria-label={`Open ${modalCard.name} in 3D`}
                  >
                    {showGradedPreview && gradingCompanyLabel && gradingGradeLabel ? (
                      <GradedSlabPreview
                        company={gradingCompanyLabel}
                        grade={gradingGradeLabel}
                        name={modalCard.name}
                        episodeName={modalCard.episode_name}
                        episodeCode={modalCard.episode_code}
                        cardNumber={modalCard.card_number}
                        imageUrl={modalCard.image_url}
                        alt={modalCard.name}
                        className="absolute inset-0"
                        sizes={imageSize}
                        loading="eager"
                        priority
                        variant="detail"
                      />
                    ) : (
                      <Image
                        src={modalCard.image_url}
                        alt={modalCard.name}
                        fill
                        className="object-contain"
                        sizes={imageSize}
                        loading="eager"
                        unoptimized
                      />
                    )}
                  </button>
                ) : (
                  <div
                    className={`${previewAspectClass} flex w-full items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.03] text-white/30`}
                  >
                    ?
                  </div>
                )}

                <PriceRefreshCountdown
                  rarity={modalCard.rarity}
                  priceFetchedAt={modalCard.price_fetched_at}
                  priceSourceStatus={modalCard.price_source_status}
                  priceSourceCheckedAt={modalCard.price_source_checked_at}
                  compact
                />
              </aside>

              <div className="min-w-0 space-y-3">
                <SectionShell className="relative overflow-hidden border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_48%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_42%)]" />

                  <div className="relative">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className={`${titleCls} leading-[0.98] font-bold text-white`}>
                            {modalCard.name}
                          </h2>
                          {normalizedRarity && (
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${rarityBadge(
                                modalCard.rarity
                              )}`}
                            >
                              {normalizedRarity}
                            </span>
                          )}
                          <MetaPill className={collectionItem ? "text-emerald-200" : "text-white/60"}>
                            {collectionItem ? "In DustyCards" : "Not in collection"}
                          </MetaPill>
                        </div>

                        <div className={`mt-3 flex flex-wrap items-center gap-2.5 text-white/54 ${metaCls}`}>
                          {headerMetaLabel && <span className="whitespace-nowrap">{headerMetaLabel}</span>}
                          {collectionLanguage && <MetaPill>{collectionLanguage}</MetaPill>}
                          {gradingCompanyLabel && gradingGradeLabel && (
                            <MetaPill className="text-violet-200">
                              {gradingCompanyLabel} {gradingGradeLabel}
                            </MetaPill>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void runCardAction("sync-history")}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <LineChart className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`} />
                          {syncingHistory ? "Syncing..." : "Sync History"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runCardAction("refresh")}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                          {refreshing ? "Refreshing..." : "Refresh"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {headerDetailStats.map((stat) => (
                        <div key={stat.label} className={detailStatClass}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                            {stat.label}
                          </p>
                          <div className="mt-1.5 text-sm font-medium text-white/84">{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    {collectionItem ? (
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
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                              Notes
                            </p>
                            <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm text-white/72">
                              {collectionItem.notes}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 rounded-[20px] border border-dashed border-white/8 bg-black/12 px-3 py-3 text-sm text-white/56">
                        Add this card to DustyCards to save purchase details, condition, language and notes.
                      </div>
                    )}

                    {refreshError && <p className="mt-4 text-sm text-rose-300">{refreshError}</p>}
                  </div>
                </SectionShell>

                <SectionShell title="Current pricing">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                            CardMarket
                          </p>
                        </div>
                        {availableCardMarketHistorySeries.length > 1 && (
                          <MetaPill>{activeCardMarketSeriesLabel}</MetaPill>
                        )}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                        <MetricTile
                          label={cardMarketMetrics[0].label}
                          value={cardMarketMetrics[0].value}
                          hint={cardMarketMetrics[0].hint ?? null}
                          accent="emerald"
                          className="min-h-[108px]"
                        />

                        <div className="grid gap-3">
                          {cardMarketMetrics.slice(1).map((metric) => (
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

                    <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                          TCGPlayer
                        </p>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                        <MetricTile
                          label={tcgMetrics[0].label}
                          value={tcgMetrics[0].value}
                          hint={hasTcgPlayerPricing ? null : "No live pricing"}
                          accent={hasTcgPlayerPricing ? "blue" : "slate"}
                          className="min-h-[108px]"
                        />

                        <div className="grid gap-3">
                          {tcgMetrics.slice(1).map((metric) => (
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
                  </div>

                  {gradedPrices.length > 0 && (
                    <div className="mt-4 rounded-[24px] border border-white/10 bg-black/24 p-3.5">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                            Graded
                          </p>
                          {gradingCompanyLabel && gradingGradeLabel && (
                            <p className="mt-1 text-xs text-white/42">
                              Saved grade {gradingCompanyLabel} {gradingGradeLabel}
                            </p>
                          )}
                        </div>

                        {gradedPrices.length > 1 ? (
                          <select
                            value={selectedGradedPrice?.label ?? ""}
                            onChange={(event) => setSelectedGradedLabel(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm font-medium text-white outline-none transition-colors focus:border-white/18"
                          >
                            {gradedPrices.map((gradedPrice) => (
                              <option
                                key={gradedPrice.label}
                                value={gradedPrice.label}
                                className="bg-[#111214] text-white"
                              >
                                {gradedPrice.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-2xl border border-violet-400/16 bg-violet-400/[0.08] px-3 py-2.5 text-sm font-semibold text-white/78">
                            {selectedGradedPrice?.label ?? gradedPrices[0]?.label ?? "Graded"}
                          </div>
                        )}

                        {selectedGradedPrice && (
                          <p className="shrink-0 rounded-2xl border border-violet-400/16 bg-violet-400/[0.08] px-3 py-2.5 text-right text-xl font-semibold tabular-nums text-white">
                            {formatCurrency(selectedGradedPrice.price, "EUR")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </SectionShell>

                <SectionShell className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setHistoryChartsOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-4 text-left"
                    aria-expanded={historyChartsOpen}
                    aria-controls={`history-charts-${modalCard.id}`}
                  >
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        Price history
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">History charts</h3>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/68">
                      {historyChartsOpen ? "Hide" : "Show"}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${historyChartsOpen ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>

                  {historyChartsOpen && (
                    <div id={`history-charts-${modalCard.id}`} className="mt-4 grid gap-4 xl:grid-cols-2">
                      <PriceHistoryPanel
                        title="CardMarket History"
                        currency="EUR"
                        points={cardMarketHistory}
                        currentValue={activeCardMarketCurrentValue}
                        tone="dark"
                        headerAccessory={
                          availableCardMarketHistorySeries.length > 1 ? (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {availableCardMarketHistorySeries.map((series) => (
                                <button
                                  key={series.key}
                                  type="button"
                                  onClick={() => setCardMarketHistorySeries(series.key)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    activeCardMarketHistorySeries === series.key
                                      ? "border-white/24 bg-white/14 text-white"
                                      : "border-white/10 text-white/54 hover:border-white/18 hover:text-white/82"
                                  }`}
                                >
                                  {series.label}
                                </button>
                              ))}
                            </div>
                          ) : availableCardMarketHistorySeries.length === 1 ? (
                            <MetaPill>{activeCardMarketSeriesLabel}</MetaPill>
                          ) : null
                        }
                      />

                      <PriceHistoryPanel
                        title="TCGPlayer History"
                        currency="USD"
                        points={tcgPlayerHistory}
                        currentValue={modalCard.price?.tcp_market ?? null}
                        tone="dark"
                      />
                    </div>
                  )}
                </SectionShell>
              </div>
            </div>
          </div>

          <div className={footerGridClass}>
            <CollectionAddCardButton
              card={{
                id: modalCard.id,
                name: modalCard.name,
                image_url: modalCard.image_url,
                episode: {
                  id: modalCard.episode_id,
                  name: modalCard.episode_name,
                  code: modalCard.episode_code,
                },
              }}
              mode="button"
              theme="dark"
              label="Add to DustyCards"
              className="rounded-2xl"
            />

            {collectionItem && (
              <CollectionEditCardButton
                card={{
                  id: modalCard.id,
                  name: modalCard.name,
                  image_url: modalCard.image_url,
                  episode: {
                    id: modalCard.episode_id,
                    name: modalCard.episode_name,
                    code: modalCard.episode_code,
                  },
                }}
                item={collectionItem}
                mode="button"
                theme="dark"
                label="Edit card"
                className="rounded-2xl"
                onSaved={onClose}
              />
            )}

            {storedCardMarketUrl ? (
              <a
                href={storedCardMarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Open CardMarket
              </a>
            ) : (
              <button
                onClick={openCardMarket}
                className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Open CardMarket
              </button>
            )}

            <button
              onClick={onClose}
              className="rounded-2xl bg-white/[0.08] px-6 py-3 font-semibold text-white/68 transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {threeDOpen && modalCard.image_url && (
        <CardThreeViewer
          key={modalCard.id}
          card={modalCard}
          frontImageUrl={modalCard.image_url}
          cardMarketUrl={storedCardMarketUrl}
          onClose={() => setThreeDOpen(false)}
        />
      )}
    </>
  );
}
