"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";

interface NavItem {
  href: string;
  label: string;
  /** Pathname prefixes that should mark this link active. */
  matches: ReadonlyArray<string>;
}

interface NavGroup {
  label: string;
  matches: ReadonlyArray<string>;
  items: ReadonlyArray<NavItem>;
}

const HOME_ITEM: NavItem = {
  href: "/",
  label: "Home",
  matches: ["home"],
};

const COLLECTION_ITEM: NavItem = {
  href: "/?tab=complete",
  label: "Collection",
  matches: ["collection"],
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

const SEARCH_ITEM: NavItem = {
  href: "/search",
  label: "Search",
  matches: ["/search"],
};

const BASE_BROWSE_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/expansions", label: "Expansions", matches: ["/expansions"] },
  { href: "/categories", label: "Categories", matches: ["/categories"] },
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

const MARKET_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/movers", label: "Market", matches: ["/movers"] },
  { href: "/deals", label: "Deals", matches: ["/deals"] },
];

function getNavGroups(onePieceEnabled: boolean): ReadonlyArray<NavGroup> {
  return [
    {
      label: "Browse",
      matches: onePieceEnabled
        ? ["/expansions", "/categories", "/illustrators", "/one-piece", "/submit-card"]
        : ["/expansions", "/categories", "/illustrators", "/submit-card"],
      items: onePieceEnabled
        ? [SEARCH_ITEM, ...BASE_BROWSE_ITEMS, ONE_PIECE_BROWSE_ITEM, SUBMIT_CARD_ITEM]
        : [SEARCH_ITEM, ...BASE_BROWSE_ITEMS, SUBMIT_CARD_ITEM],
    },
    {
      label: "Market",
      matches: ["/movers", "/deals"],
      items: MARKET_ITEMS,
    },
  ];
}

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

function isActive(pathname: string, matches: ReadonlyArray<string>): boolean {
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
      (pathname === "/" && Boolean(tab && tab !== "overview"))
    );
  }

  if (item.href === "/movers") return pathname.startsWith("/movers");

  return isActive(pathname, item.matches);
}

function desktopLinkClasses(active: boolean): string {
  return `inline-flex h-[calc(var(--ui-header-search-height)-0.55rem)] items-center rounded-full border border-transparent px-3 font-semibold transition-colors [font-size:var(--ui-nav-link-size)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/45 ${
    active
      ? "border-violet-400/40 bg-violet-600 text-white"
      : "text-white/55 hover:bg-white/[0.07] hover:text-white"
  }`;
}

function desktopTriggerClasses(active: boolean): string {
  return `${desktopLinkClasses(active)} gap-1.5`;
}

function menuLinkClasses(active: boolean): string {
  return `block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    active
      ? "bg-white/[0.09] text-white"
      : "text-white/68 hover:bg-white/[0.06] hover:text-white"
  }`;
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
      ],
    },
    { label: "Wants", items: [WANTS_ITEM] },
    {
      label: "Browse",
      items: onePieceEnabled
        ? [SEARCH_ITEM, ...BASE_BROWSE_ITEMS, ONE_PIECE_BROWSE_ITEM, SUBMIT_CARD_ITEM]
        : [SEARCH_ITEM, ...BASE_BROWSE_ITEMS, SUBMIT_CARD_ITEM],
    },
    { label: "Market", items: MARKET_ITEMS },
    { label: "Account", items: [ACCOUNT_ITEM, SETTINGS_ITEM] },
  ];
}

export function HeaderNav() {
  const pathname = usePathname() ?? "/";
  const tab = useLiveCollectionTab();
  const { settings } = useSettings();
  const onePieceEnabled = settings.onePieceLibraryEnabled;
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const navGroups = getNavGroups(onePieceEnabled);

  useEffect(() => {
    if (!openGroup) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenGroup(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !navRef.current?.contains(target)) {
        setOpenGroup(null);
      }
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openGroup]);

  return (
    <div
      ref={navRef}
      className="hidden shrink-0 items-center gap-1 rounded-full border border-white/9 bg-white/[0.045] p-1 shadow-sm shadow-black/20 2xl:flex"
    >
      {[HOME_ITEM, COLLECTION_ITEM, WANTS_ITEM].map((item) => {
        const active = isTopLevelActive(pathname, tab, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={desktopLinkClasses(active)}
          >
            {item.label}
          </Link>
        );
      })}

      {navGroups.map((group) => {
        const active = isActive(pathname, group.matches);
        const isOpen = openGroup === group.label;
        return (
          <div
            key={group.label}
            className="relative"
            onMouseEnter={() => setOpenGroup(group.label)}
            onMouseLeave={() =>
              setOpenGroup((current) => (current === group.label ? null : current))
            }
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
                setOpenGroup((current) => (current === group.label ? null : current));
              }
            }}
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenGroup((current) => (current === group.label ? null : group.label))
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenGroup(group.label);
                }
              }}
              className={desktopTriggerClasses(active)}
            >
              {group.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div className="absolute left-0 top-full z-50 min-w-[12rem] pt-2">
                <div
                  role="menu"
                  aria-label={`${group.label} navigation`}
                  className="rounded-2xl border border-white/10 bg-zinc-950/96 p-2 shadow-xl shadow-black/45 backdrop-blur-xl"
                >
                  {group.items.map((item) => {
                    const itemActive = isActive(pathname, item.matches);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        role="menuitem"
                        aria-current={itemActive ? "page" : undefined}
                        onClick={() => setOpenGroup(null)}
                        className={menuLinkClasses(itemActive)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {[ACCOUNT_ITEM, SETTINGS_ITEM].map((item) => {
        const active = isActive(pathname, item.matches);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={desktopLinkClasses(active)}
          >
            {item.label}
          </Link>
        );
      })}
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
    <div className="shrink-0 2xl:hidden">
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
          className="fixed inset-0 z-[80] 2xl:hidden"
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
