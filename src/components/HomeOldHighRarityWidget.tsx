"use client";

import Link from "next/link";
import { ChevronRight, Clock3, Gem, History, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import CachedImage from "@/components/CachedImage";
import { useHomeItemDetails } from "@/components/HomeItemDetailProvider";
import type { HomeWidgetViewMode } from "@/lib/dashboard-module-preferences";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import { formatCollectionCurrency } from "@/lib/collection";
import type { OlderHighRarityValuePayload } from "@/lib/signal-radar-progressive";

type LoadState = "loading" | "ready" | "error";

const LIST_TILE_CLASS =
  "group grid min-w-0 grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-amber-300/12 bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.58),rgb(var(--dc-surface-primary-rgb)/0.72))] px-2.5 py-2 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition hover:-translate-y-px hover:border-amber-300/30";

function ageLabel(signal: ExternalCardSignal): string {
  const age = signal.olderHighRarityValue?.ageYears;
  return age == null ? "5+ years" : `${age.toFixed(age % 1 === 0 ? 0 : 1)} years`;
}

function cohortLabel(signal: ExternalCardSignal): string {
  const cohort = signal.olderHighRarityValue?.rarityCohortSize;
  return cohort == null ? "Small rarity tier" : `${cohort} in rarity tier`;
}

function WidgetSkeleton() {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-56 animate-pulse rounded-xl border border-white/6 bg-white/[0.035]" />
      ))}
    </div>
  );
}

