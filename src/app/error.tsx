"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-black/60 dark:text-white/60">
        An unexpected error occurred while loading this page.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
      >
        Try again
      </button>
    </div>
  );
}
