// Shared report contract. No network calls or model-generated prices are trusted here.
export type CollectionCondition = "NM" | "EX" | "GD" | "LP" | "PL" | "PO" | "unknown";
export interface CollectionPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  inspected: boolean;
  visibleCards: number | null;
  notes: string;
}
export interface CollectionCrop {
  photoId: string;
  side: "front" | "back" | "detail";
  // Normalized coordinates in the oriented original photo, not a resized preview.
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface InspectedCollectionCard {
  id: string;
  cardId: string | null;
  label: string;
  duplicateOf: string | null;
  identityConfidence: number;
  identityEvidence: string;
  language: string;
  condition: CollectionCondition;
  conditionConfidence: number;
  conditionNotes: string;
  graded: boolean;
  crops: CollectionCrop[];
}
export interface CollectionInspection {
  externalId: string;
  listingUrl: string;
  title: string;
  askingPriceEur: number | null;
  highestBidEur: number | null;
  minimumBidEur: number | null;
  bidCount: number | null;
  shippingEur: number | null;
  description: string;
  risks: string;
  totalPhotos: number | null;
  photos: CollectionPhoto[];
  cards: InspectedCollectionCard[];
}
export interface CollectionCatalogQuote {
  id: string;
  name: string;
  number: string | null;
  expansion: string;
  nmEur: number | null;
  priceAt: string | null;
}
export interface CollectionInspectionView extends CollectionInspection {
  observedAt: string;
  catalog: Record<string, CollectionCatalogQuote>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Collection inspection must be an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, required = false, max = 2_000): string {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > max) throw new Error("Invalid collection inspection text.");
  return result;
}
function number(value: unknown, min: number, max: number, nullable = false): number | null {
  if (nullable && value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid collection inspection number.");
  return value;
}
function integer(value: unknown, min: number, max: number, nullable = false): number | null {
  const result = number(value, min, max, nullable);
  if (result !== null && !Number.isInteger(result)) throw new Error("Collection count must be an integer.");
  return result;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid collection inspection list.");
  return value;
}
export function collectionPhotoUrl(value: unknown): string {
  const url = new URL(text(value, true));
  // Browser loads only public marketplace images; never proxy arbitrary URLs from a report.
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["images.marktplaats.com", "images.marktplaats.nl"].includes(url.hostname)) {
    throw new Error("Collection photos must use the Marktplaats image host.");
  }
  return url.href;
}
export function normalizeCollectionInspection(input: unknown): CollectionInspection {
  const value = object(input);
  const url = new URL(text(value.listingUrl, true));
  const advertId = /^\/v\/.*\/m(\d+)(?:-|$)/.exec(url.pathname)?.[1];
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["www.marktplaats.nl", "marktplaats.nl"].includes(url.hostname) || !advertId) {
    throw new Error("Use a direct Marktplaats /v/ advert with an m-id.");
  }
  const photos = list(value.photos, 100).map((item): CollectionPhoto => {
    const photo = object(item);
    return {
      id: text(photo.id, true, 80), url: collectionPhotoUrl(photo.url),
      width: integer(photo.width, 1, 30_000)!, height: integer(photo.height, 1, 30_000)!,
      inspected: photo.inspected === true,
      visibleCards: integer(photo.visibleCards, 0, 2_000, true), notes: text(photo.notes),
    };
  });
  const photoIds = new Set(photos.map((photo) => photo.id));
  if (photoIds.size !== photos.length || new Set(photos.map((photo) => photo.url)).size !== photos.length) {
    throw new Error("Duplicate collection photo.");
  }
  const totalPhotos = integer(value.totalPhotos, 0, 1_000, true);
  if (totalPhotos !== null && totalPhotos < photos.length) throw new Error("Photo count is smaller than the gallery.");
  const cards = list(value.cards, 2_000).map((item): InspectedCollectionCard => {
    const card = object(item);
    const condition = card.condition ?? "unknown";
    if (!["NM", "EX", "GD", "LP", "PL", "PO", "unknown"].includes(String(condition))) throw new Error("Invalid photo condition.");
    const crops = list(card.crops, 20).map((entry): CollectionCrop => {
      const crop = object(entry);
      const photoId = text(crop.photoId, true, 80);
      if (!photoIds.has(photoId)) throw new Error("Crop references an unknown photo.");
      if (!["front", "back", "detail"].includes(String(crop.side))) throw new Error("Invalid crop side.");
      const x = number(crop.x, 0, 1)!;
      const y = number(crop.y, 0, 1)!;
      const width = number(crop.width, 0.001, 1)!;
      const height = number(crop.height, 0.001, 1)!;
      if (x + width > 1.000001 || y + height > 1.000001) throw new Error("Crop falls outside its photo.");
      return { photoId, side: crop.side as CollectionCrop["side"], x, y, width, height };
    });
    if (!crops.length) throw new Error("Every physical card needs at least one crop, even when unidentified.");
    return {
      id: text(card.id, true, 80), cardId: text(card.cardId, false, 200) || null,
      label: text(card.label, true, 300), duplicateOf: text(card.duplicateOf, false, 80) || null,
      identityConfidence: number(card.identityConfidence ?? 0, 0, 1)!,
      identityEvidence: text(card.identityEvidence), language: text(card.language, false, 50) || "unknown",
      condition: condition as CollectionCondition,
      conditionConfidence: number(card.conditionConfidence ?? 0, 0, 1)!,
      conditionNotes: text(card.conditionNotes), graded: card.graded === true, crops,
    };
  });
  const cardIds = new Map(cards.map((card) => [card.id, card]));
  if (cardIds.size !== cards.length) throw new Error("Duplicate physical card ID.");
  const seenCrops = new Set<string>();
  for (const card of cards) {
    if (card.identityConfidence >= 0.9 && !card.crops.some((crop) => crop.side === "front" && photos.find((photo) => photo.id === crop.photoId)?.inspected)) {
      throw new Error("An exact card match needs an inspected front photo.");
    }
    if (card.conditionConfidence >= 0.75 && card.crops.some((crop) => !photos.find((photo) => photo.id === crop.photoId)?.inspected)) {
      throw new Error("Condition evidence must come from inspected photos.");
    }
    if (card.duplicateOf) {
      const target = cardIds.get(card.duplicateOf);
      if (!target || target.id === card.id || target.duplicateOf) throw new Error("Invalid duplicate-card reference.");
    }
    for (const crop of card.crops) {
      const key = JSON.stringify(crop);
      if (seenCrops.has(key)) throw new Error("The same crop cannot identify two physical cards.");
      seenCrops.add(key);
    }
  }
  return {
    externalId: `m${advertId}`, listingUrl: `${url.origin}${url.pathname}`, title: text(value.title, true, 500),
    askingPriceEur: number(value.askingPriceEur, 0, 10_000_000, true),
    highestBidEur: number(value.highestBidEur, 0, 10_000_000, true),
    minimumBidEur: number(value.minimumBidEur, 0, 10_000_000, true),
    bidCount: integer(value.bidCount, 0, 1_000_000, true),
    shippingEur: number(value.shippingEur, 0, 100_000, true),
    description: text(value.description, true, 10_000), risks: text(value.risks, false, 5_000),
    totalPhotos, photos, cards,
  };
}

