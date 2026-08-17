import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildSellingInventoryTabsKey,
  summarizeMarktplaatsFilterCounts,
} from "@/lib/marktplaats-filter-navigation";

describe("Marktplaats filter navigation", () => {
  it("remounts the selling panel for every Marktplaats filter combination", () => {
    expect(
      buildSellingInventoryTabsKey({
        sellingView: "marktplaats",
        dealKind: "raw",
        dealMatch: "review",
        dealQ: "Charizard ex",
      }),
    ).toBe("selling-marktplaats:raw:review:Charizard%20ex");

    expect(
      buildSellingInventoryTabsKey({
        sellingView: "marktplaats",
        dealKind: "graded",
        dealMatch: "review",
        dealQ: "Charizard ex",
      }),
    ).not.toBe(
      buildSellingInventoryTabsKey({
        sellingView: "marktplaats",
        dealKind: "raw",
        dealMatch: "review",
        dealQ: "Charizard ex",
      }),
    );
  });

  it("keeps stable defaults for the unfiltered and non-Marktplaats views", () => {
    expect(buildSellingInventoryTabsKey({ sellingView: "marktplaats" })).toBe(
      "selling-marktplaats:all:daily:no-query",
    );
    expect(buildSellingInventoryTabsKey({ sellingView: "sold" })).toBe(
      "selling-sold",
    );
  });

  it("filters locally without forms, navigation, or URL changes", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/MarktplaatsDealsPanel.tsx"),
      "utf8",
    );

    expect(source).toContain('id="marktplaats-filters"');
    expect(source).toContain('"use client"');
    expect(source).toContain("onClick={() => setKind");
    expect(source).toContain("onClick={() => setSelection");
    expect(source).not.toContain('<form action="/#marktplaats-filters"');
    expect(source).not.toContain("router.push");
    expect(source).not.toContain("router.replace");
  });

  it("derives every badge from the active filter combination", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => ({ kind: "raw", match_status: "matched" })),
      ...Array.from({ length: 4 }, () => ({ kind: "raw", match_status: "shortlist" })),
      { kind: "raw", match_status: "review" },
      ...Array.from({ length: 4 }, () => ({ kind: "expansion", match_status: "review" })),
      { kind: "expansion", match_status: "shortlist" },
      ...Array.from({ length: 4 }, () => ({ kind: "graded", match_status: "matched" })),
      ...Array.from({ length: 8 }, () => ({ kind: "graded", match_status: "shortlist" })),
      ...Array.from({ length: 4 }, () => ({ kind: "collection", match_status: "shortlist" })),
    ];

    expect(summarizeMarktplaatsFilterCounts(rows, "expansion", "review")).toEqual({
      categoryCounts: { raw: 1, graded: 0, expansion: 4, collection: 0 },
      allKindsCount: 5,
      currentResultCount: 4,
      dailyCount: 1,
      dealCount: 0,
      reviewCount: 4,
    });
  });
});
