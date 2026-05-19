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
  HeaderStatCard,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import GameFilterSwitch from "@/components/GameFilterSwitch";
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
  getGameLabel,
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
  const showGameBadge = activeGame === ALL_GAMES;

  return (
    <Link
      href={href}
      prefetch={false}
      className="binder-panel group grid min-h-[7.5rem] grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl p-3 text-left transition-colors hover:border-white/14 hover:bg-white/[0.065] active:scale-[0.99] sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tone.surface} ${tone.icon}`}
      >
        <Icon className="h-5 w-5" />
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-base font-bold leading-tight text-white">
            {category.title}
          </span>
          <span
            className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${tone.chip}`}
          >
            {category.shortTitle}
          </span>
        </span>
        <span className="mt-1.5 line-clamp-2 text-sm leading-5 text-white/50">
          {category.description}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/45">
          <span>{category.count.toLocaleString("en-US")} cards</span>
          <span className="h-1 w-1 rounded-full bg-current opacity-35" />
          <span>{category.group}</span>
          {showGameBadge ? (
            <>
              <span className="h-1 w-1 rounded-full bg-current opacity-35" />
              <span
                className={
                  category.game === ONE_PIECE_GAME
                    ? "rounded-full border border-amber-400/18 bg-amber-400/[0.08] px-2 py-0.5 text-amber-700 dark:text-amber-200"
                    : "rounded-full border border-sky-400/18 bg-sky-400/[0.08] px-2 py-0.5 text-sky-700 dark:text-sky-200"
                }
              >
                {getGameLabel(category.game)}
              </span>
            </>
          ) : null}
        </span>
      </span>

      <span className="hidden self-center text-white/22 transition-colors group-hover:text-white/58 sm:block">
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
  const activeGroupCount = getCategoryGroups().filter((group) =>
    categories.some((category) => category.group === group)
  ).length;
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref("/categories", game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
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
    {
      label: "Groups",
      value: activeGroupCount.toLocaleString("en-US"),
      hint: "Category sections shown.",
      Icon: Columns2,
      tone: "amber",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex w-full flex-col gap-4 sm:gap-5">
        <section className="binder-panel relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
            <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-white/8 bg-black/10 p-[var(--ui-page-header-padding)] xl:col-span-2">
              <div className="min-w-0">
                <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                  {activeGame === ONE_PIECE_GAME ? "One Piece Library" : "DustyCards"}
                </p>
                <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                  {activeGame === ONE_PIECE_GAME ? "One Piece Categories" : "Categories"}
                </h1>
                <p className="mt-3 max-w-2xl text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/56">
                  {activeGame === ONE_PIECE_GAME
                    ? "Browse One Piece rarity and chase-card groups without mixing them into Pokemon lists."
                    : "Jump straight into curated card lists like Trainer Full Art, Tag Team GX, Special Illustration Rare, shiny cards, promos and older mechanics."}
                </p>
              </div>

              {settings.onePieceLibraryEnabled ? (
                <div className="mt-[var(--ui-page-header-action-margin)]">
                  <GameFilterSwitch items={gameSwitchItems} />
                </div>
              ) : null}
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
              {stats.map((stat) => (
                <HeaderStatCard key={stat.label} {...stat} />
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-5 sm:space-y-6">
          {getCategoryGroups().map((group) => {
            const groupCategories = categories.filter((category) => category.group === group);
            if (groupCategories.length === 0) return null;

            return (
              <section key={group}>
                <SectionHeader title={group} count={groupCategories.length} compact />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupCategories.map((category) => (
                    <CategoryTile
                      key={`${category.game}:${category.slug}`}
                      category={category}
                      activeGame={activeGame}
                    />
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
