import { describe, expect, it } from "vitest";
import {
  getCardDetailTabOrder,
  orderCardDetailTabs,
} from "@/components/card-detail/card-detail-tabs";

describe("card detail tab order", () => {
  it("keeps the shared standard sections in their canonical order", () => {
    expect(getCardDetailTabOrder("standard")).toEqual([
      "overview",
      "market",
      "collection",
    ]);
  });

  it("adds radar-only sections after every shared section", () => {
    expect(getCardDetailTabOrder("radar")).toEqual([
      "overview",
      "market",
      "collection",
      "forecast",
      "analysis",
      "evidence",
    ]);
  });

  it("orders available tabs canonically and excludes tabs unavailable to the mode", () => {
    const tabs = [
      { id: "evidence" as const, label: "Evidence" },
      { id: "collection" as const, label: "Collection" },
      { id: "overview" as const, label: "Overview" },
      { id: "market" as const, label: "Market" },
    ];

    expect(orderCardDetailTabs("standard", tabs).map((tab) => tab.id)).toEqual([
      "overview",
      "market",
      "collection",
    ]);
    expect(orderCardDetailTabs("radar", tabs).map((tab) => tab.id)).toEqual([
      "overview",
      "market",
      "collection",
      "evidence",
    ]);
  });
});
