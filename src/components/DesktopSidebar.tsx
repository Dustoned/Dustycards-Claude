"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LogOut,
} from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import FeedbackButton from "@/components/FeedbackButton";
import ActionCenterButton from "@/components/ActionCenterButton";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";
import {
  COLLECTION_CARD_ADDED_EVENT,
  getCollectionCardAddedEffects,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";
import { WANTS_CHANGED_EVENT } from "@/lib/wants-client-events";
import {
  buildNavigationMarketHref,
  formatNavigationCount,
  getNavigationBadge,
  getNavigationDisplayName,
  isNavigationItemActive,
  NAVIGATION_ACCOUNT_ITEMS,
  NAVIGATION_SECTIONS,
  resolveNavigationItems,
  type NavigationSummary,
} from "@/components/navigation-model";
import {
  DEFAULT_DESKTOP_PINNED_NAV_KEYS,
  DESKTOP_PIN_LIMIT,
} from "@/lib/navigation-preferences";

export type DesktopSidebarSummary = NavigationSummary;

export default function DesktopSidebar({ summary }: { summary: DesktopSidebarSummary }) {
  const { settings } = useSettings();

  if (settings.desktopNavigation !== "sidebar") return null;
  return <DesktopSidebarContent summary={summary} />;
}

function DesktopSidebarContent({ summary }: { summary: DesktopSidebarSummary }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { settings } = useSettings();
  const tab = useLiveCollectionTab();
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [cardsCount, setCardsCount] = useState(summary.cards);
  const [forSaleCardsCount, setForSaleCardsCount] = useState(summary.forSaleCards);
  const [wantsCount, setWantsCount] = useState(summary.wants);
  const displayName = getNavigationDisplayName(summary.email);
  const roleLabel = summary.role === "admin" ? "Admin" : "Collector";
  const moverScope = searchParams.get("scope");
  const pinnedItems = resolveNavigationItems(
    settings.desktopPinnedNavKeys,
    settings.onePieceLibraryEnabled,
    {
      fallbackKeys: DEFAULT_DESKTOP_PINNED_NAV_KEYS,
      limit: DESKTOP_PIN_LIMIT,
    }
  ).filter((item) => item.key !== "home" && item.key !== "openings");
  const pinnedKeys = new Set(pinnedItems.map((item) => item.key));
  const sidebarSections = [
    ...(pinnedItems.length > 0 ? [{ label: "Pinned", items: pinnedItems }] : []),
    ...NAVIGATION_SECTIONS.map((section) => ({
      label: section.label,
      items: section.items.filter((item) => !pinnedKeys.has(item.key)),
    })),
  ].filter((section) => section.items.length > 0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setForSaleCardsCount(summary.forSaleCards));
    return () => window.cancelAnimationFrame(frame);
  }, [summary.forSaleCards]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCardsCount(summary.cards));
    return () => window.cancelAnimationFrame(frame);
  }, [summary.cards]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setWantsCount(summary.wants));
    return () => window.cancelAnimationFrame(frame);
  }, [summary.wants]);

  useEffect(() => {
    function handleWantsChanged(event: Event) {
      const detail = (event as CustomEvent<{ wanted?: boolean }>).detail;
      if (typeof detail?.wanted !== "boolean") return;
      setWantsCount((current) => Math.max(0, current + (detail.wanted ? 1 : -1)));
    }

    window.addEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
    return () => window.removeEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
  }, []);

  useEffect(() => {
    function handleCollectionCardAdded(event: Event) {
      const detail = (event as CustomEvent<CollectionCardAddedDetail>).detail;
      if (!detail) return;
      const effects = getCollectionCardAddedEffects(detail);

      if (effects.collectionCountDelta) {
        setCardsCount((current) => current + effects.collectionCountDelta);
      }
      if (effects.forSaleCountDelta) {
        setForSaleCardsCount((current) => current + effects.forSaleCountDelta);
      }
    }

    window.addEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionCardAdded);
    return () => window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionCardAdded);
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside
      data-desktop-sidebar
      className="pointer-events-none fixed inset-y-0 left-0 z-50 hidden h-dvh w-[16rem]"
    >
      <div
        data-sidebar-scroll
        className="pointer-events-auto flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain border-r border-white/8 bg-[var(--dc-bg-main)] px-3 pb-24 pt-4 pr-2.5 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <Link href="/" prefetch={null} className="mb-5 flex shrink-0 items-center gap-2.5 px-1">
          <span className="relative h-9 w-9 shrink-0 drop-shadow-[0_0_11px_rgb(var(--dc-primary-rgb)/0.72)]">
            <Image
              src="/assets/dustycards-master-ball-d.webp"
              alt=""
              fill
              priority
              sizes="36px"
              className="object-contain"
            />
          </span>
          <span className="text-[19px] font-black tracking-tight text-white">DustyCards</span>
        </Link>

        <nav className="grid gap-4" aria-label="Desktop navigation">
          {sidebarSections.map((section) => (
            <div key={section.label} className="grid gap-px">
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                {section.label}
              </p>
              {section.items.map((item) => {
                if (item.key === "one-piece" && !settings.onePieceLibraryEnabled) {
                  return null;
                }

                const active = isNavigationItemActive(pathname, tab, item.key, moverScope);
                const Icon = item.icon;
                const badge = getNavigationBadge(
                  item.badge,
                  cardsCount,
                  forSaleCardsCount,
                  wantsCount
                );
                const href =
                  item.marketMode
                    ? buildNavigationMarketHref(item.marketMode, pathname, searchParams)
                    : item.href;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    prefetch={item.href === "/" ? null : false}
                    aria-current={active ? "page" : undefined}
                    data-sidebar-item
                    data-active={active ? "true" : "false"}
                    className={`group flex min-h-[34px] items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                      active
                        ? "text-white shadow-[inset_0_0_0_1px_rgb(var(--dc-primary-soft-rgb)/0.28),0_0_22px_rgb(var(--dc-primary-rgb)/0.18)]"
                        : "text-white/62 hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-violet-200" : "text-white/55"}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {badge ? (
                      <span
                        data-sidebar-badge
                        data-active={active ? "true" : "false"}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                          active ? "text-violet-100" : "text-white/55"
                        }`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      <div
        data-sidebar-account-dock
        className="pointer-events-auto fixed bottom-3 left-3 z-[70] w-[14.5rem]"
      >
        {accountOpen ? (
          <div
            id="desktop-account-panel"
            data-sidebar-card
            className="mb-2 rounded-2xl border border-white/10 p-2.5 shadow-2xl shadow-black/45 backdrop-blur-xl"
          >
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["Cards", cardsCount],
                ["Binders", summary.binders],
                ["Sealed", summary.sealedUnits],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-xl border border-white/8 bg-black/18 px-2 py-1.5"
                >
                  <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/35">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[12px] font-black tabular-nums text-white">
                    {formatNavigationCount(Number(value))}
                  </p>
                </div>
              ))}
            </div>

            <nav className="mt-2 grid gap-px border-t border-white/8 pt-2" aria-label="Account navigation">
              {NAVIGATION_ACCOUNT_ITEMS.map((item) => {
                const active = isNavigationItemActive(pathname, tab, item.key, moverScope);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    data-sidebar-item
                    data-active={active ? "true" : "false"}
                    className={`flex min-h-[28px] items-center gap-2.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${
                      active
                        ? "text-white shadow-[inset_0_0_0_1px_rgb(var(--dc-primary-soft-rgb)/0.28),0_0_18px_rgb(var(--dc-primary-rgb)/0.14)]"
                        : "text-white/62 hover:text-white"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-violet-200" : "text-white/55"}`} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {item.key === "settings" && (summary.attentionCount ?? 0) > 0 ? (
                      <span className="min-w-4 rounded-full bg-rose-500 px-1 text-center text-[8px] font-black leading-4 text-white">
                        {(summary.attentionCount ?? 0) > 99 ? "99+" : summary.attentionCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
              <FeedbackButton
                className="flex min-h-[28px] items-center gap-2.5 rounded-lg px-2 text-left text-[12px] font-medium text-white/62 transition-colors hover:text-white"
                iconClassName="h-3.5 w-3.5 text-white/55"
              />
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                data-sidebar-item
                data-active="false"
                className="flex min-h-[28px] items-center gap-2.5 rounded-lg px-2 text-left text-[12px] font-medium text-white/62 transition-colors hover:text-white disabled:cursor-wait disabled:opacity-60"
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5 text-white/55" />
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
            </nav>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <ActionCenterButton
            initialCount={summary.attentionCount ?? 0}
            desktopPlacement="above-left"
          />
          <button
            type="button"
            data-sidebar-account-toggle
            aria-expanded={accountOpen}
            aria-controls="desktop-account-panel"
            onClick={() => setAccountOpen((current) => !current)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border px-2 py-1.5 text-left backdrop-blur-xl transition-colors"
          >
          <span
            data-sidebar-avatar
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-violet-100 shadow-[0_0_18px_rgb(var(--dc-primary-rgb)/0.22)]"
          >
            {summary.email.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-black leading-tight text-white">
              {displayName}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <span
                data-sidebar-badge-admin
                className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-amber-200"
              >
                {roleLabel === "Admin" ? "ADMIN" : "USER"}
              </span>
              <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-white/56">
                {formatNavigationCount(cardsCount)} cards
              </span>
            </span>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] text-white/58">
            {accountOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
