"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  Layers3,
  Radar,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MOBILE_CARD_DETAIL_MAX_WIDTH = 767;
const MOBILE_ACTION_PORTAL_MAX_WIDTH = 640;

interface PendingTabScrollAnchor {
  scrollElement: HTMLElement;
  scrollTop: number;
}

function getVerticalScrollElement(element: HTMLElement): HTMLElement {
  let candidate = element.parentElement;

  while (candidate && candidate !== document.body) {
    const overflowY = window.getComputedStyle(candidate).overflowY;
    if (
      /^(auto|scroll|overlay)$/.test(overflowY) &&
      candidate.scrollHeight > candidate.clientHeight + 1
    ) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }

  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function centerTabInRail(tabList: HTMLElement, tab: HTMLElement) {
  const listBounds = tabList.getBoundingClientRect();
  const tabBounds = tab.getBoundingClientRect();
  const targetLeft = Math.max(
    0,
    Math.min(
      tabList.scrollWidth - tabList.clientWidth,
      tabList.scrollLeft +
        tabBounds.left +
        tabBounds.width / 2 -
        (listBounds.left + listBounds.width / 2)
    )
  );

  tabList.scrollTo({ left: targetLeft, top: tabList.scrollTop, behavior: "auto" });
}

export type CardDetailMode = "standard" | "radar";
export type CardDetailSize = "small" | "medium" | "large";
export type CardDetailTabId =
  | "overview"
  | "market"
  | "collection"
  | "forecast"
  | "analysis"
  | "evidence";

export interface CardDetailTab {
  id: CardDetailTabId;
  label: string;
  content: ReactNode;
  icon?: LucideIcon;
}

export interface CardDetailKpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "violet" | "cyan" | "positive" | "warning";
  // When set, the tile becomes a button that jumps to this detail tab.
  targetTab?: CardDetailTabId;
}

interface CardDetailShellProps {
  mode: CardDetailMode;
  detailSize?: CardDetailSize;
  navigation: { label: string; href: string } | { label: string; onBack: () => void };
  eyebrow: ReactNode;
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  status?: ReactNode;
  priceLabel: string;
  price: ReactNode;
  priceMeta?: ReactNode;
  marketControls?: ReactNode;
  kpis: CardDetailKpi[];
  media: ReactNode;
  mediaActions?: ReactNode;
  chart: ReactNode;
  actions?: ReactNode;
  tabs: CardDetailTab[];
  initialTab?: CardDetailTabId;
  mobileChartTabs?: CardDetailTabId[];
  mobileChartAlwaysVisible?: boolean;
  className?: string;
}

interface MobileActionPortalContextValue {
  enabled: boolean;
  target: HTMLDivElement | null;
}

const MobileActionPortalContext = createContext<MobileActionPortalContextValue>({
  enabled: false,
  target: null,
});

export function CardDetailMobileActionPortal({ children }: { children: ReactNode }) {
  const { enabled, target } = useContext(MobileActionPortalContext);
  return enabled && target ? createPortal(children, target) : children;
}

const DEFAULT_TAB_ICONS: Record<CardDetailTabId, LucideIcon> = {
  overview: Layers3,
  market: ChartNoAxesCombined,
  collection: Boxes,
  forecast: BarChart3,
  analysis: Radar,
  evidence: ClipboardList,
};

