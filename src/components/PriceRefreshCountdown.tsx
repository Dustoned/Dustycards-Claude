"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatPriceRefreshedAt,
  formatRefreshCountdown,
  getPriceRefreshInfo,
  type PriceRefreshTier,
} from "@/lib/price-refresh";

interface Props {
  rarity: string | null;
  priceFetchedAt: string | null;
  priceSourceStatus?: string | null;
  priceSourceCheckedAt?: string | null;
  className?: string;
  compact?: boolean;
  variant?: "panel" | "strip";
}

const TIER_STYLES: Record<PriceRefreshTier, string> = {
  base: "bg-slate-500/14 text-slate-300",
  low: "bg-emerald-500/14 text-emerald-300",
  medium: "bg-amber-500/14 text-amber-300",
  high: "bg-fuchsia-500/14 text-fuchsia-300",
};

const TIER_DOT_STYLES: Record<PriceRefreshTier, string> = {
  base: "bg-slate-300",
  low: "bg-emerald-300",
  medium: "bg-amber-300",
  high: "bg-fuchsia-300",
};

export default function PriceRefreshCountdown({
  rarity,
  priceFetchedAt,
  priceSourceStatus,
  priceSourceCheckedAt,
  className,
  compact = false,
  variant = "panel",
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const refreshInfo = useMemo(
    () => getPriceRefreshInfo(rarity, priceFetchedAt, now),
    [now, priceFetchedAt, rarity]
  );

  const lastRefreshedAt = formatPriceRefreshedAt(priceFetchedAt);
  const lastSourceCheckAt = formatPriceRefreshedAt(priceSourceCheckedAt ?? null);
  const overdueMs =
    refreshInfo.hasFetchedAt && refreshInfo.nextRefreshAt != null
      ? Math.max(0, now - refreshInfo.nextRefreshAt)
      : 0;

  const summary = !refreshInfo.hasFetchedAt
    ? priceSourceStatus === "unavailable"
      ? "No source price available right now"
      : refreshInfo.tier === "base"
        ? "Waiting for first base price sync"
        : "Waiting for first price sync"
    : !refreshInfo.autoRefreshEnabled
      ? "Base price captured; refresh manually when needed"
    : refreshInfo.due
      ? `Refresh overdue by ${formatRefreshCountdown(overdueMs)}`
      : `Next refresh in ${formatRefreshCountdown(refreshInfo.remainingMs)}`;

  const compactSummary = !refreshInfo.hasFetchedAt
    ? priceSourceStatus === "unavailable"
      ? "No source price available"
      : refreshInfo.tier === "base"
        ? "Waiting for first base sync"
        : "Waiting for first sync"
    : !refreshInfo.autoRefreshEnabled
      ? "Manual after base sync"
    : refreshInfo.due
      ? `Overdue ${formatRefreshCountdown(overdueMs)}`
      : `Next refresh ${formatRefreshCountdown(refreshInfo.remainingMs)}`;

  const cadenceText = refreshInfo.autoRefreshEnabled
    ? refreshInfo.cadenceLabel
    : refreshInfo.hasFetchedAt
      ? "Manual only"
      : "Pending first sync";
  const compactDetail = lastRefreshedAt
    ? `${refreshInfo.autoRefreshEnabled ? "Last" : "Captured"} ${lastRefreshedAt}`
    : lastSourceCheckAt
      ? `Last source check ${lastSourceCheckAt}`
      : null;
  const shortCadenceText = refreshInfo.autoRefreshEnabled
    ? refreshInfo.tier === "high"
      ? "12h"
      : "24h"
    : refreshInfo.hasFetchedAt
      ? "Manual"
      : "Pending";

  if (compact && variant === "strip") {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-white/[0.055] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md ${
          className ?? ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full shadow-[0_0_14px_currentColor] ${
              TIER_DOT_STYLES[refreshInfo.tier]
            }`}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold leading-tight text-white/84">
              {compactSummary}
            </p>
            {compactDetail && (
              <p className="mt-0.5 truncate text-[10px] font-medium leading-tight text-white/42">
                {compactDetail}
              </p>
            )}
          </div>

          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase leading-none tracking-[0.12em] ${
              TIER_STYLES[refreshInfo.tier]
            }`}
          >
            {shortCadenceText}
          </span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.035))] px-4 py-4 backdrop-blur-md ${
          className ?? ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${
                  TIER_STYLES[refreshInfo.tier]
                }`}
              >
                {refreshInfo.tierLabel}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
                {cadenceText}
              </span>
            </div>

            <p className="mt-3 text-base font-semibold text-white/86">{compactSummary}</p>

            {compactDetail && <p className="mt-1.5 text-sm text-white/42">{compactDetail}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 backdrop-blur-md ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            TIER_STYLES[refreshInfo.tier]
          }`}
        >
          {refreshInfo.tierLabel}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/34">
          {refreshInfo.cadenceLabel}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-white/82">{summary}</p>
      {lastRefreshedAt && (
        <p className="mt-1 text-xs text-white/44">
          {refreshInfo.autoRefreshEnabled ? "Last refresh" : "Base price captured"} {lastRefreshedAt}
        </p>
      )}
      {!lastRefreshedAt && lastSourceCheckAt && (
        <p className="mt-1 text-xs text-white/44">Last source check {lastSourceCheckAt}</p>
      )}
    </div>
  );
}
