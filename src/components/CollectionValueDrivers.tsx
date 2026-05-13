"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  useCallback,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { ModalCardData } from "@/components/card-modal/types";
import { formatCollectionCurrency } from "@/lib/collection";
import { RAW_CARD_ASPECT_CLASS } from "@/lib/graded-slabs";
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
  return `inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-[11px] font-semibold transition-colors ${
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

function episodeLabel(item: CollectionValueDriverItem): string {
  return item.episodeCode ? `${item.episodeName} (${item.episodeCode})` : item.episodeName;
}

function toneTextClass(tone: DriverLaneKey): string {
  return tone === "gain"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
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
    ? `${RAW_CARD_ASPECT_CLASS} w-10 rounded-[5px] bg-transparent shadow-sm shadow-black/25 sm:w-11`
    : "h-10 w-10 rounded-lg border border-black/8 bg-black/[0.04] dark:border-white/8 dark:bg-white/[0.05] sm:h-11 sm:w-11";
  const rowClassName =
    "group grid min-h-[3.75rem] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_minmax(4.7rem,auto)] items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.035] aria-busy:opacity-60 dark:hover:bg-white/[0.045] sm:grid-cols-[3rem_minmax(0,1fr)_minmax(7rem,auto)] sm:px-3";

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
    <>
      <div
        className={`relative shrink-0 overflow-hidden ${imageFrameClass}`}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.name}
            fill
            sizes="44px"
            className="object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-gray-400 dark:text-white/35">
            {item.kind === "sealed" ? "S" : "C"}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[12px] font-semibold leading-4 text-gray-950 dark:text-white sm:text-[13px]">
            {item.name}
          </p>
          {item.quantity > 1 ? (
            <span className="shrink-0 rounded-full border border-black/8 bg-black/[0.035] px-1 py-0.5 text-[9px] font-semibold leading-none text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/42">
              x{item.quantity}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[10px] font-medium leading-3 text-gray-500 dark:text-white/46 sm:text-[11px] sm:leading-4">
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
        <p className="hidden truncate text-[10px] font-medium leading-3 text-gray-400 dark:text-white/34 sm:block">
          {sourceLabel(item)}
        </p>
      </div>

      <div className="min-w-0 text-right">
        <p
          className={`inline-flex max-w-full items-center justify-end gap-0.5 text-[12px] font-bold leading-4 tabular-nums sm:text-[13px] ${toneTextClass(tone)}`}
        >
          <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
          <span className="truncate">{signedCurrency(item.change)}</span>
        </p>
        <p className="text-[9px] font-semibold leading-3 tabular-nums text-gray-400 dark:text-white/34 sm:text-[10px]">
          {percent ?? formatCollectionCurrency(item.currentValue)}
        </p>
        <p className="hidden text-[10px] leading-3 tabular-nums text-gray-500 dark:text-white/45 sm:block">
          {formatCollectionCurrency(item.previousValue)}
          {" -> "}
          {formatCollectionCurrency(item.currentValue)}
        </p>
      </div>
    </>
  );

  if (item.kind === "card") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-busy={loading}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={`${rowClassName} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45`}
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
      className={rowClassName}
    >
      {content}
    </Link>
  );
}

function DriverList({
  lane,
  loadingCardId,
  onOpenCard,
}: {
  lane: DriverLane;
  loadingCardId: string | null;
  onOpenCard: (cardId: string) => void;
}) {
  const isGain = lane.key === "gain";
  const Icon = isGain ? TrendingUp : TrendingDown;
  const titleText = isGain ? "Gains" : "Drops";

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-black/8 bg-white/72 shadow-sm shadow-black/4 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex h-10 items-center justify-between gap-3 border-b border-black/8 px-3 dark:border-white/8">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/8 bg-black/[0.035] text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/50">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold leading-4 text-gray-800 dark:text-white/82">
              {titleText}
            </p>
            <p className="text-[10px] leading-3 text-gray-400 dark:text-white/34">
              {lane.items.length} items
            </p>
          </div>
        </div>
        <p className={`shrink-0 text-[13px] font-bold tabular-nums ${toneTextClass(lane.key)}`}>
          {signedCurrency(lane.total)}
        </p>
      </div>

      {lane.items.length > 0 ? (
        <div className="divide-y divide-black/6 dark:divide-white/7">
          {lane.items.map((item) => (
            <DriverRow
              key={item.id}
              item={item}
              loading={item.cardId === loadingCardId}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-7 text-center text-xs font-medium text-gray-400 dark:text-white/35">
          No movement
        </div>
      )}
    </div>
  );
}

export default function CollectionValueDrivers({
  data,
  sectionTrailing,
}: {
  data: CollectionValueDriversData;
  sectionTrailing?: ReactNode;
}) {
  const pathname = usePathname() ?? "/movers";
  const searchParams = useSearchParams();
  const [mobileLane, setMobileLane] = useState<DriverLaneKey>("gain");
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const hasDrivers = data.gains.length > 0 || data.drops.length > 0;
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
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 rounded-xl border border-black/8 bg-white/72 p-1 shadow-sm shadow-black/4 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-none">
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

      <div className="hidden flex-wrap items-center justify-between gap-2 rounded-xl border border-black/8 bg-black/[0.025] px-3 py-2 dark:border-white/8 dark:bg-white/[0.035] sm:flex">
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
            className={`shrink-0 text-base font-bold tabular-nums ${
              (data.totalChange ?? 0) >= 0 ? toneTextClass("gain") : toneTextClass("drop")
            }`}
          >
            {signedCurrency(data.totalChange)}
          </p>
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
            />
          </div>

          <div className="hidden gap-3 md:grid md:grid-cols-2">
            {lanes.map((lane) => (
              <DriverList
                key={lane.key}
                lane={lane}
                loadingCardId={loadingCardId}
                onOpenCard={handleOpenCard}
              />
            ))}
          </div>
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
