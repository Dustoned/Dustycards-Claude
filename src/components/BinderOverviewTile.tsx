"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCachedImageUrl } from "@/lib/image-cache";

interface BinderOverviewItem {
  id: string;
  name: string;
  subtitle: string;
  progressLabel: string;
  ownedCards: number;
  totalCards: number | null;
  completionPct: number | null;
  missingCards: number | null;
  currentValue: number;
  investment: number;
  pnl: number;
  recentChange: number | null;
  recentChangePct: number | null;
  recentChangeLabel: string | null;
  accent_color: string | null;
  icon_name: string | null;
  episode: {
    logo_url: string | null;
  } | null;
}

function formatSignedCurrency(value: number): string {
  if (value === 0) return formatCollectionCurrency(0);
  return `${value > 0 ? "+" : "-"}${formatCollectionCurrency(Math.abs(value))}`;
}

function formatSignedPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function moveToneClass(value: number | null): string {
  if (value == null || value === 0) return "text-white/45";
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function moveBadgeClass(value: number | null): string {
  if (value == null || value === 0) {
    return "border-white/10 bg-white/[0.045] text-white/55";
  }

  return value > 0
    ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-200"
    : "border-rose-400/18 bg-rose-400/10 text-rose-200";
}

export default function BinderOverviewTile({
  binder,
}: {
  binder: BinderOverviewItem;
}) {
  const accentColor = binder.accent_color;
  const progressWidth = binder.completionPct == null
    ? null
    : `${Math.min(Math.max(binder.completionPct, 0), 100)}%`;
  const roiPct = binder.investment > 0 ? (binder.pnl / binder.investment) * 100 : null;
  const recentMoveLabel =
    binder.recentChange == null
      ? null
      : binder.recentChange === 0
        ? "Flat"
        : [formatSignedCurrency(binder.recentChange), formatSignedPercent(binder.recentChangePct)]
            .filter(Boolean)
            .join(" ");
  const cardCountLabel =
    binder.totalCards == null
      ? `${binder.ownedCards.toLocaleString("en-US")} cards`
      : `${binder.ownedCards.toLocaleString("en-US")} / ${binder.totalCards.toLocaleString("en-US")}`;
  const completionLabel = formatPercent(binder.completionPct);
  const missingLabel =
    binder.missingCards != null
      ? binder.missingCards > 0
        ? `${binder.missingCards.toLocaleString("en-US")} missing`
        : "Complete"
      : null;
  const pnlLabel =
    binder.pnl === 0
      ? "No P&L"
      : `${binder.pnl > 0 ? "+" : "-"}${formatCollectionCurrency(Math.abs(binder.pnl))} P&L`;
  const roiLabel = roiPct == null ? null : `${formatSignedPercent(roiPct)} ROI`;
  const secondaryChip =
    roiLabel ?? (binder.investment > 0 ? `Paid ${formatCollectionCurrency(binder.investment)}` : pnlLabel);
  const valueSubtitle =
    binder.recentChange == null
      ? "Current value"
      : binder.recentChange === 0
        ? "No latest move"
        : binder.recentChangeLabel ?? "Latest move";
  const tileStyle = {
    "--binder-accent": accentColor ?? "#8b5cf6",
  } as CSSProperties;

  return (
    <Link
      href={`/binders/${binder.id}`}
      prefetch={false}
      className="binder-panel binder-overview-tile group relative flex h-full flex-col gap-2.5 overflow-hidden rounded-[18px] p-3 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 max-[640px]:gap-2 max-[640px]:rounded-xl max-[640px]:p-2"
      style={tileStyle}
    >
      {binder.accent_color && (
        <div
          className="absolute inset-x-4 top-0 h-0.5 rounded-b-full opacity-80"
          style={{ backgroundColor: accentColor ?? undefined }}
        />
      )}

      <div
        className="binder-overview-media relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-[14px] border border-white/8 sm:aspect-[2.25/1]"
      >
        {binder.episode?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getCachedImageUrl(binder.episode.logo_url) ?? binder.episode.logo_url}
            alt={binder.name}
            className="h-full w-full object-contain p-2 max-[640px]:p-1.5 sm:p-2.5"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white/70 max-[640px]:h-14 max-[640px]:w-14"
            style={accentColor ? { color: accentColor } : undefined}
          >
            <CollectionBinderIcon iconName={binder.icon_name} className="h-8 w-8 max-[640px]:h-7 max-[640px]:w-7" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2 max-[640px]:space-y-1.5">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-tight text-white max-[640px]:text-[12px]">
            {binder.name}
          </h3>
          <p className="mt-1 truncate text-xs font-medium text-white/45 max-[640px]:mt-0.5 max-[640px]:text-[10px]">
            {binder.subtitle}
          </p>
        </div>

        <div className="space-y-1.5 max-[640px]:space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-white/68 max-[640px]:text-[10px]">
            <span className="truncate">{cardCountLabel}</span>
            {completionLabel ? <span className="shrink-0 text-white/45">{completionLabel}</span> : null}
          </div>
          {progressWidth ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8 max-[640px]:h-1">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{
                  width: progressWidth,
                  background: accentColor
                    ? `linear-gradient(90deg, ${accentColor}, #a78bfa)`
                    : undefined,
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-2.5 py-2 max-[640px]:rounded-lg max-[640px]:px-2 max-[640px]:py-1.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/32 max-[640px]:text-[8px]">
              Value
            </p>
            <p className="mt-0.5 truncate text-[15px] font-black tracking-tight text-white max-[640px]:text-[12px]">
              {formatCollectionCurrency(binder.currentValue)}
            </p>
          </div>
          {recentMoveLabel ? (
            <div
              className={`max-w-[48%] shrink-0 rounded-full border px-2.5 py-1 text-right text-[10px] font-black leading-none max-[640px]:px-2 max-[640px]:text-[9px] ${moveBadgeClass(
                binder.recentChange
              )}`}
              title={valueSubtitle}
            >
              <span className="block truncate">{recentMoveLabel}</span>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5 max-[640px]:hidden">
          {missingLabel ? (
            <span className="rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold text-white/58 max-[640px]:px-2 max-[640px]:text-[9px]">
              {missingLabel}
            </span>
          ) : null}
          {secondaryChip ? (
            <span
              className={`rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold max-[640px]:px-2 max-[640px]:text-[9px] ${moveToneClass(
                roiPct ?? binder.pnl
              )}`}
            >
              {secondaryChip}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
