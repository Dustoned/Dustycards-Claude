import { describe, expect, it } from "vitest";
import type { CollectionCardViewItem } from "@/types/collection-view";
import {
  buildFilterOptions,
  CARD_NUMBER_FALLBACK,
  collectionMetaBadge,
  compareCollectionCardItems,
  compareCollectionCardNumbers,
  comparePriceValues,
  formatMarketCurrency,
  formatSortSummary,
  getCollectionItemCostBasis,
  getCollectionItemCostBasisLabel,
  getCollectionItemPrice,
  getCollectionItemPriceCurrency,
  getCollectionSortPrice,
  getConditionBadge,
  getDefaultSortDir,
  getSortLabel,
  hasAnyVisiblePrice,
  isGradedCollectionCard,
  neutralFilterChip,
  normalizeConditionLabel,
  omitOptimisticallyMovedCollectionItems,
  rarityFilterChip,
  selectionToggleTextClass,
} from "./collection-cards-view-helpers";

function makeItem(overrides: Partial<CollectionCardViewItem> = {}): CollectionCardViewItem {
  return {
    collection_item_id: "ci-1",
    card_id: "card-1",
    name: "Pikachu",
    image_url: null,
    card_number: "025",
    rarity: "Common",
    supertype: "Pokemon",
    episode_id: "base",
    episode_name: "Base Set",
    episode_code: "BASE",
    cm_value: null,
    tcp_value: null,
    current_value: null,
    purchase_price: null,
    cost_basis_value: null,
    cost_basis_label: "Paid",
    cost_basis_source: "direct",
    condition: null,
    grading_company: null,
    grading_grade: null,
    owned: true,
    ...overrides,
  };
}

describe("buildFilterOptions", () => {
  it("counts occurrences and skips nullish/blank", () => {
    const opts = buildFilterOptions(
      ["Common", "Rare", "Common", null, "  ", undefined, "Rare"],
      []
    );
    expect(opts).toEqual(
      expect.arrayContaining([
        { value: "Common", count: 2 },
        { value: "Rare", count: 2 },
      ])
    );
    expect(opts).toHaveLength(2);
  });

  it("respects preferredOrder before alphabetic", () => {
    const opts = buildFilterOptions(
      ["Energy", "Pokemon", "Trainer"],
      ["Pokemon", "Trainer", "Energy"]
    );
    expect(opts.map((o) => o.value)).toEqual(["Pokemon", "Trainer", "Energy"]);
  });

  it("falls back to alphabetic numeric for unranked entries", () => {
    const opts = buildFilterOptions(["Z2", "A1", "B10", "B2"], []);
    expect(opts.map((o) => o.value)).toEqual(["A1", "B2", "B10", "Z2"]);
  });

  it("applies normalizeValue when given", () => {
    const opts = buildFilterOptions(
      ["pikachu", "Pikachu", "PIKACHU"],
      [],
      (v) => v?.toLowerCase().trim() ?? null
    );
    expect(opts).toEqual([{ value: "pikachu", count: 3 }]);
  });
});

describe("omitOptimisticallyMovedCollectionItems", () => {
  it("removes a single moved copy immediately", () => {
    const item = makeItem({
      collection_item_id: "ci-1",
      collection_item_ids: ["ci-1"],
      owned_count: 1,
    });

    expect(
      omitOptimisticallyMovedCollectionItems([item], new Set(["ci-1"]))
    ).toEqual([]);
  });

  it("keeps the remaining copies in a stack", () => {
    const item = makeItem({
      collection_item_id: "ci-1",
      collection_item_ids: ["ci-1", "ci-2"],
      owned_count: 2,
    });

    expect(
      omitOptimisticallyMovedCollectionItems([item], new Set(["ci-1"]))
    ).toEqual([
      expect.objectContaining({
        collection_item_id: "ci-2",
        collection_item_ids: ["ci-2"],
        owned_count: 1,
      }),
    ]);
  });
});

describe("getCollectionItemPrice", () => {
  it("uses current_value when there is a label override", () => {
    expect(
      getCollectionItemPrice(
        makeItem({ current_value: 42, current_value_label: "Graded PSA 10" }),
        "tcp"
      )
    ).toBe(42);
  });

  it("prefers tcp_value for tcp source", () => {
    expect(
      getCollectionItemPrice(
        makeItem({ cm_value: 10, tcp_value: 20 }),
        "tcp"
      )
    ).toBe(20);
  });

  it("falls back from tcp to cm to current_value", () => {
    expect(
      getCollectionItemPrice(
        makeItem({ cm_value: 5, tcp_value: null, current_value: 1 }),
        "tcp"
      )
    ).toBe(5);
  });

  it("prefers cm_value for cm source", () => {
    expect(
      getCollectionItemPrice(
        makeItem({ cm_value: 7, tcp_value: 9 }),
        "cm_en"
      )
    ).toBe(7);
  });
});

