"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  /** Pathname prefixes that should mark this link active. */
  matches: ReadonlyArray<string>;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/expansions", label: "Expansions", matches: ["/expansions"] },
  { href: "/movers", label: "Movers", matches: ["/movers"] },
  { href: "/illustrators", label: "Illustrators", matches: ["/illustrators"] },
];

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  matches: ["/settings"],
};

function isActive(pathname: string, matches: ReadonlyArray<string>): boolean {
  return matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function desktopLinkClasses(active: boolean): string {
  return `relative font-medium transition-colors [font-size:var(--ui-nav-link-size)] ${
    active
      ? "text-gray-900 dark:text-white"
      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
  }`;
}

export function HeaderNav() {
  const pathname = usePathname() ?? "/";

  return (
    <div className="hidden shrink-0 items-center gap-[var(--ui-header-gap)] lg:flex">
      {NAV_ITEMS.map((item) => {
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
            {active && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-gray-900 dark:bg-white"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function HeaderSettingsLink() {
  const pathname = usePathname() ?? "/";
  const active = isActive(pathname, SETTINGS_ITEM.matches);

  return (
    <Link
      href={SETTINGS_ITEM.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={`hidden lg:inline-block shrink-0 ${desktopLinkClasses(active)}`}
    >
      {SETTINGS_ITEM.label}
      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-gray-900 dark:bg-white"
        />
      )}
    </Link>
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

  const items = [...NAV_ITEMS, SETTINGS_ITEM];

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="header-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-gray-700 transition-colors hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/8"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          />
          <div
            id="header-mobile-menu"
            role="menu"
            aria-label="Main navigation"
            className="fixed left-3 right-3 top-[calc(var(--ui-header-height)+0.5rem)] z-50 rounded-2xl border border-black/8 bg-white p-2 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40"
          >
            {items.map((item) => {
              const active = isActive(pathname, item.matches);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`block rounded-xl px-4 py-3 text-[15px] font-medium transition-colors ${
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
        </>
      )}
    </div>
  );
}
