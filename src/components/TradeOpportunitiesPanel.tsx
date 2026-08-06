"use client";

import Link from "next/link";
import { ArrowLeftRight, Check, Search, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CachedImage from "@/components/CachedImage";
import CardSearchPickerDialog, {
  type CardSearchPickerResult,
} from "@/components/CardSearchPickerDialog";
import { formatCollectionCurrency } from "@/lib/collection";
import type { TradingCardGameFilter } from "@/lib/games";
import type {
  SocialTradeMatchCard,
  SocialTradeOpportunity,
} from "@/lib/social";

type PanelMode = "compare" | "friends";

type ManualTradeCard = CardSearchPickerResult;

const TRADE_VALUE_RATE_STORAGE_KEY = "dustycards.trade.value-rate.v1";
const TRADE_VALUE_RATE_OPTIONS = [80, 85, 90, 95, 100] as const;
const DEFAULT_TRADE_VALUE_RATE = 90;

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
  onClear,
}: {
  label: string;
  selected: ManualTradeCard | null;
  onOpen: () => void;
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
            <span className="mt-2 block text-lg font-black tabular-nums text-white">
              {selected.cm_en_lowest_nm == null
                ? "No EU price"
                : formatCollectionCurrency(selected.cm_en_lowest_nm)}
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="group flex min-h-24 w-full items-center gap-3 rounded-xl border border-dashed border-white/9 bg-white/[0.018] p-3 text-left transition-colors hover:border-violet-300/20 hover:bg-violet-500/[0.045]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/14 bg-violet-500/[0.08] text-violet-100/52 transition-colors group-hover:text-violet-100">
            <Search className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <strong className="block text-xs font-black text-white/68">Choose a card</strong>
            <small className="mt-1 block text-[9px] leading-snug text-white/30">
              Open the full card search with clear images, sets and EU prices.
            </small>
          </span>
        </button>
      )}
    </div>
  );
}

function ManualTradeCompare({ game }: { game: TradingCardGameFilter }) {
  const [left, setLeft] = useState<ManualTradeCard | null>(null);
  const [right, setRight] = useState<ManualTradeCard | null>(null);
  const [pickerSide, setPickerSide] = useState<"left" | "right" | null>(null);
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
    setRight(null);
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
          suggestedValue={pickerSide === "right" ? leftValue : null}
          suggestedPercentage={tradeValueRate}
          onClose={() => setPickerSide(null)}
          onSelect={(card) => {
            if (pickerSide === "left") {
              setLeft(card);
              setRight(null);
              setPickerSide("right");
              return;
            }
            setRight(card);
            setPickerSide(null);
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
}: {
  title: string;
  cards: SocialTradeMatchCard[];
  suggestedCardIds: string[];
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;
  const suggested = useMemo(() => new Set(suggestedCardIds), [suggestedCardIds]);
  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? cards.filter((card) =>
          [card.name, card.episodeName, card.cardNumber]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(normalized))
        )
      : cards;
    return [...filtered].sort((left, right) =>
      Number(suggested.has(right.id)) - Number(suggested.has(left.id)) ||
      (right.value ?? -1) - (left.value ?? -1)
    );
  }, [cards, query, suggested]);

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
      {cards.length > 6 ? (
        <label className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-2.5 focus-within:border-violet-300/24 focus-within:bg-violet-500/[0.045]">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this collection..."
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-white/72 outline-none placeholder:text-white/25"
            aria-label={`Search ${title}`}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-white/28 hover:text-white/70" aria-label="Clear collection search">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      ) : null}
      {cards.length > 0 ? (
        visibleCards.length > 0 ? (
        <div className="grid max-h-[46rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleCards.map((card) => {
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
                <span className="relative aspect-[63/88] w-full shrink-0 overflow-hidden rounded-lg bg-black/20">
                  {card.imageUrl ? <CachedImage sourceUrl={card.imageUrl} alt="" fill sizes="(max-width: 640px) 42vw, (max-width: 1024px) 28vw, (max-width: 1536px) 20vw, 210px" className="object-contain transition-transform duration-200 group-hover:scale-[1.015]" unoptimized /> : null}
                </span>
                <span className="flex w-full min-w-0 items-start justify-between gap-2 px-0.5 pb-0.5 pt-1.5">
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px] text-white/82">{card.name}</strong>
                    <small className="block truncate text-[9px] text-white/38">
                    {card.episodeName} {card.cardNumber ? `#${card.cardNumber}` : ""}
                    </small>
                    {isSuggested ? <small className="mt-1 block text-[8px] font-black uppercase tracking-[0.08em] text-emerald-200/72">Wanted match</small> : null}
                  </span>
                  <span className="shrink-0 text-right text-[10px] font-black tabular-nums text-white/64">
                    {card.value == null ? "--" : formatCollectionCurrency(card.value)}
                    {card.availableCopies > 1 ? <small className="block text-[8px] text-white/34">x{card.availableCopies}</small> : null}
                  </span>
                </span>
                <span className={`absolute right-2 top-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm ${selected ? "border-violet-200/60 bg-violet-500 text-white" : "border-white/18 bg-black/55 text-transparent"}`}>
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
              </button>
            );
          })}
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
  const selected = opportunities.find((opportunity) => opportunity.friend.id === selectedFriendId) ?? opportunities[0] ?? null;
  const yourCard = selected?.matches.yourCollectionCards.find((card) => card.id === selectedYourCardId) ?? null;
  const theirCard = selected?.matches.theirCollectionCards.find((card) => card.id === selectedTheirCardId) ?? null;
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
            />
            <ArrowLeftRight className="mx-auto hidden h-4 w-4 text-violet-200/36 lg:block" />
            <TradeColumn
              key={`their-${selected.friend.id}`}
              title={`${selected.friend.displayName} can offer`}
              cards={selected.matches.theirCollectionCards}
              suggestedCardIds={selected.matches.theirCardsYouWant.map((card) => card.id)}
              selectedCardId={selectedTheirCardId}
              onSelect={(cardId) => setSelectedTheirCardId((current) => current === cardId ? null : cardId)}
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
