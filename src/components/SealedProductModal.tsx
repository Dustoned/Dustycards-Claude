"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Boxes,
  ChartNoAxesCombined,
  LineChart,
  MoreHorizontal,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CardDetailMobileMarketAction from "@/components/card-detail/CardDetailMobileMarketAction";
import CardPriceAlertButton from "@/components/card-detail/CardPriceAlertButton";
import CardDetailShell, {
  CardDetailMobileActionPortal,
  type CardDetailTab,
} from "@/components/card-detail/CardDetailShell";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import CollectionEditSealedButton from "@/components/CollectionEditSealedButton";
import { useSettings } from "@/components/SettingsProvider";
import { resolveCardMarketSealedProductUrl } from "@/lib/cardmarket";
import { buildSealedEbaySearchUrl } from "@/lib/ebay-search-url";
import { formatCurrency } from "@/lib/format";
import { getExpansionHref } from "@/lib/games";
import {
  getSealedMarketHistorySeriesCurrentValue,
  getSealedMarketHistorySeriesValue,
  hasSealedMarketHistorySeries,
  SEALED_MARKET_HISTORY_SERIES,
  type SealedMarketHistorySeriesKey,
} from "@/lib/price-history";
import { getSealedProductPrice } from "@/lib/sealed-products";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import useModalA11y from "@/lib/useModalA11y";
import {
  SealedFeaturedCardsSection,
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
import type { ModalCardData } from "./card-modal/types";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

export type { SealedModalProductData } from "./sealed-modal/types";

interface Props {
  product: SealedModalProductData;
  onClose: () => void;
}

const RELEASE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatReleaseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : RELEASE_DATE_FORMATTER.format(parsed);
}

function buildCollectionProduct(product: SealedDetailResponse) {
  return {
    id: product.id,
    name: product.name,
    image_url: product.image_url,
    episode: product.episode,
  };
}

