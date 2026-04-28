import { describe, expect, it } from "vitest";
import {
  buildMoversModeHref,
  buildMoversSourceHref,
  getMoversMode,
  normalizeMoversItemScope,
  normalizeMoversPriceSource,
  normalizeMoversScope,
} from "./routing";

describe("movers routing", () => {
  it("normalizes mover scope", () => {
    expect(normalizeMoversScope("all")).toBe("all");
    expect(normalizeMoversScope("graded")).toBe("graded");
    expect(normalizeMoversScope("grading")).toBe("grading");
    expect(normalizeMoversScope("collection")).toBe("collection");
    expect(normalizeMoversScope("bad")).toBe("collection");
    expect(normalizeMoversScope(undefined)).toBe("collection");
  });

  it("normalizes mover price source", () => {
    expect(normalizeMoversPriceSource("tcp", "cm_en")).toBe("tcp");
    expect(normalizeMoversPriceSource("cm_en", "tcp")).toBe("cm_en");
    expect(normalizeMoversPriceSource("bad", "tcp")).toBe("tcp");
  });

  it("normalizes mover item scope", () => {
    expect(normalizeMoversItemScope("collection", "all")).toBe("collection");
    expect(normalizeMoversItemScope("all", "collection")).toBe("all");
    expect(normalizeMoversItemScope("bad", "all")).toBe("all");
  });

  it("maps existing scopes to the simplified mover modes", () => {
    expect(getMoversMode("collection")).toBe("raw");
    expect(getMoversMode("all")).toBe("raw");
    expect(getMoversMode("graded")).toBe("graded");
    expect(getMoversMode("grading")).toBe("targets");
  });

  it("builds mode hrefs on top of the existing scope URLs", () => {
    expect(buildMoversModeHref("/movers", "raw")).toBe("/movers");
    expect(buildMoversModeHref("/movers", "raw", "cm_en", "all")).toBe(
      "/movers?source=cm_en&scope=all"
    );
    expect(buildMoversModeHref("/movers", "graded")).toBe("/movers?scope=graded");
    expect(buildMoversModeHref("/movers", "targets")).toBe("/movers?scope=grading");
  });

  it("builds hrefs that preserve source and non-default scope", () => {
    expect(buildMoversSourceHref("/movers", "cm_en")).toBe("/movers?source=cm_en");
    expect(buildMoversSourceHref("/movers", "tcp", "all")).toBe(
      "/movers?source=tcp&scope=all"
    );
    expect(buildMoversSourceHref("/movers", "cm_en", "graded")).toBe(
      "/movers?source=cm_en&scope=graded"
    );
    expect(buildMoversSourceHref("/movers", "cm_en", "grading")).toBe(
      "/movers?source=cm_en&scope=grading"
    );
    expect(buildMoversSourceHref("/movers", "cm_en", "grading", "collection")).toBe(
      "/movers?source=cm_en&scope=grading&view=collection"
    );
  });
});
