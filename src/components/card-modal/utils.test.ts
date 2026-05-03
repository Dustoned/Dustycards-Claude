import { describe, expect, it } from "vitest";
import { getPreferredGradedLabel } from "./utils";

describe("getPreferredGradedLabel", () => {
  it("prefers PSA 10 over higher-priced non-PSA graded rows", () => {
    expect(
      getPreferredGradedLabel([
        { label: "BGS 10", price: 420 },
        { label: "CGC 10", price: 340 },
        { label: "PSA 10", price: 300 },
      ])
    ).toBe("PSA 10");
  });

  it("falls back to another PSA row before using another grading company", () => {
    expect(
      getPreferredGradedLabel([
        { label: "BGS 10", price: 420 },
        { label: "PSA 9", price: 180 },
      ])
    ).toBe("PSA 9");
  });

  it("handles compact PSA10 labels from scraper payloads", () => {
    expect(
      getPreferredGradedLabel([
        { label: "TAG 10", price: 240 },
        { label: "PSA10 GEM MT", price: 220 },
      ])
    ).toBe("PSA10 GEM MT");
  });
});