function formatSignedCurrency(value: number | null): string {
  if (value == null) return "--";
  const formatted = formatCurrency(Math.abs(value), "EUR");
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function SealedDetailActionGroup({
  product,
  cardMarketUrl,
  ebayUrl,
  isBusy,
  refreshing,
  syncingHistory,
  removingCollectionItem,
  canManageSealedPrices,
  onRefresh,
  onSyncHistory,
  onRemoveCollectionItem,
  onCollectionChanged,
}: {
  product: SealedDetailResponse;
  cardMarketUrl: string | null;
  ebayUrl: string;
  isBusy: boolean;
  refreshing: boolean;
  syncingHistory: boolean;
  removingCollectionItem: boolean;
  canManageSealedPrices: boolean;
  onRefresh: () => void;
  onSyncHistory: () => void;
  onRemoveCollectionItem: () => void;
  onCollectionChanged: () => void | Promise<void>;
}) {
  const collectionProduct = buildCollectionProduct(product);
  const collectionItem = product.collection_item ?? null;
  const menuButtonClass =
    "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-white/68 transition hover:bg-white/[0.065] hover:text-white disabled:cursor-not-allowed disabled:opacity-45";
  const mobileMarketClass =
    "flex min-h-11 w-full min-w-0 max-w-full items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.045] px-2 text-[13px] font-bold text-white/72 transition hover:border-violet-200/28 hover:bg-violet-500/[0.12] hover:text-white";

  return (
    <div
      className="card-detail-action-cluster min-w-0 items-center justify-end gap-2"
      aria-label="Sealed product actions"
    >
      <CardDetailMobileActionPortal>
        <div
          className="card-detail-primary-actions min-w-0 items-center justify-end gap-2"
          role="group"
          aria-label="Primary sealed product actions"
          data-card-detail-primary-actions
        >
          <CollectionAddSealedButton
            product={collectionProduct}
            mode="button"
            theme="dark"
            label="Add copy"
            className="!min-h-11 !flex-1 !whitespace-nowrap !rounded-xl !border-violet-300/24 !bg-violet-500/22 !px-3 !text-[13px] !font-bold !text-white hover:!border-violet-200/38 hover:!bg-violet-500/30 sm:!px-4 sm:!text-sm lg:!flex-none"
            onAdded={onCollectionChanged}
          />
          <CardDetailMobileMarketAction
            cardMarketHref={cardMarketUrl ?? undefined}
            ebayHref={ebayUrl}
            className={mobileMarketClass}
          />
        </div>
      </CardDetailMobileActionPortal>

      <CardPriceAlertButton
        cardId={product.id}
        cardName={product.name}
        endpoint={`/api/price-alerts/sealed/${encodeURIComponent(product.id)}`}
        eyebrow="Sealed price alert"
        sourceLabel="CardMarket EU sealed"
      />

      {collectionItem || canManageSealedPrices ? (
        <details
          className="group/sealed-actions relative shrink-0"
          data-card-detail-overflow-actions
        >
          <summary
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-white/66 transition marker:hidden hover:border-white/18 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
            aria-label="More sealed product actions"
            title="More sealed product actions"
          >
            <MoreHorizontal className="h-5 w-5" />
          </summary>
          <div className="card-detail-overflow-menu absolute right-0 top-[calc(100%+0.55rem)] z-[245] w-56 overflow-hidden rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-glass-strong)] p-1.5 shadow-[0_22px_70px_var(--dc-shadow-color)] backdrop-blur-2xl">
            {collectionItem ? (
              <CollectionEditSealedButton
                product={collectionProduct}
                item={collectionItem}
                mode="button"
                theme="dark"
                label="Edit saved copy"
                className="!min-h-11 !w-full !justify-start !rounded-xl !border-0 !bg-transparent !px-3 !text-sm !font-semibold !text-white/68 hover:!bg-white/[0.065] hover:!text-white"
                onSaved={onCollectionChanged}
              />
            ) : null}
            {collectionItem ? (
              <button
                type="button"
                onClick={onRemoveCollectionItem}
                disabled={isBusy || removingCollectionItem}
                className={`${menuButtonClass} text-rose-100/76 hover:bg-rose-500/[0.11] hover:text-rose-50`}
              >
                <Trash2
                  className={`h-4 w-4 ${removingCollectionItem ? "animate-pulse" : ""}`}
                />
                {removingCollectionItem ? "Removing copy..." : "Remove saved copy"}
              </button>
            ) : null}

            {canManageSealedPrices ? (
              <div className="mt-1 border-t border-white/[0.07] pt-1">
                <button
                  type="button"
                  onClick={onSyncHistory}
                  disabled={isBusy}
                  className={menuButtonClass}
                >
                  <LineChart
                    className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`}
                  />
                  {syncingHistory ? "Syncing history..." : "Sync price history"}
                </button>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isBusy}
                  className={menuButtonClass}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
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

export default function SealedProductModal({ product, onClose }: Props) {
  useBodyScrollLock(true, "overflow");
  const router = useRouter();
  const modalFrameRef = useRef<HTMLDivElement | null>(null);
  const { displaySettings, currentUserRole } = useSettings();
  const [modalProduct, setModalProduct] = useState<SealedDetailResponse>(() =>
    buildInitialSealedDetail(product)
  );
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [removingCollectionItem, setRemovingCollectionItem] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingFeaturedCardId, setOpeningFeaturedCardId] = useState<string | null>(null);
  const [selectedFeaturedCard, setSelectedFeaturedCard] = useState<ModalCardData | null>(null);
  const [sealedHistorySeries, setSealedHistorySeries] =
    useState<SealedMarketHistorySeriesKey>("cm_market_eu");

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
    getSealedMarketHistorySeriesCurrentValue(
      modalProduct.price,
      activeSealedHistorySeries
    ) ?? primaryPrice;
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
  const collectionItem = modalProduct.collection_item ?? null;
  const collectionQuantity =
    modalProduct.collection_summary?.quantity ?? collectionItem?.quantity ?? 0;
  const collectionPaidTotal =
    modalProduct.collection_summary?.paid_total ??
    (collectionItem?.purchase_price_per_item != null
      ? Number(
          (collectionItem.purchase_price_per_item * collectionItem.quantity).toFixed(2)
        )
      : null);
  const collectionCurrentTotal =
    activeSealedCurrentValue != null && collectionQuantity > 0
      ? Number((activeSealedCurrentValue * collectionQuantity).toFixed(2))
      : null;
  const collectionPnl =
    collectionCurrentTotal != null && collectionPaidTotal != null
      ? Number((collectionCurrentTotal - collectionPaidTotal).toFixed(2))
      : null;
  const trend30d =
    activeSealedHistorySeries === "cm_market" &&
    activeSealedCurrentValue != null &&
    modalProduct.price.cm_avg_30d != null &&
    modalProduct.price.cm_avg_30d > 0
      ? ((activeSealedCurrentValue - modalProduct.price.cm_avg_30d) /
          modalProduct.price.cm_avg_30d) *
        100
      : null;
  const cardMarketUrl = resolveCardMarketSealedProductUrl(modalProduct);
  const ebayUrl = buildSealedEbaySearchUrl({
    name: modalProduct.name,
    episodeName: modalProduct.episode?.name,
    episodeCode: modalProduct.episode?.code,
  });
  const isBusy = refreshing || syncingHistory || removingCollectionItem;
  const priceFetchedAtLabel = formatTimestamp(modalProduct.price_fetched_at);
  const releaseDate =
    formatReleaseDate(modalProduct.release_date) ??
    formatReleaseDate(modalProduct.episode?.release_date);
  const canManageSealedPrices = currentUserRole === "admin";

  useModalA11y({ dialogRef: modalFrameRef, onClose });

  function buildDetailUrl(
    productId: string,
    collectionItemId?: string | null
  ): string {
    const params = new URLSearchParams();
    if (collectionItemId) params.set("collectionItemId", collectionItemId);
    const query = params.toString();
    return `/api/sealed/${encodeURIComponent(productId)}${query ? `?${query}` : ""}`;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadProductDetail() {
      setDetailsLoading(true);
      setActionError(null);
      setModalProduct(buildInitialSealedDetail(product));

      try {
        const response = await fetch(
          buildDetailUrl(product.id, product.collection_item_id),
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );
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
        if (!controller.signal.aborted) setDetailsLoading(false);
      }
    }

    void loadProductDetail();
    return () => controller.abort();
  }, [product]);

  async function runSealedAction(action: "refresh" | "sync-history") {
    if (action === "refresh") setRefreshing(true);
    else setSyncingHistory(true);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/sealed/${encodeURIComponent(modalProduct.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            collectionItemId:
              modalProduct.collection_item_id ?? collectionItem?.id ?? null,
          }),
          cache: "no-store",
        }
      );
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
      if (action === "refresh") setRefreshing(false);
      else setSyncingHistory(false);
    }
  }

  async function refreshModalProductFromServer() {
    try {
      const preferredItemId =
        modalProduct.collection_item_id ??
        modalProduct.collection_item?.id ??
        product.collection_item_id ??
        null;
      const response = await fetch(buildDetailUrl(modalProduct.id, preferredItemId), {
        cache: "no-store",
      });
      if (!response.ok) return;
      setModalProduct((await response.json()) as SealedDetailResponse);
    } catch {
      // Collection changes still refresh the backing page.
    }
  }

  async function removeCurrentCollectionItem() {
    if (!collectionItem || removingCollectionItem) return;
    if (!window.confirm("Remove this saved sealed copy from your collection?")) return;

    setRemovingCollectionItem(true);
    setActionError(null);
    try {
      const response = await fetch("/api/collection/sealed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionItem.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove this sealed copy");
      }
      router.refresh();
      onClose();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not remove this sealed copy"
      );
    } finally {
      setRemovingCollectionItem(false);
    }
  }

  async function openFeaturedCard(cardId: string) {
    if (openingFeaturedCardId) return;
    setOpeningFeaturedCardId(cardId);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      setSelectedFeaturedCard((await response.json()) as ModalCardData);
    } catch {
      setActionError("Could not open this featured card");
    } finally {
      setOpeningFeaturedCardId(null);
    }
  }

  const priceRows = [
    ["English", modalProduct.price.cm_lowest],
    ["EU only", modalProduct.price.cm_lowest_eu],
    ["German", modalProduct.price.cm_lowest_de],
    ["French", modalProduct.price.cm_lowest_fr],
    ["Spanish", modalProduct.price.cm_lowest_es],
    ["Italian", modalProduct.price.cm_lowest_it],
  ] as const;

  const overviewPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <section className="card-detail-surface">
        <p className="card-detail-eyebrow">Product profile</p>
        <h2 className="mt-2 text-xl font-extrabold text-white/92">Sealed details</h2>
        <p className="card-detail-surface-copy">
          Product identity, linked set and release information.
        </p>
        <dl className="card-detail-info-grid mt-4">
          <div className="card-detail-info-cell">
            <dt>Type</dt>
            <dd>Sealed product</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Set</dt>
            <dd>
              {modalProduct.episode ? (
                <Link
                  href={`${getExpansionHref(modalProduct.episode.id)}?tab=sealed`}
                  prefetch={false}
                  onClick={onClose}
                  className="text-violet-100/88 hover:text-white"
                >
                  {modalProduct.episode.name}
                </Link>
              ) : (
                "--"
              )}
            </dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Set code</dt>
            <dd>{modalProduct.episode?.code ?? "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Release</dt>
            <dd>{releaseDate ?? "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Price updated</dt>
            <dd>{priceFetchedAtLabel ?? "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>History</dt>
            <dd>{chartPoints.length > 0 ? `${chartPoints.length} points` : "Building"}</dd>
          </div>
        </dl>
      </section>

      <section className="card-detail-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="card-detail-eyebrow">Collector snapshot</p>
            <h2 className="mt-2 text-xl font-extrabold text-white/92">
              {collectionItem ? "Saved with purchase context" : "Ready for your collection"}
            </h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-400/[0.07] text-violet-100/76">
            <PackageCheck className="h-4 w-4" />
          </span>
        </div>
        <dl className="card-detail-info-grid mt-4">
          <div className="card-detail-info-cell">
            <dt>Status</dt>
            <dd>{collectionItem ? "Owned" : "Not owned"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Quantity</dt>
            <dd>{collectionQuantity > 0 ? `x${collectionQuantity}` : "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Paid</dt>
            <dd>{formatCurrency(collectionPaidTotal, "EUR")}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Market value</dt>
            <dd>{formatCurrency(collectionCurrentTotal, "EUR")}</dd>
          </div>
        </dl>
        {collectionItem?.notes ? (
          <p className="mt-4 rounded-xl border border-white/8 bg-black/18 p-3 text-sm leading-relaxed text-white/58">
            {collectionItem.notes}
          </p>
        ) : null}
      </section>
    </div>
  );

  const marketPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <section className="card-detail-surface">
        <p className="card-detail-eyebrow">Current market</p>
        <h2 className="mt-2 text-xl font-extrabold text-white/92">
          CardMarket price coverage
        </h2>
        <dl className="card-detail-info-grid mt-4">
          {priceRows.map(([label, value]) => (
            <div key={label} className="card-detail-info-cell">
              <dt>{label}</dt>
              <dd>{formatCurrency(value, "EUR")}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card-detail-surface">
        <p className="card-detail-eyebrow">Price context</p>
        <h2 className="mt-2 text-xl font-extrabold text-white/92">
          Averages and sources
        </h2>
        <dl className="card-detail-info-grid mt-4">
          <div className="card-detail-info-cell">
            <dt>7-day average</dt>
            <dd>{formatCurrency(modalProduct.price.cm_avg_7d, "EUR")}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>30-day average</dt>
            <dd>{formatCurrency(modalProduct.price.cm_avg_30d, "EUR")}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>History synced</dt>
            <dd>{formatTimestamp(modalProduct.history_synced_at) ?? "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Active series</dt>
            <dd>{activeSealedHistorySeriesLabel}</dd>
          </div>
        </dl>
      </section>
    </div>
  );

  const collectionPanel = (
    <div
      className="card-detail-section-grid card-detail-collection-grid"
      data-columns="2"
    >
      <section className="card-detail-surface">
        <p className="card-detail-eyebrow">Collection status</p>
        <h2 className="mt-2 text-xl font-extrabold text-white/92">
          {collectionItem ? "Owned sealed copy" : "Not in your collection"}
        </h2>
        {collectionItem ? (
          <>
            <dl className="card-detail-info-grid mt-4">
              <div className="card-detail-info-cell">
                <dt>Quantity</dt>
                <dd>x{collectionItem.quantity}</dd>
              </div>
              <div className="card-detail-info-cell">
                <dt>Paid per item</dt>
                <dd>{formatCurrency(collectionItem.purchase_price_per_item, "EUR")}</dd>
              </div>
              <div className="card-detail-info-cell">
                <dt>Added</dt>
                <dd>{formatReleaseDate(collectionItem.added_at) ?? "--"}</dd>
              </div>
            </dl>
            {collectionItem.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {collectionItem.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-violet-300/16 bg-violet-400/[0.07] px-2.5 py-1 text-xs font-semibold text-violet-100/74"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {collectionItem.notes ? (
              <p className="mt-4 whitespace-pre-wrap rounded-xl border border-white/8 bg-black/18 p-3 text-sm leading-relaxed text-white/58">
                {collectionItem.notes}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <CollectionEditSealedButton
                product={buildCollectionProduct(modalProduct)}
                item={collectionItem}
                mode="button"
                theme="dark"
                label="Edit saved copy"
                className="!min-h-10 !rounded-xl"
                onSaved={refreshModalProductFromServer}
              />
              <CollectionAddSealedButton
                product={buildCollectionProduct(modalProduct)}
                mode="button"
                theme="dark"
                label="Add another copy"
                className="!min-h-10 !rounded-xl"
                onAdded={refreshModalProductFromServer}
              />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-white/52">
              Add a copy to track quantity, purchase price, tags and notes.
            </p>
            <CollectionAddSealedButton
              product={buildCollectionProduct(modalProduct)}
              mode="button"
              theme="dark"
              label="Add to collection"
              className="mt-4 !min-h-10 !rounded-xl"
              onAdded={refreshModalProductFromServer}
            />
          </>
        )}
      </section>

      <section className="card-detail-surface">
        <p className="card-detail-eyebrow">Position value</p>
        <h2 className="mt-2 text-xl font-extrabold text-white/92">
          Cost versus current market
        </h2>
        <dl className="card-detail-info-grid mt-4">
          <div className="card-detail-info-cell">
            <dt>Current per item</dt>
            <dd>{formatCurrency(activeSealedCurrentValue, "EUR")}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Total market</dt>
            <dd>{formatCurrency(collectionCurrentTotal, "EUR")}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Total paid</dt>
            <dd>{formatCurrency(collectionPaidTotal, "EUR")}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>P/L</dt>
            <dd
              className={
                collectionPnl == null
                  ? ""
                  : collectionPnl >= 0
                    ? "!text-emerald-200"
                    : "!text-rose-200"
              }
            >
              {formatSignedCurrency(collectionPnl)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );

  const tabs: CardDetailTab[] = [
    { id: "overview", label: "Overview", content: overviewPanel },
    {
      id: "market",
      label: "Market",
      icon: ChartNoAxesCombined,
      content: marketPanel,
    },
    {
      id: "collection",
      label: "Collection",
      icon: Boxes,
      content: collectionPanel,
    },
    {
      id: "evidence",
      label: "Featured cards",
      icon: Sparkles,
      content: (
        <SealedFeaturedCardsSection
          product={modalProduct}
          loading={detailsLoading}
          openingCardId={openingFeaturedCardId}
          onOpenCard={(cardId) => void openFeaturedCard(cardId)}
        />
      ),
    },
  ];

  return (
    <>
      <div
        data-sealed-modal-root
        data-card-detail-overlay
        className="dc-modal-overlay dc-sidebar-offset-overlay fixed inset-0 z-[200] flex items-start justify-center overflow-hidden px-0 py-0 sm:px-3 sm:py-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:block md:overflow-y-auto md:p-0"
        style={{ overscrollBehaviorX: "auto", overscrollBehaviorY: "contain" }}
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
            aria-label={modalProduct.name}
            tabIndex={-1}
            className="card-modal-frame dc-modal-panel relative h-dvh max-h-dvh w-full max-w-full overflow-hidden rounded-none border border-white/12 [scrollbar-gutter:stable] shadow-none outline-none sm:overflow-y-auto md:h-auto md:min-h-dvh md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:shadow-none"
            data-modal-size={displaySettings.modalSize}
            data-mobile-showcase="true"
          >
            <CardDetailShell
              mode="standard"
              detailSize={displaySettings.modalSize}
              className="sealed-detail-experience"
              navigation={{ label: "Back to Collection", onBack: onClose }}
              eyebrow="Sealed product"
              title={modalProduct.name}
              subtitle={
                <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {modalProduct.episode ? (
                    <Link
                      href={`${getExpansionHref(modalProduct.episode.id)}?tab=sealed`}
                      prefetch={false}
                      onClick={onClose}
                      className="min-w-0 truncate text-[inherit] transition-colors hover:text-[var(--dc-primary)] hover:underline underline-offset-2"
                    >
                      {modalProduct.episode.name}
                    </Link>
                  ) : null}
                  {modalProduct.episode?.code ? (
                    <>
                      <span>·</span>
                      <span>{modalProduct.episode.code}</span>
                    </>
                  ) : null}
                  {releaseDate ? (
                    <>
                      <span>·</span>
                      <span>{releaseDate}</span>
                    </>
                  ) : null}
                </span>
              }
              badges={
                <>
                  <span className="rounded-full border border-fuchsia-300/18 bg-fuchsia-400/[0.075] px-2.5 py-1 text-[11px] font-bold text-fuchsia-100/78">
                    Sealed
                  </span>
                  {collectionQuantity > 0 ? (
                    <span className="rounded-full border border-emerald-300/18 bg-emerald-400/[0.075] px-2.5 py-1 text-[11px] font-bold text-emerald-100/78">
                      Owned x{collectionQuantity}
                    </span>
                  ) : null}
                </>
              }
              status={
                actionError ? (
                  <span className="text-sm font-semibold text-rose-200/78">
                    {actionError}
                  </span>
                ) : null
              }
              priceLabel={
                activeSealedHistorySeries === "cm_market"
                  ? "CardMarket price"
                  : `${activeSealedHistorySeriesLabel} price`
              }
              price={formatCurrency(activeSealedCurrentValue, "EUR")}
              priceMeta={
                trend30d == null ? (
                  priceFetchedAtLabel
                    ? `Updated ${priceFetchedAtLabel}`
                    : "Latest saved market value"
                ) : (
                  <span className={trend30d >= 0 ? "text-emerald-200/78" : "text-rose-200/78"}>
                    {trend30d > 0 ? "+" : ""}
                    {trend30d.toFixed(1)}% vs 30-day average
                  </span>
                )
              }
              kpis={[
                {
                  label: "7-day average",
                  value: formatCurrency(modalProduct.price.cm_avg_7d, "EUR"),
                  hint: "CardMarket saved average",
                  targetTab: "market",
                },
                {
                  label: "30-day average",
                  value: formatCurrency(modalProduct.price.cm_avg_30d, "EUR"),
                  hint: "Longer market baseline",
                  targetTab: "market",
                },
                {
                  label: "Collection",
                  value: collectionQuantity > 0 ? `Owned x${collectionQuantity}` : "Not owned",
                  hint:
                    collectionPnl == null
                      ? "Add purchase data to track P/L"
                      : `${formatSignedCurrency(collectionPnl)} market change`,
                  tone:
                    collectionPnl == null
                      ? "neutral"
                      : collectionPnl >= 0
                        ? "positive"
                        : "warning",
                  targetTab: "collection",
                },
                {
                  label: "Total value",
                  value: formatCurrency(collectionCurrentTotal, "EUR"),
                  hint:
                    collectionQuantity > 0
                      ? `${collectionQuantity} saved item${collectionQuantity === 1 ? "" : "s"}`
                      : "No saved position",
                  targetTab: "collection",
                },
                {
                  label: "Release",
                  value: releaseDate ?? "--",
                  hint:
                    modalProduct.release_date_source ??
                    (modalProduct.release_date ? "Product release" : "Set release"),
                },
                {
                  label: "Featured cards",
                  value: modalProduct.featured_cards.length || "Building",
                  hint: "Top cards from the linked set",
                  tone: "violet",
                  targetTab: "evidence",
                },
              ]}
              media={
                <SealedModalPreview
                  product={modalProduct}
                  mediaWidth="100%"
                  imageSize={layout.imageSize}
                  imagePadding={layout.imagePadding}
                />
              }
              mediaActions={
                <div className="card-detail-market-links">
                  {cardMarketUrl ? (
                    <a
                      href={cardMarketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-detail-market-link"
                    >
                      CardMarket <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  <a
                    href={ebayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-detail-market-link"
                  >
                    eBay Deals <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              }
              chart={
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
                  showPricingMetrics={false}
                />
              }
              heroSupplement={
                modalProduct.featured_cards.length > 0 || detailsLoading ? (
                  <SealedFeaturedCardsSection
                    product={modalProduct}
                    loading={detailsLoading}
                    openingCardId={openingFeaturedCardId}
                    onOpenCard={(cardId) => void openFeaturedCard(cardId)}
                    compact
                  />
                ) : null
              }
              actions={
                <SealedDetailActionGroup
                  product={modalProduct}
                  cardMarketUrl={cardMarketUrl}
                  ebayUrl={ebayUrl}
                  isBusy={isBusy}
                  refreshing={refreshing}
                  syncingHistory={syncingHistory}
                  removingCollectionItem={removingCollectionItem}
                  canManageSealedPrices={canManageSealedPrices}
                  onRefresh={() => void runSealedAction("refresh")}
                  onSyncHistory={() => void runSealedAction("sync-history")}
                  onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
                  onCollectionChanged={refreshModalProductFromServer}
                />
              }
              actionsAriaLabel="Sealed product actions"
              tabs={tabs}
              sectionsAriaLabel="Sealed product detail sections"
              mobileChartTabs={["market"]}
              mobileChartAlwaysVisible
            />
          </div>
        </div>
      </div>

      {selectedFeaturedCard ? (
        <CardModal
          card={selectedFeaturedCard}
          backLabel="Back to Sealed Product"
          onClose={() => setSelectedFeaturedCard(null)}
        />
      ) : null}
    </>
  );
}
