import { describe, expect, it } from "vitest";
import { normalizeCollectionInspection, collectionCardValue, summarizeCollection, type CollectionInspectionView } from "./marktplaats-collections";
import { normalizeMarktplaatsReport } from "./marktplaats-deals-core";

function input() {
  return {
    listingUrl: "https://www.marktplaats.nl/v/verzamelen/pokemon/m1234567890-binder?tracking=1",
    title: "Test binder", highestBidEur: 150, bidCount: 4,
    description: "Full description was checked", totalPhotos: 2,
    photos: [1, 2].map((n) => ({ id: `p${n}`, url: `https://images.marktplaats.com/${n}.jpg`, width: 1000, height: 800, inspected: true, visibleCards: 1 })),
    cards: [{
      id: "one", cardId: "known", label: "Test card", identityConfidence: 0.96, identityEvidence: "Number, artwork, set and language confirmed",
      language: "English", condition: "EX", conditionConfidence: 0.8, conditionNotes: "White edge wear visible on back",
      crops: [{ photoId: "p1", side: "front", x: 0, y: 0, width: 0.5, height: 1 }, { photoId: "p2", side: "back", x: 0, y: 0, width: 0.5, height: 1 }],
    }],
  };
}
function view(): CollectionInspectionView {
  return { ...normalizeCollectionInspection(input()), observedAt: "2026-09-04T10:00:00.000Z", catalog: { known: {
    id: "known", name: "Test card", number: "1", expansion: "Test set", nmEur: 100, priceAt: "2026-09-03T10:00:00.000Z",
  } } };
}
describe("collection photo inspections", () => {
  it("keeps bid-only adverts independent from a buy price and canonicalizes by m-id", () => {
    expect(normalizeCollectionInspection(input())).toMatchObject({ externalId: "m1234567890", askingPriceEur: null, highestBidEur: 150, shippingEur: null, bidCount: 4 });
    expect(normalizeCollectionInspection(input()).listingUrl).not.toContain("?");
  });
  it("does not confuse an invisible bid with zero", () => {
    expect(normalizeCollectionInspection({ ...input(), highestBidEur: null, bidCount: null })).toMatchObject({ highestBidEur: null, bidCount: null });
  });
  it.each(["https://evil.test/v/pokemon/m123-a", "https://marktplaats.nl.evil.test/v/pokemon/m123-a", "http://www.marktplaats.nl/v/pokemon/m123-a", "https://user:pass@www.marktplaats.nl/v/pokemon/m123-a", "https://www.marktplaats.nl/l/pokemon/"])("rejects unsafe/non-advert URLs %s", (listingUrl) => {
    expect(() => normalizeCollectionInspection({ ...input(), listingUrl })).toThrow();
  });
  it.each(["file:///etc/passwd", "http://127.0.0.1/test.jpg", "https://images.marktplaats.com.evil.test/1.jpg", "https://images.marktplaats.com:8443/a"])("rejects unsupported photo URL %s", (url) => {
    const sample = input(); sample.photos[0].url = url;
    expect(() => normalizeCollectionInspection(sample)).toThrow();
  });
  it("rejects invalid crop bounds, references and empty crops", () => {
    for (const crops of [[], [{ photoId: "missing", side: "front", x: 0, y: 0, width: 1, height: 1 }], [{ photoId: "p1", side: "front", x: 0.8, y: 0, width: 0.5, height: 1 }]]) {
      const sample = input(); sample.cards[0].crops = crops;
      expect(() => normalizeCollectionInspection(sample)).toThrow();
    }
  });
  it("rejects duplicate crops, photo ids and invalid physical duplicate links", () => {
    const sample = input(); sample.cards.push({ ...sample.cards[0], id: "two" });
    expect(() => normalizeCollectionInspection(sample)).toThrow(/same crop/);
    const other = input(); other.photos.push(other.photos[0]);
    expect(() => normalizeCollectionInspection(other)).toThrow(/Duplicate/);
    const valid = normalizeCollectionInspection(input()); valid.cards[0].duplicateOf = "missing";
    expect(() => normalizeCollectionInspection(valid)).toThrow(/duplicate-card/);
  });
  it("never claims completeness when originals or detections are missing", () => {
    const sample = view();
    expect(summarizeCollection(sample).completePhotos).toBe(true);
    sample.totalPhotos = 3;
    expect(summarizeCollection(sample).completePhotos).toBe(false);
    sample.totalPhotos = 2; sample.photos[0].visibleCards = 10;
    expect(summarizeCollection(sample).completePhotos).toBe(false);
    sample.photos[0].visibleCards = null;
    expect(summarizeCollection(sample).completePhotos).toBe(false);
  });
  it("requires actual photo inspection for confident matches", () => {
    const sample = input(); sample.photos[0].inspected = false;
    expect(() => normalizeCollectionInspection(sample)).toThrow(/inspected/);
  });
  it("calculates only disclosed heuristic ranges against catalog prices", () => {
    const sample = view();
    expect(collectionCardValue(sample.cards[0], sample.catalog.known)).toEqual({ nm: 100, low: 60, high: 85 });
    expect(summarizeCollection(sample)).toMatchObject({ physicalCards: 1, referencedCards: 1, estimatedCards: 1, nmTotal: 100, low: 60, high: 85 });
  });
  it("front-only condition is never a valuation", () => {
    const sample = view(); sample.cards[0].crops.pop(); sample.cards[0].condition = "NM";
    expect(collectionCardValue(sample.cards[0], sample.catalog.known)).toEqual({ nm: 100, low: null, high: null });
  });
  it("excludes duplicates, slabs, foreign cards, weak identity and missing prices", () => {
    for (const changes of [{ duplicateOf: "other" }, { graded: true }, { language: "Japanese" }, { identityConfidence: 0.8 }, { identityEvidence: "" }]) {
      const sample = view(); Object.assign(sample.cards[0], changes);
      expect(collectionCardValue(sample.cards[0], sample.catalog.known).nm).toBeNull();
    }
    for (const nmEur of [null, 0, 9001, Number.NaN]) {
      const sample = view(); sample.catalog.known.nmEur = nmEur;
      expect(collectionCardValue(sample.cards[0], sample.catalog.known).nm).toBeNull();
    }
  });
  it("does not trust caller-supplied totals", () => {
    const normalized = normalizeCollectionInspection({ ...input(), marketValueEur: 1_000_000, nmTotal: 1_000_000 });
    expect(normalized).not.toHaveProperty("nmTotal"); expect(normalized).not.toHaveProperty("marketValueEur");
  });
  it("extends old imports without requiring collection work", () => {
    const report = { schemaVersion: 1, scan: { id: "test", startedAt: "2026-09-04T10:00:00Z", finishedAt: "2026-09-04T11:00:00Z" }, deals: [] };
    expect(normalizeMarktplaatsReport(report).collections).toEqual([]);
    expect(normalizeMarktplaatsReport({ ...report, collections: [input()] }).collections).toHaveLength(1);
    expect(() => normalizeMarktplaatsReport({ ...report, collections: [input(), input()] })).toThrow(/Duplicate/);
    expect(() => normalizeMarktplaatsReport({ ...report, collections: [input()], removedCollectionIds: ["m1234567890"] })).toThrow(/conflicting/);
  });
});
