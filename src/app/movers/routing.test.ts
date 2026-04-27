import { describe, expect, it } from "vitest";
import {
  buildMoversSourceHref,
  normalizeMoversPriceSource,
  normalizeMoversScope,
} from "./routing";

describe("movers routing", () => {
  it("normalizes mover scope", () => {
    expect(normalizeMoversScope("all")).toBe("all");
    expect(normalizeMoversScope("collection")).toBe("collection");
    expect(normalizeMoversScope("bad")).toBe("collection");
    expect(normalizeMoversScope(undefined)).toBe("collection");
  });

  it("normalizes mover price source", () => {
    expect(normalizeMoversPriceSource("tcp", "cm_en")).toBe("tcp");
    expect(normalizeMoversPriceSource("cm_en", "tcp")).toBe("cm_en");
    expect(normalizeMoversPriceSource("bad", "tcp")).toBe("tcp");
  });

  it("builds hrefs that preserve source and non-default scope", () => {
    expect(buildMoversSourceHref("/movers", "cm_en")).toBe("/movers?source=cm_en");
    expect(buildMoversSourceHref("/movers", "tcp", "all")).toBe(
      "/movers?source=tcp&scope=all"
    );
  });
});
