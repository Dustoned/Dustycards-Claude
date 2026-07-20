"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  ChevronDown,
  Clock3,
  Radar,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import CollectionCardQuickActions from "@/components/CollectionCardQuickActions";
import type {
  CardQuickActionData,
  CardQuickActionMap,
} from "@/lib/card-quick-actions";
import type {
  ExpansionChaseRadarCard,
  ExpansionChaseRadarData,
} from "@/lib/expansion-chase-radar";
import { formatCurrency } from "@/lib/format";
import { getExpansionHref, type TradingCardGame } from "@/lib/games";

const INITIAL_CARD_LIMIT = 3;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatAge(days: number | null): string {
  if (days == null) return "Release date unknown";
  if (days < 1) return "Released today";
  const rounded = Math.floor(days);
  return `${rounded} day${rounded === 1 ? "" : "s"} live`;
}

function signedWholePercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function formatQuoteAge(value: string | null, generatedAt: string): string {
  if (!value) return "No quote yet";
  const timestamp = new Date(value).getTime();
  const generatedTimestamp = new Date(generatedAt).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(generatedTimestamp)) return "No quote yet";
  const hours = Math.max(0, Math.floor((generatedTimestamp - timestamp) / 3_600_000));
  if (hours < 1) return "Updated this hour";
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

function readinessCopy(data: ExpansionChaseRadarData): {
  label: string;
  description: string;
  tone: "violet" | "amber" | "emerald" | "rose";
} {
  if (data.readiness === "catalog_missing") {
    return {
      label: "Awaiting card list",
      description: "Radar can start ranking as soon as cards arrive in the local catalog.",
      tone: "amber",
    };
  }
  if (data.readiness === "prices_loading") {
    return {
      label: "Prices still loading",
      description: "Only a partial market view is available, so treat every ranking as an early read.",
      tone: "amber",
    };
  }
  if (data.readiness === "price_discovery") {
    return {
      label: "Launch market",
      description: "Early-release asks can move fast. Radar is deliberately conservative until more sold history lands.",
      tone: "violet",
    };
  }
  if (data.readiness === "stale") {
    return {
      label: "Refresh required",
      description: "The chase order is useful, but current prices must refresh before the market verdict is trusted.",
      tone: "rose",
    };
  }
  return {
    label: "Market read active",
    description: "Chases are ranked by market timing, scarcity, set position and available demand evidence.",
    tone: "emerald",
  };
}

function statusClasses(tone: ReturnType<typeof readinessCopy>["tone"]): string {
  if (tone === "emerald") return "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-100/80";
  if (tone === "rose") return "border-rose-300/18 bg-rose-400/[0.08] text-rose-100/80";
  if (tone === "amber") return "border-amber-300/18 bg-amber-400/[0.08] text-amber-100/80";
  return "border-violet-300/18 bg-violet-400/[0.08] text-violet-100/82";
}

