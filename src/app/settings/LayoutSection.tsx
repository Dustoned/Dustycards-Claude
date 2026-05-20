"use client";

import { type UiScale, useSettings } from "@/components/SettingsProvider";

const UI_SCALE_OPTIONS: { value: UiScale; label: string; desc: string }[] = [
  { value: "small", label: "Small", desc: "Compact chrome" },
  { value: "medium", label: "Medium", desc: "Balanced UI" },
  { value: "large", label: "Large", desc: "Bigger bars & panels" },
];

const ACTIVE_OPTION_CLASS =
  "border-violet-400/40 bg-violet-600 text-white";
const INACTIVE_OPTION_CLASS =
  "border-white/8 text-white/55 hover:border-white/18 hover:bg-white/[0.055] hover:text-white";

export default function LayoutSection() {
  const { settings, set } = useSettings();

  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Layout</h2>
        <p className="text-sm text-gray-400 mt-0.5">Control how the page uses screen space.</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Widescreen</p>
          <p className="text-xs text-gray-400 mt-0.5">Remove the max-width cap and use full horizontal space.</p>
        </div>
        <button
          onClick={() => set("widescreen", !settings.widescreen)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full transition-colors ${
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

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          UI Scale
        </p>
        <div className="grid grid-cols-3 gap-3">
          {UI_SCALE_OPTIONS.map((option) => {
            const active = settings.uiScale === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => set("uiScale", option.value)}
                className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all ${
                  active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
                }`}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs opacity-60">{option.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
