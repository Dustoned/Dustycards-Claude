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
  hideSearch?: boolean;
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
    ? "inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-blue-500/25 bg-blue-500/10 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-blue-700 max-[640px]:min-h-8 max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-xs dark:text-blue-300"
    : "inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-black/8 bg-white/70 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none text-gray-500 max-[640px]:min-h-8 max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-xs dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55";
}

function actionButtonClass(active = false): string {
  return `inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none transition-colors max-[640px]:min-h-8 max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-xs ${
    active
      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
      : "border-black/8 bg-white/70 text-gray-600 hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
  }`;
}

function sectionCardClass(): string {
  return "overflow-hidden rounded-2xl border border-black/8 bg-white/72 px-3 py-3 shadow-sm shadow-black/5 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2.5 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20";
}

function controlsStripClass(): string {
  return "rounded-2xl border border-black/8 bg-black/[0.018] p-2 dark:border-white/8 dark:bg-white/[0.025]";
}

function sectionLabelClass(): string {
  return "w-12 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 max-[640px]:w-auto max-[640px]:text-[9px] dark:text-white/35";
}

function compactSegmentedShellClass(): string {
  return "inline-flex min-w-0 overflow-hidden rounded-xl border border-black/8 bg-white/58 dark:border-white/8 dark:bg-white/[0.04]";
}

function segmentedButtonClass(active: boolean): string {
  return `min-h-8 px-3 py-1.5 text-xs font-semibold leading-none transition-colors sm:px-3.5 ${
    active
      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
      : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
  }`;
}

function countBadgeClass(active: boolean): string {
  return `inline-flex min-h-[var(--ui-chip-count-min-height)] items-center rounded-full px-[var(--ui-chip-count-x)] py-[var(--ui-chip-count-y)] text-[length:var(--ui-chip-count-font-size)] font-semibold leading-none ${
    active
      ? "bg-black/12 text-current dark:bg-white/12"
      : "bg-black/6 text-gray-400 dark:bg-white/8 dark:text-white/35"
  }`;
}

function activeFilterChipClass(): string {
  return "inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-black/8 bg-black/[0.035] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none text-gray-600 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white";
}

function mobileSelectClass(): string {
  return "h-9 w-full rounded-xl border border-black/8 bg-white/78 px-2.5 text-xs font-semibold text-gray-900 outline-none transition-colors focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14";
}

const mobileOptionClass = "bg-white text-gray-950 dark:bg-gray-950 dark:text-white";

function toolbarFilterButtonClass(className: string): string {
  return `${className} max-w-full whitespace-nowrap outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0`;
}

function filterIndicatorClass(active: boolean): string {
  return `h-1.5 w-1.5 shrink-0 rounded-full bg-current transition-opacity ${
    active ? "opacity-80" : "opacity-0"
  }`;
}

export default function CardBrowserToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  hideSearch = false,
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
  const metaControls = (
    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
      <span className={metaChipClass()}>{resultLabel}</span>
      <span className={`${metaChipClass()} max-[640px]:hidden`}>{summaryLabel}</span>
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
  );
  const desktopControls = (
    <div className="grid gap-2 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2">
      <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 md:flex">
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
          <div className="hidden h-5 w-px bg-black/8 dark:bg-white/8 lg:block" />

          <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 md:flex">
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
          <div className="hidden h-5 w-px bg-black/8 dark:bg-white/8 lg:block" />

          <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 md:flex">
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
  );

  return (
    <div
      className={
        hideSearch
          ? "card-browser-toolbar mb-3 space-y-2 sm:mb-4"
          : "card-browser-toolbar glass mb-3 space-y-2.5 rounded-2xl border border-black/8 px-3 py-3 shadow-sm shadow-black/5 dark:border-white/8 sm:mb-4 sm:space-y-3 sm:rounded-3xl sm:px-4 sm:py-4"
      }
    >
      {hideSearch ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-black/8 bg-white/70 p-2 shadow-sm shadow-black/5 backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
          <section className="hidden min-w-0 sm:block">{desktopControls}</section>
          {metaControls}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/35" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-2xl border border-black/8 bg-white/78 py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-black/14 max-[640px]:h-10 max-[640px]:rounded-xl max-[640px]:py-2 max-[640px]:text-sm dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/28 dark:focus:border-white/14"
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
          {metaControls}
        </div>
      )}

      <section
        className={`grid gap-2 sm:hidden ${
          hideSearch
            ? "rounded-2xl border border-black/8 bg-white/70 p-2 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]"
            : ""
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
              View
            </span>
            <select
              value={activeView}
              onChange={(event) => onViewChange(event.target.value)}
              className={mobileSelectClass()}
            >
              {viewOptions.map((option) => (
                <option key={option.value} value={option.value} className={mobileOptionClass}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {sizeOptions.length > 0 && (
            <label className="block">
              <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                Size
              </span>
              <select
                value={activeSize}
                onChange={(event) => onSizeChange(event.target.value)}
                className={mobileSelectClass()}
              >
                {sizeOptions.map((option) => (
                  <option key={option.value} value={option.value} className={mobileOptionClass}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {sortOptions.length > 0 && (
          <label className="block">
            <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
              Sort
            </span>
            <select
              value={activeSort}
              onChange={(event) => onSortChange(event.target.value)}
              className={mobileSelectClass()}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value} className={mobileOptionClass}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {!hideSearch ? (
        <section className={`${controlsStripClass()} max-[640px]:hidden`}>
          {desktopControls}
        </section>
      ) : null}

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
                <span className="text-[length:var(--ui-chip-count-font-size)] text-gray-400 dark:text-white/35">
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
                    className={toolbarFilterButtonClass(filter.className)}
                  >
                    <span aria-hidden="true" className={filterIndicatorClass(filter.active)} />
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
                <span className="text-[length:var(--ui-chip-count-font-size)] text-gray-400 dark:text-white/35">
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
                      className={toolbarFilterButtonClass(option.className)}
                    >
                      <span aria-hidden="true" className={filterIndicatorClass(option.active)} />
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
