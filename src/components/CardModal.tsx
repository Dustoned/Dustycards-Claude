"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { X } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
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
  getCardMarketHistorySeriesValue,
  getSaneCardMarketHistorySeriesCurrentValue,
  hasCardMarketHistorySeries,
  type CardMarketHistorySeriesKey,
} from "@/lib/price-history";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import {
  CardModalFooter,
  CardModalHeroSection,
  CardModalHistorySection,
  CardModalPreview,
  CardModalPricingSection,
} from "./card-modal/CardModalSections";
import type { ModalCardData } from "./card-modal/types";
import { getCardModalLayoutClasses, getPreferredGradedLabel } from "./card-modal/utils";

export type { ModalCardData } from "./card-modal/types";

const CardThreeViewer = dynamic(() => import("@/app/expansions/[id]/CardThreeViewer"), {
  ssr: false,
  loading: () => null,
});

interface Props {
  card: ModalCardData;
  onClose: () => void;
}

function normalizeGradeSelection(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/[^A-Z0-9.]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function findSavedGradedLabel(
  prices: Array<{ label: string; price?: number; company?: string; grade?: string }>,
  collectionItem: ModalCardData["collection_item"] | null | undefined
): string | null {
  const company = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const grade = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  if (!company || !grade) return null;

  const normalizedCompany = normalizeGradeSelection(company);
  const normalizedGrade = normalizeGradeSelection(grade);
  const exactStructuredMatch = prices.find((price) => {
    if (!price.company || !price.grade) return false;
    return (
      normalizeGradeSelection(price.company) === normalizedCompany &&
      normalizeGradeSelection(price.grade) === normalizedGrade
    );
  });
  if (exactStructuredMatch) return exactStructuredMatch.label;

  return (
    prices.find((price) => {
      const label = normalizeGradeSelection(price.label);
      return label.includes(normalizedCompany) && label.includes(normalizedGrade);
    })?.label ?? null
  );
}

export default function CardModal({ card, onClose }: Props) {
  useBodyScrollLock();

  const [modalCard, setModalCard] = useState(card);
  const { displaySettings, currentUserRole } = useSettings();
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [historyChartMode, setHistoryChartMode] = useState<"market" | "graded">("market");
  const [marketDataSource, setMarketDataSource] = useState<"cardmarket" | "tcgplayer">(
    "cardmarket"
  );
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const [selectedGradedLabel, setSelectedGradedLabel] = useState<string | null>(() =>
    findSavedGradedLabel(card.graded_prices ?? [], card.collection_item) ??
    getPreferredGradedLabel(card.graded_prices ?? [])
  );
  const [selectedEbaySoldGradedLabel, setSelectedEbaySoldGradedLabel] = useState<string | null>(
    () =>
      findSavedGradedLabel(card.ebay_sold_graded_prices ?? [], card.collection_item) ??
      getPreferredGradedLabel(
        (card.ebay_sold_graded_prices ?? []).map((price) => ({
          label: price.label,
          price: price.median_price,
        }))
      )
  );

  const collectionItem = modalCard.collection_item ?? null;
  const layout = getCardModalLayoutClasses(
    displaySettings.modalSize,
    displaySettings.widescreen,
    Boolean(collectionItem)
  );
  const gradedPrices = modalCard.graded_prices ?? [];
  const ebaySoldGradedPrices = modalCard.ebay_sold_graded_prices ?? [];
  const gradedPriceHistory = modalCard.graded_price_history ?? [];
  const gradingCompanyLabel = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  const showGradedPreview = Boolean(gradingCompanyLabel && gradingGradeLabel);
  const previewAspectClass = showGradedPreview
    ? GRADED_SLAB_ASPECT_CLASS
    : RAW_CARD_ASPECT_CLASS;
  const isBusy = refreshing || syncingHistory;
  const canManageCardPrices = currentUserRole === "admin";
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
  const hasTcgPlayerData =
    [modalCard.price?.tcp_market, modalCard.price?.tcp_mid, modalCard.price?.tcp_low].some(
      (value) => value != null
    ) || tcgPlayerHistory.some((point) => point.value != null);
  const effectiveMarketDataSource = hasTcgPlayerData ? marketDataSource : "cardmarket";
  const saneActiveCardMarketCurrent =
    availableCardMarketHistorySeries.length > 0
      ? getSaneCardMarketHistorySeriesCurrentValue(
          modalCard.price,
          activeCardMarketHistorySeries,
          modalCard.price_history
        )
      : {
          value:
            modalCard.price?.cm_en_lowest_nm ??
            modalCard.price?.cm_de_lowest_nm ??
            modalCard.price?.cm_fr_lowest_nm ??
            modalCard.price?.cm_es_lowest_nm ??
            modalCard.price?.cm_it_lowest_nm ??
            null,
          ignoredValue: null,
        };
  const activeCardMarketCurrentValue = saneActiveCardMarketCurrent.value;
  const preferredGradedLabel = getPreferredGradedLabel(
    gradedPrices
  );
  const selectedGradedPrice =
    gradedPrices.find((price) => price.label === selectedGradedLabel) ??
    gradedPrices.find((price) => price.label === preferredGradedLabel) ??
    null;
  const preferredEbaySoldGradedLabel = getPreferredGradedLabel(
    ebaySoldGradedPrices.map((price) => ({
      label: price.label,
      price: price.median_price,
    }))
  );
  const preferredGradedHistoryLabel = getPreferredGradedLabel(
    gradedPriceHistory.map((series) => ({
      label: series.label,
      price: series.points[series.points.length - 1]?.value ?? 0,
    }))
  );
  const selectedEbaySoldGradedPrice =
    ebaySoldGradedPrices.find((price) => price.label === selectedEbaySoldGradedLabel) ??
    ebaySoldGradedPrices.find((price) => price.label === preferredEbaySoldGradedLabel) ??
    null;
  const selectedGradedHistory =
    gradedPriceHistory.find((series) => series.label === selectedGradedLabel) ??
    gradedPriceHistory.find((series) => series.label === preferredGradedLabel) ??
    gradedPriceHistory.find((series) => series.label === preferredGradedHistoryLabel) ??
    gradedPriceHistory[0] ??
    null;
  const selectedGradedHistoryCurrentValue =
    selectedGradedPrice?.price ??
    selectedGradedHistory?.points[selectedGradedHistory.points.length - 1]?.value ??
    null;
  const hasGradedHistory = gradedPriceHistory.some((series) =>
    series.points.some((point) => point.value != null)
  );
  const effectiveHistoryChartMode = hasGradedHistory ? historyChartMode : "market";

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

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(14px)" }}
        onClick={onClose}
      >
        <div
          className="relative w-full"
          style={{ maxWidth: layout.maxW }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2.5 top-2.5 z-40 inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/42 transition-colors hover:bg-white/[0.055] hover:text-white/86 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 sm:right-3 sm:top-3"
            aria-label="Close card details"
            title="Close"
          >
            <X className="h-[18px] w-[18px] stroke-[1.8]" />
          </button>

          <div
            role="dialog"
            aria-modal="true"
            aria-label={modalCard.name}
            className="card-modal-frame glass relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain rounded-[32px] [scrollbar-gutter:stable] shadow-[0_32px_90px_rgba(0,0,0,0.52)]"
            data-modal-size={displaySettings.modalSize}
            style={{
              background: "rgba(10,10,12,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div className={layout.pad}>
              <div
                className={`grid ${layout.gridGap} lg:grid-cols-[auto_minmax(0,1fr)] lg:items-stretch`}
              >
                <CardModalPreview
                  card={modalCard}
                  mediaWidth={layout.mediaWidth}
                  imageSize={layout.imageSize}
                  previewAspectClass={previewAspectClass}
                  showGradedPreview={showGradedPreview}
                  gradingCompanyLabel={gradingCompanyLabel}
                  gradingGradeLabel={gradingGradeLabel}
                  onOpenThreeD={() => setThreeDOpen(true)}
                />

                <div className="min-w-0 space-y-3">
                  <CardModalHeroSection
                    card={modalCard}
                    collectionItem={collectionItem}
                    titleClass={layout.titleClass}
                    metaClassName={layout.metaClassName}
                    detailStatClass={layout.detailStatClass}
                    gradingCompanyLabel={gradingCompanyLabel}
                    gradingGradeLabel={gradingGradeLabel}
                    isBusy={isBusy}
                    refreshing={refreshing}
                    syncingHistory={syncingHistory}
                    refreshError={refreshError}
                    canManageCardPrices={canManageCardPrices}
                    onRefresh={() => void runCardAction("refresh")}
                    onSyncHistory={() => void runCardAction("sync-history")}
                    onClose={onClose}
                  />

                  <CardModalHistorySection
                    historyChartMode={effectiveHistoryChartMode}
                    activeMarketSource={effectiveMarketDataSource}
                    cardMarketHistory={cardMarketHistory}
                    activeCardMarketCurrentValue={activeCardMarketCurrentValue}
                    ignoredCardMarketCurrentValue={saneActiveCardMarketCurrent.ignoredValue}
                    showTcgPlayerSource={hasTcgPlayerData}
                    card={modalCard}
                    availableCardMarketHistorySeries={availableCardMarketHistorySeries}
                    activeCardMarketHistorySeries={activeCardMarketHistorySeries}
                    activeCardMarketSeriesLabel={activeCardMarketSeriesLabel}
                    onSelectMarketSource={setMarketDataSource}
                    onSelectCardMarketHistorySeries={setCardMarketHistorySeries}
                    onSelectHistoryChartMode={setHistoryChartMode}
                    tcgPlayerHistory={tcgPlayerHistory}
                    tcgPlayerCurrentValue={modalCard.price?.tcp_market ?? null}
                    gradedPriceHistory={gradedPriceHistory}
                    selectedGradedHistory={selectedGradedHistory}
                    selectedGradedHistoryCurrentValue={selectedGradedHistoryCurrentValue}
                    onSelectGradedLabel={setSelectedGradedLabel}
                  />

                  <CardModalPricingSection
                    gradedPrices={gradedPrices}
                    ebaySoldGradedPrices={ebaySoldGradedPrices}
                    selectedGradedPrice={selectedGradedPrice}
                    selectedEbaySoldGradedPrice={selectedEbaySoldGradedPrice}
                    onSelectGradedLabel={setSelectedGradedLabel}
                    onSelectEbaySoldGradedLabel={setSelectedEbaySoldGradedLabel}
                  />
                </div>
              </div>
            </div>

            <CardModalFooter
              card={modalCard}
              collectionItem={collectionItem}
              footerGridClass={layout.footerGridClass}
              storedCardMarketUrl={storedCardMarketUrl}
              onOpenCardMarket={openCardMarket}
              onClose={onClose}
            />
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
