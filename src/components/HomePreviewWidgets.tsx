"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  CalendarClock,
  ChevronRight,
  Gem,
  Heart,
  Radar,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { formatCollectionCurrency } from "@/lib/collection";
import { formatCurrency } from "@/lib/format";
import type {
  HomeCardListPreview,
  HomeGradedPreviewItem,
  HomeMarketPocketPreviewItem,
  HomeMarketMoverPreviewItem,
  HomeSignalRadarPreviewItem,
  HomeUpcomingPreviewItem,
  HomeUpcomingSinglePreviewGroup,
} from "@/lib/home-overview-insights";
import type { HomeWidgetViewMode } from "@/lib/dashboard-module-preferences";

const HOME_PREVIEW_TILE_CLASS =
  "group rounded-xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.58),rgb(var(--dc-surface-primary-rgb)/0.72))] px-2.5 py-2 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)]";

type HomePreviewTone = "gain" | "drop" | "radar" | "wants" | "sale" | "upcoming";

function HomePreviewTile({
  href,
  imageUrl,
  imageFit = "object-cover",
  fallback,
  title,
  meta,
  metric,
  metricClassName = "text-white/78",
  footer,
  tone,
  mediaKind = "card",
}: {
  href: string;
  imageUrl: string | null;
  imageFit?: "object-cover" | "object-contain";
  fallback: ReactNode;
  title: string;
  meta: string;
  metric: string;
  metricClassName?: string;
  footer: string;
  tone: HomePreviewTone;
  mediaKind?: "card" | "product";
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-home-preview-tile
      data-preview-tone={tone}
      className={`home-preview-tile home-preview-tile--${tone} group flex min-w-0 flex-col rounded-xl border p-2 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5`}
    >
      <span className={`home-preview-tile__media home-preview-tile__media--${mediaKind}`}>
        <span className={`home-preview-tile__art home-preview-tile__art--${mediaKind}`}>
          {imageUrl ? (
            <CachedImage
              sourceUrl={imageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 145px, 190px"
              className={`${imageFit} ${mediaKind === "product" ? "p-2" : ""}`}
            />
          ) : (
            fallback
          )}
        </span>
      </span>
      <span className="mt-2 min-w-0">
        <span className="line-clamp-2 text-[14px] font-black leading-[1.2] text-white/92 transition-colors group-hover:text-white">
          {title}
        </span>
        <span className="mt-1 line-clamp-1 text-[10.5px] font-semibold leading-4 text-white/45">
          {meta}
        </span>
      </span>
      <span className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.46)] pt-2">
        <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
          {footer}
        </span>
        <span className={`home-preview-tile__metric shrink-0 rounded-full px-2 py-1 text-[12px] font-black tabular-nums ${metricClassName}`}>
          {metric}
        </span>
      </span>
    </Link>
  );
}

