import { describe, expect, it } from "vitest";
import { getDisplayCardNumber } from "@/lib/card-number-display";

describe("getDisplayCardNumber", () => {
  it("shows single black star promo numbers without synthetic totals", () => {
    expect(
      getDisplayCardNumber({
        card_number: "SM241",
        printed_card_number: "SM241/SM248",
        rarity: "Promo",
        episode: { name: "SM Black Star Promos", code: "PR-SM" },
      })
    ).toBe("SM241");
  });

  it("keeps true subset totals for non-promo prefixed cards", () => {
    expect(
      getDisplayCardNumber({
        card_number: "TG23",
        printed_card_number: "TG23/TG30",
        rarity: "Trainer Gallery Rare Holo",
        episode: { name: "Brilliant Stars", code: "BRS" },
      })
    ).toBe("TG23/TG30");
  });

  it("keeps numeric secret rare totals", () => {
    expect(
      getDisplayCardNumber({
        card_number: "161",
        printed_card_number: "161/131",
        rarity: "Secret Rare",
      })
    ).toBe("161/131");
  });
});
