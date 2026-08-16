import { describe, expect, it } from "vitest";
import {
  buildMarktplaatsExternalId,
  normalizeMarktplaatsReport,
} from "@/lib/marktplaats-deals-core";

function reportDeal(overrides: Record<string, unknown> = {}) {
  return {
    kind: "raw",
    title: "Umbreon VMAX 215/203 English",
    listingUrl: "https://www.marktplaats.nl/v/verzamelen/pokemon/a1234567890",
    cardId: "card-1",
    listingPriceEur: 100,
    shippingEur: 6.95,
    marketValueEur: 150,
    language: "ENG",
    matchConfidence: 0.96,
    descriptionChecked: true,
    descriptionSummary: "One English Near Mint Umbreon VMAX 215/203; fixed asking price.",
    offerContents: "1x Umbreon VMAX 215/203 English",
    ...overrides,
  };
}

function report(deal = reportDeal()) {
  return {
    schemaVersion: 1,
    scan: {
      id: "marktplaats-2026-08-16",
      startedAt: "2026-08-16T07:00:00.000Z",
      finishedAt: "2026-08-16T07:10:00.000Z",
      listingsChecked: 100,
    },
    deals: [deal],
  };
}

describe("normalizeMarktplaatsReport", () => {
  it("recomputes savings from the listing price without adding shipping", () => {
    const normalized = normalizeMarktplaatsReport(report());
    expect(normalized.deals[0]).toMatchObject({
      listingPriceEur: 100,
      shippingEur: 6.95,
      marketValueEur: 150,
      savingsEur: 50,
      discountPercent: 33.3,
      language: "English",
    });
  });

  it("requires exact company and grade for a matched graded card", () => {
    expect(() =>
      normalizeMarktplaatsReport(report(reportDeal({ kind: "graded", language: null })))
    ).toThrow(/exact gradingCompany and gradingGrade/i);
  });

  it("allows an uncertain raw language only as manual review", () => {
    const normalized = normalizeMarktplaatsReport(
      report(reportDeal({ language: null, matchStatus: "review" }))
    );
    expect(normalized.deals[0].matchStatus).toBe("review");
  });

  it("does not accept a definitive deal from the title alone", () => {
    expect(() =>
      normalizeMarktplaatsReport(
        report(reportDeal({ descriptionChecked: false, descriptionSummary: null }))
      )
    ).toThrow(/checked description/i);
  });

  it("rejects non-Marktplaats listing URLs and non-deals", () => {
    expect(() =>
      normalizeMarktplaatsReport(
        report(reportDeal({ listingUrl: "https://example.com/listing" }))
      )
    ).toThrow(/marktplaats\.nl/i);
    expect(() =>
      normalizeMarktplaatsReport(report(reportDeal({ listingPriceEur: 160 })))
    ).toThrow(/not below market/i);
  });

  it("accepts a description-checked daily shortlist offer above market", () => {
    const normalized = normalizeMarktplaatsReport(
      report(reportDeal({ listingPriceEur: 160, matchStatus: "shortlist" }))
    );
    expect(normalized.deals[0]).toMatchObject({
      matchStatus: "shortlist",
      savingsEur: -10,
      discountPercent: -6.7,
    });
  });

  it("applies exact-match safeguards to shortlist entries too", () => {
    expect(() =>
      normalizeMarktplaatsReport(
        report(reportDeal({ language: null, matchStatus: "shortlist" }))
      )
    ).toThrow(/explicitly English/i);
  });

  it("accepts an exact English collection with a representative card", () => {
    const normalized = normalizeMarktplaatsReport(
      report(
        reportDeal({
          kind: "collection",
          title: "English Pokémon binder collection",
          cardId: "highest-value-card",
          listingPriceEur: 200,
          marketValueEur: 300,
          offerContents: "Umbreon VMAX 215/203 plus five exact English cards",
        })
      )
    );
    expect(normalized.deals[0]).toMatchObject({
      kind: "collection",
      cardId: "highest-value-card",
      language: "English",
      savingsEur: 100,
    });
  });

  it("derives a stable external id from the listing path", () => {
    const first = buildMarktplaatsExternalId(
      "https://www.marktplaats.nl/v/verzamelen/pokemon/a123?utm_source=x"
    );
    const second = buildMarktplaatsExternalId(
      "https://www.marktplaats.nl/v/verzamelen/pokemon/a123?utm_source=y"
    );
    expect(first).toBe(second);
  });
});
