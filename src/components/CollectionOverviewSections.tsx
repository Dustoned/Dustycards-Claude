"use client";

import dynamic from "next/dynamic";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SectionHeader as SharedSectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import { getFixedTrackGridTemplate, getSupportTileTrackWidth } from "@/lib/display-scale";
import {
  buildOverviewSectionOrderCookie,
  DEFAULT_OVERVIEW_SECTION_ORDER,
  normalizeOverviewSectionOrder,
  OVERVIEW_SECTION_ORDER_STORAGE_KEY,
  type OverviewSectionKey,
  parseStoredOverviewSectionOrder,
} from "@/lib/overview-section-order";
import type { CollectionCardViewItem, CollectionSealedViewItem } from "@/types/collection-view";

const BinderOverviewTile = dynamic(() => import("@/components/BinderOverviewTile"), {
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

interface BinderOverviewItem {
  id: string;
  name: string;
  subtitle: string;
  progressLabel: string;
  currentValue: number;
  pnl: number;
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
  render: () => ReactNode;
}

function moveSection(
  order: OverviewSectionKey[],
  draggedKey: OverviewSectionKey,
  targetKey: OverviewSectionKey
): OverviewSectionKey[] {
  if (draggedKey === targetKey) return order;

  const next = [...order];
  const fromIndex = next.indexOf(draggedKey);
  const toIndex = next.indexOf(targetKey);

  if (fromIndex === -1 || toIndex === -1) {
    return order;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
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
    <SharedSectionHeader title={label} count={count} actions={trailing} compact className="mb-4" />
  );
}

function DragHandle({
  sectionKey,
  label,
  onDragStart,
  onDragEnd,
}: {
  sectionKey: OverviewSectionKey;
  label: string;
  onDragStart: (key: OverviewSectionKey) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", sectionKey);
        onDragStart(sectionKey);
      }}
      onDragEnd={onDragEnd}
      className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-black/14 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/45 dark:hover:border-white/16 dark:hover:text-white/78"
      aria-label={`Drag ${label}`}
      title="Drag to reorder"
    >
      <GripVertical className="h-3.5 w-3.5" />
      Move
    </button>
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
  const { settings } = useSettings();
  const binderTileTrackWidth = getSupportTileTrackWidth(settings.uiScale, settings.widescreen);
  const [sectionOrder, setSectionOrder] = useState<OverviewSectionKey[]>(
    initialSectionOrder ?? DEFAULT_OVERVIEW_SECTION_ORDER
  );
  const [hasResolvedSectionOrder, setHasResolvedSectionOrder] = useState(
    Boolean(initialSectionOrder)
  );
  const [draggedSectionKey, setDraggedSectionKey] = useState<OverviewSectionKey | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<OverviewSectionKey | null>(null);

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
        show: gradedLooseSingles.length > 0,
        render: () => (
          <CollectionCardsView
            items={gradedLooseSingles}
            allowCollectionRemoval
            emptyTitle="No graded cards yet"
            emptyText="Graded cards saved without a binder appear here."
            sectionTitle="Graded Cards"
            sectionCount={gradedLooseSingles.length}
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            sectionTrailing={
              <DragHandle
                sectionKey="graded"
                label="Graded Cards"
                onDragStart={setDraggedSectionKey}
                onDragEnd={() => {
                  setDraggedSectionKey(null);
                  setDropTargetKey(null);
                }}
              />
            }
          />
        ),
      },
      {
        key: "raw",
        show: showRawLooseSinglesSection,
        render: () => (
          <CollectionCardsView
            items={rawLooseSingles}
            allowCollectionRemoval
            emptyTitle="No loose singles yet"
            emptyText="Cards saved without a binder appear here."
            sectionTitle="Loose Singles"
            sectionCount={rawLooseSingles.length}
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            sectionTrailing={
              <DragHandle
                sectionKey="raw"
                label="Loose Singles"
                onDragStart={setDraggedSectionKey}
                onDragEnd={() => {
                  setDraggedSectionKey(null);
                  setDropTargetKey(null);
                }}
              />
            }
          />
        ),
      },
      {
        key: "binderWatch",
        show: binders.length > 0 && binderCards.length > 0,
        render: () => (
          <BinderWatchSection
            items={binderCards}
            sectionTrailing={
              <DragHandle
                sectionKey="binderWatch"
                label="Binder Watch"
                onDragStart={setDraggedSectionKey}
                onDragEnd={() => {
                  setDraggedSectionKey(null);
                  setDropTargetKey(null);
                }}
              />
            }
          />
        ),
      },
      {
        key: "sealed",
        show: true,
        render: () => (
          <CollectionSealedView
            items={sealed}
            emptyTitle="No sealed saved yet"
            emptyText="Sealed products you add from search or expansion pages will appear here."
            sectionTitle="Sealed"
            sectionCount={sealed.length}
            sectionTrailing={
              <DragHandle
                sectionKey="sealed"
                label="Sealed"
                onDragStart={setDraggedSectionKey}
                onDragEnd={() => {
                  setDraggedSectionKey(null);
                  setDropTargetKey(null);
                }}
              />
            }
          />
        ),
      },
      {
        key: "binders",
        show: true,
        render: () => (
          <section>
            <SectionHeader
              label="Binders"
              count={binders.length}
              trailing={
                <DragHandle
                  sectionKey="binders"
                  label="Binders"
                  onDragStart={setDraggedSectionKey}
                  onDragEnd={() => {
                    setDraggedSectionKey(null);
                    setDropTargetKey(null);
                  }}
                />
              }
            />

            {binders.length === 0 ? (
              <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
                <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">No binders yet</p>
                <p className="text-sm text-gray-400">
                  Type a set name for an automatic set binder, or create a custom binder.
                </p>
              </div>
            ) : (
              <div
                className="grid justify-start gap-4"
                style={{
                  gridTemplateColumns: getFixedTrackGridTemplate(binderTileTrackWidth),
                }}
              >
                {binders.map((binder) => (
                  <BinderOverviewTile key={binder.id} binder={binder} />
                ))}
              </div>
            )}
          </section>
        ),
      },
    ];

    return new Map(sections.map((section) => [section.key, section] as const));
  }, [
    binderCards,
    binderTileTrackWidth,
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

  function handleDrop(targetKey: OverviewSectionKey) {
    if (!draggedSectionKey || draggedSectionKey === targetKey) {
      setDropTargetKey(null);
      return;
    }

    setSectionOrder((currentOrder) =>
      moveSection(normalizeOverviewSectionOrder(currentOrder), draggedSectionKey, targetKey)
    );
    setDraggedSectionKey(null);
    setDropTargetKey(null);
  }

  return (
    <div className={hasResolvedSectionOrder ? "space-y-8" : "invisible space-y-8"}>
      {orderedVisibleSections.map((section) => (
        <div
          key={section.key}
          onDragOver={(event) => {
            if (!draggedSectionKey || draggedSectionKey === section.key) return;
            event.preventDefault();
            if (dropTargetKey !== section.key) {
              setDropTargetKey(section.key);
            }
          }}
          onDragLeave={(event) => {
            const related = event.relatedTarget;
            if (
              related instanceof Node &&
              event.currentTarget.contains(related)
            ) {
              return;
            }
            if (dropTargetKey === section.key) {
              setDropTargetKey(null);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(section.key);
          }}
          className={`rounded-[30px] transition-all ${
            dropTargetKey === section.key
              ? "bg-blue-500/[0.07] ring-1 ring-blue-400/35"
              : ""
          }`}
        >
          {section.render()}
        </div>
      ))}
    </div>
  );
}
