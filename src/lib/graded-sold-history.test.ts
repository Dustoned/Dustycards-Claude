import { describe, expect, it } from "vitest";
import { buildGradedSoldDailyHistory } from "@/lib/graded-sold-history";

function snapshot(input: {
  day: string;
  price: number;
  company?: string;
  grade?: string;
  currency?: string;
}) {
  return {
    company: input.company ?? "PSA",
    grade: input.grade ?? "10",
    currency: input.currency ?? "USD",
    median_price: input.price,
    fetched_at: new Date(`${input.day}T12:00:00.000Z`),
  };
}

describe("buildGradedSoldDailyHistory", () => {
  it("keeps only the modeled grade in the modeled currency", () => {
    const history = buildGradedSoldDailyHistory(
      [
        snapshot({ day: "2026-01-01", price: 100 }),
        snapshot({ day: "2026-01-02", price: 110, company: "psa", grade: "10.0" }),
        snapshot({ day: "2026-01-03", price: 60, grade: "9" }),
        snapshot({ day: "2026-01-04", price: 95, currency: "EUR" }),
        snapshot({ day: "2026-01-05", price: 130, company: "BGS" }),
      ],
      { company: "PSA", grade: "10", currency: "USD" }
    );

    expect(history.map((point) => point.value)).toEqual([100, 110]);
  });

  it("collapses several sold snapshots of one day into a daily median", () => {
    const history = buildGradedSoldDailyHistory(
      [
        snapshot({ day: "2026-01-01", price: 100 }),
        snapshot({ day: "2026-01-01", price: 140 }),
        snapshot({ day: "2026-01-01", price: 120 }),
      ],
      { company: "PSA", grade: "10", currency: "USD" }
    );

    expect(history).toHaveLength(1);
    expect(history[0].value).toBe(120);
  });
});
