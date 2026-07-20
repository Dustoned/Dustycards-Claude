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
  const gradedLooseSingles = data.looseSingles.filter(
    (item) => Boolean(item.grading_company && item.grading_grade)
  );
  const rawLooseSingles = data.looseSingles.filter(
    (item) => !item.grading_company || !item.grading_grade
  );

  return {
    gradedLooseSingles,
    rawLooseSingles,
    binderCards: data.binderCards,
    sealed: data.sealed,
    binders: data.binders,
  };
}
