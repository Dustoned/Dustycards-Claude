"use client";

import {
  type Card3dSize,
  type CardSize,
  type CardView,
  type ModalSize,
  type UiScale,
  useSettings,
} from "@/components/SettingsProvider";

const SIZE_OPTIONS: Array<{
  value: UiScale;
  label: string;
  desc: string;
}> = [
  { value: "small", label: "Small", desc: "Most compact" },
  { value: "medium", label: "Medium", desc: "Balanced" },
  { value: "large", label: "Large", desc: "Big preview" },
];

const CARD_SIZE_OPTIONS: Array<{
  value: CardSize;
  label: string;
  desc: string;
}> = [
  { value: "large", label: "1", desc: "1 card" },
  { value: "medium", label: "2", desc: "2 cards" },
  { value: "small", label: "3", desc: "3 cards" },
  { value: "xsmall", label: "4", desc: "4 cards" },
];

const VIEW_OPTIONS: Array<{ value: CardView; label: string; desc: string }> = [
  { value: "grid", label: "Grid", desc: "2 cards" },
  { value: "table", label: "List", desc: "Thin rows" },
  { value: "binder", label: "Binder", desc: "Grid fallback" },
];

const ACTIVE_OPTION_CLASS =
  "border-white/70 bg-white text-gray-950 shadow-[0_10px_22px_rgba(255,255,255,0.07)]";
const INACTIVE_OPTION_CLASS =
  "border-white/8 text-white/55 hover:border-white/18 hover:bg-white/[0.055] hover:text-white";

function optionClass(active: boolean) {
  return `flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2.5 py-3 text-center transition-all ${
    active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
  }`;
}

function OptionGrid<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string; desc?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={optionClass(value === option.value)}
          >
            <span className="text-sm font-semibold">{option.label}</span>
            {option.desc && <span className="text-[11px] opacity-60">{option.desc}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MobileDisplaySection() {
  const { settings, set } = useSettings();

  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mobile Display</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          These settings apply on phone screens up to 640px wide.
        </p>
      </div>

      <div className="grid gap-5">
        <OptionGrid<UiScale>
          label="Phone UI"
          options={SIZE_OPTIONS}
          value={settings.mobileUiScale}
          onChange={(value) => set("mobileUiScale", value)}
        />

        <OptionGrid<CardSize>
          label="Phone Cards"
          options={CARD_SIZE_OPTIONS}
          value={settings.mobileCardSize}
          onChange={(value) => set("mobileCardSize", value)}
        />

        <OptionGrid<ModalSize>
          label="Phone Details"
          options={SIZE_OPTIONS}
          value={settings.mobileModalSize}
          onChange={(value) => set("mobileModalSize", value)}
        />

        <OptionGrid<Card3dSize>
          label="Phone 3D"
          options={SIZE_OPTIONS}
          value={settings.mobileCard3dSize}
          onChange={(value) => set("mobileCard3dSize", value)}
        />

        <OptionGrid<CardView>
          label="Phone Default View"
          options={VIEW_OPTIONS}
          value={settings.mobileDefaultView}
          onChange={(value) => set("mobileDefaultView", value)}
        />
      </div>
    </div>
  );
}
