"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Library,
  Mail,
  Maximize2,
  Navigation,
  PanelLeft,
  PanelTop,
  Pencil,
  Plus,
  RotateCcw,
  Smartphone,
  X,
} from "lucide-react";
import {
  type Card3dSize,
  type CardSize,
  type CardView,
  type DesktopNavigation,
  type ModalSize,
  type UiScale,
  useSettings,
} from "@/components/SettingsProvider";
import ThemeSection from "./ThemeSection";
import {
  getNavigationCustomizationOptions,
  resolveNavigationItems,
} from "@/components/navigation-model";
import {
  DEFAULT_DESKTOP_PINNED_NAV_KEYS,
  DEFAULT_MOBILE_BOTTOM_NAV_KEYS,
  DEFAULT_MOBILE_MORE_PINNED_KEYS,
  DESKTOP_PIN_LIMIT,
  MOBILE_MORE_PIN_LIMIT,
  type NavigationShortcutKey,
} from "@/lib/navigation-preferences";

type Option<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
};

const SIZE_OPTIONS: Option<UiScale>[] = [
  { value: "small", label: "Small", description: "Compact" },
  { value: "medium", label: "Medium", description: "Balanced" },
  { value: "large", label: "Large", description: "Roomy" },
];

const PHONE_CARD_SIZE_OPTIONS: Option<CardSize>[] = [
  { value: "large", label: "Large", description: "One card per row" },
  { value: "medium", label: "Medium", description: "Two cards per row" },
  { value: "small", label: "Small", description: "Three cards per row" },
  { value: "xsmall", label: "Compact", description: "Three tighter cards per row" },
];

const PHONE_VIEW_OPTIONS: Option<CardView>[] = [
  { value: "grid", label: "Grid", description: "Two cards" },
  { value: "table", label: "List", description: "Thin rows" },
  { value: "binder", label: "Binder", description: "Grid fallback" },
];

const DESKTOP_NAVIGATION_OPTIONS: Option<DesktopNavigation>[] = [
  {
    value: "top",
    label: "Top navigation",
    description: "Use the full-width marketplace header and horizontal menus.",
    icon: <PanelTop className="h-5 w-5" aria-hidden="true" />,
  },
  {
    value: "sidebar",
    label: "Sidebar",
    description: "Keep the classic navigation fixed on the left.",
    icon: <PanelLeft className="h-5 w-5" aria-hidden="true" />,
  },
];

const ACTIVE_OPTION_CLASS =
  "border-violet-400/40 bg-violet-600 text-white";
const INACTIVE_OPTION_CLASS =
  "border-white/8 text-white/55 hover:border-white/18 hover:bg-white/[0.055] hover:text-white";

