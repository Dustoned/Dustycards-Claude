import { describe, expect, it } from "vitest";
import { selectInitialSignalRadarCards } from "@/lib/signal-radar-progressive";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";

describe("selectInitialSignalRadarCards", () => {
  it("fills the initial radar grid without duplicating new-release chase cards", () => {
    const signals = Array.from({ length: 18 }, (_, index) => ({
      cardId: `card-${index}`,
    })) as ExternalCardSignal[];
    const excluded = new Set(["card-0", "card-1", "card-2", "card-3"]);

    const initial = selectInitialSignalRadarCards(signals, excluded, 12);

    expect(initial).toHaveLength(12);
    expect(initial[0]?.cardId).toBe("card-4");
    expect(initial.some((signal) => excluded.has(signal.cardId))).toBe(false);
  });

  it("retains one marker when the chase panel owns every signal", () => {
    const signals = [{ cardId: "chase-1" }, { cardId: "chase-2" }] as ExternalCardSignal[];

    expect(
      selectInitialSignalRadarCards(signals, new Set(["chase-1", "chase-2"])).map(
        (signal) => signal.cardId
      )
    ).toEqual(["chase-1"]);
  });
});
