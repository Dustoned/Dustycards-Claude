"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Brush,
  ChevronRight,
  FolderOpen,
  Heart,
  Home,
  LibraryBig,
  LogOut,
  Mail,
  MoreHorizontal,
  PackageOpen,
  Radar,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import type { DesktopSidebarSummary } from "@/components/DesktopSidebar";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import {
  COLLECTION_CARD_ADDED_EVENT,
  getCollectionCardAddedEffects,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";
import { WANTS_CHANGED_EVENT } from "@/lib/wants-client-events";

const PRIMARY_NAV_ITEMS: readonly MobileNavItem[] = [
  { href: "/", label: "Home", icon: Home, matches: ["home"] },
  {
    href: "/?tab=complete",
    label: "Collection",
    icon: LibraryBig,
    matches: ["tab:complete", "tab:cards", "tab:singles", "tab:binders", "tab:sealed", "tab:graded", "/binders"],
  },
  { href: "/wants", label: "Wants", icon: Heart, matches: ["/wants"] },
  { href: "/movers", label: "Market", icon: TrendingUp, matches: ["/movers", "tab:selling"] },
] as const;

type MobileNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matches: readonly string[];
  excludeMatches?: readonly string[];
  shortLabel?: string;
};

type MobileNavSection = {
  label: string;
  items: readonly MobileNavItem[];
};

