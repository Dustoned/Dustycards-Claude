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
    <div className="page-container page-readable binder-bottom-safe mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center p-4 text-center">
      <section className="binder-panel w-full rounded-[24px] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300/75">
          Error
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Something went wrong</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          An unexpected error occurred while loading this page.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/18 hover:bg-white/[0.1]"
        >
          Try again
        </button>
      </section>
    </div>
  );
}
