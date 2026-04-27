"use client";

import Link from "next/link";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import { formatCollectionCurrency } from "@/lib/collection";

interface BinderOverviewItem {
  id: string;
  name: string;
  subtitle: string;
  progressLabel: string;
  currentValue: number;
  pnl: number;
  accent_color: string | null;
  icon_name: string | null;
  episode: {
    logo_url: string | null;
  } | null;
}

export default function BinderOverviewTile({
  binder,
}: {
  binder: BinderOverviewItem;
}) {
  const accentColor = binder.accent_color;

  return (
    <Link
      href={`/binders/${binder.id}`}
      prefetch={false}
      className="glass group relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl p-5 shadow-lg shadow-black/5 transition-transform hover:scale-[1.01] hover:bg-white/8 dark:hover:bg-white/6"
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
        className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]"
        style={
          binder.accent_color
            ? { boxShadow: `inset 0 0 0 1px ${binder.accent_color}24` }
            : undefined
        }
      >
        {binder.episode?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={binder.episode.logo_url}
            alt={binder.name}
            className="h-full w-full object-contain p-5 sm:p-6"
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
        <h3 className="truncate text-xl font-bold text-gray-900 dark:text-white">{binder.name}</h3>
        <p className="mt-1 truncate text-sm text-gray-500 dark:text-white/50">{binder.subtitle}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: "Progress", value: binder.progressLabel },
          { label: "Value", value: formatCollectionCurrency(binder.currentValue) },
          {
            label: "P&L",
            value: `${binder.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(binder.pnl)}`,
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-black/8 bg-black/[0.03] px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
              {metric.label}
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}