export function HomeOldHighRarityWidgetContent({
  signals,
  total,
  viewAllHref,
  viewMode,
  compact,
}: {
  signals: ExternalCardSignal[];
  total: number;
  viewAllHref: string;
  viewMode: HomeWidgetViewMode;
  compact: boolean;
}) {
  const { openingCardId, openCard } = useHomeItemDetails();
  const gridView = viewMode === "grid";
  const visibleItems = signals.slice(0, gridView ? (compact ? 6 : 12) : 6);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="home-widget-heading-icon home-widget-heading-icon--heritage">
            <Gem className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="home-widget-eyebrow home-widget-eyebrow--heritage text-[9px] font-black uppercase tracking-[0.14em]">
              Collector value watch
            </p>
            <h2 className="mt-0.5 truncate text-base font-black tracking-tight text-white">
              Old High-Rarity
            </h2>
          </div>
        </div>
        <Link
          href={viewAllHref}
          prefetch={false}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-amber-300/14 bg-amber-300/[0.055] px-2.5 text-[10px] font-bold text-amber-100/80 transition-colors hover:border-amber-300/28 hover:text-amber-50"
        >
          {total.toLocaleString("en-US")}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em]">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/14 bg-amber-300/[0.055] px-2 py-1 text-amber-100/72">
          <Clock3 className="h-3 w-3" /> 5+ years
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-white/46">
          <Sparkles className="h-3 w-3" /> Strict chase rarity
        </span>
        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-white/46">
          €15–€600 raw
        </span>
      </div>

      {visibleItems.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-amber-300/12 px-3 py-6 text-center text-[11px] font-semibold text-white/38">
          No qualifying older high-rarity cards are available yet.
        </div>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((signal) => (
            <button
              key={signal.cardId}
              type="button"
              onClick={() => void openCard(signal.cardId)}
              aria-busy={openingCardId === signal.cardId}
              className="home-preview-tile home-preview-tile--heritage group flex min-w-0 flex-col rounded-xl border p-2 text-left transition hover:-translate-y-0.5"
            >
              <span className="home-preview-tile__media home-preview-tile__media--card">
                <span className="home-preview-tile__art home-preview-tile__art--card">
                  {signal.imageUrl ? (
                    <CachedImage
                      sourceUrl={signal.imageUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 145px, 190px"
                      className="object-contain"
                    />
                  ) : (
                    <Gem className="h-7 w-7 text-amber-200/55" aria-hidden="true" />
                  )}
                </span>
              </span>
              <span className="mt-2 min-w-0">
                <span className="line-clamp-2 text-[14px] font-black leading-[1.2] text-white/92 group-hover:text-white">
                  {signal.name}
                </span>
                <span className="mt-1 line-clamp-1 text-[10.5px] font-semibold text-white/45">
                  {signal.episodeCode ?? signal.episodeName} · {signal.rarity ?? "High rarity"}
                </span>
              </span>
              <span className="mt-2 grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-amber-300/10 pt-2">
                <span className="min-w-0">
                  <span className="block truncate text-[9px] font-black uppercase tracking-[0.07em] text-amber-100/48">
                    {ageLabel(signal)} old
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] font-semibold text-white/32">
                    {cohortLabel(signal)}
                  </span>
                </span>
                <span className="home-preview-tile__metric rounded-full px-2 py-1 text-[12px] font-black tabular-nums">
                  {formatCollectionCurrency(signal.currentPrice ?? 0)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((signal) => (
            <button
              key={signal.cardId}
              type="button"
              onClick={() => void openCard(signal.cardId)}
              aria-busy={openingCardId === signal.cardId}
              className={LIST_TILE_CLASS}
            >
              <span className="relative flex h-11 w-10 items-center justify-center overflow-hidden rounded-lg bg-amber-300/[0.045]">
                {signal.imageUrl ? (
                  <CachedImage sourceUrl={signal.imageUrl} alt="" fill sizes="40px" className="object-contain" />
                ) : (
                  <Gem className="h-4 w-4 text-amber-200/55" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black text-white/90">{signal.name}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/40">
                  {ageLabel(signal)} · {signal.rarity ?? "High rarity"} · {cohortLabel(signal)}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-[13px] font-black tabular-nums text-amber-100">
                  {formatCollectionCurrency(signal.currentPrice ?? 0)}
                </span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold text-white/34">
                  <History className="h-3 w-3" /> {signal.olderHighRarityValue?.historyPoints ?? 0}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function HomeOldHighRarityWidget({
  endpoint,
  viewAllHref,
  viewMode = "grid",
  compact = false,
}: {
  endpoint: string;
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
  compact?: boolean;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [payload, setPayload] = useState<OlderHighRarityValuePayload | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState("loading");
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(endpoint, {
        cache: "default",
        credentials: "same-origin",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          return (await response.json()) as OlderHighRarityValuePayload;
        })
        .then((nextPayload) => {
          if (controller.signal.aborted) return;
          setPayload(nextPayload);
          setState("ready");
        })
        .catch(() => {
          if (!controller.signal.aborted) setState("error");
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, endpoint]);

  return (
    <section className="binder-panel home-widget-panel home-widget-panel--heritage h-full rounded-[var(--ui-page-header-radius)] p-3">
      {state === "ready" && payload ? (
        <HomeOldHighRarityWidgetContent
          signals={payload.signals}
          total={payload.total}
          viewAllHref={viewAllHref}
          viewMode={viewMode}
          compact={compact}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="home-widget-heading-icon home-widget-heading-icon--heritage">
                <Gem className="h-4 w-4" />
              </span>
              <div>
                <p className="home-widget-eyebrow home-widget-eyebrow--heritage text-[9px] font-black uppercase tracking-[0.14em]">
                  Collector value watch
                </p>
                <h2 className="mt-0.5 text-base font-black tracking-tight text-white">Old High-Rarity</h2>
              </div>
            </div>
          </div>
          {state === "error" ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.04] px-3 py-4">
              <span className="text-[11px] font-semibold text-white/45">The old-card shortlist could not be loaded.</span>
              <button type="button" onClick={retry} className="min-h-9 rounded-lg border border-amber-300/16 px-3 text-[10px] font-black text-amber-100">
                Retry
              </button>
            </div>
          ) : (
            <WidgetSkeleton />
          )}
        </>
      )}
    </section>
  );
}