function BackControl({
  navigation,
}: {
  navigation: CardDetailShellProps["navigation"];
}) {
  const className =
    "card-detail-back group inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-2 pr-4 text-sm font-semibold text-white/66 transition hover:border-white/15 hover:bg-white/[0.065] hover:text-white";
  const content = (
    <>
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/72 transition group-hover:border-violet-300/24 group-hover:text-white">
        <ArrowLeft className="h-4 w-4" />
      </span>
      <span className="truncate">{navigation.label}</span>
    </>
  );

  if ("href" in navigation) {
    return (
      <Link href={navigation.href} className={className} data-card-detail-back>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={navigation.onBack} className={className} data-card-detail-back>
      {content}
    </button>
  );
}

function KpiCard({
  item,
  onNavigate,
}: {
  item: CardDetailKpi;
  onNavigate?: (tab: CardDetailTabId) => void;
}) {
  const body = (
    <>
      <p className="card-detail-kpi-label">{item.label}</p>
      <div className="card-detail-kpi-value">{item.value}</div>
      {item.hint ? <div className="card-detail-kpi-hint">{item.hint}</div> : null}
    </>
  );

  if (item.targetTab && onNavigate) {
    const targetTab = item.targetTab;
    return (
      <button
        type="button"
        onClick={() => onNavigate(targetTab)}
        className="card-detail-kpi card-detail-kpi--link"
        data-tone={item.tone ?? "neutral"}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="card-detail-kpi" data-tone={item.tone ?? "neutral"}>
      {body}
    </div>
  );
}

export default function CardDetailShell({
  mode,
  detailSize = "medium",
  navigation,
  eyebrow,
  title,
  subtitle,
  badges,
  status,
  priceLabel,
  price,
  priceMeta,
  marketControls,
  kpis,
  media,
  mediaActions,
  chart,
  actions,
  tabs,
  initialTab = "overview",
  mobileChartTabs = ["market", "forecast"],
  mobileChartAlwaysVisible = false,
  className = "",
}: CardDetailShellProps) {
  const fallbackTab = tabs[0]?.id ?? "overview";
  const [activeTab, setActiveTab] = useState<CardDetailTabId>(() =>
    tabs.some((tab) => tab.id === initialTab) ? initialTab : fallbackTab
  );
  const tabsShellRef = useRef<HTMLElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const pendingTabScrollAnchorRef = useRef<PendingTabScrollAnchor | null>(null);
  const [mobileActionHost, setMobileActionHost] = useState<HTMLDivElement | null>(null);
  const [useMobileActionPortal, setUseMobileActionPortal] = useState(false);
  const reactId = useId().replace(/:/g, "");
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const showMobileChart = mobileChartTabs.includes(active?.id ?? fallbackTab);
  const visibleKpis = kpis.slice(0, 6);

  function navigateToKpiTab(tab: CardDetailTabId) {
    if (!tabs.some((candidate) => candidate.id === tab)) return;
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      tabsShellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  const actionContent = actions ? (
    <div className="card-detail-actions" aria-label="Card actions" data-card-detail-actions>
      {actions}
    </div>
  ) : null;

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const updatePortalMode = () => {
      setUseMobileActionPortal(
        shell.getBoundingClientRect().width < MOBILE_ACTION_PORTAL_MAX_WIDTH
      );
    };

    updatePortalMode();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePortalMode, { passive: true });
      return () => window.removeEventListener("resize", updatePortalMode);
    }

    const observer = new ResizeObserver(updatePortalMode);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  function rememberMobileTabScrollAnchor(preserveExisting = false) {
    if (window.innerWidth > MOBILE_CARD_DETAIL_MAX_WIDTH) return;
    if (preserveExisting && pendingTabScrollAnchorRef.current) return;
    const tabsShell = tabsShellRef.current;
    if (!tabsShell) return;
    const scrollElement = getVerticalScrollElement(tabsShell);
    pendingTabScrollAnchorRef.current = {
      scrollElement,
      scrollTop: scrollElement.scrollTop,
    };
  }

  useLayoutEffect(() => {
    const pendingAnchor = pendingTabScrollAnchorRef.current;
    const tabsShell = tabsShellRef.current;
    pendingTabScrollAnchorRef.current = null;
    if (!pendingAnchor || !tabsShell) return;

    const { scrollElement } = pendingAnchor;
    let cancelled = false;
    let animationFrame = 0;
    let frameCount = 0;
    let resizeObserver: ResizeObserver | null = null;

    const restoreAnchor = () => {
      if (cancelled) return;
      scrollElement.scrollTop = pendingAnchor.scrollTop;
    };

    // Charts and tab panels can finish their layout over several frames. Keep
    // the explicit position authoritative during that short commit window;
    // otherwise Chromium can move a sticky rail long after React's first
    // layout effect has restored it.
    const restoreForCommitWindow = () => {
      restoreAnchor();
      frameCount += 1;
      if (!cancelled && frameCount < 8) {
        animationFrame = window.requestAnimationFrame(restoreForCommitWindow);
      }
    };

    const stopRestoring = () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };

    restoreForCommitWindow();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(restoreAnchor);
      const layout = tabsShell.closest<HTMLElement>("[data-card-detail-canvas]");
      if (layout) resizeObserver.observe(layout);
    }

    scrollElement.addEventListener("wheel", stopRestoring, { passive: true, once: true });
    scrollElement.addEventListener("touchstart", stopRestoring, { passive: true, once: true });
    scrollElement.addEventListener("pointerdown", stopRestoring, { passive: true, once: true });
    scrollElement.addEventListener("keydown", stopRestoring, { once: true });
    const releaseTimer = window.setTimeout(stopRestoring, 240);

    return () => {
      window.clearTimeout(releaseTimer);
      scrollElement.removeEventListener("wheel", stopRestoring);
      scrollElement.removeEventListener("touchstart", stopRestoring);
      scrollElement.removeEventListener("pointerdown", stopRestoring);
      scrollElement.removeEventListener("keydown", stopRestoring);
      stopRestoring();
    };
  }, [activeTab]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    rememberMobileTabScrollAnchor();
    setActiveTab(nextTab.id);
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    const nextButton = buttons?.[nextIndex];
    nextButton?.focus({ preventScroll: true });
    if (nextButton && tabListRef.current) {
      centerTabInRail(tabListRef.current, nextButton);
    }
  }

  return (
    <MobileActionPortalContext.Provider
      value={{ enabled: useMobileActionPortal, target: mobileActionHost }}
    >
      <article
        ref={shellRef}
        className={`card-detail-experience ${className}`}
        data-card-detail-shell
        data-card-detail-mode={mode}
        data-detail-size={detailSize}
        data-active-tab={active?.id}
        data-has-actions={actions ? "true" : "false"}
      >
        <div className="card-detail-ambient" aria-hidden="true" />
        <div className="card-detail-query-container">
          <div className="card-detail-scroll-viewport" data-card-detail-scroll-viewport>
            <div className="card-detail-layout" data-card-detail-canvas>
            <header className="card-detail-toolbar">
              <BackControl navigation={navigation} />
              <div className="card-detail-toolbar-status" role="status" aria-live="polite">{status}</div>
              {actionContent}
              <div className="card-detail-mobile-status" role="status" aria-live="polite">
                {status}
              </div>
            </header>

        <div className="card-detail-media" data-card-detail-region="media">
          <div className="card-detail-media-frame">{media}</div>
          {mediaActions ? <div className="card-detail-media-actions">{mediaActions}</div> : null}
        </div>

        <div className="card-detail-market-hero" data-card-detail-market-hero>
          <section className="card-detail-identity" data-card-detail-region="identity">
            <div className="card-detail-identity-topline">
              <div className="card-detail-eyebrow">{eyebrow}</div>
              {badges ? <div className="card-detail-badges">{badges}</div> : null}
            </div>
            <h1 className="card-detail-title">{title}</h1>
            {subtitle ? <div className="card-detail-subtitle">{subtitle}</div> : null}

            <div className="card-detail-price-block">
              <p className="card-detail-price-label">{priceLabel}</p>
              <div className="card-detail-price-copy">
                <div className="card-detail-price">{price}</div>
                {priceMeta ? <div className="card-detail-price-meta">{priceMeta}</div> : null}
              </div>
              {marketControls ? <div className="card-detail-market-controls">{marketControls}</div> : null}
            </div>

            <div
              className="card-detail-kpis card-detail-kpis--hero"
              data-card-detail-kpis="hero"
            >
              {visibleKpis.map((item, index) => (
                <KpiCard
                  key={`${item.label}-${index}`}
                  item={item}
                  onNavigate={navigateToKpiTab}
                />
              ))}
            </div>
          </section>

          <section
            className="card-detail-chart"
            data-card-detail-region="chart"
            data-mobile-visible={showMobileChart ? "true" : "false"}
            data-mobile-persistent={mobileChartAlwaysVisible ? "true" : "false"}
          >
            {chart}
          </section>
        </div>

        <nav
          ref={tabsShellRef}
          className="card-detail-tabs-shell"
          aria-label="Card detail sections"
        >
          <div ref={tabListRef} className="card-detail-tabs" role="tablist">
            {tabs.map((tab, index) => {
              const selected = tab.id === active?.id;
              const Icon = tab.icon ?? DEFAULT_TAB_ICONS[tab.id];
              return (
                <button
                  key={tab.id}
                  id={`${reactId}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${reactId}-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onPointerDown={(event) => {
                    if (event.isPrimary && event.button === 0) {
                      rememberMobileTabScrollAnchor();
                      if (window.innerWidth <= MOBILE_CARD_DETAIL_MAX_WIDTH) {
                        // Mobile browsers may scroll a sticky tab into view as
                        // part of their default pointer-focus handling. Focus it
                        // explicitly without movement before that default runs.
                        event.currentTarget.focus({ preventScroll: true });
                      }
                    }
                  }}
                  onClick={(event) => {
                    // Pointer focus can scroll a sticky tab rail before `click`
                    // fires. Keep the pre-focus anchor captured on pointer down;
                    // only measure here for keyboard/programmatic activation.
                    rememberMobileTabScrollAnchor(event.detail > 0);
                    setActiveTab(tab.id);
                    if (tabListRef.current) {
                      centerTabInRail(tabListRef.current, event.currentTarget);
                    }
                  }}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className="card-detail-tab"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

          <section
            id={`${reactId}-panel-${active?.id ?? fallbackTab}`}
            role="tabpanel"
            aria-labelledby={`${reactId}-tab-${active?.id ?? fallbackTab}`}
            className="card-detail-panel"
            data-card-detail-region="panel"
          >
            {active?.id === "market" && visibleKpis.length > 0 ? (
              <div
                className="card-detail-kpis card-detail-kpis--market"
                data-card-detail-kpis="market"
                aria-label="Market summary"
              >
                {visibleKpis.map((item, index) => (
                  <KpiCard key={`${item.label}-${index}`} item={item} />
                ))}
              </div>
            ) : null}
            {active?.content}
          </section>
            </div>
          </div>
        </div>
        <div
          ref={setMobileActionHost}
          className="card-detail-mobile-actions-host"
          data-card-detail-mobile-actions-host
          aria-hidden={!useMobileActionPortal || !actions ? "true" : undefined}
        />
      </article>
    </MobileActionPortalContext.Provider>
  );
}
