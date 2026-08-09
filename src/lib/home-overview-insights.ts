import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import { getHomeFeaturedCards, getHomeValueDriversPreview } from "@/lib/home-page-payload";
import type { CollectionMoverItem } from "@/lib/movers";
import type { UpcomingSealedRelease } from "@/lib/sealed-movers";
import type { UpcomingSingleItem } from "@/lib/upcoming-releases";
import type { PriceSource } from "@/lib/user-settings";

const HOME_WIDGET_PREVIEW_LIMIT = 24;
const HOME_WIDGET_MOVER_TONE_LIMIT = HOME_WIDGET_PREVIEW_LIMIT / 2;

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

export interface HomeUpcomingPreviewItem {
  id: string;
  name: string;
  imageUrl: string | null;
  releaseDate: string;
  daysUntil: number;
  episodeName: string | null;
  episodeCode: string | null;
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
  href: string;
}

export interface HomeOverviewInsightsPayload {
  featuredCards: CollectionOverviewData["cards"];
  valueDrivers: CollectionValueDriversData;
  allocation: HomeAllocationSegment[];
  marketMovers: HomeMarketMoverPreviewItem[];
  cheapRarity: HomeMarketPocketPreviewItem[];
  discountWatch: HomeMarketPocketPreviewItem[];
  radarSignals: HomeSignalRadarPreviewItem[];
  wants: HomeCardListPreview;
  forSale: HomeCardListPreview;
  upcoming: HomeUpcomingPreviewItem[];
  upcomingSingles: HomeUpcomingSinglePreviewItem[];
}

export interface HomeOverviewInsightsExtras {
  movers?: CollectionMoverItem[];
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

  return {
    featuredCards: getHomeFeaturedCards(data.cards),
    valueDrivers: getHomeValueDriversPreview(data.valueDrivers),
    marketMovers: buildMarketMoverPreview(extras.movers ?? []),
    cheapRarity: buildMarketPocketPreview(extras.cheapRarity ?? []),
    discountWatch: buildMarketPocketPreview(extras.discountWatch ?? []),
    radarSignals: buildSignalRadarPreview(extras.radarSignals ?? []),
    wants: extras.wants ?? { total: 0, totalValue: null, items: [] },
    forSale: extras.forSale ?? buildForSalePreview(data),
    upcoming: (extras.upcoming ?? []).slice(0, HOME_WIDGET_PREVIEW_LIMIT).map((item) => ({
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      releaseDate: item.releaseDate,
      daysUntil: item.daysUntil,
      episodeName: item.episodeName,
      episodeCode: item.episodeCode,
    })),
    upcomingSingles: (extras.upcomingSingles ?? []).slice(0, HOME_WIDGET_PREVIEW_LIMIT).map((item) => ({
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
      href: item.libraryReference?.href ?? (item.cardId ? `/cards/${encodeURIComponent(item.cardId)}` : "/upcoming"),
    })),
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
