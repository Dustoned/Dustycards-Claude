import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  Asterisk,
  Badge,
  BadgeCheck,
  ChevronsUp,
  CircleDot,
  Columns2,
  Diamond,
  GalleryHorizontal,
  Gem,
  Image as ImageIcon,
  Layers3,
  ListFilter,
  Rainbow,
  Shield,
  Sparkle,
  Sparkles,
  Split,
  Star,
  Sun,
  Ticket,
  UserRound,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  HeaderAction,
  PageHeroHeader,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import {
  getCardCategorySummaries,
  getCategoryGroups,
  type CardCategorySummary,
  type CardCategoryTone,
} from "@/lib/card-categories";
import {
  ALL_GAMES,
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  archive: Archive,
  "arrow-up-right": ArrowUpRight,
  asterisk: Asterisk,
  badge: Badge,
  "badge-check": BadgeCheck,
  "chevrons-up": ChevronsUp,
  "circle-dot": CircleDot,
  "columns-2": Columns2,
  diamond: Diamond,
  "gallery-horizontal": GalleryHorizontal,
  gem: Gem,
  image: ImageIcon,
  "layers-3": Layers3,
  "list-filter": ListFilter,
  rainbow: Rainbow,
  shield: Shield,
  sparkle: Sparkle,
  sparkles: Sparkles,
  split: Split,
  star: Star,
  sun: Sun,
  ticket: Ticket,
  "user-round": UserRound,
  "users-round": UsersRound,
  zap: Zap,
};

const TONE_CLASSES: Record<CardCategoryTone, { icon: string; surface: string; chip: string }> = {
  slate: {
    icon: "text-gray-600 dark:text-white/70",
    surface: "border-black/8 bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.06]",
    chip: "border-black/8 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/62",
  },
  emerald: {
    icon: "text-emerald-700 dark:text-emerald-200",
    surface: "border-emerald-400/18 bg-emerald-400/[0.08]",
    chip: "border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200",
  },
  amber: {
    icon: "text-amber-700 dark:text-amber-200",
    surface: "border-amber-400/18 bg-amber-400/[0.08]",
    chip: "border-amber-400/18 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200",
  },
  sky: {
    icon: "text-sky-700 dark:text-sky-200",
    surface: "border-sky-400/18 bg-sky-400/[0.08]",
    chip: "border-sky-400/18 bg-sky-400/[0.08] text-sky-700 dark:text-sky-200",
  },
  rose: {
    icon: "text-rose-700 dark:text-rose-200",
    surface: "border-rose-400/18 bg-rose-400/[0.08]",
    chip: "border-rose-400/18 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200",
  },
  violet: {
    icon: "text-violet-700 dark:text-violet-200",
    surface: "border-violet-400/18 bg-violet-400/[0.08]",
    chip: "border-violet-400/18 bg-violet-400/[0.08] text-violet-700 dark:text-violet-200",
  },
  blue: {
    icon: "text-blue-700 dark:text-blue-200",
    surface: "border-blue-400/18 bg-blue-400/[0.08]",
    chip: "border-blue-400/18 bg-blue-400/[0.08] text-blue-700 dark:text-blue-200",
  },
};

