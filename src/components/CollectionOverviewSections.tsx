"use client";

import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import CardLayoutSizeControl from "@/components/CardLayoutSizeControl";
import { SectionHeader as SharedSectionHeader } from "@/components/PageHeader";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import {
  buildOverviewSectionOrderCookie,
  DEFAULT_OVERVIEW_SECTION_ORDER,
  normalizeOverviewSectionOrder,
  OVERVIEW_SECTION_ORDER_STORAGE_KEY,
  type OverviewSectionKey,
  parseStoredOverviewSectionOrder,
} from "@/lib/overview-section-order";
import type { CollectionCardViewItem, CollectionSealedViewItem } from "@/types/collection-view";

const BinderOverviewGrid = dynamic(() => import("@/components/BinderOverviewGrid"), {
  loading: () => null,
});
const BinderWatchSection = dynamic(() => import("@/components/BinderWatchSection"), {
  loading: () => null,
});
const CollectionCardsView = dynamic(() => import("@/components/CollectionCardsView"), {
  loading: () => null,
});
const CollectionSealedView = dynamic(() => import("@/components/CollectionSealedView"), {
  loading: () => null,
});
const CreateBinderButton = dynamic(() => import("@/components/CreateBinderButton"), {
  loading: () => null,
});

interface BinderOverviewItem {
  id: string;
  name: string;
  subtitle: string;
  progressLabel: string;
  ownedCards: number;
  totalCards: number | null;
  completionPct: number | null;
  missingCards: number | null;
  currentValue: number;
  investment: number;
  pnl: number;
  recentChange: number | null;
  recentChangePct: number | null;
  recentChangeLabel: string | null;
  accent_color: string | null;
  icon_name: string | null;
  episode: {
    logo_url: string | null;
  } | null;
}

interface Props {
  gradedLooseSingles: CollectionCardViewItem[];
  rawLooseSingles: CollectionCardViewItem[];
  showRawLooseSinglesSection: boolean;
  binderCards: CollectionCardViewItem[];
  sealed: CollectionSealedViewItem[];
  binders: BinderOverviewItem[];
  initialSectionOrder?: OverviewSectionKey[] | null;
  readOnly?: boolean;
}

interface OverviewSection {
  key: OverviewSectionKey;
  show: boolean;
  label: string;
  render: (sectionControls: ReactNode) => ReactNode;
}

function moveVisibleSection(
  order: OverviewSectionKey[],
  visibleOrder: OverviewSectionKey[],
  sectionKey: OverviewSectionKey,
  direction: -1 | 1
): OverviewSectionKey[] {
  const fromIndex = visibleOrder.indexOf(sectionKey);
  const toIndex = fromIndex + direction;

  if (fromIndex === -1 || toIndex < 0 || toIndex >= visibleOrder.length) {
    return order;
  }

  const nextVisibleOrder = [...visibleOrder];
  const [moved] = nextVisibleOrder.splice(fromIndex, 1);
  nextVisibleOrder.splice(toIndex, 0, moved);

  const visibleKeys = new Set(visibleOrder);
  let visibleIndex = 0;

  return normalizeOverviewSectionOrder(order).map((key) => {
    if (!visibleKeys.has(key)) {
      return key;
    }

    const nextKey = nextVisibleOrder[visibleIndex] ?? key;
    visibleIndex += 1;
    return nextKey;
  });
}

