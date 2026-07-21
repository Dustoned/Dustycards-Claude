"use client";

import type { ReactNode } from "react";
import { Check, Library, Mail, Maximize2, PanelLeft, PanelTop, Smartphone } from "lucide-react";
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

export default function SettingsPreferencesPanel() {
  const { settings, set } = useSettings();

  return (
    <div className="grid gap-4">
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
