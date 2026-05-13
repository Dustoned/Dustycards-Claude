import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import Link from "next/link";
import AppVersionWatcher from "@/components/AppVersionWatcher";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import { HeaderMobileMenu, HeaderNav } from "@/components/HeaderNav";
import HeaderSearch from "@/components/HeaderSearch";
import SettingsProvider from "@/components/SettingsProvider";
import { getAppFeatures } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth";
import {
  parseResolvedThemeCookie,
  SETTINGS_RESOLVED_THEME_COOKIE_NAME,
} from "@/lib/user-settings";
import { getServerUserSettings } from "@/lib/user-settings-server";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const currentUser = await getCurrentUser();
  const initialSettings = await getServerUserSettings(currentUser?.id);
  const appFeatures = await getAppFeatures();
  const resolvedTheme = parseResolvedThemeCookie(
    cookieStore.get(SETTINGS_RESOLVED_THEME_COOKIE_NAME)?.value
  );
  const initialTheme = initialSettings?.theme ?? "system";
  const serverDark =
    initialTheme === "dark" || (initialTheme === "system" && resolvedTheme === "dark");
  const initialDisplaySettingsScript = `
    (function () {
      try {
        var settings = ${JSON.stringify({
          widescreen: initialSettings?.widescreen ?? false,
          uiScale: initialSettings?.uiScale ?? "medium",
          mobileUiScale: initialSettings?.mobileUiScale ?? "small",
        }).replace(/</g, "\\u003c")};
        var phone = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
        var rawUi = phone ? settings.mobileUiScale : settings.uiScale;
        var ui = ["small", "medium", "large"].indexOf(rawUi) >= 0 ? rawUi : (phone ? "small" : "medium");
        document.documentElement.dataset.uiScale = ui;
        document.documentElement.classList.remove("ui-scale-small", "ui-scale-medium", "ui-scale-large");
        document.documentElement.classList.add("ui-scale-" + ui);
        document.documentElement.classList.toggle("widescreen", !phone && !!settings.widescreen);
      } catch (error) {}
    })();
  `;
  const prepaintThemeStyles = `
    html {
      background-color: #f2f2f7;
      color-scheme: light;
    }

    body {
      margin: 0;
      background: transparent;
    }

    [data-app-header] {
      background-color: rgba(255, 255, 255, 0.8);
      border-color: rgba(0, 0, 0, 0.08);
    }

    html.dark,
    html[data-theme="dark"] {
      background-color: #000;
      color-scheme: dark;
    }

    html.dark [data-app-header],
    html[data-theme="dark"] [data-app-header] {
      background-color: rgba(0, 0, 0, 0.9);
      border-color: rgba(255, 255, 255, 0.08);
    }

    @media (prefers-color-scheme: dark) {
      html[data-theme="system"] {
        background-color: #000;
        color-scheme: dark;
      }

      html[data-theme="system"] [data-app-header] {
        background-color: rgba(0, 0, 0, 0.9);
        border-color: rgba(255, 255, 255, 0.08);
      }
    }
  `;
  const htmlClassName = [
    geist.variable,
    "h-full",
    "antialiased",
    serverDark ? "dark" : "",
    initialSettings?.widescreen ? "widescreen" : "",
    `ui-scale-${initialSettings?.uiScale ?? "medium"}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <html
      lang="en"
      className={htmlClassName}
      data-theme={initialTheme}
      data-ui-scale={initialSettings?.uiScale ?? "medium"}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialDisplaySettingsScript }} />
        <style dangerouslySetInnerHTML={{ __html: prepaintThemeStyles }} />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-gray-900 dark:text-white">
        <SettingsProvider
          initialSettings={initialSettings}
          appFeatures={appFeatures}
          syncToAccount={Boolean(currentUser)}
          currentUserRole={currentUser?.role ?? null}
        >
          <AppVersionWatcher />
          {currentUser && <AutoPriceRefreshBoot />}
          <header
            data-app-header
            className="fixed inset-x-0 top-0 z-50 bg-white/80 dark:bg-black/90 backdrop-blur-xl border-b border-black/8 dark:border-white/8"
          >
            <nav className="page-container relative mx-auto flex h-[var(--ui-header-height)] items-center gap-[var(--ui-header-gap)] px-3 sm:px-6 lg:px-8">
              {currentUser && (
                <HeaderMobileMenu onePieceEnabled={appFeatures.onePieceLibraryEnabled} />
              )}
              <Link href="/" prefetch={false} className="shrink-0 font-semibold text-gray-900 dark:text-white tracking-tight hover:opacity-70 transition-opacity [font-size:var(--ui-brand-size)]">
                DustyCards
              </Link>
              {currentUser ? (
                <>
                  <HeaderNav onePieceEnabled={appFeatures.onePieceLibraryEnabled} />
                  <div className="flex-1 lg:hidden" />
                  <HeaderSearch />
                </>
              ) : (
                <div className="flex-1" />
              )}
            </nav>
          </header>
          <main className="flex-1 pt-[var(--ui-header-height)]">{children}</main>
        </SettingsProvider>
      </body>
    </html>
  );
}