function optionButtonClass(active: boolean): string {
  return `flex min-w-0 items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-center text-sm font-semibold transition ${
    active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
  }`;
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={optionButtonClass(active)}
              title={option.description}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompactSelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
      <p className="text-xs font-semibold text-gray-500 dark:text-white/45">{label}</p>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-h-8 rounded-lg border px-2 text-xs font-semibold transition ${
                active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
              }`}
              title={option.description}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopNavigationControl({
  value,
  onChange,
}: {
  value: DesktopNavigation;
  onChange: (value: DesktopNavigation) => void;
}) {
  return (
    <fieldset className="min-w-0 border-t border-black/6 pt-4 dark:border-white/6">
      <legend className="sr-only">Desktop navigation</legend>
      <div className="mb-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          Desktop navigation
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Choose how the main navigation is arranged on larger screens.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {DESKTOP_NAVIGATION_OPTIONS.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`group relative grid min-h-[5.5rem] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border p-3 text-left transition ${
                active
                  ? "border-violet-400/45 bg-violet-600/[0.14] text-gray-950 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.08)] dark:text-white"
                  : "border-black/8 bg-black/[0.025] text-gray-700 hover:border-black/14 hover:bg-black/[0.045] dark:border-white/8 dark:bg-white/[0.025] dark:text-white/62 dark:hover:border-white/18 dark:hover:bg-white/[0.055] dark:hover:text-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? "bg-violet-600 text-white"
                    : "bg-black/[0.055] text-gray-500 group-hover:text-gray-800 dark:bg-white/[0.055] dark:text-white/45 dark:group-hover:text-white/75"
                }`}
              >
                {option.icon}
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold">{option.label}</span>
                  {option.value === "top" ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${
                        active
                          ? "bg-violet-600/15 text-violet-700 dark:bg-violet-300/12 dark:text-violet-200"
                          : "bg-black/[0.055] text-gray-400 dark:bg-white/[0.055] dark:text-white/35"
                      }`}
                    >
                      Default
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-gray-400">
                  {option.description}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border transition ${
                  active
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-black/10 text-transparent dark:border-white/12"
                }`}
              >
                <Check className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  icon,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-black/6 py-3 first:border-t-0 first:pt-0 last:pb-0 dark:border-white/6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-gray-400 dark:text-white/40">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        </div>
      </div>
      <button
        type="button"
        aria-label={`${title}: ${checked ? "on" : "off"}`}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className="inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-xl transition hover:bg-white/[0.05]"
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-6 w-11 items-center overflow-hidden rounded-full transition-colors ${
            checked ? "bg-gray-950 dark:bg-white" : "bg-black/10 dark:bg-white/12"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              checked
                ? "translate-x-6 bg-white dark:bg-gray-950"
                : "translate-x-1 bg-white dark:bg-white/65"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

type NavigationOption = ReturnType<typeof getNavigationCustomizationOptions>[number];

function replaceShortcut(
  keys: NavigationShortcutKey[],
  index: number,
  nextKey: NavigationShortcutKey
): NavigationShortcutKey[] {
  const next = [...keys];
  const duplicateIndex = next.indexOf(nextKey);
  if (duplicateIndex >= 0 && duplicateIndex !== index) {
    [next[index], next[duplicateIndex]] = [next[duplicateIndex], next[index]];
  } else {
    next[index] = nextKey;
  }
  return next;
}

function moveShortcut(
  keys: NavigationShortcutKey[],
  index: number,
  direction: -1 | 1
): NavigationShortcutKey[] {
  const target = index + direction;
  if (target < 0 || target >= keys.length) return keys;
  const next = [...keys];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function shortcutLabel(key: NavigationShortcutKey, options: NavigationOption[]): string {
  return options.find((option) => option.key === key)?.label ?? key;
}

function NavigationIconPicker({
  title,
  options,
  selectedKeys,
  activeKey,
  onSelect,
  onClose,
}: {
  title: string;
  options: NavigationOption[];
  selectedKeys: NavigationShortcutKey[];
  activeKey?: NavigationShortcutKey;
  onSelect: (key: NavigationShortcutKey) => void;
  onClose: () => void;
}) {
  const groups = ["Collection", "Browse", "Market"] as const;

  return (
    <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.035] p-3 shadow-[inset_0_1px_0_rgba(139,92,246,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">Tap a destination to use it.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shortcut picker"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/8 !bg-transparent !text-[var(--dc-text-muted)] transition hover:!bg-[rgb(var(--dc-surface-hover-rgb)/0.65)] hover:!text-[var(--dc-text-primary)] dark:border-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3">
        {groups.map((group) => {
          const groupOptions = options.filter((option) => option.group === group);
          if (groupOptions.length === 0) return null;

          return (
            <div key={group}>
              <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">
                {group}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {groupOptions.map((option) => {
                  const Icon = option.item.icon;
                  const active = option.key === activeKey;
                  const alreadyUsed = !active && selectedKeys.includes(option.key);

                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(option.key)}
                      className={`grid min-h-14 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-xl border p-2 text-left transition ${
                        active
                          ? "border-violet-400/45 !bg-violet-500/[0.16] !text-violet-700 dark:!text-violet-100"
                          : "border-black/7 !bg-[rgb(var(--dc-surface-primary-rgb)/0.7)] !text-[var(--dc-text-secondary)] hover:border-violet-400/25 hover:!bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] hover:!text-[var(--dc-text-primary)] dark:border-white/8"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          active
                            ? "bg-violet-500 text-white"
                            : "bg-black/[0.045] text-gray-400 dark:bg-white/[0.055] dark:text-white/45"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block line-clamp-2 text-[11px] font-semibold leading-tight">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[9px] font-medium text-gray-400">
                          {active ? "Selected" : alreadyUsed ? "Swap positions" : "Available"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShortcutPreview({
  keys,
  options,
  emptyLabel,
}: {
  keys: NavigationShortcutKey[];
  options: NavigationOption[];
  emptyLabel: string;
}) {
  if (keys.length === 0) {
    return <span className="text-[10px] font-semibold text-gray-400">{emptyLabel}</span>;
  }

  return (
    <span className="flex min-w-0 flex-wrap justify-end gap-1">
      {keys.slice(0, 4).map((key) => (
        <span
          key={key}
          className="max-w-28 truncate rounded-full border border-violet-400/15 bg-violet-500/[0.08] px-2 py-1 text-[9px] font-bold text-violet-700 dark:text-violet-200"
        >
          {shortcutLabel(key, options)}
        </span>
      ))}
      {keys.length > 4 ? (
        <span className="rounded-full bg-black/[0.045] px-2 py-1 text-[9px] font-bold text-gray-400 dark:bg-white/[0.05]">
          +{keys.length - 4}
        </span>
      ) : null}
    </span>
  );
}

function MobileBottomShortcutEditor({
  keys,
  options,
  onChange,
}: {
  keys: NavigationShortcutKey[];
  options: NavigationOption[];
  onChange: (keys: NavigationShortcutKey[]) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {keys.map((key, index) => {
          const option = options.find((candidate) => candidate.key === key);
          const Icon = option?.item.icon ?? Navigation;
          const active = editingIndex === index;
          return (
            <button
              key={`${index}:${key}`}
              type="button"
              aria-pressed={active}
              onClick={() => setEditingIndex((current) => (current === index ? null : index))}
              className={`relative min-h-[6.8rem] min-w-0 rounded-2xl border p-3 text-left transition ${
                active
                  ? "border-violet-400/45 !bg-violet-500/[0.13] shadow-[0_0_24px_rgba(139,92,246,0.1)]"
                  : "border-black/8 !bg-black/[0.02] hover:border-violet-400/20 hover:!bg-violet-500/[0.045] dark:border-white/8 dark:!bg-white/[0.02] dark:hover:!bg-violet-500/[0.06]"
              }`}
            >
              <span className="absolute right-2 top-2 text-[9px] font-bold text-gray-400">
                {index + 1}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/[0.11] text-violet-600 dark:text-violet-200">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="mt-2 block truncate text-xs font-semibold text-gray-900 dark:text-white">
                {option?.label ?? key}
              </span>
              <span className="mt-0.5 block text-[9px] font-medium text-gray-400">
                {active ? "Choosing…" : "Tap to change"}
              </span>
            </button>
          );
        })}
      </div>

      {editingIndex !== null ? (
        <NavigationIconPicker
          title={`Choose quick-bar button ${editingIndex + 1}`}
          options={options}
          selectedKeys={keys}
          activeKey={keys[editingIndex]}
          onSelect={(key) => {
            onChange(replaceShortcut(keys, editingIndex, key));
            setEditingIndex(null);
          }}
          onClose={() => setEditingIndex(null)}
        />
      ) : null}
    </div>
  );
}

function OrderedShortcutEditor({
  keys,
  options,
  max,
  onChange,
}: {
  keys: NavigationShortcutKey[];
  options: NavigationOption[];
  max: number;
  onChange: (keys: NavigationShortcutKey[]) => void;
}) {
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "replace"; index: number } | null>(
    null
  );
  const available = options.filter((option) => !keys.includes(option.key));

  return (
    <div className="grid gap-2">
      {keys.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/10 px-3 py-3 text-xs text-gray-400 dark:border-white/10">
          No shortcuts pinned. The full navigation remains available.
        </p>
      ) : null}
      {keys.map((key, index) => {
        const option = options.find((candidate) => candidate.key === key);
        const Icon = option?.item.icon ?? Navigation;
        return (
          <div
            key={key}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-black/8 bg-black/[0.025] p-2 dark:border-white/8 dark:bg-white/[0.025]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/[0.1] text-violet-600 dark:text-violet-200">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <button
              type="button"
              onClick={() => setPicker({ mode: "replace", index })}
              className="flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-lg !bg-transparent px-1.5 text-left !text-[var(--dc-text-primary)] transition hover:!bg-[rgb(var(--dc-surface-hover-rgb)/0.62)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">
                  {option?.label ?? key}
                </span>
                <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.08em] text-gray-400">
                  {option?.group ?? "Shortcut"}
                </span>
              </span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            </button>
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={`Move ${shortcutLabel(key, options)} up`}
                disabled={index === 0}
                onClick={() => onChange(moveShortcut(keys, index, -1))}
                className="flex h-9 w-8 items-center justify-center rounded-lg !bg-transparent !text-[var(--dc-text-muted)] transition hover:!bg-[rgb(var(--dc-surface-hover-rgb)/0.68)] hover:!text-[var(--dc-text-primary)] disabled:opacity-25"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Move ${shortcutLabel(key, options)} down`}
                disabled={index === keys.length - 1}
                onClick={() => onChange(moveShortcut(keys, index, 1))}
                className="flex h-9 w-8 items-center justify-center rounded-lg !bg-transparent !text-[var(--dc-text-muted)] transition hover:!bg-[rgb(var(--dc-surface-hover-rgb)/0.68)] hover:!text-[var(--dc-text-primary)] disabled:opacity-25"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${shortcutLabel(key, options)}`}
                onClick={() => {
                  setPicker(null);
                  onChange(keys.filter((_, candidateIndex) => candidateIndex !== index));
                }}
                className="flex h-9 w-8 items-center justify-center rounded-lg !bg-transparent !text-[var(--dc-text-muted)] transition hover:!bg-rose-500/[0.08] hover:!text-rose-400"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
        );
      })}

      {keys.length < max && available.length > 0 ? (
        <button
          type="button"
          onClick={() => setPicker((current) => (current?.mode === "add" ? null : { mode: "add" }))}
          aria-expanded={picker?.mode === "add"}
          className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-dashed border-violet-400/20 !bg-violet-500/[0.025] p-2 text-left !text-violet-700 transition hover:border-violet-400/35 hover:!bg-violet-500/[0.06] dark:!text-violet-200"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/[0.1]">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">Add shortcut</span>
            <span className="mt-0.5 block text-[9px] font-medium text-gray-400">
              {max - keys.length} {max - keys.length === 1 ? "place" : "places"} left
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 transition ${picker?.mode === "add" ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      ) : null}

      {picker ? (
        <NavigationIconPicker
          title={picker.mode === "add" ? "Add a shortcut" : "Replace shortcut"}
          options={picker.mode === "add" ? available : options}
          selectedKeys={keys}
          activeKey={picker.mode === "replace" ? keys[picker.index] : undefined}
          onSelect={(key) => {
            if (picker.mode === "add") {
              onChange([...keys, key]);
            } else {
              onChange(replaceShortcut(keys, picker.index, key));
            }
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

function NavigationPreferencesSection() {
  const { settings, set } = useSettings();
  const options = getNavigationCustomizationOptions(settings.onePieceLibraryEnabled);
  const desktopOptions = options.filter(
    (option) => option.key !== "home" && option.key !== "openings"
  );
  const mobileBottomKeys = resolveNavigationItems(
    settings.mobileBottomNavKeys,
    settings.onePieceLibraryEnabled,
    {
      fallbackKeys: DEFAULT_MOBILE_BOTTOM_NAV_KEYS,
      fill: true,
      limit: DEFAULT_MOBILE_BOTTOM_NAV_KEYS.length,
    }
  ).map((item) => item.key as NavigationShortcutKey);
  const mobileMorePinnedKeys = settings.mobileMorePinnedKeys.filter((key) =>
    options.some((option) => option.key === key)
  );
  const desktopPinnedNavKeys = settings.desktopPinnedNavKeys.filter((key) =>
    desktopOptions.some((option) => option.key === key)
  );

  const resetNavigation = () => {
    set("mobileBottomNavKeys", [...DEFAULT_MOBILE_BOTTOM_NAV_KEYS]);
    set("mobileMorePinnedKeys", [...DEFAULT_MOBILE_MORE_PINNED_KEYS]);
    set("desktopPinnedNavKeys", [...DEFAULT_DESKTOP_PINNED_NAV_KEYS]);
  };

  return (
    <section
      id="navigation"
      className="settings-panel glass scroll-mt-24 rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-violet-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Navigation
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Put the destinations you use most one tap away. Everything else stays visible in the full menus.
          </p>
        </div>
        <button
          type="button"
          onClick={resetNavigation}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-black/8 !bg-transparent px-3 text-xs font-semibold !text-[var(--dc-text-muted)] transition hover:!bg-[rgb(var(--dc-surface-hover-rgb)/0.62)] hover:!text-[var(--dc-text-primary)] dark:border-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        <details className="group rounded-2xl border border-black/8 bg-black/[0.018] open:bg-black/[0.028] dark:border-white/8 dark:bg-white/[0.018] dark:open:bg-white/[0.028]">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Phone quick bar</span>
              <span className="mt-0.5 block text-xs text-gray-400">Four buttons; More always stays fifth.</span>
            </span>
            <ShortcutPreview keys={mobileBottomKeys} options={options} emptyLabel="Default" />
          </summary>
          <div className="border-t border-black/6 p-3 dark:border-white/6">
            <MobileBottomShortcutEditor
              keys={mobileBottomKeys}
              options={options}
              onChange={(keys) => set("mobileBottomNavKeys", keys)}
            />
          </div>
        </details>

        <details className="group rounded-2xl border border-black/8 bg-black/[0.018] open:bg-black/[0.028] dark:border-white/8 dark:bg-white/[0.018] dark:open:bg-white/[0.028]">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Phone More shortcuts</span>
              <span className="mt-0.5 block text-xs text-gray-400">Choose and order up to six quick-access tiles.</span>
            </span>
            <ShortcutPreview keys={mobileMorePinnedKeys} options={options} emptyLabel="None pinned" />
          </summary>
          <div className="border-t border-black/6 p-3 dark:border-white/6">
            <OrderedShortcutEditor
              keys={mobileMorePinnedKeys}
              options={options}
              max={MOBILE_MORE_PIN_LIMIT}
              onChange={(keys) => set("mobileMorePinnedKeys", keys)}
            />
          </div>
        </details>

        <details className="group rounded-2xl border border-black/8 bg-black/[0.018] open:bg-black/[0.028] dark:border-white/8 dark:bg-white/[0.018] dark:open:bg-white/[0.028]">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Desktop favorites</span>
              <span className="mt-0.5 block text-xs text-gray-400">Pinned in both the top menu and sidebar.</span>
            </span>
            <ShortcutPreview keys={desktopPinnedNavKeys} options={desktopOptions} emptyLabel="None pinned" />
          </summary>
          <div className="border-t border-black/6 p-3 dark:border-white/6">
            <OrderedShortcutEditor
              keys={desktopPinnedNavKeys}
              options={desktopOptions}
              max={DESKTOP_PIN_LIMIT}
              onChange={(keys) => set("desktopPinnedNavKeys", keys)}
            />
          </div>
        </details>
      </div>
    </section>
  );
}

export default function SettingsPreferencesPanel() {
  const { settings, set } = useSettings();

  return (
    <div className="grid gap-4">
      <NavigationPreferencesSection />

      <ThemeSection />

      <section className="settings-panel glass rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Preferences
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Display, layout, phone overrides, and visible libraries.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <SegmentedControl<UiScale>
              label="Desktop scale"
              options={SIZE_OPTIONS}
              value={settings.uiScale}
              onChange={(value) => set("uiScale", value)}
            />

            <DesktopNavigationControl
              value={settings.desktopNavigation}
              onChange={(value) => set("desktopNavigation", value)}
            />

            <div className="border-t border-black/6 pt-3 dark:border-white/6">
              <ToggleRow
                title="Widescreen"
                description="Use an expanded desktop canvas with wider dashboards and denser grids."
                checked={settings.widescreen}
                onChange={(value) => set("widescreen", value)}
                icon={<Maximize2 className="h-4 w-4" />}
              />
              <ToggleRow
                title="One Piece library"
                description="Show One Piece in search, collection, wants, and movers."
                checked={settings.onePieceLibraryEnabled}
                onChange={(value) => set("onePieceLibraryEnabled", value)}
                icon={<Library className="h-4 w-4" />}
              />
              <ToggleRow
                title="High-potential email alerts"
                description="Email my verified account when Signal Radar finds a new strongly confirmed opportunity. Alerts are deduplicated and grouped."
                checked={settings.signalRadarEmailAlerts}
                onChange={(value) => set("signalRadarEmailAlerts", value)}
                icon={<Mail className="h-4 w-4" />}
              />
            </div>
          </div>

          <div className="min-w-0 border-t border-black/6 pt-5 dark:border-white/6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <div className="mb-4 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-gray-400 dark:text-white/40" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Phone overrides
              </p>
            </div>
            <div className="grid gap-3">
              <CompactSelectRow<UiScale>
                label="UI scale"
                options={SIZE_OPTIONS}
                value={settings.mobileUiScale}
                onChange={(value) => set("mobileUiScale", value)}
              />
              <CompactSelectRow<CardSize>
                label="Cards"
                options={PHONE_CARD_SIZE_OPTIONS}
                value={settings.mobileCardSize}
                onChange={(value) => set("mobileCardSize", value)}
              />
              <CompactSelectRow<ModalSize>
                label="Details"
                options={SIZE_OPTIONS}
                value={settings.mobileModalSize}
                onChange={(value) => set("mobileModalSize", value)}
              />
              <CompactSelectRow<Card3dSize>
                label="3D"
                options={SIZE_OPTIONS}
                value={settings.mobileCard3dSize}
                onChange={(value) => set("mobileCard3dSize", value)}
              />
              <CompactSelectRow<CardView>
                label="Default view"
                options={PHONE_VIEW_OPTIONS}
                value={settings.mobileDefaultView}
                onChange={(value) => set("mobileDefaultView", value)}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
