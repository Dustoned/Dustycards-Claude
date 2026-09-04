"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CollectionPricePrivacyProvider } from "@/components/CollectionPricePrivacy";
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
  instantTabs?: CollectionPageTab[];
  gameControls?: ReactNode;
  overviewSlot: ReactNode;
  completeSlot: ReactNode;
  singlesSlot: ReactNode;
  bindersSlot: ReactNode;
  sealedSlot: ReactNode;
  gradedSlot: ReactNode;
  sellingSlot: ReactNode;
  emptySlot?: ReactNode;
}

function normalizeTab(value: string | null | undefined): CollectionPageTab {
  if (value === "cards") return "complete";
  if (
    value === "complete" ||
    value === "singles" ||
    value === "binders" ||
    value === "sealed" ||
    value === "graded" ||
    value === "selling"
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
  instantTabs,
  gameControls = null,
  overviewSlot,
  completeSlot,
  singlesSlot,
  bindersSlot,
  sealedSlot,
  gradedSlot,
  sellingSlot,
  emptySlot = null,
}: Props) {
  const [activeTab, setActiveTab] = useState<CollectionPageTab>(() => normalizeTab(initialTab));
  const sectionNavRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = sectionNavRef.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !selected) return;
    const parent = strip.getBoundingClientRect();
    const child = selected.getBoundingClientRect();
    if (child.left < parent.left) strip.scrollLeft -= parent.left - child.left;
    if (child.right > parent.right) strip.scrollLeft += child.right - parent.right;
  }, [activeTab]);
  const activeMeta = useMemo(
    () => tabs.find((tab) => tab.key === activeTab) ?? tabs[0],
    [activeTab, tabs]
  );
  const instantTabSet = useMemo(
    () => new Set((instantTabs ?? ["overview", "complete", "singles", "binders", "sealed", "graded", "selling"]).map(normalizeTab)),
    [instantTabs]
  );

  const canSelectInstant = useCallback((tab: CollectionPageTab) => {
    return instantTabSet.has(normalizeTab(tab));
  }, [instantTabSet]);

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
      if (!canSelectInstant(nextTab)) return;

      event.preventDefault();
      event.stopPropagation();
      setActiveTab(nextTab);
      pushCollectionUrl(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [canSelectInstant]);

  function selectTab(tab: CollectionTabMeta) {
    if (activeTab === tab.key) return;
    if (!canSelectInstant(tab.key)) {
      return;
    }

    setActiveTab(tab.key);
    pushCollectionUrl(tab.href);
  }

  function activeSlot() {
    if (activeTab === "complete" || activeTab === "cards") return completeSlot;
    if (activeTab === "singles") return singlesSlot;
    if (activeTab === "binders") return bindersSlot;
    if (activeTab === "sealed") return sealedSlot;
    if (activeTab === "graded") return gradedSlot;
    if (activeTab === "selling") return sellingSlot;
    return null;
  }

  const isOverview = activeTab === "overview";
  const showCollectionSectionNav = activeTab !== "complete" && activeTab !== "selling";
  const showControlStrip = Boolean(gameControls) || showCollectionSectionNav;
  const contentSlot = isOverview ? emptySlot : activeSlot();

  return (
    <CollectionPricePrivacyProvider>
      <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex w-full flex-col gap-3 sm:gap-5">
        {isOverview ? (
          overviewSlot
        ) : (
          <div className="space-y-2.5">
            <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3 xl:!border-0 xl:!bg-transparent xl:!p-0 xl:!shadow-none xl:[backdrop-filter:none]">
              <div className="min-w-0">
                <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-bold uppercase tracking-[0.14em] text-white/38">
                  Collection
                </p>
                <h1 className="mt-1 truncate text-[1.35rem] font-bold leading-tight tracking-tight text-white sm:text-[1.65rem]">
                  {activeMeta?.title ?? "Collection"}
                </h1>
                <p className="mt-0.5 text-[length:var(--ui-page-header-description-size)] font-semibold leading-[var(--ui-page-header-description-leading)] text-white/48">
                  {activeMeta?.summary ?? ""}
                </p>
              </div>
            </section>

            {showControlStrip ? (
              <section className="binder-subpanel w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
                <div className="flex min-w-0 flex-col gap-2.5">
                  {gameControls}
                  {showCollectionSectionNav ? (
                    <nav
                      aria-label="Collection sections"
                      className="relative min-w-0 max-w-full overflow-hidden rounded-[1.15rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20 sm:rounded-[1.35rem]"
                    >
                      <div
                        ref={sectionNavRef}
                        className="flex min-w-0 gap-1 overflow-x-auto py-0.5 [scrollbar-width:thin] sm:grid"
                        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
                      >
                        {tabs.map((tab) => {
                          const active = activeTab === tab.key;
                          const instant = canSelectInstant(tab.key);
                          const tabClassName = cx(
                            "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-semibold leading-none transition-colors sm:min-w-0 sm:px-4",
                            active
                              ? "border border-violet-400/40 bg-violet-600 text-white"
                              : "text-white/58 hover:bg-white/[0.07] hover:text-white"
                          );

                          if (!instant && !active) {
                            return (
                              <Link
                                key={tab.key}
                                href={tab.href}
                                prefetch={false}
                                scroll={false}
                                className={tabClassName}
                              >
                                <span>{tab.label}</span>
                              </Link>
                            );
                          }

                          return (
                            <button
                              key={tab.key}
                              type="button"
                              aria-current={active ? "page" : undefined}
                              onClick={() => selectTab(tab)}
                              className={tabClassName}
                            >
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </nav>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        )}

        {contentSlot ? <div className="space-y-3">{contentSlot}</div> : null}
      </div>
      </div>
    </CollectionPricePrivacyProvider>
  );
}