function verdictClasses(key: ExpansionChaseRadarCard["verdict"]["key"]): string {
  if (key === "strong_watch") {
    return "border-emerald-300/20 bg-emerald-400/[0.09] text-emerald-100";
  }
  if (key === "building") {
    return "border-violet-300/20 bg-violet-400/[0.09] text-violet-100";
  }
  if (key === "cooling") {
    return "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  }
  if (key === "price_discovery" || key === "data_stale") {
    return "border-amber-300/20 bg-amber-400/[0.08] text-amber-100";
  }
  return "border-white/10 bg-white/[0.045] text-white/66";
}

function modelReturn(card: ExpansionChaseRadarCard): number | null {
  if (!card.scenario || card.scenario.currentPrice <= 0) return null;
  if (card.scenario.expectedReturnPct180 != null) {
    return card.scenario.expectedReturnPct180;
  }
  const horizon =
    card.scenario.points.find((point) => point.days === 180) ??
    card.scenario.points.at(-1);
  return horizon
    ? ((horizon.base - card.scenario.currentPrice) / card.scenario.currentPrice) * 100
    : null;
}

function ChaseCard({
  card,
  episodeId,
  game,
  quickActionData,
}: {
  card: ExpansionChaseRadarCard;
  episodeId: string;
  game: TradingCardGame;
  quickActionData: CardQuickActionData | undefined;
}) {
  const projectedReturn = modelReturn(card);
  const showObservedMove =
    card.scenarioConfidence === "Low" && card.changeVs7dPct != null;
  const displayedMove = showObservedMove ? card.changeVs7dPct : projectedReturn;
  const detailHref = `/movers/signal-radar/${encodeURIComponent(card.cardId)}?game=${game}&fromSet=${encodeURIComponent(episodeId)}`;
  const driver =
    card.scenario?.drivers.find(
      (item) =>
        item !== "launch price discovery" &&
        item !== "post-release stabilization"
    ) ?? null;

  return (
    <article
      className={cx(
        "group relative grid min-w-0 cursor-pointer grid-cols-[5.25rem_minmax(0,1fr)] gap-3 overflow-hidden rounded-[1.25rem] border bg-[linear-gradient(145deg,rgba(20,22,32,0.98),rgba(11,13,20,0.98))] p-3 shadow-[0_16px_42px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-300/28 focus-within:border-violet-300/32 sm:grid-cols-[6rem_minmax(0,1fr)]",
        card.setRank === 1 ? "border-violet-300/24" : "border-white/10"
      )}
      data-chase-verdict={card.verdict.key}
      data-chase-card-id={card.cardId}
    >
      <Link
        href={detailHref}
        aria-label={`Open full chase analysis for ${card.name}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
        data-chase-card-link
      >
        <span className="sr-only">Open full chase analysis for {card.name}</span>
      </Link>
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/55 to-transparent opacity-70" />
      <div className="pointer-events-none relative aspect-[63/88] w-full overflow-hidden rounded-[0.75rem] border border-white/10 bg-black/30 shadow-lg shadow-black/30">
        {card.imageUrl ? (
          <CachedImage
            sourceUrl={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 640px) 84px, 96px"
            className="object-contain"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/22">
            <Boxes className="h-7 w-7" />
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-md border border-white/15 bg-black/78 px-1.5 py-1 text-[9px] font-black text-white shadow-sm">
          SET #{card.setRank}
        </span>
      </div>

      <div className="pointer-events-none flex min-w-0 flex-col">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <span
              className={cx(
                "inline-flex rounded-lg border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em]",
                verdictClasses(card.verdict.key)
              )}
            >
              {card.verdict.label}
            </span>
            <h3 className="mt-2 line-clamp-2 text-[15px] font-extrabold leading-5 tracking-tight text-white transition group-hover:text-violet-100">
              {card.name}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-white/58">
              {card.cardNumber ? `#${card.cardNumber} · ` : ""}{card.rarity ?? "Rarity pending"}
            </p>
          </div>
          <p className="shrink-0 text-sm font-extrabold tabular-nums text-white">
            {formatCurrency(card.currentPrice, card.currency)}
          </p>
        </div>

        <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/68">
          {card.verdict.summary}
        </p>
        {driver ? (
          <p className="mt-1 line-clamp-1 text-[11px] font-medium text-white/52">
            {driver}
          </p>
        ) : null}
      </div>

      <dl className="pointer-events-none col-span-2 grid min-w-0 grid-cols-3 gap-1.5">
          <div className="min-w-0 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5">
            <dt className="text-[11px] font-semibold text-white/56">Radar</dt>
            <dd className="mt-0.5 text-xs font-bold tabular-nums text-white/82">{card.opportunityScore}/100</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5">
            <dt className="text-[11px] font-semibold text-white/56">{showObservedMove ? "vs 7d" : "180d"}</dt>
            <dd className={cx("mt-0.5 text-xs font-bold tabular-nums", displayedMove != null && displayedMove < 0 ? "text-rose-200/82" : "text-cyan-200/82")}>
              {showObservedMove
                ? signedWholePercent(card.changeVs7dPct)
                : projectedReturn == null || card.scenarioConfidence === "Low"
                  ? "Learning"
                  : signedWholePercent(projectedReturn)}
            </dd>
          </div>
          <div className="min-w-0 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5">
            <dt className="text-[11px] font-semibold text-white/56">Confidence</dt>
            <dd className="mt-0.5 truncate text-xs font-bold text-white/82">{card.scenarioConfidence ?? "Learning"}</dd>
          </div>
        </dl>

      <div className="pointer-events-none col-span-2 flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="pointer-events-none inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300/14 bg-violet-400/[0.07] px-3 text-xs font-bold text-violet-100/82 transition group-hover:border-violet-300/28 group-hover:bg-violet-400/[0.12]"
        >
          <span className="truncate">Full chase analysis</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </span>
        {quickActionData ? (
          <div className="pointer-events-auto relative z-10 shrink-0" data-chase-card-actions>
            <CollectionCardQuickActions data={quickActionData} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function NewReleaseChasePanel({
  data,
  cardQuickActions,
}: {
  data: ExpansionChaseRadarData;
  cardQuickActions: CardQuickActionMap;
}) {
  const [showAll, setShowAll] = useState(false);
  const status = readinessCopy(data);
  const visibleCards = showAll ? data.cards : data.cards.slice(0, INITIAL_CARD_LIMIT);

  return (
    <section
      id="new-release-chases"
      aria-label={`New release chase radar for ${data.episode.name}`}
      className="relative overflow-hidden rounded-[1.6rem] border border-violet-300/14 bg-[radial-gradient(circle_at_12%_0%,rgba(124,92,255,0.13),transparent_32%),linear-gradient(145deg,rgba(17,18,28,0.98),rgba(8,10,16,0.98))] p-3.5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] sm:p-5"
      data-testid="new-release-chase-radar"
    >
      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-200/74">
            <Sparkles className="h-3.5 w-3.5" />
            New set chase radar
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              {data.episode.name}: what Radar thinks
            </h2>
            <span className={cx("rounded-lg border px-2.5 py-1 text-[11px] font-bold", statusClasses(status.tone))}>
              {status.label}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/54">
            {status.description}
          </p>
        </div>

        <Link
          href={getExpansionHref(data.episode.id)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-xs font-bold text-white/68 transition hover:border-violet-300/22 hover:bg-violet-400/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Open {data.episode.code ?? "set"}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-1 divide-y divide-white/8 overflow-hidden rounded-xl border border-white/9 bg-black/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Clock3 className="h-4 w-4 shrink-0 text-violet-200/62" />
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold text-white/40">Set stage</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-white/76">{formatAge(data.releaseAgeDays)}</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <BarChart3 className="h-4 w-4 shrink-0 text-cyan-200/62" />
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold text-white/40">Price coverage</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-white/76">{data.pricedCardCount} of {data.episode.localCardCount} cards priced</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          {data.freshness === "stale" ? <ShieldAlert className="h-4 w-4 shrink-0 text-rose-200/62" /> : <Radar className="h-4 w-4 shrink-0 text-violet-200/62" />}
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold text-white/40">Latest market read</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-white/76">{formatQuoteAge(data.priceAsOf, data.generatedAt)}</dd>
          </div>
        </div>
      </dl>

      {visibleCards.length > 0 ? (
        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visibleCards.map((card) => (
            <ChaseCard
              key={card.cardId}
              card={card}
              episodeId={data.episode.id}
              game={data.episode.game}
              quickActionData={cardQuickActions[card.cardId]}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-28 items-center gap-3 rounded-xl border border-dashed border-white/10 bg-black/16 px-4 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/14 bg-amber-400/[0.07] text-amber-100/70">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-white/76">No chase verdicts yet</p>
            <p className="mt-1 text-xs leading-5 text-white/42">Cards or usable market prices are still being imported.</p>
          </div>
        </div>
      )}

      {data.cards.length > INITIAL_CARD_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mx-auto mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-5 text-xs font-bold text-white/60 transition hover:border-violet-300/20 hover:bg-violet-400/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          aria-expanded={showAll}
        >
          {showAll ? "Show top 3" : `Show all ${data.cards.length} chases`}
          <ChevronDown className={cx("h-4 w-4 transition-transform", showAll && "rotate-180")} />
        </button>
      ) : null}
    </section>
  );
}
