import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BrushCleaning, LibraryBig, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
  type CardSize,
} from "@/lib/user-settings";
import { getCardMarketValue } from "@/lib/price-history";

export const dynamic = "force-dynamic";

type IllustratorSort = "alpha" | "cards";

type IllustratorCardRow = {
  id: string;
  name: string;
  artist: string | null;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  tcp_market: number | null;
};

type IllustratorTileCard = {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  price: {
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
  };
};

function getTileConfig(cardSize: CardSize, widescreen: boolean) {
  if (cardSize === "small") {
    return {
      minWidth: widescreen ? "190px" : "170px",
      tileClass: "rounded-2xl p-3 gap-3",
      imageWrapClass: "aspect-[63/88]",
      titleClass: "text-sm",
      metaClass: "text-xs",
    };
  }

  if (cardSize === "large") {
    return {
      minWidth: widescreen ? "340px" : "270px",
      tileClass: "rounded-2xl p-5 gap-4",
      imageWrapClass: "aspect-[63/88]",
      titleClass: "text-base",
      metaClass: "text-sm",
    };
  }

  return {
    minWidth: widescreen ? "250px" : "210px",
    tileClass: "rounded-2xl p-4 gap-3.5",
    imageWrapClass: "aspect-[63/88]",
    titleClass: "text-sm",
    metaClass: "text-xs",
  };
}

function getCardDisplayPrice(card: IllustratorTileCard): number | null {
  return getCardMarketValue(card.price);
}

