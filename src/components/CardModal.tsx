"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  showGradedSlabPreview?: boolean;
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

function getLatestSeriesValue(points: Array<{ value: number | null }>): number | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (value != null) return value;
  }

  return undefined;
}

function getInitialCardMarketFloorValue(card: ModalCardData): number | null {
  return (
    card.price?.cm_en_lowest_nm ??
    card.price?.cm_de_lowest_nm ??
    card.price?.cm_fr_lowest_nm ??
    card.price?.cm_es_lowest_nm ??
    card.price?.cm_it_lowest_nm ??
    null
  );
}

function getEbaySoldDisplayValueEur(
  price: NonNullable<ModalCardData["ebay_sold_graded_prices"]>[number] | null | undefined
): number | null {
  if (!price) return null;
  if (price.median_price_eur != null) return price.median_price_eur;
  return price.currency.toUpperCase() === "EUR" ? price.median_price : null;
}

function shouldOpenOnRawMarket(
  card: ModalCardData,
  savedCardMarketGradedLabel: string | null,
  savedEbaySoldGradedLabel: string | null
): boolean {
  if (savedCardMarketGradedLabel || !savedEbaySoldGradedLabel) return false;

  const rawFloorValue = getInitialCardMarketFloorValue(card);
  const savedEbaySoldPrice = (card.ebay_sold_graded_prices ?? []).find(
    (price) => price.label === savedEbaySoldGradedLabel
  );
  const ebaySoldValue = getEbaySoldDisplayValueEur(savedEbaySoldPrice);

  return rawFloorValue != null && ebaySoldValue != null && rawFloorValue > ebaySoldValue;
}

