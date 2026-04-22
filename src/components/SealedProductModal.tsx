"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { buildCardMarketProductUrl, withCardMarketFilters } from "@/lib/cardmarket";
import { getSealedProductPrice } from "@/lib/sealed-products";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import {
  SealedModalFooter,
  SealedModalHeroSection,
  SealedModalHistorySection,
  SealedModalPreview,
  SealedModalPricingSection,
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

  const { settings } = useSettings();
  const [modalProduct, setModalProduct] = useState<SealedDetailResponse>(() =>
    buildInitialSealedDetail(product)
  );
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const layout = getSealedModalLayoutClasses(settings.modalSize, settings.widescreen);
  const primaryPrice = getSealedProductPrice(modalProduct);
  const priceHistory = modalProduct.price_history;
  const chartPoints =
    priceHistory.length > 0
      ? priceHistory.map((point) => ({
          date: point.date,
          label: point.label,
          value: point.cm_market,
        }))
      : primaryPrice != null
        ? [{ date: "current", label: "Nu", value: primaryPrice }]
        : [];
  const cardMarketUrl = modalProduct.cardmarket_url
    ? withCardMarketFilters(modalProduct.cardmarket_url)
    : modalProduct.cardmarket_id
      ? buildCardMarketProductUrl(modalProduct.cardmarket_id)
      : null;
  const isBusy = refreshing || syncingHistory;
  const priceFetchedAtLabel = formatTimestamp(modalProduct.price_fetched_at);

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

  return (
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
          <div className={`grid ${layout.gridGap} lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start`}>
            <SealedModalPreview
              product={modalProduct}
              mediaWidth={layout.mediaWidth}
              imageSize={layout.imageSize}
              imagePadding={layout.imagePadding}
              priceHistoryCount={priceHistory.length}
              priceFetchedAtLabel={priceFetchedAtLabel}
              onClose={onClose}
            />

            <div className="min-w-0 space-y-4">
              <SealedModalHeroSection
                product={modalProduct}
                titleClass={layout.titleClass}
                metaClassName={layout.metaClassName}
                priceHistoryCount={priceHistory.length}
                isBusy={isBusy}
                refreshing={refreshing}
                syncingHistory={syncingHistory}
                actionError={actionError}
                onRefresh={() => void runSealedAction("refresh")}
                onSyncHistory={() => void runSealedAction("sync-history")}
                onClose={onClose}
              />

              <SealedModalPricingSection
                product={modalProduct}
                primaryPrice={primaryPrice}
                priceFetchedAtLabel={priceFetchedAtLabel}
              />
            </div>
          </div>

          <div className="mt-4 sm:mt-5">
            <SealedModalHistorySection
              chartPoints={chartPoints}
              currentValue={primaryPrice}
              loading={detailsLoading && priceHistory.length === 0}
            />
          </div>
        </div>

        <SealedModalFooter
          product={modalProduct}
          footerGridClass={layout.footerGridClass}
          cardMarketUrl={cardMarketUrl}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
