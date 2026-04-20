"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import CardThreeViewer from "@/app/expansions/[id]/CardThreeViewer";
import GradedSlabPreview from "@/components/GradedSlabPreview";
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
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import { useSettings, ModalSize } from "@/components/SettingsProvider";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionEditCardButton from "@/components/CollectionEditCardButton";
import IllustratorLink from "@/components/IllustratorLink";

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

function formatCurrency(value: number | null | undefined, currency: CurrencyCode = "EUR"): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

function rarityBadge(rarity: string | null): string {
  return (
    RARITY_BADGE[normalizeRarityLabel(rarity) ?? ""] ??
    "bg-black/5 dark:bg-white/6 text-gray-500 dark:text-gray-400"
  );
}

export default function CardModal({ card, onClose }: Props) {
  const [modalCard, setModalCard] = useState(card);
  const { settings } = useSettings();
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");

  const ms: ModalSize = settings.modalSize;
  const wide = settings.widescreen;
  const imgW =
    ms === "small"
      ? wide
        ? "w-80 sm:w-[22rem] xl:w-[24rem]"
        : "w-44 sm:w-48"
      : ms === "large"
        ? wide
          ? "w-[24rem] sm:w-[28rem] xl:w-[32rem]"
          : "w-56 sm:w-72 xl:w-80"
        : wide
          ? "w-[22rem] sm:w-[25rem] xl:w-[28rem]"
          : "w-52 sm:w-64";
  const imgSize =
    ms === "small"
      ? wide
        ? "320px"
        : "192px"
      : ms === "large"
        ? wide
          ? "496px"
          : "320px"
        : wide
          ? "432px"
          : "256px";
  const maxW =
    ms === "small"
      ? wide
        ? "max-w-[70rem]"
        : "max-w-xl"
      : ms === "large"
        ? wide
          ? "max-w-[84rem]"
          : "max-w-5xl"
        : wide
          ? "max-w-[76rem]"
          : "max-w-4xl";
  const pad = ms === "small" ? (wide ? "p-7" : "p-6") : ms === "large" ? (wide ? "p-9 sm:p-10" : "p-8 sm:p-9") : wide ? "p-8 sm:p-9" : "p-7";
  const gap = ms === "small" ? (wide ? "gap-4" : "gap-5") : ms === "large" ? (wide ? "gap-5" : "gap-8") : wide ? "gap-4" : "gap-7";
  const contentWidthCls =
    ms === "small" ? "sm:w-[31rem]" : ms === "large" ? "sm:w-[35rem]" : "sm:w-[33rem]";
  const layoutCls = wide
    ? "flex flex-col sm:grid sm:grid-cols-[auto_auto] sm:items-start"
    : "flex flex-col sm:flex-row sm:items-start";
  const mediaColCls = wide
    ? `shrink-0 ${imgW} mx-auto sm:mx-0 sm:self-start`
    : `shrink-0 ${imgW} mx-auto sm:mx-0`;
  const contentCls = wide
    ? `w-full min-w-0 flex flex-col gap-3 ${contentWidthCls}`
    : "flex-1 min-w-0 flex flex-col gap-4";
  const titleCls = ms === "small" ? "text-2xl" : ms === "large" ? "text-4xl" : "text-3xl";
  const priceCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";
  const metaCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";
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
  const availableCardMarketHistorySeries = CARD_MARKET_HISTORY_SERIES.filter((series) =>
    hasCardMarketHistorySeries(modalCard.price_history, series.key)
  );
  const activeCardMarketHistorySeries = availableCardMarketHistorySeries.some(
    (series) => series.key === cardMarketHistorySeries
  )
    ? cardMarketHistorySeries
    : availableCardMarketHistorySeries[0]?.key ?? "cm_market_en";
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

  async function refreshCard() {
    setRefreshing(true);
    setRefreshError(null);

    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as ModalCardData & {
        error?: string;
        activeType?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not refresh this card");
      }

      setModalCard((prev) => ({
        ...data,
        collection_item: prev.collection_item ?? null,
      }));
      setResolvedUrl(null);
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : "Could not refresh this card"
      );
    } finally {
      setRefreshing(false);
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

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
        onClick={onClose}
      >
        <div
          className={`${maxW} glass w-full sm:w-auto rounded-3xl shadow-2xl shadow-black/45 overflow-hidden`}
          style={{
            background: "rgba(12,12,14,0.82)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
        <div className={`${layoutCls} ${gap} ${pad}`}>
          <div className={mediaColCls}>
            {modalCard.image_url ? (
              <button
                type="button"
                onClick={() => setThreeDOpen(true)}
                className={`group relative ${imgW} ${previewAspectClass} cursor-grab overflow-hidden rounded-2xl shadow-2xl shadow-black/50 transition-transform hover:scale-[1.015]`}
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
                    sizes={imgSize}
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
                    sizes={imgSize}
                    loading="eager"
                    unoptimized
                  />
                )}
              </button>
            ) : (
              <div
                className={`${imgW} ${previewAspectClass} bg-white/6 rounded-2xl flex items-center justify-center text-white/30`}
              >
                ?
              </div>
              )}
            </div>

            <div className={contentCls}>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={`${titleCls} font-bold text-white leading-tight`}>{modalCard.name}</h2>
                    <div className={`mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-white/50 ${metaCls}`}>
                      {modalCard.card_number && <span>#{modalCard.card_number}</span>}
                      {modalCard.supertype && <span>{modalCard.supertype}</span>}
                      {modalCard.subtypes && <span>{modalCard.subtypes}</span>}
                      {modalCard.hp && <span>HP {modalCard.hp}</span>}
                    </div>
                    {modalCard.rarity && (
                      <span
                        className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${rarityBadge(modalCard.rarity)}`}
                      >
                        {normalizeRarityLabel(modalCard.rarity) ?? modalCard.rarity}
                      </span>
                    )}
                    <div className="mt-2">
                      <Link
                        href={`/expansions/${modalCard.episode_id}`}
                        onClick={onClose}
                        className="text-sm text-white/50 hover:text-white/80 transition-colors underline-offset-2 hover:underline"
                      >
                        {modalCard.episode_name}
                        {modalCard.episode_code && (
                          <span className="ml-1 opacity-60">({modalCard.episode_code})</span>
                        )}
                      </Link>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshCard}
                    disabled={refreshing}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/82 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                {refreshError && (
                  <p className="mt-2 text-xs text-rose-300">{refreshError}</p>
                )}
              </div>

              <div className={`grid grid-cols-2 gap-2.5 ${priceCls}`}>
                <div className="flex flex-col gap-2">
                  {[
                    { label: "CardMarket", val: modalCard.price?.cm_en_lowest_nm, currency: "EUR" as const },
                    { label: "7d avg", val: modalCard.price?.cm_en_avg_7d, currency: "EUR" as const },
                    { label: "30d avg", val: modalCard.price?.cm_en_avg_30d, currency: "EUR" as const },
                  ].map(
                    ({ label, val, currency }) =>
                      val != null && (
                        <div
                          key={label}
                          className="flex justify-between rounded-xl px-3 py-2"
                          style={{ background: "rgba(255,255,255,0.08)" }}
                        >
                          <span className="text-white/50">{label}</span>
                          <span className="font-bold text-white tabular-nums">
                            {formatCurrency(val, currency)}
                          </span>
                        </div>
                      )
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {[
                    { label: "TCGPlayer", val: modalCard.price?.tcp_market, currency: "USD" as const },
                    { label: "TCP Mid", val: modalCard.price?.tcp_mid, currency: "USD" as const },
                    { label: "TCP Low", val: modalCard.price?.tcp_low, currency: "USD" as const },
                  ].map(
                    ({ label, val, currency }) =>
                      val != null && (
                        <div
                          key={label}
                          className="flex justify-between rounded-xl px-3 py-2"
                          style={{ background: "rgba(255,255,255,0.08)" }}
                        >
                          <span className="text-white/50">{label}</span>
                          <span className="font-bold text-white tabular-nums">
                            {formatCurrency(val, currency)}
                          </span>
                        </div>
                      )
                  )}
                </div>
              </div>

              {gradedPrices.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/42">
                    Graded
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {gradedPrices.map((gradedPrice) => (
                      <div
                        key={gradedPrice.label}
                        className="flex items-center justify-between rounded-xl px-3 py-2"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <span className="text-sm text-white/56">{gradedPrice.label}</span>
                        <span className="text-sm font-bold tabular-nums text-white">
                          {formatCurrency(gradedPrice.price, "EUR")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  {availableCardMarketHistorySeries.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableCardMarketHistorySeries.map((series) => (
                        <button
                          key={series.key}
                          type="button"
                          onClick={() => setCardMarketHistorySeries(series.key)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] leading-none transition-all ${
                            activeCardMarketHistorySeries === series.key
                              ? "border-white/28 bg-white/14 font-semibold text-white"
                              : "border-white/10 text-white/52 hover:border-white/18 hover:text-white/78"
                          }`}
                        >
                          {series.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <PriceHistoryPanel
                    title={
                      availableCardMarketHistorySeries.length > 0
                        ? `CardMarket History (${availableCardMarketHistorySeries.find((series) => series.key === activeCardMarketHistorySeries)?.label ?? "EN"})`
                        : "CardMarket History"
                    }
                    currency="EUR"
                    points={cardMarketHistory}
                    currentValue={activeCardMarketCurrentValue}
                    tone="dark"
                    compact
                  />
                </div>
                <PriceHistoryPanel
                  title="TCGPlayer History"
                  currency="USD"
                  points={tcgPlayerHistory}
                  currentValue={modalCard.price?.tcp_market ?? null}
                  tone="dark"
                  compact
                />
              </div>

              <PriceRefreshCountdown
                rarity={modalCard.rarity}
                priceFetchedAt={modalCard.price_fetched_at}
                priceSourceStatus={modalCard.price_source_status}
                priceSourceCheckedAt={modalCard.price_source_checked_at}
              />

              {modalCard.artist && (
                <p className="text-sm text-white/40">
                  Illus.{" "}
                  <IllustratorLink
                    artist={modalCard.artist}
                    onClick={onClose}
                    className="text-white/70 transition-colors hover:text-white hover:underline underline-offset-2"
                  />
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 px-6 pb-6">
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
              className="flex-1 rounded-2xl"
            />
            {modalCard.collection_item && (
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
                item={modalCard.collection_item}
                mode="button"
                theme="dark"
                label="Edit card"
                className="flex-1 rounded-2xl"
                onSaved={onClose}
              />
            )}
            {storedCardMarketUrl ? (
              <a
                href={storedCardMarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Open CardMarket
              </a>
            ) : (
              <button
                onClick={openCardMarket}
                className="flex-1 py-3 rounded-2xl font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Open CardMarket
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-2xl font-semibold text-white/60 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.08)" }}
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
