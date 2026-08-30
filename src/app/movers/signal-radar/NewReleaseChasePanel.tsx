"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  ChevronDown,
  Check,
  Clock3,
  CircleAlert,
  Radar,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import {
  CardListTile,
  CardListTileAnalysisLink,
  CardListTileBody,
  CardListTileFooter,
  CardListTileGrid,
  CardListTileHeader,
  CardListTileInsight,
  CardListTileLink,
  CardListTileMedia,
} from "@/components/CardListTile";
import CollectionCardQuickActions, {
  CollectionCardQuickActionsPlaceholder,
} from "@/components/CollectionCardQuickActions";
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

function formatLiveAge(value: string | null, nowMs: number): string {
  if (!value) return "Awaiting first direct check";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Awaiting first direct check";
  const minutes = Math.max(0, Math.floor((nowMs - timestamp) / 60_000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

function formatNextCheck(value: string | null, nowMs: number): string {
  if (!value) return "No check scheduled";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No check scheduled";
  const remainingMinutes = Math.ceil((timestamp - nowMs) / 60_000);
  if (remainingMinutes <= 0) return "Check due now";
  if (remainingMinutes < 60) return `Next check in ${remainingMinutes}m`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `Next check in ${hours}h${minutes ? ` ${minutes}m` : ""}`;
}

function watchStateLabel(state: ExpansionChaseRadarData["priceWatch"]["state"]): string {
  switch (state) {
    case "current": return "Current";
    case "due_soon": return "Due soon";
    case "queued": return "Queued";
    case "updating": return "Refreshing";
    case "delayed": return "Delayed";
    case "paused": return "Budget paused";
    case "confirming": return "Confirming move";
    default: return "Unavailable";
  }
}

function liveWatchState(
  state: ExpansionChaseRadarData["priceWatch"]["state"],
  nextRefreshAt: string | null,
  nowMs: number
): ExpansionChaseRadarData["priceWatch"]["state"] {
  if (state !== "current" && state !== "due_soon") return state;
  const next = nextRefreshAt ? new Date(nextRefreshAt).getTime() : Number.NaN;
  if (!Number.isFinite(next)) return state;
  if (next < nowMs - 15 * 60_000) return "delayed";
  if (next <= nowMs + 15 * 60_000) return "due_soon";
  return "current";
}

function watchScheduleCopy(
  state: ExpansionChaseRadarData["priceWatch"]["state"],
  nextRefreshAt: string | null,
  nowMs: number
): string {
  if (state === "paused") return "Automatic checks paused";
  if (state === "updating") return "Checking CardMarket now";
  if (state === "confirming") return "Confirming unusual price move";
  if (state === "unavailable") return "Direct price unavailable";
  return formatNextCheck(nextRefreshAt, nowMs);
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
      label: "Partial price coverage",
      description: "Some current market prices are unavailable, so treat every ranking as an early read.",
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

function buySignalClasses(label: ExpansionChaseRadarCard["buySignal"]["label"]): string {
  if (label === "strong_buy") {
    return "border-emerald-300/28 bg-emerald-400/[0.14] text-emerald-100";
  }
  if (label === "buy") {
    return "border-cyan-300/24 bg-cyan-400/[0.11] text-cyan-100";
  }
  if (label === "strong_sell") {
    return "border-rose-300/28 bg-rose-400/[0.14] text-rose-100";
  }
  if (label === "sell") {
    return "border-orange-300/24 bg-orange-400/[0.11] text-orange-100";
  }
  return "border-amber-300/22 bg-amber-400/[0.09] text-amber-100";
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
  prioritizeImage = false,
  nowMs,
  refreshState,
  onRefresh,
}: {
  card: ExpansionChaseRadarCard;
  episodeId: string;
  game: TradingCardGame;
  quickActionData: CardQuickActionData | undefined;
  prioritizeImage?: boolean;
  nowMs: number;
  refreshState?: { phase: "idle" | "loading" | "success" | "confirming" | "error"; message?: string };
  onRefresh?: () => void;
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

  const insight = driver ?? card.verdict.summary;

  return (
    <CardListTile
      interactive
      accent="radar"
      layout="showcase"
      data-chase-verdict={card.verdict.key}
      data-buy-signal={card.buySignal.label}
      data-chase-card-id={card.cardId}
    >
      <CardListTileLink
        href={detailHref}
        prefetch={false}
        label={`Open full chase analysis for ${card.name}`}
        data-chase-card-link
      />

      <CardListTileMedia
        imageUrl={card.imageUrl}
        className="pointer-events-none relative z-[1]"
      >
        {card.imageUrl ? (
          <CachedImage
            sourceUrl={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 640px) 116px, 120px"
            loading={prioritizeImage ? "eager" : undefined}
            preload={prioritizeImage}
            className="object-contain"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/22">
            <Boxes className="h-7 w-7" />
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-md border border-white/15 bg-black/78 px-1.5 py-1 text-[9px] font-black text-white shadow-sm">
          #{card.setRank}
        </span>
      </CardListTileMedia>

      <CardListTileBody className="pointer-events-none relative z-[1]">
        <CardListTileHeader
          badges={
            <span className="flex max-w-full flex-wrap items-center gap-1">
              <span
                className={cx(
                  "inline-flex truncate rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em]",
                  buySignalClasses(card.buySignal.label)
                )}
                title={`${card.buySignal.label_text} · ${card.buySignal.confidence} confidence`}
              >
                {card.buySignal.label_text}
              </span>
              <span
                className={cx(
                  "inline-flex truncate rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em]",
                  verdictClasses(card.verdict.key)
                )}
              >
                {card.verdict.label}
              </span>
            </span>
          }
          priceLabel="Raw"
          priceValue={formatCurrency(card.currentPrice, card.currency)}
          title={card.name}
          meta={card.watch.enabled ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span className="truncate">
                {card.cardNumber ? `#${card.cardNumber} / ` : ""}{card.rarity ?? "Rarity pending"}
              </span>
              <span className="shrink-0 text-cyan-100/52">
                {card.priceSource === "cardmarket-direct"
                  ? `/ Direct EN/NM / ${formatLiveAge(card.watch.lastSuccessAt, nowMs).replace("Updated ", "")}`
                  : "/ Awaiting direct check"}
              </span>
            </span>
          ) : (
            <span className="truncate">
              {card.cardNumber ? `#${card.cardNumber} · ` : ""}{card.rarity ?? "Rarity pending"}
            </span>
          )}
        />

        <CardListTileInsight>
          <Radar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300/72" />
          <span className="line-clamp-2">
            <strong className="font-bold text-white/82">
              {card.buySignal.label_text} {card.buySignal.score}/100
            </strong>
            {" · "}
            {insight}
          </span>
        </CardListTileInsight>

        <CardListTileFooter
          data-chase-card-footer
          className="max-[359px]:flex-col max-[359px]:items-stretch max-[359px]:gap-1"
        >
          <CardListTileAnalysisLink
            data-chase-analysis-link
            className="max-[359px]:w-full max-[359px]:justify-center"
          >
            Analysis
            <ArrowUpRight className="h-3.5 w-3.5 max-[359px]:hidden" />
          </CardListTileAnalysisLink>
          <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1.5 max-[359px]:self-end" data-chase-card-actions>
            {onRefresh ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRefresh();
                }}
                disabled={refreshState?.phase === "loading"}
                className={cx(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-wait",
                  refreshState?.phase === "success"
                    ? "border-emerald-300/28 bg-emerald-400/[0.11] text-emerald-200"
                    : refreshState?.phase === "confirming"
                      ? "border-amber-300/28 bg-amber-400/[0.1] text-amber-200"
                      : refreshState?.phase === "error"
                        ? "border-rose-300/28 bg-rose-400/[0.1] text-rose-200"
                        : "border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] text-white/62 hover:border-violet-300/30 hover:text-violet-100"
                )}
                aria-label={refreshState?.phase === "loading" ? `Refreshing ${card.name} price` : `Refresh ${card.name} price now`}
                title={refreshState?.message ?? "Refresh this CardMarket EN/NM price now"}
                data-chase-manual-sync
              >
                {refreshState?.phase === "loading" ? (
                  <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />
                ) : refreshState?.phase === "success" ? (
                  <Check className="h-4 w-4" />
                ) : refreshState?.phase === "confirming" || refreshState?.phase === "error" ? (
                  <CircleAlert className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            ) : null}
            {quickActionData ? (
              <CollectionCardQuickActions data={quickActionData} />
            ) : (
              <CollectionCardQuickActionsPlaceholder />
            )}
          </div>
        </CardListTileFooter>
        {refreshState?.phase && refreshState.phase !== "idle" && refreshState.phase !== "loading" ? (
          <span className={cx(
            "mt-1 line-clamp-2 text-right text-[9px] leading-4",
            refreshState.phase === "success" ? "text-emerald-200/72" : refreshState.phase === "confirming" ? "text-amber-200/72" : "text-rose-200/72"
          )} aria-live="polite">
            {refreshState.message}
          </span>
        ) : null}
        <span className="sr-only">
          {showObservedMove ? "Seven-day move" : "Projected 180-day move"}: {showObservedMove
            ? signedWholePercent(card.changeVs7dPct)
            : projectedReturn == null || card.scenarioConfidence === "Low"
              ? "Learning"
              : signedWholePercent(displayedMove)}. Confidence {card.scenarioConfidence ?? "Learning"}.
        </span>
      </CardListTileBody>
    </CardListTile>
  );
}

export default function NewReleaseChasePanel({
  data,
  cardQuickActions,
  manualRefreshHref = null,
  onDataChange,
}: {
  data: ExpansionChaseRadarData;
  cardQuickActions: CardQuickActionMap;
  manualRefreshHref?: string | null;
  onDataChange?: (data: ExpansionChaseRadarData) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [refreshStates, setRefreshStates] = useState<Record<string, { phase: "idle" | "loading" | "success" | "confirming" | "error"; message?: string }>>({});
  const [nowMs, setNowMs] = useState(() => new Date(data.generatedAt).getTime());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const status = readinessCopy(data);
  const effectiveWatchState = liveWatchState(
    data.priceWatch.state,
    data.priceWatch.nextRefreshAt,
    nowMs
  );
  const visibleCards = showAll ? data.cards : data.cards.slice(0, INITIAL_CARD_LIMIT);
  const refreshCard = async (cardId: string) => {
    if (!manualRefreshHref || refreshStates[cardId]?.phase === "loading") return;
    setRefreshStates((current) => ({ ...current, [cardId]: { phase: "loading" } }));
    try {
      const response = await fetch(manualRefreshHref, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        result?: { status?: string; error?: string | null };
        newReleaseChases?: ExpansionChaseRadarData;
      };
      if (payload.newReleaseChases) onDataChange?.(payload.newReleaseChases);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.result?.error || payload.error || "Price refresh failed.");
      }
      const confirming = payload.result?.status === "confirming";
      setRefreshStates((current) => ({
        ...current,
        [cardId]: {
          phase: confirming ? "confirming" : "success",
          message: confirming ? "Large move found. Tap again to confirm it." : "Direct EN/NM price updated.",
        },
      }));
    } catch (error) {
      setRefreshStates((current) => ({
        ...current,
        [cardId]: {
          phase: "error",
          message: error instanceof Error ? error.message : "Price refresh failed.",
        },
      }));
    }
  };

  return (
    <section
      id="new-release-chases"
      aria-label={`New release chase radar for ${data.episode.name}`}
      className="relative overflow-hidden rounded-[1.6rem] border border-[rgb(var(--dc-border-rgb)/0.92)] p-3.5 shadow-[0_22px_70px_rgba(0,0,0,0.18)] sm:p-5"
      style={{
        background:
          "radial-gradient(circle at 12% 0%, rgb(var(--dc-primary-rgb) / 0.13), transparent 32%), linear-gradient(145deg, rgb(var(--dc-surface-elevated-rgb) / 0.98), rgb(var(--dc-surface-primary-rgb) / 0.98))",
      }}
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
          prefetch={false}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-xs font-bold text-white/68 transition hover:border-violet-300/22 hover:bg-violet-400/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Open {data.episode.code ?? "set"}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <dl
        className="mt-4 grid grid-cols-1 divide-y divide-white/8 overflow-hidden rounded-xl border border-white/9 bg-black/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        data-testid="new-release-chase-watch-status"
      >
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
            <dt className="text-[11px] font-semibold text-white/40">
              {data.priceWatch.enabled ? "Direct chase watch" : "Price coverage"}
            </dt>
            {data.priceWatch.enabled ? (
              <>
                <dd className="mt-0.5 truncate text-sm font-bold text-white/76">
                  {data.priceWatch.sourceLabel} / EN/NM
                </dd>
                <dd className="truncate text-[11px] text-white/38">
                  {data.priceWatch.currentCount}/{data.priceWatch.trackedCount} tracked prices current
                </dd>
              </>
            ) : (
              <dd className="mt-0.5 truncate text-sm font-bold text-white/76">
                {data.pricedCardCount} of {data.episode.localCardCount} cards priced
              </dd>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          {effectiveWatchState === "paused" || effectiveWatchState === "delayed" ? <ShieldAlert className="h-4 w-4 shrink-0 text-rose-200/62" /> : <Radar className="h-4 w-4 shrink-0 text-violet-200/62" />}
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold text-white/40">
              {data.priceWatch.enabled ? watchStateLabel(effectiveWatchState) : "Latest market read"}
            </dt>
            {data.priceWatch.enabled ? (
              <>
                <dd className="mt-0.5 truncate text-sm font-bold text-white/76" data-testid="new-release-chase-next-check">
                  {watchScheduleCopy(effectiveWatchState, data.priceWatch.nextRefreshAt, nowMs)}
                </dd>
                <dd className="truncate text-[11px] text-white/38">
                  {formatLiveAge(data.priceWatch.lastSuccessAt, nowMs)}
                </dd>
              </>
            ) : (
              <dd className="mt-0.5 truncate text-sm font-bold text-white/76">
                {formatLiveAge(data.priceAsOf, nowMs)}
              </dd>
            )}
          </div>
        </div>
      </dl>

      {visibleCards.length > 0 ? (
        <CardListTileGrid className="mt-4">
          {visibleCards.map((card, index) => (
            <ChaseCard
              key={card.cardId}
              card={card}
              episodeId={data.episode.id}
              game={data.episode.game}
              quickActionData={cardQuickActions[card.cardId]}
              prioritizeImage={index === 0}
              nowMs={nowMs}
              refreshState={refreshStates[card.cardId]}
              onRefresh={manualRefreshHref && card.watch.enabled ? () => void refreshCard(card.cardId) : undefined}
            />
          ))}
        </CardListTileGrid>
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
