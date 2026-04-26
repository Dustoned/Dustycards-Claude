"use client";

import { useSettings } from "@/components/SettingsProvider";

const RARITIES = [
  "Common", "Uncommon", "Rare", "Rare Holo", "Rare Ultra", "Rare Secret", "Amazing Rare",
];

const SUPERTYPES = ["Pokémon", "Trainer", "Energy"];

export default function FiltersSection() {
  const { settings, set } = useSettings();
  const primaryPriceLabel =
    settings.primaryPriceSource === "tcp" ? "TCGPlayer" : "CardMarket";

  function toggleRarity(r: string) {
    const next = settings.defaultRarities.includes(r)
      ? settings.defaultRarities.filter((x) => x !== r)
      : [...settings.defaultRarities, r];
    set("defaultRarities", next);
  }

  function toggleSupertype(s: string) {
    const next = settings.defaultSupertypes.includes(s)
      ? settings.defaultSupertypes.filter((x) => x !== s)
      : [...settings.defaultSupertypes, s];
    set("defaultSupertypes", next);
  }

  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Default Filters</h2>
        <p className="text-sm text-gray-400 mt-0.5">Pre-selected filters when opening any set. Empty = show all.</p>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Rarity</p>
        <div className="flex flex-wrap gap-2">
          {RARITIES.map((r) => {
            const active = settings.defaultRarities.includes(r);
            return (
              <button
                key={r}
                onClick={() => toggleRarity(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "border-black/8 dark:border-white/8 text-gray-500 dark:text-gray-400 hover:border-black/20 dark:hover:border-white/20"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Card Type</p>
        <div className="flex gap-2">
          {SUPERTYPES.map((s) => {
            const active = settings.defaultSupertypes.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSupertype(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "border-black/8 dark:border-white/8 text-gray-500 dark:text-gray-400 hover:border-black/20 dark:hover:border-white/20"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-black/6 dark:border-white/6">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Show only priced cards</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Hide cards without a {primaryPriceLabel} price.
          </p>
        </div>
        <button
          onClick={() => set("showOnlyPriced", !settings.showOnlyPriced)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.showOnlyPriced ? "bg-gray-900 dark:bg-white" : "bg-black/10 dark:bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              settings.showOnlyPriced
                ? "translate-x-6 bg-white dark:bg-gray-900"
                : "translate-x-1 bg-white dark:bg-white/60"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
