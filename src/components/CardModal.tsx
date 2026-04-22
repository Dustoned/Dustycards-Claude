"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
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
  getCardMarketHistorySeriesCurrentValue,
  getCardMarketHistorySeriesValue,
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
  const [selectedGradedLabel, setSelectedGradedLabel] = useState<string | null>(() =>
    getPreferredGradedLabel(
      card.graded_prices ?? [],
      card.collection_item?.grading_company,
      card.collection_item?.grading_grade
    )
  );

  const collectionItem = modalCard.collection_item ?? null;
  const layout = getCardModalLayoutClasses(
    settings.modalSize,
    settings.widescreen,
    Boolean(collectionItem)
  );
  const gradedPrices = modalCard.graded_prices ?? [];
  const gradingCompanyLabel = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  const showGradedPreview = Boolean(gradingCompanyLabel && gradingGradeLabel);
  const previewAspectClass = showGradedPreview
    ? GRADED_SLAB_ASPECT_CLASS
    : RAW_CARD_ASPECT_CLASS;
  const isBusy = refreshing || syncingHistory;
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
      ? getCardMarketHistorySeriesCurrentValue(modalCard.price, activeCardMarketHistorySeries)
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

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(14px)" }}
        onClick={onClose}
      >
        <div
          className={`${layout.maxW} glass max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain rounded-[32px] shadow-[0_32px_90px_rgba(0,0,0,0.52)]`}
          style={{
            background: "rgba(10,10,12,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onClick={(event) => event.stopPropagation()}
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
                  onRefresh={() => void runCardAction("refresh")}
                  onSyncHistory={() => void runCardAction("sync-history")}
                  onClose={onClose}
                />

                <CardModalPricingSection
                  card={modalCard}
                  availableCardMarketHistorySeries={availableCardMarketHistorySeries}
                  activeCardMarketHistorySeries={activeCardMarketHistorySeries}
                  activeCardMarketSeriesLabel={activeCardMarketSeriesLabel}
                  activeCardMarketCurrentValue={activeCardMarketCurrentValue}
                  gradedPrices={gradedPrices}
                  gradingCompanyLabel={gradingCompanyLabel}
                  gradingGradeLabel={gradingGradeLabel}
                  selectedGradedPrice={selectedGradedPrice}
                  onSelectCardMarketHistorySeries={setCardMarketHistorySeries}
                  onSelectGradedLabel={setSelectedGradedLabel}
                />

                <CardModalHistorySection
                  cardId={modalCard.id}
                  historyChartsOpen={historyChartsOpen}
                  cardMarketHistory={cardMarketHistory}
                  activeCardMarketCurrentValue={activeCardMarketCurrentValue}
                  onToggleHistoryCharts={() =>
                    setHistoryChartsOpen((current) => !current)
                  }
                  tcgPlayerHistory={tcgPlayerHistory}
                  tcgPlayerCurrentValue={modalCard.price?.tcp_market ?? null}
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
