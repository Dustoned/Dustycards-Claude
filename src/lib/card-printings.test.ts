import { describe, expect, it } from "vitest";
import {
  buildCardIdentityFingerprint,
  getConnectedPrintingIndexes,
  getPerceptualHashSimilarity,
  getPrintingMatchType,
  getTcgdexCardId,
  type TcgDexCardIdentity,
} from "@/lib/card-printings";

const CHARIZARD_RULES: TcgDexCardIdentity = {
  category: "Pokemon",
  name: "Charizard ex",
  illustrator: "5ban Graphics",
  hp: 330,
  types: ["Darkness"],
  evolveFrom: "Charmeleon",
  stage: "Stage2",
  suffix: "ex",
  abilities: [
    {
      type: "Ability",
      name: "Infernal Reign",
      effect: "Search your deck for up to 3 Basic Fire Energy cards.",
    },
  ],
  attacks: [
    {
      cost: ["Fire", "Fire"],
      name: "Burning Darkness",
      effect: "This attack does 30 more damage for each Prize card taken.",
      damage: "180+",
    },
  ],
  weaknesses: [{ type: "Grass", value: "×2" }],
  retreat: 2,
};

describe("card printings", () => {
  it("derives the canonical TCGdex id from an artwork URL", () => {
    expect(
      getTcgdexCardId({
        image_url: "https://assets.tcgdex.net/en/sv/sv04.5/054/high.webp",
        tcgid: "sv4pt5-54",
      })
    ).toBe("sv04.5-054");
  });

  it("derives TCGdex subset ids for Trainer and Galarian Gallery cards", () => {
    expect(
      getTcgdexCardId({
        image_url: "https://assets.tcgdex.net/en/swsh/swsh11/TG30/high.webp",
        tcgid: "swsh11tg-TG30",
      })
    ).toBe("swsh11.5tg-TG30");
    expect(
      getTcgdexCardId({
        image_url: "https://assets.tcgdex.net/en/swsh/swsh12.5/GG01/high.webp",
        tcgid: "swsh12pt5gg-GG01",
      })
    ).toBe("swsh12.5gg-GG01");
  });

  it("accepts identical rules when a treatment uses visibly different artwork", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        CHARIZARD_RULES,
        0.59
      )
    ).toBe("reprint");
  });

  it("matches a visually equivalent reprint when the complete card rules are equal", () => {
    expect(
      getPrintingMatchType(CHARIZARD_RULES, {
        ...CHARIZARD_RULES,
        name: "  CHARIZARD EX ",
        abilities: CHARIZARD_RULES.abilities?.map((ability) => ({
          ...ability,
          effect: `  ${ability.effect}  `,
        })),
      }, 0.74)
    ).toBe("reprint");
  });

  it("accepts a rules-verified rainbow treatment below the normal artwork threshold", () => {
    expect(getPrintingMatchType(CHARIZARD_RULES, CHARIZARD_RULES, 0.645)).toBe("reprint");
  });

  it("accepts an exact gold, promo or jumbo variant even when art and illustrator differ", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        { ...CHARIZARD_RULES, illustrator: "Promo Studio" },
        0.28
      )
    ).toBe("reprint");
  });

  it("accepts an exact promo variant when the provider omits its illustrator", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        { ...CHARIZARD_RULES, illustrator: undefined },
        0.24
      )
    ).toBe("reprint");
  });

  it("accepts an updated reprint lineage when move names and art still match", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        {
          ...CHARIZARD_RULES,
          hp: 340,
          abilities: CHARIZARD_RULES.abilities?.map((ability) => ({
            ...ability,
            effect: "Modernized rules wording.",
          })),
          attacks: CHARIZARD_RULES.attacks?.map((attack) => ({
            ...attack,
            damage: "200+",
          })),
        },
        0.61
      )
    ).toBe("reprint");
  });

  it("accepts matching core rules when optional source metadata is absent", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        {
          ...CHARIZARD_RULES,
          weaknesses: undefined,
          resistances: undefined,
        },
        0.637
      )
    ).toBe("reprint");
  });

  it("normalizes historical power labels before comparing otherwise identical reprints", () => {
    const fossilGengar: TcgDexCardIdentity = {
      category: "Pokemon",
      name: "Gengar",
      illustrator: "Keiji Kinebuchi",
      hp: 80,
      abilities: [{
        type: "Pokémon Power",
        name: "Curse",
        effect: "Move 1 damage counter.",
      }],
      attacks: [{ name: "Dark Mind", damage: "30" }],
    };

    expect(
      getPrintingMatchType(
        fossilGengar,
        {
          ...fossilGengar,
          category: "Pokémon",
          abilities: [{
            type: "Poké-Power",
            name: "Curse",
            effect: "Move 1 damage counter.",
          }],
        },
        0.84
      )
    ).toBe("reprint");
  });

  it("uses a strong artwork match when one source lacks rule data", () => {
    expect(
      getPrintingMatchType(
        { category: "Pokémon", name: "Gengar", illustrator: "Yukiko Baba", hp: 90 },
        { category: "Pokemon", name: "Gengar", illustrator: "Yukiko Baba", hp: 90 },
        0.9
      )
    ).toBe("reprint");
  });

  it("compares same-length perceptual hashes", () => {
    expect(getPerceptualHashSimilarity("11110000", "11100000")).toBe(0.875);
    expect(getPerceptualHashSimilarity("1", "11")).toBe(0);
  });

  it("rejects different rules and imagery credited to a different illustrator", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        {
          ...CHARIZARD_RULES,
          illustrator: "Different Artist",
          attacks: [{ name: "Entirely different move", damage: "20" }],
        },
        1
      )
    ).toBeNull();
  });

  it("does not group cards merely because their name and HP match", () => {
    expect(
      getPrintingMatchType(CHARIZARD_RULES, {
        ...CHARIZARD_RULES,
        attacks: [{ cost: ["Fire"], name: "A different Charizard", damage: "90" }],
      }, 0.66)
    ).toBeNull();
  });

  it("connects treatment and alternate-art variants through a verified base printing", () => {
    const regular = CHARIZARD_RULES;
    const rainbow = { ...CHARIZARD_RULES };
    const gallery = {
      ...CHARIZARD_RULES,
      weaknesses: undefined,
      resistances: undefined,
    };
    const alternateArtwork = {
      ...CHARIZARD_RULES,
      illustrator: "Different Artist",
    };
    const similarities = [
      [1, 0.645, 0.422, 0.9],
      [0.645, 1, 0.637, 0.9],
      [0.422, 0.637, 1, 0.9],
      [0.9, 0.9, 0.9, 1],
    ];

    expect(
      getConnectedPrintingIndexes(
        [rainbow, regular, gallery, alternateArtwork],
        (leftIndex, rightIndex) => similarities[leftIndex][rightIndex]
      )
    ).toEqual([1, 2, 3]);
  });

  it("refuses weak identities without actual card rules", () => {
    expect(
      buildCardIdentityFingerprint({ category: "Pokemon", name: "Pikachu", hp: 60 })
    ).toBeNull();
  });
});
