import Image from "next/image";
import Link from "next/link";
import { BookOpen, Boxes, Coins, Sparkles, TrendingUp } from "lucide-react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import CollectionSealedView from "@/components/CollectionSealedView";
import CreateBinderButton from "@/components/CreateBinderButton";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCollectionOverviewData } from "@/lib/collection-data";

export const dynamic = "force-dynamic";

function TabLink({
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
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab =
    tab === "cards" || tab === "binders" || tab === "sealed" ? tab : "overview";
  const data = await getCollectionOverviewData();

  const summaryCards = [
    {
      label: "Collection Value",
      value: formatCollectionCurrency(data.overview.currentValue),
      Icon: TrendingUp,
      iconClass: "text-emerald-500 dark:text-emerald-300",
    },
    {
      label: "Spent",
      value: formatCollectionCurrency(data.overview.investment),
      Icon: Coins,
      iconClass: "text-amber-500 dark:text-amber-300",
    },
    {
      label: "Cards",
      value: data.overview.totalCards.toLocaleString(),
      Icon: Sparkles,
      iconClass: "text-sky-500 dark:text-sky-300",
    },
    {
      label: "Sealed",
      value: data.overview.totalSealedUnits.toLocaleString(),
      Icon: Boxes,
      iconClass: "text-rose-500 dark:text-rose-300",
    },
    {
      label: "Binders",
      value: data.overview.totalBinders.toLocaleString(),
      Icon: BookOpen,
      iconClass: "text-violet-500 dark:text-violet-300",
    },
  ];

  const hasCollection =
    data.cards.length > 0 || data.sealed.length > 0 || data.binders.length > 0;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative mb-8 overflow-hidden rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-6 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-7">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(255,255,255,0.02))]" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
              DustyCards
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              My Collection
            </h1>
            <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-white/50">
              Keep track of your singles, binders and sealed with the same live market data you already use everywhere else.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CreateBinderButton episodes={data.episodes} />
            <Link
              href="/expansions"
              className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
            >
              Browse Expansions
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(({ label, value, Icon, iconClass }) => (
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

      <div className="glass mb-8 rounded-3xl px-6 py-6 shadow-lg shadow-black/5">
        <PriceHistoryPanel
          title="Collection Value"
          currency="EUR"
          points={data.overview.chart}
          currentValue={data.overview.currentValue}
          subtitle={`P&L ${data.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
            data.overview.pnl
          )}`}
          emptyText="Add cards or sealed to start tracking your value"
        />
      </div>

      <div className="mb-6 inline-flex rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
        <TabLink href="/" active={activeTab === "overview"} label="Overview" />
        <TabLink href="/?tab=cards" active={activeTab === "cards"} label="Cards" />
        <TabLink href="/?tab=binders" active={activeTab === "binders"} label="Binders" />
        <TabLink href="/?tab=sealed" active={activeTab === "sealed"} label="Sealed" />
      </div>

      {!hasCollection && (
        <div className="glass mb-8 rounded-3xl p-12 text-center shadow-md shadow-black/5">
          <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
            Your collection is still empty
          </p>
          <p className="text-sm text-gray-400">
            Start with a card, create a binder, or add sealed from search and expansion pages.
          </p>
        </div>
      )}

      {activeTab === "overview" && (
        <div className="space-y-10">
          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                Loose Singles
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {data.looseSingles.length}
              </span>
              <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
            </div>
            <CollectionCardsView
              items={data.looseSingles.slice(0, 12)}
              emptyTitle="No loose singles yet"
              emptyText="Cards saved without a binder appear here."
            />
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                Binders
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {data.binders.length}
              </span>
              <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
            </div>

            {data.binders.length === 0 ? (
              <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
                <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">No binders yet</p>
                <p className="text-sm text-gray-400">
                  Create a linked set binder or a custom binder to start organizing cards.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.binders.map((binder) => (
                  <Link
                    key={binder.id}
                    href={`/binders/${binder.id}`}
                    className="glass group flex flex-col gap-4 rounded-3xl p-5 shadow-lg shadow-black/5 transition-transform hover:scale-[1.01] hover:bg-white/8 dark:hover:bg-white/6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                          {binder.name}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
                          {binder.subtitle}
                        </p>
                      </div>
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/8"
                        style={{ color: binder.accent_color ?? "#8b5cf6" }}
                      >
                        {binder.episode?.logo_url ? (
                        <div className="relative h-7 w-7">
                          <Image
                            src={binder.episode.logo_url}
                            alt={binder.name}
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </div>
                        ) : (
                          <CollectionBinderIcon iconName={binder.icon_name} className="h-5 w-5" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { label: "Progress", value: binder.progressLabel },
                        { label: "Value", value: formatCollectionCurrency(binder.currentValue) },
                        {
                          label: "P&L",
                          value: `${binder.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(binder.pnl)}`,
                        },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          className="rounded-2xl border border-black/8 bg-black/[0.03] px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                            {metric.label}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                            {metric.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                Sealed
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {data.sealed.length}
              </span>
              <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
            </div>
            <CollectionSealedView
              items={data.sealed.slice(0, 8)}
              emptyTitle="No sealed saved yet"
              emptyText="Sealed products you add from search or expansion pages will appear here."
            />
          </section>
        </div>
      )}

      {activeTab === "cards" && (
        <CollectionCardsView
          items={data.cards}
          emptyTitle="No cards in your collection"
          emptyText="Use the + button on any card to add it here."
        />
      )}

      {activeTab === "binders" && (
        <div className="space-y-4">
          {data.binders.length === 0 ? (
            <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
              <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">No binders yet</p>
              <p className="text-sm text-gray-400">
                Create a linked set binder or a custom binder to start organizing cards.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.binders.map((binder) => (
                <Link
                  key={binder.id}
                  href={`/binders/${binder.id}`}
                  className="glass group flex flex-col gap-4 rounded-3xl p-5 shadow-lg shadow-black/5 transition-transform hover:scale-[1.01] hover:bg-white/8 dark:hover:bg-white/6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {binder.name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
                        {binder.subtitle}
                      </p>
                    </div>
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/8"
                      style={{ color: binder.accent_color ?? "#8b5cf6" }}
                    >
                      {binder.episode?.logo_url ? (
                        <div className="relative h-7 w-7">
                          <Image
                            src={binder.episode.logo_url}
                            alt={binder.name}
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <CollectionBinderIcon iconName={binder.icon_name} className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { label: "Progress", value: binder.progressLabel },
                      { label: "Value", value: formatCollectionCurrency(binder.currentValue) },
                      {
                        label: "P&L",
                        value: `${binder.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(binder.pnl)}`,
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-2xl border border-black/8 bg-black/[0.03] px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                          {metric.label}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </Link>
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
  );
}