export default function CardModal({ card, showGradedSlabPreview = false, onClose }: Props) {
  useBodyScrollLock();
  const router = useRouter();

  const savedCardMarketGradedLabel = findSavedGradedLabel(
    [
      ...(card.graded_prices ?? []),
      ...(card.graded_price_history ?? []).map((series) => ({
        label: series.label,
        price: getLatestSeriesValue(series.points),
      })),
    ],
    card.collection_item
  );
  const savedEbaySoldGradedLabel = findSavedGradedLabel(
    card.ebay_sold_graded_prices ?? [],
    card.collection_item
  );
  const defaultToRawMarket = shouldOpenOnRawMarket(
    card,
    savedCardMarketGradedLabel,
    savedEbaySoldGradedLabel
  );
  const [modalCard, setModalCard] = useState(card);
  const { displaySettings, currentUserRole } = useSettings();
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [removingCollectionItem, setRemovingCollectionItem] = useState(false);
  const [historyChartMode, setHistoryChartMode] = useState<"market" | "graded">(() =>
    defaultToRawMarket || (!savedCardMarketGradedLabel && !savedEbaySoldGradedLabel)
      ? "market"
      : "graded"
  );
  const [marketDataSource, setMarketDataSource] = useState<"cardmarket" | "tcgplayer">(
    "cardmarket"
  );
  const [gradedDataSource, setGradedDataSource] = useState<"cardmarket" | "ebay">(() =>
    savedCardMarketGradedLabel ? "cardmarket" : savedEbaySoldGradedLabel ? "ebay" : "cardmarket"
  );
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const [selectedGradedLabel, setSelectedGradedLabel] = useState<string | null>(() =>
    savedCardMarketGradedLabel ?? getPreferredGradedLabel(card.graded_prices ?? [])
  );
  const [selectedEbaySoldGradedLabel, setSelectedEbaySoldGradedLabel] = useState<string | null>(
    () =>
      savedEbaySoldGradedLabel ??
      getPreferredGradedLabel(
        (card.ebay_sold_graded_prices ?? []).map((price) => ({
          label: price.label,
          price: price.median_price,
        }))
      )
  );
  const modalFrameRef = useRef<HTMLDivElement | null>(null);
  const threeDClosingGuardUntilRef = useRef(0);

  const collectionItem = modalCard.collection_item ?? null;
  const layout = getCardModalLayoutClasses(
    displaySettings.modalSize,
    displaySettings.widescreen
  );
  const gradedPrices = modalCard.graded_prices ?? [];
  const ebaySoldGradedPrices = modalCard.ebay_sold_graded_prices ?? [];
  const gradedPriceHistory = modalCard.graded_price_history ?? [];
  const ebaySoldGradedPriceHistory = modalCard.ebay_sold_graded_price_history ?? [];
  const gradingCompanyLabel = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  const showGradedPreview = Boolean(
    showGradedSlabPreview && gradingCompanyLabel && gradingGradeLabel
  );
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
  const preferredEbaySoldGradedHistoryLabel = getPreferredGradedLabel(
    ebaySoldGradedPriceHistory.map((series) => ({
      label: series.label,
      price: series.points[series.points.length - 1]?.value ?? 0,
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
    ebaySoldGradedPrices.find((price) => price.label === preferredEbaySoldGradedHistoryLabel) ??
    null;
  const selectedEbaySoldGradedHistory =
    ebaySoldGradedPriceHistory.find((series) => series.label === selectedEbaySoldGradedLabel) ??
    ebaySoldGradedPriceHistory.find((series) => series.label === preferredEbaySoldGradedLabel) ??
    ebaySoldGradedPriceHistory.find((series) => series.label === preferredEbaySoldGradedHistoryLabel) ??
    ebaySoldGradedPriceHistory[0] ??
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
  const hasGradedData =
    gradedPrices.length > 0 ||
    ebaySoldGradedPrices.length > 0 ||
    gradedPriceHistory.some((series) => series.points.some((point) => point.value != null)) ||
    ebaySoldGradedPriceHistory.some((series) => series.points.some((point) => point.value != null));
  const effectiveHistoryChartMode = hasGradedData ? historyChartMode : "market";

  useEffect(() => {
    const frame = modalFrameRef.current;
    if (!frame) return;
    frame.scrollTo({ top: 0, left: 0 });
  }, [modalCard.id]);

  function openThreeDView() {
    if (Date.now() < threeDClosingGuardUntilRef.current) return;
    setThreeDOpen(true);
  }

  function closeThreeDView() {
    threeDClosingGuardUntilRef.current = Date.now() + 450;
    setThreeDOpen(false);
  }

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

  async function refreshModalCardFromServer() {
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: ModalCardData = await response.json();
      setModalCard(data);
      setResolvedUrl(null);
    } catch {
      // The page refresh still updates the backing data; keep the modal usable if this request fails.
    }
  }

  async function removeCurrentCollectionItem() {
    if (!collectionItem || removingCollectionItem) return;

    const location = collectionItem.binder_name ?? "loose singles";
    const confirmed = window.confirm(`Remove this saved copy from ${location}?`);
    if (!confirmed) return;

    setRemovingCollectionItem(true);
    setRefreshError(null);

    try {
      const response = await fetch("/api/collection/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionItem.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove this copy");
      }

      router.refresh();
      onClose();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not remove this copy");
    } finally {
      setRemovingCollectionItem(false);
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
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4"
        style={{
          backgroundColor: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(14px)",
          overscrollBehavior: "contain",
        }}
        onClick={onClose}
      >
        <div
          className="relative w-[min(100%,calc(100vw-1.5rem))] max-w-full sm:w-full"
          style={{ maxWidth: layout.maxW }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            className="absolute right-3 top-3 z-40 hidden h-10 w-10 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/[0.055] hover:text-white/86 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 sm:inline-flex"
            aria-label="Close card details"
            title="Close"
          >
            <X className="h-[18px] w-[18px] stroke-[1.8]" />
          </button>

          <div
            ref={modalFrameRef}
            role="dialog"
            aria-modal="true"
            aria-label={modalCard.name}
            className="card-modal-frame glass relative max-h-[calc(100dvh-1.5rem)] w-full max-w-full overflow-y-auto overscroll-contain rounded-[32px] [scrollbar-gutter:stable] shadow-[0_32px_90px_rgba(0,0,0,0.52)]"
            data-modal-size={displaySettings.modalSize}
            style={{
              background: "rgba(10,10,12,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div className="card-modal-mobile-close-row sticky top-0 z-40 flex justify-end border-b border-white/8 bg-[linear-gradient(180deg,rgba(10,10,12,0.96),rgba(10,10,12,0.78))] px-2 py-2 backdrop-blur-xl sm:hidden">
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose();
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-white/78 transition-colors hover:bg-white/[0.095] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                aria-label="Close card details"
                title="Close"
              >
                <X className="h-5 w-5 stroke-[1.8]" />
              </button>
            </div>
            <div className={`card-modal-content-pad ${layout.pad}`}>
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
                  gradedTileSize={displaySettings.cardSize}
                  onOpenThreeD={openThreeDView}
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
                    removingCollectionItem={removingCollectionItem}
                    onRefresh={() => void runCardAction("refresh")}
                    onSyncHistory={() => void runCardAction("sync-history")}
                    onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
                    onAddedToCollection={refreshModalCardFromServer}
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
                    gradedPrices={gradedPrices}
                    gradedPriceHistory={gradedPriceHistory}
                    selectedGradedHistory={selectedGradedHistory}
                    selectedGradedPrice={selectedGradedPrice}
                    selectedGradedHistoryCurrentValue={selectedGradedHistoryCurrentValue}
                    onSelectGradedLabel={setSelectedGradedLabel}
                    gradedSource={gradedDataSource}
                    onSelectGradedSource={setGradedDataSource}
                    ebaySoldGradedPrices={ebaySoldGradedPrices}
                    selectedEbaySoldGradedPrice={selectedEbaySoldGradedPrice}
                    ebaySoldGradedPriceHistory={ebaySoldGradedPriceHistory}
                    selectedEbaySoldGradedHistory={selectedEbaySoldGradedHistory}
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
              onAddedToCollection={refreshModalCardFromServer}
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
          showGradedSlabPreview={showGradedSlabPreview}
          onClose={closeThreeDView}
        />
      )}
    </>
  );
}
