"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

const RATE_OPTIONS = [60, 65, 70, 75, 80, 85] as const;
const DEFAULT_RATE = 70;

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
  className = "",
}: {
  estimatedValue: number;
  className?: string;
}) {
  const [rate, setRate] = useState(DEFAULT_RATE);

  const vendorValue = useMemo(
    () => Number(((estimatedValue * rate) / 100).toFixed(2)),
    [estimatedValue, rate]
  );

  function handleRateChange(nextRate: string) {
    setRate(normalizeRate(nextRate));
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
          className="h-8 rounded-xl border border-white/10 bg-[#111116] px-2.5 text-xs font-black tabular-nums text-white outline-none transition-colors hover:border-white/18 focus:border-emerald-300/45"
          aria-label="Vendor buy percentage"
        >
          {RATE_OPTIONS.map((option) => (
            <option key={option} value={option} className="bg-[#080808] text-white">
              {option}%
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
        <p className="truncate text-[11px] font-semibold text-white/42">Vendor offer</p>
        <p className="shrink-0 text-lg font-black tabular-nums text-emerald-300">
          {formatCurrency(vendorValue, "EUR")}
        </p>
      </div>
    </div>
  );
}
