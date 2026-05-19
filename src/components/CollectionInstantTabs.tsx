"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { emitCollectionUrlChange } from "@/components/useLiveCollectionTab";
import type { CollectionPageTab } from "@/lib/collection-data";

type InstantTabKey = Exclude<CollectionPageTab, "cards" | "overview">;

interface CollectionTabMeta {
  key: InstantTabKey;
  href: string;
  label: string;
  title: string;
  summary: string;
}

interface Props {
  initialTab: CollectionPageTab;
  tabs: CollectionTabMeta[];
  gameControls?: ReactNode;
  overviewSlot: ReactNode;
  completeSlot: ReactNode;
  singlesSlot: ReactNode;
  bindersSlot: ReactNode;
  sealedSlot: ReactNode;
  gradedSlot: ReactNode;
  emptySlot?: ReactNode;
}

function normalizeTab(value: string | null | undefined): CollectionPageTab {
  if (value === "cards") return "complete";
  if (
    value === "complete" ||
    value === "singles" ||
    value === "binders" ||
    value === "sealed" ||
    value === "graded"
  ) {
    return value;
  }

  return "overview";
}

function readTabFromLocation(): CollectionPageTab {
  if (typeof window === "undefined") return "overview";

  const params = new URLSearchParams(window.location.search);
  if (params.get("graded") === "1") return "graded";
  return normalizeTab(params.get("tab"));
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pushCollectionUrl(href: string) {
  window.history.pushState(null, "", href);
  emitCollectionUrlChange();
}

export default function CollectionInstantTabs({
  initialTab,
  tabs,
  gameControls = null,
  overviewSlot,
  completeSlot,
  singlesSlot,
  bindersSlot,
  sealedSlot,
  gradedSlot,
  emptySlot = null,
}: Props) {
  const [activeTab, setActiveTab] = useState<CollectionPageTab>(() => normalizeTab(initialTab));
  const activeMeta = useMemo(
    () => tabs.find((tab) => tab.key === activeTab) ?? tabs[0],
    [activeTab, tabs]
  );

  useEffect(() => {
    const onPopState = () => setActiveTab(readTabFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || url.pathname !== "/") return;

      const currentParams = new URLSearchParams(window.location.search);
      const currentGame = currentParams.get("game");
      const nextGame = url.searchParams.get("game");
      if (currentGame !== nextGame) return;

      const isCollectionTabLink =
        url.searchParams.has("tab") || url.searchParams.has("graded") || url.search === "";
      if (!isCollectionTabLink) return;

      const nextTab = url.searchParams.get("graded") === "1" ? "graded" : normalizeTab(url.searchParams.get("tab"));

      event.preventDefault();
      event.stopPropagation();
      setActiveTab(nextTab);
      pushCollectionUrl(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, []);

  function selectTab(tab: CollectionTabMeta) {
    if (activeTab === tab.key) return;

    setActiveTab(tab.key);
    pushCollectionUrl(tab.href);
  }

  function activeSlot() {
    if (activeTab === "complete" || activeTab === "cards") return completeSlot;
    if (activeTab === "singles") return singlesSlot;
    if (activeTab === "binders") return bindersSlot;
    if (activeTab === "sealed") return sealedSlot;
    if (activeTab === "graded") return gradedSlot;
    return null;
  }

  const isOverview = activeTab === "overview";

  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex w-full flex-col gap-3 sm:gap-5">
        {isOverview ? (
          overviewSlot
        ) : (
          <div className="space-y-2.5">
            <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 xl:!border-0 xl:!bg-transparent xl:!p-0 xl:!shadow-none xl:[backdrop-filter:none]">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/38">
                  Collection
                </p>
                <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {activeMeta?.title ?? "Collection"}
                </h1>
                <p className="mt-0.5 text-sm font-semibold text-white/48">
                  {activeMeta?.summary ?? ""}
                </p>
              </div>
            </section>

            <section className="binder-subpanel w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3">
              <div className="flex min-w-0 flex-col gap-2.5">
                {gameControls}
                <nav
                  aria-label="Collection sections"
                  className="relative min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20"
                >
                  <div
                    className="grid min-w-0 gap-1"
                    style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
                  >
                    {tabs.map((tab) => {
                      const active = activeTab === tab.key;

                      return (
                        <button
                          key={tab.key}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          onClick={() => selectTab(tab)}
                          className={cx(
                            "inline-flex h-8 min-w-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none transition-colors min-[390px]:px-1.5 min-[390px]:text-[11px] sm:h-9 sm:px-4 sm:text-[13px]",
                            active
                              ? "border border-white/70 bg-white text-gray-950 shadow-[0_10px_22px_rgba(255,255,255,0.07)]"
                              : "text-white/58 hover:bg-white/[0.07] hover:text-white"
                          )}
                        >
                          <span className="truncate">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </div>
            </section>
          </div>
        )}

        <div className="space-y-3">
          {isOverview ? emptySlot : null}
          {activeSlot()}
        </div>
      </div>
    </div>
  );
}