describe("getCollectionItemPriceCurrency", () => {
  it("returns EUR when current_value_label is set", () => {
    expect(
      getCollectionItemPriceCurrency(
        makeItem({ current_value_label: "Anything" }),
        "tcp"
      )
    ).toBe("EUR");
  });

  it("returns USD when tcp source has tcp_value", () => {
    expect(
      getCollectionItemPriceCurrency(makeItem({ tcp_value: 5 }), "tcp")
    ).toBe("USD");
  });

  it("returns EUR when tcp source falls back to cm", () => {
    expect(
      getCollectionItemPriceCurrency(makeItem({ tcp_value: null }), "tcp")
    ).toBe("EUR");
  });
});

describe("getCollectionSortPrice", () => {
  it("uses tcp price when sortBy=tcp", () => {
    expect(
      getCollectionSortPrice(makeItem({ cm_value: 1, tcp_value: 9 }), "tcp")
    ).toBe(9);
  });

  it("uses cm price for cm sort", () => {
    expect(
      getCollectionSortPrice(makeItem({ cm_value: 1, tcp_value: 9 }), "cm_en")
    ).toBe(1);
  });
});

describe("hasAnyVisiblePrice", () => {
  it("returns false when all price fields are nullish", () => {
    expect(hasAnyVisiblePrice(makeItem())).toBe(false);
  });

  it("returns true with current_value", () => {
    expect(hasAnyVisiblePrice(makeItem({ current_value: 1 }))).toBe(true);
  });

  it("returns true with cm_value", () => {
    expect(hasAnyVisiblePrice(makeItem({ cm_value: 1 }))).toBe(true);
  });
});

describe("getCollectionItemCostBasis / Label", () => {
  it("prefers cost_basis_value over purchase_price", () => {
    expect(
      getCollectionItemCostBasis(
        makeItem({ cost_basis_value: 50, purchase_price: 10 })
      )
    ).toBe(50);
  });

  it("falls back to purchase_price", () => {
    expect(
      getCollectionItemCostBasis(
        makeItem({ cost_basis_value: null, purchase_price: 10 })
      )
    ).toBe(10);
  });

  it("returns null when both missing", () => {
    expect(getCollectionItemCostBasis(makeItem())).toBeNull();
  });

  it("uses cost_basis_label or default", () => {
    expect(getCollectionItemCostBasisLabel(makeItem())).toBe("Paid");
    expect(
      getCollectionItemCostBasisLabel(makeItem({ cost_basis_label: "Overall Spend" }))
    ).toBe("Overall Spend");
  });
});

describe("comparePriceValues", () => {
  it("treats null as last regardless of direction", () => {
    expect(comparePriceValues(null, 5, "asc")).toBeGreaterThan(0);
    expect(comparePriceValues(5, null, "desc")).toBeLessThan(0);
  });
});

describe("compareCollectionCardNumbers", () => {
  it("sorts numerically", () => {
    expect(
      compareCollectionCardNumbers(
        makeItem({ card_number: "9" }),
        makeItem({ card_number: "10" })
      )
    ).toBeLessThan(0);
  });

  it("missing card_number sinks below known", () => {
    expect(CARD_NUMBER_FALLBACK).toBe("999999");
    expect(
      compareCollectionCardNumbers(
        makeItem({ card_number: null }),
        makeItem({ card_number: "1" })
      )
    ).toBeGreaterThan(0);
  });
});

describe("compareCollectionCardItems", () => {
  it("sortBy=number ascends", () => {
    const a = makeItem({ card_number: "1" });
    const b = makeItem({ card_number: "2" });
    expect(compareCollectionCardItems(a, b, "number", "asc")).toBeLessThan(0);
    expect(compareCollectionCardItems(a, b, "number", "desc")).toBeGreaterThan(0);
  });

  it("sortBy=cm_en orders by price then by card number", () => {
    const a = makeItem({ card_number: "10", cm_value: 5 });
    const b = makeItem({ card_number: "5", cm_value: 10 });
    expect(compareCollectionCardItems(a, b, "cm_en", "desc")).toBeGreaterThan(0);
  });

  it("falls back to card-number when prices tie", () => {
    const a = makeItem({ card_number: "1", cm_value: 5 });
    const b = makeItem({ card_number: "10", cm_value: 5 });
    expect(compareCollectionCardItems(a, b, "cm_en", "asc")).toBeLessThan(0);
  });
});

