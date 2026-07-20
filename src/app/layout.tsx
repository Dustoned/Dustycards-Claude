import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import AppVersionWatcher from "@/components/AppVersionWatcher";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import { HeaderMobileMenu } from "@/components/HeaderNav";
import HeaderSearch from "@/components/HeaderSearch";
import DesktopSidebar, { type DesktopSidebarSummary } from "@/components/DesktopSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileEdgeBackGesture from "@/components/MobileEdgeBackGesture";
import MobileHoverTooltip from "@/components/MobileHoverTooltip";
import MobilePullToRefresh from "@/components/MobilePullToRefresh";
import NavigationStateController from "@/components/NavigationStateController";
import OfflineCacheRegistration from "@/components/OfflineCacheRegistration";
import RouteProgressBar from "@/components/RouteProgressBar";
import SettingsProvider from "@/components/SettingsProvider";
import {
  appearancePaletteToCssVariables,
  normalizeAppearanceSettings,
  resolveAppearancePalette,
} from "@/lib/appearance-themes";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { initSettingsScript } from "@/lib/user-settings";
import { getServerUserSettings } from "@/lib/user-settings-server";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const BROWSER_AUTO_PRICE_REFRESH_ENV = "DUSTYCARDS_ENABLE_BROWSER_AUTO_PRICE_REFRESH";
const ENABLED_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export const metadata: Metadata = {
  title: "DustyCards",
  description: "Track, value and research your trading card collection.",
  applicationName: "DustyCards",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DustyCards",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    // Next emits the standard mobile-web-app-capable tag. Keep the explicit
    // Apple tag as well because iOS standalone launch still relies on it.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#07080B",
  colorScheme: "dark light",
};

const defaultAppearance = normalizeAppearanceSettings(undefined);
const defaultAppearanceStyles = appearancePaletteToCssVariables(
  resolveAppearancePalette(defaultAppearance)
);

function detectInitialMobileViewport(headerStore: Headers) {
  const clientHintMobile = headerStore.get("sec-ch-ua-mobile");

  if (clientHintMobile === "?1") return true;
  if (clientHintMobile === "?0") return false;

  const userAgent = headerStore.get("user-agent") ?? "";
  return /\b(Android|iPhone|iPod|IEMobile|Mobile|BlackBerry|Opera Mini)\b/i.test(userAgent);
}

function isBrowserAutoPriceRefreshEnabled(): boolean {
  const value = process.env[BROWSER_AUTO_PRICE_REFRESH_ENV]?.trim().toLowerCase();
  return value ? ENABLED_ENV_VALUES.has(value) : false;
}

async function getDesktopSidebarSummary(
  userId: string,
  email: string,
  role: DesktopSidebarSummary["role"]
): Promise<DesktopSidebarSummary> {
  const [cards, forSaleCards, binders, wants, sealed] = await Promise.all([
    db.collectionCard.count({ where: { user_id: userId, for_sale: false, sold_at: null } }),
    db.collectionCard.count({ where: { user_id: userId, for_sale: true, sold_at: null } }),
    db.collectionBinder.count({ where: { user_id: userId } }),
    db.collectionWant.count({ where: { user_id: userId, dismissed_at: null } }),
    db.collectionSealed.aggregate({
      where: { user_id: userId },
      _sum: { quantity: true },
    }),
  ]);

  return {
    cards,
    forSaleCards,
    binders,
    sealedUnits: sealed._sum.quantity ?? 0,
    wants,
    email,
    role,
  };
}