function getMoreMenuSections(onePieceEnabled: boolean): readonly MobileNavSection[] {
  const expansionItems: MobileNavItem[] = onePieceEnabled
    ? [
        { href: "/expansions", label: "Pokemon Sets", shortLabel: "Pokemon", icon: FolderOpen, matches: ["/expansions"] },
        { href: "/one-piece/expansions", label: "One Piece Sets", shortLabel: "One Piece", icon: FolderOpen, matches: ["/one-piece"] },
      ]
    : [{ href: "/expansions", label: "Expansions", shortLabel: "Sets", icon: FolderOpen, matches: ["/expansions"] }];

  return [
    {
      label: "Browse",
      items: [
        ...expansionItems,
        { href: "/categories", label: "Categories", icon: Sparkles, matches: ["/categories"] },
        { href: "/illustrators", label: "Illustrators", shortLabel: "Artists", icon: Brush, matches: ["/illustrators"] },
        { href: "/submit-card", label: "Submit Card", shortLabel: "Submit", icon: Search, matches: ["/submit-card"] },
      ],
    },
    {
      label: "Collection",
      items: [
        { href: "/", label: "Home", icon: Home, matches: ["home"] },
        {
          href: "/?tab=complete",
          label: "Complete Collection",
          shortLabel: "Complete",
          icon: LibraryBig,
          matches: ["tab:complete", "tab:cards"],
        },
        { href: "/?tab=singles", label: "Loose Singles", shortLabel: "Singles", icon: Sparkles, matches: ["tab:singles"] },
        { href: "/?tab=binders", label: "Binders", icon: Boxes, matches: ["tab:binders", "/binders"] },
        { href: "/?tab=sealed", label: "Sealed", icon: PackageOpen, matches: ["tab:sealed"] },
        { href: "/?tab=graded", label: "Graded", icon: LibraryBig, matches: ["tab:graded"] },
        { href: "/social", label: "Social", icon: UsersRound, matches: ["/social"] },
      ],
    },
    {
      label: "Market",
      items: [
        { href: "/wants", label: "Wants", icon: Heart, matches: ["/wants"] },
        {
          href: "/movers",
          label: "Market",
          icon: TrendingUp,
          matches: ["/movers"],
          excludeMatches: ["/movers/signal-radar"],
        },
        {
          href: "/movers/signal-radar",
          label: "Signal Radar",
          icon: Radar,
          matches: ["/movers/signal-radar"],
        },
        { href: "/?tab=selling", label: "For Sale", shortLabel: "Sell", icon: ShoppingBag, matches: ["tab:selling"] },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/account", label: "Account", icon: UserRound, matches: ["/account"] },
        { href: "/settings", label: "Settings", icon: SettingsIcon, matches: ["/settings"] },
      ],
    },
  ];
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function getDisplayName(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Dusty";

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isActive(pathname: string, matches: readonly string[]) {
  return matches.some((prefix) => {
    if (prefix.startsWith("tab:")) return false;
    return (
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  });
}

function isNavItemActive(
  pathname: string,
  collectionTab: string | null,
  matches: readonly string[],
  excludeMatches: readonly string[] = []
) {
  const excluded = excludeMatches.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (excluded) return false;

  const tabMatches = matches
    .filter((match) => match.startsWith("tab:"))
    .map((match) => match.slice(4));

  if (tabMatches.length > 0) {
    const tabActive = tabMatches.some((targetTab) =>
      targetTab === "overview"
        ? !collectionTab || collectionTab === "overview"
        : collectionTab === targetTab
    );
    const pathActive = matches
      .filter((match) => !match.startsWith("tab:"))
      .some((match) => pathname === match || pathname.startsWith(`${match}/`));

    return (pathname === "/" && tabActive) || pathActive;
  }

  if (matches[0] === "home") return pathname === "/" && (!collectionTab || collectionTab === "overview");

  if (matches[0] === "/movers") return pathname.startsWith("/movers");

  return isActive(pathname, matches);
}

export default function MobileBottomNav({ summary }: { summary: DesktopSidebarSummary | null }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const collectionTab = useLiveCollectionTab();
  const { settings } = useSettings();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountPopupOpen, setAccountPopupOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [cardsCount, setCardsCount] = useState(summary?.cards ?? 0);
  const [forSaleCardsCount, setForSaleCardsCount] = useState(summary?.forSaleCards ?? 0);
  const [wantsCount, setWantsCount] = useState(summary?.wants ?? 0);
  const moreScrollRef = useRef<HTMLDivElement | null>(null);
  const moreSections = getMoreMenuSections(settings.onePieceLibraryEnabled);
  const primaryActive = PRIMARY_NAV_ITEMS.some((item) =>
    isNavItemActive(pathname, collectionTab, item.matches, item.excludeMatches)
  );
  const moreActive = moreOpen || !primaryActive;
  useBodyScrollLock(moreOpen);
  const accountInitial = summary?.email.slice(0, 1).toUpperCase() ?? "D";
  const accountName = summary ? getDisplayName(summary.email) : "Account";
  const activeMoreEntry =
    moreSections
      .flatMap((section) => section.items.map((item) => ({ section: section.label, item })))
      .find(({ item }) =>
        isNavItemActive(pathname, collectionTab, item.matches, item.excludeMatches)
      ) ?? null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setForSaleCardsCount(summary?.forSaleCards ?? 0)
    );
    return () => window.cancelAnimationFrame(frame);
  }, [summary?.forSaleCards]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCardsCount(summary?.cards ?? 0));
    return () => window.cancelAnimationFrame(frame);
  }, [summary?.cards]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setWantsCount(summary?.wants ?? 0));
    return () => window.cancelAnimationFrame(frame);
  }, [summary?.wants]);

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

  function closeMoreMenu() {
    setMoreOpen(false);
    setAccountPopupOpen(false);
    setLogoutConfirmOpen(false);
  }

  function openAccountPopup() {
    setAccountPopupOpen(true);
    setLogoutConfirmOpen(false);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      setAccountPopupOpen(false);
      setLogoutConfirmOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;

    const scrollEdgePadding = 2;
    let lastTouchY = 0;

    function preventTouchDefault(event: TouchEvent) {
      if (event.cancelable) {
        event.preventDefault();
      }
    }

    function keepScrollInsideSheet(scrollElement: HTMLDivElement) {
      const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;

      if (maxScrollTop <= 0) {
        return;
      }

      if (scrollElement.scrollTop <= 0) {
        scrollElement.scrollTop = scrollEdgePadding;
      } else if (scrollElement.scrollTop >= maxScrollTop) {
        scrollElement.scrollTop = Math.max(0, maxScrollTop - scrollEdgePadding);
      }
    }

    function handleScroll() {
      const scrollElement = moreScrollRef.current;
      if (scrollElement) {
        keepScrollInsideSheet(scrollElement);
      }
    }

    function handleTouchStart(event: TouchEvent) {
      lastTouchY = event.touches[0]?.clientY ?? 0;

      const scrollElement = moreScrollRef.current;
      const target = event.target;

      if (scrollElement && target instanceof Node && scrollElement.contains(target)) {
        keepScrollInsideSheet(scrollElement);
      }
    }

    function handleTouchMove(event: TouchEvent) {
      const scrollElement = moreScrollRef.current;
      const target = event.target;

      if (!scrollElement || !(target instanceof Node) || !scrollElement.contains(target)) {
        preventTouchDefault(event);
        return;
      }

      const nextTouchY = event.touches[0]?.clientY ?? lastTouchY;
      const deltaY = nextTouchY - lastTouchY;
      lastTouchY = nextTouchY;

      const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;

      if (maxScrollTop <= 0) {
        preventTouchDefault(event);
        return;
      }

      const atTop = scrollElement.scrollTop <= scrollEdgePadding;
      const atBottom = scrollElement.scrollTop >= maxScrollTop - scrollEdgePadding;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        keepScrollInsideSheet(scrollElement);
        preventTouchDefault(event);
      }
    }

    const scrollElement = moreScrollRef.current;
    const passiveCaptureOptions = { capture: true, passive: true };
    const activeCaptureOptions = { capture: true, passive: false };

    if (scrollElement) {
      keepScrollInsideSheet(scrollElement);
    }
    scrollElement?.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, passiveCaptureOptions);
    document.addEventListener("touchmove", handleTouchMove, activeCaptureOptions);
    window.addEventListener("touchmove", handleTouchMove, activeCaptureOptions);

    return () => {
      scrollElement?.removeEventListener("scroll", handleScroll);
      document.removeEventListener("touchstart", handleTouchStart, passiveCaptureOptions);
      document.removeEventListener("touchmove", handleTouchMove, activeCaptureOptions);
      window.removeEventListener("touchmove", handleTouchMove, activeCaptureOptions);
    };
  }, [moreOpen]);

  return (
    <>
      {moreOpen && (
        <div
          data-mobile-more-backdrop
          data-no-pull-refresh
          className="fixed inset-0 z-[70] flex touch-pan-y items-end justify-center overscroll-y-none bg-black/68 px-2 pb-[calc(5.65rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md md:hidden"
          onClick={closeMoreMenu}
        >
          <div
            data-mobile-more-sheet
            data-no-pull-refresh
            className="relative w-full max-w-md max-h-[calc(100dvh_-_6.6rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] touch-pan-y overscroll-y-none overflow-hidden rounded-[28px] border border-white/10 bg-[#08090d]/98 shadow-[0_-18px_60px_rgba(124,92,255,0.22),0_-30px_90px_rgba(0,0,0,0.72)] backdrop-blur-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-white/18" aria-hidden="true" />
            </div>

            <div
              ref={moreScrollRef}
              data-mobile-more-scroll
              data-no-pull-refresh
              className="max-h-[inherit] touch-pan-y overflow-y-auto overscroll-y-none px-3 pb-3 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="-mx-3 -mt-5 mb-3 border-b border-white/8 bg-[#08090d]/94 px-3 pb-3 pt-5 backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[19px] font-black leading-tight tracking-tight text-white">More</p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-white/42">
                      {activeMoreEntry
                        ? `${activeMoreEntry.section} / ${activeMoreEntry.item.label}`
                        : "DustyCards"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeMoreMenu}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/74 transition-colors hover:bg-white/[0.09] hover:text-white"
                    aria-label="Close navigation menu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {summary ? (
                <button
                  type="button"
                  onClick={openAccountPopup}
                  data-mobile-account-card
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] border border-violet-300/16 bg-[linear-gradient(145deg,rgba(124,92,255,0.18),rgba(255,255,255,0.045))] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  aria-label="Open account details"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-violet-300/24 bg-violet-500/22 text-base font-black text-violet-50 shadow-[0_0_26px_rgba(124,92,255,0.22)]">
                    {accountInitial}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] font-black leading-tight text-white">{accountName}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/18 bg-amber-400/[0.08] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-amber-200">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {summary.role === "admin" ? "Admin" : "Collector"}
                      </span>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-white/46">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{summary.email}</span>
                    </span>
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/18 text-white/58">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              ) : null}

              <div className="mt-3 grid gap-3">
                {moreSections.map((section) => (
                  <section
                    key={section.label}
                    data-mobile-nav-card
                    className="border-t border-white/8 pt-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-white/48">
                        {section.label}
                      </p>
                    </div>

                    <div className="grid gap-0.5">
                      {section.items.map((item) => {
                        const active = isNavItemActive(
                          pathname,
                          collectionTab,
                          item.matches,
                          item.excludeMatches
                        );
                        const Icon = item.icon;

                        return (
                          <Link
                            key={`${section.label}:${item.href}:${item.label}`}
                            href={item.href}
                            prefetch={false}
                            onClick={closeMoreMenu}
                            aria-current={active ? "page" : undefined}
                            title={item.label}
                            className={`grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 transition-colors ${
                              active
                                ? "bg-violet-500/[0.16] text-violet-50 shadow-[inset_2px_0_0_rgba(179,155,255,0.58)]"
                                : "bg-transparent text-white/70 hover:bg-white/[0.045] hover:text-white"
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                active
                                  ? "bg-violet-500/[0.20] text-violet-100"
                                  : "bg-white/[0.035] text-white/46"
                              }`}
                            >
                              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 text-left">
                              <span className="block truncate text-[13px] font-black leading-tight">
                                {item.label}
                              </span>
                            </span>
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                active
                                  ? "bg-violet-500/[0.16] text-violet-100"
                                  : "text-white/34"
                              }`}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {moreOpen && accountPopupOpen && summary ? (
        <div
          data-mobile-account-popup
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 px-4 backdrop-blur-md md:hidden"
          onClick={() => {
            setAccountPopupOpen(false);
            setLogoutConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[24px] border border-violet-300/18 bg-[#08090d]/98 p-3 shadow-[0_28px_90px_rgba(124,92,255,0.22),0_28px_90px_rgba(0,0,0,0.72)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-200/58">Account</p>
                <p className="truncate text-sm font-black text-white">{accountName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAccountPopupOpen(false);
                  setLogoutConfirmOpen(false);
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-300/18 bg-violet-500/[0.09] text-violet-50"
                aria-label="Close account details"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(145deg,rgba(124,92,255,0.16),rgba(255,255,255,0.035))] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-violet-300/24 bg-violet-500/22 text-xl font-black text-violet-50 shadow-[0_0_28px_rgba(124,92,255,0.22)]">
                  {accountInitial}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-base font-black leading-tight text-white">{accountName}</p>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/18 bg-amber-400/[0.08] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-amber-200">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {summary.role === "admin" ? "Admin" : "Collector"}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-white/48">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{summary.email}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {[
                  ["Cards", cardsCount],
                  ["Wants", wantsCount],
                  ["Binders", summary.binders],
                  ["Sealed", summary.sealedUnits],
                  ["Selling", forSaleCardsCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/8 bg-black/18 px-2 py-2">
                    <p className="text-sm font-black leading-none text-white">{formatCount(Number(value))}</p>
                    <p className="mt-1 truncate text-[8px] font-bold uppercase tracking-[0.08em] text-white/40">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/account"
                prefetch={false}
                onClick={closeMoreMenu}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-500/[0.15] px-3 text-[12px] font-black text-violet-50"
              >
                <UserRound className="h-4 w-4" />
                Account
              </Link>
              <Link
                href="/settings"
                prefetch={false}
                onClick={closeMoreMenu}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 text-[12px] font-black text-white/74"
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Link>
            </div>

            <div className="mt-2 rounded-2xl border border-rose-300/12 bg-rose-500/[0.045] p-2">
              {logoutConfirmOpen ? (
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <p className="min-w-0 text-[10px] font-bold leading-snug text-rose-100/72">
                    Are you sure you want to log out?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLogoutConfirmOpen(false)}
                    className="min-h-11 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-xs font-black text-white/72"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      disabled={loggingOut}
                    className="min-h-11 rounded-xl border border-rose-300/20 bg-rose-500/[0.16] px-3 text-xs font-black text-rose-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {loggingOut ? "..." : "Log out"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-rose-100"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        data-mobile-bottom-nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-violet-300/12 bg-[linear-gradient(180deg,rgba(16,18,24,0.98),rgba(7,8,11,1))] px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_45px_rgba(0,0,0,0.58),0_-10px_42px_rgba(124,92,255,0.14)] md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(
              pathname,
              collectionTab,
              item.matches,
              item.excludeMatches
            );
            const Icon = item.icon;

            return (
              <Link
                key={`${item.href}:${item.label}`}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.05rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-[9px] font-semibold transition-colors min-[390px]:text-[10px] ${
                  active
                    ? "border-violet-300/35 bg-violet-500/[0.16] text-violet-50 shadow-[0_0_22px_rgba(124,92,255,0.18)]"
                    : "border-transparent text-white/45 hover:bg-violet-500/[0.08] hover:text-white/80"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? "text-violet-100 drop-shadow-[0_0_14px_rgba(124,92,255,0.36)]" : ""}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setAccountPopupOpen(false);
              setLogoutConfirmOpen(false);
              setMoreOpen((current) => !current);
            }}
            aria-expanded={moreOpen}
            className={`flex min-h-[3.05rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-[9px] font-semibold transition-colors hover:bg-violet-500/[0.08] hover:text-white/80 min-[390px]:text-[10px] ${
              moreActive
                ? "border-violet-300/35 bg-violet-500/[0.16] text-violet-50 shadow-[0_0_22px_rgba(124,92,255,0.18)]"
                : "border-transparent text-white/45"
            }`}
          >
            <MoreHorizontal
              className={`h-5 w-5 shrink-0 ${moreActive ? "text-violet-100 drop-shadow-[0_0_14px_rgba(124,92,255,0.36)]" : ""}`}
            />
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
