import nextDynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Gauge,
  Layers3,
  PackageCheck,
  Percent,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import GameFilterSwitch, { SegmentedNavLinks } from "@/components/GameFilterSwitch";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  getCollectionOverviewData,
  type CollectionOverviewData,
  type CollectionPageTab,
} from "@/lib/collection-data";
import { getFixedTrackGridTemplate, getSupportTileTrackWidth } from "@/lib/display-scale";
import { getServerUserSettings } from "@/lib/user-settings-server";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getExpansionHref,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { getCachedImageUrl } from "@/lib/image-cache";

const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));
const CollectionOverviewSections = nextDynamic(() => import("@/components/CollectionOverviewSections"));
const CollectionSealedView = nextDynamic(() => import("@/components/CollectionSealedView"));
const BinderOverviewTile = nextDynamic(() => import("@/components/BinderOverviewTile"));

export const dynamic = "force-dynamic";

function isGradedCollectionCard(item: {
  grading_company: string | null;
  grading_grade: string | null;
}) {
  return Boolean(item.grading_company && item.grading_grade);
}

function CollectionValueSummaryCard({
  currentValue,
  pnl,
  rangeLabel,
  className = "",
}: {
  currentValue: number;
  pnl: number;
  rangeLabel: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2.5 ${className}`}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
            Collection Value
          </p>
          <p className="mt-1 truncate text-2xl font-bold leading-tight tabular-nums text-white sm:text-3xl">
            {formatCollectionCurrency(currentValue)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-semibold tabular-nums sm:text-base ${
              pnl >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {pnl >= 0 ? "+" : ""}
            {formatCollectionCurrency(pnl)}
          </p>
          <p className="mt-0.5 text-[11px] text-white/42">P&amp;L</p>
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] text-white/42">{rangeLabel}</p>
    </div>
  );
}

function sumCardViewValue(items: CollectionOverviewData["cards"]): number {
  return Number(
    items.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
  );
}

function sumSealedViewValue(items: CollectionOverviewData["sealed"]): number {
  return Number(
    items
      .reduce((total, item) => total + (item.current_value_per_item ?? 0) * item.quantity, 0)
      .toFixed(2)
  );
}

function sumCardCostBasis(items: CollectionOverviewData["cards"]): number {
  return Number(
    items
      .reduce(
        (total, item) => total + (item.cost_basis_value ?? item.purchase_price ?? 0),
        0
      )
      .toFixed(2)
  );
}

function sumSealedCostBasis(items: CollectionOverviewData["sealed"]): number {
  return Number(
    items
      .reduce(
        (total, item) => total + (item.purchase_price_per_item ?? 0) * item.quantity,
        0
      )
      .toFixed(2)
  );
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";
  if (value === 0) return formatCollectionCurrency(0);
  return `${value > 0 ? "+" : "-"}${formatCollectionCurrency(Math.abs(value))}`;
}

function formatCompactCollectionCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}€${(absolute / 1_000_000).toFixed(1)}m`;
  }

  if (absolute >= 10_000) {
    return `${sign}€${(absolute / 1_000).toFixed(0)}k`;
  }

  if (absolute >= 1_000) {
    return `${sign}€${(absolute / 1_000).toFixed(1)}k`;
  }

  return formatCollectionCurrency(value);
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPlainPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(value >= 10 || value === 0 ? 0 : 1)}%`;
}

function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function safeShare(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function cardDetailHref(item: CollectionOverviewData["cards"][number]) {
  return `${getExpansionHref(item.episode_id)}?card=${encodeURIComponent(item.card_id)}`;
}

function sealedDetailHref(item: CollectionOverviewData["sealed"][number]) {
  return getExpansionHref(item.episode_id);
}

function PortfolioBreakdownItem({
  label,
  count,
  value,
  cost,
  share,
  dotClassName,
  surfaceClassName,
}: {
  label: string;
  count: string;
  value: string;
  cost: string;
  share: number;
  dotClassName: string;
  surfaceClassName: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border px-3 py-2.5 shadow-sm shadow-black/10 ${surfaceClassName}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />
          <div className="min-w-0">
            <p className="break-words text-xs font-black leading-tight text-white">
              {label}
            </p>
            <p className="mt-0.5 break-words text-[10px] font-semibold leading-tight text-white/42">
              {count}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap text-sm font-black leading-tight tabular-nums text-white">
            {value}
          </p>
          <p className="mt-0.5 text-[10px] font-bold tabular-nums text-white/42">
            {share.toFixed(0)}%
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/8 pt-2 text-[10px] font-semibold text-white/38">
        <span>Cost basis</span>
        <span className="tabular-nums text-white/58">{cost}</span>
      </div>
    </div>
  );
}

function PortfolioBreakdownPanel({
  overview,
  rawLooseSingles,
  gradedLooseSingles,
  binderCards,
  sealed,
  binders,
}: {
  overview: CollectionOverviewData["overview"];
  rawLooseSingles: CollectionOverviewData["looseSingles"];
  gradedLooseSingles: CollectionOverviewData["looseSingles"];
  binderCards: CollectionOverviewData["binderCards"];
  sealed: CollectionOverviewData["sealed"];
  binders: CollectionOverviewData["binders"];
}) {
  const sealedUnits = sealed.reduce((total, item) => total + item.quantity, 0);
  const rawBinderCards = binderCards.filter((item) => !isGradedCollectionCard(item));
  const gradedBinderCards = binderCards.filter(isGradedCollectionCard);
  const rawLooseCards = rawLooseSingles.filter((item) => !isGradedCollectionCard(item));
  const gradedCards = [...gradedLooseSingles, ...gradedBinderCards];
  const segments = [
    {
      label: "Loose Raw",
      count: `${rawLooseCards.length.toLocaleString("en-US")} cards`,
      itemCount: rawLooseCards.length,
      value: sumCardViewValue(rawLooseCards),
      cost: sumCardCostBasis(rawLooseCards),
      dotClassName: "bg-sky-400",
      fillClassName: "bg-sky-400",
      surfaceClassName:
        "border-sky-400/14 bg-sky-400/[0.065]",
    },
    {
      label: "Binder Raw",
      count: `${rawBinderCards.length.toLocaleString("en-US")} cards`,
      itemCount: rawBinderCards.length,
      value: sumCardViewValue(rawBinderCards),
      cost: sumCardCostBasis(rawBinderCards),
      dotClassName: "bg-emerald-400",
      fillClassName: "bg-emerald-400",
      surfaceClassName: "border-emerald-400/14 bg-emerald-400/[0.065]",
    },
    {
      label: "Graded",
      count: `${gradedCards.length.toLocaleString("en-US")} cards`,
      itemCount: gradedCards.length,
      value: sumCardViewValue(gradedCards),
      cost: sumCardCostBasis(gradedCards),
      dotClassName: "bg-amber-300",
      fillClassName: "bg-amber-300",
      surfaceClassName: "border-amber-300/14 bg-amber-300/[0.065]",
    },
    {
      label: "Sealed",
      count: `${sealedUnits.toLocaleString("en-US")} units`,
      itemCount: sealedUnits,
      value: sumSealedViewValue(sealed),
      cost: sumSealedCostBasis(sealed),
      dotClassName: "bg-rose-400",
      fillClassName: "bg-rose-400",
      surfaceClassName: "border-rose-400/14 bg-rose-400/[0.065]",
    },
  ].filter((segment) => segment.value > 0 || segment.itemCount > 0);
  const totalValue = segments.reduce((total, segment) => total + segment.value, 0);
  const pricedCards = [...rawLooseCards, ...rawBinderCards, ...gradedCards].filter(
    (item) => item.current_value != null
  ).length;
  const pricedSealedUnits = sealed.reduce(
    (total, item) => total + (item.current_value_per_item != null ? item.quantity : 0),
    0
  );
  const totalItems = rawLooseCards.length + rawBinderCards.length + gradedCards.length + sealedUnits;
  const pricedCoverage = ratioPercent(pricedCards + pricedSealedUnits, totalItems);
  const linkedBinders = binders.filter((binder) => binder.totalCards != null && binder.totalCards > 0);
  const linkedOwned = linkedBinders.reduce((total, binder) => total + binder.ownedCards, 0);
  const linkedTotal = linkedBinders.reduce((total, binder) => total + (binder.totalCards ?? 0), 0);
  const binderCompletion = ratioPercent(linkedOwned, linkedTotal);
  const largestSegment = [...segments].sort((a, b) => b.value - a.value)[0] ?? null;
  const roi = overview.investment > 0 ? (overview.pnl / overview.investment) * 100 : null;
  const fullSummary = segments
    .map((segment) => `${segment.label}: ${formatCollectionCurrency(segment.value)}`)
    .join(" / ");
  const signalCards = [
    {
      label: "Overall Spend",
      value: formatCollectionCurrency(overview.investment),
      hint: "Cards, sealed, and binder base spend",
    },
    {
      label: "ROI",
      value: formatSignedPercent(roi),
      hint: formatSignedCurrency(overview.pnl),
    },
    {
      label: "Priced Coverage",
      value: formatPlainPercent(pricedCoverage),
      hint: `${(pricedCards + pricedSealedUnits).toLocaleString("en-US")} priced items`,
    },
    {
      label: "Set Completion",
      value: formatPlainPercent(binderCompletion),
      hint:
        linkedTotal > 0
          ? `${linkedOwned.toLocaleString("en-US")} / ${linkedTotal.toLocaleString("en-US")} cards`
          : "No linked set binders",
    },
  ];

  return (
    <section
      className="binder-panel relative overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4"
      title={fullSummary}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
            Portfolio Breakdown
          </p>
          <div className="mt-1.5 flex min-w-0 items-end justify-between gap-3 xl:block">
            <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
              Asset Mix
            </h2>
            <p className="shrink-0 text-xl font-black leading-tight tabular-nums text-white xl:mt-3 xl:text-3xl">
              {formatCollectionCurrency(totalValue)}
            </p>
          </div>
          <p className="mt-2 text-sm font-medium leading-5 text-white/46">
            Value split by how the collection is held, with spend and coverage signals kept in one place.
          </p>
          {largestSegment ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-black/18 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                Largest allocation
              </p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-sm font-black text-white">{largestSegment.label}</p>
                <p className="text-sm font-black tabular-nums text-white">
                  {safeShare(largestSegment.value, totalValue).toFixed(0)}%
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-white/8 bg-black/18 p-2.5">
            <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
              {segments.map((segment) => {
                const share = safeShare(segment.value, totalValue);
                return (
                  <div
                    key={segment.label}
                    className={segment.fillClassName}
                    style={{
                      width: `${share}%`,
                      minWidth: share > 0 ? "0.75rem" : undefined,
                    }}
                    title={`${segment.label}: ${share.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {segments.map((segment) => {
                const share = safeShare(segment.value, totalValue);
                return (
                  <div key={segment.label} className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${segment.dotClassName}`} />
                    <span className="text-[10px] font-semibold text-white/45">
                      {segment.label} {share.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-2 min-[430px]:grid-cols-2 xl:grid-cols-4">
            {segments.map((segment) => (
              <PortfolioBreakdownItem
                key={segment.label}
                label={segment.label}
                count={segment.count}
                value={formatCollectionCurrency(segment.value)}
                cost={formatCollectionCurrency(segment.cost)}
                share={safeShare(segment.value, totalValue)}
                dotClassName={segment.dotClassName}
                surfaceClassName={segment.surfaceClassName}
              />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {signalCards.map((signal) => (
              <div
                key={signal.label}
                className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2.5"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-white/34">
                  {signal.label}
                </p>
                <p className="mt-1 text-base font-black tabular-nums text-white">
                  {signal.value}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-white/42">
                  {signal.hint}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SetValueGraphPanel({
  binders,
}: {
  binders: CollectionOverviewData["binders"];
}) {
  const linkedBinders = binders
    .filter((binder) => binder.currentValue > 0 || binder.ownedCards > 0)
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 8);
  const maxValue = Math.max(...linkedBinders.map((binder) => binder.currentValue), 0);
  const totalSetValue = linkedBinders.reduce((total, binder) => total + binder.currentValue, 0);
  const strongestMove = [...binders]
    .filter((binder) => binder.recentChange != null)
    .sort((a, b) => (b.recentChange ?? -Infinity) - (a.recentChange ?? -Infinity))[0];
  const bestProgress = [...binders]
    .filter((binder) => binder.completionPct != null)
    .sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0))[0];

  if (linkedBinders.length === 0) return null;

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
                Set Graph
              </p>
              <h2 className="mt-1 text-xl font-black leading-tight text-white">
                Value by Binder
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-black tabular-nums text-white/62">
              Top {linkedBinders.length}
            </span>
          </div>

          <div className="mt-4 grid gap-2.5">
            {linkedBinders.map((binder, index) => {
              const width = maxValue > 0 ? Math.max(6, (binder.currentValue / maxValue) * 100) : 0;
              const completion = binder.completionPct == null
                ? null
                : Math.min(100, Math.max(0, binder.completionPct));
              const trendClass =
                binder.recentChange == null || binder.recentChange === 0
                  ? "text-white/42"
                  : binder.recentChange > 0
                    ? "text-emerald-300"
                    : "text-rose-300";

              return (
                <Link
                  key={binder.id}
                  href={`/binders/${binder.id}`}
                  prefetch={false}
                  className="group grid min-w-0 gap-2 rounded-2xl border border-white/8 bg-black/18 p-2.5 transition-colors hover:border-white/16 hover:bg-white/[0.055] sm:grid-cols-[minmax(9rem,0.52fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-black text-white/58">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white group-hover:text-white">
                        {binder.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-white/42">
                        {binder.progressLabel}
                        {completion != null ? ` / ${formatPlainPercent(completion)} done` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.35)]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    {completion != null ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/6">
                        <div className="h-full rounded-full bg-sky-300/70" style={{ width: `${completion}%` }} />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-end justify-between gap-3 sm:block sm:text-right">
                    <p className="text-sm font-black tabular-nums text-white">
                      {formatCollectionCurrency(binder.currentValue)}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-bold tabular-nums ${trendClass}`}>
                      {binder.recentChange == null
                        ? "No trend"
                        : `${formatSignedCurrency(binder.recentChange)} latest`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2 content-start">
          <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/34">
              Top set value
            </p>
            <p className="mt-1 truncate text-base font-black text-white">
              {linkedBinders[0]?.name ?? "No set"}
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-white">
              {formatCollectionCurrency(linkedBinders[0]?.currentValue ?? 0)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/34">
                Shown Value
              </p>
              <p className="mt-1 text-lg font-black tabular-nums text-white">
                {formatCollectionCurrency(totalSetValue)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/34">
                Best Progress
              </p>
              <p className="mt-1 text-lg font-black tabular-nums text-white">
                {formatPlainPercent(bestProgress?.completionPct)}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/34">
              Strongest latest set move
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-black text-white">
                {strongestMove?.name ?? "No trend yet"}
              </p>
              <p
                className={`shrink-0 text-sm font-black tabular-nums ${
                  (strongestMove?.recentChange ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {formatSignedCurrency(strongestMove?.recentChange)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PortfolioHighlightCard({
  href,
  imageUrl,
  label,
  name,
  meta,
  value,
}: {
  href: string;
  imageUrl: string | null;
  label: string;
  name: string;
  meta: string;
  value: string;
}) {
  const cachedImageUrl = getCachedImageUrl(imageUrl) ?? imageUrl;

  return (
    <Link
      href={href}
      prefetch={false}
      className="group grid min-w-0 grid-cols-[4.2rem_minmax(0,1fr)] gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-2.5 transition-colors hover:border-white/16 hover:bg-white/[0.06]"
    >
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-black/24">
        {cachedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cachedImageUrl} alt={name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs font-black text-white/32">No image</span>
        )}
      </div>
      <div className="min-w-0 py-1">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/34">
          {label}
        </p>
        <p className="mt-1 line-clamp-2 text-sm font-black leading-tight text-white">
          {name}
        </p>
        <p className="mt-1 truncate text-[11px] font-semibold text-white/42">{meta}</p>
        <p className="mt-2 text-base font-black tabular-nums text-white">{value}</p>
      </div>
    </Link>
  );
}

function PortfolioHighlightsPanel({
  rawLooseSingles,
  gradedLooseSingles,
  binderCards,
  sealed,
  binders,
}: {
  rawLooseSingles: CollectionOverviewData["looseSingles"];
  gradedLooseSingles: CollectionOverviewData["looseSingles"];
  binderCards: CollectionOverviewData["binderCards"];
  sealed: CollectionOverviewData["sealed"];
  binders: CollectionOverviewData["binders"];
}) {
  const allCards = [...rawLooseSingles, ...gradedLooseSingles, ...binderCards];
  const topCard = [...allCards]
    .filter((item) => item.current_value != null)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))[0];
  const topGraded = [...allCards]
    .filter((item) => isGradedCollectionCard(item) && item.current_value != null)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))[0];
  const topSealed = [...sealed]
    .filter((item) => item.current_value_per_item != null)
    .sort(
      (a, b) =>
        (b.current_value_per_item ?? 0) * b.quantity -
        (a.current_value_per_item ?? 0) * a.quantity
    )[0];
  const topBinder = [...binders].sort((a, b) => b.currentValue - a.currentValue)[0];
  const highlights = [
    topCard
      ? {
          key: "top-card",
          href: cardDetailHref(topCard),
          imageUrl: topCard.image_url,
          label: "Top card",
          name: topCard.name,
          meta: topCard.card_number
            ? `${topCard.episode_name} / #${topCard.card_number}`
            : topCard.episode_name,
          value: formatCollectionCurrency(topCard.current_value ?? 0),
        }
      : null,
    topGraded
      ? {
          key: "top-graded",
          href: cardDetailHref(topGraded),
          imageUrl: topGraded.image_url,
          label: "Top graded",
          name: topGraded.name,
          meta: [topGraded.grading_company, topGraded.grading_grade].filter(Boolean).join(" "),
          value: formatCollectionCurrency(topGraded.current_value ?? 0),
        }
      : null,
    topSealed
      ? {
          key: "top-sealed",
          href: sealedDetailHref(topSealed),
          imageUrl: topSealed.image_url,
          label: "Top sealed",
          name: topSealed.name,
          meta: `${topSealed.quantity} units / ${topSealed.episode_name}`,
          value: formatCollectionCurrency((topSealed.current_value_per_item ?? 0) * topSealed.quantity),
        }
      : null,
    topBinder
      ? {
          key: "top-binder",
          href: `/binders/${topBinder.id}`,
          imageUrl: topBinder.episode?.logo_url ?? null,
          label: "Top binder",
          name: topBinder.name,
          meta: `${topBinder.progressLabel} / ${topBinder.subtitle}`,
          value: formatCollectionCurrency(topBinder.currentValue),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (highlights.length === 0) return null;

  return (
    <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
            Collection Signals
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Standout Pieces</h2>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {highlights.map(({ key, ...item }) => (
          <PortfolioHighlightCard key={key} {...item} />
        ))}
      </div>
    </section>
  );
}

function HomeCollectionLinks({
  cardsHref,
  bindersHref,
  sealedHref,
  gradedHref,
}: {
  cardsHref: string;
  bindersHref: string;
  sealedHref: string;
  gradedHref: string;
}) {
  const links = [
    {
      href: cardsHref,
      label: "Complete Collection",
      hint: "All categories in one organized view",
      Icon: Layers3,
    },
    { href: bindersHref, label: "Binders", hint: "Open set binders and progress", Icon: BarChart3 },
    { href: sealedHref, label: "Sealed", hint: "Manage sealed products", Icon: PackageCheck },
    { href: gradedHref, label: "Graded", hint: "View slabs and graded pricing", Icon: Sparkles },
  ];

  return (
    <section className="grid gap-2 sm:grid-cols-4">
      {links.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          prefetch={false}
          className="group rounded-2xl border border-white/8 bg-white/[0.035] p-3 transition-colors hover:border-white/16 hover:bg-white/[0.065]"
        >
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/68">
              <item.Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-white">{item.label}</span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-white/42">
                {item.hint}
              </span>
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; graded?: string; game?: string }>;
}) {
  const user = await requirePageUser("/");
  const settings = await getServerUserSettings(user.id);
  const binderTileTrackWidth = getSupportTileTrackWidth(settings.uiScale, settings.widescreen);
  const { tab, graded, game: gameParam } = await searchParams;
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const browseHref = activeGame === ONE_PIECE_GAME ? "/one-piece/expansions" : "/expansions";
  const normalizedTab = tab === "cards" ? "complete" : tab;
  const activeTab: CollectionPageTab =
    normalizedTab === "complete" ||
    normalizedTab === "singles" ||
    normalizedTab === "binders" ||
    normalizedTab === "sealed" ||
    normalizedTab === "graded"
      ? normalizedTab
      : graded === "1"
        ? "graded"
        : "overview";
  const data = await getCollectionOverviewData({
    userId: user.id,
    activeTab: activeTab as CollectionPageTab,
    game: activeGame,
  });
  const pricedCardCount = data.cards.filter((item) => item.current_value != null).length;
  const pricedSealedUnits = data.sealed.reduce(
    (total, item) => total + (item.current_value_per_item != null ? item.quantity : 0),
    0
  );
  const totalTrackedItems = data.overview.totalCards + data.overview.totalSealedUnits;
  const pricedCoverage = ratioPercent(pricedCardCount + pricedSealedUnits, totalTrackedItems);
  const collectionRoi =
    data.overview.investment > 0 ? (data.overview.pnl / data.overview.investment) * 100 : null;
  const averageTrackedValue =
    totalTrackedItems > 0 ? data.overview.currentValue / totalTrackedItems : null;

  const summaryCards = [
    {
      label: "Overall Spend",
      value: formatCompactCollectionCurrency(data.overview.investment),
      hint: formatCollectionCurrency(data.overview.investment),
      Icon: WalletCards,
      tone: "amber",
    },
    {
      label: "ROI",
      value:
        collectionRoi == null
          ? "--"
          : `${collectionRoi > 0 ? "+" : ""}${collectionRoi.toFixed(0)}%`,
      hint: formatSignedCurrency(data.overview.pnl),
      Icon: Percent,
      tone: data.overview.pnl >= 0 ? "emerald" : "rose",
    },
    {
      label: "Priced",
      value: formatPlainPercent(pricedCoverage),
      hint: `${(pricedCardCount + pricedSealedUnits).toLocaleString("en-US")} priced items`,
      Icon: Gauge,
      tone: "sky",
    },
    {
      label: "Avg Item",
      value: averageTrackedValue == null ? "--" : formatCollectionCurrency(averageTrackedValue),
      hint: "Cards and sealed units",
      Icon: Activity,
      tone: "slate",
    },
  ] satisfies HeaderStat[];

  const hasCollection =
    data.overview.totalCards > 0 ||
    data.overview.totalSealedUnits > 0 ||
    data.overview.totalBinders > 0;
  const gradedCards =
    activeTab === "complete" ||
    activeTab === "singles" ||
    activeTab === "graded" ||
    activeTab === "overview"
      ? data.cards.filter(isGradedCollectionCard)
      : [];
  const gradedLooseSingles =
    activeTab === "overview" || activeTab === "complete" || activeTab === "singles"
      ? data.looseSingles.filter(isGradedCollectionCard)
      : [];
  const rawLooseSingles =
    activeTab === "overview" || activeTab === "complete" || activeTab === "singles"
      ? data.looseSingles.filter((item) => !isGradedCollectionCard(item))
      : [];

  function buildCollectionHref(tabValue: CollectionPageTab) {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    if (tabValue !== "overview") {
      params.set("tab", tabValue);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  function buildGameHref(game: TradingCardGameFilter) {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(game);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    if (activeTab !== "overview") {
      params.set("tab", activeTab);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const collectionSwitchItems = [
    {
      href: buildCollectionHref("complete"),
      active: activeTab === "complete",
      label: "Complete",
    },
    { href: buildCollectionHref("singles"), active: activeTab === "singles", label: "Loose" },
    { href: buildCollectionHref("binders"), active: activeTab === "binders", label: "Binders" },
    { href: buildCollectionHref("sealed"), active: activeTab === "sealed", label: "Sealed" },
    { href: buildCollectionHref("graded"), active: activeTab === "graded", label: "Graded" },
  ];
  const valueRangePoints = data.overview.chart.filter((point) => point.value != null);
  const collectionValueRange =
    valueRangePoints.length > 1
      ? `${valueRangePoints[0].label} - ${valueRangePoints[valueRangePoints.length - 1].label}`
      : valueRangePoints[0]?.label ?? "No history yet";
  const showCollectionChart = valueRangePoints.length > 1;
  const collectionTitle =
    activeGame === ONE_PIECE_GAME ? "One Piece Collection" : "My Collection";
  const collectionTabTitle =
    activeTab === "complete"
      ? "Complete Collection"
      : activeTab === "singles"
        ? "Loose Singles"
        : activeTab === "binders"
          ? "Binders"
          : activeTab === "sealed"
            ? "Sealed Collection"
            : activeTab === "graded"
              ? "Graded Collection"
              : "Collection";
  const collectionTabSummary =
    activeTab === "complete"
      ? `${data.overview.totalCards.toLocaleString("en-US")} cards / ${data.overview.totalBinders.toLocaleString(
          "en-US"
        )} binders / ${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed`
      : activeTab === "singles"
        ? `${rawLooseSingles.length.toLocaleString("en-US")} loose singles`
        : activeTab === "binders"
          ? `${data.overview.totalBinders.toLocaleString("en-US")} binders`
          : activeTab === "sealed"
            ? `${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed units`
            : activeTab === "graded"
              ? `${gradedCards.length.toLocaleString("en-US")} graded cards`
              : `${data.overview.totalCards.toLocaleString("en-US")} cards`;
  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex w-full flex-col gap-3 sm:gap-5">
        {activeTab === "overview" ? (
          <div className="space-y-3">
            <section className="binder-panel relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(18rem,0.68fr)_minmax(0,1.08fr)_minmax(18rem,0.72fr)] xl:items-stretch">
                <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-white/8 bg-black/18 p-[var(--ui-page-header-padding)]">
                  <div className="min-w-0">
                    <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                      Home
                    </p>
                    <h1 className="mt-1.5 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                      {collectionTitle}
                    </h1>
                    <p className="mt-1 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
                      {data.overview.totalCards.toLocaleString("en-US")} cards
                      {data.overview.totalSealedUnits > 0
                        ? ` / ${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed`
                        : ""}
                    </p>
                  </div>

                  {settings.onePieceLibraryEnabled ? (
                    <div className="mt-[var(--ui-page-header-action-margin)]">
                      <GameFilterSwitch
                        items={gameSwitchItems}
                        ariaLabel="Collection library"
                        className="max-w-[21rem]"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
                  {showCollectionChart ? (
                    <PriceHistoryPanel
                      compact
                      title="Collection Value"
                      currency="EUR"
                      points={data.overview.chart}
                      currentValue={data.overview.currentValue}
                      tone="dark"
                      subtitle={`P&L ${data.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
                        data.overview.pnl
                      )}`}
                      emptyText="Add cards or sealed to start tracking your value"
                      rangeStorageKey="collection-dashboard"
                    />
                  ) : (
                    <CollectionValueSummaryCard
                      currentValue={data.overview.currentValue}
                      pnl={data.overview.pnl}
                      rangeLabel={collectionValueRange}
                      className="flex h-full min-h-[var(--ui-dashboard-header-panel-min-height)] flex-col justify-center px-5 py-4"
                    />
                  )}
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
                  {summaryCards.map((stat) => (
                    <HeaderStatCard key={stat.label} {...stat} />
                  ))}
                </div>
              </div>
            </section>

            {hasCollection && (
              <PortfolioBreakdownPanel
                overview={data.overview}
                rawLooseSingles={rawLooseSingles}
                gradedLooseSingles={gradedLooseSingles}
                binderCards={data.binderCards}
                sealed={data.sealed}
                binders={data.binders}
              />
            )}

            {hasCollection && <SetValueGraphPanel binders={data.binders} />}

            {hasCollection && (
              <PortfolioHighlightsPanel
                rawLooseSingles={rawLooseSingles}
                gradedLooseSingles={gradedLooseSingles}
                binderCards={data.binderCards}
                sealed={data.sealed}
                binders={data.binders}
              />
            )}

            <HomeCollectionLinks
              cardsHref={buildCollectionHref("complete")}
              bindersHref={buildCollectionHref("binders")}
              sealedHref={buildCollectionHref("sealed")}
              gradedHref={buildCollectionHref("graded")}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 xl:!border-0 xl:!bg-transparent xl:!p-0 xl:!shadow-none xl:[backdrop-filter:none]">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/38">
                  Collection
                </p>
                <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {collectionTabTitle}
                </h1>
                <p className="mt-0.5 text-sm font-semibold text-white/48">
                  {collectionTabSummary}
                </p>
              </div>
            </section>

            <section
              className={`binder-subpanel w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 ${
                settings.onePieceLibraryEnabled ? "" : "xl:hidden"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-2.5">
                {settings.onePieceLibraryEnabled ? (
                  <GameFilterSwitch
                    items={gameSwitchItems}
                    ariaLabel="Collection library"
                    className="w-full max-w-full sm:w-fit"
                  />
                ) : null}
                <div className="xl:hidden">
                  <SegmentedNavLinks
                    items={collectionSwitchItems}
                    ariaLabel="Collection sections"
                    buttonNavigation
                    preserveScroll
                    className="w-full max-w-full sm:w-fit"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="space-y-3">
          {!hasCollection && activeTab === "overview" && (
            <div className="binder-panel rounded-2xl px-4 py-6 text-center sm:px-6 sm:py-7">
              <p className="mb-1 font-medium text-white/76">
                Your collection is still empty
              </p>
              <p className="mx-auto max-w-xl text-sm leading-6 text-white/42">
                Start with a card, create a binder, or add sealed from search and expansion pages.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  href={browseHref}
                  prefetch={false}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/78 transition-colors hover:border-white/18 hover:bg-white/[0.1]"
                >
                  Browse cards
                </Link>
              </div>
            </div>
          )}

          {activeTab === "complete" && (
            <CollectionOverviewSections
              gradedLooseSingles={gradedLooseSingles}
              rawLooseSingles={rawLooseSingles}
              showRawLooseSinglesSection={rawLooseSingles.length > 0}
              binderCards={data.binderCards}
              sealed={data.sealed}
              binders={data.binders}
            />
          )}

          {activeTab === "singles" && (
            <CollectionCardsView
              items={rawLooseSingles}
              allowCollectionRemoval
              showGradedSlabPreview
              emptyTitle="No loose singles in your collection"
              emptyText="Cards saved without a binder appear here."
              showFilters
              forcedSortBy="cm_en"
              forcedSortDir="desc"
              hideSortControls
            />
          )}

          {activeTab === "graded" && (
            <CollectionCardsView
              items={gradedCards}
              allowCollectionRemoval
              showGradedSlabPreview
              emptyTitle="No graded cards in your collection"
              emptyText="Cards with a grading company and grade will appear here."
              showFilters
              forcedSortBy="cm_en"
              forcedSortDir="desc"
              hideSortControls
            />
          )}

          {activeTab === "binders" && (
            <div className="space-y-4">
              {data.binders.length === 0 ? (
                <div className="glass rounded-2xl px-5 py-7 text-center shadow-md shadow-black/5 sm:rounded-3xl sm:px-8 sm:py-9">
                  <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
                    No binders yet
                  </p>
                  <p className="mx-auto max-w-xl text-sm leading-6 text-gray-400">
                    Type a set name for an automatic set binder, or create a custom binder.
                  </p>
                </div>
              ) : (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: getFixedTrackGridTemplate(binderTileTrackWidth),
                  }}
                >
                  {data.binders.map((binder) => (
                    <BinderOverviewTile key={binder.id} binder={binder} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "sealed" && (
            <CollectionSealedView
              items={data.sealed}
              emptyTitle="No sealed in your collection"
              emptyText="Use the + button on any sealed product to add it here."
            />
          )}
        </div>
      </div>
    </div>
  );
}
