"use client";

import Link from "next/link";
import { Box } from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { useHomeItemDetails } from "@/components/HomeItemDetailProvider";
import {
  buildModalProduct,
  getCollectionSealedCurrentTotal,
} from "@/components/collection-sealed/utils";
import { formatCollectionCurrency } from "@/lib/collection";
import type { HomeWidgetViewMode } from "@/lib/dashboard-module-preferences";
import type { CollectionSealedViewItem } from "@/types/collection-view";

const GRID_LIMIT = 8;
const LIST_LIMIT = 6;

export default function HomeFeaturedSealedPanel({
  items,
  viewAllHref,
  viewMode = "grid",
}: {
  items: CollectionSealedViewItem[];
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
}) {
  const { openSealed } = useHomeItemDetails();
  const visibleItems = items.slice(0, viewMode === "list" ? LIST_LIMIT : GRID_LIMIT);

  if (visibleItems.length === 0) return null;

  return (
    <section className="binder-panel home-widget-panel h-full rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[length:var(--ui-section-header-title-size)] font-bold tracking-tight text-white">
            Featured Sealed
          </h2>
          <p className="mt-0.5 text-[10px] font-semibold text-white/36">
            Highest-value sealed highlights
          </p>
        </div>
        <Link
          href={viewAllHref}
          prefetch={false}
          className="shrink-0 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          View all
        </Link>
      </div>

      <div className={viewMode === "grid"
        ? "home-widget-tile-grid grid gap-2"
        : "grid gap-1.5 sm:grid-cols-2"}
      >
        {visibleItems.map((item) => {
          const totalValue = getCollectionSealedCurrentTotal(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openSealed(buildModalProduct(item))}
              className={viewMode === "grid"
                ? "group min-w-0 overflow-hidden rounded-xl border border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-primary-rgb)/0.5)] p-2 text-left transition hover:border-[rgb(var(--dc-border-hover-rgb)/0.9)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.62)]"
                : "group grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-primary-rgb)/0.5)] px-2.5 py-2 text-left transition hover:border-[rgb(var(--dc-border-hover-rgb)/0.9)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.62)]"}
            >
              <span className={viewMode === "grid"
                ? "relative block aspect-square w-full overflow-hidden rounded-lg bg-black/18"
                : "relative block aspect-square w-11 overflow-hidden rounded-lg bg-black/18"}
              >
                {item.image_url ? (
                  <CachedImage
                    sourceUrl={item.image_url}
                    alt=""
                    fill
                    sizes={viewMode === "grid" ? "(max-width: 640px) 44vw, 180px" : "44px"}
                    className="object-contain p-1 transition-transform duration-200 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-white/20">
                    <Box className="h-7 w-7" aria-hidden="true" />
                  </span>
                )}
              </span>

              <span className={viewMode === "grid" ? "mt-2 block min-w-0" : "min-w-0"}>
                <span className="block truncate text-[12px] font-black text-white/88 group-hover:text-white">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/38">
                  {item.episode_name}{item.episode_code ? ` / ${item.episode_code}` : ""}
                </span>
                {viewMode === "grid" ? (
                  <span className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-black tabular-nums text-white/76">
                      {item.current_value_per_item == null
                        ? "No price"
                        : formatCollectionCurrency(item.current_value_per_item)}
                    </span>
                    <span className="shrink-0 text-[9px] font-bold text-white/38">
                      ×{item.quantity}
                    </span>
                  </span>
                ) : null}
              </span>

              {viewMode === "list" ? (
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] font-black tabular-nums text-white/76">
                    {totalValue == null ? "--" : formatCollectionCurrency(totalValue)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold text-white/35">
                    {item.quantity} owned
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
