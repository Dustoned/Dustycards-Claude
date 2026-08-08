import { describe, expect, it } from "vitest";
import { getTradeSuggestionTarget } from "./CardSearchPickerDialog";

describe("getTradeSuggestionTarget", () => {
  it("calculates Side B as a percentage of Side A", () => {
    expect(getTradeSuggestionTarget(1_194, 90, "multiply")).toBe(1_074.6);
  });

  it("calculates Side A back from Side B", () => {
    expect(getTradeSuggestionTarget(1_074.6, 90, "divide")).toBe(1_194);
  });

  it("requires a valid opposite-side value and percentage", () => {
    expect(getTradeSuggestionTarget(null, 90, "multiply")).toBeNull();
    expect(getTradeSuggestionTarget(1_194, 0, "divide")).toBeNull();
  });
});
