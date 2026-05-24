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
  const [activeMoreSection, setActiveMoreSection] = useState("Browse");
  const [loggingOut, setLoggingOut] = useState(false);
  const moreSections = getMoreMenuSections(settings.onePieceLibraryEnabled);
  const primaryActive = PRIMARY_NAV_ITEMS.some((item) =>
    isNavItemActive(pathname, collectionTab, item.matches)
  );
  const moreActive = moreOpen || !primaryActive;
  useBodyScrollLock(moreOpen);
  const defaultMoreSection =
    moreSections.find((section) =>
      section.items.some((item) => isNavItemActive(pathname, collectionTab, item.matches))
    )?.label ?? "Browse";
  const visibleMoreSection =
    moreSections.find((section) => section.label === activeMoreSection) ?? moreSections[0];

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
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-[70] touch-none bg-black/64 backdrop-blur-sm md:hidden"
          onClick={() => {
            setMoreOpen(false);
          }}
        >
          <div
            className="absolute inset-x-2 bottom-[calc(4.15rem+env(safe-area-inset-bottom))] max-h-[min(58dvh,30rem)] touch-pan-y overflow-y-auto overscroll-contain rounded-[22px] border border-violet-300/18 bg-[#070708]/98 p-2 shadow-[0_28px_90px_rgba(88,28,135,0.28),0_28px_90px_rgba(0,0,0,0.68)] [scrollbar-width:none] backdrop-blur-xl [&::-webkit-scrollbar]:hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-200/58">More</p>
                <p className="text-[10px] font-semibold text-white/38">Navigate</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-300/18 bg-violet-500/[0.09] text-violet-50"
                aria-label="Close navigation menu"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {summary ? (
              <div className="mb-2 rounded-[16px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <Link
                    href="/account"
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-300/18 bg-violet-500/18 text-[11px] font-black text-violet-100 shadow-[0_0_18px_rgba(139,92,246,0.18)]"
                    aria-label="Open account"
                  >
                    {summary.email.slice(0, 1).toUpperCase()}
                  </Link>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href="/account"
                        prefetch={false}
                        onClick={() => setMoreOpen(false)}
                        className="truncate text-[12px] font-black leading-tight text-white"
                      >
                        {getDisplayName(summary.email)}
                      </Link>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/18 bg-emerald-400/[0.075] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-200">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {summary.role === "admin" ? "Admin" : "Collector"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[8.5px] font-semibold text-white/38">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{summary.email}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[8.5px] font-bold text-white/38">
                      {formatCount(summary.cards)} cards / {formatCount(summary.forSaleCards)} for sale / {formatCount(summary.wants)} wants / {formatCount(summary.binders)} binders / {formatCount(summary.sealedUnits)} sealed
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={loggingOut}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-300/18 bg-rose-500/[0.075] px-2 text-[9px] font-black text-rose-100 disabled:cursor-wait disabled:opacity-60"
                    aria-label="Log out"
                  >
                    <LogOut className="h-3 w-3" />
                    {loggingOut ? "..." : "Log out"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mb-1.5 grid grid-cols-4 gap-1 rounded-2xl border border-white/8 bg-white/[0.035] p-1">
              {moreSections.map((section) => {
                const active = section.label === visibleMoreSection?.label;
                return (
                  <button
                    key={section.label}
                    type="button"
                    onClick={() => setActiveMoreSection(section.label)}
                    className={`min-h-7 rounded-xl px-1 text-[9px] font-black uppercase tracking-[0.08em] transition-colors ${
                      active
                        ? "bg-violet-500/[0.22] text-violet-50 shadow-[0_0_18px_rgba(139,92,246,0.16)]"
                        : "text-white/38 hover:bg-white/[0.055] hover:text-white/72"
                    }`}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-[18px] border border-white/8 bg-white/[0.025] p-1.5">
              {visibleMoreSection?.items.map((item) => {
                const active = isNavItemActive(pathname, collectionTab, item.matches);
                const Icon = item.icon;

                return (
                  <Link
                    key={`${visibleMoreSection.label}:${item.href}:${item.label}`}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    className={`flex min-h-9 min-w-0 items-center gap-2 rounded-xl border px-2 text-[10.5px] font-black leading-tight transition-colors ${
                      active
                        ? "border-violet-300/28 bg-violet-500/[0.18] text-violet-50 shadow-[inset_2px_0_0_rgba(168,85,247,0.58)]"
                        : "border-white/7 bg-black/12 text-white/58 hover:border-violet-300/16 hover:bg-violet-500/[0.08] hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-violet-100 drop-shadow-[0_0_12px_rgba(168,85,247,0.42)]" : "text-white/42"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-left">{item.shortLabel ?? item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-violet-300/12 bg-[linear-gradient(180deg,rgba(8,8,10,0.98),rgba(5,5,6,1))] px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_45px_rgba(0,0,0,0.58),0_-10px_42px_rgba(88,28,135,0.14)] md:hidden"
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
                    ? "border-violet-300/35 bg-violet-500/[0.16] text-violet-50 shadow-[0_0_22px_rgba(139,92,246,0.18)]"
                    : "border-transparent text-white/45 hover:bg-violet-500/[0.08] hover:text-white/80"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? "text-violet-100 drop-shadow-[0_0_14px_rgba(168,85,247,0.45)]" : ""}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setActiveMoreSection(defaultMoreSection);
              setMoreOpen(true);
            }}
            aria-expanded={moreOpen}
            className={`flex min-h-[3.05rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-[9px] font-semibold transition-colors hover:bg-violet-500/[0.08] hover:text-white/80 min-[390px]:text-[10px] ${
              moreActive
                ? "border-violet-300/35 bg-violet-500/[0.16] text-violet-50 shadow-[0_0_22px_rgba(139,92,246,0.18)]"
                : "border-transparent text-white/45"
            }`}
          >
            <MoreHorizontal
              className={`h-5 w-5 shrink-0 ${moreActive ? "text-violet-100 drop-shadow-[0_0_14px_rgba(168,85,247,0.45)]" : ""}`}
            />
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
