"use client";

import { useDeferredValue, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Search, X } from "lucide-react";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import type { WantPlannerGroup } from "@/lib/collection-data";
import type { TradingCardGameFilter } from "@/lib/games";
import type { CollectionCardViewItem } from "@/types/collection-view";
import WantsPlannerSection from "./WantsPlannerSection";

const CollectionCardsView = dynamic(() => import("@/components/CollectionCardsView"), {
  ssr: false,
  loading: () => null,
});

function itemMatchesSearch(item: CollectionCardViewItem, query: string): boolean {
  return cardMatchesSearchQuery(
    {
      name: item.name,
      cardNumber: item.card_number,
      episodeName: item.episode_name,
      episodeCode: item.episode_code,
      rarity: item.rarity,
    },
    query
  );
}

function groupMatchesSearch(group: WantPlannerGroup, query: string): boolean {
  return cardMatchesSearchQuery(
    {
      name: group.name,
      cardNumber: null,
      episodeName: group.subtitle,
      episodeCode: null,
      rarity: null,
    },
    query
  );
}

function filterPlannerGroups(groups: WantPlannerGroup[], query: string): WantPlannerGroup[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return groups;

  return groups.flatMap((group) => {
    const groupMatched = groupMatchesSearch(group, normalizedQuery);
    const items = groupMatched
      ? group.items
      : group.items.filter((item) => itemMatchesSearch(item, normalizedQuery));

    if (items.length === 0) return [];

    return [
      {
        ...group,
        items,
        visibleMissingCards: items.length,
        pricedCards: items.filter((item) => item.current_value != null).length,
        estimatedCost: Number(
          items.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
        ),
      },
    ];
  });
}

interface Props {
  plannerGroups: WantPlannerGroup[];
  personalItems: CollectionCardViewItem[];
  needsPlannerSync: boolean;
  game: TradingCardGameFilter;
  tileTrackWidth: string;
  widescreen: boolean;
}

export default function WantsPageContent({
  plannerGroups,
  personalItems,
  needsPlannerSync,
  game,
  tileTrackWidth,
  widescreen,
}: Props) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim();
  const hasSearch = normalizedSearch.length > 0;
  const filteredPlannerGroups = useMemo(
    () => filterPlannerGroups(plannerGroups, normalizedSearch),
    [plannerGroups, normalizedSearch]
  );
  const matchingPersonalItems = useMemo(
    () =>
      hasSearch
        ? personalItems.filter((item) => itemMatchesSearch(item, normalizedSearch))
        : personalItems,
    [hasSearch, normalizedSearch, personalItems]
  );
  const plannerMatchCount = filteredPlannerGroups.reduce(
    (total, group) => total + group.items.length,
    0
  );
  const totalPlannerItems = plannerGroups.reduce((total, group) => total + group.items.length, 0);
  const totalWants = totalPlannerItems + personalItems.length;
  const totalMatches = plannerMatchCount + matchingPersonalItems.length;
  const showPersonalList =
    matchingPersonalItems.length > 0 ||
    (!hasSearch && (personalItems.length > 0 || plannerGroups.length === 0));
  const showNoPersonalMessage = !hasSearch && personalItems.length === 0 && plannerGroups.length > 0;
  const showNoSearchMatches = hasSearch && totalMatches === 0;

  return (
    <>
      <section className="binder-panel rounded-2xl p-2.5 sm:p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search wants, binder cards, number, set..."
              className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.055] pl-10 pr-10 text-sm font-semibold text-white outline-none transition-colors placeholder:font-medium placeholder:text-white/30 focus:border-white/16"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white"
                aria-label="Clear wants search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] px-3 text-xs font-bold tabular-nums text-white/48">
            {hasSearch
              ? `${totalMatches.toLocaleString("en-US")} / ${totalWants.toLocaleString("en-US")}`
              : `${totalWants.toLocaleString("en-US")} wants`}
          </span>
        </div>
      </section>

      <WantsPlannerSection
        groups={filteredPlannerGroups}
        needsPlannerSync={!hasSearch && needsPlannerSync}
        game={game}
        tileTrackWidth={tileTrackWidth}
        widescreen={widescreen}
        searchValue={search}
      />

      {showPersonalList ? (
        <CollectionCardsView
          items={personalItems}
          allowWantRemoval
          emptyTitle={hasSearch ? "No matching personal wants" : "No wants yet"}
          emptyText={
            hasSearch
              ? "No personal wants match this search."
              : "Use Want on a card detail to keep it here."
          }
          sectionTitle={
            hasSearch
              ? "Matching personal wants"
              : plannerGroups.length > 0
                ? "Personal wants"
                : "Wanted cards"
          }
          sectionCount={
            hasSearch
              ? matchingPersonalItems.length.toLocaleString("en-US")
              : personalItems.length.toLocaleString("en-US")
          }
          showFilters={false}
          forcedSortBy="cm_en"
          forcedSortDir="desc"
          hideSortControls
          searchValue={search}
          onSearchChange={setSearch}
        />
      ) : null}

      {showNoPersonalMessage ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/48 shadow-sm shadow-black/20">
          No personal wants outside binder goals.
        </section>
      ) : null}

      {showNoSearchMatches ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/48 shadow-sm shadow-black/20">
          No wants match this search.
        </section>
      ) : null}
    </>
  );
}
