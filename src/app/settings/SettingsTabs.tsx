"use client";

import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const ACTIVE_TAB_CLASS =
  "border border-violet-400/40 bg-violet-600 text-white";

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
  const searchParams = useSearchParams();
  const requestedKey = searchParams.get("section");
  const initialKey = useMemo(
    () =>
      tabs.find((tab) => tab.key === requestedKey)?.key ??
      tabs.find((tab) => tab.key === defaultKey)?.key ??
      tabs[0]?.key ??
      "",
    [defaultKey, requestedKey, tabs]
  );
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const selected = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0] ?? null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSelectedKey(initialKey);
      const activeButton = document.getElementById(
        `settings-tab-button-${initialKey}`
      );
      activeButton?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "center",
      });
      const targetId = window.location.hash.slice(1);
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialKey]);

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex == null) return;

    event.preventDefault();
    const next = tabs[nextIndex];
    setSelectedKey(next.key);
    window.requestAnimationFrame(() => {
      document.getElementById(`settings-tab-button-${next.key}`)?.focus();
    });
  }

  if (!selected) return null;

  if (tabs.length <= 1) {
    return <div>{selected.content}</div>;
  }

  const denseTabs = tabs.length >= 5;

  return (
    <div className="space-y-4">
      <div
        className={`min-w-0 overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.035] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          denseTabs ? "p-0.5 sm:p-1" : "p-1"
        }`}
        role="tablist"
        aria-label="Settings sections"
      >
        <div
          className={`flex min-w-max ${denseTabs ? "gap-0.5 sm:gap-1" : "gap-1"} md:grid md:min-w-0`}
          style={{
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          }}
        >
          {tabs.map((tab) => {
            const active = tab.key === selected.key;

            return (
              <button
                key={tab.key}
                id={`settings-tab-button-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-tab-${tab.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelectedKey(tab.key)}
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

      <div
        id={`settings-tab-${selected.key}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-button-${selected.key}`}
      >
        {selected.content}
      </div>
    </div>
  );
}
