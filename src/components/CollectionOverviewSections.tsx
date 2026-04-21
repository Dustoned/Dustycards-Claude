"use client";

import Link from "next/link";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import BinderWatchSection from "@/components/BinderWatchSection";
import CollectionCardsView, { type CollectionCardViewItem } from "@/components/CollectionCardsView";
import CollectionSealedView, { type CollectionSealedViewItem } from "@/components/CollectionSealedView";
import { formatCollectionCurrency } from "@/lib/collection";

type OverviewSectionKey = "graded" | "raw" | "binderWatch" | "sealed" | "binders";

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
}

interface OverviewSection {
  key: OverviewSectionKey;
  show: boolean;
  render: () => ReactNode;
}

const OVERVIEW_SECTION_ORDER_KEY = "dustycards-overview-section-order";
const DEFAULT_OVERVIEW_SECTION_ORDER: OverviewSectionKey[] = [
  "graded",
  "raw",
  "binderWatch",
  "sealed",
  "binders",
];

function normalizeOverviewSectionOrder(raw: unknown): OverviewSectionKey[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_OVERVIEW_SECTION_ORDER;
  }

  const next = raw.filter((value): value is OverviewSectionKey =>
    DEFAULT_OVERVIEW_SECTION_ORDER.includes(value as OverviewSectionKey)
  );

  const unique = [...new Set(next)];

  for (const key of DEFAULT_OVERVIEW_SECTION_ORDER) {
    if (!unique.includes(key)) {
      unique.push(key);
    }
  }

  return unique;
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
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
        {label}
      </h2>
      <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
        {count}
      </span>
      <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
      {trailing}
    </div>
  );
}

export function BinderOverviewTile({
  binder,
}: {
  binder: BinderOverviewItem;
}) {
  const accentColor = binder.accent_color;

  return (
    <Link
      href={`/binders/${binder.id}`}
      className="glass group relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl p-5 shadow-lg shadow-black/5 transition-transform hover:scale-[1.01] hover:bg-white/8 dark:hover:bg-white/6"
      style={
        binder.accent_color
          ? { boxShadow: `inset 0 0 0 1px ${binder.accent_color}2f` }
          : undefined
      }
    >
      {binder.accent_color && (
        <div
          className="absolute inset-x-5 top-0 h-1 rounded-b-full"
          style={{ backgroundColor: accentColor ?? undefined }}
        />
      )}

      <div
        className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]"
        style={
          binder.accent_color
            ? { boxShadow: `inset 0 0 0 1px ${binder.accent_color}24` }
            : undefined
        }
      >
        {binder.episode?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={binder.episode.logo_url}
            alt={binder.name}
            className="h-full w-full object-contain p-5 sm:p-6"
          />
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-3xl border border-black/8 bg-white/80 text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-white/70"
            style={accentColor ? { color: accentColor } : undefined}
          >
            <CollectionBinderIcon iconName={binder.icon_name} className="h-9 w-9" />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-xl font-bold text-gray-900 dark:text-white">{binder.name}</h3>
        <p className="mt-1 truncate text-sm text-gray-500 dark:text-white/50">{binder.subtitle}</p>
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
}: Props) {
  const [sectionOrder, setSectionOrder] = useState<OverviewSectionKey[]>(
    DEFAULT_OVERVIEW_SECTION_ORDER
  );
  const [hasLoadedSectionOrder, setHasLoadedSectionOrder] = useState(false);
  const [draggedSectionKey, setDraggedSectionKey] = useState<OverviewSectionKey | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<OverviewSectionKey | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(OVERVIEW_SECTION_ORDER_KEY);
        if (raw) {
          setSectionOrder(normalizeOverviewSectionOrder(JSON.parse(raw)));
        }
      } catch {
        setSectionOrder(DEFAULT_OVERVIEW_SECTION_ORDER);
      } finally {
        setHasLoadedSectionOrder(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoadedSectionOrder) {
      return;
    }

    localStorage.setItem(OVERVIEW_SECTION_ORDER_KEY, JSON.stringify(sectionOrder));
  }, [hasLoadedSectionOrder, sectionOrder]);

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
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 360px))" }}
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
  }, [binderCards, binders, gradedLooseSingles, rawLooseSingles, sealed, showRawLooseSinglesSection]);

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
    <div className="space-y-8">
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
