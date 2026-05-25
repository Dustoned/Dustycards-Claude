"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  Brush,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Heart,
  Home,
  LibraryBig,
  LogOut,
  PackageOpen,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";
import { GAME_SEARCH_PARAM } from "@/lib/games";

export interface DesktopSidebarSummary {
  cards: number;
  forSaleCards: number;
  binders: number;
  sealedUnits: number;
  wants: number;
  email: string;
  role: "admin" | "user";
}

const NAV_SECTIONS = [
  {
    label: "Collection",
    items: [
      { href: "/", label: "Home", icon: Home, badge: null, key: "home" },
      {
        href: "/?tab=complete",
        label: "Complete Collection",
        icon: LibraryBig,
        badge: "cards",
        key: "complete",
      },
      { href: "/?tab=singles", label: "Loose Singles", icon: Sparkles, badge: null, key: "singles" },
      { href: "/?tab=binders", label: "Binders", icon: Boxes, badge: null, key: "binders" },
      { href: "/?tab=sealed", label: "Sealed", icon: PackageOpen, badge: null, key: "sealed" },
      { href: "/?tab=graded", label: "Graded", icon: LibraryBig, badge: null, key: "graded" },
    ],
  },
  {
    label: "Wants",
    items: [
      { href: "/wants", label: "Wants", icon: Heart, badge: "wants", key: "wants" },
    ],
  },
  {
    label: "Market",
    items: [
      { href: "/movers", label: "Raw", icon: BarChart3, badge: null, key: "market-raw", marketMode: "raw" },
      { href: "/movers?scope=graded", label: "Graded", icon: LibraryBig, badge: null, key: "market-graded", marketMode: "graded" },
      { href: "/movers?scope=grading", label: "Targets", icon: Sparkles, badge: null, key: "market-targets", marketMode: "targets" },
      { href: "/movers?scope=sealed", label: "Sealed", icon: PackageOpen, badge: null, key: "market-sealed", marketMode: "sealed" },
      { href: "/?tab=selling", label: "For Sale", icon: ShoppingBag, badge: "forSale", key: "selling" },
    ],
  },
  {
    label: "Browse",
    items: [
      { href: "/expansions", label: "Pokemon Sets", icon: FolderOpen, badge: null, key: "expansions" },
      {
        href: "/one-piece/expansions",
        label: "One Piece Sets",
        icon: FolderOpen,
        badge: null,
        key: "one-piece",
      },
      { href: "/categories", label: "Categories", icon: Sparkles, badge: null, key: "categories" },
      { href: "/illustrators", label: "Illustrators", icon: Brush, badge: null, key: "illustrators" },
      { href: "/submit-card", label: "Submit Card", icon: Search, badge: null, key: "submit-card" },
    ],
  },
] as const;

