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
import { ArrowDown, ArrowUp, List, RotateCcw, X } from "lucide-react";
import type { ModalCardData } from "@/components/CardModal";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import { useSettings } from "@/components/SettingsProvider";
import {
  modalCenteredMobileOverlayClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalPanelBaseClass,
} from "@/components/modal-glass-styles";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import { formatCollectionCurrency } from "@/lib/collection";
import { CARD_NUMBER_FALLBACK, cardNumberCollator } from "@/lib/card-number-sort";
import { getBinderGridTemplateColumns, getBinderTileTrackWidth } from "@/lib/display-scale";
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

const ACTIVE_SEGMENT_CLASS =
  "border border-violet-400/40 bg-violet-600 text-white";

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
      <div className="dc-modal-control grid max-w-full grid-cols-3 items-center gap-1 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-bg-main)] p-1">
        {QUICK_VIEW_SORTS.map((option) => {
          const active = sortField === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSort(option.key)}
              className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 text-[10px] font-bold transition-colors sm:h-7 sm:px-2.5 sm:text-[11px] ${
                active
                  ? ACTIVE_SEGMENT_CLASS
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
        className="dc-modal-control grid max-w-full items-center gap-1 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-bg-main)] p-1"
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
                  ? ACTIVE_SEGMENT_CLASS
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
  binderTarget,
  onOpenCard,
  disabled,
}: {
  item: CollectionCardViewItem;
  binderTarget: { id: string; name: string };
  onOpenCard: (item: CollectionCardViewItem) => void;
  disabled: boolean;
}) {
  const cardNumber = item.card_number ? `#${item.card_number.replace(/^#/, "")}` : null;
  const priceLabel =
    item.current_value == null ? "No price" : formatCollectionCurrency(item.current_value);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2.5 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-elevated)] px-2 py-2 shadow-[0_14px_30px_var(--dc-shadow-color),inset_0_1px_0_var(--dc-sheen)] transition-colors hover:border-[var(--dc-border-hover)] hover:bg-[var(--dc-surface-hover)] sm:px-2.5">
      <button
        type="button"
        onClick={() => onOpenCard(item)}
        disabled={disabled}
        className="grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-emerald-400/45 disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[5rem_minmax(0,1fr)]"
        title={`Open ${item.name}`}
      >
        <span
          className={getCardImageFrameClassName(
            item.image_url,
            "flex h-[5.8rem] w-[4.15rem] items-center justify-center overflow-hidden rounded-[4.75%] bg-transparent shadow-sm shadow-black/35 sm:h-[6.75rem] sm:w-[4.85rem]"
          )}
        >
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getCachedImageUrl(item.image_url) ?? item.image_url}
              alt=""
              className={getCardImageClassName(
                item.image_url,
                "h-full w-full rounded-[4.75%] object-fill"
              )}
              loading="lazy"
            />
          ) : (
            <span className="text-[10px] font-bold text-white/35">DC</span>
          )}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 line-clamp-2 text-[13px] font-bold leading-tight text-white sm:text-sm">
              {item.name}
            </span>
            {cardNumber ? (
              <span className="shrink-0 rounded-full border border-emerald-400/22 bg-emerald-400/[0.12] px-2 py-1 text-[11px] font-black leading-none tracking-tight text-emerald-100">
                {cardNumber}
              </span>
            ) : null}
          </span>
        <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white/56 sm:text-[10.5px]">
          {item.rarity || item.supertype || "Missing card"}
        </span>
        <span className="mt-1 block truncate text-[11px] font-semibold text-white/74">
          {priceLabel}
        </span>
        </span>
      </button>
      <div className="flex shrink-0 justify-end">
        <CollectionAddCardButton
          card={{
            id: item.card_id,
            name: item.name,
            image_url: item.image_url,
            episode: {
              id: item.episode_id,
              name: item.episode_name,
              code: item.episode_code,
            },
          }}
          initialBinderId={binderTarget.id}
          lockedBinderName={binderTarget.name}
          theme="dark"
          className="h-9 w-9 rounded-lg border-violet-300/24 bg-violet-600/24 text-violet-50 hover:border-violet-200/42 hover:bg-violet-500/34"
        />
      </div>
    </div>
  );
}

