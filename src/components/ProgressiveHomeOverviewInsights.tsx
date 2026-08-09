"use client";

import dynamic from "next/dynamic";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  Grid2X2,
  List,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import DashboardCustomizerDialog from "@/components/DashboardCustomizerDialog";
import {
  HomeForSaleWidget,
  HomeMarketMoversWidget,
  HomeSignalRadarWidget,
  HomeUpcomingWidget,
  HomeWantsWidget,
} from "@/components/HomePreviewWidgets";
import { useSettings } from "@/components/SettingsProvider";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  DEFAULT_HIDDEN_HOME_DASHBOARD_MODULES,
  DEFAULT_HOME_DASHBOARD_MODULE_ORDER,
  HOME_DASHBOARD_VIEW_MODULES,
  normalizeHomeDashboardModuleOrder,
  type HomeDashboardModuleKey,
  type HomeWidgetViewMode,
} from "@/lib/dashboard-module-preferences";
import type {
  HomeAllocationSegment,
  HomeAllocationTone,
  HomeOverviewInsightsPayload,
} from "@/lib/home-overview-insights";
import {
  readHomeClientCache,
  writeHomeClientCache,
} from "@/lib/home-client-cache";
import { COLLECTION_CARD_ADDED_EVENT } from "@/lib/collection-client-events";

const HomeValueDriversPanel = dynamic(() => import("@/components/HomeValueDriversPanel"), {
  ssr: false,
  loading: () => <InsightPanelSkeleton />,
});
const HomeSuddenDropsPanel = dynamic(() => import("@/components/HomeSuddenDropsPanel"), {
  ssr: false,
  loading: () => <InsightPanelSkeleton />,
});
const HomeFeaturedCardsPanel = dynamic(() => import("@/components/HomeFeaturedCardsPanel"), {
  ssr: false,
  loading: () => <FeaturedCardsSkeleton />,
});

const TONE_CLASSES: Record<
  HomeAllocationTone,
  { dot: string; bar: string; text: string }
> = {
  sky: { dot: "bg-sky-400", bar: "bg-sky-400", text: "text-sky-200" },
  emerald: { dot: "bg-emerald-400", bar: "bg-emerald-400", text: "text-emerald-200" },
  amber: { dot: "bg-amber-300", bar: "bg-amber-300", text: "text-amber-100" },
  rose: { dot: "bg-rose-400", bar: "bg-rose-400", text: "text-rose-200" },
};

const HOME_MODULE_LABELS: Record<
  HomeDashboardModuleKey,
  { label: string; description: string }
> = {
  overview: { label: "Portfolio overview", description: "Value chart and key totals" },
  "value-drivers": { label: "Value drivers", description: "What moved your collection value" },
  "sudden-drops": { label: "Sudden drops", description: "Verified fast price drops" },
  "market-movers": { label: "Market Movers", description: "Largest live market movements" },
  "signal-radar": { label: "Signal Radar", description: "Highest-scoring current opportunities" },
  featured: { label: "Featured cards", description: "Collection highlights" },
  allocation: { label: "Collection allocation", description: "Value by collection type" },
  "top-sets": { label: "Top sets", description: "Your strongest sets and binders" },
  wants: { label: "Wants", description: "Recently wanted cards and prices" },
  "for-sale": { label: "For Sale", description: "Highest-value cards currently listed" },
  upcoming: { label: "Upcoming", description: "Next confirmed sealed releases" },
  shortcuts: { label: "Collection shortcuts", description: "Quick links to each area" },
};

const COMPACTABLE_HOME_MODULES = new Set<HomeDashboardModuleKey>([
  "value-drivers",
  "sudden-drops",
  "market-movers",
  "signal-radar",
  "featured",
  "allocation",
  "top-sets",
  "wants",
  "for-sale",
  "upcoming",
]);

function InsightPanelSkeleton() {
  return (
    <section
      className="binder-panel h-40 rounded-[var(--ui-page-header-radius)] p-3 motion-safe:animate-pulse"
      aria-hidden="true"
    >
      <div className="h-3 w-24 rounded-full bg-white/8" />
      <div className="mt-3 h-6 w-40 rounded-lg bg-white/8" />
      <div className="mt-5 grid gap-2">
        <div className="h-8 rounded-xl bg-white/[0.045]" />
        <div className="h-8 rounded-xl bg-white/[0.045]" />
      </div>
    </section>
  );
}