const ACCOUNT_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
  { href: "/account", label: "Account", icon: UserRound, key: "account" },
] as const;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function getDisplayName(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Dusty";

  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

type SidebarMarketMode = "raw" | "graded" | "targets" | "sealed";

function isActive(
  pathname: string,
  tab: string | null,
  key: string,
  moverScope?: string | null
): boolean {
  if (key === "home") return pathname === "/" && (!tab || tab === "overview");
  if (key === "complete") return pathname === "/" && (tab === "complete" || tab === "cards");
  if (key === "singles") return pathname === "/" && tab === "singles";
  if (key === "binders") return (pathname === "/" && tab === "binders") || pathname.startsWith("/binders");
  if (key === "sealed") return pathname === "/" && tab === "sealed";
  if (key === "graded") return pathname === "/" && tab === "graded";
  if (key === "selling") return pathname === "/" && tab === "selling";
  if (key === "market-raw") {
    return pathname.startsWith("/movers") && !["graded", "grading", "sealed", "value"].includes(moverScope ?? "");
  }
  if (key === "market-graded") return pathname.startsWith("/movers") && moverScope === "graded";
  if (key === "market-targets") return pathname.startsWith("/movers") && moverScope === "grading";
  if (key === "market-sealed") return pathname.startsWith("/movers") && moverScope === "sealed";
  if (key === "expansions") return pathname.startsWith("/expansions");
  if (key === "one-piece") return pathname.startsWith("/one-piece");
  if (key === "categories") return pathname.startsWith("/categories");
  if (key === "illustrators") return pathname.startsWith("/illustrators");
  return pathname === `/${key}` || pathname.startsWith(`/${key}/`);
}

function navBadge(summary: DesktopSidebarSummary, badge: "cards" | "forSale" | "wants" | null) {
  if (badge === "cards") return formatCount(summary.cards);
  if (badge === "forSale") return summary.forSaleCards > 0 ? formatCount(summary.forSaleCards) : null;
  if (badge === "wants") return formatCount(summary.wants);
  return null;
}

export default function DesktopSidebar({ summary }: { summary: DesktopSidebarSummary }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = useLiveCollectionTab();
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = getDisplayName(summary.email);
  const roleLabel = summary.role === "admin" ? "Admin" : "Collector";
  const moverScope = searchParams.get("scope");
  const moverView = searchParams.get("view");
  const currentMarketItemScope =
    moverScope === "all" || moverView === "all"
      ? "all"
      : moverScope === "collection" || moverView === "collection" || (pathname.startsWith("/movers") && !moverScope)
        ? "collection"
        : "all";

  function buildMarketModeHref(mode: SidebarMarketMode): string {
    const params = new URLSearchParams();
    const game = searchParams.get(GAME_SEARCH_PARAM);
    const source = searchParams.get("source");
    const trend = searchParams.get("trend");

    if (game) params.set(GAME_SEARCH_PARAM, game);
    if (source) params.set("source", source);
    if (trend && (mode === "raw" || mode === "graded")) params.set("trend", trend);

    if (mode === "raw") {
      params.set("scope", currentMarketItemScope === "all" ? "all" : "collection");
    } else if (mode === "graded") {
      params.set("scope", "graded");
      if (currentMarketItemScope === "collection") params.set("view", "collection");
    } else if (mode === "targets") {
      params.set("scope", "grading");
      if (currentMarketItemScope === "collection") params.set("view", "collection");
    } else {
      params.set("scope", "sealed");
      if (currentMarketItemScope === "collection") params.set("view", "collection");
    }

    return `/movers?${params.toString()}`;
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
    }
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden h-dvh w-[16rem] border-r border-white/8 bg-[#08080c] xl:block">
      <div className="flex h-[calc(100dvh-5.25rem)] min-h-0 flex-col overflow-y-auto overscroll-contain px-3 py-4 pr-2.5 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent">
        <Link href="/" prefetch={false} className="mb-5 flex shrink-0 items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500 text-base font-black text-white shadow-[0_0_22px_rgba(124,92,255,0.34)]">
            D
          </span>
          <span className="text-[19px] font-black tracking-tight text-white">DustyCards</span>
        </Link>

        <nav className="grid gap-4" aria-label="Desktop navigation">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="grid gap-px">
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                {section.label}
              </p>
              {section.items.map((item) => {
                const active = isActive(pathname, tab, item.key, moverScope);
                const Icon = item.icon;
                const badge = navBadge(summary, item.badge);
                const href =
                  "marketMode" in item ? buildMarketModeHref(item.marketMode) : item.href;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    data-sidebar-item
                    data-active={active ? "true" : "false"}
                    className={`group flex min-h-[34px] items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                      active
                        ? "text-white shadow-[inset_0_0_0_1px_rgba(179,155,255,0.28),0_0_22px_rgba(124,92,255,0.18)]"
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
        className="fixed bottom-3 left-3 z-[70] w-[14.5rem]"
      >
        {accountOpen ? (
          <div
            id="desktop-account-panel"
            data-sidebar-card
            className="mb-2 rounded-2xl border border-white/10 p-2.5 shadow-2xl shadow-black/45 backdrop-blur-xl"
          >
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["Cards", summary.cards],
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
                    {formatCount(Number(value))}
                  </p>
                </div>
              ))}
            </div>

            <nav className="mt-2 grid gap-px border-t border-white/8 pt-2" aria-label="Account navigation">
              {ACCOUNT_ITEMS.map((item) => {
                const active = isActive(pathname, tab, item.key, moverScope);
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
                        ? "text-white shadow-[inset_0_0_0_1px_rgba(179,155,255,0.28),0_0_18px_rgba(124,92,255,0.14)]"
                        : "text-white/62 hover:text-white"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-violet-200" : "text-white/55"}`} />
                    {item.label}
                  </Link>
                );
              })}
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

        <button
          type="button"
          data-sidebar-card
          aria-expanded={accountOpen}
          aria-controls="desktop-account-panel"
          onClick={() => setAccountOpen((current) => !current)}
          className="flex w-full items-center gap-2 rounded-2xl border border-white/10 p-2 text-left shadow-2xl shadow-black/45 backdrop-blur-xl transition-colors hover:border-white/16 hover:bg-white/[0.035]"
        >
          <span
            data-sidebar-avatar
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-violet-100 shadow-[0_0_18px_rgba(124,92,255,0.22)]"
          >
            {summary.email.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12px] font-black leading-tight text-white">
                {displayName}
              </span>
              <span
                data-sidebar-badge-admin
                className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-amber-200"
              >
                {roleLabel === "Admin" ? "ADMIN" : "USER"}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/44">
              {formatCount(summary.cards)} cards
            </span>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] text-white/58">
            {accountOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </span>
        </button>
      </div>
    </aside>
  );
}
