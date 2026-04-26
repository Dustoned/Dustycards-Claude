import { describe, expect, it } from "vitest";
import { combineValueHistories } from "@/lib/collection";

describe("combineValueHistories", () => {
  it("carries sealed value forward when card history has a newer point", () => {
    const combined = combineValueHistories(
      [
        {
          date: "2026-04-24",
          label: "24 apr",
          total_market: 5000,
          priced_cards: 100,
        },
        {
          date: "2026-04-25",
          label: "25 apr",
          total_market: 5538.26,
          priced_cards: 100,
        },
      ],
      [
        {
          date: "2026-04-21",
          label: "21 apr",
          total_market: 645,
          priced_cards: 2,
        },
      ]
    );

    expect(combined.map((point) => [point.date, point.total_market])).toEqual([
      ["2026-04-21", 645],
      ["2026-04-24", 5645],
      ["2026-04-25", 6183.26],
    ]);
  });

  it("does not count a history before its first known point", () => {
    const combined = combineValueHistories(
      [
        {
          date: "2026-04-20",
          label: "20 apr",
          total_market: 100,
          priced_cards: 1,
        },
      ],
      [
        {
          date: "2026-04-22",
          label: "22 apr",
          total_market: 50,
          priced_cards: 1,
        },
      ]
    );

    expect(combined.map((point) => [point.date, point.total_market])).toEqual([
      ["2026-04-20", 100],
      ["2026-04-22", 150],
    ]);
  });
});
