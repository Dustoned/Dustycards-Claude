"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export default function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeQuery = pathname === "/search" ? searchParams.get("q") ?? "" : "";

  function submitSearch(formData: FormData) {
    const trimmed = String(formData.get("q") ?? "").trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(new FormData(event.currentTarget));
        }}
        className="hidden flex-1 items-center justify-center md:flex"
      >
        <div className="flex h-10 w-full max-w-xl items-center rounded-full border border-black/8 bg-black/[0.03] px-2 pl-4 shadow-sm shadow-black/5 transition-colors focus-within:border-black/15 focus-within:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.05] dark:shadow-black/20 dark:focus-within:border-white/20 dark:focus-within:bg-white/[0.07] lg:max-w-2xl">
          <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/40" />
          <input
            key={`${pathname}-${activeQuery}`}
            name="q"
            type="text"
            defaultValue={activeQuery}
            placeholder="Search cards, sealed, expansions..."
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/35"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-black/8 bg-white/80 px-3 text-xs font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/14"
          >
            Search
          </button>
        </div>
      </form>

      <Link
        href="/search"
        aria-label="Open search"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-black/[0.03] text-gray-500 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white md:hidden"
      >
        <Search className="h-4 w-4" />
      </Link>
    </>
  );
}