function cardItemMatchesSearch(item: CollectionCardViewItem, query: string): boolean {
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

function sealedItemMatchesSearch(item: CollectionSealedViewItem, query: string): boolean {
  return cardMatchesSearchQuery(
    {
      name: item.name,
      cardNumber: null,
      episodeName: item.episode_name,
      episodeCode: item.episode_code,
      rarity: null,
    },
    query
  );
}

function binderMatchesSearch(item: BinderOverviewItem, query: string): boolean {
  return cardMatchesSearchQuery(
    {
      name: item.name,
      cardNumber: null,
      episodeName: item.subtitle,
      episodeCode: null,
      rarity: item.progressLabel,
    },
    query
  );
}

function SectionHeader({
  label,
  count,
  trailing,
}: {
  label: string;
  count: number;
  trailing?: ReactNode;
}) {
  return (
    <SharedSectionHeader title={label} count={count} actions={trailing} compact className="mb-2.5" />
  );
}

function SectionReorderControls({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const buttonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/8 hover:text-white disabled:pointer-events-none disabled:opacity-30";

  return (
    <div
      className="hidden select-none items-center rounded-full border border-white/8 bg-white/[0.045] p-0.5 touch-manipulation sm:inline-flex"
      aria-label={`Reorder ${label}`}
    >
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className={buttonClass}
        aria-label={`Move ${label} up`}
        title={`Move ${label} up`}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className={buttonClass}
        aria-label={`Move ${label} down`}
        title={`Move ${label} down`}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function CollectionOverviewSections({
  gradedLooseSingles,
  rawLooseSingles,
  showRawLooseSinglesSection,
  binderCards,
  sealed,
  binders,
  initialSectionOrder = null,
  readOnly = false,
}: Props) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim();
  const hasSearch = normalizedSearch.length > 0;
  const [sectionOrder, setSectionOrder] = useState<OverviewSectionKey[]>(
    initialSectionOrder ?? DEFAULT_OVERVIEW_SECTION_ORDER
  );
  const [hasResolvedSectionOrder, setHasResolvedSectionOrder] = useState(
    Boolean(initialSectionOrder)
  );
  const filteredGradedLooseSingles = useMemo(
    () =>
      hasSearch
        ? gradedLooseSingles.filter((item) => cardItemMatchesSearch(item, normalizedSearch))
        : gradedLooseSingles,
    [gradedLooseSingles, hasSearch, normalizedSearch]
  );
  const filteredRawLooseSingles = useMemo(
    () =>
      hasSearch
        ? rawLooseSingles.filter((item) => cardItemMatchesSearch(item, normalizedSearch))
        : rawLooseSingles,
    [rawLooseSingles, hasSearch, normalizedSearch]
  );
  const filteredBinderCards = useMemo(
    () =>
      hasSearch
        ? binderCards.filter((item) => cardItemMatchesSearch(item, normalizedSearch))
        : binderCards,
    [binderCards, hasSearch, normalizedSearch]
  );
  const filteredSealed = useMemo(
    () =>
      hasSearch
        ? sealed.filter((item) => sealedItemMatchesSearch(item, normalizedSearch))
        : sealed,
    [sealed, hasSearch, normalizedSearch]
  );
  const filteredBinders = useMemo(
    () =>
      hasSearch
        ? binders.filter((item) => binderMatchesSearch(item, normalizedSearch))
        : binders,
    [binders, hasSearch, normalizedSearch]
  );
  const totalSearchableItems =
    gradedLooseSingles.length + rawLooseSingles.length + binderCards.length + sealed.length + binders.length;
  const matchingSearchableItems =
    filteredGradedLooseSingles.length +
    filteredRawLooseSingles.length +
    filteredBinderCards.length +
    filteredSealed.length +
    filteredBinders.length;

  useEffect(() => {
    if (hasResolvedSectionOrder) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(OVERVIEW_SECTION_ORDER_STORAGE_KEY);
        setSectionOrder(parseStoredOverviewSectionOrder(raw) ?? DEFAULT_OVERVIEW_SECTION_ORDER);
      } catch {
        setSectionOrder(DEFAULT_OVERVIEW_SECTION_ORDER);
      } finally {
        setHasResolvedSectionOrder(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasResolvedSectionOrder]);

  useEffect(() => {
    if (!hasResolvedSectionOrder) {
      return;
    }

    const normalizedOrder = normalizeOverviewSectionOrder(sectionOrder);

    try {
      localStorage.setItem(
        OVERVIEW_SECTION_ORDER_STORAGE_KEY,
        JSON.stringify(normalizedOrder)
      );
    } catch {}

    document.cookie = buildOverviewSectionOrderCookie(normalizedOrder);
  }, [hasResolvedSectionOrder, sectionOrder]);

  const sectionMap = useMemo(() => {
    const sections: OverviewSection[] = [
      {
        key: "graded",
        label: "Graded Cards",
        show: filteredGradedLooseSingles.length > 0,
        render: (sectionControls) => (
          <CollectionCardsView
            items={filteredGradedLooseSingles}
            allowCollectionRemoval={!readOnly}
            showGradedSlabPreview
            emptyTitle={hasSearch ? "No matching graded cards" : "No graded cards yet"}
            emptyText={
              hasSearch
                ? "No graded cards match this search."
                : "Graded cards saved without a binder appear here."
            }
            sectionTitle="Graded Cards"
            sectionCount={filteredGradedLooseSingles.length}
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            sectionTrailing={sectionControls}
            readOnlyCollectionItems={readOnly}
          />
        ),
      },
      {
        key: "raw",
        label: "Loose Singles",
        show: showRawLooseSinglesSection && filteredRawLooseSingles.length > 0,
        render: (sectionControls) => (
          <CollectionCardsView
            items={filteredRawLooseSingles}
            allowCollectionRemoval={!readOnly}
            showGradedSlabPreview
            emptyTitle={hasSearch ? "No matching loose singles" : "No loose singles yet"}
            emptyText={
              hasSearch
                ? "No loose singles match this search."
                : "Cards saved without a binder appear here."
            }
            sectionTitle="Loose Singles"
            sectionCount={filteredRawLooseSingles.length}
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            sectionTrailing={sectionControls}
            readOnlyCollectionItems={readOnly}
          />
        ),
      },
      {
        key: "binderWatch",
        label: "Binder Watch",
        show: binders.length > 0 && filteredBinderCards.length > 0,
        render: (sectionControls) => (
          <BinderWatchSection
            items={filteredBinderCards}
            showGradedSlabPreview
            sectionTrailing={sectionControls}
            readOnlyCollectionItems={readOnly}
          />
        ),
      },
      {
        key: "sealed",
        label: "Sealed",
        show: !hasSearch || filteredSealed.length > 0,
        render: (sectionControls) => (
          <CollectionSealedView
            items={filteredSealed}
            emptyTitle={hasSearch ? "No matching sealed" : "No sealed saved yet"}
            emptyText={
              hasSearch
                ? "No sealed products match this search."
                : "Sealed products you add from search or expansion pages will appear here."
            }
            sectionTitle="Sealed"
            sectionCount={filteredSealed.length}
            sectionTrailing={sectionControls}
            readOnly={readOnly}
          />
        ),
      },
      {
        key: "binders",
        label: "Binders",
        show: !hasSearch || filteredBinders.length > 0,
        render: (sectionControls) => (
          <section>
            <SectionHeader
              label="Binders"
              count={filteredBinders.length}
              trailing={
                <div className="flex flex-wrap items-center gap-1.5">
                  {!readOnly ? <CreateBinderButton compact /> : null}
                  {sectionControls}
                </div>
              }
            />

            {filteredBinders.length === 0 ? (
              <div className="binder-panel rounded-2xl px-5 py-7 text-center sm:rounded-3xl sm:px-8 sm:py-9">
                <p className="mb-1 font-medium text-white/76">
                  {hasSearch ? "No matching binders" : "No binders yet"}
                </p>
                <p className="text-sm text-white/42">
                  {hasSearch
                    ? "No binders match this search."
                    : "Type a set name for an automatic set binder, or create a custom binder."}
                </p>
              </div>
            ) : (
              <BinderOverviewGrid binders={filteredBinders} readOnly={readOnly} />
            )}
          </section>
        ),
      },
    ];

    return new Map(sections.map((section) => [section.key, section] as const));
  }, [
    binders,
    filteredBinderCards,
    filteredBinders,
    filteredGradedLooseSingles,
    filteredRawLooseSingles,
    filteredSealed,
    hasSearch,
    readOnly,
    showRawLooseSinglesSection,
  ]);

  const orderedVisibleSections = useMemo(() => {
    const visibleSections = [...sectionMap.values()].filter((section) => section.show);
    const visibleSectionMap = new Map(visibleSections.map((section) => [section.key, section] as const));

    const ordered = sectionOrder
      .map((key) => visibleSectionMap.get(key))
      .filter((section): section is OverviewSection => Boolean(section));

    const missing = visibleSections.filter(
      (section) => !ordered.some((entry) => entry.key === section.key)
    );

    return [...ordered, ...missing];
  }, [sectionMap, sectionOrder]);

  function handleMoveSection(sectionKey: OverviewSectionKey, direction: -1 | 1) {
    const visibleOrder = orderedVisibleSections.map((section) => section.key);
    setSectionOrder((currentOrder) =>
      moveVisibleSection(currentOrder, visibleOrder, sectionKey, direction)
    );
  }

  return (
    <div className={hasResolvedSectionOrder ? "space-y-5 sm:space-y-6" : "invisible space-y-5 sm:space-y-6"}>
      <div className="binder-subpanel flex min-w-0 flex-col gap-2 rounded-[var(--ui-page-header-radius)] p-2.5 sm:flex-row sm:items-center sm:p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search complete collection..."
            className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.055] pl-10 pr-10 text-sm font-semibold text-white outline-none transition-colors placeholder:font-medium placeholder:text-white/30 focus:border-white/16"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white"
              aria-label="Clear complete collection search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
          <span className="hidden h-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] px-3 text-xs font-bold tabular-nums text-white/48 md:inline-flex">
            {hasSearch
              ? `${matchingSearchableItems.toLocaleString("en-US")} / ${totalSearchableItems.toLocaleString("en-US")}`
              : `${totalSearchableItems.toLocaleString("en-US")} items`}
          </span>
          <CardLayoutSizeControl dense />
        </div>
      </div>

      {orderedVisibleSections.length > 0 ? (
        orderedVisibleSections.map((section, index) => {
          const sectionControls = (
            <SectionReorderControls
              label={section.label}
              canMoveUp={index > 0}
              canMoveDown={index < orderedVisibleSections.length - 1}
              onMoveUp={() => handleMoveSection(section.key, -1)}
              onMoveDown={() => handleMoveSection(section.key, 1)}
            />
          );

          return <div key={section.key}>{section.render(sectionControls)}</div>;
        })
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/48 shadow-sm shadow-black/20">
          {hasSearch ? "No complete collection matches this search." : "No collection sections yet."}
        </section>
      )}
    </div>
  );
}
