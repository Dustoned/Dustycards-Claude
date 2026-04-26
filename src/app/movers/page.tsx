import { Clock3, Gem, Sparkles, TrendingUp } from "lucide-react";
import MoversBrowser from "@/app/movers/MoversBrowser";
import {
  buildMoversSourceHref,
  getDisplayedCheapHighRarityMovers,
  loadMoversPageData,
} from "@/app/movers/page-data";

export const dynamic = "force-dynamic";

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatTile({
  label,
  value,
  hint,
  Icon,
  iconClassName,
}: {
  label: string;
  value: string;
  hint: string;
  Icon: typeof TrendingUp;
  iconClassName: string;
}) {
  return (
    <div className="rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/38">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/6 bg-white/80 dark:border-white/10 dark:bg-white/[0.06] ${iconClassName}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-sm text-gray-500 dark:text-white/48">{hint}</p>
    </div>
  );
}

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  const { activePriceSource, data } = await loadMoversPageData(source);
  const displayedCheapHighRarity = getDisplayedCheapHighRarityMovers(data);

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <div className="relative overflow-hidden rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-6 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-7">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(255,255,255,0.02))]" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
                DustyCards Collection
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Movers
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/50">
                Cards from your own collection that are moving up quickly, with extra weight for
                high rarity and lower current prices. For now this page only uses collection cards
                with enough recent history.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                  Ranking source: {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[38rem] xl:grid-cols-4">
              <StatTile
                label="Tracked"
                value={data.trackedCards.toLocaleString()}
                hint="Collection cards checked for recent movement."
                Icon={Gem}
                iconClassName="text-amber-500 dark:text-amber-300"
              />
              <StatTile
                label="Movers"
                value={data.eligibleCards.toLocaleString()}
                hint="Cards with enough recent history and a meaningful positive move."
                Icon={TrendingUp}
                iconClassName="text-emerald-500 dark:text-emerald-300"
              />
              <StatTile
                label="Cheap Rare"
                value={data.cheapestHighRarityMovers.length.toLocaleString()}
                hint="Cheap high-rarity movers under roughly the lower-price bands."
                Icon={Sparkles}
                iconClassName="text-violet-500 dark:text-violet-300"
              />
              <StatTile
                label="Updated"
                value={
                  data.movers[0]?.latestFetchedAt
                    ? formatShortDate(data.movers[0].latestFetchedAt)
                    : "--"
                }
                hint={
                  data.movers[0]?.latestFetchedAt
                    ? formatDateTime(data.movers[0].latestFetchedAt)
                    : "No recent mover snapshot yet."
                }
                Icon={Clock3}
                iconClassName="text-sky-500 dark:text-sky-300"
              />
            </div>
          </div>
        </div>

        {data.eligibleCards === 0 ? (
          <div className="rounded-[28px] border border-black/8 bg-black/[0.03] p-8 text-center shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">Nog geen movers gevonden</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-white/48">
              Er zijn nog niet genoeg collection-kaarten met recente history en een duidelijke
              move. Zodra meer history binnenkomt, vult deze pagina zich automatisch.
            </p>
          </div>
        ) : (
          <MoversBrowser
            movers={data.movers}
            activePriceSource={activePriceSource}
            spotlights={[
              { title: "Strongest 7D Move", item: data.strongest7d, windowKey: "7d" },
              { title: "Strongest 30D Move", item: data.strongest30d, windowKey: "30d" },
            ]}
            previewCards={[
              {
                eyebrow: "Secondary Pocket",
                title: "Cheap movers with strong rarity",
                description: "Goedkope high-rarity kaarten uit je collectie die al duidelijke kracht laten zien.",
                href: buildMoversSourceHref("/movers/cheap-high-rarity", activePriceSource),
                hrefLabel: "Open page",
                items: displayedCheapHighRarity,
              },
              {
                eyebrow: "Discount Watch",
                title: "High rarity cards that fell hard",
                description: "High-rarity kaarten die nu ver onder hun piek staan en daardoor relatief goedkoop ogen.",
                href: buildMoversSourceHref("/movers/discount-watch", activePriceSource),
                hrefLabel: "Open page",
                items: data.discountedHighRarity,
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
