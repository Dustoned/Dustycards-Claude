import { describe, expect, it } from "vitest";
import {
  getCardDetailTabOrder,
  orderCardDetailTabs,
} from "@/components/card-detail/card-detail-tabs";

describe("card detail tab order", () => {
  it("keeps every detail mode in the same canonical order", () => {
    expect(getCardDetailTabOrder("standard")).toEqual([
      "overview",
      "market",
      "collection",
      "forecast",
      "analysis",
      "evidence",
    ]);
    expect(getCardDetailTabOrder("radar")).toEqual(getCardDetailTabOrder("standard"));
  });

  it("orders every available tab identically in both modes", () => {
    const tabs = [
      { id: "evidence" as const, label: "Evidence" },
      { id: "collection" as const, label: "Collection" },
      { id: "overview" as const, label: "Overview" },
      { id: "market" as const, label: "Market" },
    ];

    const expected = [
      "overview",
      "market",
      "collection",
      "evidence",
    ];
    expect(orderCardDetailTabs("standard", tabs).map((tab) => tab.id)).toEqual(expected);
    expect(orderCardDetailTabs("radar", tabs).map((tab) => tab.id)).toEqual(expected);
  });
});
