"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import { resolveCardMarketSealedProductUrl } from "@/lib/cardmarket";
import {
  getSealedMarketHistorySeriesCurrentValue,
  getSealedMarketHistorySeriesValue,
  hasSealedMarketHistorySeries,
  SEALED_MARKET_HISTORY_SERIES,
  type SealedMarketHistorySeriesKey,
} from "@/lib/price-history";
import { getSealedProductPrice } from "@/lib/sealed-products";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import {
  SealedModalFooter,
  SealedModalHeroSection,
  SealedModalHistorySection,
  SealedModalPreview,
} from "./sealed-modal/SealedModalSections";
import type {
  SealedActionResponse,
  SealedDetailResponse,
  SealedModalProductData,
} from "./sealed-modal/types";
import {
  buildInitialSealedDetail,
  formatTimestamp,
  getSealedModalLayoutClasses,
} from "./sealed-modal/utils";

export type { SealedModalProductData } from "./sealed-modal/types";

interface Props {
  product: SealedModalProductData;
  onClose: () => void;
}

export default function SealedProductModal({ product, onClose }: Props) {
  useBodyScrollLock();

  const { displaySettings, currentUserRole } = useSettings();
  const [modalProduct, setModalProduct] = useState<SealedDetailResponse>(() =>
    buildInitialSealedDetail(product)
  );
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sealedHistorySeries, setSealedHistorySeries] =
    useState<SealedMarketHistorySeriesKey>("cm_market");

  const layout = getSealedModalLayoutClasses(
    displaySettings.modalSize,
    displaySettings.widescreen
  );
  const primaryPrice = getSealedProductPrice(modalProduct);
  const priceHistory = modalProduct.price_history;
  const availableSealedHistorySeries = SEALED_MARKET_HISTORY_SERIES.filter(
    (series) =>
      hasSealedMarketHistorySeries(priceHistory, series.key) ||
      getSealedMarketHistorySeriesCurrentValue(modalProduct.price, series.key) != null
  );
  const activeSealedHistorySeries = availableSealedHistorySeries.some(
    (series) => series.key === sealedHistorySeries
  )
    ? sealedHistorySeries
    : availableSealedHistorySeries[0]?.key ?? "cm_market";
  const activeSealedHistorySeriesLabel =
    availableSealedHistorySeries.find((series) => series.key === activeSealedHistorySeries)
      ?.label ?? "Market";
  const activeSealedCurrentValue =
    getSealedMarketHistorySeriesCurrentValue(modalProduct.price, activeSealedHistorySeries) ??
    primaryPrice;
  const historySeriesPoints = priceHistory.map((point) => ({
    date: point.date,
    label: point.label,
    value: getSealedMarketHistorySeriesValue(point, activeSealedHistorySeries),
  }));
  const chartPoints = historySeriesPoints.some((point) => point.value != null)
    ? historySeriesPoints
    : activeSealedCurrentValue != null
      ? [{ date: "current", label: "Now", value: activeSealedCurrentValue }]
      : [];
  const cardMarketUrl = resolveCardMarketSealedProductUrl(modalProduct);
  const isBusy = refreshing || syncingHistory;
  const priceFetchedAtLabel = formatTimestamp(modalProduct.price_fetched_at);
  const canManageSealedPrices = currentUserRole === "admin";

  useEffect(() => {
    const controller = new AbortController();

    async function loadProductDetail() {
      setDetailsLoading(true);
      setActionError(null);
      setModalProduct(buildInitialSealedDetail(product));

      try {
        const response = await fetch(`/api/sealed/${encodeURIComponent(product.id)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json()) as SealedActionResponse;

        if (!response.ok) {
          throw new Error(data.error ?? `Failed to load sealed detail for ${product.id}`);
        }

        setModalProduct(data as SealedDetailResponse);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActionError(
            error instanceof Error ? error.message : "Could not load this sealed product"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailsLoading(false);
        }
      }
    }

    void loadProductDetail();

    return () => controller.abort();
  }, [product]);

  async function runSealedAction(action: "refresh" | "sync-history") {
    if (action === "refresh") {
      setRefreshing(true);
    } else {
      setSyncingHistory(true);
    }
    setActionError(null);

    try {
      const response = await fetch(`/api/sealed/${encodeURIComponent(modalProduct.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      const data = (await response.json()) as SealedActionResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            (action === "refresh"
              ? "Could not refresh this sealed product"
              : "Could not import price history for this sealed product")
        );
      }

      setModalProduct(data as SealedDetailResponse);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : action === "refresh"
            ? "Could not refresh this sealed product"
            : "Could not import price history for this sealed product"
      );
    } finally {
      if (action === "refresh") {
        setRefreshing(false);
      } else {
        setSyncingHistory(false);
      }
    }
  }

  async function refreshModalProductFromServer() {
    try {
      const response = await fetch(`/api/sealed/${encodeURIComponent(modalProduct.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as SealedDetailResponse;
      setModalProduct(data);
    } catch {
      // The page refresh still updates collection state; keep the modal usable if this fails.
    }
  }

  return (
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
          aria-label="Close sealed product details"
          title="Close"
        >
          <X className="h-[18px] w-[18px] stroke-[1.8]" />
        </button>

        <div
          role="dialog"
          aria-modal="true"
          aria-label={modalProduct.name}
          className="card-modal-frame glass relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain rounded-[32px] [overflow-anchor:none] [scrollbar-gutter:stable] shadow-[0_32px_90px_rgba(0,0,0,0.52)]"
          data-modal-size={displaySettings.modalSize}
          style={{
            background: "rgba(10,10,12,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className={layout.pad}>
            <div
              className={`grid ${layout.gridGap} lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start`}
            >
              <SealedModalPreview
                product={modalProduct}
                mediaWidth={layout.mediaWidth}
                imageSize={layout.imageSize}
                imagePadding={layout.imagePadding}
              />

              <div className="min-w-0 space-y-3">
                <SealedModalHeroSection
                  product={modalProduct}
                  titleClass={layout.titleClass}
                  metaClassName={layout.metaClassName}
                  detailStatClass={layout.detailStatClass}
                  isBusy={isBusy}
                  refreshing={refreshing}
                  syncingHistory={syncingHistory}
                  actionError={actionError}
                  canManageSealedPrices={canManageSealedPrices}
                  onRefresh={() => void runSealedAction("refresh")}
                  onSyncHistory={() => void runSealedAction("sync-history")}
                  onAddedToCollection={refreshModalProductFromServer}
                  onClose={onClose}
                />

                <SealedModalHistorySection
                  productId={modalProduct.id}
                  product={modalProduct}
                  chartPoints={chartPoints}
                  currentValue={activeSealedCurrentValue}
                  priceFetchedAtLabel={priceFetchedAtLabel}
                  loading={detailsLoading && priceHistory.length === 0}
                  availableHistorySeries={availableSealedHistorySeries}
                  activeHistorySeries={activeSealedHistorySeries}
                  activeHistorySeriesLabel={activeSealedHistorySeriesLabel}
                  onSelectHistorySeries={setSealedHistorySeries}
                />
              </div>
            </div>
          </div>

          <SealedModalFooter
            product={modalProduct}
            footerGridClass={layout.footerGridClass}
            cardMarketUrl={cardMarketUrl}
            onAddedToCollection={refreshModalProductFromServer}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
