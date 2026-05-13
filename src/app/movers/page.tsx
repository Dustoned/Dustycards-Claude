import { ArrowDownRight, Clock3, Gem, Sparkles, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CollectionValueDrivers from "@/components/CollectionValueDrivers";
import MoversBrowser from "@/app/movers/MoversBrowser";
import SealedMoversBrowser from "@/app/movers/SealedMoversBrowser";
import { loadMoversPageData } from "@/app/movers/page-data";
import { requirePageUser } from "@/lib/page-auth";
import { formatCollectionCurrency } from "@/lib/collection";
import type { MoversPageScope } from "@/app/movers/routing";
import type { CollectionValueDriversData } from "@/lib/collection-data";
import type { CollectionMoversData, MoversScope } from "@/lib/movers";
import type { SealedMoversData } from "@/lib/sealed-movers";

export const dynamic = "force-dynamic";

interface SummaryMetric {
  label: string;
  value: string;
  hint: string;
  Icon: LucideIcon;
  tone: "amber" | "emerald" | "sky" | "violet" | "rose";
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metricToneClass(tone: SummaryMetric["tone"]): string {
  const tones: Record<SummaryMetric["tone"], string> = {
    amber: "border-amber-400/14 bg-amber-400/[0.06] text-amber-700 dark:text-amber-200",
    emerald:
      "border-emerald-400/14 bg-emerald-400/[0.06] text-emerald-700 dark:text-emerald-200",
    sky: "border-sky-400/14 bg-sky-400/[0.06] text-sky-700 dark:text-sky-200",
    violet: "border-violet-400/14 bg-violet-400/[0.06] text-violet-700 dark:text-violet-200",
    rose: "border-rose-400/14 bg-rose-400/[0.06] text-rose-700 dark:text-rose-200",
  };

  return tones[tone];
}

function getModeCopy(
  activeScope: MoversPageScope,
  activeItemScope: "collection" | "all"
) {
  if (activeScope === "value") {
    return {
      eyebrow: "Value Changes / Collection",
      title: "Movers",
      description:
        "See exactly which collection items explain the latest value change, before jumping into raw, graded, targets, or sealed movers.",
      ranking: "Latest collection value change",
    };
  }

  if (activeScope === "sealed") {
    return {
      eyebrow: activeItemScope === "collection" ? "Sealed Movers / Collection" : "Sealed Movers / All Products",
      title: "Movers",
      description:
        "Track sealed Pokemon products by recent CardMarket movement, lifetime highs and lows, and collection scope.",
      ranking: "Sealed products",
    };
  }

  if (activeScope === "graded") {
    return {
      eyebrow: activeItemScope === "collection" ? "Graded Market / Collection" : "Graded Market / All Cards",
      title: "Movers",
      description:
        "Track every current slab label as its own market item, with recent movement and lifetime context tucked into details.",
      ranking: "Graded prices",
    };
  }

  if (activeScope === "grading") {
    return {
      eyebrow: activeItemScope === "collection" ? "Grade Targets / Collection" : "Grade Targets / All Cards",
      title: "Movers",
      description:
        "Find cards where the raw CardMarket price is low compared with the current graded value.",
      ranking: "Raw vs graded upside",
    };
  }

  return {
    eyebrow: activeScope === "all" ? "Raw Movers / All Cards" : "Raw Movers / Collection",
    title: "Movers",
    description:
      activeScope === "all"
        ? "Scan all tracked raw cards for the clearest recent price movement."
        : "Scan your collection for raw cards with the clearest recent price movement.",
    ranking: activeScope === "all" ? "All raw cards" : "Collection raw cards",
  };
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return `${value > 0 ? "+" : ""}${formatCollectionCurrency(value)}`;
}

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string }>;
}) {
  const { source, scope, view } = await searchParams;
  const nextParams = new URLSearchParams();
  if (source) nextParams.set("source", source);
  if (scope) nextParams.set("scope", scope);
  if (view) nextParams.set("view", view);
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/movers${nextQuery ? `?${nextQuery}` : ""}`);
  const { activePriceSource, activeScope, activeItemScope, data } = await loadMoversPageData(
    source,
    scope,
    view,
    user.id
  );
  const isValueScope = activeScope === "value";
  const isSealedScope = activeScope === "sealed";
  const isGradedScope = activeScope === "graded";
  const isGradingScope = activeScope === "grading";
  const isRawScope = !isValueScope && !isSealedScope && !isGradedScope && !isGradingScope;
  const modeCopy = getModeCopy(activeScope, activeItemScope);
  const valueData = isValueScope ? (data as CollectionValueDriversData) : null;
  const sealedData = isSealedScope ? (data as SealedMoversData) : null;
  const cardData = !isValueScope && !isSealedScope ? (data as CollectionMoversData) : null;
  const updatedAt = sealedData?.updatedAt ?? cardData?.movers[0]?.latestFetchedAt ?? null;
  const metrics = valueData
    ? ([
        {
          label: "Net Change",
          value: formatSignedCurrency(valueData.totalChange),
          hint:
            valueData.previousLabel && valueData.latestLabel
              ? `${valueData.previousLabel} to ${valueData.latestLabel}`
              : "No comparison snapshot yet.",
          Icon: TrendingUp,
          tone:
            (valueData.totalChange ?? 0) >= 0 ? "emerald" : "rose",
        },
        {
          label: "Gains",
          value: formatSignedCurrency(valueData.gainsTotal),
          hint: `${valueData.gains.length.toLocaleString("en-US")} top gain drivers shown.`,
          Icon: Sparkles,
          tone: "emerald",
        },
        {
          label: "Drops",
          value: formatSignedCurrency(valueData.dropsTotal),
          hint: `${valueData.drops.length.toLocaleString("en-US")} top drop drivers shown.`,
          Icon: ArrowDownRight,
          tone: "rose",
        },
        {
          label: "Items",
          value: (valueData.gains.length + valueData.drops.length).toLocaleString("en-US"),
          hint: "Largest item-level contributors in the latest snapshot.",
          Icon: Gem,
          tone: "sky",
        },
      ] satisfies SummaryMetric[])
    : isSealedScope && sealedData
    ? ([
        {
          label: activeItemScope === "all" ? "Tracked Products" : "Collection Products",
          value: sealedData.trackedProducts.toLocaleString("en-US"),
          hint: "Sealed products checked for CardMarket movement.",
          Icon: Gem,
          tone: "amber",
        },
        {
          label: "Movers",
          value: sealedData.eligibleProducts.toLocaleString("en-US"),
          hint: "Priced sealed products in the current market list.",
          Icon: TrendingUp,
          tone: "emerald",
        },
        {
          label: "Entry Picks",
          value: sealedData.cheapestMovers.length.toLocaleString("en-US"),
          hint: "Lower-price sealed products that are already moving.",
          Icon: Sparkles,
          tone: "violet",
        },
        {
          label: "Updated",
          value: updatedAt ? formatShortDate(updatedAt) : "--",
          hint: updatedAt ? formatDateTime(updatedAt) : "No snapshot yet.",
          Icon: Clock3,
          tone: "sky",
        },
      ] satisfies SummaryMetric[])
    : ([
        {
          label: activeItemScope === "all" ? "Tracked Cards" : "Collection Cards",
          value: cardData?.trackedCards.toLocaleString("en-US") ?? "0",
          hint: isGradingScope
            ? "Labels compared with raw CardMarket price."
            : isGradedScope
              ? "Current labels with graded price data."
              : "Cards checked for raw movement.",
          Icon: Gem,
          tone: "amber",
        },
        {
          label: isGradingScope ? "Targets" : isGradedScope ? "Labels Shown" : "Movers",
          value: cardData?.eligibleCards.toLocaleString("en-US") ?? "0",
          hint: isGradingScope
            ? "Positive raw-to-graded upside."
            : isGradedScope
              ? "Current slab labels in the market list."
              : "Cards with meaningful movement.",
          Icon: TrendingUp,
          tone: "emerald",
        },
        {
          label: isGradingScope ? "Cheap Raw" : "Opportunity",
          value: cardData?.cheapestHighRarityMovers.length.toLocaleString("en-US") ?? "0",
          hint: isGradingScope ? "Raw price at or below 15 EUR." : "Lower-price high-rarity picks.",
          Icon: Sparkles,
          tone: "violet",
        },
        {
          label: "Updated",
          value: updatedAt ? formatShortDate(updatedAt) : "--",
          hint: updatedAt ? formatDateTime(updatedAt) : "No snapshot yet.",
          Icon: Clock3,
          tone: "sky",
        },
      ] satisfies SummaryMetric[]);
  const valueMetricChips = valueData
    ? [
        {
          label: "Net",
          value: formatSignedCurrency(valueData.totalChange),
          tone:
            (valueData.totalChange ?? 0) >= 0
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-rose-700 dark:text-rose-300",
        },
        {
          label: "Gains",
          value: formatSignedCurrency(valueData.gainsTotal),
          tone: "text-emerald-700 dark:text-emerald-300",
        },
        {
          label: "Drops",
          value: formatSignedCurrency(valueData.dropsTotal),
          tone: "text-rose-700 dark:text-rose-300",
        },
      ]
    : [];

  return (
    <div
      className={`page-container mx-auto max-w-7xl ${
        isValueScope ? "px-3 py-3 sm:px-6 sm:py-6 lg:px-8" : "px-4 py-5 sm:px-6 sm:py-8 lg:px-8"
      }`}
    >
      <div className={`flex w-full flex-col ${isValueScope ? "gap-3 sm:gap-4" : "gap-5 sm:gap-6"}`}>
        <section className={`rounded-2xl border border-black/8 bg-white/76 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] ${
          isValueScope ? "px-3 py-3 sm:px-4 sm:py-4" : "px-5 py-5"
        }`}>
          <div className={isValueScope
            ? "grid gap-2 sm:gap-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.56fr)] md:items-end"
            : "grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:items-end"
          }>
            <div className="min-w-0">
              <p className={`font-semibold uppercase text-gray-400 dark:text-white/36 ${
                isValueScope ? "text-[9px] tracking-[0.14em] sm:text-[10px]" : "text-[11px] tracking-[0.18em]"
              }`}>
                {modeCopy.eyebrow}
              </p>
              <h1 className={`mt-1.5 font-bold tracking-tight text-gray-950 dark:text-white ${
                isValueScope ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"
              }`}>
                {modeCopy.title}
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-white/58 ${
                isValueScope ? "hidden lg:block" : ""
              }`}>
                {modeCopy.description}
              </p>
              <div className={isValueScope ? "mt-2 hidden flex-wrap gap-2 sm:flex" : "mt-4 flex flex-wrap gap-2"}>
                <span className="inline-flex rounded-full border border-black/8 bg-black/[0.035] px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/72">
                  {modeCopy.ranking}
                </span>
                {isRawScope ? (
                  <span className="inline-flex rounded-full border border-black/8 bg-black/[0.035] px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/72">
                    {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
                  </span>
                ) : null}
              </div>
            </div>

            {isValueScope && valueData ? (
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                {valueMetricChips.map((chip) => (
                  <div
                    key={chip.label}
                    className="min-w-0 rounded-lg border border-black/8 bg-black/[0.03] px-2 py-1.5 dark:border-white/8 dark:bg-white/[0.045] sm:rounded-xl sm:px-2.5 sm:py-2"
                  >
                    <p className="truncate text-[8px] font-semibold uppercase tracking-[0.11em] text-gray-400 dark:text-white/38 sm:text-[9px]">
                      {chip.label}
                    </p>
                    <p className={`mt-0.5 truncate text-xs font-bold tabular-nums sm:mt-1 sm:text-sm ${chip.tone}`}>
                      {chip.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {metrics.map((metric) => {
                const Icon = metric.Icon;

                return (
                  <div
                    key={metric.label}
                    className={`min-w-0 rounded-2xl border px-3 py-3 sm:px-4 ${metricToneClass(metric.tone)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                          {metric.label}
                        </p>
                        <p className="mt-1 text-xl font-bold tracking-tight tabular-nums text-gray-950 dark:text-white sm:text-2xl">
                          {metric.value}
                        </p>
                      </div>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/12 bg-white/55 dark:bg-black/16 sm:h-9 sm:w-9">
                        <Icon className="h-4 w-4" />
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-white/46">
                      {metric.hint}
                    </p>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </section>

        {isValueScope && valueData ? (
          <CollectionValueDrivers data={valueData} />
        ) : isSealedScope && sealedData ? (
          <SealedMoversBrowser
            key={`${activeScope}:${activeItemScope}`}
            data={sealedData}
            activeItemScope={activeItemScope}
          />
        ) : cardData ? (
          <MoversBrowser
            key={`${activeScope}:${activeItemScope}`}
            movers={cardData.movers}
            activePriceSource={activePriceSource}
            activeScope={activeScope as MoversScope}
            activeItemScope={activeItemScope}
            emptyTitle={
              isGradingScope
                ? "No grade targets found"
                : isGradedScope
                  ? "No graded market items found"
                  : "No movers found"
            }
            emptyDescription={
              isGradingScope
                ? "No current graded label has positive raw-to-graded upside with a raw CardMarket price yet."
                : isGradedScope
                  ? "No current graded labels have enough data to show."
                  : "There is not enough recent movement for this filter combination yet."
            }
            eyebrow={
              isGradingScope ? "Grade Targets" : isGradedScope ? "Graded Market" : "Raw Movers"
            }
            title={
              isGradingScope ? "Best cards to grade" : isGradedScope ? "Slab market" : "Market list"
            }
            description={
              isGradingScope
                ? "Sorted by raw-to-graded upside with the extra details available per card."
                : isGradedScope
                  ? "Every graded label is listed separately, with its own movement and price history."
                  : "Raw cards ranked by recent and lifetime movement, with collection scope and source controls nearby."
            }
          />
        ) : null}
      </div>
    </div>
  );
}
