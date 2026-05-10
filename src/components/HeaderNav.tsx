"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

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

const COLLECTION_ITEM: NavItem = {
  href: "/",
  label: "Collection",
  matches: ["/", "/binders"],
};

const WANTS_ITEM: NavItem = {
  href: "/wants",
  label: "Wants",
  matches: ["/wants"],
};

const BROWSE_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/expansions", label: "Expansions", matches: ["/expansions"] },
  { href: "/categories", label: "Categories", matches: ["/categories"] },
  { href: "/illustrators", label: "Illustrators", matches: ["/illustrators"] },
];

const MARKET_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/movers", label: "Movers", matches: ["/movers"] },
  { href: "/deals", label: "Deals", matches: ["/deals"] },
];

const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: "Browse",
    matches: ["/expansions", "/categories", "/illustrators"],
    items: BROWSE_ITEMS,
  },
  {
    label: "Market",
    matches: ["/movers", "/deals"],
    items: MARKET_ITEMS,
  },
];

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

function desktopLinkClasses(active: boolean): string {
  return `inline-flex h-[calc(var(--ui-header-search-height)-0.55rem)] items-center rounded-full px-3 font-medium transition-colors [font-size:var(--ui-nav-link-size)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:focus-visible:outline-white/45 ${
    active
      ? "bg-gray-900 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-900 dark:shadow-none"
      : "text-gray-500 hover:bg-black/[0.045] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
  }`;
}

function desktopTriggerClasses(active: boolean): string {
  return `${desktopLinkClasses(active)} gap-1.5`;
}

function menuLinkClasses(active: boolean): string {
  return `block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    active
      ? "bg-black/[0.055] text-gray-950 dark:bg-white/[0.09] dark:text-white"
      : "text-gray-600 hover:bg-black/[0.04] hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
  }`;
}

const MOBILE_SECTIONS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<NavItem>;
}> = [
  { label: "Collection", items: [COLLECTION_ITEM, WANTS_ITEM] },
  { label: "Browse", items: BROWSE_ITEMS },
  { label: "Market", items: MARKET_ITEMS },
  { label: "Account", items: [ACCOUNT_ITEM, SETTINGS_ITEM] },
];

export function HeaderNav() {
  const pathname = usePathname() ?? "/";
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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
      className="hidden shrink-0 items-center gap-1 rounded-full border border-black/8 bg-black/[0.025] p-1 dark:border-white/8 dark:bg-white/[0.04] 2xl:flex"
    >
      {[COLLECTION_ITEM, WANTS_ITEM].map((item) => {
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

      {NAV_GROUPS.map((group) => {
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
                  className="rounded-2xl border border-black/8 bg-white p-2 shadow-xl shadow-black/12 dark:border-white/10 dark:bg-zinc-950 dark:shadow-black/45"
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
  const [open, setOpen] = useState(false);

  // Close on Escape, lock body scroll while open.
  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="shrink-0 2xl:hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="header-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-[calc(var(--ui-header-search-height)-0.1rem)] w-[calc(var(--ui-header-search-height)-0.1rem)] items-center justify-center gap-2 rounded-full border border-black/10 px-0 text-gray-700 transition-colors hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/8 sm:w-auto sm:px-3"
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
            id="header-mobile-menu"
            role="menu"
            aria-label="Main navigation"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute left-3 right-3 top-[calc(var(--ui-header-height)+0.5rem)] rounded-2xl border border-black/8 bg-white p-2 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40 sm:left-6 sm:right-auto sm:w-80"
          >
            {MOBILE_SECTIONS.map((section, index) => (
              <div
                key={section.label}
                className={
                  index === 0 ? "pb-1" : "border-t border-black/6 py-1 dark:border-white/8"
                }
              >
                <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/42">
                  {section.label}
                </p>
                {section.items.map((item) => {
                  const active = isActive(pathname, item.matches);
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
                          ? "bg-black/[0.05] text-gray-900 dark:bg-white/[0.08] dark:text-white"
                          : "text-gray-700 hover:bg-black/[0.035] dark:text-gray-200 dark:hover:bg-white/[0.05]"
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
