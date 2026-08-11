import { describe, expect, it } from "vitest";
import type { FirecrawlPageScrapeResult } from "@/lib/firecrawl";
import {
  extractUpcomingRevealsFromScrape,
  readStoredUpcomingReveals,
} from "@/lib/upcoming-source-reveals";

function scrape(markdown: string, html = ""): FirecrawlPageScrapeResult {
  return {
    title: "Storm Emeralda",
    sourceUrl: "https://billsarchive.com/storm-emeralda",
    markdown,
    html,
    links: [],
    creditsUsed: 1,
    metadata: {},
  };
}

describe("upcoming source reveals", () => {
  it("extracts card artwork but skips sealed-product images", () => {
    const result = extractUpcomingRevealsFromScrape(scrape([
      "![Image: Mega Golisopod ex — Storm Emeralda leak](https://cdn.example.com/m6-107.webp)",
      "![Image: Pitch Black Booster Box](https://cdn.example.com/box.webp)",
      "![Image: Mew sculpted figure — 01](https://cdn.example.com/figure-01.webp)",
      "![Image: 2026 Worlds Pikachu promo card](https://cdn.example.com/pikachu.webp)",
    ].join("\n")));

    expect(result).toEqual([
      expect.objectContaining({
        name: "Mega Golisopod ex",
        imageUrl: "https://cdn.example.com/m6-107.webp",
        cardNumber: "107",
        status: "leak",
      }),
      expect.objectContaining({
        name: "2026 Worlds Pikachu",
        imageUrl: "https://cdn.example.com/pikachu.webp",
        status: "reveal",
      }),
    ]);
  });

  it("does not mistake an expansion name for a card number and removes rarity from the title", () => {
    const extracted = extractUpcomingRevealsFromScrape(scrape(
      "",
      '<img alt="Growlithe Art Rare — Storm Emeralda 078" src="https://cdn.example.com/growlithe.webp">'
    ));

    expect(extracted[0]).toEqual(expect.objectContaining({
      name: "Growlithe",
      cardNumber: "078",
      rarity: "Art Rare",
    }));
  });

  it("accepts HTML card images and safely reads persisted metadata", () => {
    const extracted = extractUpcomingRevealsFromScrape(scrape(
      "",
      '<img alt="Raikou ex — 108 — Special Art Rare" src="https://cdn.example.com/raikou.webp">'
    ));
    expect(extracted[0]).toEqual(expect.objectContaining({
      name: "Raikou ex",
      cardNumber: "108",
      rarity: "Special Art Rare",
    }));

    expect(readStoredUpcomingReveals(JSON.stringify({ upcomingReveals: extracted })))
      .toEqual(extracted);
    expect(readStoredUpcomingReveals("not json")).toEqual([]);
  });

  it("keeps the retired 30th Celebration promo gallery out of Upcoming", () => {
    const stored = JSON.stringify({
      upcomingReveals: [
        {
          name: "Victini",
          imageUrl: "https://cdn.example.com/victini.webp",
          episodeName: "30th Celebration Promos",
          status: "confirmed",
        },
        {
          name: "Mew ex",
          imageUrl: "https://cdn.example.com/mew.webp",
          episodeName: "30th Celebration",
          status: "reveal",
        },
        {
          name: "Umbreon ex",
          imageUrl: "https://cdn.example.com/umbreon.webp",
          episodeName: "30th Celebration MEP Promos",
          status: "confirmed",
        },
      ],
    });

    expect(readStoredUpcomingReveals(stored)).toEqual([
      expect.objectContaining({
        name: "Mew ex",
        episodeName: "30th Celebration",
      }),
    ]);
  });
});
