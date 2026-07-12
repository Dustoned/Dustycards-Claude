"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  LoaderCircle,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import EmptyState from "@/components/EmptyState";
import { SectionHeader } from "@/components/PageHeader";
import type { ModalCardData } from "@/components/card-modal/types";
import { textMatchesSearchQuery } from "@/lib/card-search";
import { formatCurrency } from "@/lib/format";
import type {
  ExternalCardSignal,
  ExternalSignalConfidence,
  ExternalSignalSourceStatus,
} from "@/lib/external-signal-radar";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

type ConfidenceFilter = "all" | Lowercase<ExternalSignalConfidence>;
type SortKey = "signal" | "meta" | "reach";

interface Props {
  signals: ExternalCardSignal[];
  sources: ExternalSignalSourceStatus[];
  generatedAt: string;
}

const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceFilter; label: string }> = [
  { value: "all", label: "All signals" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "emerging", label: "Emerging" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "signal", label: "Signal strength" },
  { value: "meta", label: "Meta share" },
  { value: "reach", label: "Archetype reach" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getConfidenceClasses(confidence: ExternalSignalConfidence): string {
  if (confidence === "High") {
    return "border-emerald-300/22 bg-emerald-400/[0.1] text-emerald-200";
  }
  if (confidence === "Medium") {
    return "border-sky-300/20 bg-sky-400/[0.09] text-sky-200";
  }
  return "border-amber-300/20 bg-amber-400/[0.09] text-amber-200";
}

function SignalCard({
  signal,
  loading,
  onOpen,
}: {
  signal: ExternalCardSignal;
  loading: boolean;
  onOpen: (cardId: string) => void;
}) {
  const primaryEvidence = signal.evidence.slice(0, 2);

  return (
    <article className="group relative min-w-0 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(145deg,rgba(21,24,35,0.98),rgba(12,14,22,0.98))] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition duration-200 hover:border-violet-300/22 sm:p-4">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/55 to-transparent opacity-65" />
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onOpen(signal.cardId)}
          disabled={loading}
          className="relative aspect-[0.715] w-[5.8rem] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left shadow-lg shadow-black/25 transition hover:border-violet-300/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:w-[7rem] 2xl:w-[7.5rem]"
          aria-label={`Open ${signal.name} card details`}
        >
          {signal.imageUrl ? (
            <CachedImage
              sourceUrl={signal.imageUrl}
              alt={signal.name}
              fill
              sizes="(max-width: 640px) 96px, 128px"
              className="object-contain"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-white/22">
              <Boxes className="h-7 w-7" />
            </span>
          )}
          {loading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/65">
              <LoaderCircle className="h-5 w-5 animate-spin text-violet-200" />
            </span>
          ) : null}
          <span className="absolute left-1.5 top-1.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/75 px-1.5 text-[10px] font-black tabular-nums text-white shadow-sm">
            #{signal.rank}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cx(
                    "inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]",
                    getConfidenceClasses(signal.confidence)
                  )}
                >
                  {signal.confidence} confidence
                </span>
                <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  {signal.game === "one-piece" ? "One Piece" : "Pokemon"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpen(signal.cardId)}
                disabled={loading}
                className="mt-2 block max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <h3 className="truncate text-base font-bold tracking-tight text-white transition group-hover:text-violet-100 sm:text-lg">
                  {signal.name}
                </h3>
              </button>
              <p className="mt-0.5 truncate text-[11px] text-white/42 sm:text-xs">
                {signal.episodeName}
                {signal.cardNumber ? ` / ${signal.cardNumber}` : ""}
                {signal.rarity ? ` / ${signal.rarity}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/32">
                Market context
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-white sm:text-base">
                {formatCurrency(signal.currentPrice, signal.currency)}
              </p>
            </div>
          </div>

          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
            <div className="rounded-xl border border-violet-300/14 bg-violet-400/[0.07] px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-200/68">
                <Radar className="h-3 w-3" />
                External score
              </div>
              <p className="mt-1 text-base font-black tabular-nums text-violet-100">
                {signal.externalScore}<span className="text-xs text-white/32">/100</span>
              </p>
            </div>
            <div className="rounded-xl border border-emerald-300/14 bg-emerald-400/[0.065] px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200/68">
                <Sparkles className="h-3 w-3" />
                Signal tier
              </div>
              <p className="mt-1 text-base font-black tabular-nums text-emerald-100">
                {signal.pressureLabel}
              </p>
            </div>
          </div>

          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/35">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400 shadow-[0_0_16px_rgba(139,92,246,0.38)]"
              style={{ width: `${signal.externalScore}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-xl border border-white/8 bg-black/18 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">
            Why it is on the radar
          </p>
          <ul className="mt-2 space-y-1.5">
            {signal.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-[11px] leading-4 text-white/63">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300/75" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/18 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">
              External evidence
            </p>
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">
              {signal.horizon}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {primaryEvidence.map((item) => (
              <Link
                key={`${item.deckUrl}:${item.deckName}`}
                href={item.deckUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-2 text-[10px] transition hover:border-violet-300/20 hover:bg-violet-400/[0.06]"
              >
                <span className="min-w-0 truncate font-semibold text-white/68">{item.deckName}</span>
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-violet-200/75">
                  {item.inclusionPercent.toFixed(0)}% in deck
                  <ArrowUpRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-[9px] leading-4 text-white/28">
        {signal.pressureExplanation}. Competitive demand can change quickly after bans,
        reprints or new releases.
      </p>
    </article>
  );
}

export default function ExternalSignalBrowser({ signals, sources, generatedAt }: Props) {
  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("signal");
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const activeCardRequestRef = useRef(0);
  const deferredSearch = useDeferredValue(search);

  const visibleSignals = useMemo(() => {
    const query = deferredSearch.trim();
    return signals
      .filter((signal) => {
        if (confidence !== "all" && signal.confidence.toLowerCase() !== confidence) return false;
        if (!query) return true;
        return textMatchesSearchQuery(
          `${signal.name} ${signal.episodeName} ${signal.episodeCode ?? ""} ${signal.cardNumber ?? ""} ${signal.rarity ?? ""}`,
          query
        );
      })
      .sort((left, right) => {
        if (sortKey === "meta") {
          return right.maxDeckSharePercent - left.maxDeckSharePercent;
        }
        if (sortKey === "reach") {
          return right.archetypeCount - left.archetypeCount || right.externalScore - left.externalScore;
        }
        return right.externalScore - left.externalScore || left.rank - right.rank;
      });
  }, [confidence, deferredSearch, signals, sortKey]);

  const openCard = useCallback(
    async (cardId: string) => {
      const requestId = activeCardRequestRef.current + 1;
      activeCardRequestRef.current = requestId;
      const cached = detailCache[cardId];
      if (cached) {
        setLoadingCardId(null);
        setSelectedCard(cached);
        setDetailError(null);
        return;
      }

      setLoadingCardId(cardId);
      setDetailError(null);
      try {
        const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Could not load card details");
        const data = (await response.json()) as ModalCardData;
        if (activeCardRequestRef.current !== requestId) return;
        setDetailCache((current) => ({ ...current, [cardId]: data }));
        setSelectedCard(data);
      } catch (error) {
        if (activeCardRequestRef.current !== requestId) return;
        setDetailError(error instanceof Error ? error.message : "Could not load card details");
      } finally {
        if (activeCardRequestRef.current === requestId) {
          setLoadingCardId((current) => (current === cardId ? null : current));
        }
      }
    },
    [detailCache]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="binder-panel rounded-[1.5rem] p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">Search signal cards</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search card, set or rarity..."
              className="h-10 w-full rounded-xl border border-white/9 bg-black/24 pl-10 pr-9 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-violet-400/35 focus:ring-2 focus:ring-violet-500/12"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/35 transition hover:bg-white/8 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-1">
            {CONFIDENCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setConfidence(option.value)}
                className={cx(
                  "h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold transition",
                  confidence === option.value
                    ? "bg-violet-500 text-white shadow-sm"
                    : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3">
            <BarChart3 className="h-4 w-4 text-white/32" />
            <span className="sr-only">Sort signals</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-10 min-w-0 bg-transparent pr-2 text-[11px] font-semibold text-white/62 outline-none [color-scheme:dark]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {detailError ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/18 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-100/80">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {detailError}
        </div>
      ) : null}

      <section>
        <SectionHeader
          eyebrow="External demand"
          title="Signal candidates"
          count={visibleSignals.length}
          description="Actionable prints ranked on tournament meta share, core-deck inclusion and use across leading archetypes — never on DustyCards price momentum."
          actions={
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/32">
              Updated {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Amsterdam",
              }).format(new Date(generatedAt))}
            </span>
          }
        />

        {visibleSignals.length > 0 ? (
          <div
            className="grid min-w-0 gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
            }}
          >
            {visibleSignals.map((signal) => (
              <SignalCard
                key={signal.cardId}
                signal={signal}
                loading={loadingCardId === signal.cardId}
                onOpen={(cardId) => void openCard(cardId)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Radar}
            title="No signals match these filters"
            description="Clear the search or choose another confidence level. If a source is temporarily unavailable, the last successful shared result remains cached."
            actionHref={null}
          />
        )}
      </section>

      <section className="grid gap-3 rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300/72" />
          <div>
            <p className="text-sm font-semibold text-white/78">Signal, not a promise</p>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-white/42">
              Breakout tiers describe observed external demand pressure, not a price target or guarantee. An exact x-prediction is deliberately withheld until enough historical signals can be backtested. Bans, rotation, supply and reprints can reverse the setup.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((source) => (
            <Link
              key={source.game}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition hover:bg-white/[0.07]",
                source.ok
                  ? "border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-100/70"
                  : "border-rose-300/14 bg-rose-400/[0.055] text-rose-100/70"
              )}
            >
              {source.ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              {source.label}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      </section>

      {selectedCard ? (
        <CardModal
          key={`${selectedCard.id}:${selectedCard.price_fetched_at ?? "none"}`}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      ) : null}
    </div>
  );
}
