import { describe, expect, it } from "vitest";
import {
  collectFirecrawlApiKeys,
  rotateFirecrawlApiKeys,
} from "@/lib/firecrawl-key-pool";

describe("Firecrawl key pool", () => {
  it("combines dedicated and pooled keys without duplicates", () => {
    expect(collectFirecrawlApiKeys({
      primary: "fc-primary",
      secondary: "fc-secondary",
      pool: "fc-third, fc-secondary\nfc-fourth",
    })).toEqual(["fc-primary", "fc-secondary", "fc-third", "fc-fourth"]);
  });

  it("rotates the first key while preserving fallback order", () => {
    expect(rotateFirecrawlApiKeys(["one", "two", "three"], 1)).toEqual([
      "two",
      "three",
      "one",
    ]);
  });
});