function buildGameHref(pathname: string, game: TradingCardGameFilter) {
  const params = new URLSearchParams();
  const gameValue = getGameFilterSearchParamValue(game);
  if (gameValue) {
    params.set(GAME_SEARCH_PARAM, gameValue);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
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

function CategoryTile({
  category,
  activeGame,
}: {
  category: CardCategorySummary;
  activeGame: TradingCardGameFilter;
}) {
  const Icon = CATEGORY_ICONS[category.icon] ?? Sparkles;
  const tone = TONE_CLASSES[category.tone];
  const href = buildGameHref(
    `/categories/${category.slug}`,
    activeGame === ALL_GAMES ? category.game : activeGame
  );

  return (
    <Link
      href={href}
      prefetch={false}
      className="group grid min-h-[9.25rem] grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border border-black/8 bg-white/70 p-4 text-left shadow-sm shadow-black/5 transition-all hover:-translate-y-0.5 hover:border-black/12 hover:bg-white hover:shadow-lg hover:shadow-black/8 active:scale-[0.99] dark:border-white/8 dark:bg-white/[0.045] dark:shadow-black/20 dark:hover:border-white/14 dark:hover:bg-white/[0.065] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4"
    >
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tone.surface} ${tone.icon}`}
      >
        <Icon className="h-5 w-5" />
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-lg font-bold leading-tight text-gray-950 dark:text-white">
            {category.title}
          </span>
          <span
            className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${tone.chip}`}
          >
            {category.shortTitle}
          </span>
        </span>
        <span className="mt-2 line-clamp-3 text-sm leading-5 text-gray-500 dark:text-white/50">
          {category.description}
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 dark:text-white/45">
          <span>{category.count.toLocaleString("en-US")} cards</span>
          <span className="h-1 w-1 rounded-full bg-current opacity-35" />
          <span>{category.group}</span>
        </span>
      </span>

      <span className="hidden self-center text-gray-300 transition-colors group-hover:text-gray-600 dark:text-white/20 dark:group-hover:text-white/58 sm:block">
        <ArrowUpRight className="h-5 w-5" />
      </span>
    </Link>
  );
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game: gameParam } = await searchParams;
  const user = await requirePageUser(
    gameParam ? `/categories?${GAME_SEARCH_PARAM}=${encodeURIComponent(gameParam)}` : "/categories"
  );
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const categories = await getCardCategorySummaries(activeGame);
  const totalListEntries = categories.reduce((total, category) => total + category.count, 0);
  const largestCategory = [...categories].sort((a, b) => b.count - a.count)[0] ?? null;
  const browseHref = activeGame === ONE_PIECE_GAME ? "/one-piece/expansions" : "/expansions";
  const stats = [
    {
      label: "Categories",
      value: categories.length.toLocaleString("en-US"),
      hint: "Curated card lists.",
      Icon: ListFilter,
      tone: "sky",
    },
    {
      label: "List Entries",
      value: totalListEntries.toLocaleString("en-US"),
      hint: "Cards can appear in multiple lists.",
      Icon: Layers3,
      tone: "emerald",
    },
    {
      label: "Biggest List",
      value: largestCategory?.count.toLocaleString("en-US") ?? "0",
      hint: largestCategory?.title ?? "No cards synced yet.",
      Icon: Sparkles,
      tone: "violet",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-6 sm:gap-8">
        <PageHeroHeader
          eyebrow={activeGame === ONE_PIECE_GAME ? "One Piece Library" : "DustyCards"}
          title={activeGame === ONE_PIECE_GAME ? "One Piece Categories" : "Categories"}
          description={
            activeGame === ONE_PIECE_GAME
              ? "Browse One Piece rarity and chase-card groups without mixing them into Pokemon lists."
              : "Jump straight into curated card lists like Trainer Full Art, Tag Team GX, Special Illustration Rare, shiny cards, promos and older mechanics."
          }
          className="max-[640px]:[--ui-page-header-padding:0.85rem] max-[640px]:[--ui-page-header-title-size:1.65rem] max-[640px]:[--ui-page-header-description-size:0.78rem]"
          actions={
            <HeaderAction>
              <Link
                href={browseHref}
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
              >
                <Layers3 className="h-4 w-4" />
                Browse Expansions
              </Link>
            </HeaderAction>
          }
          stats={stats}
          statsClassName="sm:grid-cols-3"
        />

        {settings.onePieceLibraryEnabled ? (
          <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
            <div className="inline-flex min-w-max flex-nowrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
              {GAME_FILTER_OPTIONS.map((game) => (
                <GameToggleLink
                  key={game}
                  href={buildGameHref("/categories", game)}
                  active={activeGame === game}
                  label={getGameFilterLabel(game)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-8">
          {getCategoryGroups().map((group) => {
            const groupCategories = categories.filter((category) => category.group === group);
            if (groupCategories.length === 0) return null;

            return (
              <section key={group}>
                <SectionHeader title={group} count={groupCategories.length} compact />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupCategories.map((category) => (
                    <CategoryTile key={category.slug} category={category} activeGame={activeGame} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
