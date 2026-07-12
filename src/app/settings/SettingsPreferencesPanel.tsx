"use client";

import type { ReactNode } from "react";
import { Library, Mail, Maximize2, Moon, Smartphone } from "lucide-react";
import {
  type Card3dSize,
  type CardSize,
  type CardView,
  type ModalSize,
  type UiScale,
  useSettings,
} from "@/components/SettingsProvider";

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
          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Appearance
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/[0.12] text-violet-100">
                <Moon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Dark</p>
                <p className="mt-0.5 text-xs text-white/48">
                  DustyCards currently uses one fully supported collector theme.
                </p>
              </div>
            </div>
          </div>

          <SegmentedControl<UiScale>
            label="Desktop scale"
            options={SIZE_OPTIONS}
            value={settings.uiScale}
            onChange={(value) => set("uiScale", value)}
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
  );
}
