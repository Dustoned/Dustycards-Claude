import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import {
  getHomeFeaturedCards,
  getHomeFeaturedSealed,
  getHomeValueDriversPreview,
} from "@/lib/home-page-payload";
import type { CollectionMoverItem } from "@/lib/movers";
import type { UpcomingSealedRelease } from "@/lib/sealed-movers";
import type { UpcomingSingleItem } from "@/lib/upcoming-releases";
import { groupUpcomingSingles } from "@/lib/upcoming-single-groups";
import type { PriceSource } from "@/lib/user-settings";

const HOME_WIDGET_PREVIEW_LIMIT = 24;
const HOME_WIDGET_MOVER_TONE_LIMIT = HOME_WIDGET_PREVIEW_LIMIT / 2;
const HOME_UPCOMING_SINGLE_GROUP_LIMIT = 4;
const HOME_UPCOMING_SINGLE_CARDS_PER_GROUP = HOME_WIDGET_PREVIEW_LIMIT;

export type HomeAllocationTone = "sky" | "emerald" | "amber" | "rose";

export interface HomeAllocationSegment {
  key: string;
  label: string;
  itemCount: number;
  value: number;
  tone: HomeAllocationTone;
}

export interface HomeMarketMoverPreviewItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  currentPrice: number;
  currency: "EUR" | "USD";
  change: number;
  changePct: number | null;
  windowDays: 7 | 30;
}

export interface HomeSignalRadarPreviewItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  currentPrice: number | null;
  currency: "EUR" | "USD";
  score: number;
  confidence: ExternalCardSignal["confidence"];
  pressureLabel: ExternalCardSignal["pressureLabel"];
}

export interface HomeListCardPreviewItem {
  cardId: string;
  name: string;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: "EUR" | "USD";
}

export interface HomeCardListPreview {
  total: number;
  totalValue: number | null;
  marketValue?: number | null;
  items: HomeListCardPreviewItem[];
}

export interface HomeMarketPocketPreviewItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  rarity: string | null;
  currentPrice: number;
  currency: "EUR" | "USD";
  gapToPeakPct: number | null;
  opportunityScore: number;
}

export interface HomeGradedPreviewItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  currentPrice: number;
  currency: "EUR" | "USD";
  gradedLabel: string | null;
  change: number | null;
  changePct: number | null;
  windowDays: 7 | 30;
  rawPrice: number | null;
  gradedPrice: number | null;
  expectedGain: number | null;
  expectedMultiplier: number | null;
  score: number | null;
}

export interface HomeUpcomingPreviewItem {
  id: string;
  productId: string | null;
  name: string;
  imageUrl: string | null;
  releaseDate: string;
  daysUntil: number;
  episodeId: string | null;
  episodeName: string | null;
  episodeCode: string | null;
  sourceName: string;
  sourceUrl: string | null;
}

export interface HomeUpcomingSinglePreviewItem {
  id: string;
  cardId: string | null;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  releaseDate: string | null;
  rarity: string | null;
  status: UpcomingSingleItem["status"];
  episodeId: string | null;
}

export interface HomeUpcomingSinglePreviewGroup {
  key: string;
  name: string;
  releaseDate: string | null;
  total: number;
  numberedCount: number;
  nearComplete: boolean;
  sources: string[];
  statuses: Record<UpcomingSingleItem["status"], number>;
  items: HomeUpcomingSinglePreviewItem[];
}

export interface HomeOverviewInsightsPayload {
  featuredCards: CollectionOverviewData["cards"];
  featuredSealed: CollectionOverviewData["sealed"];
  valueDrivers: CollectionValueDriversData;
  allocation: HomeAllocationSegment[];
  marketMovers: HomeMarketMoverPreviewItem[];
  gradedMovers: HomeGradedPreviewItem[];
  gradingTargets: HomeGradedPreviewItem[];
  cheapRarity: HomeMarketPocketPreviewItem[];
  discountWatch: HomeMarketPocketPreviewItem[];
  radarSignals: HomeSignalRadarPreviewItem[];
  wants: HomeCardListPreview;
  forSale: HomeCardListPreview;
  upcoming: HomeUpcomingPreviewItem[];
  upcomingSingles: HomeUpcomingSinglePreviewItem[];
  upcomingSingleGroups: HomeUpcomingSinglePreviewGroup[];
  upcomingSinglesTotal: number;
}

