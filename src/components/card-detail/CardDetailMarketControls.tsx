"use client";

import { ChevronDown } from "lucide-react";

export interface CardDetailGradeOption {
  value: string;
  label: string;
  detail?: string | null;
}

export function CardDetailGradeSelect({
  options,
  selectedGrade,
  onGradeChange,
}: {
  options: CardDetailGradeOption[];
  selectedGrade?: string | null;
  onGradeChange?: (value: string) => void;
}) {
  const activeGrade =
    options.find((option) => option.value === selectedGrade) ?? options[0] ?? null;

  if (!activeGrade) return null;

  return (
    <label
      className="relative inline-flex h-11 w-[5.75rem] max-w-full cursor-pointer items-center rounded-xl border border-white/10 bg-black/25 pl-2.5 pr-7 text-left text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/18 hover:bg-white/[0.045] hover:text-white focus-within:border-violet-300/34 focus-within:ring-2 focus-within:ring-violet-300/35"
      data-card-detail-grade-control
      data-card-detail-chart-series-control="grade"
    >
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-black leading-4">
          {activeGrade.label}
        </span>
        {activeGrade.detail ? (
          <span className="block truncate text-[9px] font-semibold leading-3 tracking-[-0.01em] text-white/42">
            {activeGrade.detail}
          </span>
        ) : null}
      </span>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-white/38" />
      <select
        aria-label="Select graded slab"
        value={activeGrade.value}
        onChange={(event) => onGradeChange?.(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--dc-surface-primary)] text-[var(--dc-text-primary)]">
            {option.label}{option.detail ? ` - ${option.detail}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CardDetailMarketControls({
  mode,
  gradedAvailable,
  onModeChange,
}: {
  mode: "raw" | "graded";
  gradedAvailable: boolean;
  onModeChange: (mode: "raw" | "graded") => void;
}) {
  return (
    <div
      className="max-w-full"
      data-card-detail-market-mode={mode}
    >
      <div
        className="card-detail-market-mode-toggle flex h-11 max-w-full shrink-0 items-center gap-1"
        data-card-detail-market-toggle
      >
        {(["raw", "graded"] as const).map((option) => {
          const disabled = option === "graded" && !gradedAvailable;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
              className={`card-detail-market-mode-option inline-flex min-h-10 min-w-[4.85rem] items-center justify-center rounded-xl border px-2 text-center text-[11px] font-bold leading-none transition-colors ${
                mode === option
                  ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)] shadow-[inset_0_1px_0_var(--dc-sheen)]"
                  : disabled
                    ? "cursor-not-allowed border-[rgb(var(--dc-border-rgb)/0.5)] bg-transparent text-[rgb(var(--dc-text-primary-rgb)/0.2)]"
                    : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"
              }`}
            >
              {option === "raw" ? "Raw" : "Graded"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
