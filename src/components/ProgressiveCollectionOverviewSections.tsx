"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { CompleteCollectionPayload } from "@/lib/complete-collection-payload";

const CollectionOverviewSections = dynamic(
  () => import("@/components/CollectionOverviewSections"),
  { loading: () => <CompleteCollectionSkeleton /> }
);

function CompleteCollectionSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading complete collection" aria-busy="true">
      <div className="binder-subpanel h-[4.25rem] rounded-[var(--ui-page-header-radius)] motion-safe:animate-pulse" />
      {[0, 1].map((section) => (
        <section key={section} className="space-y-2.5">
          <div className="h-5 w-36 rounded-lg bg-white/[0.07] motion-safe:animate-pulse" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="aspect-[0.72] rounded-2xl border border-white/7 bg-white/[0.035] motion-safe:animate-pulse"
              />
            ))}
          </div>
        </section>
      ))}
      <span className="sr-only">Loading collection cards and products</span>
    </div>
  );
}

export default function ProgressiveCollectionOverviewSections({
  endpoint,
}: {
  endpoint: string;
}) {
  const [payload, setPayload] = useState<CompleteCollectionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const nextPayload = (await response.json()) as CompleteCollectionPayload;
        if (!controller.signal.aborted) setPayload(nextPayload);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load collection");
      }
    }

    void load();
    return () => controller.abort();
  }, [attempt, endpoint]);

  if (error) {
    return (
      <section className="binder-panel rounded-[var(--ui-page-header-radius)] px-4 py-8 text-center">
        <h2 className="text-base font-bold text-white">Collection could not be loaded</h2>
        <p className="mt-1 text-sm text-white/48">Your saved items are safe. Try loading this view again.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 min-h-11 rounded-xl border border-violet-300/20 bg-violet-500/15 px-5 text-sm font-bold text-violet-100 transition hover:bg-violet-500/25"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!payload) return <CompleteCollectionSkeleton />;

  return (
    <CollectionOverviewSections
      gradedLooseSingles={payload.gradedLooseSingles}
      rawLooseSingles={payload.rawLooseSingles}
      showRawLooseSinglesSection={payload.rawLooseSingles.length > 0}
      binderCards={payload.binderCards}
      sealed={payload.sealed}
      binders={payload.binders}
    />
  );
}
