"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  Brush,
  ChevronDown,
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

const PRIMARY_NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home, matches: ["home"] },
  {
    href: "/?tab=complete",
    label: "Collection",
    icon: LibraryBig,
    matches: ["tab:complete", "tab:cards", "tab:singles", "tab:binders", "tab:sealed", "tab:graded", "/binders"],
  },
  { href: "/wants", label: "Wants", icon: Heart, matches: ["/wants"] },
  { href: "/movers", label: "Market", icon: TrendingUp, matches: ["/movers"] },
] as const;

type MobileNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matches: readonly string[];
  kind?: "link";
};

type MobileExpansionChooserItem = {
  label: "Expansions";
  icon: typeof FolderOpen;
  matches: readonly string[];
  kind: "expansion-chooser";
};

type MobileSectionItem = MobileNavItem | MobileExpansionChooserItem;

type MobileSection = {
  label: string;
  items: readonly MobileSectionItem[];
};

function getMobileSections(onePieceEnabled: boolean): readonly MobileSection[] {
  const expansionItem: MobileSectionItem = onePieceEnabled
    ? {
        kind: "expansion-chooser",
        label: "Expansions",
        icon: FolderOpen,
        matches: ["/expansions", "/one-piece"],
      }
    : {
        href: "/expansions",
        label: "Expansions",
        icon: FolderOpen,
        matches: ["/expansions"],
      };

  return [
  {
    label: "Browse",
    items: [
      { href: "/search", label: "Search", icon: Search, matches: ["/search"] },
      expansionItem,
      { href: "/categories", label: "Categories", icon: Sparkles, matches: ["/categories"] },
      { href: "/illustrators", label: "Illustrators", icon: Brush, matches: ["/illustrators"] },
    ],
  },
  {
    label: "Collection",
    items: [
      { href: "/", label: "Home", icon: Home, matches: ["home"] },
      {
        href: "/?tab=complete",
        label: "Complete Collection",
        icon: LibraryBig,
        matches: ["tab:complete", "tab:cards"],
      },
      { href: "/?tab=singles", label: "Loose Singles", icon: Sparkles, matches: ["tab:singles"] },
      { href: "/?tab=binders", label: "Binders", icon: Boxes, matches: ["tab:binders", "/binders"] },
      { href: "/?tab=sealed", label: "Sealed", icon: PackageOpen, matches: ["tab:sealed"] },
      { href: "/?tab=graded", label: "Graded", icon: LibraryBig, matches: ["tab:graded"] },
    ],
  },
  {
    label: "Wants",
    items: [{ href: "/wants", label: "Wants", icon: Heart, matches: ["/wants"] }],
  },
  {
    label: "Market",
    items: [
      { href: "/movers", label: "Market", icon: TrendingUp, matches: ["/movers"] },
      { href: "/deals", label: "Deals", icon: ShoppingBag, matches: ["/deals"] },
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
  const [expansionsOpen, setExpansionsOpen] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const mobileSections = getMobileSections(settings.onePieceLibraryEnabled);
  const primaryActive = PRIMARY_NAV_ITEMS.some((item) =>
    isNavItemActive(pathname, collectionTab, item.matches)
  );
  const moreActive = moreOpen || !primaryActive;

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
          className="fixed inset-0 z-[70] bg-black/52 backdrop-blur-sm md:hidden"
          onClick={() => {
            setMoreOpen(false);
            setExpansionsOpen(false);
          }}
        >
          <div
            className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-h-[min(76dvh,44rem)] overflow-y-auto rounded-[24px] border border-white/10 bg-[#070708]/97 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.68)] [scrollbar-width:none] backdrop-blur-xl [&::-webkit-scrollbar]:hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-sm font-black text-white">DustyCards</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-white/42">
                  Mobile collection menu
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setExpansionsOpen(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/70"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {summary ? (
              <div className="mb-3 rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.025] p-2.5 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
                <div className="flex items-start gap-2.5">
                  <Link
                    href="/account"
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-500/18 text-sm font-black text-violet-100 shadow-[0_0_22px_rgba(139,92,246,0.22)]"
                    aria-label="Open account"
                  >
                    {summary.email.slice(0, 1).toUpperCase()}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href="/account"
                        prefetch={false}
                        onClick={() => setMoreOpen(false)}
                        className="truncate text-[13px] font-black leading-tight text-white"
                      >
                        {getDisplayName(summary.email)}
                      </Link>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/18 bg-emerald-400/[0.075] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-200">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {summary.role === "admin" ? "Admin" : "Collector"}
                      </span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-white/42">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{summary.email}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[
                    ["Cards", summary.cards],
                    ["Wants", summary.wants],
                    ["Binders", summary.binders],
                    ["Sealed", summary.sealedUnits],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/8 bg-black/22 px-2 py-1.5"
                    >
                      <p className="truncate text-[8px] font-black uppercase tracking-[0.1em] text-white/30">
                        {label}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] font-black tabular-nums text-white">
                        {formatCount(Number(value))}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                  <Link
                    href="/account"
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-3 text-[11px] font-black text-white/78"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={loggingOut}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-300/18 bg-rose-500/[0.075] px-3 text-[11px] font-black text-rose-100 disabled:cursor-wait disabled:opacity-60"
                    aria-label="Log out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {loggingOut ? "..." : "Log out"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2.5">
              {mobileSections.map((section) => (
                <section key={section.label} className="rounded-2xl border border-white/8 bg-white/[0.028] p-2">
                  <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/34">
                    {section.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {section.items.map((item) => {
                      const active = isNavItemActive(pathname, collectionTab, item.matches);
                      const Icon = item.icon;

                      if (item.kind === "expansion-chooser") {
                        return (
                          <div
                            key={`${section.label}:expansions`}
                            className="col-span-2 grid gap-1 rounded-xl border border-white/7 bg-black/18 p-1"
                          >
                            <button
                              type="button"
                              onClick={() => setExpansionsOpen((current) => !current)}
                              aria-expanded={expansionsOpen}
                                  className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2.5 text-left text-xs font-bold transition-colors ${
                                    active
                                  ? "border-white/16 bg-white/[0.08] text-white"
                                  : "border-transparent text-white/62 hover:border-white/10 hover:bg-white/[0.055] hover:text-white"
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">Expansions</span>
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 transition-transform ${expansionsOpen ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </button>

                            {expansionsOpen ? (
                              <div className="grid grid-cols-2 gap-1">
                                <Link
                                  href="/expansions"
                                  prefetch={false}
                                  onClick={() => setMoreOpen(false)}
                                  aria-current={isActive(pathname, ["/expansions"]) ? "page" : undefined}
                                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition-colors ${
                                    isActive(pathname, ["/expansions"])
                                      ? "border-white/16 bg-white/[0.09] text-white"
                                      : "border-white/8 bg-white/[0.035] text-white/64 hover:bg-white/[0.07] hover:text-white"
                                  }`}
                                >
                                  Pokemon
                                </Link>
                                <Link
                                  href="/one-piece/expansions"
                                  prefetch={false}
                                  onClick={() => setMoreOpen(false)}
                                  aria-current={isActive(pathname, ["/one-piece"]) ? "page" : undefined}
                                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition-colors ${
                                    isActive(pathname, ["/one-piece"])
                                      ? "border-white/16 bg-white/[0.09] text-white"
                                      : "border-white/8 bg-white/[0.035] text-white/64 hover:bg-white/[0.07] hover:text-white"
                                  }`}
                                >
                                  One Piece
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={`${section.label}:${item.href}:${item.label}`}
                          href={item.href}
                          prefetch={false}
                          onClick={() => {
                            setMoreOpen(false);
                            setExpansionsOpen(false);
                          }}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2.5 text-xs font-bold transition-colors ${
                            active
                              ? "border-white/16 bg-white/[0.08] text-white"
                              : "border-transparent text-white/62 hover:border-white/10 hover:bg-white/[0.055] hover:text-white"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">{item.label}</span>
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

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#070707]/90 px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_45px_rgba(0,0,0,0.46)] backdrop-blur-xl md:hidden"
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
                    ? "border-white/10 bg-white/[0.085] text-white"
                    : "border-transparent text-white/45 hover:bg-white/[0.055] hover:text-white/80"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? "drop-shadow-[0_0_10px_rgba(255,255,255,0.16)]" : ""}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setMoreOpen(true);
              setExpansionsOpen(settings.onePieceLibraryEnabled);
            }}
            aria-expanded={moreOpen}
            className={`flex min-h-[3.05rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-[9px] font-semibold transition-colors hover:bg-white/[0.055] hover:text-white/80 min-[390px]:text-[10px] ${
              moreActive ? "border-white/10 bg-white/[0.085] text-white" : "border-transparent text-white/45"
            }`}
          >
            <MoreHorizontal
              className={`h-5 w-5 shrink-0 ${moreActive ? "drop-shadow-[0_0_10px_rgba(255,255,255,0.16)]" : ""}`}
            />
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
