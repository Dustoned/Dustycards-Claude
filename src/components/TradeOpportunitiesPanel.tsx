"use client";

import Link from "next/link";
import { ArrowLeftRight, Search, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CachedImage from "@/components/CachedImage";
import { formatCollectionCurrency } from "@/lib/collection";
import type { TradingCardGameFilter } from "@/lib/games";
import type {
  SocialTradeMatchCard,
  SocialTradeOpportunity,
} from "@/lib/social";

type PanelMode = "compare" | "friends";

type ManualTradeCard = {
  id: string;
  name: string;
  card_number: string | null;
  image_url: string | null;
  episode_name: string;
  episode_code: string | null;
  cm_en_lowest_nm: number | null;
};

function matchCount(opportunity: SocialTradeOpportunity): number {
  return (
    opportunity.matches.yourCardsTheyWant.length +
    opportunity.matches.theirCardsYouWant.length
  );
}

function ManualCardPicker({
  label,
  game,
  selected,
  onSelect,
}: {
  label: string;
  game: TradingCardGameFilter;
  selected: ManualTradeCard | null;
  onSelect: (card: ManualTradeCard | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ManualTradeCard[]>([]);
  const [loading, setLoading] = useState(false);
  const trimmedQuery = query.trim();
  const visibleResults = !selected && trimmedQuery.length >= 2 ? results : [];

  useEffect(() => {
    if (selected || trimmedQuery.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmedQuery, game });
        const response = await fetch(`/api/search?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          singles?: ManualTradeCard[];
        };
        if (response.ok) setResults((payload.singles ?? []).slice(0, 6));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [game, selected, trimmedQuery]);

  return (
    <div className="min-w-0 rounded-2xl border border-white/8 bg-black/14 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.11em] text-white/40">
          {label}
        </p>
        {selected ? (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/8 px-2 text-[9px] font-bold text-white/42 hover:text-white/70"
          >
            <X className="h-3 w-3" /> Change
          </button>
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
        <div className="relative">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-white/9 bg-white/[0.025] px-3 focus-within:border-violet-300/24 focus-within:bg-violet-500/[0.04]">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
              }}
              aria-label={`Search card for ${label}`}
              placeholder="Search any card..."
              className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder:text-white/25"
            />
            {loading ? <span className="text-[8px] font-bold text-white/28">Searching</span> : null}
          </label>

          {visibleResults.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 grid max-h-64 gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/96 p-1.5 shadow-2xl backdrop-blur-2xl">
              {visibleResults.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => {
                    onSelect(card);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex min-w-0 items-center gap-2 rounded-xl p-1.5 text-left hover:bg-white/[0.06]"
                >
                  <span className="relative aspect-[63/88] w-8 shrink-0 overflow-hidden rounded-md">
                    {card.image_url ? (
                      <CachedImage
                        sourceUrl={card.image_url}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-contain"
                        unoptimized
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[10px] text-white/76">
                      {card.name}
                    </strong>
                    <small className="block truncate text-[8px] text-white/32">
                      {card.episode_name} {card.card_number ? `#${card.card_number}` : ""}
                    </small>
                  </span>
                  <span className="shrink-0 text-[9px] font-black tabular-nums text-white/52">
                    {card.cm_en_lowest_nm == null
                      ? "--"
                      : formatCollectionCurrency(card.cm_en_lowest_nm)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ManualTradeCompare({ game }: { game: TradingCardGameFilter }) {
  const [left, setLeft] = useState<ManualTradeCard | null>(null);
  const [right, setRight] = useState<ManualTradeCard | null>(null);
  const leftValue = left?.cm_en_lowest_nm ?? null;
  const rightValue = right?.cm_en_lowest_nm ?? null;
  const difference =
    leftValue != null && rightValue != null ? Number((leftValue - rightValue).toFixed(2)) : null;
  const absoluteDifference = difference == null ? null : Math.abs(difference);
  const largestValue = Math.max(leftValue ?? 0, rightValue ?? 0);
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
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <ManualCardPicker label="Trade side A" game={game} selected={left} onSelect={setLeft} />
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
        <ManualCardPicker label="Trade side B" game={game} selected={right} onSelect={setRight} />
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
                {differencePercent}% difference · EU market
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-center text-[10px] text-white/30">
          Pick one card on each side to compare the current EU market value.
        </p>
      )}
    </div>
  );
}

function TradeColumn({
  title,
  value,
  cards,
}: {
  title: string;
  value: number;
  cards: SocialTradeMatchCard[];
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/8 bg-black/14 p-2.5">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <h3 className="truncate text-[11px] font-black text-white/72">{title}</h3>
        <span className="shrink-0 text-[10px] font-black tabular-nums text-violet-100/66">
          {formatCollectionCurrency(value)}
        </span>
      </div>
      {cards.length > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {cards.slice(0, 6).map((card) => (
            <div key={card.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/6 bg-white/[0.025] p-1.5">
              <span className="relative aspect-[63/88] w-8 shrink-0 overflow-hidden rounded-md">
                {card.imageUrl ? <CachedImage sourceUrl={card.imageUrl} alt="" fill sizes="32px" className="object-contain" unoptimized /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[10px] text-white/76">{card.name}</strong>
                <small className="block truncate text-[8px] text-white/32">{card.episodeName} {card.cardNumber ? `#${card.cardNumber}` : ""}</small>
              </span>
              <span className="shrink-0 text-right text-[9px] font-black tabular-nums text-white/54">
                {card.value == null ? "--" : formatCollectionCurrency(card.value)}
                {card.availableCopies > 1 ? <small className="block text-[8px] text-white/30">x{card.availableCopies}</small> : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/8 px-3 py-5 text-center text-[10px] text-white/32">No current match.</p>
      )}
    </div>
  );
}

function FriendTradeMatches({ opportunities }: { opportunities: SocialTradeOpportunity[] }) {
  const initialId = opportunities.find((opportunity) => matchCount(opportunity) > 0)?.friend.id ?? opportunities[0]?.friend.id ?? null;
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(initialId);
  const selected = opportunities.find((opportunity) => opportunity.friend.id === selectedFriendId) ?? opportunities[0] ?? null;

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
              onClick={() => setSelectedFriendId(opportunity.friend.id)}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black transition-colors ${active ? "border-violet-300/28 bg-violet-500/[0.16] text-violet-50" : "border-white/8 bg-white/[0.025] text-white/42 hover:text-white/70"}`}
            >
              {opportunity.friend.displayName}
              <span className="text-[8px] opacity-55">{matchCount(opportunity)}</span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
          <TradeColumn title="You can offer" value={selected.matches.yourOfferValue} cards={selected.matches.yourCardsTheyWant} />
          <ArrowLeftRight className="mx-auto hidden h-4 w-4 text-violet-200/36 lg:block" />
          <TradeColumn title={`${selected.friend.displayName} can offer`} value={selected.matches.theirOfferValue} cards={selected.matches.theirCardsYouWant} />
        </div>
      ) : null}
    </>
  );
}

export default function TradeOpportunitiesPanel({
  opportunities,
  game,
}: {
  opportunities: SocialTradeOpportunity[];
  game: TradingCardGameFilter;
}) {
  const [mode, setMode] = useState<PanelMode>("compare");
  const totalMatches = useMemo(() => opportunities.reduce((total, opportunity) => total + matchCount(opportunity), 0), [opportunities]);

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

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/12 p-1">
        <button type="button" onClick={() => setMode("compare")} className={`h-8 rounded-lg text-[10px] font-black transition-colors ${mode === "compare" ? "bg-violet-500/[0.2] text-violet-50" : "text-white/38 hover:text-white/64"}`}>Compare two cards</button>
        <button type="button" onClick={() => setMode("friends")} className={`h-8 rounded-lg text-[10px] font-black transition-colors ${mode === "friends" ? "bg-violet-500/[0.2] text-violet-50" : "text-white/38 hover:text-white/64"}`}>Friend matches · {totalMatches}</button>
      </div>

      {mode === "compare" ? (
        <ManualTradeCompare game={game} />
      ) : (
        <FriendTradeMatches opportunities={opportunities} />
      )}
    </section>
  );
}
