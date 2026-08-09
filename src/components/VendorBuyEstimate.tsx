"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

const RATE_OPTIONS = [60, 65, 70, 75, 80, 85] as const;
const DEFAULT_RATE = 70;
const VENDOR_RATE_STORAGE_KEY = "dustycards.sale.vendor-rate.v1";

function normalizeRate(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return RATE_OPTIONS.includes(parsed as (typeof RATE_OPTIONS)[number])
    ? parsed
    : DEFAULT_RATE;
}

export default function VendorBuyEstimate({
  estimatedValue,
  sourceValue = null,
  sourceCurrency = null,
  className = "",
}: {
  estimatedValue: number;
  sourceValue?: number | null;
  sourceCurrency?: "USD" | null;
  className?: string;
}) {
  const [rate, setRate] = useState(DEFAULT_RATE);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setRate(normalizeRate(window.localStorage.getItem(VENDOR_RATE_STORAGE_KEY)));
      } catch {
        // Keep the default when browser storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const vendorValue = useMemo(
    () => Number(((estimatedValue * rate) / 100).toFixed(2)),
    [estimatedValue, rate]
  );
  const sourceVendorValue = useMemo(
    () => sourceValue == null ? null : Number(((sourceValue * rate) / 100).toFixed(2)),
    [rate, sourceValue]
  );

  function handleRateChange(nextRate: string) {
    const normalized = normalizeRate(nextRate);
    setRate(normalized);
    try {
      window.localStorage.setItem(VENDOR_RATE_STORAGE_KEY, String(normalized));
    } catch {
      // The current selection still works for this session.
    }
  }

  return (
    <div className={`mt-3 rounded-2xl border border-white/8 bg-black/18 p-2.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
          Vendor %
        </label>
        <select
          value={rate}
          onChange={(event) => handleRateChange(event.target.value)}
          className="h-8 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[var(--dc-surface-elevated)] px-2.5 text-xs font-black tabular-nums text-[var(--dc-text-primary)] outline-none transition-colors hover:border-[var(--dc-border-hover)] focus:border-[rgb(var(--dc-success-rgb)/0.55)]"
          aria-label="Vendor buy percentage"
        >
          {RATE_OPTIONS.map((option) => (
            <option key={option} value={option} className="bg-[var(--dc-surface-primary)] text-[var(--dc-text-primary)]">
              {option}%
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
        <p className="truncate text-[11px] font-semibold text-white/42">Vendor offer</p>
        <p className="shrink-0 text-lg font-black tabular-nums text-emerald-300">
          {sourceCurrency === "USD" && sourceVendorValue != null
            ? `${formatCurrency(sourceVendorValue, "USD")} = ${formatCurrency(vendorValue, "EUR")}`
            : formatCurrency(vendorValue, "EUR")}
        </p>
      </div>
    </div>
  );
}
