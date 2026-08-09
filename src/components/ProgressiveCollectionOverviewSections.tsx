import CollectionOverviewSections from "@/components/CollectionOverviewSections";
import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import type { TradingCardGameFilter } from "@/lib/games";

export function CompleteCollectionSkeleton() {
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

/**
 * Server-streamed complete collection. The old version waited for hydration
 * and then made a second authenticated browser request, leaving phones on a
 * skeleton for noticeably longer. Suspense now starts this work with the page
 * request and streams the finished grid into the existing shell.
 */
export default async function ProgressiveCollectionOverviewSections({
  userId,
  game,
  binderWatchMinPrice,
}: {
  userId: string;
  game: TradingCardGameFilter;
  binderWatchMinPrice: number;
}) {
  const data = await getCachedCollectionOverviewData({
    userId,
    activeTab: "complete",
    game,
  });
  // Complete Collection must remain ownership-only even when a cached server
  // payload was produced around the same moment as a For Sale transition.
  const activeLooseSingles = data.looseSingles.filter(
    (item) => item.for_sale !== true && item.sold_at == null
  );
  const gradedLooseSingles = activeLooseSingles.filter(
    (item) => Boolean(item.grading_company && item.grading_grade)
  );
  const rawLooseSingles = activeLooseSingles.filter(
    (item) => !item.grading_company || !item.grading_grade
  );
  // The complete tab uses binder cards only for Binder Watch. Sending every
  // card in every binder made a typical account serialize more than 1 MB of
  // card data even though the UI immediately filtered almost all of it out.
  // Apply the account's watch threshold on the server and keep the complete
  // binder inventory on the dedicated Binders tab.
  const binderWatchCards = data.binderCards.filter(
    (item) =>
      item.for_sale !== true &&
      item.sold_at == null &&
      (item.current_value ?? 0) >= binderWatchMinPrice
  );

  return (
    <CollectionOverviewSections
      gradedLooseSingles={gradedLooseSingles}
      rawLooseSingles={rawLooseSingles}
      showRawLooseSinglesSection={rawLooseSingles.length > 0}
      binderCards={binderWatchCards}
      sealed={data.sealed}
      binders={data.binders}
    />
  );
}