function FeaturedCardsSkeleton() {
  return (
    <section
      className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 motion-safe:animate-pulse"
      aria-hidden="true"
    >
      <div className="h-5 w-32 rounded-lg bg-white/8" />
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="aspect-[63/88] rounded-xl bg-white/[0.045]" />
        ))}
      </div>
    </section>
  );
}

function AllocationSkeleton() {
  return (
    <section
      className="binder-panel h-40 rounded-[var(--ui-page-header-radius)] p-3 motion-safe:animate-pulse"
      aria-hidden="true"
    >
      <div className="h-5 w-44 rounded-lg bg-white/8" />
      <div className="mt-4 h-3 rounded-full bg-white/[0.055]" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-8 rounded-xl bg-white/[0.045]" />
        ))}
      </div>
    </section>
  );
}

function safeShare(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function CollectionAllocationPanel({ segments }: { segments: HomeAllocationSegment[] }) {
  const totalValue = segments.reduce((total, segment) => total + segment.value, 0);

  if (segments.length === 0) return null;

  return (
    <section data-collection-summary-financial className="binder-panel relative overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <h2 className="text-base font-black tracking-tight text-white">Collection Allocation</h2>

      <div className="mt-2.5 flex h-2.5 gap-1 overflow-visible">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${TONE_CLASSES[segment.tone].bar} h-full min-w-2 rounded-full shadow-[0_1px_5px_rgb(0_0_0/0.12)]`}
            style={{
              flexBasis: 0,
              flexGrow: totalValue > 0 ? Math.max(segment.value, totalValue * 0.012) : 1,
            }}
            title={`${segment.label}: ${safeShare(segment.value, totalValue).toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:gap-2">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.78)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.54),rgb(var(--dc-surface-primary-rgb)/0.68))] px-2.5 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.1)]"
          >
            <span className={`${TONE_CLASSES[segment.tone].dot} h-2 w-2 shrink-0 rounded-full`} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/52">
              {segment.label}
            </span>
            <span className={`shrink-0 text-[11px] font-black tabular-nums ${TONE_CLASSES[segment.tone].text}`}>
              {formatCollectionCurrency(segment.value)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CollapsibleHomeModule({
  children,
  collapsed,
  label,
  onToggle,
}: {
  children: ReactNode;
  collapsed: boolean;
  label: string;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="binder-panel flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--ui-page-header-radius)] border border-white/10 px-3 text-left text-white/72 transition-colors hover:border-white/16 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-primary)]"
      >
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.11em]">
          {label}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold">
          Expand
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
    );
  }

  return (
    <div className="home-dashboard-module relative [&>section>div:first-child]:pr-11">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={true}
        aria-label={`Collapse ${label}`}
        title={`Collapse ${label}`}
        className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/48 shadow-sm backdrop-blur-md transition-colors hover:border-white/18 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-primary)]"
      >
        <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}

export default function ProgressiveHomeOverviewInsights({
  endpoint,
  cacheScope,
  valueDriversHref,
  suddenDropsApiHref,
  suddenDropsHref,
  moversHref,
  signalRadarHref,
  wantsHref,
  forSaleHref,
  upcomingHref,
  collectionHref,
  portfolioSlot,
  topSetsSlot,
  shortcutsSlot,
  mobileToolbarLeading,
}: {
  endpoint: string;
  cacheScope: string;
  valueDriversHref: string;
  suddenDropsApiHref: string;
  suddenDropsHref: string;
  moversHref: string;
  signalRadarHref: string;
  wantsHref: string;
  forSaleHref: string;
  upcomingHref: string;
  collectionHref: string;
  portfolioSlot: ReactNode;
  topSetsSlot: ReactNode;
  shortcutsSlot: ReactNode;
  mobileToolbarLeading?: ReactNode;
}) {
  const { settings, set } = useSettings();
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [payloadState, setPayloadState] = useState<{
    endpoint: string;
    payload: HomeOverviewInsightsPayload | null;
  }>(() => ({
    endpoint,
    payload: readHomeClientCache<HomeOverviewInsightsPayload>(
      "collection-insights",
      cacheScope,
      endpoint
    ),
  }));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const payload =
    payloadState.endpoint === endpoint
      ? payloadState.payload
      : readHomeClientCache<HomeOverviewInsightsPayload>(
          "collection-insights",
          cacheScope,
          endpoint
        );

  const retry = useCallback(() => {
    setError(false);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cachedPayload = readHomeClientCache<HomeOverviewInsightsPayload>(
      "collection-insights",
      cacheScope,
      endpoint
    );

    void fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return (await response.json()) as HomeOverviewInsightsPayload;
      })
      .then((nextPayload) => {
        if (!controller.signal.aborted) {
          writeHomeClientCache("collection-insights", cacheScope, endpoint, nextPayload);
          setPayloadState({ endpoint, payload: nextPayload });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && !cachedPayload) setError(true);
      });

    return () => controller.abort();
  }, [attempt, cacheScope, endpoint]);

  useEffect(() => {
    const refreshAfterCollectionChange = () => {
      setAttempt((current) => current + 1);
    };
    window.addEventListener(COLLECTION_CARD_ADDED_EVENT, refreshAfterCollectionChange);
    return () => {
      window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, refreshAfterCollectionChange);
    };
  }, []);

  const moduleOrder = normalizeHomeDashboardModuleOrder(settings.homeDashboardModuleOrder);
  const hiddenModules = new Set(settings.homeDashboardHiddenModules);
  const compactModules = new Set(settings.homeDashboardCompactModules);
  const collapsedModules = new Set(settings.homeDashboardCollapsedModules);
  const listModules = new Set(settings.homeDashboardListModules);

  function viewModeFor(moduleKey: HomeDashboardModuleKey): HomeWidgetViewMode {
    return listModules.has(moduleKey) ? "list" : "grid";
  }

  function moveModule(moduleKey: HomeDashboardModuleKey, direction: -1 | 1) {
    const fromIndex = moduleOrder.indexOf(moduleKey);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= moduleOrder.length) return;
    const next = [...moduleOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set("homeDashboardModuleOrder", next);
  }

  function toggleModule(moduleKey: HomeDashboardModuleKey) {
    const hidden = settings.homeDashboardHiddenModules;
    set(
      "homeDashboardHiddenModules",
      hidden.includes(moduleKey)
        ? hidden.filter((key) => key !== moduleKey)
        : [...hidden, moduleKey]
    );
  }

  function resetModules() {
    set("homeDashboardModuleOrder", [...DEFAULT_HOME_DASHBOARD_MODULE_ORDER]);
    set("homeDashboardHiddenModules", [...DEFAULT_HIDDEN_HOME_DASHBOARD_MODULES]);
    set("homeDashboardCompactModules", []);
    set("homeDashboardCollapsedModules", []);
    set("homeDashboardListModules", []);
  }

  function toggleModuleCollapsed(moduleKey: HomeDashboardModuleKey) {
    const collapsed = settings.homeDashboardCollapsedModules;
    set(
      "homeDashboardCollapsedModules",
      collapsed.includes(moduleKey)
        ? collapsed.filter((key) => key !== moduleKey)
        : [...collapsed, moduleKey]
    );
  }

  function toggleModuleSize(moduleKey: HomeDashboardModuleKey) {
    if (!COMPACTABLE_HOME_MODULES.has(moduleKey)) return;
    const compact = settings.homeDashboardCompactModules;
    set(
      "homeDashboardCompactModules",
      compact.includes(moduleKey)
        ? compact.filter((key) => key !== moduleKey)
        : [...compact, moduleKey]
    );
  }

  function setModuleView(moduleKey: HomeDashboardModuleKey, viewMode: HomeWidgetViewMode) {
    if (!HOME_DASHBOARD_VIEW_MODULES.has(moduleKey)) return;
    const list = settings.homeDashboardListModules;
    set(
      "homeDashboardListModules",
      viewMode === "list"
        ? list.includes(moduleKey) ? list : [...list, moduleKey]
        : list.filter((key) => key !== moduleKey)
    );
  }

  const modules: Record<HomeDashboardModuleKey, ReactNode> = {
    overview: portfolioSlot,
    "value-drivers": payload ? (
      <HomeValueDriversPanel data={payload.valueDrivers} viewAllHref={valueDriversHref} viewMode={viewModeFor("value-drivers")} />
    ) : (
      <InsightPanelSkeleton />
    ),
    "sudden-drops": (
      <HomeSuddenDropsPanel
        apiHref={suddenDropsApiHref}
        cacheScope={cacheScope}
        viewAllHref={suddenDropsHref}
        viewMode={viewModeFor("sudden-drops")}
      />
    ),
    "market-movers": payload ? (
      <HomeMarketMoversWidget items={payload.marketMovers ?? []} viewAllHref={moversHref} viewMode={viewModeFor("market-movers")} />
    ) : (
      <InsightPanelSkeleton />
    ),
    "signal-radar": payload ? (
      <HomeSignalRadarWidget items={payload.radarSignals ?? []} viewAllHref={signalRadarHref} viewMode={viewModeFor("signal-radar")} />
    ) : (
      <InsightPanelSkeleton />
    ),
    featured: payload ? (
      payload.featuredCards.length > 0 ? (
        <HomeFeaturedCardsPanel cards={payload.featuredCards} viewAllHref={collectionHref} viewMode={viewModeFor("featured")} />
      ) : null
    ) : (
      <FeaturedCardsSkeleton />
    ),
    allocation: payload ? (
      <CollectionAllocationPanel segments={payload.allocation} />
    ) : (
      <AllocationSkeleton />
    ),
    "top-sets": topSetsSlot,
    wants: payload ? (
      <HomeWantsWidget
        data={payload.wants ?? { total: 0, totalValue: null, items: [] }}
        viewAllHref={wantsHref}
        viewMode={viewModeFor("wants")}
      />
    ) : (
      <InsightPanelSkeleton />
    ),
    "for-sale": payload ? (
      <HomeForSaleWidget
        data={payload.forSale ?? { total: 0, totalValue: null, items: [] }}
        viewAllHref={forSaleHref}
        viewMode={viewModeFor("for-sale")}
      />
    ) : (
      <InsightPanelSkeleton />
    ),
    upcoming: payload ? (
      <HomeUpcomingWidget items={payload.upcoming ?? []} viewAllHref={upcomingHref} viewMode={viewModeFor("upcoming")} />
    ) : (
      <InsightPanelSkeleton />
    ),
    shortcuts: shortcutsSlot,
  };

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <div className={`flex items-center gap-2 ${mobileToolbarLeading ? "justify-between" : "justify-end"}`}>
        {mobileToolbarLeading}
        <button
          type="button"
          onClick={() => setShowCustomizer((current) => !current)}
          aria-expanded={showCustomizer}
          className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-colors ${
            showCustomizer
              ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)]"
              : "border-white/9 bg-white/[0.035] text-white/55 hover:border-white/16 hover:text-white"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Customize page
        </button>
      </div>

      {showCustomizer ? (
        <DashboardCustomizerDialog
          title="Customize Home"
          description="Choose what appears, arrange the order, set each card widget to Grid or List, and resize modules. Changes save automatically to your account."
          onClose={() => setShowCustomizer(false)}
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetModules}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/9 px-3 text-[11px] font-bold text-white/58 transition-colors hover:border-white/16 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            {moduleOrder.map((moduleKey, index) => {
              const hidden = hiddenModules.has(moduleKey);
              const compact = compactModules.has(moduleKey);
              const compactable = COMPACTABLE_HOME_MODULES.has(moduleKey);
              const viewSelectable = HOME_DASHBOARD_VIEW_MODULES.has(moduleKey);
              const viewMode = viewModeFor(moduleKey);
              const meta = HOME_MODULE_LABELS[moduleKey];
              return (
                <div
                  key={moduleKey}
                  className={`flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border p-3 transition-colors ${
                    hidden
                      ? "border-white/6 bg-black/10 text-white/38"
                      : "border-white/10 bg-white/[0.045] text-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleModule(moduleKey)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/15"
                    aria-label={`${hidden ? "Show" : "Hide"} ${meta.label}`}
                    aria-pressed={!hidden}
                  >
                    {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{meta.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/34">
                      {meta.description}
                    </span>
                  </span>
                  <div className="flex basis-full items-center justify-end gap-1.5 pl-10 sm:basis-auto sm:pl-0">
                  {compactable ? (
                    <button
                      type="button"
                      onClick={() => toggleModuleSize(moduleKey)}
                      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold transition-colors ${
                        compact
                          ? "border-[rgb(var(--dc-primary-rgb)/0.32)] bg-[rgb(var(--dc-primary-rgb)/0.10)] text-[var(--dc-primary)]"
                          : "border-white/8 bg-black/12 text-white/45 hover:text-white"
                      }`}
                      aria-label={`Use ${compact ? "wide" : "compact"} size for ${meta.label}`}
                    >
                      {compact ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                      {compact ? "Compact" : "Wide"}
                    </button>
                  ) : (
                    <span className="hidden shrink-0 rounded-lg border border-white/6 px-2 py-1 text-[9px] font-bold text-white/28 sm:inline">
                      Wide
                    </span>
                  )}
                  {viewSelectable ? (
                    <span className="inline-flex h-8 shrink-0 items-center rounded-lg border border-white/8 bg-black/12 p-0.5" aria-label={`${meta.label} view`}>
                      <button
                        type="button"
                        onClick={() => setModuleView(moduleKey, "grid")}
                        aria-pressed={viewMode === "grid"}
                        className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] font-bold transition-colors ${viewMode === "grid" ? "bg-[rgb(var(--dc-primary-rgb)/0.18)] text-[var(--dc-primary)]" : "text-white/38 hover:text-white"}`}
                      >
                        <Grid2X2 className="h-3 w-3" /> Grid
                      </button>
                      <button
                        type="button"
                        onClick={() => setModuleView(moduleKey, "list")}
                        aria-pressed={viewMode === "list"}
                        className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] font-bold transition-colors ${viewMode === "list" ? "bg-[rgb(var(--dc-primary-rgb)/0.18)] text-[var(--dc-primary)]" : "text-white/38 hover:text-white"}`}
                      >
                        <List className="h-3 w-3" /> List
                      </button>
                    </span>
                  ) : null}
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => moveModule(moduleKey, -1)}
                      disabled={index === 0}
                      className="flex h-8 w-7 items-center justify-center rounded-lg text-white/48 hover:bg-white/7 hover:text-white disabled:opacity-20"
                      aria-label={`Move ${meta.label} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveModule(moduleKey, 1)}
                      disabled={index === moduleOrder.length - 1}
                      className="flex h-8 w-7 items-center justify-center rounded-lg text-white/48 hover:bg-white/7 hover:text-white disabled:opacity-20"
                      aria-label={`Move ${meta.label} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] font-semibold leading-5 text-white/35">
            Compact modules pair automatically on desktop. Grid/List is saved per widget. Mobile always keeps one readable module per row.
          </p>
        </DashboardCustomizerDialog>
      ) : null}

      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2">
        {moduleOrder
          .filter((moduleKey) => !hiddenModules.has(moduleKey) && modules[moduleKey] != null)
          .map((moduleKey) => {
            const compact =
              COMPACTABLE_HOME_MODULES.has(moduleKey) && compactModules.has(moduleKey);
            return (
              <div key={moduleKey} className={compact ? "lg:col-span-1" : "lg:col-span-2"}>
                <CollapsibleHomeModule
                  collapsed={collapsedModules.has(moduleKey)}
                  label={HOME_MODULE_LABELS[moduleKey].label}
                  onToggle={() => toggleModuleCollapsed(moduleKey)}
                >
                  {modules[moduleKey]}
                </CollapsibleHomeModule>
              </div>
            );
          })}
      </div>

      {error && !payload ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.045] px-3 py-2 text-xs text-white/48">
          <span>Extra collection insights could not be loaded.</span>
          <button
            type="button"
            onClick={retry}
            className="min-h-9 shrink-0 rounded-lg border border-white/10 px-3 font-bold text-white/72"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
