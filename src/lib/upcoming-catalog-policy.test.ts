import { describe, expect, it } from "vitest";
import { createUpcomingCatalogPolicy } from "./upcoming-catalog-policy";

const policy = createUpcomingCatalogPolicy([
  { name: "Pitch Black", release_date: "2026-07-17" },
  { name: "Future Set", release_date: "2026-10-01" },
  { name: "Scarlet & Violet", release_date: "2023-03-31" },
  { name: "MEP Black Star Promos", release_date: "2025-09-26" },
], "2026-09-05");

describe("automatic upcoming catalog reconciliation", () => {
  it("expires known sets even without a card match or with a stale source date", () => {
    expect(policy.isUpcoming({ episodeName: "Pitch Black", releaseDate: null })).toBe(false);
    expect(policy.isUpcoming({ episodeName: "Pokémon Pitch Black Card List: All 120 Cards & Rarities | Bill’s Archive", releaseDate: null })).toBe(false);
    expect(policy.isUpcoming({ episodeName: "Pitch Black", releaseDate: "2026-12-01" })).toBe(false);
    expect(policy.isUpcoming({ episodeName: "Future Set", releaseDate: null })).toBe(true);
  });

  it("removes dated event stories and retains mixed future announcements", () => {
    const released = { episodeName: "Worlds 2026", releaseDate: "2026-08-28" };
    expect(policy.showStory("Worlds promo cards revealed", [released])).toBe(false);
    expect(policy.showStory("New cards revealed", [released, { episodeName: "Future Set", releaseDate: null }])).toBe(true);
  });

  it("recognizes whole set names in headlines without depending on gallery metadata", () => {
    expect(policy.showStory("Pitch Black full card gallery", [])).toBe(false);
    expect(policy.showStory("Pokémon TCG: Scarlet &amp; Violet revealed", [])).toBe(false);
    expect(policy.showStory("Pitch Blackened skies promo", [])).toBe(true);
    expect(policy.showStory("Pitch Black and Future Set news", [])).toBe(true);
    expect(policy.showStory("Pitch Black gallery", [{ episodeName: null, releaseDate: null }])).toBe(false);
  });

  it("keeps unknown sets and new promos, and expires them on their own release day", () => {
    expect(policy.isUpcoming({ episodeName: "Unknown Set", releaseDate: null })).toBe(true);
    expect(policy.isUpcoming({ episodeName: "MEP Black Star Promos", releaseDate: "2026-09-06" })).toBe(true);
    expect(policy.isUpcoming({ episodeName: "MEP Black Star Promos", releaseDate: "2026-09-05" })).toBe(false);
  });

  it("does not expire a future edition because a same-name edition is released", () => {
    const editions = createUpcomingCatalogPolicy([
      { name: "Shared Set", release_date: "2026-01-01" },
      { name: "Shared Set", release_date: "2026-10-01" },
    ], "2026-09-05");
    expect(editions.isUpcoming({ episodeName: "Shared Set", releaseDate: null })).toBe(true);
  });
});
