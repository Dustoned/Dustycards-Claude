import { expect, it } from "vitest";
import { isEligiblePrintFamilyPair } from "./print-family-policy";
it("requires manual review when artist metadata is missing", () => {
  expect(isEligiblePrintFamilyPair("a", "b", null, "Artist", "manual-include", 1)).toBe(true);
  expect(isEligiblePrintFamilyPair("a", "b", null, null, "manual-include", 1)).toBe(true);
  expect(isEligiblePrintFamilyPair("a", "b", null, "Artist", "strong-art", 1)).toBe(false);
});
it("never admits conflicting known artists even after manual review", () => {
  expect(isEligiblePrintFamilyPair("a", "b", "Artist A", "Artist B", "manual-include", 1)).toBe(false);
});