function WidgetHeader({
  eyebrow,
  title,
  count,
  href,
  icon: Icon,
  tone,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  href: string;
  icon: typeof ArrowUpRight;
  tone: Exclude<HomePreviewTone, "gain" | "drop"> | "market";
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`home-widget-heading-icon home-widget-heading-icon--${tone}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={`home-widget-eyebrow home-widget-eyebrow--${tone} text-[9px] font-black uppercase tracking-[0.14em]`}>
            {eyebrow}
          </p>
          <h2 className="mt-0.5 truncate text-base font-black tracking-tight text-white">
            {title}
          </h2>
        </div>
      </div>
      <Link
        href={href}
        prefetch={false}
        className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-white/9 bg-white/[0.035] px-2.5 text-[10px] font-bold text-white/68 transition-colors hover:border-white/16 hover:text-white"
      >
        {count != null ? count.toLocaleString("en-US") : "Open"}
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EmptyWidget({ children }: { children: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-white/9 px-3 py-6 text-center text-[11px] font-semibold text-white/38">
      {children}
    </div>
  );
}

function signedPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`;
}

export function HomeMarketMoversWidget({
  items,
  viewAllHref,
  viewMode = "grid",
}: {
  items: HomeMarketMoverPreviewItem[];
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
}) {
  const gridView = viewMode === "grid";
  const visibleItems = gridView ? items : items.slice(0, 6);

  return (
    <section className="binder-panel home-widget-panel home-widget-panel--market h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Live market" title="Market Movers" href={viewAllHref} icon={ArrowUpRight} tone="market" />
      {items.length === 0 ? (
        <EmptyWidget>No current mover snapshot is available yet.</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((item) => {
            const gain = item.change > 0;
            const Icon = gain ? ArrowUpRight : ArrowDownRight;
            const tone = gain ? "text-emerald-300" : "text-rose-300";
            const href = `${viewAllHref}${viewAllHref.includes("?") ? "&" : "?"}highlight=${encodeURIComponent(item.cardId)}`;
            return (
              <HomePreviewTile
                key={`${item.cardId}:${item.windowDays}:${item.change}`}
                href={href}
                imageUrl={item.imageUrl}
                fallback={<Icon className={`h-5 w-5 ${tone}`} aria-hidden="true" />}
                title={item.name}
                meta={`${item.episodeCode ?? item.episodeName} / ${item.windowDays}d`}
                metric={`${item.change > 0 ? "+" : ""}${formatCurrency(item.change, item.currency)}`}
                metricClassName={tone}
                footer={signedPercent(item.changePct) ?? formatCurrency(item.currentPrice, item.currency)}
                tone={gain ? "gain" : "drop"}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item) => {
            const gain = item.change > 0;
            const Icon = gain ? ArrowUpRight : ArrowDownRight;
            const tone = gain ? "text-emerald-300" : "text-rose-300";
            const href = `${viewAllHref}${viewAllHref.includes("?") ? "&" : "?"}highlight=${encodeURIComponent(item.cardId)}`;
            return (
              <Link
                key={`${item.cardId}:${item.windowDays}:${item.change}`}
                href={href}
                prefetch={false}
                className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] ${tone}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">
                    {item.episodeCode ?? item.episodeName} / {item.windowDays}d
                  </span>
                </span>
                <span className="min-w-[6.2rem] text-right">
                  <span className={`block text-[13px] font-black tabular-nums ${tone}`}>
                    {item.change > 0 ? "+" : ""}{formatCurrency(item.change, item.currency)}
                  </span>
                  <span className="block text-[10.5px] font-bold tabular-nums text-white/40">
                    {signedPercent(item.changePct) ?? formatCurrency(item.currentPrice, item.currency)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HomeGradedWidget({
  items,
  viewAllHref,
  viewMode,
  kind,
}: {
  items: HomeGradedPreviewItem[];
  viewAllHref: string;
  viewMode: HomeWidgetViewMode;
  kind: "movers" | "targets";
}) {
  const targets = kind === "targets";
  const Icon = targets ? Sparkles : Gem;
  const gridView = viewMode === "grid";
  const visibleItems = gridView ? items : items.slice(0, 6);
  const metricFor = (item: HomeGradedPreviewItem) => {
    if (targets) return item.expectedGain == null ? "--" : `+${formatCurrency(item.expectedGain, "EUR")}`;
    if (item.change == null) return formatCurrency(item.currentPrice, item.currency);
    return `${item.change > 0 ? "+" : ""}${formatCurrency(item.change, item.currency)}`;
  };
  const metricTone = (item: HomeGradedPreviewItem) => targets || (item.change ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300";

  return (
    <section className={`binder-panel home-widget-panel home-widget-panel--${targets ? "radar" : "market"} h-full rounded-[var(--ui-page-header-radius)] p-3`}>
      <WidgetHeader
        eyebrow={targets ? "Risk-adjusted upside" : "Slab market"}
        title={targets ? "Grading Targets" : "Graded Movers"}
        count={items.length}
        href={viewAllHref}
        icon={Icon}
        tone={targets ? "radar" : "market"}
      />
      {items.length === 0 ? (
        <EmptyWidget>{targets ? "No positive-value grading targets are available yet." : "No graded mover snapshot is available yet."}</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((item, index) => (
            <HomePreviewTile
              key={`${item.cardId}:${item.gradedLabel ?? index}`}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              imageUrl={item.imageUrl}
              fallback={<Icon className="h-5 w-5 text-amber-200" aria-hidden="true" />}
              title={item.name}
              meta={targets
                ? `${item.rawPrice == null ? "Raw --" : `Raw ${formatCollectionCurrency(item.rawPrice)}`} → ${item.gradedPrice == null ? "graded --" : formatCollectionCurrency(item.gradedPrice)}`
                : `${item.episodeCode ?? item.episodeName} / ${item.gradedLabel ?? "Graded"}`}
              metric={metricFor(item)}
              metricClassName={metricTone(item)}
              footer={targets
                ? item.score == null ? "Grade target" : `Score ${Math.round(item.score)}/100`
                : signedPercent(item.changePct) ?? `${item.windowDays}d move`}
              tone={targets ? "radar" : (item.change ?? 0) >= 0 ? "gain" : "drop"}
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item, index) => (
            <Link
              key={`${item.cardId}:${item.gradedLabel ?? index}`}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              prefetch={false}
              className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2`}
            >
              <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
                {item.imageUrl ? <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="36px" className="object-cover" /> : <Icon className="h-3.5 w-3.5 text-amber-200" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">{item.name}</span>
                <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">
                  {targets ? `${item.gradedLabel ?? "Grade target"}${item.score == null ? "" : ` / ${Math.round(item.score)}/100`}` : `${item.gradedLabel ?? "Graded"} / ${item.windowDays}d`}
                </span>
              </span>
              <span className={`text-right text-[12px] font-black tabular-nums ${metricTone(item)}`}>{metricFor(item)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function HomeGradedMoversWidget(props: { items: HomeGradedPreviewItem[]; viewAllHref: string; viewMode?: HomeWidgetViewMode }) {
  return <HomeGradedWidget {...props} viewMode={props.viewMode ?? "grid"} kind="movers" />;
}

export function HomeGradingTargetsWidget(props: { items: HomeGradedPreviewItem[]; viewAllHref: string; viewMode?: HomeWidgetViewMode }) {
  return <HomeGradedWidget {...props} viewMode={props.viewMode ?? "grid"} kind="targets" />;
}

function HomeMarketPocketWidget({
  items,
  viewAllHref,
  viewMode,
  kind,
}: {
  items: HomeMarketPocketPreviewItem[];
  viewAllHref: string;
  viewMode: HomeWidgetViewMode;
  kind: "cheap" | "discount";
}) {
  const cheap = kind === "cheap";
  const Icon = cheap ? Gem : BadgePercent;
  const title = cheap ? "Cheap Rarity" : "Discount Watch";
  const eyebrow = cheap ? "High-rarity value" : "Below earlier peak";
  const gridView = viewMode === "grid";
  const visibleItems = gridView ? items : items.slice(0, 6);

  return (
    <section className={`binder-panel home-widget-panel home-widget-panel--${cheap ? "market" : "drops"} h-full rounded-[var(--ui-page-header-radius)] p-3`}>
      <WidgetHeader eyebrow={eyebrow} title={title} count={items.length} href={viewAllHref} icon={Icon} tone="market" />
      {items.length === 0 ? (
        <EmptyWidget>{cheap ? "No affordable high-rarity cards match right now." : "No reliable high-rarity discounts match right now."}</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((item) => (
            <HomePreviewTile
              key={item.cardId}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              imageUrl={item.imageUrl}
              fallback={<Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />}
              title={item.name}
              meta={`${item.episodeCode ?? item.episodeName}${item.cardNumber ? ` / #${item.cardNumber}` : ""}`}
              metric={formatCurrency(item.currentPrice, item.currency)}
              metricClassName={cheap ? "text-emerald-300" : "text-rose-300"}
              footer={cheap ? item.rarity ?? `Score ${Math.round(item.opportunityScore)}` : item.gapToPeakPct == null ? item.rarity ?? "Discount" : `${Math.abs(item.gapToPeakPct).toFixed(0)}% below peak`}
              tone={cheap ? "gain" : "drop"}
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item) => (
            <Link
              key={item.cardId}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              prefetch={false}
              className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2`}
            >
              <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
                {item.imageUrl ? <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="36px" className="object-cover" /> : <Icon className="h-3.5 w-3.5 text-white/45" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">{item.name}</span>
                <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">{item.episodeCode ?? item.episodeName} / {item.rarity ?? "High rarity"}</span>
              </span>
              <span className={`text-right text-[12px] font-black tabular-nums ${cheap ? "text-emerald-300" : "text-rose-300"}`}>{formatCurrency(item.currentPrice, item.currency)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function HomeCheapRarityWidget(props: { items: HomeMarketPocketPreviewItem[]; viewAllHref: string; viewMode?: HomeWidgetViewMode }) {
  return <HomeMarketPocketWidget {...props} viewMode={props.viewMode ?? "grid"} kind="cheap" />;
}

export function HomeDiscountWatchWidget(props: { items: HomeMarketPocketPreviewItem[]; viewAllHref: string; viewMode?: HomeWidgetViewMode }) {
  return <HomeMarketPocketWidget {...props} viewMode={props.viewMode ?? "grid"} kind="discount" />;
}

export function HomeSignalRadarWidget({
  items,
  viewAllHref,
  viewMode = "grid",
}: {
  items: HomeSignalRadarPreviewItem[];
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
}) {
  const gridView = viewMode === "grid";
  const visibleItems = gridView ? items : items.slice(0, 6);

  return (
    <section className="binder-panel home-widget-panel home-widget-panel--radar h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Opportunity watch" title="Signal Radar" href={viewAllHref} icon={Radar} tone="radar" />
      {items.length === 0 ? (
        <EmptyWidget>No active Radar signals match the current game.</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((item) => (
            <HomePreviewTile
              key={item.cardId}
              href={`/movers/signal-radar/${encodeURIComponent(item.cardId)}`}
              imageUrl={item.imageUrl}
              fallback={<Radar className="h-5 w-5 text-[var(--dc-primary)]" aria-hidden="true" />}
              title={item.name}
              meta={`${item.episodeCode ?? item.episodeName} / ${item.pressureLabel}`}
              metric={`${Math.round(item.score)}/100`}
              metricClassName="text-[var(--dc-primary)]"
              footer={item.confidence}
              tone="radar"
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item) => (
            <Link
              key={item.cardId}
              href={`/movers/signal-radar/${encodeURIComponent(item.cardId)}`}
              prefetch={false}
              className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[rgb(var(--dc-primary-rgb)/0.18)] bg-[rgb(var(--dc-primary-rgb)/0.08)] text-[var(--dc-primary)]">
                <Radar className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">
                  {item.episodeCode ?? item.episodeName} / {item.pressureLabel}
                </span>
              </span>
              <span className="min-w-[5.5rem] text-right">
                <span className="block text-[13px] font-black tabular-nums text-[var(--dc-primary)]">
                  {Math.round(item.score)}/100
                </span>
                <span className="block text-[10.5px] font-bold text-white/40">
                  {item.confidence}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function HomeCardListWidget({
  eyebrow,
  title,
  data,
  viewAllHref,
  emptyLabel,
  kind,
  viewMode,
}: {
  eyebrow: string;
  title: string;
  data: HomeCardListPreview;
  viewAllHref: string;
  emptyLabel: string;
  kind: "wants" | "sale";
  viewMode: HomeWidgetViewMode;
}) {
  const Icon = kind === "wants" ? Heart : ShoppingBag;
  const gridView = viewMode === "grid";
  const visibleItems = gridView ? data.items : data.items.slice(0, 6);
  return (
    <section className={`binder-panel home-widget-panel home-widget-panel--${kind} h-full rounded-[var(--ui-page-header-radius)] p-3`}>
      <WidgetHeader eyebrow={eyebrow} title={title} count={data.total} href={viewAllHref} icon={Icon} tone={kind} />
      {kind === "sale" ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-300/14 bg-emerald-300/[0.055] px-3 py-2">
          <span className="text-[9px] font-black uppercase tracking-[0.13em] text-emerald-200/60">For-sale market value</span>
          <span className="text-[15px] font-black tabular-nums text-emerald-200">{formatCollectionCurrency(data.marketValue ?? 0)}</span>
        </div>
      ) : null}
      {data.items.length === 0 ? (
        <EmptyWidget>{emptyLabel}</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((item, index) => (
            <HomePreviewTile
              key={`${item.cardId}:${index}`}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              imageUrl={item.imageUrl}
              fallback={<Icon className="h-5 w-5 text-white/45" aria-hidden="true" />}
              title={item.name}
              meta={`${item.episodeCode ?? item.episodeName}${item.cardNumber ? ` / #${item.cardNumber}` : ""}`}
              metric={item.price == null ? "--" : formatCurrency(item.price, item.currency)}
              footer={kind === "wants" ? "Wanted" : "For sale"}
              tone={kind}
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item, index) => (
            <Link
              key={`${item.cardId}:${index}`}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              prefetch={false}
              className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2`}
            >
              <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
                {item.imageUrl ? (
                  <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-white/45" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">
                  {item.episodeCode ?? item.episodeName}{item.cardNumber ? ` / #${item.cardNumber}` : ""}
                </span>
              </span>
              <span className="min-w-[4.5rem] text-right text-[12px] font-black tabular-nums text-white/74">
                {item.price == null ? "--" : formatCurrency(item.price, item.currency)}
              </span>
            </Link>
          ))}
        </div>
      )}
      {data.totalValue != null ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--dc-primary-rgb)/0.18)] bg-[rgb(var(--dc-primary-rgb)/0.07)] px-3 py-2">
          <span className="text-[9px] font-black uppercase tracking-[0.13em] text-white/48">Total asking value</span>
          <span className="text-[15px] font-black tabular-nums text-[var(--dc-primary)]">{formatCollectionCurrency(data.totalValue)}</span>
        </div>
      ) : null}
    </section>
  );
}

export function HomeWantsWidget({ data, viewAllHref, viewMode = "grid" }: { data: HomeCardListPreview; viewAllHref: string; viewMode?: HomeWidgetViewMode }) {
  return (
    <HomeCardListWidget
      eyebrow="Buy list"
      title="Wants"
      data={data}
      viewAllHref={viewAllHref}
      emptyLabel="Your Wants list is empty."
      kind="wants"
      viewMode={viewMode}
    />
  );
}

export function HomeForSaleWidget({ data, viewAllHref, viewMode = "grid" }: { data: HomeCardListPreview; viewAllHref: string; viewMode?: HomeWidgetViewMode }) {
  return (
    <HomeCardListWidget
      eyebrow="Selling"
      title="For Sale"
      data={data}
      viewAllHref={viewAllHref}
      emptyLabel="No cards are currently listed for sale."
      kind="sale"
      viewMode={viewMode}
    />
  );
}

export function HomeUpcomingWidget({
  items,
  viewAllHref,
  viewMode = "grid",
}: {
  items: HomeUpcomingPreviewItem[];
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
}) {
  const gridView = viewMode === "grid";
  const visibleItems = gridView ? items : items.slice(0, 6);

  return (
    <section className="binder-panel home-widget-panel home-widget-panel--upcoming h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Release calendar" title="Upcoming Sealed" count={items.length} href={viewAllHref} icon={CalendarClock} tone="upcoming" />
      {items.length === 0 ? (
        <EmptyWidget>No upcoming sealed releases are scheduled.</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {visibleItems.map((item) => (
            <HomePreviewTile
              key={item.id}
              href={viewAllHref}
              imageUrl={item.imageUrl}
              imageFit="object-contain"
              fallback={<CalendarClock className="h-5 w-5 text-white/45" aria-hidden="true" />}
              title={item.name}
              meta={item.episodeCode ?? item.episodeName ?? "Sealed release"}
              metric={item.daysUntil === 0 ? "Today" : `${item.daysUntil}d`}
              metricClassName="text-[var(--dc-primary)]"
              footer={new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.releaseDate))}
              tone="upcoming"
              mediaKind="product"
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item) => (
            <Link
              key={item.id}
              href={viewAllHref}
              prefetch={false}
              className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2`}
            >
              <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
                {item.imageUrl ? (
                  <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="36px" className="object-contain p-0.5" />
                ) : (
                  <CalendarClock className="h-3.5 w-3.5 text-white/45" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">
                  {item.episodeCode ?? item.episodeName ?? "Sealed release"}
                </span>
              </span>
              <span className="min-w-[4.8rem] text-right">
                <span className="block text-[12px] font-black tabular-nums text-[var(--dc-primary)]">
                  {item.daysUntil === 0 ? "Today" : `${item.daysUntil}d`}
                </span>
                <span className="block text-[9.5px] font-bold text-white/36">
                  {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.releaseDate))}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function HomeUpcomingSinglesWidget({
  groups,
  total,
  viewAllHref,
  viewMode = "grid",
}: {
  groups: HomeUpcomingSinglePreviewGroup[];
  total: number;
  viewAllHref: string;
  viewMode?: HomeWidgetViewMode;
}) {
  const gridView = viewMode === "grid";
  const visibleGroups = groups.filter((group) => Array.isArray(group?.items));
  const dateLabel = (value: string | null) => value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value))
    : "TBA";

  return (
    <section className="binder-panel home-widget-panel home-widget-panel--upcoming h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Reveals & releases" title="Upcoming Singles" count={total} href={viewAllHref} icon={Sparkles} tone="upcoming" />
      {visibleGroups.length === 0 ? (
        <EmptyWidget>No upcoming singles or recent reveals are available.</EmptyWidget>
      ) : (
        <div className="mt-2 grid gap-2.5">
          {visibleGroups.map((group) => {
            const setHref = `/upcoming/sets/${encodeURIComponent(group.key)}`;
            const statusLabel = group.statuses.confirmed
              ? `${group.statuses.confirmed} confirmed`
              : group.statuses.reveal
                ? `${group.statuses.reveal} revealed`
                : group.statuses.leak
                  ? `${group.statuses.leak} early`
                  : `${group.total} upcoming`;

            return (
              <article key={group.key} className="overflow-hidden rounded-2xl border border-sky-300/12 bg-[rgb(var(--dc-bg-main-rgb)/0.34)]">
                <Link
                  href={setHref}
                  prefetch={false}
                  className="group/set flex min-w-0 items-center justify-between gap-3 border-b border-sky-300/10 bg-sky-300/[0.035] px-3 py-2.5 transition-colors hover:bg-sky-300/[0.07]"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-black text-white/92">
                      {group.name}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-sky-300/60 transition-transform group-hover/set:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] font-semibold text-white/40">
                      {group.total} {group.total === 1 ? "card" : "cards"} · {statusLabel}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-sky-300/14 bg-sky-300/[0.07] px-2 py-1 text-[9.5px] font-black tabular-nums text-sky-200">
                    {dateLabel(group.releaseDate)}
                  </span>
                </Link>

                {gridView ? (
                  <div
                    role="region"
                    aria-label={`Browse ${group.name}`}
                    className="grid snap-x snap-mandatory auto-cols-[minmax(7.75rem,9rem)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain p-2.5 [scrollbar-color:rgb(var(--dc-primary-rgb)/0.34)_transparent] [scrollbar-width:thin]"
                  >
                    {group.items.map((item) => (
                      <div key={item.id} className="min-w-0 snap-start">
                        <HomePreviewTile
                          href={item.href}
                          imageUrl={item.imageUrl}
                          fallback={<Sparkles className="h-5 w-5 text-sky-300" aria-hidden="true" />}
                          title={item.name}
                          meta={`${item.episodeCode ?? item.episodeName}${item.cardNumber ? ` / #${item.cardNumber}` : ""}`}
                          metric={dateLabel(item.releaseDate)}
                          metricClassName="text-sky-300"
                          footer={item.rarity ?? item.status}
                          tone="upcoming"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-1 p-2">
                    {group.items.slice(0, 3).map((item) => (
                      <Link key={item.id} href={item.href} prefetch={false} className={`${HOME_PREVIEW_TILE_CLASS} grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2`}>
                        <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
                          {item.imageUrl ? <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="36px" className="object-cover" /> : <Sparkles className="h-3.5 w-3.5 text-sky-300" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-black text-white/88 group-hover:text-white">{item.name}</span>
                          <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-white/40">#{item.cardNumber ?? "—"} / {item.status}</span>
                        </span>
                        <span className="text-right text-[11px] font-black tabular-nums text-sky-300">{item.rarity ?? dateLabel(item.releaseDate)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
