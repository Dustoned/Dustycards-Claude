"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { formatCollectionCurrency } from "@/lib/collection";
import type {
  HomeAllocationSegment,
  HomeAllocationTone,
  HomeOverviewInsightsPayload,
} from "@/lib/home-overview-insights";

const HomeValueDriversPanel = dynamic(() => import("@/components/HomeValueDriversPanel"), {
  ssr: false,
  loading: () => <InsightPanelSkeleton />,
});
const HomeSuddenDropsPanel = dynamic(() => import("@/components/HomeSuddenDropsPanel"), {
  ssr: false,
  loading: () => <InsightPanelSkeleton />,
});
const HomeFeaturedCardsPanel = dynamic(() => import("@/components/HomeFeaturedCardsPanel"), {
  ssr: false,
  loading: () => <FeaturedCardsSkeleton />,
});

const TONE_CLASSES: Record<
  HomeAllocationTone,
  { dot: string; bar: string; text: string }
> = {
  sky: { dot: "bg-sky-400", bar: "bg-sky-400", text: "text-sky-200" },
  emerald: { dot: "bg-emerald-400", bar: "bg-emerald-400", text: "text-emerald-200" },
  amber: { dot: "bg-amber-300", bar: "bg-amber-300", text: "text-amber-100" },
  rose: { dot: "bg-rose-400", bar: "bg-rose-400", text: "text-rose-200" },
};

function InsightPanelSkeleton() {
  return (
    <section
      className="binder-panel h-40 rounded-[var(--ui-page-header-radius)] p-3 motion-safe:animate-pulse"
      aria-hidden="true"
    >
      <div className="h-3 w-24 rounded-full bg-white/8" />
      <div className="mt-3 h-6 w-40 rounded-lg bg-white/8" />
      <div className="mt-5 grid gap-2">
        <div className="h-8 rounded-xl bg-white/[0.045]" />
        <div className="h-8 rounded-xl bg-white/[0.045]" />
      </div>
    </section>
  );
}

function FeaturedCardsSkeleton() {
  return (
    <section
      className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 motion-safe:animate-pulse"
      aria-hidden="true"
    >
      <div className="h-5 w-32 rounded-lg bg-white/8" />
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="aspect-[63/88] rounded-xl bg-white/[0.045]" />
        ))}
      </div>
    </section>
  );
}

function AllocationSkeleton() {
  return (
    <section
      className="binder-panel h-40 rounded-[var(--ui-page-header-radius)] p-3 motion-safe:animate-pulse"
      aria-hidden="true"
    >
      <div className="h-5 w-44 rounded-lg bg-white/8" />
      <div className="mt-4 h-3 rounded-full bg-white/[0.055]" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-8 rounded-xl bg-white/[0.045]" />
        ))}
      </div>
    </section>
  );
}

function safeShare(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function CollectionAllocationPanel({ segments }: { segments: HomeAllocationSegment[] }) {
  const totalValue = segments.reduce((total, segment) => total + segment.value, 0);

  if (segments.length === 0) return null;

  return (
    <section className="binder-panel relative overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <h2 className="text-base font-black tracking-tight text-white">Collection Allocation</h2>

      <div className="mt-2.5 flex h-3 gap-1 rounded-full border border-white/8 bg-black/18 p-0.5">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${TONE_CLASSES[segment.tone].bar} h-full min-w-2 rounded-full`}
            style={{
              flexBasis: 0,
              flexGrow: totalValue > 0 ? Math.max(segment.value, totalValue * 0.012) : 1,
            }}
            title={`${segment.label}: ${safeShare(segment.value, totalValue).toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex min-w-0 items-center gap-2">
            <span className={`${TONE_CLASSES[segment.tone].dot} h-2 w-2 shrink-0 rounded-full`} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/52">
              {segment.label}
            </span>
            <span className={`shrink-0 text-[11px] font-black tabular-nums ${TONE_CLASSES[segment.tone].text}`}>
              {formatCollectionCurrency(segment.value)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ProgressiveHomeOverviewInsights({
  endpoint,
  valueDriversHref,
  suddenDropsApiHref,
  suddenDropsHref,
  collectionHref,
  topSetsSlot,
}: {
  endpoint: string;
  valueDriversHref: string;
  suddenDropsApiHref: string;
  suddenDropsHref: string;
  collectionHref: string;
  topSetsSlot: ReactNode;
}) {
  const [payload, setPayload] = useState<HomeOverviewInsightsPayload | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(false);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return (await response.json()) as HomeOverviewInsightsPayload;
      })
      .then((nextPayload) => {
        if (!controller.signal.aborted) setPayload(nextPayload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });

    return () => controller.abort();
  }, [attempt, endpoint]);

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <div className="home-insight-panels">
        {payload ? (
          <HomeValueDriversPanel data={payload.valueDrivers} viewAllHref={valueDriversHref} />
        ) : (
          <InsightPanelSkeleton />
        )}
        <HomeSuddenDropsPanel apiHref={suddenDropsApiHref} viewAllHref={suddenDropsHref} />
      </div>

      {payload ? (
        payload.featuredCards.length > 0 ? (
          <HomeFeaturedCardsPanel cards={payload.featuredCards} viewAllHref={collectionHref} />
        ) : null
      ) : (
        <FeaturedCardsSkeleton />
      )}

      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2 [&>section]:h-full">
        {payload ? <CollectionAllocationPanel segments={payload.allocation} /> : <AllocationSkeleton />}
        {topSetsSlot}
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.045] px-3 py-2 text-xs text-white/48">
          <span>Extra collection insights could not be loaded.</span>
          <button
            type="button"
            onClick={retry}
            className="min-h-9 shrink-0 rounded-lg border border-white/10 px-3 font-bold text-white/72"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
