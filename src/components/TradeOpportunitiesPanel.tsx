"use client";

import Link from "next/link";
import { ArrowLeftRight, Check, Search, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CachedImage from "@/components/CachedImage";
import CardSearchPickerDialog, {
  type CardSearchPickerResult,
} from "@/components/CardSearchPickerDialog";
import {
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
} from "@/components/modal-glass-styles";
import { formatCollectionCurrency } from "@/lib/collection";
import type { TradingCardGameFilter } from "@/lib/games";
import type {
  SocialTradeMatchCard,
  SocialTradeOpportunity,
} from "@/lib/social";

type PanelMode = "compare" | "friends";

type ManualTradeCard = CardSearchPickerResult & {
  gradedLabel?: string | null;
  itemKind?: "card" | "sealed";
};

interface TradeCollectionEntry {
  key: string;
  kind: "card" | "sealed";
  cardId: string | null;
  productId: string | null;
  name: string;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  imageUrl: string | null;
  value: number | null;
  availableCopies: number;
  gradedLabel: string | null;
}

const TRADE_VALUE_RATE_STORAGE_KEY = "dustycards.trade.value-rate.v1";
const TRADE_VALUE_RATE_OPTIONS = [80, 85, 90, 95, 100] as const;
const DEFAULT_TRADE_VALUE_RATE = 90;
const TRADE_COLLECTION_BATCH_SIZE = 36;

function normalizeTradeValueRate(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return TRADE_VALUE_RATE_OPTIONS.includes(
    parsed as (typeof TRADE_VALUE_RATE_OPTIONS)[number]
  )
    ? parsed
    : DEFAULT_TRADE_VALUE_RATE;
}

function matchCount(opportunity: SocialTradeOpportunity): number {
  return (
    opportunity.matches.yourCardsTheyWant.length +
    opportunity.matches.theirCardsYouWant.length
  );
}

function ManualCardPicker({
  label,
  selected,
  onOpen,
  onOpenCollection,
  onClear,
}: {
  label: string;
  selected: ManualTradeCard | null;
  onOpen: () => void;
  onOpenCollection: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="min-w-0 rounded-2xl border border-white/8 bg-black/14 p-2.5"
      data-trade-card-picker={label === "Trade side A" ? "left" : "right"}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.11em] text-white/40">
          {label}
        </p>
        {selected ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-violet-300/14 bg-violet-500/[0.06] px-2 text-[9px] font-bold text-violet-100/62 hover:bg-violet-500/[0.11] hover:text-white"
            >
              <Search className="h-3 w-3" /> Change
            </button>
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-violet-300/14 bg-violet-500/[0.06] px-2 text-[9px] font-bold text-violet-100/62 hover:bg-violet-500/[0.11] hover:text-white"
            >
              <UsersRound className="h-3 w-3" /> Mine
            </button>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/8 text-white/32 hover:bg-white/[0.05] hover:text-white/70"
              aria-label={`Clear ${label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="flex min-h-24 items-center gap-3 rounded-xl border border-violet-300/12 bg-violet-500/[0.045] p-2.5">
          <span className="relative aspect-[63/88] w-14 shrink-0 overflow-hidden rounded-lg">
            {selected.image_url ? (
              <CachedImage
                sourceUrl={selected.image_url}
                alt=""
                fill
                sizes="56px"
                className="object-contain"
                unoptimized
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-white/84">{selected.name}</strong>
            <small className="mt-0.5 block truncate text-[10px] text-white/36">
              {selected.episode_name}
              {selected.episode_code ? ` · ${selected.episode_code}` : ""}
              {selected.card_number ? ` · #${selected.card_number}` : ""}
            </small>
            {selected.gradedLabel ? (
              <small className="mt-1 inline-block rounded-md border border-amber-300/22 bg-amber-500/[0.09] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-amber-100/82">
                {selected.gradedLabel}
              </small>
            ) : null}
            <span className="mt-2 block text-lg font-black tabular-nums text-white">
              {selected.cm_en_lowest_nm == null
                ? "No EU price"
                : formatCollectionCurrency(selected.cm_en_lowest_nm)}
            </span>
          </span>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="group flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed border-white/9 bg-white/[0.018] p-3 text-left transition-colors hover:border-violet-300/20 hover:bg-violet-500/[0.045]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/14 bg-violet-500/[0.08] text-violet-100/52 transition-colors group-hover:text-violet-100">
              <Search className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <strong className="block text-xs font-black text-white/68">Search all cards</strong>
              <small className="mt-1 block text-[9px] leading-snug text-white/30">
                Open the full card search with clear images, sets and EU prices.
              </small>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenCollection}
            className="group flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed border-white/9 bg-white/[0.018] p-3 text-left transition-colors hover:border-violet-300/20 hover:bg-violet-500/[0.045]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/14 bg-violet-500/[0.08] text-violet-100/52 transition-colors group-hover:text-violet-100">
              <UsersRound className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <strong className="block text-xs font-black text-white/68">From my collection</strong>
              <small className="mt-1 block text-[9px] leading-snug text-white/30">
                Pick an owned card, including graded slabs at their graded value.
              </small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function CollectionTradePickerDialog({
  label,
  game,
  suggestedValue,
  onClose,
  onSelect,
}: {
  label: string;
  game: TradingCardGameFilter;
  suggestedValue: number | null;
  onClose: () => void;
  onSelect: (entry: TradeCollectionEntry) => void;
}) {
  const [entries, setEntries] = useState<TradeCollectionEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(TRADE_COLLECTION_BATCH_SIZE);

  useEffect(() => {
    const controller = new AbortController();
    const params = game === "all" ? "" : `?game=${encodeURIComponent(game)}`;
    void fetch(`/api/social/trade-collection${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const payload = (await response.json()) as { entries?: TradeCollectionEntry[] };
        return Array.isArray(payload.entries) ? payload.entries : [];
      })
      .then((nextEntries) => {
        if (!controller.signal.aborted) setEntries(nextEntries);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [game]);

  const visibleEntries = useMemo(() => {
    if (!entries) return [];
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? entries.filter((entry) =>
          [entry.name, entry.episodeName, entry.cardNumber, entry.gradedLabel, entry.kind]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(normalized))
        )
      : entries;
    if (suggestedValue == null) return filtered;
    // With the other side already chosen, closest trade value first.
    return [...filtered].sort((left, right) => {
      const leftDistance = left.value == null ? Number.POSITIVE_INFINITY : Math.abs(left.value - suggestedValue);
      const rightDistance = right.value == null ? Number.POSITIVE_INFINITY : Math.abs(right.value - suggestedValue);
      return leftDistance - rightDistance || (right.value ?? -1) - (left.value ?? -1);
    });
  }, [entries, query, suggestedValue]);
  const renderedEntries = visibleEntries.slice(0, visibleLimit);

  return (
    <div
      className={`${modalBottomSheetOverlayClass} z-[260] sm:p-5`}
      role="dialog"
      aria-modal="true"
      aria-label={`${label}: pick from your collection`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className={`${modalBottomSheetPanelClass} max-w-2xl`}>
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.11em] text-white/40">{label}</p>
            <p className="mt-0.5 text-xs font-bold text-white/74">
              From my collection
              {suggestedValue != null ? ` · best match around ${formatCollectionCurrency(suggestedValue)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 text-white/40 hover:bg-white/[0.06] hover:text-white"
            aria-label="Close collection picker"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <label className="mx-3.5 mt-3 flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-2.5 focus-within:border-violet-300/24">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleLimit(TRADE_COLLECTION_BATCH_SIZE);
            }}
            placeholder="Search your collection..."
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-white/72 outline-none placeholder:text-white/25"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5">
          {failed ? (
            <p className="rounded-xl border border-dashed border-white/8 px-3 py-6 text-center text-[11px] text-white/36">Your collection could not be loaded. Close and try again.</p>
          ) : entries == null ? (
            <p className="rounded-xl border border-dashed border-white/8 px-3 py-6 text-center text-[11px] text-white/36">Loading your collection...</p>
          ) : renderedEntries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/8 px-3 py-6 text-center text-[11px] text-white/36">No owned cards match this search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {renderedEntries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => onSelect(entry)}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/6 bg-white/[0.025] p-1.5 text-left transition-colors hover:border-violet-300/24 hover:bg-violet-500/[0.07]"
                >
                  <span className={`relative w-full shrink-0 overflow-hidden rounded-lg bg-black/20 ${entry.kind === "sealed" ? "aspect-[4/3]" : "aspect-[63/88]"}`}>
                    {entry.imageUrl ? <CachedImage sourceUrl={entry.imageUrl} alt="" fill sizes="(max-width: 640px) 42vw, 220px" className="object-contain" unoptimized /> : null}
                  </span>
                  <span className="flex w-full min-w-0 items-start justify-between gap-2 px-0.5 pb-0.5 pt-1.5">
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[11px] text-white/82">{entry.name}</strong>
                      <small className="block truncate text-[9px] text-white/38">
                        {entry.episodeName} {entry.cardNumber ? `#${entry.cardNumber}` : ""}
                      </small>
                      {entry.gradedLabel ? (
                        <small className="mt-1 inline-block rounded border border-amber-300/22 bg-amber-500/[0.09] px-1 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] text-amber-100/82">
                          {entry.gradedLabel}
                        </small>
                      ) : entry.kind === "sealed" ? (
                        <small className="mt-1 inline-block rounded border border-violet-300/22 bg-violet-500/[0.09] px-1 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] text-violet-100/82">
                          Sealed
                        </small>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right text-[10px] font-black tabular-nums text-white/64">
                      {entry.value == null ? "--" : formatCollectionCurrency(entry.value)}
                      {entry.availableCopies > 1 ? <small className="block text-[8px] text-white/34">x{entry.availableCopies}</small> : null}
                    </span>
                  </span>
                </button>
              ))}
              {renderedEntries.length < visibleEntries.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((current) => current + TRADE_COLLECTION_BATCH_SIZE)}
                  className="col-span-full rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-[10px] font-black text-white/52 transition-colors hover:border-violet-300/18 hover:bg-violet-500/[0.06] hover:text-white/78"
                >
                  Show {Math.min(TRADE_COLLECTION_BATCH_SIZE, visibleEntries.length - renderedEntries.length)} more
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ManualTradeCompare({ game }: { game: TradingCardGameFilter }) {
  const [left, setLeft] = useState<ManualTradeCard | null>(null);
  const [right, setRight] = useState<ManualTradeCard | null>(null);
  const [pickerSide, setPickerSide] = useState<"left" | "right" | null>(null);
  const [collectionPickerSide, setCollectionPickerSide] = useState<"left" | "right" | null>(null);
  const [tradeValueRate, setTradeValueRate] = useState(DEFAULT_TRADE_VALUE_RATE);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setTradeValueRate(
          normalizeTradeValueRate(window.localStorage.getItem(TRADE_VALUE_RATE_STORAGE_KEY))
        );
      } catch {
        // Device storage can be unavailable in privacy modes; keep the default.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectTradeValueRate(nextRate: number) {
    const normalized = normalizeTradeValueRate(nextRate);
    setTradeValueRate(normalized);
    try {
      window.localStorage.setItem(TRADE_VALUE_RATE_STORAGE_KEY, String(normalized));
    } catch {
      // The current selection remains usable even when it cannot be persisted.
    }
  }

  const leftValue = left?.cm_en_lowest_nm ?? null;
  const rightValue = right?.cm_en_lowest_nm ?? null;
  const leftTradeTarget =
    leftValue == null ? null : Number(((leftValue * tradeValueRate) / 100).toFixed(2));
  const rightTradeTarget =
    rightValue == null ? null : Number(((rightValue * 100) / tradeValueRate).toFixed(2));
  const difference =
    leftTradeTarget != null && rightValue != null
      ? Number((leftTradeTarget - rightValue).toFixed(2))
      : null;
  const absoluteDifference = difference == null ? null : Math.abs(difference);
  const largestValue = Math.max(leftTradeTarget ?? 0, rightValue ?? 0);
  const differencePercent =
    absoluteDifference != null && largestValue > 0
      ? Number(((absoluteDifference / largestValue) * 100).toFixed(1))
      : null;
  const fair =
    absoluteDifference != null &&
    differencePercent != null &&
    (absoluteDifference <= 1 || differencePercent <= 8);
  const close = differencePercent != null && differencePercent <= 20;

  return (
    <div className="mt-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.11em] text-white/38">
            Trade value convention
          </p>
          <p className="mt-0.5 text-[9px] text-white/30">
            Side B is matched against this percentage of side A&apos;s EU market value.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1" aria-label="Trade value percentage">
          {TRADE_VALUE_RATE_OPTIONS.map((rate) => {
            const active = rate === tradeValueRate;
            return (
              <button
                key={rate}
                type="button"
                aria-pressed={active}
                onClick={() => selectTradeValueRate(rate)}
                className={`h-8 rounded-xl border px-2.5 text-[10px] font-black tabular-nums transition-colors ${
                  active
                    ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.14)] text-[var(--dc-primary)] shadow-sm shadow-[rgb(var(--dc-primary-rgb)/0.12)]"
                    : "border-[rgb(var(--dc-border-rgb)/0.78)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.66)] text-[rgb(var(--dc-text-primary-rgb)/0.48)] hover:border-[rgb(var(--dc-primary-rgb)/0.24)] hover:text-[var(--dc-text-primary)]"
                }`}
              >
                {rate}%
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <ManualCardPicker
          label="Trade side A"
          selected={left}
          onOpen={() => setPickerSide("left")}
          onOpenCollection={() => setCollectionPickerSide("left")}
          onClear={() => setLeft(null)}
        />
        <button
          type="button"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white/42 transition-colors hover:bg-white/[0.07] hover:text-white"
          aria-label="Swap trade sides"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <ManualCardPicker
          label="Trade side B"
          selected={right}
          onOpen={() => setPickerSide("right")}
          onOpenCollection={() => setCollectionPickerSide("right")}
          onClear={() => setRight(null)}
        />
      </div>

      {left && right ? (
        <div
          className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 ${
            difference == null
              ? "border-white/8 bg-white/[0.025]"
              : fair
                ? "border-emerald-300/16 bg-emerald-500/[0.055]"
                : close
                  ? "border-amber-300/16 bg-amber-500/[0.05]"
                  : "border-rose-300/16 bg-rose-500/[0.05]"
          }`}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.11em] text-white/38">
              Trade balance
            </p>
            <p className="mt-0.5 text-xs font-bold text-white/74">
              {difference == null
                ? "A current EU price is missing on one side."
                : fair
                  ? "Fair market-value trade"
                  : difference > 0
                    ? `Side B needs about ${formatCollectionCurrency(absoluteDifference ?? 0)} extra`
                    : `Side A needs about ${formatCollectionCurrency(absoluteDifference ?? 0)} extra`}
            </p>
          </div>
          {difference != null ? (
            <div className="text-right">
              <p className="text-lg font-black tabular-nums text-white">
                {formatCollectionCurrency(absoluteDifference ?? 0)}
              </p>
              <p className="text-[9px] font-bold text-white/34">
                {differencePercent}% difference · {tradeValueRate}% convention
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-center text-[10px] text-white/30">
          Pick one card on each side to compare the current EU market value.
        </p>
      )}

      {pickerSide ? (
        <CardSearchPickerDialog
          key={pickerSide}
          label={pickerSide === "left" ? "Trade side A" : "Trade side B"}
          game={game}
          selectedCardId={(pickerSide === "left" ? left : right)?.id ?? null}
          excludedCardId={pickerSide === "right" ? left?.id ?? null : right?.id ?? null}
          suggestedValue={pickerSide === "right" ? leftValue : rightValue}
          suggestedPercentage={tradeValueRate}
          suggestionDirection={pickerSide === "right" ? "multiply" : "divide"}
          percentageOptions={TRADE_VALUE_RATE_OPTIONS}
          onSuggestedPercentageChange={selectTradeValueRate}
          onClose={() => setPickerSide(null)}
          onSelect={(card) => {
            if (pickerSide === "left") {
              setLeft(card);
              setPickerSide(right ? null : "right");
              return;
            }
            setRight(card);
            setPickerSide(null);
          }}
        />
      ) : null}

      {collectionPickerSide ? (
        <CollectionTradePickerDialog
          key={collectionPickerSide}
          label={collectionPickerSide === "left" ? "Trade side A" : "Trade side B"}
          game={game}
          suggestedValue={collectionPickerSide === "right" ? leftTradeTarget : rightTradeTarget}
          onClose={() => setCollectionPickerSide(null)}
          onSelect={(entry) => {
            const card: ManualTradeCard = {
              id: entry.key,
              name: entry.name,
              card_number: entry.cardNumber,
              image_url: entry.imageUrl,
              episode_name: entry.episodeName,
              episode_code: entry.episodeCode,
              cm_en_lowest_nm: entry.value,
              gradedLabel: entry.gradedLabel,
              itemKind: entry.kind,
            };
            if (collectionPickerSide === "left") {
              setLeft(card);
              setCollectionPickerSide(null);
              if (!right) setPickerSide("right");
              return;
            }
            setRight(card);
            setCollectionPickerSide(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TradeColumn({
  title,
  cards,
  suggestedCardIds,
  selectedCardId,
  onSelect,
  targetValue = null,
}: {
  title: string;
  cards: SocialTradeMatchCard[];
  suggestedCardIds: string[];
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
  /** Value selected on the opposite side (already rate-adjusted); closest-value cards sort first. */
  targetValue?: number | null;
}) {
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(TRADE_COLLECTION_BATCH_SIZE);
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;
  const suggested = useMemo(() => new Set(suggestedCardIds), [suggestedCardIds]);
  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? cards.filter((card) =>
          [card.name, card.episodeName, card.cardNumber, card.gradedLabel, card.kind]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(normalized))
        )
      : cards;
    if (targetValue != null) {
      // A card is selected on the opposite side: closest trade value wins, so
      // fair trades surface immediately. Unpriced cards sink to the end.
      return [...filtered].sort((left, right) => {
        const leftDistance = left.value == null ? Number.POSITIVE_INFINITY : Math.abs(left.value - targetValue);
        const rightDistance = right.value == null ? Number.POSITIVE_INFINITY : Math.abs(right.value - targetValue);
        return (
          leftDistance - rightDistance ||
          Number(suggested.has(right.id)) - Number(suggested.has(left.id)) ||
          (right.value ?? -1) - (left.value ?? -1)
        );
      });
    }
    return [...filtered].sort((left, right) =>
      Number(suggested.has(right.id)) - Number(suggested.has(left.id)) ||
      (right.value ?? -1) - (left.value ?? -1)
    );
  }, [cards, query, suggested, targetValue]);
  const renderedCards = visibleCards.slice(0, visibleLimit);

  return (
    <div className="min-w-0 rounded-2xl border border-white/8 bg-black/14 p-2.5">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <h3 className="truncate text-[11px] font-black text-white/72">{title}</h3>
        <span className="shrink-0 text-right text-[10px] font-black tabular-nums text-violet-100/66">
          {selectedCard?.value == null
            ? `${cards.length} owned`
            : formatCollectionCurrency(selectedCard.value)}
        </span>
      </div>
      {targetValue != null && !selectedCard ? (
        <p className="mb-2 rounded-lg border border-emerald-300/14 bg-emerald-500/[0.05] px-2.5 py-1.5 text-[9px] font-bold text-emerald-100/72">
          Sorted by best match around {formatCollectionCurrency(targetValue)}
        </p>
      ) : null}
      {cards.length > 6 ? (
        <label className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-2.5 focus-within:border-violet-300/24 focus-within:bg-violet-500/[0.045]">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleLimit(TRADE_COLLECTION_BATCH_SIZE);
            }}
            placeholder="Search this collection..."
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-white/72 outline-none placeholder:text-white/25"
            aria-label={`Search ${title}`}
          />
          {query ? (
            <button type="button" onClick={() => {
              setQuery("");
              setVisibleLimit(TRADE_COLLECTION_BATCH_SIZE);
            }} className="text-white/28 hover:text-white/70" aria-label="Clear collection search">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      ) : null}
      {cards.length > 0 ? (
        visibleCards.length > 0 ? (
        <div className="grid max-h-[46rem] grid-cols-[repeat(auto-fill,minmax(8.25rem,1fr))] gap-2 overflow-y-auto overscroll-contain pr-1">
          {renderedCards.map((card) => {
            const selected = card.id === selectedCardId;
            const isSuggested = suggested.has(card.id);
            return (
              <button
                key={card.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(card.id)}
                className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border p-1.5 text-left transition-colors ${
                  selected
                    ? "border-violet-300/36 bg-violet-500/[0.14] ring-1 ring-violet-300/18"
                    : "border-white/6 bg-white/[0.025] hover:border-white/14 hover:bg-white/[0.05]"
                }`}
              >
                <span className={`relative w-full shrink-0 overflow-hidden rounded-lg bg-black/20 ${card.kind === "sealed" ? "aspect-[4/3]" : "aspect-[63/88]"}`}>
                  {card.imageUrl ? <CachedImage sourceUrl={card.imageUrl} alt="" fill sizes="(max-width: 640px) 42vw, (max-width: 1024px) 28vw, (max-width: 1536px) 20vw, 210px" className="object-contain transition-transform duration-200 group-hover:scale-[1.015]" unoptimized /> : null}
                </span>
                <span className="flex w-full min-w-0 items-start justify-between gap-2 px-0.5 pb-0.5 pt-1.5">
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px] text-white/82">{card.name}</strong>
                    <small className="block truncate text-[9px] text-white/38">
                    {card.episodeName} {card.cardNumber ? `#${card.cardNumber}` : ""}
                    </small>
                    {card.gradedLabel ? (
                      <small className="mt-1 block truncate rounded border border-amber-300/22 bg-amber-500/[0.09] px-1 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] text-amber-100/88">
                        {card.gradedLabel} · graded price
                      </small>
                    ) : card.kind === "sealed" ? (
                      <small className="mt-1 block text-[8px] font-black uppercase tracking-[0.08em] text-violet-200/78">Sealed product</small>
                    ) : null}
                    {isSuggested ? <small className="mt-1 block text-[8px] font-black uppercase tracking-[0.08em] text-emerald-200/72">Wanted match</small> : null}
                  </span>
                  <span className="shrink-0 text-right text-[10px] font-black tabular-nums text-white/64">
                    {card.value == null ? "--" : formatCollectionCurrency(card.value)}
                    {card.gradedLabel ? <small className="block text-[8px] uppercase tracking-[0.06em] text-amber-100/58">slab</small> : null}
                    {card.availableCopies > 1 ? <small className="block text-[8px] text-white/34">x{card.availableCopies}</small> : null}
                  </span>
                </span>
                <span className={`absolute right-2 top-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm ${selected ? "border-violet-200/60 bg-violet-500 text-white" : "border-white/18 bg-black/55 text-transparent"}`}>
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
              </button>
            );
          })}
          {renderedCards.length < visibleCards.length ? (
            <button
              type="button"
              onClick={() => setVisibleLimit((current) => current + TRADE_COLLECTION_BATCH_SIZE)}
              className="col-span-full rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-[10px] font-black text-white/52 transition-colors hover:border-violet-300/18 hover:bg-violet-500/[0.06] hover:text-white/78"
            >
              Show {Math.min(TRADE_COLLECTION_BATCH_SIZE, visibleCards.length - renderedCards.length)} more
            </button>
          ) : null}
        </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/8 px-3 py-5 text-center text-[10px] text-white/32">No cards match this search.</p>
        )
      ) : (
        <p className="rounded-xl border border-dashed border-white/8 px-3 py-5 text-center text-[10px] text-white/32">No cards in this collection.</p>
      )}
    </div>
  );
}

function FriendTradeMatches({ opportunities }: { opportunities: SocialTradeOpportunity[] }) {
  const initialId = opportunities.find((opportunity) => matchCount(opportunity) > 0)?.friend.id ?? opportunities[0]?.friend.id ?? null;
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(initialId);
  const [selectedYourCardId, setSelectedYourCardId] = useState<string | null>(null);
  const [selectedTheirCardId, setSelectedTheirCardId] = useState<string | null>(null);
  const [tradeValueRate, setTradeValueRate] = useState(DEFAULT_TRADE_VALUE_RATE);

  // Same stored convention as the manual compare: side B is matched against
  // this percentage of side A's (your) EU market value.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setTradeValueRate(
          normalizeTradeValueRate(window.localStorage.getItem(TRADE_VALUE_RATE_STORAGE_KEY))
        );
      } catch {
        // Device storage can be unavailable in privacy modes; keep the default.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selected = opportunities.find((opportunity) => opportunity.friend.id === selectedFriendId) ?? opportunities[0] ?? null;
  const yourCard = selected?.matches.yourCollectionCards.find((card) => card.id === selectedYourCardId) ?? null;
  const theirCard = selected?.matches.theirCollectionCards.find((card) => card.id === selectedTheirCardId) ?? null;
  // Pick a card on one side and the other column sorts around the matching
  // trade value, so fair counterparts appear on top immediately.
  const theirTargetValue = yourCard?.value != null
    ? Number(((yourCard.value * tradeValueRate) / 100).toFixed(2))
    : null;
  const yourTargetValue = theirCard?.value != null
    ? Number(((theirCard.value * 100) / tradeValueRate).toFixed(2))
    : null;
  const balance = yourCard?.value != null && theirCard?.value != null
    ? Number((yourCard.value - theirCard.value).toFixed(2))
    : null;

  if (opportunities.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-white/8 bg-black/10 px-4 py-5 text-center">
        <p className="text-xs font-bold text-white/58">No Full Access friend connected yet.</p>
        <p className="mt-1 text-[10px] text-white/34">The free card comparison remains available without friends.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {opportunities.map((opportunity) => {
          const active = opportunity.friend.id === selected?.friend.id;
          return (
            <button
              key={opportunity.friend.id}
              type="button"
              onClick={() => {
                setSelectedFriendId(opportunity.friend.id);
                setSelectedYourCardId(null);
                setSelectedTheirCardId(null);
              }}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black transition-colors ${active ? "border-violet-300/28 bg-violet-500/[0.16] text-violet-50" : "border-white/8 bg-white/[0.025] text-white/42 hover:text-white/70"}`}
            >
              {opportunity.friend.displayName}
              <span className="text-[8px] opacity-55">{matchCount(opportunity)} candidates</span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <>
          <p className="mt-2 rounded-xl border border-violet-300/10 bg-violet-500/[0.04] px-3 py-2 text-[10px] leading-4 text-white/42">
            Wanted matches are highlighted first, but you can choose any owned card from either collection.
          </p>
          <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
            <TradeColumn
              key={`your-${selected.friend.id}`}
              title="You can offer"
              cards={selected.matches.yourCollectionCards}
              suggestedCardIds={selected.matches.yourCardsTheyWant.map((card) => card.id)}
              selectedCardId={selectedYourCardId}
              onSelect={(cardId) => setSelectedYourCardId((current) => current === cardId ? null : cardId)}
              targetValue={yourTargetValue}
            />
            <ArrowLeftRight className="mx-auto hidden h-4 w-4 text-violet-200/36 lg:block" />
            <TradeColumn
              key={`their-${selected.friend.id}`}
              title={`${selected.friend.displayName} can offer`}
              cards={selected.matches.theirCollectionCards}
              suggestedCardIds={selected.matches.theirCardsYouWant.map((card) => card.id)}
              selectedCardId={selectedTheirCardId}
              onSelect={(cardId) => setSelectedTheirCardId((current) => current === cardId ? null : cardId)}
              targetValue={theirTargetValue}
            />
          </div>
          <div className={`mt-2 rounded-xl border px-3 py-2.5 ${balance == null ? "border-white/8 bg-white/[0.02]" : Math.abs(balance) <= 1 ? "border-emerald-300/16 bg-emerald-500/[0.055]" : "border-amber-300/14 bg-amber-500/[0.045]"}`}>
            <p className="text-[9px] font-black uppercase tracking-[0.11em] text-white/34">Selected trade</p>
            <p className="mt-1 text-xs font-bold text-white/70">
              {balance == null
                ? "Choose one suggestion on both sides."
                : Math.abs(balance) <= 1
                  ? "Values are closely balanced."
                  : balance > 0
                    ? `${selected.friend.displayName} would add about ${formatCollectionCurrency(Math.abs(balance))}.`
                    : `You would add about ${formatCollectionCurrency(Math.abs(balance))}.`}
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}

export default function TradeOpportunitiesPanel({
  opportunities,
  game,
  friendsPending = false,
  onFriendsOpen,
}: {
  opportunities: SocialTradeOpportunity[];
  game: TradingCardGameFilter;
  friendsPending?: boolean;
  onFriendsOpen?: () => void;
}) {
  const [mode, setMode] = useState<PanelMode>("compare");

  return (
    <section className="binder-panel overflow-visible rounded-[var(--ui-page-header-radius)] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-500/[0.1] text-violet-100"><ArrowLeftRight className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-200/48">Trading</p>
            <h2 className="mt-0.5 text-sm font-black text-white">Trade center</h2>
            <p className="mt-0.5 text-[10px] text-white/38">Compare any two cards or find automatic friend matches.</p>
          </div>
        </div>
        <Link href="/social" prefetch={false} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 px-2.5 text-[9px] font-black text-white/54 transition-colors hover:bg-white/[0.05] hover:text-white"><UsersRound className="h-3 w-3" /> Friends</Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => setMode("compare")} aria-pressed={mode === "compare"} className={`h-9 rounded-xl border text-[10px] font-black transition-colors ${mode === "compare" ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)]" : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"}`}>Compare two cards</button>
        <button
          type="button"
          onClick={() => {
            setMode("friends");
            onFriendsOpen?.();
          }}
          aria-pressed={mode === "friends"}
          className={`h-9 rounded-xl border text-[10px] font-black transition-colors ${mode === "friends" ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)]" : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"}`}
        >
          Friend trades
        </button>
      </div>

      {mode === "compare" ? (
        <ManualTradeCompare game={game} />
      ) : friendsPending ? (
        <div className="mt-3 rounded-2xl border border-violet-300/10 bg-violet-500/[0.04] px-4 py-5 text-center">
          <p className="text-xs font-bold text-white/58">Comparing friend collections…</p>
          <p className="mt-1 text-[10px] text-white/34">The free card comparison remains available.</p>
        </div>
      ) : (
        <FriendTradeMatches opportunities={opportunities} />
      )}
    </section>
  );
}
