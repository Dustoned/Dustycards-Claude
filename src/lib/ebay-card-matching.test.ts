import { describe, expect, it } from "vitest";
import { matchEbayListingToCard, type EbayMatchCard } from "@/lib/ebay-card-matching";

const umbreonEx161: EbayMatchCard = {
  id: "21554",
  name: "Umbreon ex",
  card_number: "161",
  rarity: "Special Illustration Rare",
  image_url: null,
  episode: {
    id: "sv8pt5",
    name: "Prismatic Evolutions",
    code: "PRE",
  },
};

const umbreonVmax: EbayMatchCard = {
  id: "4903",
  name: "Umbreon VMAX",
  card_number: "TG23",
  rarity: "Rare Holo VMAX",
  image_url: null,
  episode: {
    id: "swsh9tg",
    name: "Brilliant Stars",
    code: "BRS",
  },
};

const plainUmbreon: EbayMatchCard = {
  id: "21452",
  name: "Umbreon",
  card_number: "59",
  rarity: "rare",
  image_url: null,
  episode: {
    id: "sv8pt5",
    name: "Prismatic Evolutions",
    code: "PRE",
  },
};

describe("eBay card matching", () => {
  it("matches Umbreon ex 161/131 Prismatic listings to the database card", () => {
    const match = matchEbayListingToCard({
      title: "UMBREON EX SIR 161/131 Prismatic Evolutions Pokemon Card",
      candidates: [umbreonEx161],
      requestedMode: "raw",
    });

    expect(match.status).toBe("matched");
    expect(match.card?.id).toBe("21554");
    expect(match.confidence).toBeGreaterThanOrEqual(82);
  });

  it("does not auto-match Japanese 161/S-P promos to Umbreon ex 161", () => {
    const match = matchEbayListingToCard({
      title: "EX/NM Pokemon Cards Umbreon PROMO 161/S-P S-P Japanese",
      candidates: [umbreonEx161],
      requestedMode: "raw",
    });

    expect(match.status).toBe("unmatched");
  });

  it("matches graded listings in graded mode", () => {
    const match = matchEbayListingToCard({
      title: "PSA 9 UMBREON ex 161/131 | Prismatic Evo SIR Full Art Pokemon Card",
      condition: "Graded",
      candidates: [umbreonEx161],
      requestedMode: "graded",
    });

    expect(match.status).toBe("matched");
    expect(match.isGradedListing).toBe(true);
    expect(match.gradingCompany).toBe("PSA");
    expect(match.gradingGrade).toBe("9");
  });

  it("keeps variant mismatches out of automatic matches", () => {
    const plainOnly = matchEbayListingToCard({
      title: "Umbreon VMAX Brilliant Stars Pokemon",
      candidates: [plainUmbreon],
      requestedMode: "raw",
    });
    const match = matchEbayListingToCard({
      title: "Umbreon VMAX Brilliant Stars Pokemon",
      candidates: [plainUmbreon, umbreonVmax],
      requestedMode: "raw",
    });

    expect(plainOnly.status).not.toBe("matched");
    expect(match.card?.id).toBe("4903");
    expect(match.card?.id).not.toBe("21452");
  });

  it("keeps accessory listings in review instead of comparing them as card deals", () => {
    const match = matchEbayListingToCard({
      title: "Umbreon EX 161/131 Prismatic Evolutions Pokemon Card TCG Novelty Keychain",
      candidates: [umbreonEx161],
      requestedMode: "raw",
    });

    expect(match.status).toBe("review");
    expect(match.reason).toBe("Accessory-looking listing");
  });
});
