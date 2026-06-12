"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  Brush,
  FolderOpen,
  Heart,
  Home,
  LibraryBig,
  LogOut,
  Mail,
  MoreHorizontal,
  PackageOpen,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import type { DesktopSidebarSummary } from "@/components/DesktopSidebar";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

const PRIMARY_NAV_ITEMS = [
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
      ],
    },
    {
      label: "Market",
      items: [
        { href: "/wants", label: "Wants", icon: Heart, matches: ["/wants"] },
        { href: "/movers", label: "Market", icon: TrendingUp, matches: ["/movers"] },
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

function isNavItemActive(pathname: string, collectionTab: string | null, matches: readonly string[]) {
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
  const moreSections = getMoreMenuSections(settings.onePieceLibraryEnabled);
  const primaryActive = PRIMARY_NAV_ITEMS.some((item) =>
    isNavItemActive(pathname, collectionTab, item.matches)
  );
  const moreActive = moreOpen || !primaryActive;
  useBodyScrollLock(moreOpen);
  const accountInitial = summary?.email.slice(0, 1).toUpperCase() ?? "D";
  const accountName = summary ? getDisplayName(summary.email) : "Account";

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

  return (
    <>
      {moreOpen && (
        <div
          data-mobile-more-backdrop
          className="fixed inset-0 z-[70] flex touch-none items-start justify-center bg-black/64 px-2 pb-[calc(5.4rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-sm md:hidden"
          onClick={closeMoreMenu}
        >
          <div
            data-mobile-more-sheet
            className="w-full max-w-md max-h-[calc(100dvh_-_6.2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] touch-pan-y overflow-y-auto overscroll-contain rounded-[22px] border border-violet-300/18 bg-[#070708]/98 p-2 shadow-[0_28px_90px_rgba(124,92,255,0.20),0_28px_90px_rgba(0,0,0,0.68)] [scrollbar-width:none] backdrop-blur-xl [&::-webkit-scrollbar]:hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-[#08090c]/96 px-3 py-2 backdrop-blur-xl">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-200/58">More</p>
                <p className="text-[10px] font-semibold text-white/38">All categories</p>
              </div>
              <button
                type="button"
                onClick={closeMoreMenu}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-300/18 bg-violet-500/[0.09] text-violet-50"
                aria-label="Close navigation menu"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid gap-3">
              {moreSections.map((section) => (
                <section
                  key={section.label}
                  data-mobile-nav-card
                  className="overflow-hidden rounded-[18px] border border-white/8 bg-white/[0.025]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/8 bg-white/[0.035] px-3.5 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.13em] text-violet-100/78">
                      {section.label}
                    </p>
                    <span className="rounded-full border border-white/10 bg-black/18 px-2 py-0.5 text-[9px] font-black text-white/42">
                      {section.items.length}
                    </span>
                  </div>

                  {summary && section.label === "Account" ? (
                    <div data-mobile-account-card className="border-b border-white/8 p-2">
                      <button
                        type="button"
                        onClick={openAccountPopup}
                        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-white/8 bg-black/16 p-2 text-left transition-colors hover:border-violet-300/18 hover:bg-violet-500/[0.08]"
                        aria-label="Open account details"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-300/22 bg-violet-500/20 text-sm font-black text-violet-50 shadow-[0_0_22px_rgba(124,92,255,0.20)]">
                          {accountInitial}
                        </span>
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[12px] font-black leading-tight text-white">{accountName}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/18 bg-amber-400/[0.075] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-amber-200">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              {summary.role === "admin" ? "Admin" : "Collector"}
                            </span>
                          </span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-semibold text-white/44">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{summary.email}</span>
                          </span>
                        </span>
                        <span className="rounded-full border border-violet-300/18 bg-violet-500/[0.10] px-2 py-1 text-[9px] font-black text-violet-100">
                          Open
                        </span>
                      </button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 p-2">
                    {section.items.map((item) => {
                      const active = isNavItemActive(pathname, collectionTab, item.matches);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={`${section.label}:${item.href}:${item.label}`}
                          href={item.href}
                          prefetch={false}
                          onClick={closeMoreMenu}
                          aria-current={active ? "page" : undefined}
                          title={item.label}
                          className={`flex min-h-9 min-w-0 items-center gap-2 rounded-xl border px-2 text-[10.5px] font-black leading-tight transition-colors ${
                            active
                              ? "border-violet-300/28 bg-violet-500/[0.18] text-violet-50 shadow-[inset_2px_0_0_rgba(124,92,255,0.58)]"
                              : "border-white/7 bg-black/12 text-white/58 hover:border-violet-300/16 hover:bg-violet-500/[0.08] hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active ? "text-violet-100 drop-shadow-[0_0_12px_rgba(124,92,255,0.36)]" : "text-white/42"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-left">{item.shortLabel ?? item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-300/18 bg-violet-500/[0.09] text-violet-50"
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
                  ["Cards", summary.cards],
                  ["Wants", summary.wants],
                  ["Binders", summary.binders],
                  ["Sealed", summary.sealedUnits],
                  ["Selling", summary.forSaleCards],
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
                    Zeker weten dat je wilt uitloggen?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLogoutConfirmOpen(false)}
                      className="h-8 rounded-xl border border-white/10 bg-white/[0.055] px-2 text-[10px] font-black text-white/72"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      disabled={loggingOut}
                      className="h-8 rounded-xl border border-rose-300/20 bg-rose-500/[0.16] px-2 text-[10px] font-black text-rose-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {loggingOut ? "..." : "Log out"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-black text-rose-100"
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
            const active = isNavItemActive(pathname, collectionTab, item.matches);
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
              setMoreOpen(true);
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
