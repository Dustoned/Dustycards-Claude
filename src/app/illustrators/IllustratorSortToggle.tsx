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
    <div className="grid w-full grid-cols-3 rounded-xl border border-white/9 bg-black/20 p-1 shadow-inner shadow-black/20 sm:w-auto">
      {SORT_OPTIONS.map((option) => {
        const active = activeSort === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSortChange(option.value)}
            disabled={isPending && !active}
            aria-pressed={active}
            className={`min-h-9 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all sm:px-3 ${
              active
                ? "bg-[linear-gradient(135deg,rgb(var(--dc-primary-rgb)/0.98),rgb(var(--dc-primary-hover-rgb)/0.92))] text-white shadow-[0_8px_22px_rgb(var(--dc-primary-rgb)/0.22)]"
                : "text-white/48 hover:bg-white/[0.055] hover:text-white disabled:opacity-60"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
