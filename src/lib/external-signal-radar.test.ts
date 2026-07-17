import { describe, expect, it, vi } from "vitest";
import {
  capCompetitiveSignalsPerGame,
  calculateExternalSignalScore,
  fetchWithSingleRetry,
  getPressureTierForScore,
  parseLimitlessCoreCards,
  parseLimitlessMetaDecks,
  resolveDeckScanStatus,
  type ExternalSignalEvidence,
} from "@/lib/external-signal-radar";

describe("external signal radar parsers", () => {
  it("reads Pokemon meta share and deck links", () => {
    const html = `
      <table><tr><th>#</th><th></th><th>Deck</th><th>Points</th><th>Share</th></tr>
      <tr>
        <td>1</td><td></td>
        <td><a href="/decks/284">Dragapult <span class="annotation">ex</span></a></td>
        <td>2227</td><td>49.22%</td>
      </tr></table>`;

    expect(parseLimitlessMetaDecks(html, "https://limitlesstcg.com")).toEqual([
      {
        id: "284",
        name: "Dragapult ex",
        points: 2227,
        sharePercent: 49.22,
        url: "https://limitlesstcg.com/decks/284",
      },
    ]);
  });

  it("rejects deck links that leave the configured source", () => {
    const html = `
      <table><tr>
        <td>1</td><td></td>
        <td><a href="https://malicious.example/decks/284">Fake deck</a></td>
        <td>10</td><td>50%</td>
      </tr></table>`;

    expect(parseLimitlessMetaDecks(html, "https://limitlesstcg.com")).toEqual([]);
  });

  it("reads Pokemon set, number and strongest inclusion line", () => {
    const html = `
      <div class="core-card">
        <img data-card data-set="TWM" data-number="130">
        <span class="share" data-tooltip="80% include four">4 in 80.00%</span>
      </div>`;

    expect(parseLimitlessCoreCards(html, "pokemon")).toEqual([
      {
        setCode: "TWM",
        cardNumber: "130",
        copies: 4,
        inclusionPercent: 80,
      },
    ]);
  });

  it("preserves Pokemon number prefixes while trimming numeric zero padding", () => {
    const html = `
      <div class="core-card"><img data-set="SVP" data-number="SV017">
        <span class="share">2 in 80%</span>
      </div>
      <div class="core-card"><img data-set="SVP" data-number="017">
        <span class="share">2 in 80%</span>
      </div>`;

    expect(parseLimitlessCoreCards(html, "pokemon").map((card) => card.cardNumber)).toEqual([
      "SV17",
      "17",
    ]);
  });

  it("reads One Piece product codes and ignores low-inclusion cards", () => {
    const html = `
      <div class="core-card">
        <img data-card="OP14-102">
        <span class="share" data-tooltip="91.43% include four">4 in 91.43%</span>
      </div>
      <div class="core-card">
        <img data-card="OP11-106">
        <span class="share">2 in 40.00%</span>
      </div>`;

    expect(parseLimitlessCoreCards(html, "one-piece")).toEqual([
      {
        setCode: "OP14",
        cardNumber: "OP14-102",
        copies: 4,
        inclusionPercent: 91.43,
      },
    ]);
  });
});

describe("external signal scoring", () => {
  const evidence = (
    deckSharePercent: number,
    inclusionPercent: number,
    deckName = "Test deck"
  ): ExternalSignalEvidence => ({
    deckName,
    deckUrl: "https://example.com/decks/1",
    deckSharePercent,
    inclusionPercent,
    copies: 4,
    sourceLabel: "Limitless",
  });

  it("rewards tournament share, inclusion and cross-archetype use", () => {
    const single = calculateExternalSignalScore([evidence(20, 80)]);
    const multiple = calculateExternalSignalScore([
      evidence(20, 80),
      evidence(10, 75, "Second deck"),
    ]);

    expect(single).toBeGreaterThan(0);
    expect(multiple).toBeGreaterThan(single);
    expect(multiple).toBeLessThanOrEqual(100);
  });

  it("uses evidence tiers instead of inventing price multiples", () => {
    expect(getPressureTierForScore(90)).toEqual({
      label: "Breakout",
      explanation: "Highest observed competitive demand pressure",
    });
    expect(getPressureTierForScore(50)).toEqual({
      label: "Watch",
      explanation: "Early external signal that needs more confirmation",
    });
  });
});

describe("deck scan resilience", () => {
  it("retries a failed deck page once with a fresh attempt", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("This operation was aborted"))
      .mockResolvedValueOnce("<html>ok</html>");

    await expect(fetchWithSingleRetry(attempt)).resolves.toBe("<html>ok</html>");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("propagates the error when the retry also fails", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("still down"));

    await expect(fetchWithSingleRetry(attempt)).rejects.toThrow("still down");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("accepts eight of ten deck pages as a complete scan with a non-blocking detail", () => {
    expect(resolveDeckScanStatus({ attempted: 10, successful: 10 })).toEqual({
      complete: true,
      message: null,
      detail: null,
    });
    expect(resolveDeckScanStatus({ attempted: 10, successful: 8 })).toEqual({
      complete: true,
      message: null,
      detail: "8 of 10 archetypes could be read",
    });
    expect(resolveDeckScanStatus({ attempted: 10, successful: 7 })).toEqual({
      complete: false,
      message: "7 of 10 archetypes could be read",
      detail: "7 of 10 archetypes could be read",
    });
  });
});

describe("competitive signal coverage", () => {
  it("caps each game independently instead of letting one game consume the cohort", () => {
    const candidates = [
      ...Array.from({ length: 60 }, (_, index) => ({ game: "pokemon" as const, index })),
      ...Array.from({ length: 60 }, (_, index) => ({ game: "one-piece" as const, index })),
    ];

    const selected = capCompetitiveSignalsPerGame(candidates);

    expect(selected).toHaveLength(90);
    expect(selected.filter((candidate) => candidate.game === "pokemon")).toHaveLength(45);
    expect(selected.filter((candidate) => candidate.game === "one-piece")).toHaveLength(45);
  });
});
