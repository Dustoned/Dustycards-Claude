"use client";

import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { useSettings, type ModalSize } from "@/components/SettingsProvider";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { withCardMarketFilters } from "@/lib/cardmarket";
import type { SealedPriceHistoryPoint } from "@/lib/price-history";

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

interface Props {
  product: SealedModalProductData;
  onClose: () => void;
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

function getPrimaryCardMarketPrice(price: SealedPriceData): number | null {
  return (
    price.cm_lowest ??
    price.cm_lowest_eu ??
    price.cm_lowest_de ??
    price.cm_lowest_fr ??
    price.cm_lowest_es ??
    price.cm_lowest_it ??
    null
  );
}

export default function SealedProductModal({ product, onClose }: Props) {
  const { settings } = useSettings();
  const [priceHistory, setPriceHistory] = useState<SealedPriceHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
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
  const pad =
    ms === "small"
      ? wide
        ? "p-7"
        : "p-6"
      : ms === "large"
        ? wide
          ? "p-9 sm:p-10"
          : "p-8 sm:p-9"
        : wide
          ? "p-8 sm:p-9"
          : "p-7";
  const gap =
    ms === "small" ? (wide ? "gap-4" : "gap-5") : ms === "large" ? (wide ? "gap-5" : "gap-8") : wide ? "gap-4" : "gap-7";
  const contentWidthCls =
    ms === "small" ? "sm:w-[31rem]" : ms === "large" ? "sm:w-[35rem]" : "sm:w-[33rem]";
  const layoutCls = wide
    ? "flex flex-col sm:grid sm:grid-cols-[auto_auto] sm:items-start"
    : "flex flex-col sm:flex-row sm:items-start";
  const mediaColCls = wide
    ? `shrink-0 ${imgW} mx-auto sm:mx-0 sm:self-start`
    : `shrink-0 ${imgW} mx-auto sm:mx-0`;
  const contentCls = wide
    ? `w-full min-w-0 flex flex-col gap-4 ${contentWidthCls}`
    : "flex-1 min-w-0 flex flex-col gap-4";
  const titleCls = ms === "small" ? "text-2xl" : ms === "large" ? "text-4xl" : "text-3xl";
  const metricCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";
  const primaryPrice = getPrimaryCardMarketPrice(product.price);
  const cardMarketUrl = product.cardmarket_url ? withCardMarketFilters(product.cardmarket_url) : null;
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

  useEffect(() => {
    const controller = new AbortController();

    async function loadPriceHistory() {
      setHistoryLoading(true);
      setPriceHistory([]);

      try {
        const response = await fetch(`/api/sealed/${encodeURIComponent(product.id)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load sealed history for ${product.id}`);
        }

        const data = (await response.json()) as {
          price_history?: SealedPriceHistoryPoint[];
        };
        setPriceHistory(Array.isArray(data.price_history) ? data.price_history : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPriceHistory([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      }
    }

    void loadPriceHistory();

    return () => controller.abort();
  }, [product.id]);

  return (
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
            <div
              className={`relative ${imgW} aspect-square overflow-hidden rounded-2xl bg-white/[0.05] shadow-2xl shadow-black/50`}
            >
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-contain p-3"
                  sizes={imgSize}
                  loading="eager"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="h-12 w-12 text-white/28" />
                </div>
              )}
            </div>
          </div>

          <div className={contentCls}>
            <div>
              <h2 className={`${titleCls} font-bold text-white leading-tight`}>{product.name}</h2>
              {product.episode && (
                <div className="mt-2">
                  <Link
                    href={`/expansions/${product.episode.id}?tab=sealed`}
                    onClick={onClose}
                    className="text-sm text-white/50 hover:text-white/80 transition-colors underline-offset-2 hover:underline"
                  >
                    {product.episode.name}
                    {product.episode.code && (
                      <span className="ml-1 opacity-60">({product.episode.code})</span>
                    )}
                  </Link>
                </div>
              )}
            </div>

            <div className={`grid grid-cols-2 gap-2.5 ${metricCls}`}>
              {[
                { label: "CardMarket", value: primaryPrice },
                { label: "7d avg", value: product.price.cm_avg_7d },
                { label: "30d avg", value: product.price.cm_avg_30d },
              ]
                .filter((row) => row.value != null)
                .map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <span className="text-white/50">{row.label}</span>
                    <span className="font-bold text-white tabular-nums">
                      {formatCurrency(row.value)}
                    </span>
                  </div>
                ))}
            </div>

            <PriceHistoryPanel
              title="CardMarket History"
              currency="EUR"
              points={chartPoints}
              currentValue={primaryPrice}
              tone="dark"
              compact
              loading={historyLoading && priceHistory.length === 0}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <CollectionAddSealedButton
            product={{
              id: product.id,
              name: product.name,
              image_url: product.image_url,
              episode: product.episode,
            }}
            mode="button"
            theme="dark"
            label="Add to DustyCards"
            className="flex-1 rounded-2xl"
          />
          {cardMarketUrl && (
            <a
              href={cardMarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Open CardMarket
            </a>
          )}
          {product.tcggo_url && (
            <a
              href={product.tcggo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl px-4 py-3 font-semibold text-white/70 transition-colors hover:text-white"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              Open TCGGO
            </a>
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
  );
}
