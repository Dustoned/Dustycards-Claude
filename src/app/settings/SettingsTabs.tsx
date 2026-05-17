"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface SettingsTabItem {
  key: string;
  label: string;
  description?: string;
  content: ReactNode;
}

export default function SettingsTabs({
  tabs,
  defaultKey = "preferences",
}: {
  tabs: SettingsTabItem[];
  defaultKey?: string;
}) {
  const initialKey = useMemo(
    () => tabs.find((tab) => tab.key === defaultKey)?.key ?? tabs[0]?.key ?? "",
    [defaultKey, tabs]
  );
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const selected = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0] ?? null;

  if (!selected) return null;

  if (tabs.length <= 1) {
    return <div>{selected.content}</div>;
  }

  return (
    <div className="space-y-4">
      <div
        className="overflow-x-auto rounded-2xl border border-black/6 bg-black/[0.025] p-1 dark:border-white/8 dark:bg-white/[0.035]"
        role="tablist"
        aria-label="Settings sections"
      >
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            minWidth: `${Math.max(tabs.length * 5.5, 22)}rem`,
          }}
        >
          {tabs.map((tab) => {
            const active = tab.key === selected.key;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-tab-${tab.key}`}
                onClick={() => setSelectedKey(tab.key)}
                className={`min-h-10 rounded-xl px-2 text-sm font-semibold transition sm:px-4 ${
                  active
                    ? "bg-white text-gray-950 shadow-sm dark:bg-white/12 dark:text-white"
                    : "text-gray-500 hover:bg-white/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {selected.description ? (
        <p className="text-sm text-gray-500 dark:text-white/45">{selected.description}</p>
      ) : null}

      <div id={`settings-tab-${selected.key}`} role="tabpanel">
        {selected.content}
      </div>
    </div>
  );
}