describe("getSortLabel / getDefaultSortDir / formatSortSummary", () => {
  it("getSortLabel maps known sortBy values", () => {
    expect(getSortLabel("number")).toBe("Number");
    expect(getSortLabel("cm_en")).toBe("CardMarket");
    expect(getSortLabel("tcp")).toBe("TCGPlayer");
  });

  it("getDefaultSortDir picks ascending only for number", () => {
    expect(getDefaultSortDir("number")).toBe("asc");
    expect(getDefaultSortDir("cm_en")).toBe("desc");
  });

  it("formatSortSummary combines label and direction", () => {
    expect(formatSortSummary("cm_en", "asc")).toBe("CardMarket low-high");
    expect(formatSortSummary("number", "desc")).toBe("Number high-low");
  });
});

describe("normalizeConditionLabel", () => {
  it("returns null for blank input", () => {
    expect(normalizeConditionLabel(null)).toBeNull();
    expect(normalizeConditionLabel("   ")).toBeNull();
  });

  it("canonicalizes known conditions case-insensitively", () => {
    expect(normalizeConditionLabel("near mint")).toBe("Near Mint");
    expect(normalizeConditionLabel("MINT")).toBe("Mint");
    expect(normalizeConditionLabel("light played")).toBe("Light Played");
  });

  it("passes through unknown but trimmed values", () => {
    expect(normalizeConditionLabel("  Heavy Played  ")).toBe("Heavy Played");
  });
});

describe("getConditionBadge", () => {
  it("returns null when condition is missing", () => {
    expect(getConditionBadge(null, "medium")).toBeNull();
  });

  it("returns short label for known condition", () => {
    const badge = getConditionBadge("Near Mint", "medium");
    expect(badge?.label).toBe("NM");
    expect(badge?.title).toBe("Near Mint");
    expect(badge?.className).toContain("bg-green-50");
  });

  it("falls back to first 3 chars uppercased for unknown", () => {
    const badge = getConditionBadge("Funky", "small");
    expect(badge?.label).toBe("FUN");
  });
});

describe("isGradedCollectionCard", () => {
  it("requires owned + grading company + grade", () => {
    expect(isGradedCollectionCard(makeItem())).toBe(false);
    expect(
      isGradedCollectionCard(
        makeItem({ grading_company: "PSA", grading_grade: "10", owned: true })
      )
    ).toBe(true);
    expect(
      isGradedCollectionCard(
        makeItem({ grading_company: "PSA", grading_grade: "10", owned: false })
      )
    ).toBe(false);
  });
});

describe("formatMarketCurrency", () => {
  it("formats EUR by default", () => {
    expect(formatMarketCurrency(12.5)).toBe("€12.50");
  });

  it("formats USD when requested", () => {
    expect(formatMarketCurrency(12.5, "USD")).toBe("$12.50");
  });

  it("returns -- for null", () => {
    expect(formatMarketCurrency(null)).toBe("--");
  });
});

describe("filter chips and selection toggle", () => {
  it("rarityFilterChip swaps active styling", () => {
    expect(rarityFilterChip("Rare", true)).not.toEqual(
      rarityFilterChip("Rare", false)
    );
  });

  it("neutralFilterChip swaps active styling", () => {
    expect(neutralFilterChip(true)).toContain("bg-violet-600");
    expect(neutralFilterChip(false)).toContain("text-white/55");
  });

  it("selectionToggleTextClass swaps active styling", () => {
    expect(selectionToggleTextClass(true)).toContain("text-violet-200");
    expect(selectionToggleTextClass(false)).toContain("text-white/45");
  });
});

describe("collectionMetaBadge", () => {
  it("returns sized variant", () => {
    expect(collectionMetaBadge("large")).toContain("h-[38px]");
    expect(collectionMetaBadge("small")).toContain("h-[29px]");
  });

  it("applies tone modifier", () => {
    expect(collectionMetaBadge("medium", "positive")).toContain("emerald");
    expect(collectionMetaBadge("medium", "negative")).toContain("rose");
  });
});
