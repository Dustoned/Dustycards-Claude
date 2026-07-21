"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";
import {
  buildNavigationMarketHref,
  formatNavigationCount,
  getNavigationBadge,
  getNavigationDisplayName,
  isNavigationItemActive,
  NAVIGATION_ACCOUNT_ITEMS,
  NAVIGATION_SECTIONS,
  type NavigationItem,
  type NavigationSummary,
} from "@/components/navigation-model";
import {
  COLLECTION_CARD_ADDED_EVENT,
  getCollectionCardAddedEffects,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";
import { WANTS_CHANGED_EVENT } from "@/lib/wants-client-events";

interface NavItem {
  href: string;
  label: string;
  /** Pathname prefixes that should mark this link active. */
  matches: ReadonlyArray<string>;
  /** Descendants that belong to a separate child navigation item. */
  excludeMatches?: ReadonlyArray<string>;
}

const HOME_ITEM: NavItem = {
  href: "/",
  label: "Home",
  matches: ["home"],
};

const WANTS_ITEM: NavItem = {
  href: "/wants",
  label: "Wants",
  matches: ["/wants"],
};

const COLLECTION_CARDS_ITEM: NavItem = {
  href: "/?tab=complete",
  label: "Complete Collection",
  matches: ["tab:complete", "tab:cards"],
};

const COLLECTION_SINGLES_ITEM: NavItem = {
  href: "/?tab=singles",
  label: "Loose Singles",
  matches: ["tab:singles"],
};

const COLLECTION_BINDERS_ITEM: NavItem = {
  href: "/?tab=binders",
  label: "Binders",
  matches: ["tab:binders", "/binders"],
};

const COLLECTION_SEALED_ITEM: NavItem = {
  href: "/?tab=sealed",
  label: "Sealed",
  matches: ["tab:sealed"],
};

const COLLECTION_GRADED_ITEM: NavItem = {
  href: "/?tab=graded",
  label: "Graded",
  matches: ["tab:graded"],
};

const COLLECTION_SELLING_ITEM: NavItem = {
  href: "/?tab=selling",
  label: "For Sale",
  matches: ["tab:selling"],
};

const SEARCH_ITEM: NavItem = {
  href: "/search",
  label: "Search",
  matches: ["/search"],
};

const MARKET_ITEM: NavItem = {
  href: "/movers",
  label: "Market",
  matches: ["/movers"],
  excludeMatches: ["/movers/signal-radar"],
};

const SIGNAL_RADAR_ITEM: NavItem = {
  href: "/movers/signal-radar",
  label: "Signal Radar",
  matches: ["/movers/signal-radar"],
};

const BASE_BROWSE_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/expansions", label: "Expansions", matches: ["/expansions"] },
  { href: "/categories", label: "Categories", matches: ["/categories"] },
  { href: "/reprints", label: "Reprints", matches: ["/reprints"] },
  { href: "/illustrators", label: "Illustrators", matches: ["/illustrators"] },
];

const ONE_PIECE_BROWSE_ITEM: NavItem = {
  href: "/one-piece/expansions",
  label: "One Piece Sets",
  matches: ["/one-piece"],
};

const SUBMIT_CARD_ITEM: NavItem = {
  href: "/submit-card",
  label: "Submit Card",
  matches: ["/submit-card"],
};

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  matches: ["/settings"],
};

const ACCOUNT_ITEM: NavItem = {
  href: "/account",
  label: "Account",
  matches: ["/account"],
};

