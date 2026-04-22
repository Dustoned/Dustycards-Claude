"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LineChart, Package, RefreshCw } from "lucide-react";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { useSettings, type ModalSize } from "@/components/SettingsProvider";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { buildCardMarketProductUrl, withCardMarketFilters } from "@/lib/cardmarket";
import type { SealedPriceHistoryPoint } from "@/lib/price-history";
import { getSealedProductPrice } from "@/lib/sealed-products";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

interface SealedEpisodeRef {
  id: string;
  name: string;
  code: string | null;
}

interface SealedPriceData {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export interface SealedModalProductData {
  id: string;
  name: string;
  image_url: string | null;
  tcggo_url?: string | null;
  cardmarket_url: string | null;
  price: SealedPriceData;
  episode?: SealedEpisodeRef | null;
}

interface SealedDetailResponse extends SealedModalProductData {
  cardmarket_id: string | null;
  price_fetched_at: string | null;
  history_synced_at: string | null;
  price_history: SealedPriceHistoryPoint[];
}

interface SealedActionResponse extends Partial<SealedDetailResponse> {
  error?: string;
  activeType?: string;
  resetAt?: string | null;
  cancelled?: boolean;
}

interface Props {
  product: SealedModalProductData;
  onClose: () => void;
}

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
  accent?: "emerald" | "amber" | "blue" | "slate";
  className?: string;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildInitialSealedDetail(product: SealedModalProductData): SealedDetailResponse {
  return {
    ...product,
    tcggo_url: product.tcggo_url ?? null,
    cardmarket_id: null,
    price_fetched_at: null,
    history_synced_at: null,
    price_history: [],
  };
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
      : accent === "amber"
        ? "border-amber-400/16 bg-amber-400/[0.08]"
        : accent === "blue"
          ? "border-blue-400/16 bg-blue-400/[0.08]"
          : "border-white/10 bg-black/22";

  return (
    <div className={`rounded-2xl border px-3 py-3 ${accentClass} ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/42">{hint}</p>}
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

  const ms: ModalSize = settings.modalSize;
  const wide = settings.widescreen;
  const mediaWidth =
    ms === "small"
      ? wide
        ? "w-[13.5rem] sm:w-[14.5rem] xl:w-[15.5rem]"
        : "w-36 sm:w-44 xl:w-48"
      : ms === "large"
        ? wide
          ? "w-[22rem] sm:w-[25rem] xl:w-[28rem]"
          : "w-72 sm:w-80 xl:w-[22rem]"
        : wide
          ? "w-[16.5rem] sm:w-[18rem] xl:w-[20rem]"
          : "w-48 sm:w-56 xl:w-[17rem]";
  const imageSize =
    ms === "small"
      ? wide
        ? "248px"
        : "176px"
      : ms === "large"
        ? wide
          ? "520px"
          : "416px"
        : wide
          ? "328px"
          : "256px";
  const maxW =
    ms === "small"
      ? wide
        ? "max-w-[56rem]"
        : "max-w-[48rem]"
      : ms === "large"
        ? wide
          ? "max-w-[98rem]"
          : "max-w-[84rem]"
        : wide
          ? "max-w-[72rem]"
          : "max-w-[62rem]";
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
        ? "text-[2.4rem] sm:text-[2.8rem] xl:text-[3.05rem]"
        : "text-[1.85rem] sm:text-[2.05rem]";
  const metaCls =
    ms === "small"
      ? "text-[13px]"
      : ms === "large"
        ? "text-base sm:text-[17px]"
        : "text-sm sm:text-[14px]";
  const imagePadding =
    ms === "small" ? "p-2.5" : ms === "large" ? "p-5 sm:p-6" : "p-3 sm:p-4";
  const footerPad =
    ms === "small"
      ? "px-3 pb-3 sm:px-4 sm:pb-4"
      : ms === "large"
        ? "px-6 pb-6 sm:px-7 sm:pb-7 xl:px-8 xl:pb-8"
        : "px-4 pb-4 sm:px-5 sm:pb-5";

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
  const primaryMetrics = [
    {
      label: "Current",
      value: formatCurrency(primaryPrice),
      hint: priceFetchedAtLabel ? `Updated ${priceFetchedAtLabel}` : null,
      accent: "emerald" as const,
    },
    {
      label: "7D Avg",
      value: formatCurrency(modalProduct.price.cm_avg_7d),
      accent: "slate" as const,
    },
    {
      label: "30D Avg",
      value: formatCurrency(modalProduct.price.cm_avg_30d),
      accent: "slate" as const,
    },
  ];
  const regionalMetrics = [
    {
      label: "EU Only",
      value: formatCurrency(modalProduct.price.cm_lowest_eu),
      accent: "amber" as const,
    },
    {
      label: "DE",
      value: formatCurrency(modalProduct.price.cm_lowest_de),
      accent: "slate" as const,
    },
    {
      label: "FR",
      value: formatCurrency(modalProduct.price.cm_lowest_fr),
      accent: "slate" as const,
    },
    {
      label: "ES",
      value: formatCurrency(modalProduct.price.cm_lowest_es),
      accent: "slate" as const,
    },
    {
      label: "IT",
      value: formatCurrency(modalProduct.price.cm_lowest_it),
      accent: "slate" as const,
    },
  ].filter((metric) => metric.value !== "--");

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
        className={`${maxW} glass max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain rounded-[32px] shadow-[0_32px_90px_rgba(0,0,0,0.52)]`}
        style={{
          background: "rgba(10,10,12,0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={pad}>
          <div className={`grid ${gridGap} lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start`}>
            <aside className={`mx-auto flex w-full max-w-full flex-col gap-4 lg:mx-0 ${mediaWidth}`}>
              <div className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                {modalProduct.image_url ? (
                  <Image
                    src={modalProduct.image_url}
                    alt={modalProduct.name}
                    fill
                    className={`object-contain ${imagePadding}`}
                    sizes={imageSize}
                    loading="eager"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-12 w-12 text-white/28" />
                  </div>
                )}
              </div>

              <SectionShell
                eyebrow="Product details"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <MetaPill className="text-blue-200">Sealed product</MetaPill>
                  <MetaPill>{priceHistory.length} history points</MetaPill>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-black/22 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                      Set
                    </p>
                    <div className="mt-2 text-sm font-medium text-white/84">
                      {modalProduct.episode ? (
                        <Link
                          href={`/expansions/${modalProduct.episode.id}?tab=sealed`}
                          onClick={onClose}
                          className="transition-colors hover:text-white"
                        >
                          {modalProduct.episode.name}
                          {modalProduct.episode.code ? ` (${modalProduct.episode.code})` : ""}
                        </Link>
                      ) : (
                        "--"
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-black/22 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                      Last refresh
                    </p>
                    <p className="mt-2 text-sm font-medium text-white/84">
                      {priceFetchedAtLabel ?? "Not refreshed yet"}
                    </p>
                  </div>
                </div>
              </SectionShell>
            </aside>

            <div className="min-w-0 space-y-4">
              <SectionShell className="overflow-hidden">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <h2 className={`${titleCls} leading-[0.98] font-bold text-white`}>
                      {modalProduct.name}
                    </h2>

                    <div className={`mt-3 flex flex-wrap items-center gap-2.5 text-white/54 ${metaCls}`}>
                      <span>Sealed product</span>
                      {priceHistory.length > 0 && <span>{priceHistory.length} history points</span>}
                    </div>

                    {modalProduct.episode && (
                      <div className="mt-3">
                        <Link
                          href={`/expansions/${modalProduct.episode.id}?tab=sealed`}
                          onClick={onClose}
                          className="text-sm text-white/58 transition-colors hover:text-white/82 hover:underline underline-offset-2"
                        >
                          {modalProduct.episode.name}
                          {modalProduct.episode.code && (
                            <span className="ml-1 opacity-60">({modalProduct.episode.code})</span>
                          )}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void runSealedAction("sync-history")}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LineChart className={`h-4 w-4 ${syncingHistory ? "animate-pulse" : ""}`} />
                      {syncingHistory ? "Syncing..." : "Sync History"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runSealedAction("refresh")}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>

                {actionError && <p className="mt-4 text-sm text-rose-300">{actionError}</p>}
              </SectionShell>

              <SectionShell
                eyebrow="Market snapshot"
                title="Current pricing"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                        CardMarket
                      </p>
                      <p className="mt-1 text-sm text-white/44">Current market plus rolling averages</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {primaryMetrics.map((metric) => (
                        <MetricTile
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          hint={metric.hint ?? null}
                          accent={metric.accent}
                        />
                      ))}
                    </div>
                  </div>

                  {regionalMetrics.length > 0 && (
                    <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
                          Regional offers
                        </p>
                        <p className="mt-1 text-sm text-white/44">Alternative CardMarket regions</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {regionalMetrics.map((metric) => (
                          <MetricTile
                            key={metric.label}
                            label={metric.label}
                            value={metric.value}
                            accent={metric.accent}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Price history"
                title="History chart"
              >
                <PriceHistoryPanel
                  title="CardMarket History"
                  currency="EUR"
                  points={chartPoints}
                  currentValue={primaryPrice}
                  tone="dark"
                  loading={detailsLoading && priceHistory.length === 0}
                  emptyText="Nog geen sealed prijshistorie"
                />
              </SectionShell>
            </div>
          </div>
        </div>

        <div className={`grid gap-3 ${footerPad} sm:grid-cols-2 xl:grid-cols-3`}>
          <CollectionAddSealedButton
            product={{
              id: modalProduct.id,
              name: modalProduct.name,
              image_url: modalProduct.image_url,
              episode: modalProduct.episode,
            }}
            mode="button"
            theme="dark"
            label="Add to DustyCards"
            className="rounded-2xl"
          />

          {cardMarketUrl && (
            <a
              href={cardMarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Open CardMarket
            </a>
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
  );
}
