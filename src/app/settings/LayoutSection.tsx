"use client";

import { useSettings } from "@/components/SettingsProvider";

export default function LayoutSection() {
  const { settings, set } = useSettings();

  return (
    <div className="glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Layout</h2>
        <p className="text-sm text-gray-400 mt-0.5">Control how the page uses screen space.</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Widescreen</p>
          <p className="text-xs text-gray-400 mt-0.5">Remove the max-width cap and use full horizontal space.</p>
        </div>
        <button
          onClick={() => set("widescreen", !settings.widescreen)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.widescreen ? "bg-gray-900 dark:bg-white" : "bg-black/10 dark:bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              settings.widescreen
                ? "translate-x-6 bg-white dark:bg-gray-900"
                : "translate-x-1 bg-white dark:bg-white/60"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
