"use client";

import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SectionHeader as SharedSectionHeader } from "@/components/PageHeader";
import { useSettings, type CardSize } from "@/components/SettingsProvider";
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
}

interface OverviewSection {
  key: OverviewSectionKey;
  show: boolean;
  label: string;
  render: (sectionControls: ReactNode) => ReactNode;
}

const MOBILE_CARD_LAYOUT_OPTIONS: Array<{
  value: CardSize;
  label: string;
  title: string;
}> = [
  { value: "large", label: "L", title: "Largest phone card tiles" },
  { value: "medium", label: "M", title: "Medium phone card tiles" },
  { value: "small", label: "S", title: "Small phone card tiles" },
  { value: "xsmall", label: "XS", title: "Compact phone card tiles" },
];

const DESKTOP_CARD_LAYOUT_OPTIONS: Array<{
  value: CardSize;
  label: string;
  title: string;
}> = [
  { value: "large", label: "L", title: "Largest card tiles" },
  { value: "medium", label: "M", title: "Medium card tiles" },
  { value: "small", label: "S", title: "Small card tiles" },
  { value: "xsmall", label: "XS", title: "Densest card tiles" },
];

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
}: Props) {
  const { displaySettings, isMobileViewport, setDisplay } = useSettings();
  const layoutOptions = isMobileViewport ? MOBILE_CARD_LAYOUT_OPTIONS : DESKTOP_CARD_LAYOUT_OPTIONS;
  const [sectionOrder, setSectionOrder] = useState<OverviewSectionKey[]>(
    initialSectionOrder ?? DEFAULT_OVERVIEW_SECTION_ORDER
  );
  const [hasResolvedSectionOrder, setHasResolvedSectionOrder] = useState(
    Boolean(initialSectionOrder)
  );

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
        show: gradedLooseSingles.length > 0,
        render: (sectionControls) => (
          <CollectionCardsView
            items={gradedLooseSingles}
            allowCollectionRemoval
            showGradedSlabPreview
            emptyTitle="No graded cards yet"
            emptyText="Graded cards saved without a binder appear here."
            sectionTitle="Graded Cards"
            sectionCount={gradedLooseSingles.length}
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            sectionTrailing={sectionControls}
          />
        ),
      },
      {
        key: "raw",
        label: "Loose Singles",
        show: showRawLooseSinglesSection,
        render: (sectionControls) => (
          <CollectionCardsView
            items={rawLooseSingles}
            allowCollectionRemoval
            showGradedSlabPreview
            emptyTitle="No loose singles yet"
            emptyText="Cards saved without a binder appear here."
            sectionTitle="Loose Singles"
            sectionCount={rawLooseSingles.length}
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            sectionTrailing={sectionControls}
          />
        ),
      },
      {
        key: "binderWatch",
        label: "Binder Watch",
        show: binders.length > 0 && binderCards.length > 0,
        render: (sectionControls) => (
          <BinderWatchSection
            items={binderCards}
            showGradedSlabPreview
            sectionTrailing={sectionControls}
          />
        ),
      },
      {
        key: "sealed",
        label: "Sealed",
        show: true,
        render: (sectionControls) => (
          <CollectionSealedView
            items={sealed}
            emptyTitle="No sealed saved yet"
            emptyText="Sealed products you add from search or expansion pages will appear here."
            sectionTitle="Sealed"
            sectionCount={sealed.length}
            sectionTrailing={sectionControls}
          />
        ),
      },
      {
        key: "binders",
        label: "Binders",
        show: true,
        render: (sectionControls) => (
          <section>
            <SectionHeader
              label="Binders"
              count={binders.length}
              trailing={
                <div className="flex flex-wrap items-center gap-1.5">
                  <CreateBinderButton compact />
                  {sectionControls}
                </div>
              }
            />

            {binders.length === 0 ? (
              <div className="binder-panel rounded-2xl px-5 py-7 text-center sm:rounded-3xl sm:px-8 sm:py-9">
                <p className="mb-1 font-medium text-white/76">No binders yet</p>
                <p className="text-sm text-white/42">
                  Type a set name for an automatic set binder, or create a custom binder.
                </p>
              </div>
            ) : (
              <BinderOverviewGrid binders={binders} />
            )}
          </section>
        ),
      },
    ];

    return new Map(sections.map((section) => [section.key, section] as const));
  }, [
    binderCards,
    binders,
    gradedLooseSingles,
    rawLooseSingles,
    sealed,
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
      <div className="binder-subpanel flex min-w-0 items-center justify-between gap-3 rounded-[var(--ui-page-header-radius)] p-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
            Card layout
          </p>
          <p className="mt-0.5 hidden text-xs font-medium text-white/45 sm:block">
            Density for this categorized collection view.
          </p>
        </div>
        <div
          className="grid min-w-0 shrink-0 gap-1 rounded-[1.15rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20"
          style={{ gridTemplateColumns: `repeat(${layoutOptions.length}, minmax(0, 1fr))` }}
        >
          {layoutOptions.map((option) => {
            const active = displaySettings.cardSize === option.value;

            return (
              <button
                key={option.value}
                type="button"
                title={option.title}
                aria-pressed={active}
                onClick={() => setDisplay("cardSize", option.value)}
                className={`min-h-8 min-w-[2.8rem] rounded-full px-2 text-[11px] font-black leading-none transition-colors sm:min-w-[4rem] sm:text-xs ${
                  active
                    ? "border border-violet-400/40 bg-violet-600 text-white"
                    : "text-white/56 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {orderedVisibleSections.map((section, index) => {
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
      })}
    </div>
  );
}
