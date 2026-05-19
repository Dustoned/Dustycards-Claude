"use client";

import { useMemo, useState, type ReactNode } from "react";

const ACTIVE_TAB_CLASS =
  "border border-white/70 bg-white text-gray-950 shadow-[0_10px_22px_rgba(255,255,255,0.07)]";

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

  const denseTabs = tabs.length >= 5;

  return (
    <div className="space-y-4">
      <div
        className={`min-w-0 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] ${
          denseTabs ? "p-0.5 sm:p-1" : "p-1"
        }`}
        role="tablist"
        aria-label="Settings sections"
      >
        <div
          className={`grid min-w-0 ${denseTabs ? "gap-0.5 sm:gap-1" : "gap-1"}`}
          style={{
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
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
                className={`min-h-9 min-w-0 rounded-xl font-semibold leading-none transition sm:min-h-10 sm:px-4 sm:text-sm ${
                  denseTabs
                    ? "px-0.5 text-[8px] min-[390px]:px-1 min-[390px]:text-[9px]"
                    : "px-1 text-[10px] min-[390px]:px-1.5 min-[390px]:text-[11px]"
                } ${
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

      <div id={`settings-tab-${selected.key}`} role="tabpanel">
        {selected.content}
      </div>
    </div>
  );
}
