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
    <div className="inline-flex max-w-full flex-wrap rounded-2xl border border-white/10 bg-white/[0.04] p-1 shadow-sm shadow-black/20">
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
                ? "bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,58,237,0.26)]"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
