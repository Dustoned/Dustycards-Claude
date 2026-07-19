import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildCardDetailSignalTabs } from "@/components/card-detail/CardDetailSignalTabs";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";

function renderTab(
  id: "forecast" | "analysis" | "evidence",
  options: Parameters<typeof buildCardDetailSignalTabs>[0]
) {
  const tab = buildCardDetailSignalTabs(options).find((candidate) => candidate.id === id);
  if (!tab) throw new Error(`Missing ${id} tab`);
  return renderToStaticMarkup(tab.content);
}

describe("CardDetailSignalTabs", () => {
  it("always exposes the same three advanced tabs without requiring signal data", () => {
    const tabs = buildCardDetailSignalTabs({
      signal: null,
      marketMode: "raw",
      onResearch: vi.fn(),
    });

    expect(tabs.map((tab) => tab.id)).toEqual(["forecast", "analysis", "evidence"]);
  });

  it("collapses a missing forecast to one clear empty state", () => {
    const markup = renderTab("forecast", {
      signal: null,
      marketMode: "raw",
      onResearch: vi.fn(),
    });

    expect(markup).toContain("No reliable forecast yet");
    expect(markup).not.toContain("Growth probability tracker");
    expect(markup.match(/data-card-detail-signal-state="empty"/g)).toHaveLength(1);
  });

  it("does not present a PSA model as the selected BGS forecast", () => {
    const signal = {
      currentPrice: 100,
      horizon: "Long-term collector signal",
      reasons: [],
      evidence: [],
      catalysts: [],
      marketIntelligence: {
        sealed: {
          lifecycleLabel: null,
          lifecycleOopProbability: null,
          pressureLabel: "Low",
          pressureScore: 10,
          packPrice: null,
        },
        scarcity: {
          label: "Watch",
          score: 20,
          pullOdds: null,
          artistDemandScore: null,
          collectorDemandScore: 30,
        },
        graded: {
          available: true,
          label: "PSA 10",
          supplyLabel: "Unknown",
          psa10Price: null,
          currency: "EUR",
          gemRatePct: null,
        },
        confluence: { label: "Building", score: 25, drivers: [] },
      },
    } as unknown as ExternalCardSignal;
    const markup = renderTab("forecast", {
      signal,
      marketMode: "graded",
      selectedGradeLabel: "BGS 10",
      onResearch: vi.fn(),
    });

    expect(markup).toContain("No BGS 10 forecast yet");
    expect(markup).toContain("current graded model covers PSA 10");
  });

  it("keeps research in one Evidence action and renders errors inline once", () => {
    const markup = renderTab("evidence", {
      signal: null,
      marketMode: "raw",
      researchStatus: "error",
      researchError: "Simulated research failure",
      onResearch: vi.fn(),
    });

    expect(markup.match(/data-card-detail-research/g)).toHaveLength(1);
    expect(markup.match(/Simulated research failure/g)).toHaveLength(1);
  });

  it("keeps dialog research results out of the inline Evidence panel", () => {
    const markup = renderTab("evidence", {
      signal: null,
      marketMode: "raw",
      researchStatus: "success",
      researchPresentation: "dialog",
      researchResults: [
        {
          url: "https://example.com/card",
          title: "Focused research result",
          domain: "example.com",
          category: "market",
        },
      ],
      onResearch: vi.fn(),
    });

    expect(markup.match(/data-card-detail-research/g)).toHaveLength(1);
    expect(markup).not.toContain("Focused research result");
  });
});
