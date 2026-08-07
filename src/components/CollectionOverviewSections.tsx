"use client";

import dynamic from "next/dynamic";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Grid2X2,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import CardLayoutSizeControl from "@/components/CardLayoutSizeControl";
import DashboardCustomizerDialog from "@/components/DashboardCustomizerDialog";
import { SectionHeader as SharedSectionHeader } from "@/components/PageHeader";
import { useSettings, type CardView } from "@/components/SettingsProvider";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import {
  DEFAULT_OVERVIEW_SECTION_ORDER,
  normalizeOverviewSectionOrder,
  type OverviewSectionKey,
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
      version: item.version,
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
  const { displaySettings, settings, set, setDisplay } = useSettings();
  const activeCardView = displaySettings.defaultView === "table" ? "table" : "grid";
  const [search, setSearch] = useState("");
  const [showCustomizer, setShowCustomizer] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim();
  const hasSearch = normalizedSearch.length > 0;
  const sectionOrder = readOnly
    ? normalizeOverviewSectionOrder(initialSectionOrder ?? DEFAULT_OVERVIEW_SECTION_ORDER)
    : normalizeOverviewSectionOrder(settings.completeCollectionSectionOrder);
  const hiddenSectionKeys = useMemo(
    () =>
      new Set<OverviewSectionKey>(
        readOnly ? [] : settings.completeCollectionHiddenSections
      ),
    [readOnly, settings.completeCollectionHiddenSections]
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
            allowSaleListing={!readOnly}
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
            allowSaleListing={!readOnly}
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
    const visibleSections = [...sectionMap.values()].filter(
      (section) => section.show && !hiddenSectionKeys.has(section.key)
    );
    const visibleSectionMap = new Map(visibleSections.map((section) => [section.key, section] as const));

    const ordered = sectionOrder
      .map((key) => visibleSectionMap.get(key))
      .filter((section): section is OverviewSection => Boolean(section));

    const missing = visibleSections.filter(
      (section) => !ordered.some((entry) => entry.key === section.key)
    );

    return [...ordered, ...missing];
  }, [hiddenSectionKeys, sectionMap, sectionOrder]);

  const customizableSections = useMemo(
    () =>
      sectionOrder
        .map((key) => sectionMap.get(key))
        .filter((section): section is OverviewSection => Boolean(section)),
    [sectionMap, sectionOrder]
  );

  function handleMoveSection(sectionKey: OverviewSectionKey, direction: -1 | 1) {
    const visibleOrder = orderedVisibleSections.map((section) => section.key);
    set(
      "completeCollectionSectionOrder",
      moveVisibleSection(sectionOrder, visibleOrder, sectionKey, direction)
    );
  }

  function handleMoveConfiguredSection(sectionKey: OverviewSectionKey, direction: -1 | 1) {
    const fromIndex = sectionOrder.indexOf(sectionKey);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= sectionOrder.length) return;
    const next = [...sectionOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set("completeCollectionSectionOrder", next);
  }

  function toggleSection(sectionKey: OverviewSectionKey) {
    const hidden = settings.completeCollectionHiddenSections;
    set(
      "completeCollectionHiddenSections",
      hidden.includes(sectionKey)
        ? hidden.filter((key) => key !== sectionKey)
        : [...hidden, sectionKey]
    );
  }

  function resetSections() {
    set("completeCollectionSectionOrder", [...DEFAULT_OVERVIEW_SECTION_ORDER]);
    set("completeCollectionHiddenSections", []);
  }

  return (
    <div className="space-y-5 sm:space-y-6">
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
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setShowCustomizer((current) => !current)}
              aria-expanded={showCustomizer}
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition-colors ${
                showCustomizer
                  ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)]"
                  : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Customize</span>
            </button>
          ) : null}
          <div className="flex shrink-0 items-center gap-1" aria-label="Collection card view">
            {[
              { value: "table" as const, label: "List", Icon: List },
              { value: "grid" as const, label: "Grid", Icon: Grid2X2 },
            ].map(({ value, label, Icon }) => {
              const active = activeCardView === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDisplay("defaultView", value as CardView)}
                  aria-pressed={active}
                  title={`${label} view`}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition-colors ${
                    active
                      ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)]"
                      : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>
          <CardLayoutSizeControl dense />
        </div>
      </div>

      {showCustomizer && !readOnly ? (
        <DashboardCustomizerDialog
          title="Customize Complete Collection"
          description="Choose visible collection sections and arrange them in your preferred order. Card grids and tables stay full width for readability."
          onClose={() => setShowCustomizer(false)}
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetSections}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/9 px-3 text-[11px] font-bold text-white/58 transition-colors hover:border-white/16 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            {customizableSections.map((section, index) => {
              const hidden = hiddenSectionKeys.has(section.key);
              return (
                <div
                  key={section.key}
                  className={`flex min-w-0 items-center gap-2 rounded-2xl border p-3 transition-colors ${
                    hidden
                      ? "border-white/6 bg-black/10 text-white/38"
                      : "border-white/10 bg-white/[0.045] text-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/15"
                    aria-label={`${hidden ? "Show" : "Hide"} ${section.label}`}
                    aria-pressed={!hidden}
                  >
                    {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{section.label}</span>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => handleMoveConfiguredSection(section.key, -1)}
                      disabled={index === 0}
                      className="flex h-8 w-7 items-center justify-center rounded-lg text-white/48 hover:bg-white/7 hover:text-white disabled:opacity-20"
                      aria-label={`Move ${section.label} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveConfiguredSection(section.key, 1)}
                      disabled={index === customizableSections.length - 1}
                      className="flex h-8 w-7 items-center justify-center rounded-lg text-white/48 hover:bg-white/7 hover:text-white disabled:opacity-20"
                      aria-label={`Move ${section.label} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] font-semibold text-white/35">
            Changes are saved to your account automatically.
          </p>
        </DashboardCustomizerDialog>
      ) : null}

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
