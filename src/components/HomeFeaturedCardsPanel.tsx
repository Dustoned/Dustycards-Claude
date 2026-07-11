"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { CardLoadingOverlay } from "@/components/CardLoadingOverlay";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import {
  collectionTileInfoClass,
  collectionTileMetaLineClass,
  collectionTileNoPriceClass,
  collectionTilePriceClass,
  collectionTilePriceRowClass,
  collectionTileTitleClass,
  collectionTileTrendClass,
  collectionTileTrendIconClass,
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
import {
  getCardGridColumnCount,
  getCardGridImageSizes,
  getCardGridTemplateColumns,
  getCardGridTrackWidth,
} from "@/lib/display-scale";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CollectionCardViewItem } from "@/types/collection-view";

const DEFAULT_DESKTOP_FEATURED_COLUMNS = 8;
const MAX_FEATURED_CARDS = 24;
const MOBILE_FEATURED_ROWS = 2;

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
  item: CollectionCardViewItem,
  readOnlyCollectionItems: boolean
): ModalCardData {
  const shouldAttachCollectionItem =
    item.owned && (Boolean(item.collection_item_id) || readOnlyCollectionItems);

  return {
    ...data,
    collection_item:
      shouldAttachCollectionItem
        ? {
            id: item.collection_item_id ?? `readonly-${item.card_id}`,
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
            read_only: readOnlyCollectionItems,
          }
        : data.collection_item,
  };
}

function FeaturedCardTile({
  item,
  opening,
  onOpen,
  imageSizes,
}: {
  item: CollectionCardViewItem;
  opening: boolean;
  onOpen: (item: CollectionCardViewItem) => void;
  imageSizes: string;
}) {
  const { settings, displaySettings } = useSettings();
  const gradingCompanyLabel = normalizeGradingCompanyLabel(item.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(item.grading_grade);
  const isGradedCard = Boolean(item.owned && gradingCompanyLabel && gradingGradeLabel);
  const previewAspectClass = RAW_CARD_ASPECT_CLASS;
  const imageClass = getCardImageClassName(
    item.image_url,
    isGradedCard ? "object-contain" : "rounded-[4.75%] object-fill"
  );
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
              : getCardImageFrameClassName(
                  item.image_url,
                  "overflow-hidden rounded-[4.75%] bg-transparent drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)]"
                )
          }`}
      >
        {isGradedCard && gradingCompanyLabel && gradingGradeLabel ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`relative h-full w-[82.8%] ${GRADED_SLAB_ASPECT_CLASS}`}>
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
                sizes={imageSizes}
              />
            </div>
          </div>
        ) : item.image_url ? (
          <Image
            src={getCachedImageUrl(item.image_url) ?? item.image_url}
            alt={item.name}
            fill
            className={imageClass}
            sizes={imageSizes}
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

          <div className={collectionTilePriceRowClass(cardSize)}>
            {displayPrice != null ? (
              <span className={collectionTilePriceClass(cardSize)}>
                {formatMarketCurrency(displayPrice, displayPriceCurrency)}
              </span>
            ) : (
              <span className={collectionTileNoPriceClass(cardSize)}>No price</span>
            )}
            {trendPercent != null ? (
              <span
                className={collectionTileTrendClass(
                  cardSize,
                  trendPercent >= 0
                )}
                title={`P&L ${trendPercent >= 0 ? "+" : ""}${trendPercent}%`}
              >
                {trendPercent >= 0 ? (
                  <TrendingUp className={collectionTileTrendIconClass(cardSize)} />
                ) : (
                  <TrendingDown className={collectionTileTrendIconClass(cardSize)} />
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
  desktopRows = 1,
  mobileRows = MOBILE_FEATURED_ROWS,
  readOnlyCollectionItems = false,
}: {
  cards: CollectionCardViewItem[];
  viewAllHref: string;
  desktopRows?: number;
  mobileRows?: number;
  readOnlyCollectionItems?: boolean;
}) {
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [openingItemKey, setOpeningItemKey] = useState<string | null>(null);
  const [desktopColumnCount, setDesktopColumnCount] = useState(DEFAULT_DESKTOP_FEATURED_COLUMNS);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const { displaySettings, isMobileViewport } = useSettings();
  const imageSizes = getCardGridImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const gridTemplateColumns = getCardGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const gridGapClass = isMobileViewport
    ? displaySettings.cardSize === "xsmall"
      ? "gap-x-1.5 gap-y-2"
      : displaySettings.cardSize === "large"
        ? "gap-x-0 gap-y-3"
        : displaySettings.cardSize === "medium"
          ? "gap-x-2 gap-y-2.5"
          : "gap-x-1.5 gap-y-2"
    : "gap-2.5";
  const visibleCards = useMemo(() => {
    const visibleCount = isMobileViewport
      ? getCardGridColumnCount(displaySettings.cardSize, true) * Math.max(1, mobileRows)
      : desktopColumnCount * Math.max(1, desktopRows);

    return cards.slice(0, Math.min(cards.length, visibleCount, MAX_FEATURED_CARDS));
  }, [cards, desktopColumnCount, desktopRows, displaySettings.cardSize, isMobileViewport, mobileRows]);

  useEffect(() => {
    if (isMobileViewport) return;

    const element = gridRef.current;
    if (!element) return;
    const gridElement = element;

    function updateDesktopColumnCount() {
      const styles = window.getComputedStyle(gridElement);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const trackWidth =
        Number.parseFloat(getCardGridTrackWidth(displaySettings.cardSize, displaySettings.widescreen)) || 1;
      const nextCount = Math.max(
        1,
        Math.floor((gridElement.clientWidth + gap) / (trackWidth + gap))
      );

      setDesktopColumnCount(Math.min(MAX_FEATURED_CARDS, nextCount));
    }

    updateDesktopColumnCount();

    const observer = new ResizeObserver(updateDesktopColumnCount);
    observer.observe(gridElement);

    return () => observer.disconnect();
  }, [displaySettings.cardSize, displaySettings.widescreen, isMobileViewport]);

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
      setSelectedCard(mergeCollectionItem(data, item, readOnlyCollectionItems));
    } finally {
      setOpeningItemKey(null);
    }
  }

  if (cards.length === 0) return null;

  return (
    <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[length:var(--ui-section-header-title-size)] font-bold tracking-tight text-white">
          Featured Cards
        </h2>
        <Link
          href={viewAllHref}
          prefetch={false}
          className="shrink-0 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          View all
        </Link>
      </div>
      <div
        ref={gridRef}
        className={`grid ${gridGapClass}`}
        style={{
          gridTemplateColumns,
          justifyContent: "stretch",
        }}
      >
        {visibleCards.map((item) => {
          const key = getOpeningItemKey(item);
          return (
            <FeaturedCardTile
              key={`${key}-${item.card_id}`}
              item={item}
              opening={openingItemKey === key}
              onOpen={(target) => void openCard(target)}
              imageSizes={imageSizes}
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
