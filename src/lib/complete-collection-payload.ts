import type { CollectionOverviewData } from "@/lib/collection-data";
import type { CollectionCardViewItem, CollectionSealedViewItem } from "@/types/collection-view";

export interface CompleteCollectionPayload {
  gradedLooseSingles: CollectionCardViewItem[];
  rawLooseSingles: CollectionCardViewItem[];
  binderCards: CollectionCardViewItem[];
  sealed: CollectionSealedViewItem[];
  binders: CollectionOverviewData["binders"];
}

export function buildCompleteCollectionPayload(
  data: CollectionOverviewData
): CompleteCollectionPayload {
  // The collection query already excludes sale inventory. Keep a second
  // boundary here so a stale/reused payload can never merge For Sale or Sold
  // rows into Complete Collection during client navigation.
  const activeLooseSingles = data.looseSingles.filter(
    (item) => item.for_sale !== true && item.sold_at == null
  );
  const activeBinderCards = data.binderCards.filter(
    (item) => item.for_sale !== true && item.sold_at == null
  );
  const gradedLooseSingles = activeLooseSingles.filter(
    (item) => Boolean(item.grading_company && item.grading_grade)
  );
  const rawLooseSingles = activeLooseSingles.filter(
    (item) => !item.grading_company || !item.grading_grade
  );

  return {
    gradedLooseSingles,
    rawLooseSingles,
    binderCards: activeBinderCards,
    sealed: data.sealed,
    binders: data.binders,
  };
}
