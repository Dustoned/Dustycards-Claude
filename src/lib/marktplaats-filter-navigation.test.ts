import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildSellingInventoryTabsKey } from "@/lib/marktplaats-filter-navigation";

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

  it("uses native GET forms so filter clicks cannot reuse stale prefetched content", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/MarktplaatsDealsPanel.tsx"),
      "utf8",
    );

    expect(source).toContain('id="marktplaats-filters"');
    expect(source).toContain('<form action="/#marktplaats-filters" method="get">');
    expect(source).toContain('<button\n        type="submit"');
    expect(source).not.toContain("Next-Router-Prefetch");
  });
});
