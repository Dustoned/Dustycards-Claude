import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import AppVersionWatcher from "@/components/AppVersionWatcher";
import ActionCenterButton from "@/components/ActionCenterButton";
import AdminActiveUsersButton from "@/components/AdminActiveUsersButton";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import CollectionActionToast from "@/components/CollectionActionToast";
import { HeaderMobileMenu, HeaderNav } from "@/components/HeaderNav";
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
import { getAdminActiveUsersSnapshot } from "@/lib/admin-active-users";
import { buildVersion } from "@/lib/app-version";
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
  icons: {
    icon: [
      {
        url: "/icons/dustycards-pokeball.ico?v=2",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        url: "/icons/dustycards-pokeball-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/dustycards-pokeball-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcut: "/icons/dustycards-pokeball.ico?v=2",
    apple: [
      {
        url: "/icons/dustycards-pokeball-apple-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
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
  maximumScale: 1,
  userScalable: false,
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
  type SummaryRow = {
    cards: bigint | number;
    for_sale_cards: bigint | number;
    binders: bigint | number;
    wants: bigint | number;
    sealed_units: bigint | number | null;
    feedback_count: bigint | number;
    pending_account_count: bigint | number;
  };
  const [rows, activeUsers] = await Promise.all([
    db.$queryRawUnsafe<SummaryRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM "CollectionCard"
          WHERE user_id = ? AND for_sale = 0 AND sold_at IS NULL) AS cards,
         (SELECT COUNT(*) FROM "CollectionCard"
          WHERE user_id = ? AND for_sale = 1 AND sold_at IS NULL) AS for_sale_cards,
         (SELECT COUNT(*) FROM "CollectionBinder" WHERE user_id = ?) AS binders,
         (SELECT COUNT(*) FROM "CollectionWant"
          WHERE user_id = ? AND dismissed_at IS NULL) AS wants,
         (SELECT COALESCE(SUM(quantity), 0) FROM "CollectionSealed"
          WHERE user_id = ?) AS sealed_units,
         CASE WHEN ? = 'admin'
           THEN (SELECT COUNT(*) FROM "Feedback" WHERE status = 'new')
           ELSE 0
         END AS feedback_count,
         CASE WHEN ? = 'admin'
           THEN (SELECT COUNT(*) FROM "User"
                 WHERE disabled = 1 AND approval_requested_at IS NOT NULL)
           ELSE 0
         END AS pending_account_count`,
      userId,
      userId,
      userId,
      userId,
      userId,
      role,
      role
    ),
    role === "admin" ? getAdminActiveUsersSnapshot() : Promise.resolve(null),
  ]);
  const summary = rows[0];
  const cards = Number(summary?.cards ?? 0);
  const forSaleCards = Number(summary?.for_sale_cards ?? 0);
  const binders = Number(summary?.binders ?? 0);
  const wants = Number(summary?.wants ?? 0);
  const sealedUnits = Number(summary?.sealed_units ?? 0);
  const feedbackCount = Number(summary?.feedback_count ?? 0);
  const pendingAccountCount = Number(summary?.pending_account_count ?? 0);

  return {
    cards,
    forSaleCards,
    binders,
    sealedUnits,
    wants,
    email,
    role,
    attentionCount: feedbackCount + pendingAccountCount,
    settingsAttentionCount: feedbackCount,
    activeUserCount: activeUsers?.count ?? 0,
  };
}

function AppHeader({
  authenticated,
  role,
  summary,
}: {
  authenticated: boolean;
  role: DesktopSidebarSummary["role"] | null;
  summary?: DesktopSidebarSummary | null;
}) {
  return (
    <header
      data-app-header
      className="fixed left-0 right-0 top-0 z-50 border-b border-[rgb(var(--dc-border-rgb)/0.72)] bg-[var(--dc-overlay)] backdrop-blur-xl"
    >
      <div
        data-app-header-container
        className="page-container relative mx-auto px-3 sm:px-6 lg:px-8"
      >
        <div
          data-app-header-primary-row
          className="flex h-[var(--ui-header-height)] items-center gap-[var(--ui-header-gap)]"
        >
          <Link
            href="/"
            prefetch={authenticated ? null : false}
            data-app-brand
            className="flex shrink-0 items-center gap-2.5 font-bold tracking-tight text-white transition-opacity hover:opacity-80 [font-size:var(--ui-brand-size)]"
          >
            {authenticated ? (
              <span className="relative hidden h-8 w-8 shrink-0 xl:block">
                <Image
                  src="/assets/dustycards-master-ball-d.webp"
                  alt=""
                  fill
                  priority
                  sizes="32px"
                  className="object-contain drop-shadow-[0_0_10px_rgb(var(--dc-primary-rgb)/0.55)]"
                />
              </span>
            ) : null}
            <span>DustyCards</span>
          </Link>
          {authenticated ? (
            <>
              <HeaderMobileMenu />
              <div className="flex-1 lg:hidden" />
              <div className="xl:hidden">
                <ActionCenterButton initialCount={summary?.attentionCount ?? 0} />
              </div>
              {role === "admin" ? (
                <div className="xl:hidden">
                  <AdminActiveUsersButton initialCount={summary?.activeUserCount ?? 0} />
                </div>
              ) : null}
              <HeaderSearch />
            </>
          ) : (
            <div className="flex-1" />
          )}
        </div>
        {summary ? (
          <div data-app-desktop-navigation-row>
            <HeaderNav summary={summary} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

async function AuthenticatedChrome({
  summaryPromise,
}: {
  summaryPromise: Promise<DesktopSidebarSummary>;
}) {
  const summary = await summaryPromise;
  return (
    <>
      <DesktopSidebar summary={summary} />
      <AppHeader authenticated role={summary.role} summary={summary} />
      <MobileBottomNav summary={summary} />
    </>
  );
}

async function RuntimeAppFrame({ children }: { children: React.ReactNode }) {
  const browserAutoPriceRefreshEnabled = isBrowserAutoPriceRefreshEnabled();
  const [headerStore, currentUser] = await Promise.all([headers(), getCurrentUser()]);
  const initialSettings = await getServerUserSettings(currentUser?.id);
  const initialMobileViewport = detectInitialMobileViewport(headerStore);
  const sidebarSummaryPromise = currentUser
    ? getDesktopSidebarSummary(currentUser.id, currentUser.email, currentUser.role)
    : null;

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
        <AppVersionWatcher initialBuild={buildVersion} />
        {currentUser ? <RouteProgressBar /> : null}
        {currentUser ? <CollectionActionToast /> : null}
        {currentUser ? <OfflineCacheRegistration /> : null}
        {currentUser ? <NavigationStateController /> : null}
        <MobileHoverTooltip />
        {currentUser ? <MobileEdgeBackGesture /> : null}
        {currentUser ? <MobilePullToRefresh /> : null}
        {currentUser ? <AutoPriceRefreshBoot enabled={browserAutoPriceRefreshEnabled} /> : null}
        {currentUser && sidebarSummaryPromise ? (
          <Suspense
            fallback={
              <AppHeader authenticated role={currentUser.role} summary={null} />
            }
          >
            <AuthenticatedChrome summaryPromise={sidebarSummaryPromise} />
          </Suspense>
        ) : (
          <AppHeader authenticated={false} role={null} />
        )}
        <main data-app-main className="flex-1">
          {children}
        </main>
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
      <div data-app-launch-desktop-nav aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} data-app-launch-nav-link />
        ))}
      </div>
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

  body:has(> [data-app-runtime]) > [data-app-launch-shell] {
    display: none;
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

  [data-app-launch-desktop-nav] {
    position: fixed;
    inset: calc(56px + env(safe-area-inset-top, 0px)) 0 auto;
    z-index: 2;
    display: none;
    height: 44px;
    align-items: center;
    gap: 24px;
    padding: 0 24px;
    border-bottom: 1px solid var(--dc-border, #252A38);
    background: var(--dc-bg-main, #07080B);
  }

  [data-app-launch-nav-link] {
    width: 76px;
    height: 10px;
    border-radius: 999px;
    background: var(--dc-surface-hover, #1D2130);
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
    html[data-desktop-navigation="top"] [data-app-launch-desktop-nav] { display: flex; }
    html[data-desktop-navigation="top"] [data-app-launch-main] { padding-top: calc(124px + env(safe-area-inset-top, 0px)); }
    html[data-desktop-navigation="sidebar"] [data-app-launch-header] { left: 256px; }
    html[data-desktop-navigation="sidebar"] [data-app-launch-sidebar] { display: block; width: 256px; }
    html[data-desktop-navigation="sidebar"] [data-app-launch-main] { padding-left: 280px; }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-app-launch-shell] * { animation: none !important; }
  }
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${geist.variable} h-full antialiased dark ui-scale-medium`}
      data-theme="system"
      data-appearance={defaultAppearance.preset}
      data-appearance-scheme="dark"
      data-ui-scale="medium"
      data-desktop-navigation="top"
      style={defaultAppearanceStyles as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://assets.tcgdex.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.tcggo.com" />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: initSettingsScript }} />
        <style dangerouslySetInnerHTML={{ __html: prepaintThemeStyles }} />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-white">
        <AppLaunchShell />
        <Suspense fallback={null}>
          <RuntimeAppFrame>{children}</RuntimeAppFrame>
        </Suspense>
      </body>
    </html>
  );
}
