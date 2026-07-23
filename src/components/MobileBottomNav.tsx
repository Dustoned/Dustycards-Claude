"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Heart,
  Home,
  LibraryBig,
  LogOut,
  Mail,
  MoreHorizontal,
  Radar,
  Settings as SettingsIcon,
  ShieldCheck,
  TrendingUp,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import FeedbackButton from "@/components/FeedbackButton";
import type { DesktopSidebarSummary } from "@/components/DesktopSidebar";
import {
  NAVIGATION_ACCOUNT_ITEMS,
  NAVIGATION_SECTIONS,
  type NavigationItem,
} from "@/components/navigation-model";
import { useLiveCollectionTab } from "@/components/useLiveCollectionTab";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import {
  COLLECTION_CARD_ADDED_EVENT,
  getCollectionCardAddedEffects,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";
import { MOBILE_EDGE_BACK_EVENT } from "@/lib/mobile-edge-back";
import { WANTS_CHANGED_EVENT } from "@/lib/wants-client-events";

const PRIMARY_NAV_ITEMS: readonly MobileNavItem[] = [
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
  excludeMatches?: readonly string[];
  shortLabel?: string;
  description?: string;
  badge?: "binders" | "sealed" | "selling";
};

type MobileNavSection = {
  label: string;
  items: readonly MobileNavItem[];
};

const SHARED_NAVIGATION_ITEMS = new Map(
  NAVIGATION_SECTIONS.flatMap((section) => section.items).map((item) => [item.key, item])
);

function mobileMoreItem(
  key: string,
  description: string,
  matches: readonly string[],
  options: Pick<MobileNavItem, "shortLabel" | "badge"> & { label?: string } = {}
): MobileNavItem {
  const sharedItem = SHARED_NAVIGATION_ITEMS.get(key) as NavigationItem | undefined;
  if (!sharedItem) {
    throw new Error(`Unknown shared navigation item: ${key}`);
  }

  return {
    href: sharedItem.href,
    label: options.label ?? sharedItem.label,
    icon: sharedItem.icon,
    matches,
    shortLabel: options.shortLabel,
    description,
    badge: options.badge,
  };
}

export function getMoreMenuSections(onePieceEnabled: boolean): readonly MobileNavSection[] {
  const expansionItems: MobileNavItem[] = [
    mobileMoreItem("expansions", "Browse every expansion", ["/expansions"], {
      shortLabel: onePieceEnabled ? "Pokemon" : "Sets",
      label: onePieceEnabled ? undefined : "Expansions",
    }),
    ...(onePieceEnabled
      ? [
          mobileMoreItem("one-piece", "Explore the full library", ["/one-piece"], {
            shortLabel: "One Piece",
          }),
        ]
      : []),
  ];

  return [
    {
      label: "My collection",
      items: [
        mobileMoreItem("singles", "Raw cards outside binders", ["tab:singles"], {
          shortLabel: "Singles",
        }),
        mobileMoreItem("binders", "Sets and progress", ["tab:binders", "/binders"], {
          badge: "binders",
        }),
        mobileMoreItem("sealed", "Products and boxes", ["tab:sealed"], {
          badge: "sealed",
        }),
        mobileMoreItem("graded", "Slabs and graded prices", ["tab:graded"]),
      ],
    },
    {
      label: "Discover",
      items: [
        ...expansionItems,
        mobileMoreItem("categories", "Explore card types", ["/categories"]),
        mobileMoreItem("illustrators", "Discover artists", ["/illustrators"], {
          shortLabel: "Artists",
        }),
        mobileMoreItem("social", "Collector activity", ["/social"]),
      ],
    },
  ];
}

const MORE_QUICK_ACTIONS: readonly MobileNavItem[] = [
  mobileMoreItem("submit-card", "Add a missing card", ["/submit-card"], {
    label: "Submit card",
  }),
  mobileMoreItem("selling", "Manage selling cards", ["tab:selling"], {
    label: "For sale",
    badge: "selling",
  }),
];

const SIGNAL_RADAR_ITEM: MobileNavItem = mobileMoreItem(
  "market-radar",
  "Research opportunities with the strongest evidence",
  ["/movers/signal-radar"]
);

const ACCOUNT_ITEM = NAVIGATION_ACCOUNT_ITEMS.find((item) => item.key === "account")!;
const SETTINGS_ITEM = NAVIGATION_ACCOUNT_ITEMS.find((item) => item.key === "settings")!;

export function getMobileMoreRouteInventory(onePieceEnabled: boolean) {
  return {
    featured: SIGNAL_RADAR_ITEM.href,
    quickActions: MORE_QUICK_ACTIONS.map((item) => item.href),
    sections: getMoreMenuSections(onePieceEnabled).map((section) => ({
      label: section.label,
      routes: section.items.map((item) => item.href),
    })),
    account: [ACCOUNT_ITEM.href, SETTINGS_ITEM.href],
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function getMoreItemBadge(
  item: MobileNavItem,
  summary: DesktopSidebarSummary | null,
  forSaleCardsCount: number
): string | null {
  if (item.badge === "binders") return summary ? formatCount(summary.binders) : null;
  if (item.badge === "sealed") return summary ? formatCount(summary.sealedUnits) : null;
  if (item.badge === "selling") {
    return forSaleCardsCount > 0 ? formatCount(forSaleCardsCount) : null;
  }
  return null;
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

function isNavItemActive(
  pathname: string,
  collectionTab: string | null,
  matches: readonly string[],
  excludeMatches: readonly string[] = []
) {
  const excluded = excludeMatches.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (excluded) return false;

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
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [cardsCount, setCardsCount] = useState(summary?.cards ?? 0);
  const [forSaleCardsCount, setForSaleCardsCount] = useState(summary?.forSaleCards ?? 0);
  const [wantsCount, setWantsCount] = useState(summary?.wants ?? 0);
  const moreDialogRef = useRef<HTMLDivElement | null>(null);
  const moreCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const logoutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const logoutCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreWasOpenRef = useRef(false);
  const logoutWasOpenRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const moreSections = getMoreMenuSections(settings.onePieceLibraryEnabled);
  const moreRouteActive = [
    SIGNAL_RADAR_ITEM,
    ...MORE_QUICK_ACTIONS,
    ...moreSections.flatMap((section) => section.items),
  ].some((item) =>
    isNavItemActive(pathname, collectionTab, item.matches, item.excludeMatches)
  ) || [ACCOUNT_ITEM.href, SETTINGS_ITEM.href].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );
  const moreActive = moreOpen || moreRouteActive;
  useBodyScrollLock(moreOpen);
  const accountInitial = summary?.email.slice(0, 1).toUpperCase() ?? "D";
  const accountName = summary ? getDisplayName(summary.email) : "Account";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setForSaleCardsCount(summary?.forSaleCards ?? 0)
    );
    return () => window.cancelAnimationFrame(frame);
  }, [summary?.forSaleCards]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCardsCount(summary?.cards ?? 0));
    return () => window.cancelAnimationFrame(frame);
  }, [summary?.cards]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setWantsCount(summary?.wants ?? 0));
    return () => window.cancelAnimationFrame(frame);
  }, [summary?.wants]);

  useEffect(() => {
    function handleWantsChanged(event: Event) {
      const detail = (event as CustomEvent<{ wanted?: boolean }>).detail;
      if (typeof detail?.wanted !== "boolean") return;
      setWantsCount((current) => Math.max(0, current + (detail.wanted ? 1 : -1)));
    }

    window.addEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
    return () => window.removeEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
  }, []);

  useEffect(() => {
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

    window.addEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionCardAdded);
    return () => window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionCardAdded);
  }, []);

  const closeMoreMenu = useCallback(() => {
    closingForNavigationRef.current = false;
    setMoreOpen(false);
    setLogoutConfirmOpen(false);
  }, []);

  const navigateFromMoreMenu = useCallback(() => {
    closingForNavigationRef.current = true;
    setMoreOpen(false);
    setLogoutConfirmOpen(false);
  }, []);

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

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const dialog = moreDialogRef.current;
        if (!dialog) return;

        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => !element.hasAttribute("hidden") && element.tabIndex >= 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;

        const activeElement = document.activeElement;
        if (!dialog.contains(activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        } else if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
        return;
      }

      if (event.key !== "Escape") return;

      if (logoutConfirmOpen) {
        setLogoutConfirmOpen(false);
        return;
      }

      closeMoreMenu();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMoreMenu, logoutConfirmOpen, moreOpen]);

  useEffect(() => {
    if (moreOpen) {
      moreWasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        moreCloseButtonRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (moreWasOpenRef.current) {
      moreWasOpenRef.current = false;
      const shouldRestoreFocus = !closingForNavigationRef.current;
      closingForNavigationRef.current = false;
      if (!shouldRestoreFocus) return;
      const frame = window.requestAnimationFrame(() => {
        moreTriggerRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) {
      logoutWasOpenRef.current = false;
      return;
    }

    if (logoutConfirmOpen) {
      logoutWasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        logoutCancelButtonRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (logoutWasOpenRef.current) {
      logoutWasOpenRef.current = false;
      const frame = window.requestAnimationFrame(() => {
        logoutTriggerRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [logoutConfirmOpen, moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;

    function handleMobileEdgeBack(event: Event) {
      event.preventDefault();
      closeMoreMenu();
    }

    window.addEventListener(MOBILE_EDGE_BACK_EVENT, handleMobileEdgeBack);
    return () => window.removeEventListener(MOBILE_EDGE_BACK_EVENT, handleMobileEdgeBack);
  }, [closeMoreMenu, moreOpen]);

  return (
    <div
      ref={moreDialogRef}
      data-mobile-navigation-root
      role={moreOpen ? "dialog" : undefined}
      aria-modal={moreOpen ? "true" : undefined}
      aria-labelledby={moreOpen ? "mobile-more-title" : undefined}
      className={moreOpen ? "pointer-events-none fixed inset-0 z-[54] md:hidden" : undefined}
    >
      {moreOpen ? (
        <>
          <button
            type="button"
            data-mobile-more-backdrop
            data-no-pull-refresh
            tabIndex={-1}
            className="pointer-events-auto fixed inset-0 z-[55] bg-[rgb(var(--dc-bg-main-rgb)/0.68)] backdrop-blur-sm md:hidden"
            onClick={closeMoreMenu}
            aria-label="Close More navigation"
          />

          <section
            id="mobile-more-panel"
            data-mobile-more-sheet
            data-no-pull-refresh
            aria-labelledby="mobile-more-title"
            className="pointer-events-auto fixed inset-x-2 bottom-[calc(4.7rem+env(safe-area-inset-bottom))] top-[calc(0.6rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md flex-col overflow-hidden rounded-[28px] border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[linear-gradient(180deg,rgb(var(--dc-surface-primary-rgb)/0.99),rgb(var(--dc-bg-main-rgb)/0.99))] shadow-[0_28px_90px_rgb(var(--dc-primary-rgb)/0.18),0_28px_90px_rgba(0,0,0,0.68)] md:hidden"
          >
            <header
              data-mobile-more-header
              className="relative z-20 flex min-h-[4.35rem] shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-primary-rgb)/0.98)] px-3 py-2.5"
            >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.2)] bg-[rgb(var(--dc-primary-rgb)/0.14)] text-[var(--dc-primary-soft)]">
                    <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span
                      id="mobile-more-title"
                      className="block text-[19px] font-black leading-tight tracking-tight text-[var(--dc-text-primary)]"
                    >
                      More
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--dc-text-muted)]">
                      Your collector hub
                    </span>
                  </span>
                </div>
                <button
                  ref={moreCloseButtonRef}
                  type="button"
                  onClick={closeMoreMenu}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--dc-border-rgb)/0.92)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.82)] text-[var(--dc-text-secondary)] transition-colors hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.94)] hover:text-[var(--dc-text-primary)]"
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </header>

            <div
              data-mobile-more-scroll
              data-no-pull-refresh
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [overflow-anchor:none] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="space-y-3 px-3 pb-4 pt-3">
                <section
                  data-mobile-more-profile
                  aria-labelledby="mobile-more-profile-title"
                  className="overflow-hidden rounded-[22px] border border-[rgb(var(--dc-primary-soft-rgb)/0.18)] bg-[linear-gradient(145deg,rgb(var(--dc-primary-rgb)/0.16),rgb(var(--dc-surface-elevated-rgb)/0.82))] p-3 shadow-[inset_0_1px_0_rgb(var(--dc-primary-soft-rgb)/0.08)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[17px] border border-[rgb(var(--dc-primary-soft-rgb)/0.24)] bg-[rgb(var(--dc-primary-rgb)/0.2)] text-base font-black text-[var(--dc-primary-soft)] shadow-[0_0_26px_rgb(var(--dc-primary-rgb)/0.16)]">
                      {accountInitial}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          id="mobile-more-profile-title"
                          className="truncate text-[15px] font-black leading-tight text-[var(--dc-text-primary)]"
                        >
                          {accountName}
                        </span>
                        {summary ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/20 bg-amber-400/[0.08] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.07em] text-amber-300">
                            <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
                            {summary.role === "admin" ? "Admin" : "Collector"}
                          </span>
                        ) : null}
                      </span>
                      {summary ? (
                        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--dc-text-muted)]">
                          <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{summary.email}</span>
                        </span>
                      ) : (
                        <span className="mt-1 block text-[11px] font-semibold text-[var(--dc-text-muted)]">
                          Manage your collector profile
                        </span>
                      )}
                    </span>
                  </div>

                  {summary ? (
                    <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Account totals">
                      {[
                        ["Cards", cardsCount],
                        ["Wants", wantsCount],
                        ["Selling", forSaleCardsCount],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-bg-main-rgb)/0.28)] px-2 py-2"
                        >
                          <p className="text-sm font-black leading-none text-[var(--dc-text-primary)]">
                            {formatCount(Number(value))}
                          </p>
                          <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.07em] text-[var(--dc-text-muted)]">
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Link
                      href={ACCOUNT_ITEM.href}
                      prefetch={null}
                      onClick={navigateFromMoreMenu}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.2)] bg-[rgb(var(--dc-primary-rgb)/0.13)] px-3 text-[11px] font-black text-[var(--dc-text-primary)]"
                    >
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                      {ACCOUNT_ITEM.label}
                    </Link>
                    <Link
                      href={SETTINGS_ITEM.href}
                      prefetch={null}
                      onClick={navigateFromMoreMenu}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[rgb(var(--dc-surface-primary-rgb)/0.54)] px-3 text-[11px] font-black text-[var(--dc-text-secondary)]"
                    >
                      <SettingsIcon className="h-4 w-4" aria-hidden="true" />
                      {SETTINGS_ITEM.label}
                    </Link>
                  </div>
                  <FeedbackButton
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.2)] bg-[rgb(var(--dc-primary-rgb)/0.1)] px-3 text-[11px] font-black text-[var(--dc-text-secondary)]"
                    iconClassName="h-4 w-4 text-[var(--dc-primary-soft)]"
                  />
                </section>

                <Link
                  href={SIGNAL_RADAR_ITEM.href}
                  prefetch={null}
                  onClick={navigateFromMoreMenu}
                  data-mobile-more-featured
                  aria-current={
                    isNavItemActive(
                      pathname,
                      collectionTab,
                      SIGNAL_RADAR_ITEM.matches,
                      SIGNAL_RADAR_ITEM.excludeMatches
                    )
                      ? "page"
                      : undefined
                  }
                  className="group relative grid min-h-[5.6rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[22px] border border-[rgb(var(--dc-primary-soft-rgb)/0.25)] bg-[linear-gradient(135deg,rgb(var(--dc-primary-rgb)/0.22),rgb(var(--dc-surface-elevated-rgb)/0.9))] p-3 shadow-[0_14px_38px_rgb(var(--dc-primary-rgb)/0.12)]"
                >
                  <span className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[rgb(var(--dc-primary-rgb)/0.16)] blur-2xl" aria-hidden="true" />
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[rgb(var(--dc-primary-soft-rgb)/0.28)] bg-[rgb(var(--dc-primary-rgb)/0.2)] text-[var(--dc-primary-soft)] shadow-[0_0_28px_rgb(var(--dc-primary-rgb)/0.18)]">
                    <Radar className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="relative min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--dc-primary-soft)]">
                      Market intelligence
                    </span>
                    <span className="mt-0.5 block text-[15px] font-black leading-tight text-[var(--dc-text-primary)]">
                      Signal Radar
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold leading-snug text-[var(--dc-text-muted)]">
                      Strong opportunities, evidence first
                    </span>
                  </span>
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--dc-primary-soft-rgb)/0.18)] bg-[rgb(var(--dc-primary-rgb)/0.13)] text-[var(--dc-primary-soft)]">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>

                <section aria-labelledby="mobile-more-quick-title">
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <h2
                      id="mobile-more-quick-title"
                      className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--dc-text-muted)]"
                    >
                      Quick actions
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MORE_QUICK_ACTIONS.map((item) => {
                      const active = isNavItemActive(
                        pathname,
                        collectionTab,
                        item.matches,
                        item.excludeMatches
                      );
                      const Icon = item.icon;
                      const badge = getMoreItemBadge(item, summary, forSaleCardsCount);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={false}
                          onClick={navigateFromMoreMenu}
                          data-mobile-more-quick-link
                          aria-current={active ? "page" : undefined}
                          className={`grid min-h-[4.7rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[20px] border p-2 transition-colors ${
                            active
                              ? "border-[rgb(var(--dc-primary-soft-rgb)/0.35)] bg-[rgb(var(--dc-primary-rgb)/0.15)]"
                              : "border-[rgb(var(--dc-border-rgb)/0.84)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.62)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.78)]"
                          }`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${active ? "bg-[rgb(var(--dc-primary-rgb)/0.2)] text-[var(--dc-primary-soft)]" : "bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] text-[var(--dc-text-muted)]"}`}>
                            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-black text-[var(--dc-text-primary)]">
                                {item.label}
                              </span>
                              {badge ? (
                                <span className="shrink-0 rounded-full bg-[rgb(var(--dc-primary-rgb)/0.14)] px-1.5 py-0.5 text-[9px] font-black text-[var(--dc-primary-soft)]">
                                  {badge}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-[10px] font-semibold leading-tight text-[var(--dc-text-muted)]">
                              {item.description}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>

                {moreSections.map((section) => (
                  <section key={section.label} aria-labelledby={`mobile-more-${section.label.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <h2
                        id={`mobile-more-${section.label.replace(/\s+/g, "-").toLowerCase()}`}
                        className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--dc-text-muted)]"
                      >
                        {section.label}
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {section.items.map((item) => {
                        const active = isNavItemActive(
                          pathname,
                          collectionTab,
                          item.matches,
                          item.excludeMatches
                        );
                        const Icon = item.icon;
                        const badge = getMoreItemBadge(item, summary, forSaleCardsCount);

                        return (
                          <Link
                            key={`${section.label}:${item.href}:${item.label}`}
                            href={item.href}
                            prefetch={false}
                            onClick={navigateFromMoreMenu}
                            data-mobile-more-link
                            aria-current={active ? "page" : undefined}
                            className={`relative min-h-[5.35rem] min-w-0 overflow-hidden rounded-[20px] border p-2.5 transition-colors ${
                              active
                                ? "border-[rgb(var(--dc-primary-soft-rgb)/0.34)] bg-[rgb(var(--dc-primary-rgb)/0.14)]"
                                : "border-[rgb(var(--dc-border-rgb)/0.84)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.58)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.76)]"
                            }`}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${active ? "bg-[rgb(var(--dc-primary-rgb)/0.2)] text-[var(--dc-primary-soft)]" : "bg-[rgb(var(--dc-surface-hover-rgb)/0.68)] text-[var(--dc-text-muted)]"}`}>
                                <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
                              </span>
                              {badge ? (
                                <span className="rounded-full border border-[rgb(var(--dc-primary-soft-rgb)/0.16)] bg-[rgb(var(--dc-primary-rgb)/0.12)] px-1.5 py-0.5 text-[9px] font-black text-[var(--dc-primary-soft)]">
                                  {badge}
                                </span>
                              ) : (
                                <ChevronRight className="mt-1 h-3.5 w-3.5 text-[var(--dc-text-disabled)]" aria-hidden="true" />
                              )}
                            </span>
                            <span className="mt-2 block truncate text-xs font-black leading-tight text-[var(--dc-text-primary)]">
                              {item.label}
                            </span>
                            <span className="mt-1 block line-clamp-2 text-[10px] font-semibold leading-tight text-[var(--dc-text-muted)]">
                              {item.description}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {summary ? (
                  <section
                    aria-label="Session"
                    className="rounded-[20px] border border-[rgb(var(--dc-negative-rgb)/0.14)] bg-[rgb(var(--dc-negative-rgb)/0.045)] p-2"
                  >
                    {logoutConfirmOpen ? (
                      <div className="grid gap-2" aria-live="polite">
                        <p className="px-1 text-[10px] font-bold leading-snug text-[var(--dc-text-secondary)]">
                          Log out of DustyCards on this device?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            ref={logoutCancelButtonRef}
                            type="button"
                            onClick={() => setLogoutConfirmOpen(false)}
                            className="min-h-11 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-primary-rgb)/0.72)] px-3 text-xs font-black text-[var(--dc-text-secondary)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={logout}
                            disabled={loggingOut}
                            className="min-h-11 rounded-xl border border-[rgb(var(--dc-negative-rgb)/0.25)] bg-[rgb(var(--dc-negative-rgb)/0.14)] px-3 text-xs font-black text-rose-200 disabled:cursor-wait disabled:opacity-60"
                          >
                            {loggingOut ? "Logging out..." : "Log out"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        ref={logoutTriggerRef}
                        type="button"
                        onClick={() => setLogoutConfirmOpen(true)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-[var(--dc-text-muted)]"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Log out
                      </button>
                    )}
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : null}

      <nav
        data-mobile-bottom-nav
        aria-label="Mobile navigation"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-[70] border-t border-violet-300/12 bg-[linear-gradient(180deg,rgb(var(--dc-surface-primary-rgb)/0.98),rgb(var(--dc-bg-main-rgb)/1))] px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_45px_rgba(0,0,0,0.58),0_-10px_42px_rgb(var(--dc-primary-rgb)/0.14)] md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active =
              !moreOpen &&
              isNavItemActive(
                pathname,
                collectionTab,
                item.matches,
                item.excludeMatches
              );
            const Icon = item.icon;

            return (
              <Link
                key={`${item.href}:${item.label}`}
                href={item.href}
                // Home is revisited from almost every screen. Automatic
                // prefetch warms its loading boundary without forcing the
                // expensive personalized dashboard query to compete with the
                // page the collector is currently using.
                prefetch={item.href === "/" ? null : false}
                onClick={moreOpen ? navigateFromMoreMenu : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.05rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-[9px] font-semibold transition-colors min-[390px]:text-[10px] ${
                  active
                    ? "border-[rgb(var(--dc-primary-soft-rgb)/0.35)] bg-[rgb(var(--dc-primary-rgb)/0.16)] text-[var(--dc-text-primary)] shadow-[0_0_22px_rgb(var(--dc-primary-rgb)/0.18)]"
                    : "border-transparent text-[var(--dc-text-muted)] hover:bg-[rgb(var(--dc-primary-rgb)/0.08)] hover:text-[var(--dc-text-secondary)]"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? "text-[var(--dc-primary-soft)] drop-shadow-[0_0_14px_rgb(var(--dc-primary-rgb)/0.36)]" : ""}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            ref={moreTriggerRef}
            type="button"
            onClick={() => {
              setLogoutConfirmOpen(false);
              if (moreOpen) {
                closeMoreMenu();
              } else {
                closingForNavigationRef.current = false;
                setMoreOpen(true);
              }
            }}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-panel"
            aria-haspopup="dialog"
            aria-current={moreRouteActive ? "page" : undefined}
            className={`flex min-h-[3.05rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-[9px] font-semibold transition-colors hover:bg-[rgb(var(--dc-primary-rgb)/0.08)] hover:text-[var(--dc-text-secondary)] min-[390px]:text-[10px] ${
              moreActive
                ? "border-[rgb(var(--dc-primary-soft-rgb)/0.35)] bg-[rgb(var(--dc-primary-rgb)/0.16)] text-[var(--dc-text-primary)] shadow-[0_0_22px_rgb(var(--dc-primary-rgb)/0.18)]"
                : "border-transparent text-[var(--dc-text-muted)]"
            }`}
          >
            <MoreHorizontal
              className={`h-5 w-5 shrink-0 ${moreActive ? "text-[var(--dc-primary-soft)] drop-shadow-[0_0_14px_rgb(var(--dc-primary-rgb)/0.36)]" : ""}`}
            />
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
