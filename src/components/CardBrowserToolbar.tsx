"use client";

import { type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

export interface CardBrowserToolbarOption {
  value: string;
  label: string;
  title?: string;
}

export interface CardBrowserToolbarFilterOption {
  key: string;
  label: string;
  active: boolean;
  count?: number;
  onToggle: () => void;
  className: string;
}

export interface CardBrowserToolbarFilterSection {
  key: string;
  title: string;
  summary: string;
  options: CardBrowserToolbarFilterOption[];
  emptyText?: string;
  className?: string;
}

export interface CardBrowserToolbarActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  resultLabel: string;
  sortSummary: string;
  priceSourceLabel?: string | null;
  viewOptions: CardBrowserToolbarOption[];
  activeView: string;
  onViewChange: (value: string) => void;
  sortOptions: CardBrowserToolbarOption[];
  activeSort: string;
  onSortChange: (value: string) => void;
  sizeOptions: CardBrowserToolbarOption[];
  activeSize: string;
  onSizeChange: (value: string) => void;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  filterBadgeCount: number;
  hasActiveFilters: boolean;
  onClearAll: () => void;
  activeFilters?: CardBrowserToolbarActiveFilter[];
  quickFilters?: CardBrowserToolbarFilterOption[];
  filterSections?: CardBrowserToolbarFilterSection[];
  selectionSlot?: ReactNode;
  warnings?: string[];
}

function metaChipClass(accent = false): string {
  return accent
    ? "inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300"
    : "inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55";
}

function actionButtonClass(active = false): string {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
      : "border-black/8 bg-white/70 text-gray-600 hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
  }`;
}

function sectionCardClass(): string {
  return "rounded-2xl border border-black/8 bg-white/72 px-3 py-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20";
}

function sectionLabelClass(): string {
  return "text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35";
}

function compactSegmentedShellClass(): string {
  return "inline-flex overflow-hidden rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]";
}

function segmentedButtonClass(active: boolean): string {
  return `px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
      : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
  }`;
}

function countBadgeClass(active: boolean): string {
  return `rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
    active
      ? "bg-white/18 text-current dark:bg-black/10"
      : "bg-black/6 text-gray-400 dark:bg-white/8 dark:text-white/35"
  }`;
}

function activeFilterChipClass(): string {
  return "inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-black/[0.035] px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white";
}

export default function CardBrowserToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  resultLabel,
  sortSummary,
  priceSourceLabel = null,
  viewOptions,
  activeView,
  onViewChange,
  sortOptions,
  activeSort,
  onSortChange,
  sizeOptions,
  activeSize,
  onSizeChange,
  filtersExpanded,
  onToggleFilters,
  filterBadgeCount,
  hasActiveFilters,
  onClearAll,
  activeFilters = [],
  quickFilters = [],
  filterSections = [],
  selectionSlot = null,
  warnings = [],
}: Props) {
  const normalizedPriceSourceLabel = priceSourceLabel?.trim().toLowerCase() ?? "";
  const normalizedSortSummary = sortSummary.trim().toLowerCase();
  const summaryLabel =
    normalizedPriceSourceLabel && normalizedSortSummary.startsWith(normalizedPriceSourceLabel)
      ? sortSummary
      : priceSourceLabel
        ? `${priceSourceLabel} ${sortSummary}`
        : sortSummary;
  const expandedGridClass =
    quickFilters.length > 0 && filterSections.length === 1
      ? "grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.7fr)]"
      : quickFilters.length === 0 && filterSections.length === 1
        ? "grid gap-3 xl:grid-cols-[minmax(0,1.6fr)]"
        : "grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]";

  return (
    <div className="glass mb-4 space-y-3 rounded-3xl border border-black/8 px-4 py-4 shadow-sm shadow-black/5 dark:border-white/8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/35" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-2xl border border-black/8 bg-white/78 py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/28 dark:focus:border-white/14"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-900 dark:text-white/35 dark:hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <span className={metaChipClass()}>{resultLabel}</span>
          <span className={metaChipClass()}>{summaryLabel}</span>
          <button
            type="button"
            onClick={onToggleFilters}
            className={actionButtonClass(filtersExpanded || filterBadgeCount > 0)}
            aria-pressed={filtersExpanded}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {filterBadgeCount > 0 && (
              <span className={countBadgeClass(filtersExpanded || filterBadgeCount > 0)}>
                {filterBadgeCount}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button type="button" onClick={onClearAll} className={actionButtonClass()}>
              Clear all
            </button>
          )}
          {selectionSlot}
        </div>
      </div>

      <section className={sectionCardClass()}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className={sectionLabelClass()}>View</p>
            <div className={compactSegmentedShellClass()}>
              {viewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={option.title}
                  onClick={() => onViewChange(option.value)}
                  className={segmentedButtonClass(activeView === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {sortOptions.length > 0 && (
            <>
              <div className="hidden h-5 w-px bg-black/8 dark:bg-white/8 md:block" />

              <div className="flex flex-wrap items-center gap-2">
                <p className={sectionLabelClass()}>Sort</p>
                <div className={compactSegmentedShellClass()}>
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      title={option.title}
                      onClick={() => onSortChange(option.value)}
                      className={segmentedButtonClass(activeSort === option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {sizeOptions.length > 0 && (
            <>
              <div className="hidden h-5 w-px bg-black/8 dark:bg-white/8 md:block" />

              <div className="flex flex-wrap items-center gap-2">
                <p className={sectionLabelClass()}>Size</p>
                <div className={compactSegmentedShellClass()}>
                  {sizeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      title={option.title}
                      onClick={() => onSizeChange(option.value)}
                      className={segmentedButtonClass(activeSize === option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={filter.onRemove}
              className={activeFilterChipClass()}
            >
              <span>{filter.label}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {filtersExpanded && (
        <div className={expandedGridClass}>
          {quickFilters.length > 0 && (
            <section className={sectionCardClass()}>
              <div className="flex items-center justify-between gap-2">
                <p className={sectionLabelClass()}>Quick Filters</p>
                <span className="text-[11px] text-gray-400 dark:text-white/35">
                  {quickFilters.filter((filter) => filter.active).length} active
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={filter.active}
                    onClick={filter.onToggle}
                    className={filter.className}
                  >
                    <span>{filter.label}</span>
                    {filter.count != null && (
                      <span className={countBadgeClass(filter.active)}>{filter.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {filterSections.map((section) => (
            <section key={section.key} className={`${sectionCardClass()} ${section.className ?? ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className={sectionLabelClass()}>{section.title}</p>
                <span className="text-[11px] text-gray-400 dark:text-white/35">
                  {section.summary}
                </span>
              </div>
              {section.options.length > 0 ? (
                <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                  {section.options.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={option.active}
                      onClick={option.onToggle}
                      className={option.className}
                    >
                      <span>{option.label}</span>
                      {option.count != null && (
                        <span className={countBadgeClass(option.active)}>{option.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-400 dark:text-white/35">
                  {section.emptyText ?? "No filters available here."}
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
