"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { CardLoadingOverlay } from "@/components/CardLoadingOverlay";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import {
  collectionTileInfoClass,
  collectionTileMetaLineClass,
  collectionTileNoPriceClass,
  collectionTilePriceClass,
  collectionTileTitleClass,
  formatMarketCurrency,
  getCollectionItemCostBasis,
  getCollectionItemPrice,
  getCollectionItemPriceCurrency,
} from "@/components/collection-cards-view-helpers";
import {
  GRADED_SLAB_ASPECT_CLASS,
  RAW_CARD_ASPECT_CLASS,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CollectionCardViewItem } from "@/types/collection-view";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

const GradedSlabPreview = dynamic(() => import("@/components/GradedSlabPreview"), {
  ssr: false,
  loading: () => null,
});

function getTileTrendPercent(
  currentValue: number | null | undefined,
  costBasis: number | null
): number | null {
  if (currentValue == null || costBasis == null || costBasis <= 0) return null;
  return Number((((currentValue - costBasis) / costBasis) * 100).toFixed(1));
}

function getOpeningItemKey(item: CollectionCardViewItem): string {
  return item.collection_item_id ?? item.want_item_id ?? item.card_id;
}

function mergeCollectionItem(
  data: ModalCardData,
  item: CollectionCardViewItem
): ModalCardData {
  return {
    ...data,
    collection_item:
      item.owned && item.collection_item_id
        ? {
            id: item.collection_item_id,
            binder_id: item.binder_id ?? null,
            binder_name: item.binder_name ?? null,
            binder_type: item.binder_type ?? null,
            purchase_price: item.purchase_price,
            cost_basis_value: item.cost_basis_value,
            cost_basis_label: item.cost_basis_label,
            cost_basis_source: item.cost_basis_source,
            condition: item.condition,
            language: item.language ?? null,
            notes: item.notes ?? null,
            tags: item.tags ?? [],
            grading_company: item.grading_company,
            grading_grade: item.grading_grade,
            grading_subgrades: item.grading_subgrades ?? null,
          }
        : data.collection_item,
  };
}

