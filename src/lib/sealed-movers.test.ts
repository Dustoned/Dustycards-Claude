import { describe, expect, it } from "vitest";
import { appendRowsWithoutArgumentSpread } from "./sealed-movers";

describe("sealed mover history batching", () => {
  it("appends a live-sized history result without exceeding V8's argument limit", () => {
    const source = Array.from({ length: 180_000 }, (_, index) => index);
    const target: number[] = [];

    expect(() => appendRowsWithoutArgumentSpread(target, source)).not.toThrow();
    expect(target).toHaveLength(source.length);
    expect(target.at(-1)).toBe(179_999);
  });
});
