"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Heart,
  Radar,
  ShoppingBag,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { useSettings } from "@/components/SettingsProvider";
import { formatCollectionCurrency } from "@/lib/collection";
import { formatCurrency } from "@/lib/format";
import type {
  HomeCardListPreview,
  HomeMarketMoverPreviewItem,
  HomeSignalRadarPreviewItem,
  HomeUpcomingPreviewItem,
} from "@/lib/home-overview-insights";

const HOME_PREVIEW_TILE_CLASS =
  "group rounded-xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.58),rgb(var(--dc-surface-primary-rgb)/0.72))] px-2.5 py-2 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)]";

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
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${HOME_PREVIEW_TILE_CLASS} flex min-h-[8.75rem] min-w-0 flex-col p-2.5`}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <span className="relative flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[rgb(var(--dc-border-rgb)/0.78)] bg-[rgb(var(--dc-bg-main-rgb)/0.3)]">
          {imageUrl ? (
            <CachedImage
              sourceUrl={imageUrl}
              alt=""
              fill
              sizes="48px"
              className={imageFit}
            />
          ) : (
            fallback
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[12px] font-black leading-[1.2] text-white/90 transition-colors group-hover:text-white">
            {title}
          </span>
          <span className="mt-1 line-clamp-2 text-[9.5px] font-semibold leading-4 text-white/42">
            {meta}
          </span>
        </span>
      </span>
      <span className="mt-auto flex min-w-0 items-end justify-between gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.62)] pt-2">
        <span className="min-w-0 truncate text-[9.5px] font-bold text-white/38">
          {footer}
        </span>
        <span className={`shrink-0 text-[12px] font-black tabular-nums ${metricClassName}`}>
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
}: {
  eyebrow: string;
  title: string;
  count?: number;
  href: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--dc-primary)]/75">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 truncate text-base font-black tracking-tight text-white">
          {title}
        </h2>
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
}: {
  items: HomeMarketMoverPreviewItem[];
  viewAllHref: string;
}) {
  const { displaySettings } = useSettings();
  const gridView = displaySettings.defaultView !== "table";

  return (
    <section className="binder-panel h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Live market" title="Market Movers" href={viewAllHref} />
      {items.length === 0 ? (
        <EmptyWidget>No current mover snapshot is available yet.</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {items.map((item) => {
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
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {items.map((item) => {
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

export function HomeSignalRadarWidget({
  items,
  viewAllHref,
}: {
  items: HomeSignalRadarPreviewItem[];
  viewAllHref: string;
}) {
  const { displaySettings } = useSettings();
  const gridView = displaySettings.defaultView !== "table";

  return (
    <section className="binder-panel h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Opportunity watch" title="Signal Radar" href={viewAllHref} />
      {items.length === 0 ? (
        <EmptyWidget>No active Radar signals match the current game.</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {items.map((item) => (
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
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {items.map((item) => (
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
}: {
  eyebrow: string;
  title: string;
  data: HomeCardListPreview;
  viewAllHref: string;
  emptyLabel: string;
  kind: "wants" | "sale";
}) {
  const Icon = kind === "wants" ? Heart : ShoppingBag;
  const { displaySettings } = useSettings();
  const gridView = displaySettings.defaultView !== "table";
  return (
    <section className="binder-panel h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow={eyebrow} title={title} count={data.total} href={viewAllHref} />
      {data.items.length === 0 ? (
        <EmptyWidget>{emptyLabel}</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {data.items.map((item, index) => (
            <HomePreviewTile
              key={`${item.cardId}:${index}`}
              href={`/cards/${encodeURIComponent(item.cardId)}`}
              imageUrl={item.imageUrl}
              fallback={<Icon className="h-5 w-5 text-white/45" aria-hidden="true" />}
              title={item.name}
              meta={`${item.episodeCode ?? item.episodeName}${item.cardNumber ? ` / #${item.cardNumber}` : ""}`}
              metric={item.price == null ? "--" : formatCurrency(item.price, item.currency)}
              footer={kind === "wants" ? "Wanted" : "For sale"}
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {data.items.map((item, index) => (
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
        <div className="mt-2 flex items-center justify-between border-t border-white/8 pt-2 text-[10.5px] font-semibold text-white/42">
          <span>Total asking value</span>
          <span className="font-black tabular-nums text-white/72">{formatCollectionCurrency(data.totalValue)}</span>
        </div>
      ) : null}
    </section>
  );
}

export function HomeWantsWidget({ data, viewAllHref }: { data: HomeCardListPreview; viewAllHref: string }) {
  return (
    <HomeCardListWidget
      eyebrow="Buy list"
      title="Wants"
      data={data}
      viewAllHref={viewAllHref}
      emptyLabel="Your Wants list is empty."
      kind="wants"
    />
  );
}

export function HomeForSaleWidget({ data, viewAllHref }: { data: HomeCardListPreview; viewAllHref: string }) {
  return (
    <HomeCardListWidget
      eyebrow="Selling"
      title="For Sale"
      data={data}
      viewAllHref={viewAllHref}
      emptyLabel="No cards are currently listed for sale."
      kind="sale"
    />
  );
}

export function HomeUpcomingWidget({
  items,
  viewAllHref,
}: {
  items: HomeUpcomingPreviewItem[];
  viewAllHref: string;
}) {
  const { displaySettings } = useSettings();
  const gridView = displaySettings.defaultView !== "table";

  return (
    <section className="binder-panel h-full rounded-[var(--ui-page-header-radius)] p-3">
      <WidgetHeader eyebrow="Release calendar" title="Upcoming" count={items.length} href={viewAllHref} />
      {items.length === 0 ? (
        <EmptyWidget>No upcoming sealed releases are scheduled.</EmptyWidget>
      ) : gridView ? (
        <div className="home-widget-tile-grid mt-2 grid gap-2">
          {items.map((item) => (
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
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {items.map((item) => (
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
