"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, List, Plus, RotateCcw, X } from "lucide-react";
import type { ModalCardData } from "@/components/CardModal";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import {
  modalCenteredMobileOverlayClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalPanelBaseClass,
} from "@/components/modal-glass-styles";
import { formatCollectionCurrency } from "@/lib/collection";
import { CARD_NUMBER_FALLBACK, cardNumberCollator } from "@/lib/card-number-sort";
import type { TradingCardGameFilter } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { WantPlannerGroup } from "@/lib/collection-data";
import type { CollectionCardViewItem } from "@/types/collection-view";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

function formatAverageCost(group: WantPlannerGroup): string {
  if (group.pricedCards <= 0) return "No priced wants";
  return `${formatCollectionCurrency(group.estimatedCost / group.pricedCards)} avg`;
}

function progressWidth(group: WantPlannerGroup): string {
  if (group.totalCards <= 0) return "0%";
  return `${Math.min(100, Math.max(0, (group.ownedCards / group.totalCards) * 100))}%`;
}

function missingLabel(group: WantPlannerGroup): string {
  if (group.visibleMissingCards === group.totalMissingCards) {
    return group.visibleMissingCards.toLocaleString("en-US");
  }

  return `${group.visibleMissingCards.toLocaleString("en-US")}/${group.totalMissingCards.toLocaleString("en-US")}`;
}

function getWantBinderMetrics(group: WantPlannerGroup) {
  const hiddenLabel =
    group.hiddenCards > 0 ? `${group.hiddenCards.toLocaleString("en-US")} hidden` : "None hidden";

  return [
    {
      label: "Progress",
      mobileLabel: "Owned",
      value: group.progressLabel,
      subValue: `${group.totalMissingCards.toLocaleString("en-US")} missing total`,
    },
    {
      label: "Missing",
      mobileLabel: "Missing",
      value: missingLabel(group),
      subValue: `${group.pricedCards.toLocaleString("en-US")} priced - ${hiddenLabel}`,
      mobileHidden: true,
    },
    {
      label: "Est. Cost",
      mobileLabel: "Cost",
      value: formatCollectionCurrency(group.estimatedCost),
      subValue: formatAverageCost(group),
    },
  ];
}

type QuickViewSortField = "number" | "price" | "name";
type QuickViewSortDirection = "asc" | "desc";
type QuickViewFilterKey = "all" | "priced" | "unpriced";

const QUICK_VIEW_SORTS: Array<{ key: QuickViewSortField; label: string }> = [
  { key: "number", label: "Number" },
  { key: "price", label: "Price" },
  { key: "name", label: "Name" },
];

const QUICK_VIEW_FILTERS: Array<{ key: QuickViewFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "priced", label: "Priced" },
  { key: "unpriced", label: "No price" },
];

