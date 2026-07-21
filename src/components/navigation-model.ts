import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Brush,
  FolderOpen,
  Heart,
  Home,
  LibraryBig,
  PackageOpen,
  Radar,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { GAME_SEARCH_PARAM } from "@/lib/games";

export interface NavigationSummary {
  cards: number;
  forSaleCards: number;
  binders: number;
  sealedUnits: number;
  wants: number;
  email: string;
  role: "admin" | "user";
}

export type NavigationBadge = "cards" | "forSale" | "wants" | null;
export type NavigationMarketMode = "raw" | "graded" | "targets" | "sealed";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge: NavigationBadge;
  key: string;
  marketMode?: NavigationMarketMode;
}

export interface NavigationSection {
  label: "Collection" | "Browse" | "Market";
  items: readonly NavigationItem[];
}

export const NAVIGATION_SECTIONS: readonly NavigationSection[] = [
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
      { href: "/wants", label: "Wants", icon: Heart, badge: "wants", key: "wants" },
      { href: "/social", label: "Social", icon: UsersRound, badge: null, key: "social" },
    ],
  },
  {
    label: "Browse",
    items: [
      { href: "/expansions", label: "Pokémon Sets", icon: FolderOpen, badge: null, key: "expansions" },
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
  {
    label: "Market",
    items: [
      { href: "/movers", label: "Raw", icon: BarChart3, badge: null, key: "market-raw", marketMode: "raw" },
      { href: "/movers?scope=graded", label: "Graded", icon: LibraryBig, badge: null, key: "market-graded", marketMode: "graded" },
      { href: "/movers?scope=grading", label: "Targets", icon: Sparkles, badge: null, key: "market-targets", marketMode: "targets" },
      { href: "/movers?scope=sealed", label: "Sealed", icon: PackageOpen, badge: null, key: "market-sealed", marketMode: "sealed" },
      { href: "/movers/signal-radar", label: "Signal Radar", icon: Radar, badge: null, key: "market-radar" },
      { href: "/?tab=selling", label: "For Sale", icon: ShoppingBag, badge: "forSale", key: "selling" },
    ],
  },
];

export const NAVIGATION_ACCOUNT_ITEMS: readonly NavigationItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, badge: null, key: "settings" },
  { href: "/account", label: "Account", icon: UserRound, badge: null, key: "account" },
];

export function formatNavigationCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function getNavigationDisplayName(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Dusty";

  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

export function isNavigationItemActive(
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
    return (
      pathname.startsWith("/movers") &&
      !pathname.startsWith("/movers/signal-radar") &&
      !["graded", "grading", "sealed", "value"].includes(moverScope ?? "")
    );
  }
  if (key === "market-graded") return pathname.startsWith("/movers") && moverScope === "graded";
  if (key === "market-targets") return pathname.startsWith("/movers") && moverScope === "grading";
  if (key === "market-sealed") return pathname.startsWith("/movers") && moverScope === "sealed";
  if (key === "market-radar") return pathname.startsWith("/movers/signal-radar");
  if (key === "expansions") return pathname.startsWith("/expansions");
  if (key === "one-piece") return pathname.startsWith("/one-piece");
  if (key === "categories") return pathname.startsWith("/categories");
  if (key === "illustrators") return pathname.startsWith("/illustrators");
  return pathname === `/${key}` || pathname.startsWith(`/${key}/`);
}

export function getNavigationBadge(
  badge: NavigationBadge,
  cardsCount: number,
  forSaleCardsCount: number,
  wantsCount: number
): string | null {
  if (badge === "cards") return formatNavigationCount(cardsCount);
  if (badge === "forSale") {
    return forSaleCardsCount > 0 ? formatNavigationCount(forSaleCardsCount) : null;
  }
  if (badge === "wants") return formatNavigationCount(wantsCount);
  return null;
}

interface NavigationSearchParams {
  get(name: string): string | null;
}

export function buildNavigationMarketHref(
  mode: NavigationMarketMode,
  pathname: string,
  searchParams: NavigationSearchParams
): string {
  const params = new URLSearchParams();
  const game = searchParams.get(GAME_SEARCH_PARAM);
  const source = searchParams.get("source");
  const trend = searchParams.get("trend");
  const moverScope = searchParams.get("scope");
  const moverView = searchParams.get("view");
  const collectionScope =
    moverScope === "all" || moverView === "all"
      ? "all"
      : moverScope === "collection" ||
          moverView === "collection" ||
          (pathname.startsWith("/movers") && !moverScope)
        ? "collection"
        : "all";

  if (game) params.set(GAME_SEARCH_PARAM, game);
  if (source) params.set("source", source);
  if (trend && (mode === "raw" || mode === "graded")) params.set("trend", trend);

  if (mode === "raw") {
    params.set("scope", collectionScope === "all" ? "all" : "collection");
  } else if (mode === "graded") {
    params.set("scope", "graded");
    if (collectionScope === "collection") params.set("view", "collection");
  } else if (mode === "targets") {
    params.set("scope", "grading");
    if (collectionScope === "collection") params.set("view", "collection");
  } else {
    params.set("scope", "sealed");
    if (collectionScope === "collection") params.set("view", "collection");
  }

  return `/movers?${params.toString()}`;
}