function FeaturedCardTile({
  item,
  opening,
  onOpen,
}: {
  item: CollectionCardViewItem;
  opening: boolean;
  onOpen: (item: CollectionCardViewItem) => void;
}) {
  const { settings, displaySettings } = useSettings();
  const gradingCompanyLabel = normalizeGradingCompanyLabel(item.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(item.grading_grade);
  const isGradedCard = Boolean(item.owned && gradingCompanyLabel && gradingGradeLabel);
  const previewAspectClass = isGradedCard ? GRADED_SLAB_ASPECT_CLASS : RAW_CARD_ASPECT_CLASS;
  const imageClass = isGradedCard ? "object-contain" : "rounded-[4.75%] object-fill";
  const displayPrice = getCollectionItemPrice(item, settings.primaryPriceSource);
  const displayPriceCurrency = getCollectionItemPriceCurrency(
    item,
    settings.primaryPriceSource
  );
  const trendPercent = getTileTrendPercent(item.current_value, getCollectionItemCostBasis(item));
  const cardSize = displaySettings.cardSize;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open ${item.name} details`}
      className="relative flex h-full min-w-0 cursor-pointer flex-col rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-white/14 focus-visible:border-violet-300/50 focus-visible:ring-2 focus-visible:ring-violet-400/35 max-[640px]:rounded-[13px] max-[640px]:p-1"
      style={{ contain: "layout paint style" }}
    >
      <div
        className={`relative ${previewAspectClass} w-full transition-all duration-200 ${
          isGradedCard
            ? "overflow-hidden rounded-xl border border-transparent shadow-md shadow-black/20"
            : "overflow-hidden rounded-[4.75%] bg-[#dedbd1] drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-2 after:ring-inset after:ring-black/8 dark:bg-[#d8d5cc] dark:after:ring-white/12"
        }`}
      >
        {isGradedCard && gradingCompanyLabel && gradingGradeLabel ? (
          <GradedSlabPreview
            company={gradingCompanyLabel}
            grade={gradingGradeLabel}
            name={item.name}
            episodeName={item.episode_name}
            episodeCode={item.episode_code}
            episodeSeries={item.episode_series}
            episodeReleaseDate={item.episode_release_date}
            cardNumber={item.card_number}
            bgsSubgrades={item.grading_subgrades ?? null}
            imageUrl={item.image_url}
            alt={item.name}
            className="absolute inset-0"
            imageClassName={imageClass}
            tileSize={cardSize}
            sizes="(max-width: 480px) 45vw, (max-width: 1024px) 25vw, 10rem"
          />
        ) : item.image_url ? (
          <Image
            src={getCachedImageUrl(item.image_url) ?? item.image_url}
            alt={item.name}
            fill
            className={imageClass}
            sizes="(max-width: 480px) 45vw, (max-width: 1024px) 25vw, 10rem"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black/6 text-xs text-gray-300 dark:bg-white/6">
            {item.name.slice(0, 2)}
          </div>
        )}

        {opening ? <CardLoadingOverlay /> : null}
      </div>

      <div className={collectionTileInfoClass(cardSize)}>
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="min-w-0">
            <p className={collectionTileTitleClass(cardSize)}>{item.name}</p>
            <div className={collectionTileMetaLineClass(cardSize)}>
              <span className="shrink-0 text-white/42">
                {item.card_number ? `#${item.card_number}` : "--"}
              </span>
            </div>
          </div>

          <div className="mt-auto grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 pt-1">
            {displayPrice != null ? (
              <span className={collectionTilePriceClass(cardSize)}>
                {formatMarketCurrency(displayPrice, displayPriceCurrency)}
              </span>
            ) : (
              <span className={collectionTileNoPriceClass(cardSize)}>No price</span>
            )}
            {trendPercent != null ? (
              <span
                className={`inline-flex min-w-0 shrink-0 items-center justify-end gap-0.5 text-right text-[11px] font-bold tabular-nums max-[640px]:text-[9px] ${
                  trendPercent >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
                title={`P&L ${trendPercent >= 0 ? "+" : ""}${trendPercent}%`}
              >
                {trendPercent >= 0 ? (
                  <TrendingUp className="h-3 w-3 shrink-0 max-[640px]:h-2.5 max-[640px]:w-2.5" />
                ) : (
                  <TrendingDown className="h-3 w-3 shrink-0 max-[640px]:h-2.5 max-[640px]:w-2.5" />
                )}
                <span className="truncate">
                  {trendPercent >= 0 ? "+" : ""}
                  {trendPercent}%
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function HomeFeaturedCardsPanel({
  cards,
  viewAllHref,
}: {
  cards: CollectionCardViewItem[];
  viewAllHref: string;
}) {
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [openingItemKey, setOpeningItemKey] = useState<string | null>(null);

  async function openCard(item: CollectionCardViewItem) {
    const openingKey = getOpeningItemKey(item);
    if (openingItemKey === openingKey) return;

    setOpeningItemKey(openingKey);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(item.card_id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: ModalCardData = await response.json();
      setSelectedCard(mergeCollectionItem(data, item));
    } finally {
      setOpeningItemKey(null);
    }
  }

  if (cards.length === 0) return null;

  return (
    <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-white">Featured Cards</h2>
        <Link
          href={viewAllHref}
          prefetch={false}
          className="shrink-0 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          View all
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {cards.map((item) => {
          const key = getOpeningItemKey(item);
          return (
            <FeaturedCardTile
              key={`${key}-${item.card_id}`}
              item={item}
              opening={openingItemKey === key}
              onOpen={(target) => void openCard(target)}
            />
          );
        })}
      </div>

      {selectedCard ? (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          showGradedSlabPreview
          onClose={() => setSelectedCard(null)}
        />
      ) : null}
    </section>
  );
}