export interface HomeOverviewInsightsExtras {
  movers?: CollectionMoverItem[];
  gradedMovers?: CollectionMoverItem[];
  gradingTargets?: CollectionMoverItem[];
  cheapRarity?: CollectionMoverItem[];
  discountWatch?: CollectionMoverItem[];
  radarSignals?: ExternalCardSignal[];
  wants?: HomeCardListPreview;
  forSale?: HomeCardListPreview;
  upcoming?: UpcomingSealedRelease[];
  upcomingSingles?: UpcomingSingleItem[];
}

function isGraded(item: { grading_company: string | null; grading_grade: string | null }) {
  return Boolean(item.grading_company && item.grading_grade);
}

function sumCardValue(items: CollectionOverviewData["cards"]): number {
  return Number(items.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2));
}

function buildMarketMoverPreview(items: CollectionMoverItem[]): HomeMarketMoverPreviewItem[] {
  const candidates = items
    .filter((item) => item.priceQuality.status !== "suspicious")
    .flatMap((item) => {
      const useSevenDays = item.change7d != null && item.change7d !== 0;
      const change = useSevenDays ? item.change7d : item.change30d;
      const changePct = useSevenDays ? item.change7dPct : item.change30dPct;
      if (change == null || !Number.isFinite(change) || change === 0) return [];
      return [{ item, change, changePct, windowDays: useSevenDays ? 7 as const : 30 as const }];
    });
  const gains = candidates
    .filter((candidate) => candidate.change > 0)
    .sort((left, right) => right.change - left.change)
    .slice(0, HOME_WIDGET_MOVER_TONE_LIMIT);
  const drops = candidates
    .filter((candidate) => candidate.change < 0)
    .sort((left, right) => left.change - right.change)
    .slice(0, HOME_WIDGET_MOVER_TONE_LIMIT);

  return [...gains, ...drops].map(({ item, change, changePct, windowDays }) => ({
    cardId: item.cardId,
    name: item.name,
    imageUrl: item.imageUrl,
    cardNumber: item.cardNumber,
    episodeName: item.episodeName,
    episodeCode: item.episodeCode,
    currentPrice: item.currentPrice,
    currency: item.currency,
    change,
    changePct,
    windowDays,
  }));
}

function buildSignalRadarPreview(items: ExternalCardSignal[]): HomeSignalRadarPreviewItem[] {
  return items.slice(0, HOME_WIDGET_PREVIEW_LIMIT).map((item) => ({
    cardId: item.cardId,
    name: item.name,
    imageUrl: item.imageUrl,
    cardNumber: item.cardNumber,
    episodeName: item.episodeName,
    episodeCode: item.episodeCode,
    currentPrice: item.currentPrice,
    currency: item.currency,
    score: item.externalScore,
    confidence: item.confidence,
    pressureLabel: item.pressureLabel,
  }));
}

function buildMarketPocketPreview(items: CollectionMoverItem[]): HomeMarketPocketPreviewItem[] {
  return items
    .filter((item) => item.priceQuality.status !== "suspicious")
    .slice(0, HOME_WIDGET_PREVIEW_LIMIT)
    .map((item) => ({
      cardId: item.cardId,
      name: item.name,
      imageUrl: item.imageUrl,
      cardNumber: item.cardNumber,
      episodeName: item.episodeName,
      episodeCode: item.episodeCode,
      rarity: item.rarity,
      currentPrice: item.currentPrice,
      currency: item.currency,
      gapToPeakPct: item.gapToPeakPct,
      opportunityScore: item.opportunityScore,
    }));
}

function buildGradedPreview(items: CollectionMoverItem[]): HomeGradedPreviewItem[] {
  return items.slice(0, HOME_WIDGET_PREVIEW_LIMIT).map((item) => {
    const useSevenDays = item.change7d != null && item.change7d !== 0;
    return {
      cardId: item.cardId,
      name: item.name,
      imageUrl: item.imageUrl,
      cardNumber: item.cardNumber,
      episodeName: item.episodeName,
      episodeCode: item.episodeCode,
      currentPrice: item.currentPrice,
      currency: item.currency,
      gradedLabel: item.gradedLabel,
      change: useSevenDays ? item.change7d : item.change30d,
      changePct: useSevenDays ? item.change7dPct : item.change30dPct,
      windowDays: useSevenDays ? 7 : 30,
      rawPrice: item.grading?.rawPrice ?? null,
      gradedPrice: item.grading?.gradedPrice ?? null,
      expectedGain: item.grading?.expectedGain ?? null,
      expectedMultiplier: item.grading?.expectedMultiplier ?? null,
      score: item.grading?.score ?? null,
    };
  });
}

