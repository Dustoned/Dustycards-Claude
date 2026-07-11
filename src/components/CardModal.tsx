"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/components/SettingsProvider";
import {
  buildCardMarketProxyUrl,
  getSafeDirectCardMarketCardUrl,
  isDirectCardMarketUrl,
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
import useModalA11y from "@/lib/useModalA11y";
import {
  CardModalActiveListingsPanel,
  CardModalBuySignalPanel,
  CardModalDesktopActionGroup,
  CardModalHeroSection,
  CardModalHistorySection,
  CardModalMobileShowcase,
  CardModalOwnedCopyPanel,
  CardModalPreview,
  CardModalRecentPricesPanel,
} from "./card-modal/CardModalSections";
import type { ModalCardData } from "./card-modal/types";
import { getCardModalLayoutClasses } from "./card-modal/utils";

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
    card.price?.cm_jp_lowest_nm ??
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
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const modalFrameRef = useRef<HTMLDivElement | null>(null);
  const threeDClosingGuardUntilRef = useRef(0);

  const collectionItem = modalCard.collection_item ?? null;
  const layout = getCardModalLayoutClasses(
    displaySettings.modalSize,
    displaySettings.widescreen
  );
  const desktopWorkspaceStyle = {
    maxWidth: "100%",
  };
  const desktopPreviewClass =
    "card-modal-area-preview min-w-0 lg:sticky lg:top-6 lg:self-start lg:justify-self-center 2xl:justify-self-start";
  const gradedPrices = modalCard.graded_prices ?? [];
  const ebaySoldGradedPrices = modalCard.ebay_sold_graded_prices ?? [];
  const gradedPriceHistory = modalCard.graded_price_history ?? [];
  const ebaySoldGradedPriceHistory = modalCard.ebay_sold_graded_price_history ?? [];
  const gradingCompanyLabel = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  const showGradedPreview = Boolean(
    showGradedSlabPreview && gradingCompanyLabel && gradingGradeLabel
  );
  const desktopPreviewMediaWidth = "clamp(20rem, 26vw, 32rem)";
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
            modalCard.price?.cm_jp_lowest_nm ??
            null,
          ignoredValue: null,
        };
  const activeCardMarketCurrentValue = saneActiveCardMarketCurrent.value;
  const hasGradedData =
    gradedPrices.length > 0 ||
    ebaySoldGradedPrices.length > 0 ||
    gradedPriceHistory.some((series) => series.points.some((point) => point.value != null)) ||
    ebaySoldGradedPriceHistory.some((series) => series.points.some((point) => point.value != null));
  const effectiveHistoryChartMode = hasGradedData ? historyChartMode : "market";

  useModalA11y({
    dialogRef: modalFrameRef,
    enabled: !threeDOpen,
    onClose,
  });

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
    threeDClosingGuardUntilRef.current = Date.now() + 300;
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
    if (!collectionItem || collectionItem.read_only || removingCollectionItem) return;

    const location = collectionItem.for_sale
      ? "For Sale"
      : collectionItem.binder_name ?? "loose singles";
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

  function getCardMarketUrl(): string {
    const stored = resolvedUrl ?? modalCard.cardmarket_url;
    return getSafeDirectCardMarketCardUrl(stored, modalCard.game) ?? buildCardMarketProxyUrl(modalCard.id);
  }

  async function openCardMarket() {
    let targetUrl = getCardMarketUrl();
    if (!isDirectCardMarketUrl(targetUrl)) {
      try {
        const res = await fetch(`/api/cm-url?card_id=${encodeURIComponent(modalCard.id)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          const direct =
            typeof data.url === "string"
              ? getSafeDirectCardMarketCardUrl(data.url, modalCard.game)
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
  const desktopPreviewPanel = (
    <CardModalPreview
      card={modalCard}
      mediaWidth={desktopPreviewMediaWidth}
      imageSize={layout.imageSize}
      previewAspectClass={previewAspectClass}
      showGradedPreview={showGradedPreview}
      gradingCompanyLabel={gradingCompanyLabel}
      gradingGradeLabel={gradingGradeLabel}
      gradedTileSize={displaySettings.cardSize}
      onOpenThreeD={openThreeDView}
    />
  );
  const desktopHeroPanel = (
    <CardModalHeroSection
      card={modalCard}
      collectionItem={collectionItem}
      titleClass={layout.titleClass}
      metaClassName={layout.metaClassName}
      detailStatClass={layout.detailStatClass}
      gradingCompanyLabel={gradingCompanyLabel}
      gradingGradeLabel={gradingGradeLabel}
      refreshError={refreshError}
      variant="compact"
      onClose={onClose}
    />
  );
  const desktopDetailsPanel = (
    <CardModalHeroSection
      card={modalCard}
      collectionItem={collectionItem}
      titleClass={layout.titleClass}
      metaClassName={layout.metaClassName}
      detailStatClass={layout.detailStatClass}
      gradingCompanyLabel={gradingCompanyLabel}
      gradingGradeLabel={gradingGradeLabel}
      refreshError={null}
      variant="details"
      onClose={onClose}
    />
  );
  const desktopHistoryPanel = (
    <CardModalHistorySection
      historyChartMode={effectiveHistoryChartMode}
      activeMarketSource={effectiveMarketDataSource}
      cardMarketHistory={cardMarketHistory}
      activeCardMarketCurrentValue={activeCardMarketCurrentValue}
      showTcgPlayerSource={hasTcgPlayerData}
      card={modalCard}
      collectionItem={collectionItem}
      availableCardMarketHistorySeries={availableCardMarketHistorySeries}
      activeCardMarketHistorySeries={activeCardMarketHistorySeries}
      activeCardMarketSeriesLabel={activeCardMarketSeriesLabel}
      onSelectMarketSource={setMarketDataSource}
      onSelectCardMarketHistorySeries={setCardMarketHistorySeries}
      onSelectHistoryChartMode={setHistoryChartMode}
      tcgPlayerHistory={tcgPlayerHistory}
      tcgPlayerCurrentValue={modalCard.price?.tcp_market ?? null}
      gradedPriceHistory={gradedPriceHistory}
      ebaySoldGradedPriceHistory={ebaySoldGradedPriceHistory}
    />
  );

  return (
    <>
      <div
        className="dc-modal-overlay fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-[#050507] px-0 py-0 sm:px-3 sm:py-[calc(0.75rem+env(safe-area-inset-top))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))] md:block md:bg-[#08080c] md:p-0 xl:left-[16rem]"
        style={{ overscrollBehavior: "contain" }}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-full sm:w-[min(100%,calc(100vw-1.5rem))] md:w-full"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            ref={modalFrameRef}
            role="dialog"
            aria-modal="true"
            aria-label={modalCard.name}
            tabIndex={-1}
            className="card-modal-frame dc-modal-panel relative h-dvh max-h-dvh w-full max-w-full overflow-y-auto overscroll-contain rounded-none border border-white/12 bg-[#050506] [scrollbar-gutter:stable] shadow-none md:h-auto md:min-h-dvh md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:bg-[#050505] md:shadow-none"
            data-modal-size={displaySettings.modalSize}
            data-mobile-showcase="true"
          >
            <div className="md:hidden">
              <CardModalMobileShowcase
                card={modalCard}
                collectionItem={collectionItem}
                previewAspectClass={previewAspectClass}
                showGradedPreview={showGradedPreview}
                gradingCompanyLabel={gradingCompanyLabel}
                gradingGradeLabel={gradingGradeLabel}
                gradedTileSize={displaySettings.cardSize}
                cardMarketHistory={cardMarketHistory}
                activeCardMarketCurrentValue={activeCardMarketCurrentValue}
                activeCardMarketSeriesLabel={activeCardMarketSeriesLabel}
                storedCardMarketUrl={storedCardMarketUrl}
                canManageCardPrices={canManageCardPrices}
                isBusy={isBusy}
                refreshing={refreshing}
                syncingHistory={syncingHistory}
                removingCollectionItem={removingCollectionItem}
                onClose={onClose}
                onOpenThreeD={openThreeDView}
                onOpenCardMarket={openCardMarket}
                onRefresh={() => void runCardAction("refresh")}
                onSyncHistory={() => void runCardAction("sync-history")}
                onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
                onAddedToCollection={refreshModalCardFromServer}
              />
            </div>

            <div className="card-modal-desktop-workspace hidden md:block">
              <div
                className="mx-auto flex min-h-dvh w-full flex-col gap-5 px-6 py-6 lg:px-8 lg:py-7"
                style={desktopWorkspaceStyle}
              >
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onClose();
                    }}
                    className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-transparent px-1.5 pr-3 text-sm font-semibold text-white/58 transition-colors hover:border-white/10 hover:bg-white/[0.045] hover:text-white"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] transition-colors group-hover:border-white/18 group-hover:bg-white/[0.08]">
                      <span aria-hidden="true" className="text-lg leading-none">
                        &lt;
                      </span>
                    </span>
                    Back to Collection
                  </button>

                  <CardModalDesktopActionGroup
                    card={modalCard}
                    collectionItem={collectionItem}
                    isBusy={isBusy}
                    refreshing={refreshing}
                    syncingHistory={syncingHistory}
                    canManageCardPrices={canManageCardPrices}
                    removingCollectionItem={removingCollectionItem}
                    onRefresh={() => void runCardAction("refresh")}
                    onSyncHistory={() => void runCardAction("sync-history")}
                    onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
                    onAddedToCollection={refreshModalCardFromServer}
                    onClose={onClose}
                  />
                </div>

              <div className="card-modal-layout-grid">
                <div className={`${desktopPreviewClass} flex min-w-0 justify-center 2xl:justify-start`}>
                  {desktopPreviewPanel}
                </div>

                <div className="card-modal-area-hero min-w-0">
                  {desktopHeroPanel}
                </div>

                <div className="card-modal-area-owned min-w-0">
                  <CardModalOwnedCopyPanel
                    card={modalCard}
                    collectionItem={collectionItem}
                    className="h-full"
                    onAddedToCollection={refreshModalCardFromServer}
                  />
                </div>

                <div className="card-modal-area-details min-w-0">
                  {desktopDetailsPanel}
                </div>

                <div className="card-modal-area-history min-w-0">
                  {desktopHistoryPanel}
                </div>

                <div className="card-modal-area-support grid min-w-0 items-start gap-5 lg:grid-cols-2">
                    <CardModalRecentPricesPanel
                      card={modalCard}
                      className="h-full min-h-[10rem]"
                    />
                    <CardModalActiveListingsPanel
                      card={modalCard}
                      storedCardMarketUrl={storedCardMarketUrl}
                      className="h-full min-h-[10rem]"
                      onOpenCardMarket={openCardMarket}
                    />
                </div>

                {modalCard.buy_signal ? (
                  <div className="card-modal-area-signal min-w-0">
                    <CardModalBuySignalPanel signal={modalCard.buy_signal} compact />
                  </div>
                ) : null}
              </div>
              </div>
            </div>
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
