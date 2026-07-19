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
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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
  className?: string;
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

function KpiCard({ item }: { item: CardDetailKpi }) {
  return (
    <div className="card-detail-kpi" data-tone={item.tone ?? "neutral"}>
      <p className="card-detail-kpi-label">{item.label}</p>
      <div className="card-detail-kpi-value">{item.value}</div>
      {item.hint ? <div className="card-detail-kpi-hint">{item.hint}</div> : null}
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
  className = "",
}: CardDetailShellProps) {
  const fallbackTab = tabs[0]?.id ?? "overview";
  const [activeTab, setActiveTab] = useState<CardDetailTabId>(() =>
    tabs.some((tab) => tab.id === initialTab) ? initialTab : fallbackTab
  );
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId().replace(/:/g, "");
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const showMobileChart = mobileChartTabs.includes(active?.id ?? fallbackTab);

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
    setActiveTab(nextTab.id);
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    const nextButton = buttons?.[nextIndex];
    nextButton?.focus();
    nextButton?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }

  return (
    <article
      className={`card-detail-experience ${className}`}
      data-card-detail-shell
      data-card-detail-mode={mode}
      data-detail-size={detailSize}
      data-active-tab={active?.id}
    >
      <div className="card-detail-ambient" aria-hidden="true" />
      <div className="card-detail-layout" data-card-detail-canvas>
        <header className="card-detail-toolbar">
          <BackControl navigation={navigation} />
          <div className="card-detail-toolbar-status" role="status" aria-live="polite">{status}</div>
          {actions ? (
            <div className="card-detail-actions" aria-label="Card actions" data-card-detail-actions>
              {actions}
            </div>
          ) : null}
          <div className="card-detail-mobile-status" role="status" aria-live="polite">
            {status}
          </div>
        </header>

        <div className="card-detail-media" data-card-detail-region="media">
          <div className="card-detail-media-frame">{media}</div>
          {mediaActions ? <div className="card-detail-media-actions">{mediaActions}</div> : null}
        </div>

        <section className="card-detail-identity" data-card-detail-region="identity">
          <div className="card-detail-identity-topline">
            <div className="card-detail-eyebrow">{eyebrow}</div>
            {badges ? <div className="card-detail-badges">{badges}</div> : null}
          </div>
          <h1 className="card-detail-title">{title}</h1>
          {subtitle ? <div className="card-detail-subtitle">{subtitle}</div> : null}

          <div className="card-detail-price-block">
            <div className="min-w-0">
              <p className="card-detail-price-label">{priceLabel}</p>
              <div className="card-detail-price">{price}</div>
              {priceMeta ? <div className="card-detail-price-meta">{priceMeta}</div> : null}
            </div>
            {marketControls ? <div className="card-detail-market-controls">{marketControls}</div> : null}
          </div>

          <div className="card-detail-kpis">
            {kpis.slice(0, 4).map((item, index) => (
              <KpiCard key={`${item.label}-${index}`} item={item} />
            ))}
          </div>
        </section>

        <section
          className="card-detail-chart"
          data-card-detail-region="chart"
          data-mobile-visible={showMobileChart ? "true" : "false"}
        >
          {chart}
        </section>

        <nav className="card-detail-tabs-shell" aria-label="Card detail sections">
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
                  onClick={(event) => {
                    setActiveTab(tab.id);
                    event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "center" });
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
          {active?.content}
        </section>
      </div>
    </article>
  );
}
