"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buildIllustratorSortCookie,
  buildIllustratorSortHref,
  ILLUSTRATOR_SORT_STORAGE_KEY,
  type IllustratorSort,
} from "@/lib/illustrators";

const SORT_OPTIONS: Array<{ value: IllustratorSort; label: string }> = [
  { value: "alpha", label: "Alphabetical" },
  { value: "cards", label: "Most cards" },
  { value: "value", label: "Most value" },
];

function persistIllustratorSort(sort: IllustratorSort) {
  try {
    window.localStorage.setItem(ILLUSTRATOR_SORT_STORAGE_KEY, sort);
  } catch {
    // Ignore storage errors and still fall back to cookies.
  }

  document.cookie = buildIllustratorSortCookie(sort);
}

export default function IllustratorSortToggle({
  activeSort,
}: {
  activeSort: IllustratorSort;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    persistIllustratorSort(activeSort);
  }, [activeSort]);

  function handleSortChange(nextSort: IllustratorSort) {
    persistIllustratorSort(nextSort);

    if (nextSort === activeSort) {
      return;
    }

    startTransition(() => {
      router.replace(buildIllustratorSortHref(nextSort), { scroll: false });
    });
  }

  return (
    <div className="inline-flex rounded-2xl border border-black/8 bg-white/75 p-1 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.04]">
      {SORT_OPTIONS.map((option) => {
        const active = activeSort === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSortChange(option.value)}
            disabled={isPending && !active}
            aria-pressed={active}
            className={`min-h-9 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-gray-900 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-900"
                : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900 disabled:opacity-60 dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
