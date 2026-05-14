import nextDynamic from "next/dynamic";
import Link from "next/link";
import { BadgeEuro, CheckCircle2, Heart, Layers3, Search } from "lucide-react";
import { HeaderAction, PageHeroHeader, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { getWantsPageData } from "@/lib/collection-data";
import {
  GAME_SEARCH_PARAM,
  getGameSearchParamValue,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  parseVisibleTradingCardGame,
  type TradingCardGame,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";

const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));
const PriceHistoryPanel = nextDynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-full rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

export const dynamic = "force-dynamic";

const compactStatToneClasses: Record<
  NonNullable<HeaderStat["tone"]>,
  { icon: string; surface: string }
> = {
  slate: {
    icon: "text-gray-500 dark:text-white/55",
    surface: "border-black/6 bg-white/75 dark:border-white/10 dark:bg-white/[0.055]",
  },
  emerald: {
    icon: "text-emerald-600 dark:text-emerald-300",
    surface: "border-emerald-400/14 bg-emerald-400/[0.07]",
  },
  amber: {
    icon: "text-amber-600 dark:text-amber-300",
    surface: "border-amber-400/14 bg-amber-400/[0.07]",
  },
  sky: {
    icon: "text-sky-600 dark:text-sky-300",
    surface: "border-sky-400/14 bg-sky-400/[0.07]",
  },
  rose: {
    icon: "text-rose-600 dark:text-rose-300",
    surface: "border-rose-400/14 bg-rose-400/[0.07]",
  },
  violet: {
    icon: "text-violet-600 dark:text-violet-300",
    surface: "border-violet-400/14 bg-violet-400/[0.07]",
  },
  blue: {
    icon: "text-blue-600 dark:text-blue-300",
    surface: "border-blue-400/14 bg-blue-400/[0.07]",
  },
};

function WantsHeaderStatCard({
  label,
  value,
  hint,
  Icon,
  tone = "slate",
}: HeaderStat) {
  const toneClass = compactStatToneClasses[tone];

  return (
    <div className="min-w-0 rounded-2xl border border-black/8 bg-white/70 px-3 py-2.5 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-none">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/42">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-gray-950 dark:text-white sm:text-xl">
            {value}
          </p>
        </div>
        {Icon ? (
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${toneClass.surface} ${toneClass.icon}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1.5 line-clamp-1 text-[11px] leading-snug text-gray-500 dark:text-white/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function GameToggleLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors sm:rounded-xl sm:px-4 sm:text-sm ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function WantsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const user = await requirePageUser("/wants");
  const settings = await getServerUserSettings(user.id);
  const { game: gameParam } = await searchParams;
  const activeGame = parseVisibleTradingCardGame(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const browseHref = activeGame === ONE_PIECE_GAME ? "/one-piece/expansions" : "/expansions";
  const data = await getWantsPageData(user.id, activeGame);

  function buildGameHref(game: TradingCardGame) {
    const params = new URLSearchParams();
    const gameValue = getGameSearchParamValue(game);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    const query = params.toString();
    return query ? `/wants?${query}` : "/wants";
  }

  const unpricedCards = Math.max(data.totalCards - data.pricedCards, 0);
  const valueRangePoints = data.chart.filter((point) => point.value != null);
  const showWantsChart = valueRangePoints.length > 1;
  const stats = [
    {
      label: "Wanted",
      value: data.totalCards.toLocaleString("en-US"),
      hint: "Cards outside your collection totals.",
      Icon: Heart,
      tone: "rose",
    },
    {
      label: "Est. Cost",
      value: formatCollectionCurrency(data.estimatedValue),
      hint: "CardMarket target total.",
      Icon: BadgeEuro,
      tone: "emerald",
    },
    {
      label: "Priced",
      value: `${data.pricedCards.toLocaleString("en-US")} / ${data.totalCards.toLocaleString("en-US")}`,
      hint: unpricedCards > 0 ? `${unpricedCards.toLocaleString("en-US")} missing price.` : "All priced.",
      Icon: CheckCircle2,
      tone: "sky",
    },
    {
      label: "Sets",
      value: data.totalSets.toLocaleString("en-US"),
      hint:
        data.averageValue == null
          ? "Add wants to build a target list."
          : `${formatCollectionCurrency(data.averageValue)} average.`,
      Icon: Layers3,
      tone: "violet",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <PageHeroHeader
          eyebrow="DustyCards"
          title={activeGame === ONE_PIECE_GAME ? "One Piece Wants" : "Wants"}
          description={
            activeGame === ONE_PIECE_GAME
              ? "One Piece cards you want to pick up later, kept separate from Pokemon wants."
              : "Cards you want to pick up later. Prices are tracked here, but they do not count toward collection value, spent or card totals."
          }
          className="xl:[--ui-page-header-title-size:2rem] max-[640px]:[--ui-page-header-padding:0.75rem] max-[640px]:[--ui-page-header-title-size:1.45rem] max-[640px]:[--ui-page-header-description-size:0.78rem] max-[640px]:[--ui-page-header-action-margin:0.55rem]"
          gridClassName="xl:grid-cols-[minmax(22rem,0.62fr)_minmax(0,1.38fr)] xl:items-stretch"
          sideClassName="space-y-0"
          actions={
            <HeaderAction>
              <Link
                href={browseHref}
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
              >
                <Search className="h-4 w-4" />
                Browse Cards
              </Link>
            </HeaderAction>
          }
          accessory={
            <div className="grid min-w-0 gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(19rem,0.92fr)] lg:items-stretch">
              <div className={showWantsChart ? "min-w-0 [&>section]:h-full" : "hidden"}>
                  <PriceHistoryPanel
                    compact
                    title="Wants Value"
                    currency="EUR"
                    points={data.chart}
                    currentValue={data.estimatedValue}
                    subtitle={`${data.pricedCards.toLocaleString("en-US")} / ${data.totalCards.toLocaleString("en-US")} priced`}
                    emptyText="Add wanted cards with price history to start tracking target value"
                  />
              </div>
              <div
                className={`grid min-w-0 grid-cols-2 gap-2 sm:gap-3 ${
                  showWantsChart ? "" : "lg:col-span-2"
                }`}
              >
                {stats.map((stat) => (
                  <WantsHeaderStatCard key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          }
        />

        {settings.onePieceLibraryEnabled ? (
          <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
            <div className="inline-flex min-w-max flex-nowrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
              <GameToggleLink
                href={buildGameHref(POKEMON_GAME)}
                active={activeGame === POKEMON_GAME}
                label="Pokemon"
              />
              <GameToggleLink
                href={buildGameHref(ONE_PIECE_GAME)}
                active={activeGame === ONE_PIECE_GAME}
                label="One Piece"
              />
            </div>
          </div>
        ) : null}

        <CollectionCardsView
          items={data.items}
          allowWantRemoval
          emptyTitle="No wants yet"
          emptyText="Use Want on a card detail to keep it here."
          sectionTitle="Wanted cards"
          sectionCount={data.totalCards.toLocaleString("en-US")}
          showFilters
          forcedSortBy="cm_en"
          forcedSortDir="desc"
          hideSortControls
        />
      </div>
    </div>
  );
}
