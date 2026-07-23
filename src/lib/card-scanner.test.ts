import { describe, expect, it } from "vitest";
import {
  extractScannerCardReferences,
  canAutoAcceptScannerCandidate,
  getScannerAttackObservation,
  getScannerAttackSimilarity,
  getScannerConfidence,
  getScannerNameObservation,
  getScannerNumberObservation,
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

  it("stores a card name only after a clear catalog lead", () => {
    expect(
      getScannerNameObservation(
        [OTHER_CARD, SEISMITOAD],
        "Seismitoad\nStage 1\n170 HP"
      )
    ).toMatchObject({ value: "Seismitoad", confidence: 100 });
    expect(
      getScannerNameObservation([OTHER_CARD, SEISMITOAD], "Stage 1\nAbility")
    ).toBeNull();
  });

  it("keeps a readable base name when suffix variants share the same Pokemon", () => {
    const victini = {
      ...SEISMITOAD,
      id: "victini",
      name: "Victini",
    };
    expect(
      getScannerNameObservation(
        [
          victini,
          { ...victini, id: "victini-ex", name: "Victini ex" },
          { ...victini, id: "victini-v", name: "Victini V" },
          OTHER_CARD,
        ],
        "ctini"
      )
    ).toMatchObject({ value: "Victini" });
    expect(
      getScannerNameObservation(
        [
          victini,
          { ...victini, id: "bouffalant", name: "Bouffalant" },
          OTHER_CARD,
        ],
        "Fa La"
      )
    ).toBeNull();
  });

  it("stores only printed numbers that exist in the selected game catalog", () => {
    expect(
      getScannerNumberObservation(
        [OTHER_CARD, SEISMITOAD],
        "weakness\n105/086\nGAME FREAK"
      )
    ).toEqual({
      value: "105/86",
      confidence: 100,
      catalogMatches: 1,
    });
    expect(
      getScannerNumberObservation(
        [OTHER_CARD, SEISMITOAD],
        "BLK EN 1057086 GAME FREAK"
      )
    ).toEqual({
      value: "105/86",
      confidence: 100,
      catalogMatches: 1,
    });
    expect(
      getScannerNumberObservation([OTHER_CARD, SEISMITOAD], "999/999")
    ).toBeNull();
  });

  it("stores meaningful attack text without mistaking the card name for an attack", () => {
    expect(
      getScannerAttackObservation(
        [OTHER_CARD, SEISMITOAD],
        "Seismitoad\nRound\nThis attack does 70 damage for each of your Pokemon"
      )
    ).toMatchObject({
      value: expect.stringContaining("This attack does 70 damage"),
    });
    expect(
      getScannerAttackObservation([OTHER_CARD, SEISMITOAD], "Seismitoad\nStage 1")
    ).toBeNull();
  });

  it("uses a saved attack fragment as supporting candidate evidence", () => {
    expect(
      getScannerAttackSimilarity("Hyper Voice", [
        "Round",
        "Hyper Voice",
        "This attack does 160 damage.",
      ])
    ).toBeGreaterThan(0.95);
  });
});