async function RuntimeAppFrame({ children }: { children: React.ReactNode }) {
  const browserAutoPriceRefreshEnabled = isBrowserAutoPriceRefreshEnabled();
  const [headerStore, currentUser] = await Promise.all([headers(), getCurrentUser()]);
  const [initialSettings, sidebarSummary] = await Promise.all([
    getServerUserSettings(currentUser?.id),
    currentUser
      ? getDesktopSidebarSummary(currentUser.id, currentUser.email, currentUser.role)
      : Promise.resolve(null),
  ]);
  const initialMobileViewport = detectInitialMobileViewport(headerStore);

  return (
    <div
      className={`${currentUser ? "has-mobile-bottom-nav " : ""}contents`}
      data-app-runtime
      data-authenticated-app={currentUser ? "true" : "false"}
    >
      <SettingsProvider
        initialSettings={initialSettings}
        initialMobileViewport={initialMobileViewport}
        syncToAccount={Boolean(currentUser)}
        currentUserRole={currentUser?.role ?? null}
      >
        <AppVersionWatcher />
        {currentUser ? <RouteProgressBar /> : null}
        {currentUser ? <OfflineCacheRegistration /> : null}
        {currentUser ? <NavigationStateController /> : null}
        <MobileHoverTooltip />
        {currentUser ? <MobileEdgeBackGesture /> : null}
        {currentUser ? <MobilePullToRefresh /> : null}
        {currentUser && <AutoPriceRefreshBoot enabled={browserAutoPriceRefreshEnabled} />}
        {currentUser && sidebarSummary ? <DesktopSidebar summary={sidebarSummary} /> : null}
        <header
          data-app-header
          className={`fixed right-0 top-0 z-50 border-b border-white/8 bg-[#08080c]/85 backdrop-blur-xl ${
            currentUser ? "left-0 xl:left-[16rem]" : "left-0"
          }`}
        >
          <nav className="page-container relative mx-auto flex h-[var(--ui-header-height)] items-center gap-[var(--ui-header-gap)] px-3 sm:px-6 lg:px-8">
            <Link href="/" prefetch={currentUser ? null : false} className={`shrink-0 font-bold tracking-tight text-white transition-opacity hover:opacity-75 [font-size:var(--ui-brand-size)] ${currentUser ? "xl:hidden" : ""}`}>
              DustyCards
            </Link>
            {currentUser ? (
              <>
                <HeaderMobileMenu />
                <div className="flex-1 lg:hidden" />
                <HeaderSearch />
              </>
            ) : (
              <div className="flex-1" />
            )}
          </nav>
        </header>
        <main
          data-app-main
          className={`flex-1 pt-[var(--ui-header-height)] ${
            currentUser ? "xl:pl-[16rem]" : ""
          }`}
        >
          {children}
        </main>
        {currentUser && <MobileBottomNav summary={sidebarSummary} />}
      </SettingsProvider>
    </div>
  );
}

