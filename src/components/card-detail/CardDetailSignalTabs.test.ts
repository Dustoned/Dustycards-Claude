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

  it("explains active forecast data without the ambiguous zero-over-gate label", () => {
    const target = (key: string, samples: number, hits: number) => ({
      key,
      status: "learning",
      samples,
      hits,
      interval: null,
    });
    const signal = {
      currentPrice: 100,
      horizon: "Long-term collector signal",
      reasons: [],
      evidence: [],
      catalysts: [],
      forecast: {
        cardId: "tracked-card",
        game: "pokemon",
        modelVersion: "v10-consistent-live-prices",
        signalTier: "Strong",
        priceBand: "100-plus",
        observedAt: "2026-08-04T00:00:00.000Z",
        tracking: {
          observations: 80,
          independentPredictions: 46,
          pending90d: 46,
          complete90d: 0,
          insufficient90d: 0,
          pending180d: 46,
          complete180d: 0,
          insufficient180d: 0,
          next90dMaturesAt: "2026-11-02T00:00:00.000Z",
          next180dMaturesAt: "2027-01-31T00:00:00.000Z",
        },
        targets: {
          "1.5x-90d": target("1.5x-90d", 4, 3),
          "2x-90d": target("2x-90d", 0, 0),
          "3x-180d": target("3x-180d", 0, 0),
        },
      },
    } as unknown as ExternalCardSignal;
    const markup = renderTab("forecast", {
      signal,
      marketMode: "raw",
      onResearch: vi.fn(),
    });

    expect(markup).toContain("80 measurements · 46 independent calls");
    expect(markup).toContain("46 active · 0 ready");
    expect(markup).toContain("3 correct · 1 missed");
    expect(markup).toContain("Learning · 100 outcomes needed");
    expect(markup).not.toContain("predictions being tracked");
    expect(markup).not.toContain("0/50");
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

describe("forecast horizon tones", () => {
  it("colours every horizon by the scenario outlook instead of its own small percentage", () => {
    const signal = {
      currentPrice: 100,
      currency: "EUR",
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
          available: false,
          label: null,
          supplyLabel: "Unknown",
          psa10Price: null,
          currency: "EUR",
          gemRatePct: null,
        },
        confluence: { label: "Building", score: 25, drivers: [] },
        rawScenario: {
          marketMode: "raw",
          currentPrice: 100,
          currency: "EUR",
          confidence: "Medium",
          outlook: "modest_up",
          expectedReturnPct180: 6,
          points: [
            { days: 30, low: 94, base: 102.1, high: 111 },
            { days: 90, low: 92, base: 104, high: 118 },
            { days: 180, low: 90, base: 106, high: 126 },
          ],
          drivers: [],
        },
      },
    } as unknown as ExternalCardSignal;

    const markup = renderTab("forecast", {
      signal,
      marketMode: "raw",
      onResearch: vi.fn(),
    });

    expect(markup.match(/border-emerald-300\/16/g)).toHaveLength(3);
    expect(markup).toContain("+2.1%");
  });
});
