"use client";

import { useMemo, useState, type ReactNode } from "react";

const ACTIVE_TAB_CLASS =
  "border border-white/70 bg-white text-gray-950 shadow-[0_10px_22px_rgba(255,255,255,0.07)]";

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
        className="min-w-0 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] p-1"
        role="tablist"
        aria-label="Account sections"
      >
        <div
          className="grid min-w-0 gap-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
                className={`min-h-9 min-w-0 rounded-xl px-1.5 text-[11px] font-semibold leading-none transition sm:min-h-10 sm:px-4 sm:text-sm ${
                  active
                    ? ACTIVE_TAB_CLASS
                    : "text-white/50 hover:bg-white/8 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {selected.description ? (
        <p className="text-sm text-white/45">{selected.description}</p>
      ) : null}

      <div id={`account-tab-${selected.key}`} role="tabpanel">
        {selected.content}
      </div>
    </div>
  );
}
