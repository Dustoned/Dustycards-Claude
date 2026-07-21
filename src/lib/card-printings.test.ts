import { describe, expect, it } from "vitest";
import {
  buildCardIdentityFingerprint,
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

  it("rejects identical rules when the artwork is visibly different", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        CHARIZARD_RULES,
        0.6
      )
    ).toBeNull();
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

  it("compares same-length perceptual hashes", () => {
    expect(getPerceptualHashSimilarity("11110000", "11100000")).toBe(0.875);
    expect(getPerceptualHashSimilarity("1", "11")).toBe(0);
  });

  it("rejects matching rules and imagery credited to a different illustrator", () => {
    expect(
      getPrintingMatchType(
        CHARIZARD_RULES,
        { ...CHARIZARD_RULES, illustrator: "Different Artist" },
        1
      )
    ).toBeNull();
  });

  it("does not group cards merely because their name and HP match", () => {
    expect(
      getPrintingMatchType(CHARIZARD_RULES, {
        ...CHARIZARD_RULES,
        attacks: [{ cost: ["Fire"], name: "A different Charizard", damage: "90" }],
      }, 1)
    ).toBeNull();
  });

  it("refuses weak identities without actual card rules", () => {
    expect(
      buildCardIdentityFingerprint({ category: "Pokemon", name: "Pikachu", hp: 60 })
    ).toBeNull();
  });
});
