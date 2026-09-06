import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";

const points = [
  { date: "2026-01-01", label: "1 Jan", value: 10 },
  { date: "2026-01-08", label: "8 Jan", value: 12 },
  { date: "2026-01-15", label: "15 Jan", value: 11 },
  { date: "2026-01-22", label: "22 Jan", value: 14 },
  { date: "2026-01-29", label: "29 Jan", value: 13 },
];

describe("PriceHistoryPanel", () => {
  it("renders measured history as a plain historical chart", () => {
    const markup = renderToStaticMarkup(
      createElement(PriceHistoryPanel, {
        title: "Raw price",
        currency: "EUR",
        points,
        fixedRange: "ALL",
        hideRangeControls: true,
      })
    );

    expect(markup).toContain('data-chart-series="history"');
    expect(markup).toContain('aria-label="Historical price"');
    expect(markup).not.toContain("prediction");
    expect(markup).not.toContain("Prediction");
  });
});
