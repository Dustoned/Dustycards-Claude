import { Clock3, Gem, Sparkles, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import MoversBrowser from "@/app/movers/MoversBrowser";
import { loadMoversPageData } from "@/app/movers/page-data";
import type { CollectionMoverItem } from "@/lib/movers";

export const dynamic = "force-dynamic";

interface SummaryMetric {
  label: string;
  value: string;
  hint: string;
  Icon: LucideIcon;
  tone: "amber" | "emerald" | "sky" | "violet";
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
  };

  return tones[tone];
}

function getModeCopy(
  activeScope: "collection" | "all" | "graded" | "grading",
  activeItemScope: "collection" | "all"
) {
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

interface PreviewCardSpec {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  hrefLabel?: string;
  items: CollectionMoverItem[];
  reasonMode?: "raw" | "graded" | "target";
}

interface BuildPreviewArgs {
  data: Awaited<ReturnType<typeof loadMoversPageData>>["data"];
  activeScope: "collection" | "all" | "graded" | "grading";
}

function buildMoversPreviewCards({ data, activeScope }: BuildPreviewArgs): PreviewCardSpec[] {
  const previews: PreviewCardSpec[] = [];

  if (activeScope !== "graded" && activeScope !== "grading") {
    // Raw movers view → highlight buy and grade entry points.
    const cheapHighRarity = data.cheapestHighRarityMovers.length > 0
      ? data.cheapestHighRarityMovers
      : data.movers.filter((item) => item.moverScore > 0).slice(0, 8);
    if (cheapHighRarity.length > 0) {
      previews.push({
        eyebrow: "Best to buy",
        title: "Cheap high-rarity risers",
        description:
          "Affordable scarce cards already moving up — the closest thing to a clear buy signal.",
        items: cheapHighRarity,
        href: "/movers/cheap-high-rarity",
        hrefLabel: "Open all buys",
        reasonMode: "raw",
      });
    }

    if (data.topOpportunities.length > 0) {
      previews.push({
        eyebrow: "Best to grade",
        title: "Raw cheap, graded high",
        description:
          "Cards where the raw price stays low while graded copies sell for multiples — the easiest grading wins.",
        items: data.topOpportunities,
        href: "/movers?scope=grading",
        hrefLabel: "Open grade targets",
        reasonMode: "target",
      });
    }
  } else if (activeScope === "grading") {
    // Grading view → surface the headline picks plus a discount-watch hint.
    if (data.topOpportunities.length > 0) {
      previews.push({
        eyebrow: "Best to grade",
        title: "Highest grade-upside picks",
        description:
          "Top raw-to-graded multipliers that are still cheap to enter — ranked by composite grading score.",
        items: data.topOpportunities,
        href: "/movers?scope=grading",
        hrefLabel: "Show all grade targets",
        reasonMode: "target",
      });
    }
    if (data.discountedHighRarity.length > 0) {
      previews.push({
        eyebrow: "Buy the dip",
        title: "Discount Watch",
        description:
          "High-rarity cards trading deep below their peak — pair these with grading wins for compounded upside.",
        items: data.discountedHighRarity,
        href: "/movers/discount-watch",
        hrefLabel: "Open discount watch",
        reasonMode: "raw",
      });
    }
  }

  return previews;
}

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string }>;
}) {
  const { source, scope, view } = await searchParams;
  const { activePriceSource, activeScope, activeItemScope, data } = await loadMoversPageData(
    source,
    scope,
    view
  );
  const isGradedScope = activeScope === "graded";
  const isGradingScope = activeScope === "grading";
  const isRawScope = !isGradedScope && !isGradingScope;
  const modeCopy = getModeCopy(activeScope, activeItemScope);
  const updatedAt = data.movers[0]?.latestFetchedAt ?? null;
  const metrics = [
    {
      label: activeItemScope === "all" ? "Tracked Cards" : "Collection Cards",
      value: data.trackedCards.toLocaleString("en-US"),
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
      value: data.eligibleCards.toLocaleString("en-US"),
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
      value: data.cheapestHighRarityMovers.length.toLocaleString("en-US"),
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
  ] satisfies SummaryMetric[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <section className="rounded-2xl border border-black/8 bg-white/76 px-5 py-5 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/36">
                {modeCopy.eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-4xl">
                {modeCopy.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-white/58">
                {modeCopy.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
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
          </div>
        </section>

        <MoversBrowser
          key={`${activeScope}:${activeItemScope}`}
          movers={data.movers}
          activePriceSource={activePriceSource}
          activeScope={activeScope}
          activeItemScope={activeItemScope}
          previewCards={buildMoversPreviewCards({
            data,
            activeScope,
          })}
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
      </div>
    </div>
  );
}
