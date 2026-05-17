"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import { textMatchesSearchQuery } from "@/lib/card-search";
import { formatCollectionCurrency } from "@/lib/collection";
import { getExpansionHref } from "@/lib/games";
import { getFixedTrackGridTemplate, getRichMoverTrackWidth } from "@/lib/display-scale";
import { getCachedImageUrl } from "@/lib/image-cache";
import type {
  CollectionValueDriverItem,
  CollectionValueDriversData,
} from "@/lib/collection-data";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

type DriverLaneKey = "gain" | "drop";
type ValueDriverScope = "collection" | "all";
type ValueDriverFilter = "all" | DriverLaneKey;

const INITIAL_VALUE_DRIVER_RENDER_COUNT = 24;
const VALUE_DRIVER_RENDER_BATCH_SIZE = 36;

function valueFilterButtonClass(active: boolean): string {
  return `inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors ${
    active
      ? "bg-gray-950 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-950"
      : "text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
  }`;
}

function signedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return `${value > 0 ? "+" : ""}${formatCollectionCurrency(value)}`;
}

function formatPercent(value: number | null): string | null {
  if (value == null) return null;

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function sourceLabel(item: CollectionValueDriverItem): string {
  if (item.currentSource === item.previousSource) {
    return item.currentSource;
  }

  return `${item.previousSource} -> ${item.currentSource}`;
}

function driverSearchText(item: CollectionValueDriverItem): string {
  return [
    item.name,
    item.detail,
    item.cardNumber,
    item.episodeName,
    item.episodeCode,
    sourceLabel(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesDriverQuery(item: CollectionValueDriverItem, query: string): boolean {
  return textMatchesSearchQuery(driverSearchText(item), query);
}

function episodeLabel(item: CollectionValueDriverItem): string {
  return item.episodeCode ? `${item.episodeName} (${item.episodeCode})` : item.episodeName;
}

function toneTextClass(tone: DriverLaneKey): string {
  return tone === "gain"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
}

function tonePanelClass(tone: DriverLaneKey): string {
  return tone === "gain"
    ? "border-emerald-400/16 bg-emerald-400/[0.08]"
    : "border-rose-400/16 bg-rose-400/[0.08]";
}

function DriverRow({
  item,
  loading,
  onOpenCard,
}: {
  item: CollectionValueDriverItem;
  loading: boolean;
  onOpenCard: (cardId: string) => void;
}) {
  const isGain = item.change >= 0;
  const tone = isGain ? "gain" : "drop";
  const Icon = isGain ? ArrowUpRight : ArrowDownRight;
  const percent = formatPercent(item.changePct);
  const imageUrl = getCachedImageUrl(item.imageUrl) ?? item.imageUrl;
  const imageFrameClass = item.kind === "card"
    ? "h-24 w-[4.4rem] bg-transparent drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]"
    : "h-24 w-[4.4rem] rounded-xl border border-black/8 bg-black/[0.04] dark:border-white/8 dark:bg-white/[0.05]";
  const cardClassName =
    "group relative flex h-full min-w-0 flex-col rounded-2xl border border-black/8 bg-white/72 p-3 text-left shadow-sm shadow-black/5 outline-none transition hover:-translate-y-0.5 hover:border-black/14 hover:bg-white/90 aria-busy:opacity-60 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06]";

  function openCardDetails() {
    if (!item.cardId) return;
    onOpenCard(item.cardId);
  }

  function handleCardClick() {
    openCardDetails();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openCardDetails();
  }

  function stopCardOpen(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  const content = (
    <div className="flex min-w-0 items-start gap-3">
      <div
        className={`relative shrink-0 overflow-hidden ${imageFrameClass}`}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.name}
            fill
            sizes="80px"
            className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-gray-400 dark:text-white/35">
            {item.kind === "sealed" ? "S" : "C"}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-base font-semibold leading-tight text-gray-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-200">
                {item.name}
              </p>
              {item.quantity > 1 ? (
                <span className="shrink-0 rounded-full border border-black/8 bg-black/[0.035] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/42">
                  x{item.quantity}
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs font-medium leading-4 text-gray-500 dark:text-white/46">
              {item.detail ? (
                <>
                  <span>{item.detail}</span>
                  <span className="mx-1 text-gray-400 dark:text-white/30">/</span>
                </>
              ) : null}
              {item.kind === "card" ? (
                <Link
                  href={getExpansionHref(item.episodeId)}
                  prefetch={false}
                  onClick={stopCardOpen}
                  className="underline decoration-black/20 underline-offset-2 hover:text-gray-900 dark:decoration-white/20 dark:hover:text-white"
                >
                  {episodeLabel(item)}
                </Link>
              ) : (
                <span>{episodeLabel(item)}</span>
              )}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tonePanelClass(
              tone
            )} ${toneTextClass(tone)}`}
          >
            {sourceLabel(item)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${tonePanelClass(tone)} ${toneTextClass(tone)}`}>
            {percent ?? "Latest"}
          </span>
          <span className="inline-flex rounded-full border border-black/8 bg-black/[0.035] px-2.5 py-1 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/42">
            Latest change
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <div className={`relative rounded-2xl border px-3 py-3 ${tonePanelClass(tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500/80 dark:text-white/42">
                  Change
                </p>
                <p
                  className={`mt-2 flex max-w-full items-center gap-1 whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl ${toneTextClass(
                    tone
                  )}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">{signedCurrency(item.change)}</span>
                </p>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-white/45">
              {formatCollectionCurrency(item.previousValue)}
              {" -> "}
              {formatCollectionCurrency(item.currentValue)}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <span className="min-w-0 rounded-xl border border-black/8 bg-black/[0.025] px-3 py-3 dark:border-white/8 dark:bg-white/[0.035]">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
                Before
              </span>
              <span className="mt-1 block break-words text-sm font-bold tabular-nums text-gray-700 dark:text-white/72">
                {formatCollectionCurrency(item.previousValue)}
              </span>
            </span>
            <span className="min-w-0 rounded-xl border border-black/8 bg-black/[0.025] px-3 py-3 dark:border-white/8 dark:bg-white/[0.035]">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
                Now
              </span>
              <span className="mt-1 block break-words text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                {formatCollectionCurrency(item.currentValue)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (item.kind === "card") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-busy={loading}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={`${cardClassName} cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400/55`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-busy={loading}
      className={`${cardClassName} focus-visible:ring-2 focus-visible:ring-emerald-400/55`}
    >
      {content}
    </Link>
  );
}

function DriverGrid({
  items,
  loadingCardId,
  onOpenCard,
  tileMinWidth,
}: {
  items: CollectionValueDriverItem[];
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
  tileMinWidth: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-black/[0.025] px-4 py-7 text-center text-xs font-medium text-gray-400 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/35">
        No value changes match this view
      </div>
    );
  }

  return (
    <div
      className="grid auto-rows-fr items-stretch gap-4"
      style={{
        gridTemplateColumns: getFixedTrackGridTemplate(tileMinWidth),
        justifyContent: "stretch",
      }}
    >
      {items.map((item) => (
        <DriverRow
          key={item.id}
          item={item}
          loading={item.cardId === loadingCardId}
          onOpenCard={onOpenCard}
        />
      ))}
    </div>
  );
}

export default function CollectionValueDrivers({
  data,
  activeItemScope = "collection",
}: {
  data: CollectionValueDriversData;
  activeItemScope?: ValueDriverScope;
}) {
  const { displaySettings } = useSettings();
  const [driverFilter, setDriverFilter] = useState<ValueDriverFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasDrivers = data.gains.length > 0 || data.drops.length > 0;
  const allDrivers = useMemo(
    () =>
      [...data.gains, ...data.drops].sort((a, b) => {
        const changeDiff = Math.abs(b.change) - Math.abs(a.change);
        if (changeDiff !== 0) return changeDiff;
        return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
      }),
    [data.drops, data.gains]
  );
  const filteredDrivers = useMemo(
    () =>
      allDrivers.filter((item) => {
        if (driverFilter === "gain" && item.change < 0) return false;
        if (driverFilter === "drop" && item.change >= 0) return false;
        return matchesDriverQuery(item, searchQuery);
      }),
    [allDrivers, driverFilter, searchQuery]
  );
  const visibleDriverCount = filteredDrivers.length;
  const shouldLazyRender = activeItemScope === "all";
  const renderKey = `${activeItemScope}:${data.previousDate ?? "none"}:${data.latestDate ?? "none"}:${driverFilter}:${searchQuery}:${data.gains.length}:${data.drops.length}`;
  const [renderState, setRenderState] = useState({
    key: "",
    limit: INITIAL_VALUE_DRIVER_RENDER_COUNT,
  });
  const renderLimit =
    shouldLazyRender && renderState.key === renderKey
      ? renderState.limit
      : shouldLazyRender
        ? INITIAL_VALUE_DRIVER_RENDER_COUNT
        : Number.POSITIVE_INFINITY;
  const renderedDrivers = filteredDrivers.slice(0, renderLimit);
  const renderedDriverCount = useMemo(
    () =>
      shouldLazyRender
        ? Math.min(filteredDrivers.length, renderLimit)
        : visibleDriverCount,
    [filteredDrivers.length, renderLimit, shouldLazyRender, visibleDriverCount]
  );
  const hasMoreDrivers = shouldLazyRender && renderLimit < filteredDrivers.length;
  const driverTileMinWidth = getRichMoverTrackWidth(
    displaySettings.cardSize,
    displaySettings.widescreen
  );
  const rangeLabel =
    data.previousLabel && data.latestLabel
      ? `${data.previousLabel} -> ${data.latestLabel}`
      : "Latest snapshot";
  const filterOptions: Array<{
    key: ValueDriverFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All moves", count: allDrivers.length },
    { key: "gain", label: "Gains", count: data.gains.length },
    { key: "drop", label: "Drops", count: data.drops.length },
  ];

  useEffect(() => {
    if (!hasMoreDrivers) {
      return;
    }

    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setRenderState((current) => {
          const currentLimit =
            current.key === renderKey ? current.limit : INITIAL_VALUE_DRIVER_RENDER_COUNT;
          const maxItems = filteredDrivers.length;
          const nextLimit = Math.min(currentLimit + VALUE_DRIVER_RENDER_BATCH_SIZE, maxItems);

          if (current.key === renderKey && nextLimit === current.limit) {
            return current;
          }

          return {
            key: renderKey,
            limit: nextLimit,
          };
        });
      },
      { rootMargin: "700px 0px" }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [filteredDrivers.length, hasMoreDrivers, renderKey]);

  const openCard = useCallback(
    async (cardId: string) => {
      const cached = cardDetailCache[cardId];
      if (cached) {
        setSelectedCard(cached);
        setDetailError(null);
        return;
      }

      setLoadingCardId(cardId);
      setDetailError(null);

      try {
        const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load card details");
        }

        const card = (await response.json()) as ModalCardData;
        setCardDetailCache((current) => ({ ...current, [cardId]: card }));
        setSelectedCard(card);
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "Could not load card details");
      } finally {
        setLoadingCardId((current) => (current === cardId ? null : current));
      }
    },
    [cardDetailCache]
  );
  const handleOpenCard = useCallback(
    (cardId: string) => {
      void openCard(cardId);
    },
    [openCard]
  );

  return (
    <div className="space-y-3">
      {!hasDrivers ? (
        <div className="rounded-xl border border-dashed border-black/10 bg-black/[0.025] px-4 py-8 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40">
          No item-level value changes in the latest comparison window.
        </div>
      ) : (
        <>
          {detailError ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-200">
              {detailError}
            </div>
          ) : null}

          <SectionHeader
            eyebrow="Value Changes"
            title="Market list"
            description={`Raw-style value changes for ${rangeLabel.toLowerCase()}.`}
            actions={
              <p className="shrink-0 text-sm text-gray-500 dark:text-white/46">
                {shouldLazyRender
                  ? `${renderedDriverCount.toLocaleString("en-US")} / ${visibleDriverCount.toLocaleString("en-US")}`
                  : visibleDriverCount.toLocaleString("en-US")}{" "}
                visible
              </p>
            }
          />

          <div className="rounded-2xl border border-black/8 bg-white/72 p-3 shadow-sm shadow-black/4 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-none">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              <div className="min-w-0">
                <label
                  htmlFor="value-driver-search"
                  className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35"
                >
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/35" />
                  <input
                    id="value-driver-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Card, set, number"
                    className="h-11 w-full rounded-xl border border-black/8 bg-black/[0.035] pl-9 pr-3 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-400/60 focus:bg-white dark:border-white/8 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/32 dark:focus:border-emerald-300/50 dark:focus:bg-white/[0.06]"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <span className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                  View
                </span>
                <div className="flex min-w-0 flex-wrap gap-1 rounded-xl border border-black/8 bg-black/[0.035] p-1 dark:border-white/8 dark:bg-white/[0.04]">
                  {filterOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setDriverFilter(option.key)}
                      className={valueFilterButtonClass(driverFilter === option.key)}
                    >
                      <span>{option.label}</span>
                      <span className="ml-1 opacity-55">{option.count.toLocaleString("en-US")}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DriverGrid
            items={renderedDrivers}
            loadingCardId={loadingCardId}
            onOpenCard={handleOpenCard}
            tileMinWidth={driverTileMinWidth}
          />

          {hasMoreDrivers ? (
            <div
              ref={loadMoreRef}
              className="mt-5 flex h-10 items-center justify-center text-xs font-semibold text-gray-400 dark:text-white/35"
              aria-live="polite"
            >
              Loading more value changes ({renderedDriverCount.toLocaleString("en-US")} /{" "}
              {visibleDriverCount.toLocaleString("en-US")})
            </div>
          ) : null}
        </>
      )}

      {selectedCard ? (
        <CardModal
          key={`${selectedCard.id}:${selectedCard.price_fetched_at ?? "none"}`}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      ) : null}
    </div>
  );
}
