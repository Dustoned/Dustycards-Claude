"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

const ACTIVE_TAB_CLASS =
  "border border-violet-400/40 bg-violet-600 text-white";

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
  const [securityVisited, setSecurityVisited] = useState(initialKey === "security");
  const selected = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0] ?? null;

  function selectTab(key: string) {
    if (key === "security") setSecurityVisited(true);
    setSelectedKey(key);
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex == null) return;

    event.preventDefault();
    const next = tabs[nextIndex];
    selectTab(next.key);
    window.requestAnimationFrame(() => {
      document.getElementById(`account-tab-button-${next.key}`)?.focus();
    });
  }

  if (!selected) return null;

  return (
    <div className="space-y-4">
      <div
        className="min-w-0 overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.035] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Account sections"
      >
        <div
          className="flex min-w-max gap-1 md:grid md:min-w-0"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const active = selected.key === tab.key;

            return (
              <button
                key={tab.key}
                id={`account-tab-button-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`account-tab-${tab.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(tab.key)}
                onKeyDown={(event) => selectFromKeyboard(event, tabs.indexOf(tab))}
                className={`min-h-11 min-w-[7rem] rounded-xl px-3 text-xs font-semibold leading-none transition md:min-w-0 md:px-4 md:text-sm ${
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

      {tabs.filter((tab) => tab.key === selected.key || (tab.key === "security" && securityVisited)).map((tab) => (
        <div
          key={tab.key}
          id={`account-tab-${tab.key}`}
          role="tabpanel"
          aria-labelledby={`account-tab-button-${tab.key}`}
          hidden={tab.key !== selected.key}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
