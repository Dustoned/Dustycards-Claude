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

const megaCharizard130: EbayMatchCard = {
  id: "charizard-130",
  name: "Mega Charizard X ex",
  card_number: "130",
  rarity: "Special Illustration Rare",
  image_url: null,
  episode: {
    id: "me02",
    name: "Phantasmal Flames",
    code: "ME2",
  },
};

const megaGengar56: EbayMatchCard = {
  id: "gengar-56",
  name: "Mega Gengar ex",
  card_number: "56",
  rarity: "Double Rare",
  image_url: null,
  episode: {
    id: "pfl",
    name: "Phantasmal Flames",
    code: "PFL",
  },
};

const gengar10: EbayMatchCard = {
  id: "gengar-10",
  name: "Gengar",
  card_number: "10",
  rarity: "rare",
  image_url: null,
  episode: {
    id: "sk",
    name: "Skyridge",
    code: "SK",
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

  it("does not match same-name listings when the explicit card number is different", () => {
    const match = matchEbayListingToCard({
      title: "Mega Charizard X ex - 013/094 - Phantasmal Flames Double Rare Pokemon Card",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });

    expect(match.status).toBe("unmatched");
    expect(match.card).toBeNull();
  });

  it("does not treat slash denominators as the card number", () => {
    const wrongDenominator = matchEbayListingToCard({
      title: "Pokemon Mega Charizard X ex (13/130) Phantasmal Flames NM HOLO",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });
    const rightSlash = matchEbayListingToCard({
      title: "Pokemon Mega Charizard X ex (130/094) Phantasmal Flames NM HOLO",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });

    expect(wrongDenominator.status).toBe("unmatched");
    expect(wrongDenominator.card).toBeNull();
    expect(wrongDenominator.candidates).toEqual([]);
    expect(rightSlash.card?.id).toBe("charizard-130");
  });

  it("does not match same-name promo codes when the promo number is different", () => {
    const wrongPromo = matchEbayListingToCard({
      title: "Mega Charizard X ex MEP029 - Mega Evolution Promo Pokemon Card - NM",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });
    const rightPromoNumber = matchEbayListingToCard({
      title: "Mega Charizard X ex MEP130 - Mega Evolution Promo Pokemon Card - NM",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });

    expect(wrongPromo.status).toBe("unmatched");
    expect(wrongPromo.card).toBeNull();
    expect(rightPromoNumber.card?.id).toBe("charizard-130");
  });

  it("does not match same-name hashtag numbers when the card number is different", () => {
    const wrongHashtag = matchEbayListingToCard({
      title: "Mega Charizard X Ex Ascended Heroes Black Star Promo Holo Foil #29 Pokemon",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });
    const rightHashtag = matchEbayListingToCard({
      title: "Mega Charizard X Ex Phantasmal Flames Holo Foil #130 Pokemon",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });

    expect(wrongHashtag.status).toBe("unmatched");
    expect(wrongHashtag.card).toBeNull();
    expect(rightHashtag.card?.id).toBe("charizard-130");
  });

  it("does not review-match generic Mega Evolution listings without the Pokemon name", () => {
    const match = matchEbayListingToCard({
      title: "Mega Evolution Pokemon Cards, Reverse Holo, EX, Ultra Rare, Full Art, English NM",
      candidates: [megaCharizard130],
      requestedMode: "raw",
    });

    expect(match.status).toBe("unmatched");
    expect(match.card).toBeNull();
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

  it("does not use graded 10 as the card number when matching slabs", () => {
    const match = matchEbayListingToCard({
      title: "Graded 10 Mega Gengar ex 056/094 2025 Pokemon Phantasmal Flames Promo GM10 PFL",
      condition: "Graded",
      candidates: [gengar10, megaGengar56],
      requestedMode: "graded",
    });

    expect(match.status).toBe("matched");
    expect(match.card?.id).toBe("gengar-56");
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
