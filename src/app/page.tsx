import nextDynamic from "next/dynamic";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Box,
  CheckCircle2,
  Gauge,
  Layers3,
  PackageCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import CollectionInstantTabs from "@/components/CollectionInstantTabs";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  getCollectionOverviewData,
  type CollectionOverviewData,
  type CollectionPageTab,
  type CollectionValueDriverItem,
  type CollectionValueDriversData,
} from "@/lib/collection-data";
import { getSupportTileTrackWidth } from "@/lib/display-scale";
import { getServerUserSettings } from "@/lib/user-settings-server";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";

const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));
const CollectionOverviewSections = nextDynamic(() => import("@/components/CollectionOverviewSections"));
const CollectionSealedView = nextDynamic(() => import("@/components/CollectionSealedView"));
const BinderOverviewTile = nextDynamic(() => import("@/components/BinderOverviewTile"));
const HomeFeaturedCardsPanel = nextDynamic(() => import("@/components/HomeFeaturedCardsPanel"));

export const dynamic = "force-dynamic";

const HOME_FEATURED_CARD_LIMIT = 24;

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
      className={`rounded-[var(--ui-header-stat-radius)] border border-white/8 bg-white/[0.045] px-2.5 py-2 sm:px-3 sm:py-2.5 ${className}`}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase tracking-[0.12em] text-white/42">
            Collection Value
          </p>
          <p className="mt-1 truncate text-[length:var(--ui-header-stat-value-size)] font-bold leading-tight tabular-nums text-white">
            {formatCollectionCurrency(currentValue)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-xs font-semibold tabular-nums sm:text-sm ${
              pnl >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {pnl >= 0 ? "+" : ""}
            {formatCollectionCurrency(pnl)}
          </p>
          <p className="mt-0.5 text-[length:var(--ui-header-stat-hint-size)] text-white/42">
            P&amp;L
          </p>
        </div>
      </div>
      <p className="mt-1.5 truncate text-[length:var(--ui-header-stat-hint-size)] text-white/42">
        {rangeLabel}
      </p>
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

function CollectionAllocationPanel({
  rawLooseSingles,
  gradedLooseSingles,
  binderCards,
  sealed,
}: {
  rawLooseSingles: CollectionOverviewData["looseSingles"];
  gradedLooseSingles: CollectionOverviewData["looseSingles"];
  binderCards: CollectionOverviewData["binderCards"];
  sealed: CollectionOverviewData["sealed"];
}) {
  const sealedUnits = sealed.reduce((total, item) => total + item.quantity, 0);
  const rawBinderCards = binderCards.filter((item) => !isGradedCollectionCard(item));
  const gradedBinderCards = binderCards.filter(isGradedCollectionCard);
  const rawLooseCards = rawLooseSingles.filter((item) => !isGradedCollectionCard(item));
  const gradedCards = [...gradedLooseSingles, ...gradedBinderCards];
  const segments = [
    {
      label: "Loose Raw",
      itemCount: rawLooseCards.length,
      value: sumCardViewValue(rawLooseCards),
      dotClassName: "bg-sky-400",
      fillClassName: "bg-sky-400",
    },
    {
      label: "Binder Raw",
      itemCount: rawBinderCards.length,
      value: sumCardViewValue(rawBinderCards),
      dotClassName: "bg-emerald-400",
      fillClassName: "bg-emerald-400",
    },
    {
      label: "Graded",
      itemCount: gradedCards.length,
      value: sumCardViewValue(gradedCards),
      dotClassName: "bg-amber-300",
      fillClassName: "bg-amber-300",
    },
    {
      label: "Sealed",
      itemCount: sealedUnits,
      value: sumSealedViewValue(sealed),
      dotClassName: "bg-rose-400",
      fillClassName: "bg-rose-400",
    },
  ].filter((segment) => segment.value > 0 || segment.itemCount > 0);
  const totalValue = segments.reduce((total, segment) => total + segment.value, 0);

  return (
    <section className="binder-panel relative overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <h2 className="text-base font-black tracking-tight text-white">
        Collection Allocation
      </h2>

      <div className="mt-2.5 flex h-3 gap-1 rounded-full border border-white/8 bg-black/18 p-0.5">
        {segments.map((segment) => {
          const share = safeShare(segment.value, totalValue);
          const flexGrow = totalValue > 0
            ? Math.max(segment.value, totalValue * 0.012)
            : 1;
          return (
            <div
              key={segment.label}
              className={`${segment.fillClassName} h-full min-w-2 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_10px_rgba(255,255,255,0.04)]`}
              style={{
                flexBasis: 0,
                flexGrow,
              }}
              title={`${segment.label}: ${share.toFixed(1)}%`}
            />
          );
        })}
      </div>

      <div className="mt-2.5 grid gap-1.5">
        {segments.map((segment) => {
          const share = safeShare(segment.value, totalValue);
          return (
            <div
              key={segment.label}
              className="flex items-center gap-2.5 text-[12px]"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${segment.dotClassName}`} />
              <span className="min-w-0 flex-1 truncate font-semibold text-white/78">
                {segment.label}
              </span>
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/48">
                {share.toFixed(0)}%
              </span>
              <span className="w-[4.75rem] shrink-0 text-right font-black tabular-nums text-white">
                {formatCollectionCurrency(segment.value)}
              </span>
            </div>
          );
        })}
        <div className="mt-1 flex items-center gap-2.5 border-t border-white/8 pt-2 text-[12px]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-white/0" />
          <span className="min-w-0 flex-1 truncate font-black uppercase tracking-[0.12em] text-white/56">
            Total
          </span>
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/56">
            100%
          </span>
          <span className="w-[4.75rem] shrink-0 text-right font-black tabular-nums text-white">
            {formatCollectionCurrency(totalValue)}
          </span>
        </div>
      </div>
    </section>
  );
}

function TopSetsProgressPanel({
  binders,
  viewAllHref,
}: {
  binders: CollectionOverviewData["binders"];
  viewAllHref: string;
}) {
  const rankedBinders = binders
    .filter(
      (binder) =>
        binder.totalCards != null && binder.totalCards > 0 && binder.ownedCards >= 0
    )
    .sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0))
    .slice(0, 5);

  if (rankedBinders.length === 0) return null;

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-base font-black tracking-tight text-white">
          Top Sets Progress
        </h2>
        <Link
          href={viewAllHref}
          prefetch={false}
          className="shrink-0 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-2">
        {rankedBinders.map((binder) => {
          const completion = binder.completionPct == null
            ? 0
            : Math.min(100, Math.max(0, binder.completionPct));
          const total = binder.totalCards ?? 0;
          const accent = binder.accent_color ?? "#8b5cf6";
          const logoUrl = binder.episode?.logo_url ?? null;
          return (
            <Link
              key={binder.id}
              href={`/binders/${binder.id}`}
              prefetch={false}
              className="group flex min-w-0 items-center gap-2.5"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05]"
                style={{ borderColor: `${accent}55` }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={binder.name} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[9px] font-black text-white/62">
                    {binder.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/82 group-hover:text-white">
                {binder.name}
              </span>
              <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-white/8 sm:block">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${completion}%`,
                    background: `linear-gradient(90deg, ${accent}, #c4b5fd)`,
                  }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-white">
                {completion.toFixed(0)}%
              </span>
              <span className="hidden shrink-0 text-[11px] font-semibold tabular-nums text-white/42 min-[480px]:inline">
                {binder.ownedCards.toLocaleString("en-US")} / {total.toLocaleString("en-US")}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FeaturedCardsPanel({
  cards,
  viewAllHref,
}: {
  cards: CollectionOverviewData["cards"];
  viewAllHref: string;
}) {
  const featured = [...cards]
    .filter((item) => item.current_value != null && (item.current_value ?? 0) > 0)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, HOME_FEATURED_CARD_LIMIT);

  if (featured.length === 0) return null;

  return <HomeFeaturedCardsPanel cards={featured} viewAllHref={viewAllHref} />;
}

function getDriverDateDistanceDays(data: CollectionValueDriversData): number | null {
  if (!data.previousDate || !data.latestDate) return null;

  const previous = Date.parse(`${data.previousDate}T00:00:00.000Z`);
  const latest = Date.parse(`${data.latestDate}T00:00:00.000Z`);
  const days = Math.round((latest - previous) / 86_400_000);

  return Number.isFinite(days) && days > 0 ? days : null;
}

function getDriverWindowLabel(data: CollectionValueDriversData): string {
  const days = getDriverDateDistanceDays(data);

  if (days == null) return "Latest movement";
  if (days <= 2) return "Last 2 days";
  return `Latest ${days} days`;
}

function getDriverRangeLabel(data: CollectionValueDriversData): string {
  if (data.previousLabel && data.latestLabel) {
    return `${data.previousLabel} - ${data.latestLabel}`;
  }

  return "Waiting for another snapshot";
}

function formatSignedPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;

  const absolute = Math.abs(value);
  const decimals = absolute >= 10 || absolute === 0 ? 0 : 1;
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function getDriverSourceLabel(item: CollectionValueDriverItem): string {
  if (item.currentSource === item.previousSource) {
    return item.currentSource;
  }

  return `${item.previousSource} -> ${item.currentSource}`;
}

function getDriverMetaLabel(item: CollectionValueDriverItem): string {
  const episode = item.episodeCode ? item.episodeCode : item.episodeName;
  const detail = item.detail || (item.cardNumber ? `#${item.cardNumber}` : null);
  const quantity = item.quantity > 1 ? `x${item.quantity}` : null;

  return [detail, episode, quantity].filter(Boolean).join(" / ");
}

function HomeValueDriverRow({
  item,
  tone,
}: {
  item: CollectionValueDriverItem;
  tone: "gain" | "drop";
}) {
  const Icon = tone === "gain" ? ArrowUpRight : ArrowDownRight;
  const toneTextClass = tone === "gain" ? "text-emerald-300" : "text-rose-300";
  const toneSurfaceClass =
    tone === "gain"
      ? "border-emerald-400/14 bg-emerald-400/[0.07]"
      : "border-rose-400/14 bg-rose-400/[0.07]";
  const percent = formatSignedPercent(item.changePct);
  const meta = getDriverMetaLabel(item);

  return (
    <Link
      href={item.href}
      prefetch={false}
      className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-white/7 py-2 first:border-t-0"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${toneSurfaceClass} ${toneTextClass}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black leading-tight text-white/88 transition-colors group-hover:text-white">
          {item.name}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-semibold leading-4 text-white/42">
          {meta ? <span className="min-w-0 truncate">{meta}</span> : null}
          <span className="shrink-0 text-white/28">/</span>
          <span className="shrink-0">{getDriverSourceLabel(item)}</span>
        </span>
      </span>
      <span className="min-w-[5.5rem] shrink-0 text-right">
        <span className={`block text-[13px] font-black leading-tight tabular-nums ${toneTextClass}`}>
          {formatSignedCurrency(item.change)}
        </span>
        {percent ? (
          <span className="mt-0.5 block text-[10.5px] font-bold tabular-nums text-white/42">
            {percent}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function HomeValueDriverLane({
  title,
  items,
  tone,
  emptyLabel,
}: {
  title: string;
  items: CollectionValueDriverItem[];
  tone: "gain" | "drop";
  emptyLabel: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
          {title}
        </p>
        <span className="text-[10.5px] font-semibold text-white/34">
          {items.length.toLocaleString("en-US")}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="min-w-0">
          {items.map((item) => (
            <HomeValueDriverRow key={item.id} item={item} tone={tone} />
          ))}
        </div>
      ) : (
        <div className="border-t border-white/7 py-4 text-[12px] font-semibold text-white/34">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function HomeValueDriversPanel({
  data,
  viewAllHref,
}: {
  data: CollectionValueDriversData;
  viewAllHref: string;
}) {
  const gains = data.gains.slice(0, 4);
  const drops = data.drops.slice(0, 4);
  const hasDrivers = gains.length > 0 || drops.length > 0;
  const netChange = data.totalChange ?? 0;
  const netToneClass = netChange >= 0 ? "text-emerald-300" : "text-rose-300";

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/34">
            {getDriverWindowLabel(data)}
          </p>
          <h2 className="mt-0.5 text-base font-black tracking-tight text-white">
            Collection Value Drivers
          </h2>
          <p className="mt-0.5 text-[12px] font-semibold text-white/42">
            {getDriverRangeLabel(data)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center rounded-full border border-white/8 bg-black/18 px-2.5 text-[12px] font-black tabular-nums text-white">
            Net <span className={`ml-1.5 ${netToneClass}`}>{formatSignedCurrency(data.totalChange)}</span>
          </span>
          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex h-8 items-center rounded-full border border-white/8 bg-white/[0.045] px-2.5 text-[12px] font-bold text-violet-200 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white"
          >
            View all
          </Link>
        </div>
      </div>

      {hasDrivers ? (
        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
          <HomeValueDriverLane
            title="Biggest gains"
            items={gains}
            tone="gain"
            emptyLabel="No gains in this window"
          />
          <HomeValueDriverLane
            title="Biggest drops"
            items={drops}
            tone="drop"
            emptyLabel="No drops in this window"
          />
        </div>
      ) : (
        <div className="mt-3 border-t border-white/7 py-4 text-[12px] font-semibold text-white/38">
          Not enough recent collection history yet.
        </div>
      )}
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
          className="group rounded-[var(--ui-header-stat-radius)] border border-white/8 bg-white/[0.035] p-2.5 transition-colors hover:border-white/16 hover:bg-white/[0.065]"
        >
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/68">
              <item.Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-black leading-tight text-white">
                {item.label}
              </span>
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
  const binderGridStyle = {
    "--binder-tile-track": binderTileTrackWidth,
  } as CSSProperties;
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
    activeTab: "overview",
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

  const linkedBindersForCompletion = data.binders.filter(
    (binder) => binder.totalCards != null && binder.totalCards > 0
  );
  const linkedOwnedTotal = linkedBindersForCompletion.reduce(
    (total, binder) => total + binder.ownedCards,
    0
  );
  const linkedSetTotal = linkedBindersForCompletion.reduce(
    (total, binder) => total + (binder.totalCards ?? 0),
    0
  );
  const setCompletion = ratioPercent(linkedOwnedTotal, linkedSetTotal);

  const summaryCards = [
    {
      label: "ROI",
      value:
        collectionRoi == null
          ? "--"
          : `${collectionRoi > 0 ? "+" : ""}${collectionRoi.toFixed(1)}%`,
      hint: formatSignedCurrency(data.overview.pnl),
      Icon: TrendingUp,
      tone: data.overview.pnl >= 0 ? "emerald" : "rose",
    },
    {
      label: "Overall Spend",
      value: formatCompactCollectionCurrency(data.overview.investment),
      hint: formatCollectionCurrency(data.overview.investment),
      Icon: WalletCards,
      tone: "amber",
    },
    {
      label: "Priced Items",
      value: formatPlainPercent(pricedCoverage),
      hint: `${(pricedCardCount + pricedSealedUnits).toLocaleString(
        "en-US"
      )} / ${totalTrackedItems.toLocaleString("en-US")}`,
      Icon: Gauge,
      tone: "sky",
    },
    {
      label: "Avg Item Value",
      value: averageTrackedValue == null ? "--" : formatCollectionCurrency(averageTrackedValue),
      hint: "Cards & sealed",
      Icon: Activity,
      tone: "slate",
    },
    {
      label: "Collection Completion",
      value: formatPlainPercent(setCompletion),
      hint:
        linkedSetTotal > 0
          ? `${linkedOwnedTotal.toLocaleString("en-US")} / ${linkedSetTotal.toLocaleString("en-US")}`
          : "No linked sets",
      Icon: CheckCircle2,
      tone: "violet",
    },
    {
      label: "Total Items",
      value: totalTrackedItems.toLocaleString("en-US"),
      hint: "Cards & sealed",
      Icon: Box,
      tone: "slate",
    },
  ] satisfies HeaderStat[];

  const hasCollection =
    data.overview.totalCards > 0 ||
    data.overview.totalSealedUnits > 0 ||
    data.overview.totalBinders > 0;
  const gradedCards = data.cards.filter(isGradedCollectionCard);
  const gradedLooseSingles = data.looseSingles.filter(isGradedCollectionCard);
  const rawLooseSingles = data.looseSingles.filter((item) => !isGradedCollectionCard(item));

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

  function buildValueDriversHref() {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);

    params.set("scope", "value");
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }

    return `/movers?${params.toString()}`;
  }

  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const valueRangePoints = data.overview.chart.filter((point) => point.value != null);
  const collectionValueRange =
    valueRangePoints.length > 1
      ? `${valueRangePoints[0].label} - ${valueRangePoints[valueRangePoints.length - 1].label}`
      : valueRangePoints[0]?.label ?? "No history yet";
  const showCollectionChart = valueRangePoints.length > 1;
  const collectionTitle =
    activeGame === ONE_PIECE_GAME ? "One Piece Collection" : "My Collection";
  const collectionTabs = [
    {
      key: "complete" as const,
      href: buildCollectionHref("complete"),
      active: activeTab === "complete",
      label: "All",
      title: "Complete Collection",
      summary: `${data.overview.totalCards.toLocaleString("en-US")} cards / ${data.overview.totalBinders.toLocaleString(
        "en-US"
      )} binders / ${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed`,
    },
    {
      key: "singles" as const,
      href: buildCollectionHref("singles"),
      active: activeTab === "singles",
      label: "Loose",
      title: "Loose Singles",
      summary: `${rawLooseSingles.length.toLocaleString("en-US")} loose singles`,
    },
    {
      key: "binders" as const,
      href: buildCollectionHref("binders"),
      active: activeTab === "binders",
      label: "Binders",
      title: "Binders",
      summary: `${data.overview.totalBinders.toLocaleString("en-US")} binders`,
    },
    {
      key: "sealed" as const,
      href: buildCollectionHref("sealed"),
      active: activeTab === "sealed",
      label: "Sealed",
      title: "Sealed Collection",
      summary: `${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed units`,
    },
    {
      key: "graded" as const,
      href: buildCollectionHref("graded"),
      active: activeTab === "graded",
      label: "Graded",
      title: "Graded Collection",
      summary: `${gradedCards.length.toLocaleString("en-US")} graded cards`,
    },
  ];
  return (
    <CollectionInstantTabs
      initialTab={activeTab}
      tabs={collectionTabs}
      gameControls={
        settings.onePieceLibraryEnabled ? (
          <GameFilterSwitch
            items={gameSwitchItems}
            ariaLabel="Collection library"
            className="w-full max-w-full sm:w-fit"
          />
        ) : null
      }
      overviewSlot={
        <div className="space-y-2.5 sm:space-y-3">
          <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                {collectionTitle}
              </h1>
              <p className="mt-1 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
                {data.overview.totalCards.toLocaleString("en-US")} cards
                {data.overview.totalBinders > 0
                  ? ` • ${data.overview.totalBinders.toLocaleString("en-US")} binders`
                  : ""}
                {data.overview.totalSealedUnits > 0
                  ? ` • ${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed`
                  : ""}
              </p>
            </div>

            {settings.onePieceLibraryEnabled ? (
              <div className="shrink-0 sm:ml-auto">
                <GameFilterSwitch
                  items={gameSwitchItems}
                  ariaLabel="Collection library"
                  className="max-w-[21rem]"
                />
              </div>
            ) : null}
          </div>

          <section className="grid min-w-0 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch">
            <div className="binder-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3 lg:p-4">
              <div className="min-w-0 flex-1 [&>section]:h-full [&>section]:w-full">
                {showCollectionChart ? (
                  <PriceHistoryPanel
                    layout="dashboard"
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
                    className="flex w-full flex-col justify-center px-3 py-3 sm:px-4"
                  />
                )}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2 xl:grid-rows-3">
              {summaryCards.map((stat) => (
                <HeaderStatCard key={stat.label} {...stat} />
              ))}
            </div>
          </section>

          {hasCollection && (
            <HomeValueDriversPanel
              data={data.valueDrivers}
              viewAllHref={buildValueDriversHref()}
            />
          )}

          {hasCollection && (
            <FeaturedCardsPanel
              cards={data.cards}
              viewAllHref={buildCollectionHref("complete")}
            />
          )}

          {hasCollection && (
            <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2 [&>section]:h-full">
              <CollectionAllocationPanel
                rawLooseSingles={rawLooseSingles}
                gradedLooseSingles={gradedLooseSingles}
                binderCards={data.binderCards}
                sealed={data.sealed}
              />
              <TopSetsProgressPanel
                binders={data.binders}
                viewAllHref={buildCollectionHref("binders")}
              />
            </div>
          )}

          <HomeCollectionLinks
            cardsHref={buildCollectionHref("complete")}
            bindersHref={buildCollectionHref("binders")}
            sealedHref={buildCollectionHref("sealed")}
            gradedHref={buildCollectionHref("graded")}
          />
        </div>
      }
      emptySlot={
        !hasCollection ? (
          <div className="binder-panel rounded-2xl px-4 py-6 text-center sm:px-6 sm:py-7">
            <p className="mb-1 font-medium text-white/76">Your collection is still empty</p>
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
        ) : null
      }
      completeSlot={
        <CollectionOverviewSections
          gradedLooseSingles={gradedLooseSingles}
          rawLooseSingles={rawLooseSingles}
          showRawLooseSinglesSection={rawLooseSingles.length > 0}
          binderCards={data.binderCards}
          sealed={data.sealed}
          binders={data.binders}
        />
      }
      singlesSlot={
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
      }
      gradedSlot={
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
      }
      bindersSlot={
        <div className="space-y-4">
          {data.binders.length === 0 ? (
            <div className="binder-panel rounded-2xl px-5 py-7 text-center sm:rounded-3xl sm:px-8 sm:py-9">
              <p className="mb-1 font-medium text-white/76">No binders yet</p>
              <p className="mx-auto max-w-xl text-sm leading-6 text-white/42">
                Type a set name for an automatic set binder, or create a custom binder.
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-2 lg:gap-4 lg:[grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--binder-tile-track)),1fr))]"
              style={binderGridStyle}
            >
              {data.binders.map((binder) => (
                <BinderOverviewTile key={binder.id} binder={binder} />
              ))}
            </div>
          )}
        </div>
      }
      sealedSlot={
        <CollectionSealedView
          items={data.sealed}
          emptyTitle="No sealed in your collection"
          emptyText="Use the + button on any sealed product to add it here."
        />
      }
    />
  );
}
