"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  MoreHorizontal,
  RotateCcw,
  Save,
  Smartphone,
  X,
} from "lucide-react";
import {
  getNavigationCustomizationOptions,
  resolveNavigationItems,
  type NavigationCustomizationOption,
} from "@/components/navigation-model";
import {
  DEFAULT_MOBILE_BOTTOM_NAV_KEYS,
  DEFAULT_MOBILE_MORE_PINNED_KEYS,
  MOBILE_BOTTOM_NAV_LIMIT,
  MOBILE_MORE_PIN_LIMIT,
  type NavigationShortcutKey,
} from "@/lib/navigation-preferences";

type EditorTab = "bottom" | "more";
type OptionGroup = "All" | NavigationCustomizationOption["group"];

function moveKey(
  keys: readonly NavigationShortcutKey[],
  index: number,
  direction: -1 | 1
): NavigationShortcutKey[] {
  const target = index + direction;
  if (target < 0 || target >= keys.length) return [...keys];

  const next = [...keys];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function getInitialBottomKeys(
  keys: readonly string[],
  onePieceEnabled: boolean
): NavigationShortcutKey[] {
  return resolveNavigationItems(keys, onePieceEnabled, {
    fallbackKeys: DEFAULT_MOBILE_BOTTOM_NAV_KEYS,
    fill: true,
    limit: MOBILE_BOTTOM_NAV_LIMIT,
  }).map((item) => item.key as NavigationShortcutKey);
}

function getInitialMoreKeys(
  keys: readonly string[],
  onePieceEnabled: boolean
): NavigationShortcutKey[] {
  const visible = new Set(
    getNavigationCustomizationOptions(onePieceEnabled).map((option) => option.key)
  );
  return keys
    .filter((key): key is NavigationShortcutKey => visible.has(key as NavigationShortcutKey))
    .slice(0, MOBILE_MORE_PIN_LIMIT);
}

function SelectedShortcutRow({
  option,
  index,
  total,
  onMove,
  onRemove,
}: {
  option: NavigationCustomizationOption;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const Icon = option.item.icon;

  return (
    <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.8)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.58)] p-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[rgb(var(--dc-primary-rgb)/0.13)] text-[var(--dc-primary-soft)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-black text-[var(--dc-text-primary)]">
          {option.label}
        </span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.09em] text-[var(--dc-text-muted)]">
          Position {index + 1}
        </span>
      </span>
      <span className="flex items-center">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="flex h-9 w-8 items-center justify-center rounded-xl text-[var(--dc-text-muted)] transition hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.75)] hover:text-[var(--dc-text-primary)] disabled:opacity-20"
          aria-label={`Move ${option.label} earlier`}
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          className="flex h-9 w-8 items-center justify-center rounded-xl text-[var(--dc-text-muted)] transition hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.75)] hover:text-[var(--dc-text-primary)] disabled:opacity-20"
          aria-label={`Move ${option.label} later`}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-9 w-8 items-center justify-center rounded-xl text-[var(--dc-text-muted)] transition hover:bg-rose-500/10 hover:text-rose-300"
          aria-label={`Remove ${option.label}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

export default function MobileNavigationEditor({
  initialBottomKeys,
  initialMoreKeys,
  onePieceEnabled,
  onBack,
  onDismiss,
  onSave,
}: {
  initialBottomKeys: readonly string[];
  initialMoreKeys: readonly string[];
  onePieceEnabled: boolean;
  onBack: () => void;
  onDismiss: () => void;
  onSave: (bottomKeys: NavigationShortcutKey[], moreKeys: NavigationShortcutKey[]) => void;
}) {
  const options = useMemo(
    () => getNavigationCustomizationOptions(onePieceEnabled),
    [onePieceEnabled]
  );
  const optionByKey = useMemo(
    () => new Map(options.map((option) => [option.key, option])),
    [options]
  );
  const [tab, setTab] = useState<EditorTab>("bottom");
  const [group, setGroup] = useState<OptionGroup>("All");
  const [bottomKeys, setBottomKeys] = useState<NavigationShortcutKey[]>(() =>
    getInitialBottomKeys(initialBottomKeys, onePieceEnabled)
  );
  const [moreKeys, setMoreKeys] = useState<NavigationShortcutKey[]>(() =>
    getInitialMoreKeys(initialMoreKeys, onePieceEnabled)
  );
  const [activeBottomSlot, setActiveBottomSlot] = useState(0);
  const groups = useMemo<OptionGroup[]>(
    () => ["All", ...Array.from(new Set(options.map((option) => option.group)))],
    [options]
  );
  const visibleOptions = group === "All"
    ? options
    : options.filter((option) => option.group === group);

  function chooseBottomKey(key: NavigationShortcutKey) {
    setBottomKeys((current) => {
      const existingIndex = current.indexOf(key);
      if (existingIndex === activeBottomSlot) return current;

      const next = [...current];
      if (existingIndex >= 0) {
        [next[activeBottomSlot], next[existingIndex]] = [
          next[existingIndex],
          next[activeBottomSlot],
        ];
      } else {
        next[activeBottomSlot] = key;
      }
      return next;
    });
    setActiveBottomSlot((current) => Math.min(MOBILE_BOTTOM_NAV_LIMIT - 1, current + 1));
  }

  function toggleMoreKey(key: NavigationShortcutKey) {
    setMoreKeys((current) => {
      if (current.includes(key)) return current.filter((candidate) => candidate !== key);
      if (current.length >= MOBILE_MORE_PIN_LIMIT) return current;
      return [...current, key];
    });
  }

  function resetCurrentTab() {
    if (tab === "bottom") {
      setBottomKeys(getInitialBottomKeys(DEFAULT_MOBILE_BOTTOM_NAV_KEYS, onePieceEnabled));
      setActiveBottomSlot(0);
      return;
    }
    setMoreKeys(getInitialMoreKeys(DEFAULT_MOBILE_MORE_PINNED_KEYS, onePieceEnabled));
  }

  return (
    <section
      data-mobile-navigation-editor
      aria-labelledby="mobile-navigation-editor-title"
      className="pointer-events-auto fixed inset-x-2 bottom-[calc(4.7rem+env(safe-area-inset-bottom))] top-[calc(0.6rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md flex-col overflow-hidden rounded-[28px] border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[linear-gradient(180deg,rgb(var(--dc-surface-primary-rgb)/0.99),rgb(var(--dc-bg-main-rgb)/0.99))] shadow-[0_28px_90px_rgb(var(--dc-primary-rgb)/0.2),0_28px_90px_rgba(0,0,0,0.7)] md:hidden"
    >
      <header className="flex min-h-[4.35rem] shrink-0 items-center gap-2 border-b border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-primary-rgb)/0.98)] px-3 py-2.5">
        <button
          type="button"
          autoFocus
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.76)] text-[var(--dc-text-secondary)]"
          aria-label="Back to More"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1">
          <span
            id="mobile-navigation-editor-title"
            className="block truncate text-[18px] font-black tracking-tight text-[var(--dc-text-primary)]"
          >
            Customize navigation
          </span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--dc-text-muted)]">
            Keep your favorites one tap away
          </span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.76)] text-[var(--dc-text-secondary)]"
          aria-label="Close navigation settings"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-[rgb(var(--dc-border-rgb)/0.65)] bg-[rgb(var(--dc-surface-primary-rgb)/0.72)] p-2.5">
        {([
          ["bottom", "Bottom bar", Smartphone],
          ["more", "More shortcuts", MoreHorizontal],
        ] as const).map(([key, label, Icon]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setGroup("All");
              }}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-[11px] font-black transition ${
                active
                  ? "border-[rgb(var(--dc-primary-soft-rgb)/0.34)] bg-[rgb(var(--dc-primary-rgb)/0.2)] text-[var(--dc-primary-soft)]"
                  : "border-transparent bg-[rgb(var(--dc-surface-elevated-rgb)/0.45)] text-[var(--dc-text-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-4 px-3 py-3">
          {tab === "bottom" ? (
            <section aria-labelledby="mobile-editor-bottom-title">
              <div className="flex items-end justify-between gap-3 px-1">
                <span>
                  <h2 id="mobile-editor-bottom-title" className="text-xs font-black text-[var(--dc-text-primary)]">
                    Choose four buttons
                  </h2>
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--dc-text-muted)]">
                    Tap a position, then choose its destination.
                  </p>
                </span>
                <span className="text-[10px] font-black text-[var(--dc-primary-soft)]">4 + More</span>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {bottomKeys.map((key, index) => {
                  const option = optionByKey.get(key);
                  if (!option) return null;
                  const Icon = option.item.icon;
                  const active = index === activeBottomSlot;
                  return (
                    <button
                      key={`${key}:${index}`}
                      type="button"
                      onClick={() => setActiveBottomSlot(index)}
                      aria-pressed={active}
                      className={`relative flex min-w-0 flex-col items-center rounded-[18px] border px-1 py-2.5 transition ${
                        active
                          ? "border-[rgb(var(--dc-primary-soft-rgb)/0.5)] bg-[rgb(var(--dc-primary-rgb)/0.18)] text-[var(--dc-primary-soft)] shadow-[0_0_24px_rgb(var(--dc-primary-rgb)/0.12)]"
                          : "border-[rgb(var(--dc-border-rgb)/0.76)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.52)] text-[var(--dc-text-muted)]"
                      }`}
                    >
                      <span className="absolute right-1.5 top-1.5 text-[8px] font-black opacity-70">{index + 1}</span>
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      <span className="mt-2 w-full truncate text-[9px] font-black">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section aria-labelledby="mobile-editor-more-title">
              <div className="flex items-end justify-between gap-3 px-1">
                <span>
                  <h2 id="mobile-editor-more-title" className="text-xs font-black text-[var(--dc-text-primary)]">
                    Pinned in More
                  </h2>
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--dc-text-muted)]">
                    Pick and order up to six shortcuts.
                  </p>
                </span>
                <span className="text-[10px] font-black text-[var(--dc-primary-soft)]">
                  {moreKeys.length}/{MOBILE_MORE_PIN_LIMIT}
                </span>
              </div>

              {moreKeys.length > 0 ? (
                <div className="mt-3 grid gap-1.5">
                  {moreKeys.map((key, index) => {
                    const option = optionByKey.get(key);
                    if (!option) return null;
                    return (
                      <SelectedShortcutRow
                        key={key}
                        option={option}
                        index={index}
                        total={moreKeys.length}
                        onMove={(direction) => setMoreKeys((current) => moveKey(current, index, direction))}
                        onRemove={() => setMoreKeys((current) => current.filter((candidate) => candidate !== key))}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.28)] px-4 py-5 text-center text-[11px] font-semibold text-[var(--dc-text-muted)]">
                  No shortcuts pinned yet.
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="mobile-editor-destinations-title">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 id="mobile-editor-destinations-title" className="text-xs font-black text-[var(--dc-text-primary)]">
                Destinations
              </h2>
              <button
                type="button"
                onClick={resetCurrentTab}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-[10px] font-black text-[var(--dc-text-muted)] transition hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.7)] hover:text-[var(--dc-text-primary)]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            </div>

            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setGroup(candidate)}
                  className={`min-h-9 shrink-0 rounded-xl border px-3 text-[10px] font-black transition ${
                    group === candidate
                      ? "border-[rgb(var(--dc-primary-soft-rgb)/0.35)] bg-[rgb(var(--dc-primary-rgb)/0.17)] text-[var(--dc-primary-soft)]"
                      : "border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.42)] text-[var(--dc-text-muted)]"
                  }`}
                >
                  {candidate}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {visibleOptions.map((option) => {
                const Icon = option.item.icon;
                const selectedIndex = (tab === "bottom" ? bottomKeys : moreKeys).indexOf(option.key);
                const selected = selectedIndex >= 0;
                const full = tab === "more" && moreKeys.length >= MOBILE_MORE_PIN_LIMIT;
                const disabled = full && !selected;

                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => tab === "bottom" ? chooseBottomKey(option.key) : toggleMoreKey(option.key)}
                    aria-pressed={selected}
                    className={`grid min-h-[4.2rem] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[18px] border p-2 text-left transition disabled:opacity-35 ${
                      selected
                        ? "border-[rgb(var(--dc-primary-soft-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.15)]"
                        : "border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.43)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.66)]"
                    }`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-[13px] ${selected ? "bg-[rgb(var(--dc-primary-rgb)/0.2)] text-[var(--dc-primary-soft)]" : "bg-[rgb(var(--dc-surface-hover-rgb)/0.62)] text-[var(--dc-text-muted)]"}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-black text-[var(--dc-text-primary)]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--dc-text-muted)]">
                        {option.group}
                      </span>
                    </span>
                    {selected ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--dc-primary)] px-1 text-[9px] font-black text-white">
                        {selectedIndex + 1}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <footer className="grid shrink-0 grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-primary-rgb)/0.98)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-xs font-black text-[var(--dc-text-secondary)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(bottomKeys, moreKeys)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.34)] bg-[var(--dc-primary)] text-xs font-black text-white shadow-[0_12px_30px_rgb(var(--dc-primary-rgb)/0.22)]"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save navigation
        </button>
      </footer>
    </section>
  );
}
