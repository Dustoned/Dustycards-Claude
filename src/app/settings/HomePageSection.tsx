"use client";

import { formatCollectionCurrency } from "@/lib/collection";
import { useSettings } from "@/components/SettingsProvider";

export default function HomePageSection() {
  const { settings, set } = useSettings();

  return (
    <div className="glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Home Page</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Choose when binder cards should show up in Binder Watch.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Binder Watch Minimum
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
          className="w-full rounded-2xl border border-black/8 bg-white/80 px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 dark:border-white/10 dark:bg-white/8 dark:text-white dark:focus:border-white/18"
          placeholder="50.00"
        />
      </label>

      <div className="mt-4 rounded-2xl border border-black/8 bg-black/[0.03] px-4 py-3 text-sm text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55">
        Cards from binders at or above{" "}
        <span className="font-semibold text-gray-900 dark:text-white">
          {formatCollectionCurrency(settings.binderWatchMinPrice)}
        </span>{" "}
        appear in Binder Watch on the home page.
      </div>
    </div>
  );
}
