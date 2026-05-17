"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { List, Plus, RotateCcw } from "lucide-react";
import type { ModalCardData } from "@/components/CardModal";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import { formatCollectionCurrency } from "@/lib/collection";
import { getFixedTrackGridTemplate } from "@/lib/display-scale";
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
    <div className="group/quickrow grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 rounded-xl border border-black/6 bg-white/70 px-2 py-1.5 transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/[0.055] dark:border-white/8 dark:bg-white/[0.045] dark:hover:border-emerald-300/22 dark:hover:bg-emerald-300/[0.07]">
      <button
        type="button"
        onClick={() => onOpenCard(item)}
        disabled={disabled}
        className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2 rounded-lg text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-emerald-400/45 disabled:cursor-wait disabled:opacity-60"
        title={`Open ${item.name}`}
      >
        <span className="flex h-16 w-12 items-center justify-center overflow-hidden rounded-lg border border-black/6 bg-black/5 transition-transform group-hover/quickrow:scale-[1.035] dark:border-white/8 dark:bg-white/8">
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
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold leading-tight text-gray-950 transition-colors group-hover/quickrow:text-emerald-700 dark:text-white dark:group-hover/quickrow:text-emerald-100">
              {item.name}
            </span>
            {cardNumber ? (
              <span className="shrink-0 rounded-full border border-emerald-400/18 bg-emerald-400/[0.10] px-2 py-1 text-[11px] font-black leading-none tracking-tight text-emerald-700 dark:text-emerald-200">
                {cardNumber}
              </span>
            ) : null}
          </span>
        <span className="mt-0.5 block truncate text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-white/38">
          {item.rarity || item.supertype || "Missing card"}
        </span>
        <span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-500 dark:text-white/46">
          {priceLabel}
        </span>
        </span>
      </button>
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          onClick={() => onAddToBinder(item.card_id)}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-700 transition-colors hover:border-emerald-400/35 hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-200"
          title="Add to binder"
          aria-label={`Add ${item.name} to binder`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function WantBinderTile({
  group,
  expanded,
  disabled,
  onToggle,
  onAddToBinder,
  onOpenCard,
  onResetHidden,
}: {
  group: WantPlannerGroup;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onAddToBinder: (cardId: string, binderId: string) => void;
  onOpenCard: (item: CollectionCardViewItem) => void;
  onResetHidden: () => void;
}) {
  const accentColor = group.accentColor;
  const expandedSubtitle = group.subtitle.includes(" / ")
    ? group.subtitle.split(" / ")[0]
    : group.subtitle;
  const hiddenLabel =
    group.hiddenCards > 0 ? `${group.hiddenCards.toLocaleString("en-US")} hidden` : "None hidden";
  const metrics = [
    {
      label: "Progress",
      value: group.progressLabel,
      subValue: `${group.totalMissingCards.toLocaleString("en-US")} missing total`,
    },
    {
      label: "Wants",
      value: missingLabel(group),
      subValue: `${group.pricedCards.toLocaleString("en-US")} priced - ${hiddenLabel}`,
    },
    {
      label: "Est. Cost",
      value: formatCollectionCurrency(group.estimatedCost),
      subValue: formatAverageCost(group),
    },
  ];

  return (
    <article
      className={`glass relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl p-4 shadow-lg shadow-black/5 max-[640px]:gap-2.5 max-[640px]:p-3 ${
        expanded ? "max-[640px]:col-span-2" : ""
      }`}
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
            <span className="shrink-0 rounded-full border border-black/8 bg-black/[0.035] px-2 py-0.5 text-[10px] font-bold text-gray-600 transition-colors group-hover/tile:border-emerald-400/25 group-hover/tile:text-emerald-700 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/58 dark:group-hover/tile:text-emerald-200">
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
              className="min-w-0 rounded-xl border border-black/8 bg-black/[0.03] px-2.5 py-2 max-[640px]:px-2 max-[640px]:py-1.5 dark:border-white/8 dark:bg-white/[0.04]"
              title={`${metric.label}: ${metric.value} - ${metric.subValue}`}
            >
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 max-[640px]:text-[8px] max-[640px]:tracking-[0.08em] dark:text-white/35">
                {metric.label}
              </p>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-gray-900 max-[640px]:mt-1 max-[640px]:text-[10px] dark:text-white">
                {metric.value}
              </p>
              <p className="mt-1 truncate text-[10px] font-medium leading-none text-gray-500 max-[640px]:text-[8px] dark:text-white/45">
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

      {expanded ? (
        <div className="border-t border-black/6 pt-3 dark:border-white/8">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
              Missing cards
            </p>
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
          </div>
          {group.items.length > 0 ? (
            <div className="mt-2 grid max-h-[32rem] gap-2 overflow-y-auto pr-1">
              {group.items.map((item) => (
                <PlannerCardRow
                  key={item.want_item_id ?? item.card_id}
                  item={item}
                  disabled={disabled}
                  onAddToBinder={(cardId) => onAddToBinder(cardId, group.binderId)}
                  onOpenCard={onOpenCard}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-black/6 bg-white/55 px-3 py-2 text-sm text-gray-500 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/48">
              No visible missing cards in this binder.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function WantsPlannerSection({
  groups,
  needsPlannerSync,
  game,
  tileTrackWidth,
}: {
  groups: WantPlannerGroup[];
  needsPlannerSync: boolean;
  game: TradingCardGameFilter;
  tileTrackWidth: string;
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

  if (groups.length === 0 && !needsPlannerSync) return null;

  return (
    <>
    <section className="rounded-3xl border border-black/8 bg-white/78 p-3 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-none sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        className="mt-4 grid items-start justify-start gap-4"
        style={{
          gridTemplateColumns: getFixedTrackGridTemplate(tileTrackWidth),
        }}
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
            onResetHidden={() =>
              void postPlannerSync({ resetHidden: true, episodeId: group.episodeId })
            }
          />
        ))}
      </div>
    </section>
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
