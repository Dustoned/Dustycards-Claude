"use client";

import { ChevronDown } from "lucide-react";

export interface CardDetailGradeOption {
  value: string;
  label: string;
  detail?: string | null;
}

export function CardDetailMarketControls({
  mode,
  gradedAvailable,
  onModeChange,
  gradeOptions = [],
  selectedGrade,
  onGradeChange,
}: {
  mode: "raw" | "graded";
  gradedAvailable: boolean;
  onModeChange: (mode: "raw" | "graded") => void;
  gradeOptions?: CardDetailGradeOption[];
  selectedGrade?: string | null;
  onGradeChange?: (value: string) => void;
}) {
  const activeGrade =
    gradeOptions.find((option) => option.value === selectedGrade) ?? gradeOptions[0] ?? null;
  const showGradePicker = mode === "graded" && activeGrade != null;

  return (
    <div
      className="flex min-h-11 max-w-full flex-wrap items-center gap-2"
      data-card-detail-market-mode={mode}
    >
      <div className="card-detail-market-mode-toggle grid h-11 w-[8.75rem] shrink-0 grid-cols-2 rounded-xl border border-white/10 bg-black/25 p-0.5 sm:w-[9.5rem] lg:w-[10.25rem]">
        {(["raw", "graded"] as const).map((option) => {
          const disabled = option === "graded" && !gradedAvailable;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
              className={`card-detail-market-mode-option min-h-10 rounded-lg px-3 text-sm font-bold transition ${
                mode === option
                  ? "bg-violet-600 text-white shadow-sm"
                  : disabled
                    ? "cursor-not-allowed text-white/18"
                    : "text-white/48 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {option === "raw" ? "Raw" : "Graded"}
            </button>
          );
        })}
      </div>

      {showGradePicker ? (
        <label
          className="relative flex h-11 min-w-[8.75rem] max-w-[11.5rem] flex-1 cursor-pointer items-center rounded-xl border border-violet-300/16 bg-violet-400/[0.055] pl-3 pr-9 text-left transition hover:border-violet-200/28 hover:bg-violet-400/[0.09] focus-within:border-violet-200/38 focus-within:ring-2 focus-within:ring-violet-300/45"
          data-card-detail-grade-control
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-4 text-white/88">
              {activeGrade.label}
            </span>
            {activeGrade.detail ? (
              <span className="mt-0.5 block truncate text-[11px] font-semibold leading-3 text-white/38">
                {activeGrade.detail}
              </span>
            ) : null}
          </span>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-violet-100/56" />
          <select
            aria-label="Select graded slab"
            value={activeGrade.value}
            onChange={(event) => onGradeChange?.(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {gradeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#111214] text-white">
                {option.label}{option.detail ? ` - ${option.detail}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
