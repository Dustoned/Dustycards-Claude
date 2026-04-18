import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import Link from "next/link";
import AutoPriceRefreshBoot from "@/components/AutoPriceRefreshBoot";
import SettingsProvider, { initScript } from "@/components/SettingsProvider";
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[#f2f2f7] dark:bg-black transition-colors duration-200">
        <SettingsProvider initialSettings={initialSettings}>
          <AutoPriceRefreshBoot />
          <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/90 backdrop-blur-xl border-b border-black/8 dark:border-white/8">
            <nav className="page-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-8 h-12">
              <Link href="/" className="font-semibold text-base text-gray-900 dark:text-white tracking-tight hover:opacity-70 transition-opacity">
                DustyCards
              </Link>
              <Link href="/expansions" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">
                Expansions
              </Link>
              <div className="flex-1" />
              <Link href="/settings" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">
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
