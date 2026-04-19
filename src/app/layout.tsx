import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import Link from "next/link";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import HeaderSearch from "@/components/HeaderSearch";
import SettingsProvider from "@/components/SettingsProvider";
import { parseCookieSettings, SETTINGS_COOKIE_NAME } from "@/lib/user-settings";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DustyCards",
  description: "Pokemon TCG Card Database",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialSettings = parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value);

  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <head />
      <body className="min-h-full flex flex-col bg-[#f2f2f7] dark:bg-black transition-colors duration-200">
        <SettingsProvider initialSettings={initialSettings}>
          <AutoPriceRefreshBoot />
          <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/90 backdrop-blur-xl border-b border-black/8 dark:border-white/8">
            <nav className="page-container mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Link href="/" className="shrink-0 font-semibold text-base text-gray-900 dark:text-white tracking-tight hover:opacity-70 transition-opacity">
                DustyCards
              </Link>
              <div className="hidden shrink-0 items-center gap-5 md:flex">
                <Link href="/expansions" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">
                  Expansions
                </Link>
                <Link href="/illustrators" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">
                  Illustrators
                </Link>
              </div>
              <HeaderSearch />
              <div className="flex-1 md:hidden" />
              <Link href="/settings" className="shrink-0 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">
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
