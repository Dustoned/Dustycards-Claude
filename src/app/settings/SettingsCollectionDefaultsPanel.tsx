"use client";

import { CreditCard, Filter, GalleryHorizontalEnd, SlidersHorizontal } from "lucide-react";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  type Card3dSize,
  type CardSize,
  type CardView,
  type ModalSize,
  type PriceSource,
  useSettings,
} from "@/components/SettingsProvider";

type Option<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

const VIEW_OPTIONS: Option<CardView>[] = [
  { value: "table", label: "Table", description: "Dense rows" },
  { value: "grid", label: "Grid", description: "Visual cards" },
  { value: "binder", label: "Binder", description: "Binder layout" },
];

const CARD_SIZE_OPTIONS: Option<CardSize>[] = [
  { value: "small", label: "Small", description: "Compact" },
  { value: "medium", label: "Medium", description: "Balanced" },
  { value: "large", label: "Large", description: "Bigger preview" },
];

const DETAIL_SIZE_OPTIONS: Option<ModalSize>[] = [
  { value: "small", label: "Small", description: "Compact" },
  { value: "medium", label: "Medium", description: "Balanced" },
  { value: "large", label: "Large", description: "Bigger preview" },
];

const CARD_3D_SIZE_OPTIONS: Option<Card3dSize>[] = [
  { value: "small", label: "Small", description: "Compact" },
  { value: "medium", label: "Medium", description: "Balanced" },
  { value: "large", label: "Large", description: "Bigger preview" },
];

const PRICE_SOURCES: Option<PriceSource>[] = [
  { value: "cm_en", label: "CardMarket", description: "EUR main prices" },
  { value: "tcp", label: "TCGPlayer", description: "USD main prices" },
];

const RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Rare Holo",
  "Rare Ultra",
  "Rare Secret",
  "Amazing Rare",
];

const SUPERTYPES = ["Pokémon", "Trainer", "Energy"];

const ACTIVE_OPTION_CLASS =
  "border-violet-400/40 bg-violet-600 text-white";
const INACTIVE_OPTION_CLASS =
  "border-white/8 text-white/55 hover:border-white/18 hover:bg-white/[0.055] hover:text-white";

function SegmentGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = "grid-cols-3",
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <div className={`grid gap-2 ${columns}`}>
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-h-9 rounded-lg border px-2.5 text-sm font-semibold transition ${
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
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        aria-label={`${title}: ${checked ? "on" : "off"}`}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className="inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-xl transition hover:bg-black/[0.035] dark:hover:bg-white/[0.05]"
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

function ChipList({
  items,
  selectedItems,
  onToggle,
}: {
  items: string[];
  selectedItems: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = selectedItems.includes(item);

        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              active
                ? ACTIVE_OPTION_CLASS
                : INACTIVE_OPTION_CLASS
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsCollectionDefaultsPanel() {
  const { settings, set } = useSettings();
  const primaryPriceLabel =
    settings.primaryPriceSource === "tcp" ? "TCGPlayer" : "CardMarket";

  function toggleRarity(rarity: string) {
    const next = settings.defaultRarities.includes(rarity)
      ? settings.defaultRarities.filter((item) => item !== rarity)
      : [...settings.defaultRarities, rarity];
    set("defaultRarities", next);
  }

  function toggleSupertype(supertype: string) {
    const next = settings.defaultSupertypes.includes(supertype)
      ? settings.defaultSupertypes.filter((item) => item !== supertype)
      : [...settings.defaultSupertypes, supertype];
    set("defaultSupertypes", next);
  }

  return (
    <section className="settings-panel glass rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Collection Defaults
        </h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Browsing defaults, prices, filters, and Binder Watch.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <GalleryHorizontalEnd className="h-4 w-4 text-gray-400 dark:text-white/40" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">View</p>
          </div>
          <SegmentGroup<CardView>
            label="Default view"
            options={VIEW_OPTIONS}
            value={settings.defaultView}
            onChange={(value) => set("defaultView", value)}
          />

          <div className="grid gap-4">
            <SegmentGroup<CardSize>
              label="Cards"
              options={CARD_SIZE_OPTIONS}
              value={settings.cardSize}
              onChange={(value) => set("cardSize", value)}
            />
            <SegmentGroup<ModalSize>
              label="Details"
              options={DETAIL_SIZE_OPTIONS}
              value={settings.modalSize}
              onChange={(value) => set("modalSize", value)}
            />
            <SegmentGroup<Card3dSize>
              label="3D"
              options={CARD_3D_SIZE_OPTIONS}
              value={settings.card3dSize}
              onChange={(value) => set("card3dSize", value)}
            />
          </div>

          <div className="border-t border-black/6 pt-5 dark:border-white/6">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-400 dark:text-white/40" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Prices</p>
            </div>
            <SegmentGroup<PriceSource>
              label="Main price source"
              options={PRICE_SOURCES}
              value={settings.primaryPriceSource}
              onChange={(value) => set("primaryPriceSource", value)}
              columns="grid-cols-2"
            />
            <div className="mt-4">
              <ToggleRow
                title="Show only priced cards"
                description={`Hide cards without a ${primaryPriceLabel} price.`}
                checked={settings.showOnlyPriced}
                onChange={(value) => set("showOnlyPriced", value)}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-5 border-t border-black/6 pt-5 dark:border-white/6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400 dark:text-white/40" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Filters</p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Rarity
                </p>
                <ChipList
                  items={RARITIES}
                  selectedItems={settings.defaultRarities}
                  onToggle={toggleRarity}
                />
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Card type
                </p>
                <ChipList
                  items={SUPERTYPES}
                  selectedItems={settings.defaultSupertypes}
                  onToggle={toggleSupertype}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-black/6 pt-5 dark:border-white/6">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-gray-400 dark:text-white/40" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Binder Watch</p>
            </div>
            <label className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
              <span className="text-sm text-gray-500 dark:text-white/45">
                Minimum card value shown on Home
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={settings.binderWatchMinPrice}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  set("binderWatchMinPrice", next ? Math.max(0, Number(next) || 0) : 0);
                }}
                className="w-full rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/20 dark:border-white/10 dark:bg-white/8 dark:text-white dark:focus:border-white/18"
                placeholder="50.00"
              />
            </label>
            <p className="mt-2 text-xs text-gray-400">
              Current threshold:{" "}
              <span className="font-semibold text-gray-700 dark:text-white/70">
                {formatCollectionCurrency(settings.binderWatchMinPrice)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
