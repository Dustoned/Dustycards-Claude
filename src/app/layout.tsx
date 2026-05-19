import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import Link from "next/link";
import AppVersionWatcher from "@/components/AppVersionWatcher";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import HeaderSearch from "@/components/HeaderSearch";
import DesktopSidebar, { type DesktopSidebarSummary } from "@/components/DesktopSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileHoverTooltip from "@/components/MobileHoverTooltip";
import SettingsProvider from "@/components/SettingsProvider";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  SETTINGS_COOKIE_MAX_AGE,
  SETTINGS_COOKIE_NAME,
  SETTINGS_RESOLVED_THEME_COOKIE_NAME,
  SETTINGS_STORAGE_KEY,
} from "@/lib/user-settings";
import { getServerUserSettings } from "@/lib/user-settings-server";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const BROWSER_AUTO_PRICE_REFRESH_ENV = "DUSTYCARDS_ENABLE_BROWSER_AUTO_PRICE_REFRESH";
const ENABLED_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export const metadata: Metadata = {
  title: "DustyCards",
  description: "Pokemon TCG Card Database",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

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
  const [cards, binders, wants, sealed] = await Promise.all([
    db.collectionCard.count({ where: { user_id: userId } }),
    db.collectionBinder.count({ where: { user_id: userId } }),
    db.collectionWant.count({ where: { user_id: userId, dismissed_at: null } }),
    db.collectionSealed.aggregate({
      where: { user_id: userId },
      _sum: { quantity: true },
    }),
  ]);

  return {
    cards,
    binders,
    sealedUnits: sealed._sum.quantity ?? 0,
    wants,
    email,
    role,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const currentUser = await getCurrentUser();
  const browserAutoPriceRefreshEnabled = isBrowserAutoPriceRefreshEnabled();
  const initialSettings = await getServerUserSettings(currentUser?.id);
  const initialMobileViewport = detectInitialMobileViewport(headerStore);
  const initialUiScale = initialMobileViewport
    ? initialSettings?.mobileUiScale ?? "small"
    : initialSettings?.uiScale ?? "medium";
  const initialWidescreen = !initialMobileViewport && (initialSettings?.widescreen ?? false);
  const initialTheme = initialSettings?.theme ?? "system";
  const serverDark = true;
  const sidebarSummary = currentUser
    ? await getDesktopSidebarSummary(currentUser.id, currentUser.email, currentUser.role)
    : null;
  const initialBrowserSettingsScript = `
    (function () {
      try {
        var fallbackSettings = ${JSON.stringify(initialSettings).replace(/</g, "\\u003c")};
        var settings = fallbackSettings;
        try {
          var raw = window.localStorage && window.localStorage.getItem("${SETTINGS_STORAGE_KEY}");
          var stored = raw ? JSON.parse(raw) : null;
          if (stored && typeof stored === "object") {
            settings = Object.assign({}, fallbackSettings, stored);
          }
        } catch (storageError) {}

        var theme = ["light", "dark", "system"].indexOf(settings.theme) >= 0
          ? settings.theme
          : "system";
        var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        var dark = true;
        var phone = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
        var rawUi = phone ? settings.mobileUiScale : settings.uiScale;
        var ui = ["small", "medium", "large"].indexOf(rawUi) >= 0 ? rawUi : (phone ? "small" : "medium");
        window.__dustycardsSettings = settings;
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.uiScale = ui;
        document.documentElement.classList.remove("ui-scale-small", "ui-scale-medium", "ui-scale-large");
        document.documentElement.classList.add("ui-scale-" + ui);
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.classList.toggle("widescreen", !phone && !!settings.widescreen);
        document.cookie = "${SETTINGS_COOKIE_NAME}=" + encodeURIComponent(JSON.stringify(settings)) + "; Path=/; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax";
        document.cookie = "${SETTINGS_RESOLVED_THEME_COOKIE_NAME}=" + (dark ? "dark" : "light") + "; Path=/; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax";
      } catch (error) {}
    })();
  `;
  const prepaintThemeStyles = `
    html {
      background-color: #050505;
      color-scheme: dark;
    }

    body {
      margin: 0;
      background: transparent;
    }

    [data-app-header] {
      background-color: #050505;
      border-color: rgba(255, 255, 255, 0.08);
    }

    html.dark,
    html[data-theme="dark"] {
      background-color: #050505;
      color-scheme: dark;
    }

    html.dark [data-app-header],
    html[data-theme="dark"] [data-app-header] {
      background-color: #050505;
      border-color: rgba(255, 255, 255, 0.08);
    }

    @media (prefers-color-scheme: dark) {
      html[data-theme="system"] {
        background-color: #050505;
        color-scheme: dark;
      }

      html[data-theme="system"] [data-app-header] {
        background-color: #050505;
        border-color: rgba(255, 255, 255, 0.08);
      }
    }
  `;
  const htmlClassName = [
    geist.variable,
    "h-full",
    "antialiased",
    serverDark ? "dark" : "",
    initialWidescreen ? "widescreen" : "",
    `ui-scale-${initialUiScale}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <html
      lang="en"
      className={htmlClassName}
      data-theme={initialTheme}
      data-ui-scale={initialUiScale}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialBrowserSettingsScript }} />
        <style dangerouslySetInnerHTML={{ __html: prepaintThemeStyles }} />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-white">
        <SettingsProvider
          initialSettings={initialSettings}
          initialMobileViewport={initialMobileViewport}
          syncToAccount={Boolean(currentUser)}
          currentUserRole={currentUser?.role ?? null}
        >
          <AppVersionWatcher />
          <MobileHoverTooltip />
          {currentUser && <AutoPriceRefreshBoot enabled={browserAutoPriceRefreshEnabled} />}
          {currentUser && sidebarSummary ? <DesktopSidebar summary={sidebarSummary} /> : null}
          <header
            data-app-header
            className={`fixed right-0 top-0 z-50 border-b border-white/8 bg-[#050505] ${
              currentUser ? "left-0 xl:left-[15rem]" : "left-0"
            }`}
          >
            <nav className="page-container relative mx-auto flex h-[var(--ui-header-height)] items-center gap-[var(--ui-header-gap)] px-3 sm:px-6 lg:px-8">
              <Link href="/" prefetch={false} className={`shrink-0 font-bold tracking-tight text-white transition-opacity hover:opacity-75 [font-size:var(--ui-brand-size)] ${currentUser ? "xl:hidden" : ""}`}>
                DustyCards
              </Link>
              {currentUser ? (
                <>
                  <div className="flex-1 lg:hidden" />
                  <HeaderSearch />
                </>
              ) : (
                <div className="flex-1" />
              )}
            </nav>
          </header>
          <main
            className={`flex-1 pt-[var(--ui-header-height)] ${
              currentUser ? "xl:pl-[15rem]" : ""
            }`}
          >
            {children}
          </main>
          {currentUser && <MobileBottomNav summary={sidebarSummary} />}
        </SettingsProvider>
      </body>
    </html>
  );
}
