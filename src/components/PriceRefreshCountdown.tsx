"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatPriceRefreshedAt,
  formatRefreshCountdown,
  getPriceRefreshInfo,
  type PriceRefreshTier,
} from "@/lib/price-refresh";
import { CARDMARKET_NO_EN_NM_PRICE_STATUS } from "@/lib/price-source-status";

interface Props {
  rarity: string | null;
  priceFetchedAt: string | null;
  priceSourceStatus?: string | null;
  priceSourceCheckedAt?: string | null;
  className?: string;
  compact?: boolean;
  variant?: "panel" | "micro";
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

function formatMicroCountdown(remainingMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(remainingMs / (60 * 1000)));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

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
  const hasNoCardMarketEnglishNmListings =
    priceSourceStatus === CARDMARKET_NO_EN_NM_PRICE_STATUS;

  const summary = hasNoCardMarketEnglishNmListings
    ? "No EN/NM listings"
    : !refreshInfo.hasFetchedAt
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

  const compactSummary = hasNoCardMarketEnglishNmListings
    ? "No EN/NM listings"
    : !refreshInfo.hasFetchedAt
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

  if (compact && variant === "micro") {
    const titleText = [compactSummary, compactDetail, cadenceText].filter(Boolean).join(" · ");
    const microSummary = hasNoCardMarketEnglishNmListings
      ? "No EN/NM listings"
      : !refreshInfo.hasFetchedAt
        ? priceSourceStatus === "unavailable"
        ? "No source"
        : "Pending sync"
      : !refreshInfo.autoRefreshEnabled
        ? "Manual"
        : refreshInfo.due
          ? `Overdue ${formatMicroCountdown(overdueMs)}`
          : formatMicroCountdown(refreshInfo.remainingMs);

    return (
      <div
        className={`flex min-w-0 items-center gap-1.5 text-[10px] font-medium leading-none text-white/42 ${
          className ?? ""
        }`}
        title={titleText}
        aria-label={titleText}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIER_DOT_STYLES[refreshInfo.tier]}`}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">
          {microSummary}
        </span>
        {refreshInfo.autoRefreshEnabled && (
          <>
            <span className="shrink-0 text-white/20" aria-hidden="true">
              /
            </span>
            <span className="shrink-0 text-[9px] font-semibold tracking-[0.08em] text-white/34">
              {shortCadenceText}
            </span>
          </>
        )}
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
