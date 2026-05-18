"use client";

import Link from "next/link";
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

function formatCompletion(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}% complete`;
}

function moveToneClass(value: number | null): string {
  if (value == null || value === 0) return "text-gray-500 dark:text-white/45";
  return value > 0
    ? "text-emerald-600 dark:text-emerald-300"
    : "text-rose-600 dark:text-rose-300";
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
      ? "No recent trend"
      : binder.recentChange === 0
        ? "Flat latest move"
        : [
            formatSignedCurrency(binder.recentChange),
            formatSignedPercent(binder.recentChangePct),
            binder.recentChangeLabel,
          ]
            .filter(Boolean)
            .join(" ");
  const progressSubLabel =
    binder.completionPct != null
      ? [
          formatCompletion(binder.completionPct),
          binder.missingCards != null ? `${binder.missingCards} missing` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : `${binder.ownedCards.toLocaleString("en-US")} cards tracked`;
  const metrics = [
    {
      label: binder.totalCards == null ? "Cards" : "Progress",
      mobileLabel: binder.totalCards == null ? "Cards" : "Done",
      value: binder.progressLabel,
      subValue: progressSubLabel,
      subClassName: "text-gray-500 dark:text-white/45",
      mobileHidden: binder.totalCards != null,
    },
    {
      label: "Value",
      mobileLabel: "Value",
      value: formatCollectionCurrency(binder.currentValue),
      subValue: recentMoveLabel,
      subClassName: moveToneClass(binder.recentChange),
    },
    {
      label: "P&L",
      mobileLabel: "P&L",
      value: `${binder.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(binder.pnl)}`,
      subValue: roiPct == null ? "No spend base" : `${formatSignedPercent(roiPct)} ROI`,
      subClassName: moveToneClass(binder.pnl),
    },
  ];

  return (
    <Link
      href={`/binders/${binder.id}`}
      prefetch={false}
      className="glass group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl p-4 shadow-lg shadow-black/5 transition-transform hover:scale-[1.01] hover:bg-white/8 max-[640px]:gap-2.5 max-[640px]:rounded-2xl max-[640px]:p-3 dark:hover:bg-white/6"
      style={
        binder.accent_color
          ? { boxShadow: `inset 0 0 0 1px ${binder.accent_color}2f` }
          : undefined
      }
    >
      {binder.accent_color && (
        <div
          className="absolute inset-x-5 top-0 h-1 rounded-b-full"
          style={{ backgroundColor: accentColor ?? undefined }}
        />
      )}

      <div
        className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]"
        style={
          binder.accent_color
            ? { boxShadow: `inset 0 0 0 1px ${binder.accent_color}24` }
            : undefined
        }
      >
        {binder.episode?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getCachedImageUrl(binder.episode.logo_url) ?? binder.episode.logo_url}
            alt={binder.name}
            className="h-full w-full object-contain p-4 max-[640px]:p-2.5 sm:p-5"
          />
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-3xl border border-black/8 bg-white/80 text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-white/70"
            style={accentColor ? { color: accentColor } : undefined}
          >
            <CollectionBinderIcon iconName={binder.icon_name} className="h-9 w-9" />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-xl font-bold text-gray-900 max-[640px]:text-[13px] dark:text-white">{binder.name}</h3>
        <p className="mt-1 truncate text-sm text-gray-500 max-[640px]:mt-0.5 max-[640px]:text-[10px] dark:text-white/50">{binder.subtitle}</p>
        {progressWidth && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/8">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{
                width: progressWidth,
                background: accentColor
                  ? `linear-gradient(90deg, ${accentColor}, #34d399)`
                  : undefined,
              }}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-xs max-[640px]:grid-cols-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`min-w-0 rounded-xl border border-black/8 bg-black/[0.03] px-2.5 py-2 max-[640px]:px-2.5 max-[640px]:py-2 dark:border-white/8 dark:bg-white/[0.04] ${
              metric.mobileHidden ? "max-[640px]:hidden" : ""
            }`}
            title={`${metric.label}: ${metric.value}${metric.subValue ? ` - ${metric.subValue}` : ""}`}
          >
            <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 max-[640px]:text-[8px] max-[640px]:tracking-[0.08em] dark:text-white/35">
              <span className="max-[640px]:hidden">{metric.label}</span>
              <span className="hidden max-[640px]:inline">{metric.mobileLabel}</span>
            </p>
            <p className="mt-1.5 truncate text-[13px] font-semibold tracking-tight text-gray-900 max-[640px]:mt-1 max-[640px]:text-[12px] dark:text-white">
              {metric.value}
            </p>
            <p
              className={`mt-1 truncate text-[10px] font-medium leading-none max-[640px]:hidden ${metric.subClassName}`}
            >
              {metric.subValue}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}