export function buildForSalePreview(
  data: CollectionOverviewData,
  source: PriceSource = "cm_en"
): HomeCardListPreview {
  const cards = [...(data.forSaleCards ?? [])].sort(
    (left, right) =>
      (right.sale_price ?? right.current_value ?? 0) -
      (left.sale_price ?? left.current_value ?? 0)
  );
  const values = cards.map((item) => item.sale_price ?? item.current_value).filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  const marketValues = cards
    .map((item) => source === "tcp" ? item.tcp_value_eur ?? item.current_value : item.cm_value ?? item.current_value)
    .filter((value): value is number => value != null && Number.isFinite(value));

  return {
    total: cards.length,
    totalValue: Number(values.reduce((total, value) => total + value, 0).toFixed(2)),
    marketValue: Number(marketValues.reduce((total, value) => total + value, 0).toFixed(2)),
    items: cards.slice(0, HOME_WIDGET_PREVIEW_LIMIT).map((item) => ({
      cardId: item.card_id,
      name: item.name,
      cardNumber: item.card_number,
      episodeName: item.episode_name,
      episodeCode: item.episode_code,
      imageUrl: item.image_url,
      price: item.sale_price ?? item.current_value,
      currency: "EUR" as const,
    })),
  };
}

export function buildHomeOverviewInsights(
  data: CollectionOverviewData,
  extras: HomeOverviewInsightsExtras = {}
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

  const upcomingSingleGroups = groupUpcomingSingles(extras.upcomingSingles ?? []);
  const upcomingSinglePreviews = upcomingSingleGroups
    .slice(0, HOME_UPCOMING_SINGLE_GROUP_LIMIT)
    .map((group) => ({
      key: group.key,
      name: group.name,
      releaseDate: group.releaseDate,
      total: group.items.length,
      numberedCount: group.numberedCount,
      nearComplete: group.nearComplete,
      sources: group.sources,
      statuses: group.statuses,
      items: group.items
        .slice(0, HOME_UPCOMING_SINGLE_CARDS_PER_GROUP)
        .map((item) => ({
          id: item.id,
          cardId: item.cardId,
          name: item.name,
          imageUrl: item.imageUrl,
          cardNumber: item.cardNumber,
          episodeName: item.episodeName,
          episodeCode: item.episodeCode,
          releaseDate: item.releaseDate,
          rarity: item.rarity,
          status: item.status,
          episodeId: item.episodeId,
        })),
    }));

  return {
    featuredCards: getHomeFeaturedCards(data.cards),
    featuredSealed: getHomeFeaturedSealed(data.sealed),
    valueDrivers: getHomeValueDriversPreview(data.valueDrivers),
    marketMovers: buildMarketMoverPreview(extras.movers ?? []),
    gradedMovers: buildGradedPreview(extras.gradedMovers ?? []),
    gradingTargets: buildGradedPreview(extras.gradingTargets ?? []),
    cheapRarity: buildMarketPocketPreview(extras.cheapRarity ?? []),
    discountWatch: buildMarketPocketPreview(extras.discountWatch ?? []),
    radarSignals: buildSignalRadarPreview(extras.radarSignals ?? []),
    wants: extras.wants ?? { total: 0, totalValue: null, items: [] },
    forSale: extras.forSale ?? buildForSalePreview(data),
    upcoming: (extras.upcoming ?? []).slice(0, HOME_WIDGET_PREVIEW_LIMIT).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      imageUrl: item.imageUrl,
      releaseDate: item.releaseDate,
      daysUntil: item.daysUntil,
      episodeId: item.episodeId,
      episodeName: item.episodeName,
      episodeCode: item.episodeCode,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
    })),
    // Keep the original flat field deploy-compatible for clients that loaded
    // the previous bundle, while new clients render the grouped set rows.
    upcomingSingles: upcomingSinglePreviews.flatMap((group) => group.items),
    upcomingSingleGroups: upcomingSinglePreviews,
    upcomingSinglesTotal: upcomingSingleGroups.reduce((total, group) => total + group.items.length, 0),
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
