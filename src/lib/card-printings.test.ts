import { describe, expect, it } from "vitest";
import {
  buildCardIdentityFingerprint,
  getArtworkHashSimilarity,
  getConnectedPrintingIndexes,
  getPerceptualHashSimilarity,
  getPrintingMatchDetails,
  getPrintingMatchType,
  getTcgdexCardId,
  haveSameKnownPrintingArtist,
  isEligiblePrintFamilyPair,
  qualifyPrintingMatchForEpisodes,
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
  it("does not publish same-set rarity variants from matching rules alone", () => {
    expect(isEligiblePrintFamilyPair("surging-sparks", "surging-sparks", "rules-exact"))
      .toBe(false);
  });

  it("keeps cross-expansion, strong-art and explicit same-set reprints", () => {
    expect(isEligiblePrintFamilyPair("fusion-strike", "lost-origin", "rules-exact"))
      .toBe(true);
    expect(isEligiblePrintFamilyPair("fusion-strike", "fusion-strike", "strong-art"))
      .toBe(true);
    expect(isEligiblePrintFamilyPair("fusion-strike", "fusion-strike", "manual-include"))
      .toBe(true);
  });

  it("requires artwork verification for automatic same-set print families", () => {
    const exactRules: ReturnType<typeof getPrintingMatchDetails> = {
      matchType: "reprint",
      method: "rules-exact",
      imageSimilarity: 0.95,
    };
    expect(qualifyPrintingMatchForEpisodes(
      "surging-sparks",
      "surging-sparks",
      exactRules
    )).toMatchObject({ method: "strong-art" });
    expect(qualifyPrintingMatchForEpisodes(
      "surging-sparks",
      "surging-sparks",
      { ...exactRules, imageSimilarity: 0.74 }
    )).toMatchObject({ method: "likely-art" });
    expect(qualifyPrintingMatchForEpisodes(
      "surging-sparks",
      "surging-sparks",
      { ...exactRules, imageSimilarity: 0.45 }
    )).toBeNull();
  });

  it("normalizes illustrator names before comparing print evidence", () => {
    expect(haveSameKnownPrintingArtist(" 5ban Graphics ", "5BAN GRAPHICS")).toBe(true);
    expect(haveSameKnownPrintingArtist("5ban Graphics", "HYOGONOSUKE")).toBe(false);
  });

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

  it("accepts identical rules when the artwork is visibly different", () => {
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
      }, 0.9)
    ).toBe("reprint");
  });

  it("uses exact full rules even when alternate artwork has weak visual similarity", () => {
    expect(getPrintingMatchDetails(CHARIZARD_RULES, CHARIZARD_RULES, 0.12)).toMatchObject({
      matchType: "reprint",
      method: "rules-exact",
    });
  });

  it("links gold, promo or trainer-gallery variants when their full rules are exact", () => {
    expect(
      getPrintingMatchDetails(
        CHARIZARD_RULES,
        { ...CHARIZARD_RULES, illustrator: "Promo Studio" },
        0.28
      )
    ).toMatchObject({ matchType: "reprint", method: "rules-exact" });
  });

  it("does not reject exact rules merely because the illustrator differs", () => {
    expect(
      getPrintingMatchDetails(
        CHARIZARD_RULES,
        { ...CHARIZARD_RULES, illustrator: "HYOGONOSUKE" },
        0.95
      )
    ).toMatchObject({ matchType: "reprint", method: "rules-exact" });
  });

  it("links exact rules when optional illustrator data is absent", () => {
    expect(
      getPrintingMatchDetails(
        CHARIZARD_RULES,
        { ...CHARIZARD_RULES, illustrator: undefined },
        0.24
      )
    ).toMatchObject({ matchType: "reprint", method: "rules-exact" });
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
        0.88
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
        0.87
      )
    ).toBe("reprint");
  });

  it("automatically accepts exact-rule matches at every artwork similarity", () => {
    expect(getPrintingMatchDetails(CHARIZARD_RULES, CHARIZARD_RULES, 0.859)).toMatchObject({
      matchType: "reprint",
      method: "rules-exact",
    });
    expect(getPrintingMatchDetails(CHARIZARD_RULES, CHARIZARD_RULES, 0.92)).toMatchObject({
      matchType: "reprint",
      method: "rules-exact",
    });
  });

  it("groups Mew VMAX regular, rainbow, alternate-art and trainer-gallery printings", () => {
    const mewVmax = {
      category: "Pokemon",
      name: "Mew VMAX",
      illustrator: "5ban Graphics",
      hp: 310,
      stage: "VMAX",
      attacks: [
        {
          cost: ["Colorless", "Colorless"],
          name: "Cross Fusion Strike",
          effect: "Choose 1 of your Benched Fusion Strike Pokemon's attacks and use it as this attack.",
        },
        {
          cost: ["Psychic", "Psychic"],
          name: "Max Miracle",
          damage: "130",
          effect: "This attack's damage isn't affected by any effects on your opponent's Active Pokemon.",
        },
      ],
      weaknesses: [{ type: "Darkness", value: "x2" }],
      resistances: [{ type: "Fighting", value: "-30" }],
      retreat: 0,
    };

    expect(
      getPrintingMatchDetails(
        mewVmax,
        { ...mewVmax, illustrator: "AKIRA EGAWA" },
        0.18
      )
    ).toMatchObject({ matchType: "reprint", method: "rules-exact" });
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
        0.95
      )
    ).toBe("reprint");
  });

  it("sends same-artist artwork matches from 68% to manual review", () => {
    const left = {
      category: "Pokemon",
      name: "Eevee & Snorlax-GX",
      illustrator: "5ban Graphics",
      hp: 270,
      attacks: [{ name: "Dump Truck Press", damage: "120+" }],
    };
    const right = { ...left, hp: 280 };

    expect(getPrintingMatchDetails(left, right, 0.68)).toMatchObject({
      matchType: "reprint",
      method: "likely-art",
    });
    expect(getPrintingMatchDetails(left, right, 0.679)).toBeNull();
  });

  it("treats provider spaces and stored hyphens as the same card name", () => {
    const left = {
      category: "Pokemon",
      name: "Rayquaza-GX",
      illustrator: "5ban Graphics",
      hp: 180,
      abilities: [{ name: "Stormy Winds" }],
      attacks: [{ name: "Dragon Break" }, { name: "Tempest GX" }],
    };
    const right = { ...left, name: "Rayquaza GX" };

    expect(getPrintingMatchDetails(left, right, 0.74)).toMatchObject({
      method: "rules-exact",
    });
  });

  it("rejects manual-review candidates with different attacks", () => {
    const left = {
      category: "Pokemon",
      name: "Rayquaza",
      illustrator: "5ban Graphics",
      hp: 120,
      attacks: [{ name: "Dragon Pulse", damage: "40" }, { name: "Shred", damage: "90" }],
    };
    const right = {
      ...left,
      attacks: [{ name: "Amazing Burst", damage: "80×" }],
    };

    expect(getPrintingMatchDetails(left, right, 0.75)).toBeNull();
  });

  it("compares same-length perceptual hashes", () => {
    expect(getPerceptualHashSimilarity("11110000", "11100000")).toBe(0.875);
    expect(getPerceptualHashSimilarity("1", "11")).toBe(0);
  });

  it("keeps card colour and tint in the visual score", () => {
    const signature = (red: number, green: number, blue: number, pixels: number) =>
      `rgb1:${Buffer.from(Array.from({ length: pixels }, () => [red, green, blue]).flat()).toString("base64")}`;
    const warm = {
      full: signature(230, 190, 30, 140),
      illustration: signature(220, 170, 20, 60),
    };
    const sameWarm = {
      full: signature(228, 188, 32, 140),
      illustration: signature(218, 168, 22, 60),
    };
    const cool = {
      full: signature(45, 100, 220, 140),
      illustration: signature(35, 80, 210, 60),
    };

    expect(getArtworkHashSimilarity(warm, sameWarm)).toBeGreaterThan(0.98);
    expect(getArtworkHashSimilarity(warm, cool)).toBeLessThan(0.7);
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

  it("only returns direct matches while accepting exact-rule alternate artwork", () => {
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
      [1, 0.9, 0.422, 0.7],
      [0.9, 1, 0.9, 0.9],
      [0.422, 0.9, 1, 0.9],
      [0.7, 0.9, 0.9, 1],
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
