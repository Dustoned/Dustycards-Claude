"use client";

import { useSettings } from "@/components/SettingsProvider";
import SyncButton from "../expansions/SyncButton";

const TIERS = [
  {
    label: "Low",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    description: "Common, Uncommon and Rare",
    cadence: "Every 24 hours",
  },
  {
    label: "Medium",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    description: "Rare Holo and holo variants",
    cadence: "Every 12 hours",
  },
  {
    label: "High",
    badge: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
    description: "Everything above that tier",
    cadence: "Every 6 hours",
  },
];

export default function AutomationSection() {
  const { settings, set } = useSettings();

  return (
    <div className="glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Automation</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Keep prices fresh in the background while DustyCards is open.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Background price refresh</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Checks roughly every minute without blocking the first page load.
          </p>
        </div>
        <button
          onClick={() => set("autoPriceRefresh", !settings.autoPriceRefresh)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.autoPriceRefresh ? "bg-gray-900 dark:bg-white" : "bg-black/10 dark:bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              settings.autoPriceRefresh
                ? "translate-x-6 bg-white dark:bg-gray-900"
                : "translate-x-1 bg-white dark:bg-white/60"
            }`}
          />
        </button>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Refresh tools</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Check for new sets, new cards, and missing first prices.
            </p>
          </div>
          <SyncButton />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Refresh Tiers
        </p>
        <div className="space-y-2.5">
          {TIERS.map((tier) => (
            <div
              key={tier.label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/6 bg-black/[0.02] px-4 py-3 dark:border-white/8 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tier.badge}`}>
                  {tier.label}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{tier.description}</span>
              </div>
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {tier.cadence}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