function BinderQuickViewBody({
  group,
  disabled,
  onOpenCard,
  onResetHidden,
  mobileCloseAction,
  scrollClassName = "max-h-[32rem]",
  listClassName = "",
  scrollable = true,
}: {
  group: WantPlannerGroup;
  disabled: boolean;
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
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
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
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-2.5 text-[12px] font-bold text-white/60 transition-colors hover:border-emerald-400/25 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset hidden
              </button>
            ) : null}
            {mobileCloseAction ? <div className="sm:hidden">{mobileCloseAction}</div> : null}
          </div>
        </div>

        <div className="dc-modal-surface grid gap-1.5 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-primary)] p-2 shadow-[inset_0_1px_0_var(--dc-sheen)] sm:gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
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
              binderTarget={{ id: group.binderId, name: group.name }}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] px-3 py-2 text-sm text-[rgb(var(--dc-text-primary-rgb)/0.64)]">
          No cards match these quick view filters.
        </p>
      )}
    </>
  );
}

function BinderSearchMatches({
  group,
  disabled,
  onOpenCard,
  onShowAll,
}: {
  group: WantPlannerGroup;
  disabled: boolean;
  onOpenCard: (item: CollectionCardViewItem) => void;
  onShowAll: () => void;
}) {
  const visibleItems = group.items.slice(0, 5);
  const hiddenCount = Math.max(group.items.length - visibleItems.length, 0);

  return (
    <div className="rounded-2xl border border-[rgb(var(--dc-success-rgb)/0.24)] bg-[var(--dc-success-bg)] p-2.5 shadow-[0_14px_32px_var(--dc-shadow-color),inset_0_1px_0_var(--dc-sheen)]">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">
            Match in binder
          </p>
          <p className="truncate text-[11px] font-semibold text-white/60">
            {group.name}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/24 bg-emerald-400/[0.14] px-2 py-1 text-[10px] font-black leading-none text-emerald-100">
          {group.items.length.toLocaleString("en-US")}
        </span>
      </div>

      <div className="grid gap-2">
        {visibleItems.map((item) => (
          <PlannerCardRow
            key={item.want_item_id ?? item.card_id}
            item={item}
            disabled={disabled}
            binderTarget={{ id: group.binderId, name: group.name }}
            onOpenCard={onOpenCard}
          />
        ))}
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={onShowAll}
          disabled={disabled}
          className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-xl border border-emerald-400/24 bg-emerald-400/[0.12] text-[12px] font-bold text-emerald-100 transition-colors hover:border-emerald-400/38 hover:bg-emerald-400/[0.18] disabled:cursor-not-allowed disabled:opacity-50"
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
  onOpenCard,
  onResetHidden,
  widescreen,
}: {
  group: WantPlannerGroup;
  disabled: boolean;
  onClose: () => void;
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
      className={`${modalCenteredMobileOverlayClass} z-[360]`}
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
            <p className="mt-0.5 text-xs font-semibold text-white/48">
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
          <div className="dc-modal-surface hidden rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] p-3 sm:block">
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
              className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-bg-main)]"
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
                    ? `linear-gradient(90deg, ${accentColor}, var(--dc-cyan))`
                    : undefined,
                }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-elevated)] px-3 py-2"
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
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-elevated)] text-sm font-bold text-[var(--dc-text-primary)] transition-colors hover:bg-[var(--dc-surface-hover)]"
            >
              Open full binder
            </Link>
          </div>

          <div className="min-w-0">
            <BinderQuickViewBody
              group={group}
              disabled={disabled}
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
  onOpenCard,
  searchActive,
}: {
  group: WantPlannerGroup;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  searchActive: boolean;
}) {
  const accentColor = group.accentColor;
  const expandedSubtitle = group.subtitle.includes(" / ")
    ? group.subtitle.split(" / ")[0]
    : group.subtitle;
  const completionPct =
    group.totalCards > 0 ? Math.round((group.ownedCards / group.totalCards) * 100) : 0;
  const pricedLabel =
    group.pricedCards > 0
      ? `${group.pricedCards.toLocaleString("en-US")} priced`
      : "No prices";
  const hiddenLabel =
    group.hiddenCards > 0 ? `${group.hiddenCards.toLocaleString("en-US")} hidden` : null;
  const tileStyle = {
    "--binder-accent": accentColor ?? "var(--dc-primary)",
  } as CSSProperties;

  return (
    <article
      className="binder-panel binder-overview-tile relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-[18px] p-3 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 max-[640px]:gap-2 max-[640px]:rounded-xl max-[640px]:p-2"
      style={tileStyle}
    >
      {accentColor ? (
        <div
          className="absolute inset-x-4 top-0 h-0.5 rounded-b-full opacity-80"
          style={{ backgroundColor: accentColor }}
        />
      ) : null}

      <Link
        href={`/wants/binders/${group.binderId}`}
        prefetch={false}
        className="group/tile flex min-w-0 flex-col gap-2.5 text-left outline-none"
      >
        <div
          className="binder-overview-media relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-[14px] border border-white/8 sm:aspect-[2.25/1]"
        >
          {group.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getCachedImageUrl(group.logoUrl) ?? group.logoUrl}
              alt={group.name}
              className="h-full w-full object-contain p-2 max-[640px]:p-1.5 sm:p-2.5"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white/70 max-[640px]:h-14 max-[640px]:w-14"
              style={accentColor ? { color: accentColor } : undefined}
            >
              <CollectionBinderIcon iconName={group.iconName} className="h-8 w-8 max-[640px]:h-7 max-[640px]:w-7" />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-2 max-[640px]:space-y-1.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-[15px] font-bold leading-tight text-white max-[640px]:text-[12px]">
                {group.name}
              </h3>
              <p className="mt-1 truncate text-xs font-medium text-white/45 max-[640px]:mt-0.5 max-[640px]:text-[10px]">
                {expanded ? expandedSubtitle : group.subtitle}
              </p>
            </div>
            <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-2 py-0.5 text-[10px] font-bold text-white/58 transition-colors group-hover/tile:border-emerald-400/25 group-hover/tile:text-emerald-200 sm:inline-flex">
              Open
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-white/68 max-[640px]:text-[10px]">
              <span className="truncate">{group.progressLabel}</span>
              <span className="shrink-0 text-white/45">{completionPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{
                  width: progressWidth(group),
                  background: accentColor
                    ? `linear-gradient(90deg, ${accentColor}, var(--dc-cyan))`
                    : undefined,
                }}
              />
            </div>
          </div>

          <div data-want-cost-card className="grid min-w-0 gap-1.5 rounded-xl border border-white/8 bg-white/[0.035] px-2.5 py-2 max-[640px]:rounded-lg max-[640px]:px-2 max-[640px]:py-1.5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/32 max-[640px]:text-[8px]">
                Cost
              </p>
              <p className="mt-0.5 max-w-full text-[15px] font-black leading-tight tracking-tight text-white max-[640px]:text-[12px]">
                {group.estimatedCost > 0 ? formatCollectionCurrency(group.estimatedCost) : "No price"}
              </p>
            </div>
            <span data-want-priced-badge className="w-fit max-w-full rounded-full border border-emerald-400/18 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black leading-none text-emerald-200 max-[640px]:px-2 max-[640px]:text-[9px]">
              {pricedLabel}
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap gap-1.5 max-[640px]:hidden">
            <span className="rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold text-white/58 max-[640px]:px-2 max-[640px]:text-[9px]">
              {missingLabel(group)} missing
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold text-white/58 max-[640px]:px-2 max-[640px]:text-[9px]">
              {formatAverageCost(group)}
            </span>
            {hiddenLabel ? (
              <span className="rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold text-white/42 max-[640px]:px-2 max-[640px]:text-[9px]">
                {hiddenLabel}
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={disabled}
        className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-[12px] font-bold text-white/62 transition-colors hover:border-white/18 hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <List className="h-3.5 w-3.5" />
        {expanded ? "Close quick view" : "Quick view"}
      </button>

      {searchActive ? (
        <BinderSearchMatches
          group={group}
          disabled={disabled}
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
  const { displaySettings, isMobileViewport } = useSettings();
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
    "--wants-binder-track":
      getBinderTileTrackWidth(displaySettings.cardSize, displaySettings.widescreen) ||
      tileTrackWidth,
    gridTemplateColumns: getBinderGridTemplateColumns(
      displaySettings.cardSize,
      displaySettings.widescreen,
      isMobileViewport
    ),
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
    <section className="binder-panel rounded-3xl p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/38">
            Wantlist planner
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-white">
            Missing by Binder
          </h2>
          <p className="mt-1 text-sm text-white/52">
            {totals.missing.toLocaleString("en-US")} active missing -{" "}
            {formatCollectionCurrency(totals.cost)} visible cost
            {totals.hidden > 0 ? ` - ${totals.hidden.toLocaleString("en-US")} hidden` : ""}
          </p>
        </div>
      </div>

      {needsPlannerSync && groups.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-amber-400/18 bg-amber-400/8 px-3 py-2 text-sm font-semibold text-amber-200">
          Preparing missing binder wants...
        </div>
      ) : null}

      <div
        className="mt-4 grid items-start gap-2 sm:gap-3"
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
        backLabel="Back to Wants"
        onClose={() => setSelectedCard(null)}
      />
    ) : null}
    </>
  );
}
