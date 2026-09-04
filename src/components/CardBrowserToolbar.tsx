"use client";

import { type ReactNode, useId, useState } from "react";
import { Search, SlidersHorizontal, PanelsTopLeft, X } from "lucide-react";

const ACTIVE_SEGMENT_CLASS =
  "border-violet-400/40 bg-violet-600 text-white";

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
    ? "inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-violet-400/30 bg-violet-400/12 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-violet-200 max-[767px]:min-h-10 max-[767px]:px-2.5 max-[767px]:py-1.5 max-[767px]:text-xs"
    : "inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none text-white/55 max-[767px]:min-h-10 max-[767px]:px-2.5 max-[767px]:py-1.5 max-[767px]:text-xs";
}

function actionButtonClass(active = false): string {
  return `inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none transition-colors max-[767px]:min-h-10 max-[767px]:px-2.5 max-[767px]:py-1.5 max-[767px]:text-xs ${
    active
      ? ACTIVE_SEGMENT_CLASS
      : "border-white/8 bg-white/[0.045] text-white/62 hover:border-white/16 hover:bg-white/[0.075] hover:text-white"
  }`;
}

function sectionCardClass(): string {
  return "overflow-hidden border-t border-white/8 px-0 py-3 max-[767px]:rounded-none max-[767px]:bg-transparent max-[767px]:shadow-none md:rounded-2xl md:border md:bg-white/[0.04] md:px-3 md:shadow-sm md:shadow-black/20";
}

function controlsStripClass(): string {
  return "rounded-2xl border border-white/8 bg-white/[0.035] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
}

function sectionLabelClass(): string {
  return "w-12 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55 max-[767px]:w-auto max-[767px]:text-xs max-[767px]:normal-case max-[767px]:tracking-normal";
}

function compactSegmentedShellClass(): string {
  return "inline-flex min-w-0 gap-1 rounded-[1.15rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20";
}

function segmentedButtonClass(active: boolean): string {
  return `inline-flex min-h-8 min-w-0 items-center justify-center rounded-full border border-transparent px-3 py-1.5 text-xs font-bold leading-none transition-colors sm:px-3.5 ${
    active
      ? ACTIVE_SEGMENT_CLASS
      : "text-white/56 hover:bg-white/[0.07] hover:text-white"
  }`;
}

function countBadgeClass(active: boolean): string {
  return `inline-flex min-h-[var(--ui-chip-count-min-height)] items-center rounded-full px-[var(--ui-chip-count-x)] py-[var(--ui-chip-count-y)] text-[length:var(--ui-chip-count-font-size)] font-semibold leading-none ${
    active
      ? "bg-white/14 text-current"
      : "bg-white/8 text-white/35"
  }`;
}

function activeFilterChipClass(): string {
  return "inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none text-white/62 transition-colors hover:border-white/16 hover:text-white";
}

function mobileSegmentedShellClass(): string {
  return "grid min-w-0 gap-1 rounded-[1.15rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20";
}

function mobileSegmentedButtonClass(active: boolean): string {
  return `min-h-11 min-w-0 rounded-full border border-transparent px-1.5 text-xs font-semibold leading-none transition-colors ${
    active
      ? ACTIVE_SEGMENT_CLASS
      : "text-white/56 hover:bg-white/[0.07] hover:text-white"
  }`;
}

function MobileSegmentedControl({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: CardBrowserToolbarOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
        {label}
      </span>
      <div
        className={mobileSegmentedShellClass()}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={mobileSegmentedButtonClass(value === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function toolbarFilterButtonClass(className: string): string {
  return `${className} max-w-full whitespace-nowrap shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400`;
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
  const [displayExpanded, setDisplayExpanded] = useState(false);
  const displayId = useId();
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
      <span className={`${metaChipClass()} max-[767px]:hidden`}>{summaryLabel}</span>
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
      <button
        type="button"
        className={`${actionButtonClass(displayExpanded)} md:hidden`}
        aria-expanded={displayExpanded}
        aria-controls={displayId}
        onClick={() => setDisplayExpanded((expanded) => !expanded)}
      >
        <PanelsTopLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Display
      </button>
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
          : "card-browser-toolbar binder-panel mb-3 space-y-2.5 rounded-[22px] px-3 py-3 sm:mb-4 sm:space-y-3 sm:rounded-[26px] sm:px-4 sm:py-4"
      }
    >
      {hideSearch ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.04] p-2 shadow-sm shadow-black/20 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <section className="hidden min-w-0 sm:block">{desktopControls}</section>
          {metaControls}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-10 text-sm text-white outline-none transition-colors placeholder:text-white/42 focus:border-white/20 focus:bg-black/20 max-[767px]:h-11 max-[767px]:rounded-xl max-[767px]:py-2 max-[767px]:text-sm"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-white/38 transition-colors hover:text-white"
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
        className={`grid gap-2 md:hidden ${
          hideSearch
            ? "rounded-2xl border border-white/8 bg-white/[0.04] p-2 shadow-sm shadow-black/20"
            : ""
        }`}
      >
        <div id={displayId} className={`${displayExpanded ? "grid" : "hidden"} gap-2 ${sizeOptions.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
          <MobileSegmentedControl
            label="View"
            options={viewOptions}
            value={activeView}
            onChange={onViewChange}
          />

          {sizeOptions.length > 0 && (
            <MobileSegmentedControl
              label="Size"
              options={sizeOptions}
              value={activeSize}
              onChange={onSizeChange}
            />
          )}
        </div>

        {sortOptions.length > 0 && (
          <MobileSegmentedControl
            label="Sort"
            options={sortOptions}
            value={activeSort}
            onChange={onSortChange}
          />
        )}
      </section>

      {!hideSearch ? (
        <section className={`${controlsStripClass()} max-[767px]:hidden`}>
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
