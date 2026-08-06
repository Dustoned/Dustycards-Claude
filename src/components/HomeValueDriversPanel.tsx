"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useCallback, useState } from "react";
import type { ModalCardData } from "@/components/card-modal/types";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { formatCollectionCurrency } from "@/lib/collection";
import type {
  CollectionValueDriverItem,
  CollectionValueDriversData,
} from "@/lib/collection-data";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});
const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return `${value > 0 ? "+" : ""}${formatCollectionCurrency(value)}`;
}

function getDriverDateDistanceDays(data: CollectionValueDriversData): number | null {
  if (!data.previousDate || !data.latestDate) return null;

  const previous = new Date(data.previousDate).getTime();
  const latest = new Date(data.latestDate).getTime();
  const days = Math.round((latest - previous) / (1000 * 60 * 60 * 24));

  return Number.isFinite(days) && days > 0 ? days : null;
}

function getDriverWindowLabel(data: CollectionValueDriversData): string {
  const days = getDriverDateDistanceDays(data);

  if (days == null) return "Weekly movement";
  if (days >= 5 && days <= 9) return "Last 7 days";
  return `Latest ${days} days`;
}

function getDriverRangeLabel(data: CollectionValueDriversData): string {
  if (data.previousLabel && data.latestLabel) {
    return `${data.previousLabel} - ${data.latestLabel}`;
  }

  return "Waiting for another snapshot";
}

function formatSignedPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;

  const absolute = Math.abs(value);
  const decimals = absolute >= 10 || absolute === 0 ? 0 : 1;
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function getDriverSourceLabel(item: CollectionValueDriverItem): string {
  if (item.currentSource === item.previousSource) {
    return item.currentSource;
  }

  return `${item.previousSource} -> ${item.currentSource}`;
}

function getDriverMetaLabel(item: CollectionValueDriverItem): string {
  const episode = item.episodeCode ? item.episodeCode : item.episodeName;
  const detail = item.detail || (item.cardNumber ? `#${item.cardNumber}` : null);
  const quantity = item.quantity > 1 ? `x${item.quantity}` : null;

  if (item.kind === "sealed") {
    return [`x${item.quantity}`, episode].filter(Boolean).join(" / ");
  }

  return [detail, episode, quantity].filter(Boolean).join(" / ");
}

function buildSealedProductData(item: CollectionValueDriverItem): SealedModalProductData {
  const perItemPrice = item.quantity > 0 ? item.currentValue / item.quantity : item.currentValue;

  return {
    id: item.productId ?? item.id,
    name: item.name,
    image_url: item.imageUrl,
    cardmarket_url: null,
    price: {
      cm_lowest: null,
      cm_lowest_eu: Number.isFinite(perItemPrice) ? perItemPrice : null,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    },
    episode: {
      id: item.episodeId,
      name: item.episodeName,
      code: item.episodeCode,
    },
  };
}

