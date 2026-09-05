"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Package, Sparkles } from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { useHomeItemDetails } from "@/components/HomeItemDetailProvider";
import { buildHomeSuddenDropSealedProduct } from "@/components/home-item-details";
import type { HomeWidgetViewMode } from "@/lib/dashboard-module-preferences";
import { formatCurrency } from "@/lib/format";
import type {
  HomeSuddenDropPreviewItem,
  HomeSuddenDropSealedPreviewItem,
  HomeSuddenDropsResponse,
} from "@/lib/home-sudden-drops";
import { HOME_SUDDEN_DROP_LANE_SIZE } from "@/lib/home-sudden-drops";
import {
  readHomeClientCache,
  writeHomeClientCache,
} from "@/lib/home-client-cache";

type LoadState =
  | { status: "loading"; apiHref: string }
  | { status: "ready"; apiHref: string; data: HomeSuddenDropsResponse }
  | { status: "error"; apiHref: string };

const DEFAULT_THRESHOLD = 5;
const EMPTY_DATA: HomeSuddenDropsResponse = {
  items: [],
  total: 0,
  threshold: DEFAULT_THRESHOLD,
  windowDays: 1,
  limit: 50,
  refreshStartedAt: null,
  refreshFinishedAt: null,
  refreshStatus: null,
};

function HomeSuddenDropRow({
  item,
  onOpen,
  loading,
  gridView,
}: {
  item: HomeSuddenDropPreviewItem;
  onOpen: () => void;
  loading: boolean;
  gridView: boolean;
}) {
  if (gridView) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-busy={loading}
        data-home-preview-tile
        data-preview-tone="drop"
        className="home-preview-tile home-preview-tile--drop group flex min-w-0 flex-col rounded-xl border p-2 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5"
      >
        <span className="home-preview-tile__media home-preview-tile__media--card">
          <span className="home-preview-tile__art home-preview-tile__art--card">
            {item.imageUrl ? (
              <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="(max-width: 640px) 145px, 190px" className="object-cover" />
            ) : (
              <ArrowDownRight className="h-8 w-8 text-rose-300" />
            )}
          </span>
        </span>
        <span className="mt-2 min-w-0">
          <span className="line-clamp-2 text-[14px] font-black leading-[1.2] text-white/92 group-hover:text-white">{item.name}</span>
          <span className="mt-1 line-clamp-1 text-[10.5px] font-semibold leading-4 text-white/45">
            {item.episodeCode ?? item.episodeName}{item.cardNumber ? ` / #${item.cardNumber}` : ""}
          </span>
        </span>
        <span className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.46)] pt-2">
          <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
            Now {formatCurrency(item.currentPrice, item.currency)}
          </span>
          <span className="home-preview-tile__metric shrink-0 rounded-full px-2 py-1 text-[12px] font-black tabular-nums text-rose-300">
            -{formatCurrency(item.dropAmount, item.currency)}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-busy={loading}
      className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.58),rgb(var(--dc-surface-primary-rgb)/0.72))] px-2.5 py-2 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/14 bg-rose-400/[0.07] text-rose-300">
        <ArrowDownRight className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black leading-tight text-white/88 transition-colors group-hover:text-white">
          {item.name}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-semibold leading-4 text-white/42">
          <span className="min-w-0 truncate">
            {item.cardNumber ? `#${item.cardNumber}` : "No number"}
          </span>
          <span className="shrink-0 text-white/28">/</span>
          <span className="min-w-0 truncate">
            {item.episodeCode ? item.episodeCode : item.episodeName}
          </span>
          <span className="shrink-0 text-white/28">/</span>
          <span className="shrink-0">{item.sourceLabel}</span>
          <span className="shrink-0 text-white/28">/</span>
          <span className="shrink-0">last 24h</span>
        </span>
      </span>
      <span className="min-w-[6.5rem] shrink-0 text-right">
        <span className="block text-[13px] font-black leading-tight tabular-nums text-rose-300">
          -{formatCurrency(item.dropAmount, item.currency)}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-bold tabular-nums text-white/42">
          Now {formatCurrency(item.currentPrice, item.currency)}
        </span>
      </span>
    </button>
  );
}