function formatCurrency(value: number | null): string {
  if (value == null) return "--";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getInitialGroup(value: string): string {
  const initial = value.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(initial) ? initial : "#";
}

function normalizeSort(value: string | undefined): IllustratorSort {
  return value === "cards" ? "cards" : "alpha";
}

function buildSortHref(sort: IllustratorSort): string {
  return sort === "alpha" ? "/illustrators" : `/illustrators?sort=${sort}`;
}

async function getIllustratorRows(): Promise<IllustratorCardRow[]> {
  return db.$queryRawUnsafe<IllustratorCardRow[]>(`
    SELECT
      c.id,
      c.name,
      c.artist,
      c.image_url,
      e.id AS episode_id,
      e.name AS episode_name,
      e.code AS episode_code,
      p.cm_en_lowest_nm,
      p.cm_de_lowest_nm,
      p.cm_fr_lowest_nm,
      p.cm_es_lowest_nm,
      p.cm_it_lowest_nm,
      p.tcp_market
    FROM "Card" c
    INNER JOIN "Episode" e
      ON e.id = c.episode_id
    LEFT JOIN "Price" p
      ON p.id = (
        SELECT p2.id
        FROM "Price" p2
        WHERE p2.card_id = c.id
        ORDER BY p2.fetched_at DESC, p2.id DESC
        LIMIT 1
      )
    WHERE c.artist IS NOT NULL
    ORDER BY c.artist ASC, c.name ASC
  `);
}

export default async function IllustratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const cookieStore = await cookies();
  const { sort: rawSort } = await searchParams;
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
  const sort = normalizeSort(rawSort);
  const tileConfig = getTileConfig(settings.cardSize, settings.widescreen);

  const allCards = await getIllustratorRows();
  const cards = allCards.filter(
    (card) =>
      card.artist &&
      !isHiddenExpansion({
        id: card.episode_id,
        code: card.episode_code,
        name: card.episode_name,
      })
  );

  const byArtist = new Map<
    string,
    {
      artist: string;
      cardCount: number;
      pricedCount: number;
      expansions: Set<string>;
      topCard: IllustratorTileCard | null;
      topPrice: number | null;
    }
  >();

  for (const card of cards) {
    if (!card.artist) continue;

    const entry = byArtist.get(card.artist) ?? {
      artist: card.artist,
      cardCount: 0,
      pricedCount: 0,
      expansions: new Set<string>(),
      topCard: null,
      topPrice: null,
    };

    const tileCard: IllustratorTileCard = {
      id: card.id,
      name: card.name,
      artist: card.artist,
      image_url: card.image_url,
      episode_id: card.episode_id,
      episode_name: card.episode_name,
      episode_code: card.episode_code,
      price: {
        cm_en_lowest_nm: card.cm_en_lowest_nm,
        cm_de_lowest_nm: card.cm_de_lowest_nm,
        cm_fr_lowest_nm: card.cm_fr_lowest_nm,
        cm_es_lowest_nm: card.cm_es_lowest_nm,
        cm_it_lowest_nm: card.cm_it_lowest_nm,
      },
    };
    const price = getCardDisplayPrice(tileCard);

    entry.cardCount += 1;
    if (price != null) {
      entry.pricedCount += 1;
    }
    entry.expansions.add(card.episode_id);

    if (
      !entry.topCard ||
      (price != null && (entry.topPrice == null || price > entry.topPrice)) ||
      (entry.topPrice == null && price == null && !entry.topCard.image_url && card.image_url)
    ) {
      entry.topCard = tileCard;
      entry.topPrice = price;
    }

    byArtist.set(card.artist, entry);
  }

  const illustrators = [...byArtist.values()];

  const sortedIllustrators =
    sort === "cards"
      ? [...illustrators].sort((a, b) => {
          const cardCountDiff = b.cardCount - a.cardCount;
          if (cardCountDiff !== 0) return cardCountDiff;

          const setCountDiff = b.expansions.size - a.expansions.size;
          if (setCountDiff !== 0) return setCountDiff;

          return a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" });
        })
      : [...illustrators].sort((a, b) =>
          a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" })
        );

  const sortedGroups =
    sort === "cards"
      ? [["Most cards", sortedIllustrators] as const]
      : (() => {
          const grouped = new Map<string, typeof sortedIllustrators>();
          for (const illustrator of sortedIllustrators) {
            const group = getInitialGroup(illustrator.artist);
            if (!grouped.has(group)) {
              grouped.set(group, []);
            }
            grouped.get(group)!.push(illustrator);
          }

          return [...grouped.entries()].sort(([a], [b]) => {
            if (a === "#") return 1;
            if (b === "#") return -1;
            return a.localeCompare(b);
          });
        })();

  const totalIllustrators = sortedIllustrators.length;
  const trackedCards = sortedIllustrators.reduce(
    (total, illustrator) => total + illustrator.cardCount,
    0
  );
  const pricedCards = sortedIllustrators.reduce(
    (total, illustrator) => total + illustrator.pricedCount,
    0
  );

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative mb-10 overflow-hidden rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-6 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-7">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(255,255,255,0.02))]" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
              Dusty Cards Collection
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              Illustrators
            </h1>
            <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-white/50">
              {totalIllustrators.toLocaleString()} illustrators across {trackedCards.toLocaleString()} tracked
              cards.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
            >
              Display tools in Settings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[32rem]">
            {[
              {
                label: "Illustrators",
                value: totalIllustrators.toLocaleString(),
                Icon: BrushCleaning,
                iconClass: "text-amber-500 dark:text-amber-300",
              },
              {
                label: "Tracked cards",
                value: trackedCards.toLocaleString(),
                Icon: LibraryBig,
                iconClass: "text-emerald-500 dark:text-emerald-300",
              },
              {
                label: "Priced cards",
                value: pricedCards.toLocaleString(),
                Icon: Sparkles,
                iconClass: "text-rose-500 dark:text-rose-300",
              },
            ].map(({ label, value, Icon, iconClass }) => (
              <div
                key={label}
                className="rounded-2xl border border-black/8 bg-black/[0.03] px-4 py-4 dark:border-white/8 dark:bg-white/[0.03]"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${iconClass}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-white/35">
                    {label}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-white/35">
            Sort
          </span>
          <div className="flex rounded-xl border border-black/8 bg-black/[0.03] p-1 dark:border-white/8 dark:bg-white/[0.03]">
            {[
              { value: "alpha" as const, label: "Alphabetical" },
              { value: "cards" as const, label: "Most cards" },
            ].map((option) => {
              const active = sort === option.value;

              return (
                <Link
                  key={option.value}
                  href={buildSortHref(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        <p className="text-sm text-gray-500 dark:text-white/45">
          {sort === "cards"
            ? "Showing illustrators by total tracked cards."
            : "Showing illustrators in alphabetical order."}
        </p>
      </div>

      <div className="space-y-12">
        {sortedGroups.map(([group, entries]) => (
          <section key={group}>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                {group}
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {entries.length}
              </span>
              <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
            </div>

            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${tileConfig.minWidth}, 1fr))`,
              }}
            >
              {entries.map((illustrator, index) => (
                <Link
                  key={illustrator.artist}
                  href={`/illustrators/${encodeURIComponent(illustrator.artist)}`}
                  className={`group glass flex flex-col transition-all duration-200 hover:scale-[1.02] hover:bg-white/8 active:scale-[0.98] dark:hover:bg-white/6 ${tileConfig.tileClass}`}
                >
                  <div
                    className={`relative overflow-hidden rounded-xl border border-black/6 bg-black/[0.03] shadow-md shadow-black/10 dark:border-white/8 dark:bg-white/[0.03] ${tileConfig.imageWrapClass}`}
                  >
                    {illustrator.topCard?.image_url ? (
                      <Image
                        src={illustrator.topCard.image_url}
                        alt={illustrator.topCard.name}
                        fill
                        className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                        sizes={tileConfig.minWidth}
                        priority={group === "A" && index < 4}
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-sm font-medium text-gray-400 dark:text-white/35">
                          {illustrator.artist.slice(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p
                      className={`line-clamp-2 font-semibold leading-snug text-gray-800 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white ${tileConfig.titleClass}`}
                    >
                      {illustrator.artist}
                    </p>
                    <p className={`truncate text-gray-400 dark:text-white/40 ${tileConfig.metaClass}`}>
                      {illustrator.topCard?.name ?? "No featured card yet"}
                    </p>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                        Cards
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {illustrator.cardCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                        Sets
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {illustrator.expansions.size}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03]">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                            Top
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-400 dark:text-white/40">
                            {illustrator.topCard?.name ?? "No featured card yet"}
                          </p>
                        </div>
                        <p className="shrink-0 whitespace-nowrap text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                          {formatCurrency(illustrator.topPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
