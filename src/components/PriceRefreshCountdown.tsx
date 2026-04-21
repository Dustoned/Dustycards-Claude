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
}

const TIER_STYLES: Record<PriceRefreshTier, string> = {
  base: "bg-slate-500/14 text-slate-300",
  low: "bg-emerald-500/14 text-emerald-300",
  medium: "bg-amber-500/14 text-amber-300",
  high: "bg-fuchsia-500/14 text-fuchsia-300",
};

export default function PriceRefreshCountdown({
  rarity,
  priceFetchedAt,
  priceSourceStatus,
  priceSourceCheckedAt,
  className,
  compact = false,
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

  if (compact) {
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

    return (
      <div
        className={`rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.035))] px-3.5 py-3 backdrop-blur-md ${
          className ?? ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  TIER_STYLES[refreshInfo.tier]
                }`}
              >
                {refreshInfo.tierLabel}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">
                {cadenceText}
              </span>
            </div>

            <p className="mt-2 text-sm font-semibold text-white/86">{compactSummary}</p>

            {compactDetail && <p className="mt-1 text-[11px] text-white/42">{compactDetail}</p>}
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
