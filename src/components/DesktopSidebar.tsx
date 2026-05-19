"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  Brush,
  FolderOpen,
  Heart,
  Home,
  LibraryBig,
  LogOut,
  Mail,
  PackageOpen,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";

export interface DesktopSidebarSummary {
  cards: number;
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
      { href: "/movers", label: "Market", icon: BarChart3, badge: null, key: "market" },
      { href: "/deals", label: "Deals", icon: ShoppingBag, badge: null, key: "deals" },
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

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isActive(pathname: string, tab: string | null, key: string): boolean {
  if (key === "home") return pathname === "/" && (!tab || tab === "overview");
  if (key === "complete") return pathname === "/" && (tab === "complete" || tab === "cards");
  if (key === "singles") return pathname === "/" && tab === "singles";
  if (key === "binders") return (pathname === "/" && tab === "binders") || pathname.startsWith("/binders");
  if (key === "sealed") return pathname === "/" && tab === "sealed";
  if (key === "graded") return pathname === "/" && tab === "graded";
  if (key === "market") return pathname.startsWith("/movers");
  if (key === "expansions") return pathname.startsWith("/expansions");
  if (key === "one-piece") return pathname.startsWith("/one-piece");
  if (key === "categories") return pathname.startsWith("/categories");
  if (key === "illustrators") return pathname.startsWith("/illustrators");
  return pathname === `/${key}` || pathname.startsWith(`/${key}/`);
}

function navBadge(summary: DesktopSidebarSummary, badge: "cards" | "wants" | null) {
  if (badge === "cards") return formatCount(summary.cards);
  if (badge === "wants") return formatCount(summary.wants);
  return null;
}

export default function DesktopSidebar({ summary }: { summary: DesktopSidebarSummary }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const tab = useLiveCollectionTab();
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = getDisplayName(summary.email);
  const roleLabel = summary.role === "admin" ? "Admin" : "Collector";

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
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[15rem] border-r border-white/10 bg-[#070708]/88 px-3 py-3 shadow-[24px_0_60px_rgba(0,0,0,0.28)] backdrop-blur-xl xl:flex xl:flex-col">
      <Link href="/" prefetch={false} className="mb-3 flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500 text-sm font-black text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]">
          D
        </span>
        <span className="text-lg font-black tracking-tight text-white">DustyCards</span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav className="grid gap-2.5" aria-label="Desktop navigation">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="grid gap-0.5">
              <p className="px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/30">
                {section.label}
              </p>
              {section.items.map((item) => {
                const active = isActive(pathname, tab, item.key);
                const Icon = item.icon;
                const badge = navBadge(summary, item.badge);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-8 items-center gap-2.5 rounded-xl border px-3 text-[12px] font-semibold transition-colors ${
                      active
                        ? "border-white/14 bg-white/[0.075] text-white shadow-[inset_2px_0_0_rgba(255,255,255,0.42)]"
                        : "border-transparent text-white/58 hover:border-white/8 hover:bg-white/[0.055] hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {badge ? (
                      <span className="rounded-full border border-white/8 bg-white/[0.07] px-2 py-0.5 text-[10px] font-black text-white/62">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="my-2.5 h-px bg-white/8" />

        <nav className="grid gap-1" aria-label="Account navigation">
        {ACCOUNT_ITEMS.map((item) => {
          const active = isActive(pathname, tab, item.key);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`flex min-h-8 items-center gap-2.5 rounded-xl border px-3 text-[12px] font-semibold transition-colors ${
                active
                  ? "border-white/14 bg-white/[0.08] text-white"
                  : "border-transparent text-white/52 hover:border-white/8 hover:bg-white/[0.055] hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        </nav>
      </div>

      <div className="mt-2 rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.065] to-white/[0.025] p-2.5 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
        <div className="flex items-start gap-2.5">
          <Link
            href="/account"
            prefetch={false}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-500/18 text-sm font-black text-violet-100 shadow-[0_0_22px_rgba(139,92,246,0.22)] transition hover:bg-violet-500/24"
            aria-label="Open account"
            title="Open account"
          >
            {summary.email.slice(0, 1).toUpperCase()}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link
                href="/account"
                prefetch={false}
                className="truncate text-[13px] font-black leading-tight text-white transition hover:text-white/82"
              >
                {displayName}
              </Link>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/18 bg-emerald-400/[0.075] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-200">
                <ShieldCheck className="h-2.5 w-2.5" />
                {roleLabel}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-white/42">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{summary.email}</span>
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
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
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/30">
                {label}
              </p>
              <p className="mt-0.5 text-[13px] font-black tabular-nums text-white">
                {formatCount(Number(value))}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
          <Link
            href="/account"
            prefetch={false}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-3 text-[11px] font-black text-white/78 transition hover:border-white/18 hover:bg-white/[0.085] hover:text-white"
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-300/18 bg-rose-500/[0.075] px-3 text-[11px] font-black text-rose-100 transition hover:border-rose-300/28 hover:bg-rose-500/[0.13] disabled:cursor-wait disabled:opacity-60"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
            {loggingOut ? "..." : "Log out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
