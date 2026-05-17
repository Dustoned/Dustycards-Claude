"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface AccountTabItem {
  key: string;
  label: string;
  description?: string;
  content: ReactNode;
}

export default function AccountTabs({
  tabs,
  defaultKey = "overview",
}: {
  tabs: AccountTabItem[];
  defaultKey?: string;
}) {
  const initialKey = useMemo(
    () => tabs.find((tab) => tab.key === defaultKey)?.key ?? tabs[0]?.key ?? "",
    [defaultKey, tabs]
  );
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const selected = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0] ?? null;

  if (!selected) return null;

  return (
    <div className="space-y-4">
      <div
        className="overflow-x-auto rounded-2xl border border-black/6 bg-black/[0.025] p-1 dark:border-white/8 dark:bg-white/[0.035]"
        role="tablist"
        aria-label="Account sections"
      >
        <div
          className={`grid min-w-[18rem] gap-1 sm:min-w-0 ${
            tabs.length >= 3 ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {tabs.map((tab) => {
            const active = selected.key === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`account-tab-${tab.key}`}
                onClick={() => setSelectedKey(tab.key)}
                className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition sm:px-4 ${
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

      <div id={`account-tab-${selected.key}`} role="tabpanel">
        {selected.content}
      </div>
    </div>
  );
}