function HomeValueDriverRow({
  item,
  tone,
  loading,
  onOpenCard,
  onOpenSealed,
}: {
  item: CollectionValueDriverItem;
  tone: "gain" | "drop";
  loading: boolean;
  onOpenCard: (item: CollectionValueDriverItem) => void;
  onOpenSealed: (item: CollectionValueDriverItem) => void;
}) {
  const Icon = tone === "gain" ? ArrowUpRight : ArrowDownRight;
  const toneTextClass = tone === "gain" ? "text-emerald-300" : "text-rose-300";
  const toneSurfaceClass =
    tone === "gain"
      ? "border-emerald-400/14 bg-emerald-400/[0.07]"
      : "border-rose-400/14 bg-rose-400/[0.07]";
  const percent = formatSignedPercent(item.changePct);
  const meta = getDriverMetaLabel(item);
  const className =
    "group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-white/7 py-2 text-left first:border-t-0";
  const content = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${toneSurfaceClass} ${toneTextClass}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black leading-tight text-white/88 transition-colors group-hover:text-white">
          {item.name}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-semibold leading-4 text-white/42">
          {meta ? <span className="min-w-0 truncate">{meta}</span> : null}
          <span className="shrink-0 text-white/28">/</span>
          <span className="shrink-0">{getDriverSourceLabel(item)}</span>
        </span>
      </span>
      <span className="min-w-[5.5rem] shrink-0 text-right">
        <span className={`block text-[13px] font-black leading-tight tabular-nums ${toneTextClass}`}>
          {formatSignedCurrency(item.change)}
        </span>
        {percent ? (
          <span className="mt-0.5 block text-[10.5px] font-bold tabular-nums text-white/42">
            {percent}
          </span>
        ) : null}
      </span>
    </>
  );

  if (item.kind === "card" && item.cardId) {
    return (
      <button
        type="button"
        data-home-value-driver-row
        data-driver-kind="card"
        onClick={() => onOpenCard(item)}
        aria-busy={loading}
        className={`${className} w-full transition-colors aria-busy:opacity-60`}
      >
        {content}
      </button>
    );
  }

  if (item.kind === "sealed" && item.productId) {
    return (
      <button
        type="button"
        data-home-value-driver-row
        data-driver-kind="sealed"
        onClick={() => onOpenSealed(item)}
        className={`${className} w-full transition-colors`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={item.href} prefetch={false} className={className}>
      {content}
    </Link>
  );
}

function HomeValueDriverLane({
  title,
  items,
  tone,
  emptyLabel,
  loadingCardId,
  onOpenCard,
  onOpenSealed,
}: {
  title: string;
  items: CollectionValueDriverItem[];
  tone: "gain" | "drop";
  emptyLabel: string;
  loadingCardId: string | null;
  onOpenCard: (item: CollectionValueDriverItem) => void;
  onOpenSealed: (item: CollectionValueDriverItem) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
          {title}
        </p>
        <span className="text-[10.5px] font-semibold text-white/34">
          {items.length.toLocaleString("en-US")}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="min-w-0">
          {items.map((item) => (
            <HomeValueDriverRow
              key={item.id}
              item={item}
              tone={tone}
              loading={item.cardId === loadingCardId}
              onOpenCard={onOpenCard}
              onOpenSealed={onOpenSealed}
            />
          ))}
        </div>
      ) : (
        <div className="border-t border-white/7 py-4 text-[12px] font-semibold text-white/34">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

export default function HomeValueDriversPanel({
  data,
  viewAllHref,
}: {
  data: CollectionValueDriversData;
  viewAllHref: string;
}) {
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const gains = data.gains.slice(0, 6);
  const drops = data.drops.slice(0, 6);
  const hasDrivers = gains.length > 0 || drops.length > 0;
  const netChange = data.totalChange ?? 0;
  const netToneClass = netChange >= 0 ? "text-emerald-300" : "text-rose-300";

  const openCard = useCallback(
    async (item: CollectionValueDriverItem) => {
      if (!item.cardId) return;

      const cached = cardDetailCache[item.cardId];
      if (cached) {
        setSelectedCard(cached);
        setDetailError(null);
        return;
      }

      setLoadingCardId(item.cardId);
      setDetailError(null);

      try {
        const response = await fetch(`/api/cards/${encodeURIComponent(item.cardId)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load card details");
        }

        const card = (await response.json()) as ModalCardData;
        setCardDetailCache((current) => ({ ...current, [item.cardId as string]: card }));
        setSelectedCard(card);
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "Could not load card details");
      } finally {
        setLoadingCardId((current) => (current === item.cardId ? null : current));
      }
    },
    [cardDetailCache]
  );
  const openSealed = useCallback((item: CollectionValueDriverItem) => {
    setSelectedSealed(buildSealedProductData(item));
  }, []);

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/34">
            {getDriverWindowLabel(data)}
          </p>
          <h2 className="mt-0.5 text-base font-black tracking-tight text-white">
            Collection Value Drivers
          </h2>
          <p className="mt-0.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-white/42">
            <span>{getDriverRangeLabel(data)}</span>
            {data.sourceBreakdown.length > 0 && (
              <span className="text-white/22" aria-hidden="true">
                /
              </span>
            )}
            {data.sourceBreakdown.length > 0 && (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-bold text-white/45">
                {data.sourceBreakdown.map((entry) => (
                  <span key={entry.source} className="inline-flex items-center gap-1">
                    {entry.source}
                    <span
                      className={`tabular-nums ${
                        entry.change >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                      }`}
                    >
                      {formatSignedCurrency(entry.change)}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center rounded-full border border-white/8 bg-black/18 px-2.5 text-[12px] font-black tabular-nums text-white">
            Net <span className={`ml-1.5 ${netToneClass}`}>{formatSignedCurrency(data.totalChange)}</span>
          </span>
          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex h-8 items-center rounded-full border border-white/8 bg-white/[0.045] px-2.5 text-[12px] font-bold text-violet-200 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white"
          >
            View all
          </Link>
        </div>
      </div>

      {detailError ? (
        <div className="mt-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3 py-2 text-xs font-medium text-rose-200">
          {detailError}
        </div>
      ) : null}

      {hasDrivers ? (
        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
          <HomeValueDriverLane
            title="Biggest gains"
            items={gains}
            tone="gain"
            emptyLabel="No gains in this window"
            loadingCardId={loadingCardId}
            onOpenCard={openCard}
            onOpenSealed={openSealed}
          />
          <HomeValueDriverLane
            title="Biggest drops"
            items={drops}
            tone="drop"
            emptyLabel="No drops in this window"
            loadingCardId={loadingCardId}
            onOpenCard={openCard}
            onOpenSealed={openSealed}
          />
        </div>
      ) : (
        <div className="mt-3 border-t border-white/7 py-4 text-[12px] font-semibold text-white/38">
          Not enough recent collection history yet.
        </div>
      )}

      {selectedCard ? (
        <CardModal
          key={`${selectedCard.id}:${selectedCard.price_fetched_at ?? "none"}`}
          card={selectedCard}
          backLabel="Back to Home"
          onClose={() => setSelectedCard(null)}
        />
      ) : null}

      {selectedSealed ? (
        <SealedProductModal
          key={selectedSealed.id}
          product={selectedSealed}
          onClose={() => setSelectedSealed(null)}
        />
      ) : null}
    </section>
  );
}