function HomeSealedDropRow({
  item,
  onOpen,
  gridView,
}: {
  item: HomeSuddenDropSealedPreviewItem;
  onOpen: () => void;
  gridView: boolean;
}) {
  if (gridView) {
    return (
      <button
        type="button"
        onClick={onOpen}
        data-home-preview-tile
        data-preview-tone="sealed"
        className="home-preview-tile home-preview-tile--sealed group flex min-w-0 flex-col rounded-xl border p-2 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5"
      >
        <span className="home-preview-tile__media home-preview-tile__media--product">
          <span className="home-preview-tile__art home-preview-tile__art--product">
            {item.imageUrl ? (
              <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="(max-width: 640px) 145px, 190px" className="object-contain p-2" />
            ) : (
              <Package className="h-8 w-8 text-amber-300" />
            )}
          </span>
        </span>
        <span className="mt-2 min-w-0">
          <span className="line-clamp-2 text-[14px] font-black leading-[1.2] text-white/92 group-hover:text-white">{item.name}</span>
          <span className="mt-1 line-clamp-1 text-[10.5px] font-semibold leading-4 text-amber-200/65">
            {item.episodeCode ?? item.episodeName} / Sealed product
          </span>
        </span>
        <span className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.46)] pt-2">
          <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
            Now {formatCurrency(item.currentPrice, item.currency)}
          </span>
          <span className="home-preview-tile__metric shrink-0 rounded-full px-2 py-1 text-[12px] font-black tabular-nums text-rose-300">
            -{formatCurrency(item.dropAmount, item.currency)}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.58),rgb(var(--dc-surface-primary-rgb)/0.72))] px-2.5 py-2 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/14 bg-amber-400/[0.07] text-amber-300">
        <Package className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black leading-tight text-white/88 transition-colors group-hover:text-white">
          {item.name}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-semibold leading-4 text-white/42">
          <span className="shrink-0 rounded-md border border-amber-300/24 bg-amber-400/10 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-200">
            Sealed
          </span>
          <span className="min-w-0 truncate">
            {item.episodeCode ? item.episodeCode : item.episodeName}
          </span>
          <span className="shrink-0 text-white/28">/</span>
          <span className="shrink-0">last 24h</span>
        </span>
      </span>
      <span className="min-w-[6.5rem] shrink-0 text-right">
        <span className="block text-[13px] font-black leading-tight tabular-nums text-rose-300">
          -{formatCurrency(item.dropAmount, item.currency)}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-bold tabular-nums text-white/42">
          Now {formatCurrency(item.currentPrice, item.currency)}
        </span>
      </span>
    </button>
  );
}

function LoadingRows({ gridView }: { gridView: boolean }) {
  return (
    <div
      className={`${gridView ? "home-widget-tile-grid" : ""} grid min-w-0 gap-2`}
    >
      {Array.from({ length: HOME_SUDDEN_DROP_LANE_SIZE }).map((_, index) => (
        <div
          key={index}
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-hover-rgb)/0.38)] px-2.5 py-2"
        >
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-white/[0.07]" />
          <span className="min-w-0 space-y-1.5">
            <span className="block h-3 w-2/3 animate-pulse rounded-full bg-white/[0.08]" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded-full bg-white/[0.06]" />
          </span>
          <span className="min-w-[6.5rem] space-y-1.5">
            <span className="ml-auto block h-3 w-16 animate-pulse rounded-full bg-white/[0.08]" />
            <span className="ml-auto block h-2.5 w-20 animate-pulse rounded-full bg-white/[0.06]" />
          </span>
        </div>
      ))}
    </div>
  );
}

