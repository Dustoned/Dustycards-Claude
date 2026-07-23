import { describe, expect, it } from "vitest";
import {
  extractScannerCardReferences,
  canAutoAcceptScannerCandidate,
  getScannerConfidence,
  getScannerTextSimilarity,
  normalizeScannerCardReference,
  rankScannerCandidates,
  type CardScannerCatalogCard,
} from "@/lib/card-scanner";

const SEISMITOAD: CardScannerCatalogCard = {
  id: "23190",
  game: "pokemon",
  name: "Seismitoad",
  card_number: "105",
  printed_card_number: "105/86",
  rarity: "Illustration Rare",
  image_url: "https://example.test/seismitoad.webp",
  episode: { id: "set-1", name: "Black Bolt", code: "BLK" },
};

const OTHER_CARD: CardScannerCatalogCard = {
  id: "other",
  game: "pokemon",
  name: "Charizard ex",
  card_number: "105",
  printed_card_number: "105/197",
  rarity: "Double Rare",
  image_url: "https://example.test/charizard.webp",
  episode: { id: "set-2", name: "Obsidian Flames", code: "OBF" },
};

describe("card scanner recognition", () => {
  it("normalizes printed and One Piece card references", () => {
    expect(normalizeScannerCardReference("#105/086")).toBe("105/86");
    expect(normalizeScannerCardReference("OP16 - 056")).toBe("OP16-056");
    expect(normalizeScannerCardReference("ST29-012")).toBe("ST29-012");
  });

  it("extracts references from noisy OCR text", () => {
    expect(
      extractScannerCardReferences("EISmitoad\nweakness\n105/086\nGAME FREAK")
    ).toEqual(["105/86"]);
    expect(extractScannerCardReferences("Mr.3(Galdino) OP16-056")).toEqual(["OP16-056"]);
  });

  it("keeps a strong fuzzy match when OCR drops the first letter", () => {
    expect(getScannerTextSimilarity("Seismitoad", "Eismitoad")).toBeGreaterThan(0.85);
  });

  it("ranks exact printing numbers above cards sharing only the local number", () => {
    const ranked = rankScannerCandidates(
      [OTHER_CARD, SEISMITOAD],
      "EISmi toad\nBlack Bolt\n105/086"
    );
    expect(ranked[0]?.card.id).toBe(SEISMITOAD.id);
    expect(ranked[0]?.numberMatch).toBe("exact");
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(76);
  });

  it("maps scores to cautious confidence labels", () => {
    expect(getScannerConfidence(90)).toBe("high");
    expect(getScannerConfidence(60)).toBe("medium");
    expect(getScannerConfidence(30)).toBe("low");
  });

  it("treats an exact printing number plus matching artwork as high confidence", () => {
    const ranked = rankScannerCandidates(
      [OTHER_CARD, SEISMITOAD],
      "105/086",
      new Map([[SEISMITOAD.id, 0.9]])
    );
    expect(ranked[0]?.card.id).toBe(SEISMITOAD.id);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(76);
    expect(getScannerConfidence(ranked[0]?.score ?? 0)).toBe("high");
  });

  it("only auto-accepts an exact printing with independent identity evidence", () => {
    const ranked = rankScannerCandidates(
      [OTHER_CARD, SEISMITOAD],
      "Seismitoad\nBlack Bolt\n105/086",
      new Map([[SEISMITOAD.id, 0.92]])
    );
    expect(canAutoAcceptScannerCandidate(ranked[0], ranked[1]?.score ?? null)).toBe(
      true
    );
  });

  it("never auto-accepts a shared local number or a close runner-up", () => {
    const localOnly = rankScannerCandidates(
      [OTHER_CARD, SEISMITOAD],
      "Seismitoad\n105"
    );
    expect(
      canAutoAcceptScannerCandidate(localOnly[0], localOnly[1]?.score ?? null)
    ).toBe(false);

    const exactButAmbiguous = {
      ...localOnly[0],
      numberMatch: "exact" as const,
      nameSimilarity: 0.9,
      score: 90,
    };
    expect(canAutoAcceptScannerCandidate(exactButAmbiguous, 82)).toBe(false);
  });
});
