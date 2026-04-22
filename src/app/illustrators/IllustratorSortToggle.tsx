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
    <div className="flex rounded-xl border border-black/8 bg-black/[0.03] p-1 dark:border-white/8 dark:bg-white/[0.03]">
      {SORT_OPTIONS.map((option) => {
        const active = activeSort === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSortChange(option.value)}
            disabled={isPending && !active}
            aria-pressed={active}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-500 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