function HomeSuddenDropLane({
  title,
  items,
  total,
  openingCardId,
  onOpenCard,
  gridView,
}: {
  title: string;
  items: HomeSuddenDropPreviewItem[];
  total: number;
  openingCardId: string | null;
  onOpenCard: (cardId: string) => void;
  gridView: boolean;
}) {
  return (
    <div className="home-widget-tile-lane min-w-0">
      <div className="home-widget-lane-heading home-widget-lane-heading--drop mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.12em] text-white/78">
          <span className="home-widget-lane-heading__dot" aria-hidden="true" />
          {title}
        </p>
        <span className="rounded-full bg-black/18 px-2 py-0.5 text-[10.5px] font-bold text-white/52">
          {total.toLocaleString("en-US")}
        </span>
      </div>
      <div
        className={`${gridView ? "home-widget-tile-grid" : ""} grid min-w-0 gap-2`}
      >
        {items.length > 0 ? (
          items.map((item) => (
            <HomeSuddenDropRow
              key={`${item.cardId}:${item.source}`}
              item={item}
              onOpen={() => onOpenCard(item.cardId)}
              loading={openingCardId === item.cardId}
              gridView={gridView}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-[rgb(var(--dc-border-rgb)/0.72)] px-3 py-4 text-[12px] font-semibold text-white/38">
            No verified card drops in the last 24 hours.
          </p>
        )}
      </div>
    </div>
  );
}

function HomeSealedDropLane({
  items,
  total,
  onOpenSealed,
  gridView,
}: {
  items: HomeSuddenDropSealedPreviewItem[];
  total: number;
  onOpenSealed: (item: HomeSuddenDropSealedPreviewItem) => void;
  gridView: boolean;
}) {
  return (
    <div className="home-widget-tile-lane min-w-0">
      <div className="home-widget-lane-heading home-widget-lane-heading--sealed mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.12em] text-white/78">
          <span className="home-widget-lane-heading__dot" aria-hidden="true" />
          Sealed drops
        </p>
        <span className="rounded-full bg-black/18 px-2 py-0.5 text-[10.5px] font-bold text-white/52">
          {total.toLocaleString("en-US")}
        </span>
      </div>
      <div
        className={`${gridView ? "home-widget-tile-grid" : ""} grid min-w-0 gap-2`}
      >
        {items.length > 0 ? (
          items.map((item) => (
            <HomeSealedDropRow
              key={item.productId}
              item={item}
              onOpen={() => onOpenSealed(item)}
              gridView={gridView}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-[rgb(var(--dc-border-rgb)/0.72)] px-3 py-4 text-[12px] font-semibold text-white/38">
            No verified sealed drops in the last 24 hours.
          </p>
        )}
      </div>
    </div>
  );
}

export default function HomeSuddenDropsPanel({
  apiHref,
  cacheScope,
  viewAllHref,
  viewMode = "grid",
}: {
  apiHref: string;
  cacheScope: string;
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
}) {
  const { openingCardId, openCard, openSealed } = useHomeItemDetails();
  const [state, setState] = useState<LoadState>(() => {
    const cached = readHomeClientCache<HomeSuddenDropsResponse>(
      "sudden-drops",
      cacheScope,
      apiHref
    );
    return cached
      ? { status: "ready", apiHref, data: cached }
      : { status: "loading", apiHref };
  });
  const gridView = viewMode === "grid";

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiHref, {
      credentials: "same-origin",
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load sudden drops");
        }
        return (await response.json()) as HomeSuddenDropsResponse;
      })
      .then((data) => {
        writeHomeClientCache("sudden-drops", cacheScope, apiHref, data);
        setState({ status: "ready", apiHref, data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", apiHref });
      });

    return () => controller.abort();
  }, [apiHref, cacheScope]);

  const cachedData = readHomeClientCache<HomeSuddenDropsResponse>(
    "sudden-drops",
    cacheScope,
    apiHref
  );
  const data =
    state.status === "ready" && state.apiHref === apiHref
      ? state.data
      : cachedData ?? EMPTY_DATA;
  const isLoading = !cachedData && (state.apiHref !== apiHref || state.status === "loading");
  const previewItems = data.items;
  const sealedItems = data.sealedItems ?? [];
  const currency = previewItems[0]?.currency ?? "EUR";
  const thresholdLabel = formatCurrency(data.threshold, currency);
  const hasItems = previewItems.length > 0 || sealedItems.length > 0;
  const laneLimit = gridView ? HOME_SUDDEN_DROP_LANE_SIZE : 6;
  const cardDrops = previewItems.slice(0, laneLimit);
  const sealedDrops = sealedItems.slice(0, laneLimit);
  return (
    <section className="binder-panel home-widget-panel home-widget-panel--drops overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/34">
            Market Snapshot
          </p>
          <h2 className="mt-0.5 text-base font-black tracking-tight text-white">
            Sudden Price Drops
          </h2>
          <p className="mt-0.5 text-[12px] font-semibold text-white/42">
            Verified {thresholdLabel}+ drops in the rolling last 24 hours.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-2.5 text-[12px] font-black tabular-nums text-white">
            <Sparkles className="h-3.5 w-3.5 text-rose-300/80" />
            {isLoading ? "--" : data.total.toLocaleString("en-US")}
          </span>
          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.045] px-2.5 text-[12px] font-bold text-violet-200 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white"
          >
            Open movers
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        {isLoading ? (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <LoadingRows gridView={gridView} />
            <LoadingRows gridView={gridView} />
          </div>
        ) : state.status === "error" ? (
          <div className="border-t border-white/7 py-4 text-[12px] font-semibold text-white/38">
            Could not load sudden price drops right now.
          </div>
        ) : hasItems ? (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <HomeSuddenDropLane
              title="Card drops"
              items={cardDrops}
              total={data.total}
              openingCardId={openingCardId}
              onOpenCard={(cardId) => void openCard(cardId)}
              gridView={gridView}
            />
            <HomeSealedDropLane
              items={sealedDrops}
              total={data.sealedTotal ?? sealedItems.length}
              onOpenSealed={(item) => openSealed(buildHomeSuddenDropSealedProduct(item))}
              gridView={gridView}
            />
          </div>
        ) : (
          <div className="border-t border-white/7 py-4 text-[12px] font-semibold text-white/38">
            No verified raw-card drops of {thresholdLabel}+ in the last 24 hours.
          </div>
        )}
      </div>
    </section>
  );
}
