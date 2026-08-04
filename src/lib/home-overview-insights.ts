import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";
import { getHomeFeaturedCards, getHomeValueDriversPreview } from "@/lib/home-page-payload";

export type HomeAllocationTone = "sky" | "emerald" | "amber" | "rose";

export interface HomeAllocationSegment {
  key: string;
  label: string;
  itemCount: number;
  value: number;
  tone: HomeAllocationTone;
}

export interface HomeOverviewInsightsPayload {
  featuredCards: CollectionOverviewData["cards"];
  valueDrivers: CollectionValueDriversData;
  allocation: HomeAllocationSegment[];
}

function isGraded(item: { grading_company: string | null; grading_grade: string | null }) {
  return Boolean(item.grading_company && item.grading_grade);
}

function sumCardValue(items: CollectionOverviewData["cards"]): number {
  return Number(items.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2));
}

export function buildHomeOverviewInsights(
  data: CollectionOverviewData
): HomeOverviewInsightsPayload {
  const rawLoose = data.looseSingles.filter((item) => !isGraded(item));
  const rawBinder = data.binderCards.filter((item) => !isGraded(item));
  const graded = data.cards.filter(isGraded);
  const sealedUnits = data.sealed.reduce((total, item) => total + item.quantity, 0);
  const sealedValue = Number(
    data.sealed
      .reduce(
        (total, item) => total + (item.current_value_per_item ?? 0) * item.quantity,
        0
      )
      .toFixed(2)
  );

  return {
    featuredCards: getHomeFeaturedCards(data.cards),
    valueDrivers: getHomeValueDriversPreview(data.valueDrivers),
    allocation: [
      {
        key: "loose-raw",
        label: "Loose Raw",
        itemCount: rawLoose.length,
        value: sumCardValue(rawLoose),
        tone: "sky" as const,
      },
      {
        key: "binder-raw",
        label: "Binder Raw",
        itemCount: rawBinder.length,
        value: sumCardValue(rawBinder),
        tone: "emerald" as const,
      },
      {
        key: "graded",
        label: "Graded",
        itemCount: graded.length,
        value: sumCardValue(graded),
        tone: "amber" as const,
      },
      {
        key: "sealed",
        label: "Sealed",
        itemCount: sealedUnits,
        value: sealedValue,
        tone: "rose" as const,
      },
    ].filter((segment) => segment.itemCount > 0 || segment.value > 0),
  };
}
