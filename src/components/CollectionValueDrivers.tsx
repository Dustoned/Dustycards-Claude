"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import { formatCollectionCurrency } from "@/lib/collection";
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

type MoversMode = "value" | "raw" | "graded" | "targets" | "sealed";
type DriverLaneKey = "gain" | "drop";
type ValueDriverScope = "collection" | "all";

const INITIAL_VALUE_DRIVER_RENDER_COUNT = 24;
const VALUE_DRIVER_RENDER_BATCH_SIZE = 36;

interface DriverLane {
  key: DriverLaneKey;
  title: string;
  total: number;
  items: CollectionValueDriverItem[];
}

function modeHref(pathname: string, searchParams: { toString(): string }, mode: MoversMode): string {
  const params = new URLSearchParams(searchParams.toString());

  params.delete("view");

  if (mode === "value") {
    params.delete("scope");
    params.delete("source");
  } else if (mode === "raw") {
    params.set("scope", "collection");
  } else if (mode === "graded") {
    params.set("scope", "graded");
  } else if (mode === "targets") {
    params.set("scope", "grading");
  } else {
    params.set("scope", "sealed");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function modeTabClass(active: boolean): string {
  return `inline-flex h-9 min-w-[8rem] flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors sm:flex-none ${
    active
      ? "bg-gray-950 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-950"
      : "text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
  }`;
}

function scopeButtonClass(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
      : "border-black/8 bg-white/75 text-gray-600 hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
  }`;
}

function valueScopeHref(
  pathname: string,
  searchParams: { toString(): string },
  scope: ValueDriverScope
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("scope");
  params.delete("source");

  if (scope === "all") {
    params.set("view", "all");
  } else {
    params.delete("view");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
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
    "group relative flex h-full min-h-[14.75rem] min-w-0 flex-col rounded-2xl border border-black/8 bg-white/74 p-3 text-left shadow-sm shadow-black/5 outline-none transition hover:-translate-y-0.5 hover:border-black/14 hover:bg-white/90 aria-busy:opacity-60 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06] sm:min-h-[15.75rem]";

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
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div
        className={`relative shrink-0 overflow-hidden ${imageFrameClass}`}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.name}
            fill
            sizes="74px"
            className="object-contain"
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
                  href={`/expansions/${item.episodeId}`}
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

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(12rem,1.15fr)_minmax(8.5rem,0.85fr)]">
          <div className={`rounded-2xl border px-3 py-3 ${tonePanelClass(tone)}`}>
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
                  <span>{signedCurrency(item.change)}</span>
                </p>
              </div>
              <p className={`shrink-0 text-xs font-bold tabular-nums ${toneTextClass(tone)}`}>
                {percent ?? ""}
              </p>
            </div>
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-white/45">
              {formatCollectionCurrency(item.previousValue)}
              {" -> "}
              {formatCollectionCurrency(item.currentValue)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            <span className="min-w-0 rounded-xl border border-black/8 bg-black/[0.025] px-3 py-3 dark:border-white/8 dark:bg-white/[0.035]">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
                Before
              </span>
              <span className="mt-1 block truncate text-sm font-bold tabular-nums text-gray-700 dark:text-white/72">
                {formatCollectionCurrency(item.previousValue)}
              </span>
            </span>
            <span className="min-w-0 rounded-xl border border-black/8 bg-black/[0.025] px-3 py-3 dark:border-white/8 dark:bg-white/[0.035]">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
                Now
              </span>
              <span className="mt-1 block truncate text-sm font-bold tabular-nums text-gray-900 dark:text-white">
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

function DriverList({
  lane,
  loadingCardId,
  onOpenCard,
  tileMinWidth,
  renderLimit,
}: {
  lane: DriverLane;
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
  tileMinWidth: string;
  renderLimit: number;
}) {
  const isGain = lane.key === "gain";
  const Icon = isGain ? TrendingUp : TrendingDown;
  const titleText = isGain ? "Gains" : "Drops";
  const visibleItems = lane.items.slice(0, renderLimit);

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-black/8 pb-3 dark:border-white/8">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/72 text-gray-500 shadow-sm shadow-black/4 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/50">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-6 text-gray-950 dark:text-white">
              {titleText}
            </p>
            <p className="text-xs leading-4 text-gray-500 dark:text-white/42">
              {lane.items.length} items
            </p>
          </div>
        </div>
        <p className={`shrink-0 text-lg font-bold tabular-nums ${toneTextClass(lane.key)}`}>
          {signedCurrency(lane.total)}
        </p>
      </div>

      {visibleItems.length > 0 ? (
        <div
          className="grid auto-rows-fr items-stretch gap-4"
          style={{
            gridTemplateColumns: getFixedTrackGridTemplate(tileMinWidth),
            justifyContent: "start",
          }}
        >
          {visibleItems.map((item) => (
            <DriverRow
              key={item.id}
              item={item}
              loading={item.cardId === loadingCardId}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/10 bg-black/[0.025] px-4 py-7 text-center text-xs font-medium text-gray-400 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/35">
          No movement
        </div>
      )}
    </section>
  );
}

export default function CollectionValueDrivers({
  data,
  activeItemScope = "collection",
  sectionTrailing,
}: {
  data: CollectionValueDriversData;
  activeItemScope?: ValueDriverScope;
  sectionTrailing?: ReactNode;
}) {
  const { displaySettings } = useSettings();
  const pathname = usePathname() ?? "/movers";
  const searchParams = useSearchParams();
  const [mobileLane, setMobileLane] = useState<DriverLaneKey>("gain");
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasDrivers = data.gains.length > 0 || data.drops.length > 0;
  const visibleDriverCount = data.gains.length + data.drops.length;
  const shouldLazyRender = activeItemScope === "all";
  const renderKey = `${activeItemScope}:${data.previousDate ?? "none"}:${data.latestDate ?? "none"}:${data.gains.length}:${data.drops.length}`;
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
  const renderedDriverCount = useMemo(
    () =>
      shouldLazyRender
        ? Math.min(data.gains.length, renderLimit) + Math.min(data.drops.length, renderLimit)
        : visibleDriverCount,
    [data.drops.length, data.gains.length, renderLimit, shouldLazyRender, visibleDriverCount]
  );
  const hasMoreDrivers =
    shouldLazyRender && (renderLimit < data.gains.length || renderLimit < data.drops.length);
  const driverTileMinWidth = getRichMoverTrackWidth(
    displaySettings.cardSize,
    displaySettings.widescreen
  );
  const rangeLabel =
    data.previousLabel && data.latestLabel
      ? `${data.previousLabel} -> ${data.latestLabel}`
      : "Latest snapshot";
  const modes: Array<{ key: MoversMode; label: string; shortLabel: string }> = [
    { key: "value", label: "Value Changes", shortLabel: "Value" },
    { key: "raw", label: "Raw Singles", shortLabel: "Raw" },
    { key: "graded", label: "Graded", shortLabel: "Graded" },
    { key: "targets", label: "Targets", shortLabel: "Targets" },
    { key: "sealed", label: "Sealed", shortLabel: "Sealed" },
  ];
  const lanes: DriverLane[] = [
    { key: "gain", title: "Gains", total: data.gainsTotal, items: data.gains },
    { key: "drop", title: "Drops", total: data.dropsTotal, items: data.drops },
  ];
  const activeLane = lanes.find((lane) => lane.key === mobileLane) ?? lanes[0];

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
          const maxItems = Math.max(data.gains.length, data.drops.length);
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
  }, [data.drops.length, data.gains.length, hasMoreDrivers, renderKey]);

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
      <div className="rounded-2xl border border-black/8 bg-white/70 p-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end">
            <div className="min-w-0">
              <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Market
              </span>
              <div className="mt-1 flex flex-wrap gap-1 rounded-xl border border-black/8 bg-black/[0.035] p-1 dark:border-white/8 dark:bg-white/[0.04]">
                {modes.map((mode) => (
                  <Link
                    key={mode.key}
                    href={modeHref(pathname, searchParams, mode.key)}
                    prefetch={false}
                    className={modeTabClass(mode.key === "value")}
                    aria-current={mode.key === "value" ? "page" : undefined}
                  >
                    <span className="sm:hidden">{mode.shortLabel}</span>
                    <span className="hidden sm:inline">{mode.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Scope
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "collection" as const, label: "Collection" },
                  { key: "all" as const, label: "All Cards" },
                ].map((scope) => {
                  const active = activeItemScope === scope.key;

                  return (
                    <Link
                      key={scope.key}
                      href={valueScopeHref(pathname, searchParams, scope.key)}
                      prefetch={false}
                      className={scopeButtonClass(active)}
                      aria-current={active ? "page" : undefined}
                    >
                      {scope.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden min-w-[24rem] flex-wrap items-center justify-between gap-3 rounded-xl border border-black/8 bg-black/[0.025] px-3.5 py-2.5 dark:border-white/8 dark:bg-white/[0.035] sm:flex">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/36">
                Net change
              </p>
              <p className="truncate text-[12px] font-medium text-gray-500 dark:text-white/48">
                {rangeLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sectionTrailing}
              <p
                className={`shrink-0 text-lg font-bold tabular-nums ${
                  (data.totalChange ?? 0) >= 0 ? toneTextClass("gain") : toneTextClass("drop")
                }`}
              >
                {signedCurrency(data.totalChange)}
              </p>
            </div>
          </div>
        </div>
      </div>

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
            title="Latest change"
            description={rangeLabel}
            actions={
              <p className="shrink-0 text-sm text-gray-500 dark:text-white/46">
                {shouldLazyRender
                  ? `${renderedDriverCount.toLocaleString("en-US")} / ${visibleDriverCount.toLocaleString("en-US")}`
                  : visibleDriverCount.toLocaleString("en-US")}{" "}
                visible
              </p>
            }
          />

          <div className="grid grid-cols-2 gap-1 rounded-xl border border-black/8 bg-white/72 p-1 shadow-sm shadow-black/4 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-none md:hidden">
            {lanes.map((lane) => (
              <button
                key={lane.key}
                type="button"
                onClick={() => setMobileLane(lane.key)}
                className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  mobileLane === lane.key
                    ? "border border-black/10 bg-white text-gray-950 shadow-sm shadow-black/10 dark:border-white dark:bg-white dark:text-gray-950"
                    : "border border-transparent text-gray-500 dark:text-white/56"
                }`}
              >
                <span className="truncate text-[11px] font-semibold">{lane.title}</span>
                <span
                  className={`shrink-0 text-[11px] font-bold tabular-nums ${
                    mobileLane === lane.key ? "" : toneTextClass(lane.key)
                  }`}
                >
                  {signedCurrency(lane.total)}
                </span>
              </button>
            ))}
          </div>

          <div className="md:hidden">
            <DriverList
              lane={activeLane}
              loadingCardId={loadingCardId}
              onOpenCard={handleOpenCard}
              tileMinWidth={driverTileMinWidth}
              renderLimit={renderLimit}
            />
          </div>

          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:gap-4">
            {lanes.map((lane) => (
              <DriverList
                key={lane.key}
                lane={lane}
                loadingCardId={loadingCardId}
                onOpenCard={handleOpenCard}
                tileMinWidth={driverTileMinWidth}
                renderLimit={renderLimit}
              />
            ))}
          </div>

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
