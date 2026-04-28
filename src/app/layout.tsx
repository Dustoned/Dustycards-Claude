import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import Link from "next/link";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import HeaderSearch from "@/components/HeaderSearch";
import SettingsProvider from "@/components/SettingsProvider";
import {
  parseCookieSettings,
  parseResolvedThemeCookie,
  SETTINGS_COOKIE_NAME,
  SETTINGS_RESOLVED_THEME_COOKIE_NAME,
} from "@/lib/user-settings";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DustyCards",
  description: "Pokemon TCG Card Database",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialSettings = parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value);
  const resolvedTheme = parseResolvedThemeCookie(
    cookieStore.get(SETTINGS_RESOLVED_THEME_COOKIE_NAME)?.value
  );
  const initialTheme = initialSettings?.theme ?? "system";
  const serverDark =
    initialTheme === "dark" || (initialTheme === "system" && resolvedTheme === "dark");
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
        <style dangerouslySetInnerHTML={{ __html: prepaintThemeStyles }} />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-gray-900 dark:text-white">
        <SettingsProvider initialSettings={initialSettings}>
          <AutoPriceRefreshBoot />
          <header
            data-app-header
            className="sticky top-0 z-50 bg-white/80 dark:bg-black/90 backdrop-blur-xl border-b border-black/8 dark:border-white/8"
          >
            <nav className="page-container mx-auto flex h-[var(--ui-header-height)] items-center gap-[var(--ui-header-gap)] px-4 sm:px-6 lg:px-8">
              <Link href="/" prefetch={false} className="shrink-0 font-semibold text-gray-900 dark:text-white tracking-tight hover:opacity-70 transition-opacity [font-size:var(--ui-brand-size)]">
                DustyCards
              </Link>
              <div className="hidden shrink-0 items-center gap-[var(--ui-header-gap)] lg:flex">
                <Link href="/expansions" prefetch={false} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium [font-size:var(--ui-nav-link-size)]">
                  Expansions
                </Link>
                <Link href="/movers" prefetch={false} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium [font-size:var(--ui-nav-link-size)]">
                  Movers
                </Link>
                <Link href="/illustrators" prefetch={false} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium [font-size:var(--ui-nav-link-size)]">
                  Illustrators
                </Link>
              </div>
              <HeaderSearch />
              <div className="flex-1 md:hidden" />
              <Link href="/settings" prefetch={false} className="shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium [font-size:var(--ui-nav-link-size)]">
                Settings
              </Link>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </SettingsProvider>
      </body>
    </html>
  );
}