// Explicit photo-only assumptions, NOT measured condition-specific market quotes.
export const PHOTO_VALUE_FACTORS: Record<Exclude<CollectionCondition, "unknown">, readonly [number, number]> = {
  NM: [0.8, 1], EX: [0.6, 0.85], GD: [0.4, 0.65], LP: [0.3, 0.5], PL: [0.15, 0.35], PO: [0.05, 0.2],
};
export function collectionCardValue(card: InspectedCollectionCard, quote?: CollectionCatalogQuote) {
  const price = quote?.nmEur;
  const identifiable = !card.duplicateOf && !card.graded && card.identityConfidence >= 0.9 &&
    Boolean(card.identityEvidence) && /^(en|eng|english|engels)$/i.test(card.language);
  const nm = identifiable && price && Number.isFinite(price) && price > 0 && price !== 9001 ? price : null;
  const hasFront = card.crops.some((crop) => crop.side === "front");
  const hasBack = card.crops.some((crop) => crop.side === "back");
  const factors = card.condition !== "unknown" ? PHOTO_VALUE_FACTORS[card.condition] : null;
  // A front-only image cannot establish NM or the back's damage; keep only the NM reference.
  const estimable = nm !== null && factors && hasFront && hasBack && card.conditionConfidence >= 0.75 && card.conditionNotes;
  return { nm, low: estimable ? nm * factors[0] : null, high: estimable ? nm * factors[1] : null };
}
export function summarizeCollection(inspection: CollectionInspectionView) {
  const physical = inspection.cards.filter((card) => !card.duplicateOf);
  const values = physical.map((card) => collectionCardValue(card, inspection.catalog[card.cardId ?? ""]));
  const inspected = inspection.photos.filter((photo) => photo.inspected).length;
  const photoCoverage = inspection.totalPhotos !== null && inspection.totalPhotos > 0 &&
    inspection.photos.length === inspection.totalPhotos && inspected === inspection.totalPhotos;
  const cropCoverage = inspection.photos.every((photo) => photo.visibleCards !== null &&
    inspection.cards.filter((card) => card.crops.some((crop) => crop.photoId === photo.id)).length >= photo.visibleCards);
  return {
    physicalCards: physical.length, inspectedPhotos: inspected,
    completePhotos: photoCoverage && cropCoverage,
    needsReview: !photoCoverage || !cropCoverage || !physical.length || Boolean(inspection.risks) || values.some((value) => value.low === null),
    referencedCards: values.filter((value) => value.nm !== null).length,
    estimatedCards: values.filter((value) => value.low !== null).length,
    nmTotal: values.reduce((sum, value) => sum + (value.nm ?? 0), 0),
    low: values.reduce((sum, value) => sum + (value.low ?? 0), 0),
    high: values.reduce((sum, value) => sum + (value.high ?? 0), 0),
  };
}