function AppLaunchShell() {
  return (
    <div data-app-launch-shell role="status" aria-label="DustyCards is loading" aria-live="polite">
      <span className="sr-only">DustyCards is loading</span>
      <header data-app-launch-header>
        <div data-app-launch-logo aria-hidden="true">D</div>
        <strong>DustyCards</strong>
        <div data-app-launch-search aria-hidden="true" />
      </header>
      <aside data-app-launch-sidebar aria-hidden="true">
        <div data-app-launch-brand />
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} data-app-launch-nav-row />
        ))}
      </aside>
      <main data-app-launch-main aria-hidden="true">
        <div data-app-launch-hero>
          <div data-app-launch-line="short" />
          <div data-app-launch-line="title" />
          <div data-app-launch-line="copy" />
        </div>
        <div data-app-launch-grid>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} data-app-launch-card>
              <div data-app-launch-card-media />
              <div data-app-launch-line="card" />
              <div data-app-launch-line="card-short" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const prepaintThemeStyles = `
  html, body {
    min-height: 100%;
    margin: 0;
    background: var(--dc-bg-main, #07080B);
    color: var(--dc-text-primary, #FFFFFF);
    color-scheme: var(--dc-color-scheme, dark);
  }

  [data-app-header] {
    background-color: var(--dc-bg-main, #07080B);
    border-color: var(--dc-border, #252A38);
  }

  [data-app-launch-shell] {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    min-height: 100dvh;
    overflow: hidden;
    background: var(--dc-bg-main, #07080B);
    color: var(--dc-text-primary, #FFFFFF);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  [data-app-launch-header] {
    position: fixed;
    inset: 0 0 auto;
    z-index: 2;
    display: flex;
    height: 56px;
    align-items: center;
    gap: 10px;
    padding: env(safe-area-inset-top, 0px) 16px 0;
    border-bottom: 1px solid var(--dc-border, #252A38);
    background: var(--dc-bg-main, #07080B);
    box-sizing: content-box;
  }

  [data-app-launch-logo] {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--dc-primary-hover, #7658F4), var(--dc-primary, #6E4DFF));
    color: var(--dc-on-primary, #FFFFFF);
    font-weight: 800;
  }

  [data-app-launch-search] {
    width: min(42vw, 400px);
    height: 34px;
    margin-left: auto;
    border: 1px solid var(--dc-border, #252A38);
    border-radius: 12px;
    background: var(--dc-surface-primary, #101218);
  }

  [data-app-launch-sidebar] {
    position: fixed;
    inset: 0 auto 0 0;
    display: none;
    width: 224px;
    padding: 22px 16px;
    border-right: 1px solid var(--dc-border, #252A38);
    background: var(--dc-surface-primary, #101218);
  }

  [data-app-launch-brand], [data-app-launch-nav-row], [data-app-launch-line],
  [data-app-launch-card-media], [data-app-launch-search] {
    background-image: linear-gradient(100deg, var(--dc-surface-primary, #101218) 8%, var(--dc-surface-hover, #1D2130) 18%, var(--dc-surface-primary, #101218) 33%);
    background-size: 220% 100%;
    animation: dc-launch-shimmer 1.6s linear infinite;
  }

  [data-app-launch-brand] { width: 112px; height: 22px; margin-bottom: 36px; border-radius: 7px; }
  [data-app-launch-nav-row] { height: 38px; margin-top: 10px; border-radius: 12px; }
  [data-app-launch-main] { padding: calc(80px + env(safe-area-inset-top, 0px)) 16px 32px; }
  [data-app-launch-hero] { max-width: 720px; padding: 20px; border: 1px solid var(--dc-border, #252A38); border-radius: 22px; background: var(--dc-surface-primary, #101218); }
  [data-app-launch-line] { height: 12px; border-radius: 999px; }
  [data-app-launch-line="short"] { width: 96px; height: 9px; }
  [data-app-launch-line="title"] { width: min(68%, 330px); height: 30px; margin-top: 16px; }
  [data-app-launch-line="copy"] { width: min(92%, 540px); margin-top: 14px; }
  [data-app-launch-grid] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
  [data-app-launch-card] { min-width: 0; padding: 10px; border: 1px solid var(--dc-border, #252A38); border-radius: 18px; background: var(--dc-surface-primary, #101218); }
  [data-app-launch-card-media] { aspect-ratio: 63 / 88; border-radius: 12px; }
  [data-app-launch-line="card"] { width: 76%; margin-top: 12px; }
  [data-app-launch-line="card-short"] { width: 48%; height: 9px; margin-top: 8px; }

  @keyframes dc-launch-shimmer {
    to { background-position-x: -220%; }
  }

  @media (min-width: 768px) {
    [data-app-launch-grid] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  @media (min-width: 1280px) {
    [data-app-launch-header] { left: 224px; }
    [data-app-launch-sidebar] { display: block; }
    [data-app-launch-main] { padding-left: 248px; }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-app-launch-shell] * { animation: none !important; }
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} h-full antialiased dark ui-scale-medium`}
      data-theme="system"
      data-appearance={defaultAppearance.preset}
      data-appearance-scheme="dark"
      data-ui-scale="medium"
      style={defaultAppearanceStyles as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://assets.tcgdex.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.tcggo.com" />
        <script dangerouslySetInnerHTML={{ __html: initSettingsScript }} />
        <style dangerouslySetInnerHTML={{ __html: prepaintThemeStyles }} />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-white">
        <Suspense fallback={<AppLaunchShell />}>
          <RuntimeAppFrame>{children}</RuntimeAppFrame>
        </Suspense>
      </body>
    </html>
  );
}
