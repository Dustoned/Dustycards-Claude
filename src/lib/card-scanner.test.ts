import { describe, expect, it } from "vitest";
import {
  extractScannerCardReferences,
  canAutoAcceptScannerCandidate,
  getScannerAttackObservation,
  getScannerAttackSimilarity,
  getScannerConfidence,
  getScannerNameObservation,
  getScannerNameFromUniqueReference,
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
    expect(normalizeScannerCardReference("SVP EN 210")).toBe("SVP210");
    expect(normalizeScannerCardReference("SVP 210")).toBe("SVP210");
    expect(normalizeScannerCardReference("OP16 - 056")).toBe("OP16-056");
    expect(normalizeScannerCardReference("ST29-012")).toBe("ST29-012");
  });

  it("extracts references from noisy OCR text", () => {
    expect(
      extractScannerCardReferences("EISmitoad\nweakness\n105/086\nGAME FREAK")
    ).toEqual(["105/86"]);
    expect(
      extractScannerCardReferences("Tornadus\nSVP EN 210\nPromo")
    ).toEqual(["SVP210"]);
    expect(extractScannerCardReferences("Mr.3(Galdino) OP16-056")).toEqual(["OP16-056"]);
  });

  it("matches an SV promo from either its printed prefix or centred local number", () => {
    const promo = {
      ...SEISMITOAD,
      id: "svp-210",
      name: "Tornadus",
      card_number: "SVP 210",
      printed_card_number: null,
      rarity: "Promo",
      episode: {
        id: "svp",
        name: "SV Black Star Promos",
        code: "PR-SV",
      },
    };
    expect(getScannerNumberObservation([promo], "SVP EN 210")).toMatchObject({
      value: "SVP210",
      catalogMatches: 1,
    });
    expect(getScannerNumberObservation([promo], "210")).toMatchObject({
      value: "210",
      catalogMatches: 1,
    });
    expect(
      getScannerNumberObservation(
        [
          promo,
          {
            ...promo,
            id: "wht-78",
            card_number: "78",
            printed_card_number: "78/86",
            rarity: "Rare",
            episode: { id: "wht", name: "White Flare", code: "WHT" },
          },
        ],
        "SVP N\n27002"
      )
    ).toMatchObject({
      value: "SVP210",
      catalogMatches: 1,
    });
    expect(
      getScannerNumberObservation(
        [
          promo,
          {
            ...promo,
            id: "wht-78",
            card_number: "78",
            printed_card_number: "78/86",
            rarity: "Rare",
            episode: { id: "wht", name: "White Flare", code: "WHT" },
          },
        ],
        "2025PK N C GAME FREAK\nSVP N\n270"
      )
    ).toMatchObject({
      value: "SVP210",
    });
    expect(
      rankScannerCandidates(
        [SEISMITOAD, promo],
        "Tornadus",
        new Map(),
        new Map(),
        ["210"]
      )[0]
    ).toMatchObject({
      card: { id: "svp-210" },
      numberMatch: "exact",
    });
  });

  it("never treats an unscoped HP or attack value as a card number", () => {
    const damageNumberCard = {
      ...OTHER_CARD,
      id: "damage-number",
      name: "Another Pokemon",
      card_number: "120",
      printed_card_number: "120/198",
    };
    const fortyFiveCard = {
      ...OTHER_CARD,
      id: "damage-number-45",
      name: "Third Pokemon",
      card_number: "45",
      printed_card_number: "45/198",
    };

    expect(
      getScannerNumberObservation(
        [SEISMITOAD, OTHER_CARD, damageNumberCard, fortyFiveCard],
        "120\n100\n45\n30"
      )
    ).toBeNull();
    expect(
      getScannerNumberObservation(
        [SEISMITOAD, OTHER_CARD, damageNumberCard],
        "120/198"
      )
    ).toMatchObject({
      value: "120/198",
      catalogMatches: 1,
    });
  });

  it("requires a printed reference in automatic bands but allows a focused local number", () => {
    const promo = {
      ...SEISMITOAD,
      id: "svp-210",
      name: "Tornadus",
      card_number: "SVP 210",
      printed_card_number: null,
    };

    expect(
      getScannerNumberObservation([promo], "120\n100\n210", {
        allowBareLocalNumber: false,
      })
    ).toBeNull();
    expect(
      getScannerNumberObservation([promo], "SVP EN 210", {
        allowBareLocalNumber: false,
      })
    ).toMatchObject({ value: "SVP210", catalogMatches: 1 });
    expect(
      getScannerNumberObservation([promo], "210", {
        allowBareLocalNumber: true,
      })
    ).toMatchObject({ value: "210", catalogMatches: 1 });
  });

  it("recovers Tornadus from the noisy title visible in the iPhone capture", () => {
    const cards = [
      {
        ...SEISMITOAD,
        id: "svp-210",
        name: "Tornadus",
        card_number: "SVP 210",
        printed_card_number: null,
      },
      {
        ...OTHER_CARD,
        id: "thundurus",
        name: "Thundurus",
      },
    ];

    expect(
      getScannerNameObservation(
        cards,
        ": 200%\nTognaduss\nRC\n1\n7\nPla"
      )
    ).toMatchObject({ value: "Tornadus" });
    expect(
      getScannerNameObservation(
        cards,
        "i\nTognad u Z= a |\noF\nSwi\nN20 %\nPF"
      )
    ).toMatchObject({ value: "Tornadus" });
  });

  it("keeps an exact printed reference ahead of a stronger wrong-name guess", () => {
    const promo = {
      ...SEISMITOAD,
      id: "svp-210",
      name: "Tornadus",
      card_number: "SVP 210",
      printed_card_number: null,
      rarity: "Promo",
      episode: {
        id: "svp",
        name: "SV Black Star Promos",
        code: "PR-SV",
      },
    };
    const wrongNameSameLocalNumber = {
      ...OTHER_CARD,
      id: "other-210",
      name: "Thorton",
      card_number: "210",
      printed_card_number: "210/196",
    };
    expect(
      rankScannerCandidates(
        [wrongNameSameLocalNumber, promo],
        "Thorton",
        new Map(),
        new Map(),
        ["SVP210"]
      )[0]
    ).toMatchObject({
      card: { id: "svp-210" },
      numberMatch: "exact",
    });
  });

  it("keeps a strong fuzzy match when OCR drops the first letter", () => {
    expect(getScannerTextSimilarity("Seismitoad", "Eismitoad")).toBeGreaterThan(0.85);
  });

  it("recovers the promo name from the outlined title OCR", () => {
    const tornado = {
      ...SEISMITOAD,
      id: "svp-210",
      name: "Tornadus",
      card_number: "SVP 210",
      printed_card_number: null,
    };
    expect(
      getScannerNameObservation(
        [tornado, OTHER_CARD],
        "BASIC T\nToynadu oT\nTopnadusw"
      )
    ).toMatchObject({
      value: "Tornadus",
    });
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

  it("repairs a noisy full-art name without treating attack text as a card name", () => {
    const tornadus = {
      ...SEISMITOAD,
      id: "tornadus",
      name: "Tornadus",
    };
    expect(
      getScannerNameObservation(
        [
          tornadus,
          { ...tornadus, id: "tornadus-ex", name: "Tornadus-EX" },
          { ...tornadus, id: "thundurus", name: "Thundurus" },
          OTHER_CARD,
        ],
        "Tounaduss"
      )
    ).toMatchObject({ value: "Tornadus" });
    expect(
      getScannerNameObservation(
        [
          tornadus,
          { ...tornadus, id: "tornadus-ex", name: "Tornadus-EX" },
          { ...tornadus, id: "thundurus", name: "Thundurus" },
          OTHER_CARD,
        ],
        "Torgasis"
      )
    ).toMatchObject({ value: "Tornadus" });
    expect(
      getScannerNameObservation(
        [tornadus, { ...tornadus, id: "warp-point", name: "Warp Point" }],
        "Wrapped in Wind\nHurricane"
      )
    ).toBeNull();
  });

  it("infers a card name only when an exact printed reference has one identity", () => {
    const tornadus = {
      ...SEISMITOAD,
      id: "tornadus",
      name: "Tornadus",
      card_number: "78",
      printed_card_number: "78/86",
    };
    expect(
      getScannerNameFromUniqueReference(
        [
          tornadus,
          { ...tornadus, id: "tornadus-reverse" },
          {
            ...OTHER_CARD,
            id: "different-number",
            card_number: "12",
            printed_card_number: "12/86",
          },
        ],
        "78/86"
      )
    ).toEqual({
      value: "Tornadus",
      confidence: 100,
      catalogMatches: 2,
    });
    expect(
      getScannerNameFromUniqueReference(
        [
          tornadus,
          {
            ...OTHER_CARD,
            card_number: "78",
            printed_card_number: "78/86",
          },
        ],
        "78/86"
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
      getScannerNumberObservation(
        [OTHER_CARD, SEISMITOAD],
        "BLK EN 105086 GAME FREAK"
      )
    ).toEqual({
      value: "105/86",
      confidence: 100,
      catalogMatches: 1,
    });
    expect(
      getScannerNumberObservation(
        [OTHER_CARD, SEISMITOAD],
        "BLK EN 705/086 GAME FREAK"
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

  it("prefers an explicitly printed number over a slash inferred from unrelated stats", () => {
    expect(
      getScannerNumberObservation(
        [
          {
            ...SEISMITOAD,
            id: "tornadus",
            name: "Tornadus",
            card_number: "78",
            printed_card_number: "78/86",
          },
          {
            ...OTHER_CARD,
            id: "weight-collision",
            card_number: "138",
            printed_card_number: "138/91",
          },
        ],
        "WT: 13891\n078/086"
      )
    ).toMatchObject({ value: "78/86" });
  });

  it("repairs a supported 5/8 number confusion inside a known name family", () => {
    expect(
      getScannerNumberObservation(
        [
          {
            ...SEISMITOAD,
            id: "tornadus",
            name: "Tornadus",
            card_number: "78",
            printed_card_number: "78/86",
          },
        ],
        "075/086"
      )
    ).toMatchObject({ value: "78/86" });
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