function compareWantCardNumbers(a: CollectionCardViewItem, b: CollectionCardViewItem): number {
  const numberDiff = cardNumberCollator.compare(
    a.card_number?.trim() || CARD_NUMBER_FALLBACK,
    b.card_number?.trim() || CARD_NUMBER_FALLBACK
  );
  if (numberDiff !== 0) return numberDiff;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function compareWantPrices(
  a: CollectionCardViewItem,
  b: CollectionCardViewItem,
  direction: "asc" | "desc"
): number {
  const aValue = a.current_value;
  const bValue = b.current_value;
  if (aValue == null && bValue == null) return compareWantCardNumbers(a, b);
  if (aValue == null) return 1;
  if (bValue == null) return -1;
  const priceDiff = direction === "asc" ? aValue - bValue : bValue - aValue;
  return priceDiff || compareWantCardNumbers(a, b);
}

function getQuickViewItems(
  items: CollectionCardViewItem[],
  sortField: QuickViewSortField,
  sortDirection: QuickViewSortDirection,
  filterKey: QuickViewFilterKey
): CollectionCardViewItem[] {
  const filteredItems = items.filter((item) => {
    if (filterKey === "priced") return item.current_value != null;
    if (filterKey === "unpriced") return item.current_value == null;
    return true;
  });

  return [...filteredItems].sort((a, b) => {
    if (sortField === "price") return compareWantPrices(a, b, sortDirection);
    if (sortField === "name") {
      const nameDiff =
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
        compareWantCardNumbers(a, b);
      return sortDirection === "asc" ? nameDiff : -nameDiff;
    }
    const numberDiff = compareWantCardNumbers(a, b);
    return sortDirection === "asc" ? numberDiff : -numberDiff;
  });
}

function QuickViewSortControl({
  sortField,
  sortDirection,
  onSort,
}: {
  sortField: QuickViewSortField;
  sortDirection: QuickViewSortDirection;
  onSort: (field: QuickViewSortField) => void;
}) {
  const DirectionIcon = sortDirection === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="grid min-w-0 items-center gap-1 max-[640px]:grid-cols-[2.65rem_minmax(0,1fr)] sm:block">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/32 max-[640px]:mb-0 max-[640px]:text-[8px] max-[640px]:tracking-[0.1em]">
        Sort
      </p>
      <div className="grid max-w-full grid-cols-3 items-center gap-1 rounded-2xl border border-white/10 bg-black/20 p-1">
        {QUICK_VIEW_SORTS.map((option) => {
          const active = sortField === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSort(option.key)}
              className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 text-[10px] font-bold transition-colors sm:h-7 sm:px-2.5 sm:text-[11px] ${
                active
                  ? "bg-white text-gray-950 shadow-sm shadow-black/20"
                  : "text-white/54 hover:bg-white/8 hover:text-white"
              }`}
              title={
                active
                  ? `${option.label} ${sortDirection === "asc" ? "low to high" : "high to low"}`
                  : `Sort by ${option.label}`
              }
            >
              <span className="truncate">{option.label}</span>
              {active ? <DirectionIcon className="h-3 w-3" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuickViewSegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: Array<{ key: TValue; label: string }>;
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="grid min-w-0 items-center gap-1 max-[640px]:grid-cols-[2.65rem_minmax(0,1fr)] sm:block">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/32 max-[640px]:mb-0 max-[640px]:text-[8px] max-[640px]:tracking-[0.1em]">
        {label}
      </p>
      <div
        className="grid max-w-full items-center gap-1 rounded-2xl border border-white/10 bg-black/20 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.key)}
              className={`inline-flex h-8 min-w-0 items-center justify-center rounded-xl px-1.5 text-[10px] font-bold transition-colors sm:h-7 sm:px-2.5 sm:text-[11px] ${
                active
                  ? "bg-white text-gray-950 shadow-sm shadow-black/20"
                  : "text-white/54 hover:bg-white/8 hover:text-white"
              }`}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlannerCardRow({
  item,
  onAddToBinder,
  onOpenCard,
  disabled,
}: {
  item: CollectionCardViewItem;
  onAddToBinder: (cardId: string) => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  disabled: boolean;
}) {
  const cardNumber = item.card_number ? `#${item.card_number.replace(/^#/, "")}` : null;
  const priceLabel =
    item.current_value == null ? "No price" : formatCollectionCurrency(item.current_value);

  return (
    <div className="group/quickrow grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2.5 rounded-xl border border-black/6 bg-white/70 px-2 py-2 transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/[0.055] dark:border-white/8 dark:bg-white/[0.045] dark:hover:border-emerald-300/22 dark:hover:bg-emerald-300/[0.07] sm:px-2.5">
      <button
        type="button"
        onClick={() => onOpenCard(item)}
        disabled={disabled}
        className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-emerald-400/45 disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[4.65rem_minmax(0,1fr)]"
        title={`Open ${item.name}`}
      >
        <span className="flex h-[5.35rem] w-[3.85rem] items-center justify-center overflow-hidden rounded-lg border border-black/6 bg-black/5 shadow-sm shadow-black/10 transition-transform group-hover/quickrow:scale-[1.035] dark:border-white/8 dark:bg-white/8 sm:h-24 sm:w-[4.35rem]">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-[10px] font-bold text-gray-400 dark:text-white/35">DC</span>
          )}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight text-gray-950 transition-colors group-hover/quickrow:text-emerald-700 dark:text-white dark:group-hover/quickrow:text-emerald-100 sm:text-sm">
              {item.name}
            </span>
            {cardNumber ? (
              <span className="shrink-0 rounded-full border border-emerald-400/18 bg-emerald-400/[0.10] px-2 py-1 text-[11px] font-black leading-none tracking-tight text-emerald-700 dark:text-emerald-200">
                {cardNumber}
              </span>
            ) : null}
          </span>
        <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-white/38 sm:text-[10.5px]">
          {item.rarity || item.supertype || "Missing card"}
        </span>
        <span className="mt-1 block truncate text-[11px] font-semibold text-gray-500 dark:text-white/46">
          {priceLabel}
        </span>
        </span>
      </button>
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          onClick={() => onAddToBinder(item.card_id)}
          disabled={disabled}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-700 transition-colors hover:border-emerald-400/35 hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-200"
          title="Add to binder"
          aria-label={`Add ${item.name} to binder`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function BinderQuickViewBody({
  group,
  disabled,
  onAddToBinder,
  onOpenCard,
  onResetHidden,
  mobileCloseAction,
  scrollClassName = "max-h-[32rem]",
  listClassName = "",
  scrollable = true,
}: {
  group: WantPlannerGroup;
  disabled: boolean;
  onAddToBinder: (cardId: string) => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  onResetHidden: () => void;
  mobileCloseAction?: ReactNode;
  scrollClassName?: string;
  listClassName?: string;
  scrollable?: boolean;
}) {
  const [sortField, setSortField] = useState<QuickViewSortField>("number");
  const [sortDirection, setSortDirection] = useState<QuickViewSortDirection>("asc");
  const [filterKey, setFilterKey] = useState<QuickViewFilterKey>("all");
  const visibleItems = useMemo(
    () => getQuickViewItems(group.items, sortField, sortDirection, filterKey),
    [filterKey, group.items, sortDirection, sortField]
  );
  const handleSort = useCallback((field: QuickViewSortField) => {
    if (field === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "price" ? "desc" : "asc");
  }, [sortField]);

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
              Missing cards
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-white/40">
              {visibleItems.length.toLocaleString("en-US")} visible
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {group.hiddenCards > 0 ? (
              <button
                type="button"
                onClick={onResetHidden}
                disabled={disabled}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-black/8 bg-white px-2.5 text-[12px] font-bold text-gray-600 transition-colors hover:border-emerald-400/25 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/7 dark:text-white/60 dark:hover:text-emerald-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset hidden
              </button>
            ) : null}
            {mobileCloseAction ? <div className="sm:hidden">{mobileCloseAction}</div> : null}
          </div>
        </div>

        <div className="grid gap-1.5 rounded-2xl border border-white/10 bg-black/14 p-2 sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <QuickViewSortControl
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
          <QuickViewSegmentedControl
            label="Show"
            value={filterKey}
            options={QUICK_VIEW_FILTERS}
            onChange={setFilterKey}
          />
        </div>
      </div>
      {visibleItems.length > 0 ? (
        <div
          className={`mt-3 grid gap-2 ${
            scrollable ? "overflow-y-auto pr-0 sm:pr-1" : "overflow-visible pr-0"
          } ${scrollClassName} ${listClassName}`}
        >
          {visibleItems.map((item) => (
            <PlannerCardRow
              key={item.want_item_id ?? item.card_id}
              item={item}
              disabled={disabled}
              onAddToBinder={onAddToBinder}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-xl border border-black/6 bg-white/55 px-3 py-2 text-sm text-gray-500 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/48">
          No cards match these quick view filters.
        </p>
      )}
    </>
  );
}

function BinderSearchMatches({
  group,
  disabled,
  onAddToBinder,
  onOpenCard,
  onShowAll,
}: {
  group: WantPlannerGroup;
  disabled: boolean;
  onAddToBinder: (cardId: string) => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  onShowAll: () => void;
}) {
  const visibleItems = group.items.slice(0, 5);
  const hiddenCount = Math.max(group.items.length - visibleItems.length, 0);

  return (
    <div className="rounded-2xl border border-emerald-400/22 bg-emerald-400/[0.075] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">
            Match in binder
          </p>
          <p className="truncate text-[11px] font-semibold text-gray-500 dark:text-white/48">
            {group.name}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/[0.12] px-2 py-1 text-[10px] font-black leading-none text-emerald-700 dark:text-emerald-200">
          {group.items.length.toLocaleString("en-US")}
        </span>
      </div>

      <div className="grid gap-2">
        {visibleItems.map((item) => (
          <PlannerCardRow
            key={item.want_item_id ?? item.card_id}
            item={item}
            disabled={disabled}
            onAddToBinder={onAddToBinder}
            onOpenCard={onOpenCard}
          />
        ))}
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={onShowAll}
          disabled={disabled}
          className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-xl border border-emerald-400/18 bg-emerald-400/[0.08] text-[12px] font-bold text-emerald-700 transition-colors hover:border-emerald-400/32 hover:bg-emerald-400/[0.13] disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-200"
        >
          Show {hiddenCount.toLocaleString("en-US")} more in quick view
        </button>
      ) : null}
    </div>
  );
}

function WantsQuickViewModal({
  group,
  disabled,
  onClose,
  onAddToBinder,
  onOpenCard,
  onResetHidden,
  widescreen,
}: {
  group: WantPlannerGroup;
  disabled: boolean;
  onClose: () => void;
  onAddToBinder: (cardId: string, binderId: string) => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  onResetHidden: () => void;
  widescreen: boolean;
}) {
  const accentColor = group.accentColor;
  const metrics = getWantBinderMetrics(group);
  const panelWidthClass = widescreen
    ? "max-w-[min(64rem,calc(100vw-1.5rem))] lg:max-w-[min(118rem,calc(100vw-2rem))] min-[1800px]:max-w-[min(132rem,calc(100vw-2rem))]"
    : "max-w-[min(52rem,calc(100vw-1.5rem))] xl:max-w-[min(62rem,calc(100vw-4rem))] 2xl:max-w-[min(68rem,calc(100vw-5rem))]";
  const bodyGridClass = widescreen
    ? "lg:grid-cols-[minmax(10.5rem,14rem)_minmax(0,1fr)] min-[1800px]:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]"
    : "lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]";

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`${modalCenteredMobileOverlayClass} z-[90]`}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${group.name} quick view`}
        className={`${modalPanelBaseClass} ${panelWidthClass} ${
          widescreen ? "max-h-[calc(100dvh-1rem)]" : ""
        } max-[640px]:max-h-[calc(100dvh-1rem)] max-[640px]:rounded-[22px]`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {widescreen ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className={`${modalCloseButtonClass} absolute right-3 top-3 z-20 h-10 w-10`}
            aria-label="Close quick view"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className={`${modalCompactHeaderClass} max-[640px]:hidden ${widescreen ? "lg:hidden" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
              Quick view
            </p>
            <h3 className="mt-0.5 truncate text-base font-bold text-white sm:text-lg">
              {group.name}
            </h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-white/48">
              {missingLabel(group)} missing - {formatCollectionCurrency(group.estimatedCost)}
            </p>
          </div>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className={`${modalCloseButtonClass} max-[640px]:h-11 max-[640px]:w-11`}
            aria-label="Close quick view"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className={`grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4 ${bodyGridClass}`}
        >
          <div className="hidden rounded-2xl border border-white/10 bg-white/[0.055] p-3 sm:block">
            {widescreen ? (
              <div className="mb-3 pr-9">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                  Quick view
                </p>
                <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white">
                  {group.name}
                </h3>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-white/48">
                  {missingLabel(group)} missing - {formatCollectionCurrency(group.estimatedCost)}
                </p>
              </div>
            ) : null}
            <div
              className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20"
              style={accentColor ? { boxShadow: `inset 0 0 0 1px ${accentColor}30` } : undefined}
            >
              {group.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getCachedImageUrl(group.logoUrl) ?? group.logoUrl}
                  alt={group.name}
                  className="h-full w-full object-contain p-4"
                />
              ) : (
                <CollectionBinderIcon
                  iconName={group.iconName}
                  className="h-16 w-16 text-white/70"
                />
              )}
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width: progressWidth(group),
                  background: accentColor
                    ? `linear-gradient(90deg, ${accentColor}, #34d399)`
                    : undefined,
                }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-white/10 bg-black/18 px-3 py-2"
                >
                  <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/36">
                    {metric.label}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-white">
                    {metric.value}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-white/42">
                    {metric.subValue}
                  </p>
                </div>
              ))}
            </div>

            <Link
              href={`/wants/binders/${group.binderId}`}
              prefetch={false}
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.075] text-sm font-bold text-white transition-colors hover:bg-white/[0.12]"
            >
              Open full binder
            </Link>
          </div>

          <div className="min-w-0">
            <BinderQuickViewBody
              group={group}
              disabled={disabled}
              onAddToBinder={(cardId) => onAddToBinder(cardId, group.binderId)}
              onOpenCard={onOpenCard}
              onResetHidden={onResetHidden}
              mobileCloseAction={
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                  }}
                  className={`${modalCloseButtonClass} h-10 w-10`}
                  aria-label="Close quick view"
                >
                  <X className="h-4 w-4" />
                </button>
              }
              scrollable={!widescreen}
              scrollClassName={
                widescreen ? "max-h-none" : "max-h-none sm:max-h-[calc(100dvh-16rem)]"
              }
              listClassName={
                widescreen
                  ? "lg:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5"
                  : ""
              }
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function WantBinderTile({
  group,
  expanded,
  disabled,
  onToggle,
  onAddToBinder,
  onOpenCard,
  searchActive,
}: {
  group: WantPlannerGroup;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onAddToBinder: (cardId: string, binderId: string) => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  searchActive: boolean;
}) {
  const accentColor = group.accentColor;
  const expandedSubtitle = group.subtitle.includes(" / ")
    ? group.subtitle.split(" / ")[0]
    : group.subtitle;
  const metrics = getWantBinderMetrics(group);

  return (
    <article
      className="glass relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl p-4 shadow-lg shadow-black/5 max-[640px]:gap-2.5 max-[640px]:p-3"
      style={
        accentColor
          ? { boxShadow: `inset 0 0 0 1px ${accentColor}2f` }
          : undefined
      }
    >
      {accentColor ? (
        <div
          className="absolute inset-x-5 top-0 h-1 rounded-b-full"
          style={{ backgroundColor: accentColor }}
        />
      ) : null}

      <Link
        href={`/wants/binders/${group.binderId}`}
        prefetch={false}
        className="group/tile flex min-w-0 flex-col gap-3 text-left outline-none"
      >
        <div
          className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl border border-black/8 bg-black/[0.03] transition-colors group-hover/tile:bg-black/[0.045] dark:border-white/8 dark:bg-white/[0.04] dark:group-hover/tile:bg-white/[0.065]"
          style={
            accentColor
              ? { boxShadow: `inset 0 0 0 1px ${accentColor}24` }
              : undefined
          }
        >
          {group.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getCachedImageUrl(group.logoUrl) ?? group.logoUrl}
              alt={group.name}
              className="h-full w-full object-contain p-4 max-[640px]:p-2.5 sm:p-5"
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-3xl border border-black/8 bg-white/80 text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-white/70"
              style={accentColor ? { color: accentColor } : undefined}
            >
              <CollectionBinderIcon iconName={group.iconName} className="h-9 w-9" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-bold text-gray-900 max-[640px]:text-[13px] dark:text-white">
                {group.name}
              </h3>
              <p className="mt-1 truncate text-sm text-gray-500 max-[640px]:mt-0.5 max-[640px]:text-[10px] dark:text-white/50">
                {expanded ? expandedSubtitle : group.subtitle}
              </p>
            </div>
            <span className="hidden shrink-0 rounded-full border border-black/8 bg-black/[0.035] px-2 py-0.5 text-[10px] font-bold text-gray-600 transition-colors group-hover/tile:border-emerald-400/25 group-hover/tile:text-emerald-700 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/58 dark:group-hover/tile:text-emerald-200 sm:inline-flex">
              Open
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/8">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{
                width: progressWidth(group),
                background: accentColor
                  ? `linear-gradient(90deg, ${accentColor}, #34d399)`
                  : undefined,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-xs max-[640px]:grid-cols-2">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`min-w-0 rounded-xl border border-black/8 bg-black/[0.03] px-2.5 py-2 max-[640px]:px-2.5 max-[640px]:py-2 dark:border-white/8 dark:bg-white/[0.04] ${
                metric.mobileHidden ? "max-[640px]:hidden" : ""
              }`}
              title={`${metric.label}: ${metric.value} - ${metric.subValue}`}
            >
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 max-[640px]:text-[8px] max-[640px]:tracking-[0.08em] dark:text-white/35">
                <span className="max-[640px]:hidden">{metric.label}</span>
                <span className="hidden max-[640px]:inline">{metric.mobileLabel}</span>
              </p>
              <p className="mt-1.5 truncate text-[13px] font-semibold tracking-tight text-gray-900 max-[640px]:mt-1 max-[640px]:text-[12px] dark:text-white">
                {metric.value}
              </p>
              <p className="mt-1 truncate text-[10px] font-medium leading-none text-gray-500 max-[640px]:hidden dark:text-white/45">
                {metric.subValue}
              </p>
            </div>
          ))}
        </div>
      </Link>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={disabled}
        className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/70 px-3 text-[12px] font-bold text-gray-600 transition-colors hover:border-black/14 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/58 dark:hover:border-white/18 dark:hover:bg-white/9"
      >
        <List className="h-3.5 w-3.5" />
        {expanded ? "Close quick view" : "Quick view"}
      </button>

      {searchActive ? (
        <BinderSearchMatches
          group={group}
          disabled={disabled}
          onAddToBinder={(cardId) => onAddToBinder(cardId, group.binderId)}
          onOpenCard={onOpenCard}
          onShowAll={onToggle}
        />
      ) : null}
    </article>
  );
}

export default function WantsPlannerSection({
  groups,
  needsPlannerSync,
  game,
  tileTrackWidth,
  widescreen,
  searchValue,
}: {
  groups: WantPlannerGroup[];
  needsPlannerSync: boolean;
  game: TradingCardGameFilter;
  tileTrackWidth: string;
  widescreen: boolean;
  searchValue: string;
}) {
  const router = useRouter();
  const [expandedBinderId, setExpandedBinderId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoSyncStarted = useRef(false);
  const totals = useMemo(
    () => ({
      missing: groups.reduce((total, group) => total + group.visibleMissingCards, 0),
      hidden: groups.reduce((total, group) => total + group.hiddenCards, 0),
      cost: groups.reduce((total, group) => total + group.estimatedCost, 0),
    }),
    [groups]
  );
  const binderGridStyle = {
    "--wants-binder-track": tileTrackWidth,
  } as CSSProperties;
  const searchActive = searchValue.trim().length > 0;
  const expandedGroup = groups.find((group) => group.binderId === expandedBinderId) ?? null;

  const postPlannerSync = useCallback(async (options?: { resetHidden?: boolean; episodeId?: string }) => {
    setPendingKey(options?.episodeId ?? "all");
    try {
      await fetch("/api/wants/planner/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, ...options }),
      });
      startTransition(() => router.refresh());
    } finally {
      setPendingKey(null);
    }
  }, [game, router, startTransition]);

  const addToBinder = useCallback(async (cardId: string, binderId: string) => {
    setPendingKey(`${binderId}:${cardId}`);
    try {
      const response = await fetch("/api/collection/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          binderId,
          condition: "Near Mint",
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to add card to binder");
      }
      startTransition(() => router.refresh());
    } finally {
      setPendingKey(null);
    }
  }, [router, startTransition]);

  const openCard = useCallback(async (item: CollectionCardViewItem) => {
    if (openingCardId === item.card_id) return;
    setOpeningCardId(item.card_id);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(item.card_id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: ModalCardData = await response.json();
      setSelectedCard(data);
    } finally {
      setOpeningCardId(null);
    }
  }, [openingCardId]);

  useEffect(() => {
    if (!needsPlannerSync || autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    void postPlannerSync();
  }, [needsPlannerSync, postPlannerSync]);

  if (groups.length === 0 && !needsPlannerSync && !searchValue) return null;

  return (
    <>
    <section className="rounded-3xl border border-black/8 bg-white/78 p-3 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-none sm:p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/38">
            Wantlist planner
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-gray-950 dark:text-white">
            Missing by Binder
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/52">
            {totals.missing.toLocaleString("en-US")} active missing -{" "}
            {formatCollectionCurrency(totals.cost)} visible cost
            {totals.hidden > 0 ? ` - ${totals.hidden.toLocaleString("en-US")} hidden` : ""}
          </p>
        </div>
      </div>

      {needsPlannerSync && groups.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-amber-400/18 bg-amber-400/8 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-amber-200">
          Preparing missing binder wants...
        </div>
      ) : null}

      <div
        className="mt-4 grid grid-cols-2 items-start gap-2 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--wants-binder-track)),1fr))]"
        style={binderGridStyle}
      >
        {groups.map((group) => (
          <WantBinderTile
            key={group.binderId}
            group={group}
            expanded={expandedBinderId === group.binderId}
            disabled={Boolean(pendingKey) || isPending}
            onToggle={() =>
              setExpandedBinderId((current) =>
                current === group.binderId ? null : group.binderId
              )
            }
            onAddToBinder={addToBinder}
            onOpenCard={openCard}
            searchActive={searchActive}
          />
        ))}
      </div>
    </section>
    {expandedGroup ? (
      <WantsQuickViewModal
        group={expandedGroup}
        disabled={Boolean(pendingKey) || isPending}
        onClose={() => setExpandedBinderId(null)}
        onAddToBinder={addToBinder}
        onOpenCard={openCard}
        onResetHidden={() =>
          void postPlannerSync({ resetHidden: true, episodeId: expandedGroup.episodeId })
        }
        widescreen={widescreen}
      />
    ) : null}
    {selectedCard ? (
      <CardModal
        key={selectedCard.id}
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    ) : null}
    </>
  );
}