function isActive(
  pathname: string,
  matches: ReadonlyArray<string>,
  excludeMatches: ReadonlyArray<string> = []
): boolean {
  const excluded = excludeMatches.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (excluded) return false;

  return matches.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isTopLevelActive(pathname: string, tab: string | null, item: NavItem): boolean {
  const tabMatches = item.matches
    .filter((match) => match.startsWith("tab:"))
    .map((match) => match.slice(4));

  if (tabMatches.length > 0) {
    const matchesTab = tabMatches.some((targetTab) =>
      targetTab === "overview" ? !tab || tab === "overview" : tab === targetTab
    );
    const matchesPath = item.matches
      .filter((match) => !match.startsWith("tab:"))
      .some((match) => isActive(pathname, [match]));

    return (pathname === "/" && matchesTab) || matchesPath;
  }

  if (item.matches[0] === "home") {
    return pathname === "/" && (!tab || tab === "overview");
  }

  if (item.matches[0] === "collection") {
    return (
      pathname === "/binders" ||
      pathname.startsWith("/binders/") ||
      (pathname === "/" && Boolean(tab && tab !== "overview" && tab !== "selling"))
    );
  }

  if (item.href === "/movers") {
    return isActive(pathname, item.matches, item.excludeMatches);
  }

  return isActive(pathname, item.matches, item.excludeMatches);
}

function getMobileSections(onePieceEnabled: boolean): ReadonlyArray<{
  label: string;
  items: ReadonlyArray<NavItem>;
}> {
  return [
    {
      label: "Collection",
      items: [
        HOME_ITEM,
        COLLECTION_CARDS_ITEM,
        COLLECTION_SINGLES_ITEM,
        COLLECTION_BINDERS_ITEM,
        COLLECTION_SEALED_ITEM,
        COLLECTION_GRADED_ITEM,
        WANTS_ITEM,
      ],
    },
    {
      label: "Browse",
      items: onePieceEnabled
        ? [SEARCH_ITEM, ...BASE_BROWSE_ITEMS, ONE_PIECE_BROWSE_ITEM, SUBMIT_CARD_ITEM]
        : [SEARCH_ITEM, ...BASE_BROWSE_ITEMS, SUBMIT_CARD_ITEM],
    },
    { label: "Market", items: [MARKET_ITEM, SIGNAL_RADAR_ITEM, COLLECTION_SELLING_ITEM] },
    { label: "Account", items: [ACCOUNT_ITEM, SETTINGS_ITEM] },
  ];
}

type DesktopMenuGroup = {
  label: string;
  items: readonly NavigationItem[];
};

const ALL_NAVIGATION_ITEMS = NAVIGATION_SECTIONS.flatMap((section) => section.items);

function getNavigationItem(key: string): NavigationItem {
  const item = ALL_NAVIGATION_ITEMS.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Missing navigation item: ${key}`);
  return item;
}

const DESKTOP_HOME_ITEM = getNavigationItem("home");
const DESKTOP_RADAR_ITEM = getNavigationItem("market-radar");

function getDesktopMenuGroups(onePieceEnabled: boolean): readonly DesktopMenuGroup[] {
  const collectionKeys = new Set(["complete", "singles", "binders", "sealed", "graded", "wants"]);
  const browseKeys = new Set(["expansions", "one-piece", "categories", "reprints", "illustrators"]);
  const marketKeys = new Set([
    "market-raw",
    "market-graded",
    "market-targets",
    "market-sealed",
    "selling",
  ]);
  const moreKeys = new Set(["social", "submit-card"]);
  const visibleItems = ALL_NAVIGATION_ITEMS.filter(
    (item) => item.key !== "one-piece" || onePieceEnabled
  );

  return [
    { label: "Collection", items: visibleItems.filter((item) => collectionKeys.has(item.key)) },
    { label: "Sets", items: visibleItems.filter((item) => browseKeys.has(item.key)) },
    { label: "Market", items: visibleItems.filter((item) => marketKeys.has(item.key)) },
    { label: "More", items: visibleItems.filter((item) => moreKeys.has(item.key)) },
  ];
}

function desktopTopLinkClasses(active: boolean): string {
  return `relative inline-flex h-full min-h-10 items-center gap-1.5 border-b-2 px-3 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--dc-primary)] ${
    active
      ? "border-[var(--dc-primary)] text-white"
      : "border-transparent text-white/58 hover:text-white"
  }`;
}

function desktopMenuLinkClasses(active: boolean): string {
  return `group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
    active
      ? "bg-[rgb(var(--dc-primary-rgb)/0.14)] text-white"
      : "text-white/64 hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] hover:text-white"
  }`;
}

export function HeaderNav({ summary }: { summary: NavigationSummary }) {
  const { settings } = useSettings();

  if (settings.desktopNavigation !== "top") return null;
  return <DesktopMarketplaceNavigation summary={summary} />;
}

function DesktopMarketplaceNavigation({ summary }: { summary: NavigationSummary }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = useLiveCollectionTab();
  const { settings } = useSettings();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [cardsCount, setCardsCount] = useState(summary.cards);
  const [forSaleCardsCount, setForSaleCardsCount] = useState(summary.forSaleCards);
  const [wantsCount, setWantsCount] = useState(summary.wants);
  const rootRef = useRef<HTMLDivElement>(null);
  const moverScope = searchParams.get("scope");
  const menuGroups = getDesktopMenuGroups(settings.onePieceLibraryEnabled);
  const displayName = getNavigationDisplayName(summary.email);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCardsCount(summary.cards);
      setForSaleCardsCount(summary.forSaleCards);
      setWantsCount(summary.wants);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [summary.cards, summary.forSaleCards, summary.wants]);

  useEffect(() => {
    function handleWantsChanged(event: Event) {
      const detail = (event as CustomEvent<{ wanted?: boolean }>).detail;
      if (typeof detail?.wanted !== "boolean") return;
      setWantsCount((current) => Math.max(0, current + (detail.wanted ? 1 : -1)));
    }

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

    window.addEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
    window.addEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionCardAdded);
    return () => {
      window.removeEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
      window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionCardAdded);
    };
  }, []);

  useEffect(() => {
    if (!openMenu) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpenMenu(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openMenu]);

  function itemHref(item: NavigationItem): string {
    return item.marketMode
      ? buildNavigationMarketHref(item.marketMode, pathname, searchParams)
      : item.href;
  }

  function itemActive(item: NavigationItem): boolean {
    return isNavigationItemActive(pathname, tab, item.key, moverScope);
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

  const homeActive = itemActive(DESKTOP_HOME_ITEM);
  const radarActive = itemActive(DESKTOP_RADAR_ITEM);
  const accountSectionActive = NAVIGATION_ACCOUNT_ITEMS.some(itemActive);
  const accountOpen = openMenu === "Account";

  return (
    <div
      ref={rootRef}
      data-desktop-top-navigation
      className="relative flex h-[var(--ui-desktop-nav-height)] min-w-0 flex-1 items-center justify-center"
    >
      <nav
        data-desktop-top-navigation-links
        className="flex h-full min-w-0 items-stretch justify-center"
        aria-label="Marketplace navigation"
      >
        <Link
          href={DESKTOP_HOME_ITEM.href}
          prefetch={null}
          aria-current={homeActive ? "page" : undefined}
          className={desktopTopLinkClasses(homeActive)}
        >
          Home
        </Link>

        {menuGroups.map((group) => {
          const active =
            group.label === "Market"
              ? pathname.startsWith("/movers") && !pathname.startsWith("/movers/signal-radar")
              : group.items.some(itemActive);
          const isOpen = openMenu === group.label;

          return (
            <div
              key={group.label}
              className="relative h-full"
              onMouseEnter={() => setOpenMenu(group.label)}
              onMouseLeave={() =>
                setOpenMenu((current) => (current === group.label ? null : current))
              }
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
                  setOpenMenu((current) => (current === group.label ? null : current));
                }
              }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenMenu((current) => (current === group.label ? null : group.label))
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setOpenMenu(group.label);
                  }
                }}
                className={desktopTopLinkClasses(active)}
              >
                {group.label}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen ? (
                <div className="absolute left-0 top-full z-[75] min-w-[16rem] pt-2">
                  <div
                    role="menu"
                    aria-label={`${group.label} navigation`}
                    className="rounded-xl border border-[var(--dc-border)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.98)] p-2 shadow-2xl shadow-black/35 backdrop-blur-xl"
                  >
                    {group.items.map((item) => {
                      const activeItem = itemActive(item);
                      const Icon = item.icon;
                      const badge = getNavigationBadge(
                        item.badge,
                        cardsCount,
                        forSaleCardsCount,
                        wantsCount
                      );

                      return (
                        <Link
                          key={item.key}
                          href={itemHref(item)}
                          prefetch={item.href === "/" ? null : false}
                          role="menuitem"
                          aria-current={activeItem ? "page" : undefined}
                          onClick={() => setOpenMenu(null)}
                          className={desktopMenuLinkClasses(activeItem)}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-white/42 group-hover:text-white/70" />
                          <span className="min-w-0 flex-1">{item.label}</span>
                          {badge !== null ? (
                            <span className="rounded-md bg-[rgb(var(--dc-surface-hover-rgb)/0.8)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/55">
                              {badge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        <Link
          href={DESKTOP_RADAR_ITEM.href}
          prefetch={false}
          aria-current={radarActive ? "page" : undefined}
          className={desktopTopLinkClasses(radarActive)}
        >
          Signal Radar
        </Link>
      </nav>

      <div
        data-desktop-top-navigation-account
        className="absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 items-center"
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
            setOpenMenu((current) => (current === "Account" ? null : current));
          }
        }}
      >
        <button
          type="button"
          data-top-navigation-account
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          aria-controls="desktop-top-account-panel"
          onClick={() => setOpenMenu((current) => (current === "Account" ? null : "Account"))}
          className={`flex min-h-10 items-center gap-2 rounded-full border border-[rgb(var(--dc-border-rgb)/0.8)] bg-[rgb(var(--dc-surface-primary-rgb)/0.58)] px-2.5 text-left shadow-sm shadow-black/20 transition-colors hover:border-[rgb(var(--dc-border-hover-rgb)/0.9)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] hover:text-white ${
            accountSectionActive
              ? "border-[rgb(var(--dc-primary-rgb)/0.34)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-white"
              : "text-white/70"
          }`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--dc-primary-rgb)/0.2)] text-xs font-black text-violet-100">
            {summary.email.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden min-w-0 2xl:block">
            <span className="block max-w-28 truncate text-xs font-bold leading-tight text-white">
              {displayName}
            </span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-white/38">
              {summary.role === "admin" ? "Admin" : "Collector"}
            </span>
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
        </button>

        {accountOpen ? (
          <div
            id="desktop-top-account-panel"
            role="menu"
            aria-label="Account navigation"
            className="absolute right-0 top-full z-[75] w-[18rem] pt-2"
          >
            <div className="rounded-xl border border-[var(--dc-border)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.98)] p-2.5 shadow-2xl shadow-black/35 backdrop-blur-xl">
              <div className="px-1.5 pb-2">
                <p className="truncate text-sm font-bold text-white">{displayName}</p>
                <p className="truncate text-xs text-white/42">{summary.email}</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5 border-y border-[var(--dc-border)] py-2">
                {[
                  ["Cards", cardsCount],
                  ["Binders", summary.binders],
                  ["Sealed", summary.sealedUnits],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg bg-[rgb(var(--dc-surface-hover-rgb)/0.55)] px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/36">
                      {label}
                    </p>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-white">
                      {formatNavigationCount(Number(value))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-0.5">
                {NAVIGATION_ACCOUNT_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = itemActive(item);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      prefetch={false}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpenMenu(null)}
                      className={desktopMenuLinkClasses(active)}
                    >
                      <Icon className="h-4 w-4 text-white/46" />
                      {item.label}
                    </Link>
                  );
                })}
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => void logout()}
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-[13px] font-semibold text-white/64 transition-colors hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] hover:text-white disabled:cursor-wait disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4 text-white/46" />
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HeaderMobileMenu() {
  const pathname = usePathname() ?? "/";
  const tab = useLiveCollectionTab();
  const { settings } = useSettings();
  const onePieceEnabled = settings.onePieceLibraryEnabled;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileSections = getMobileSections(onePieceEnabled);

  // Close on outside interaction/Escape, lock body scroll while open.
  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;

      setOpen(false);
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointerDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="hidden shrink-0 md:block xl:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="header-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-[calc(var(--ui-header-search-height)-0.1rem)] w-[calc(var(--ui-header-search-height)-0.1rem)] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-0 text-white/78 shadow-sm shadow-black/20 transition-colors hover:border-white/18 hover:bg-white/[0.09] sm:w-auto sm:px-3"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        <span className="hidden text-sm font-semibold sm:inline">Menu</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] xl:hidden"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0"
            aria-hidden="true"
          />
          <div
            ref={menuRef}
            id="header-mobile-menu"
            role="menu"
            aria-label="Main navigation"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute left-3 right-3 top-[calc(var(--ui-header-height)+0.5rem)] max-h-[calc(100dvh-var(--ui-header-height)-1rem)] touch-pan-y overflow-y-auto overscroll-contain rounded-[22px] border border-white/10 bg-zinc-950/96 p-2 shadow-xl shadow-black/45 [scrollbar-width:thin] backdrop-blur-xl sm:left-6 sm:right-auto sm:w-80"
          >
            {mobileSections.map((section, index) => (
              <div
                key={section.label}
                className={
                  index === 0 ? "pb-1" : "border-t border-white/8 py-1"
                }
              >
                <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white/38">
                  {section.label}
                </p>
                {section.items.map((item) => {
                    const active = isTopLevelActive(pathname, tab, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-4 py-2.5 text-[15px] font-medium transition-colors ${
                        active
                          ? "bg-white/[0.09] text-white"
                          : "text-white/68 hover:bg-white/[0.055] hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
