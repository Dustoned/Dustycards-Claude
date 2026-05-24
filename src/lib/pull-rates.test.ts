import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  buildCollectricsSetApiUrl,
  extractThePriceDexPullRateUrls,
  fetchAndImportCollectricsPullRates,
  getSpecificPullDenominator,
  importPullRateData,
  parsePullRateImportContent,
  parseThePriceDexPullRatePage,
} from "@/lib/pull-rates";

const TEST_SOURCE = "vitest-pull-rates";
const FETCH_TEST_SOURCE = "vitest-pull-rates-fetch";

async function clearTestData() {
  await db.setPullRateRarity.deleteMany({ where: { source: TEST_SOURCE } });
  await db.setPullRateProfile.deleteMany({ where: { source: TEST_SOURCE } });
  await db.setPullRateRarity.deleteMany({ where: { source: FETCH_TEST_SOURCE } });
  await db.setPullRateProfile.deleteMany({ where: { source: FETCH_TEST_SOURCE } });
}

afterEach(async () => {
  await clearTestData();
});

describe("pull-rate imports", () => {
  it("parses Collectrics set JSON and ignores price-derived fields", () => {
    const parsed = parsePullRateImportContent(
      JSON.stringify({
        "set-code": "SFA",
        "set-name": "Pokemon Shrouded Fable",
        "generated-at": "2026-04-25",
        "total-set-raw-value": 767.63,
        "rarity-breakdown": {
          SIR: {
            "rarity-code": "SIR",
            "rarity-name": "Special Illustration Rare",
            "card-count": 5,
            "avg-raw-price": 27.86,
            "pull-rate": 0.014925373,
            "pull-rate-odds": "1/67",
            "psa-avg-gem-pct": 0.358,
          },
        },
      })
    );

    expect(parsed.sets).toHaveLength(1);
    expect(parsed.sets[0].setCode).toBe("SFA");
    expect(parsed.sets[0].rarities[0].specificPullDenominator).toBe(335);
    expect(parsed.sets[0].rarities[0]).not.toHaveProperty("avgRawPrice");
  });

  it("parses quoted CSV rows", () => {
    const parsed = parsePullRateImportContent(
      [
        "set_code,set_name,rarity_name,card_count,pull_rate_odds,psa_avg_gem_pct",
        'SFA,"Pokemon Shrouded Fable, Special Set",Illustration Rare,15,1/12,0.38',
      ].join("\n")
    );

    expect(parsed.sets).toHaveLength(1);
    expect(parsed.sets[0].setName).toBe("Pokemon Shrouded Fable, Special Set");
    expect(parsed.sets[0].rarities[0].specificPullDenominator).toBe(180);
  });

  it("calculates specific-card odds from rarity odds and card count", () => {
    expect(
      getSpecificPullDenominator({
        pullRateDenominator: 67,
        cardCount: 5,
      })
    ).toBe(335);
  });

  it("replaces old rarity rows when importing the same set again", async () => {
    await clearTestData();

    await importPullRateData({
      source: TEST_SOURCE,
      content: JSON.stringify({
        "set-code": "SFA",
        "rarity-breakdown": {
          IR: {
            "rarity-name": "Illustration Rare",
            "card-count": 15,
            "pull-rate-odds": "1/12",
          },
          SIR: {
            "rarity-name": "Special Illustration Rare",
            "card-count": 5,
            "pull-rate-odds": "1/67",
          },
        },
      }),
    });
    await importPullRateData({
      source: TEST_SOURCE,
      content: JSON.stringify({
        "set-code": "SFA",
        "rarity-breakdown": {
          HR: {
            "rarity-name": "Hyper Rare",
            "card-count": 5,
            "pull-rate-odds": "1/144",
          },
        },
      }),
    });

    const rows = await db.setPullRateRarity.findMany({
      where: { source: TEST_SOURCE, set_code: "SFA" },
      select: { normalized_rarity: true },
    });

    expect(rows).toEqual([{ normalized_rarity: "Hyper Rare" }]);
  });

  it("builds Collectrics set API URLs from normalized set codes", () => {
    expect(buildCollectricsSetApiUrl(" sfa ")).toBe("https://mycollectrics.com/api/set/SFA");
  });

  it("parses ThePriceDex pull-rate and EV tables", () => {
    const parsed = parseThePriceDexPullRatePage({
      url: "https://www.thepricedex.com/set/me3/perfect-order/pull-rates",
      html: `
        <title>Perfect Order Pull Rates (2026) - Expected Value | ThePriceDex</title>
        <meta name="last-modified" content="2026-05-21T00:00:00.000Z">
        <span>Released: 2026/03/27</span><span>124 Cards</span><span>Set Code: POR</span>
        <p>Booster Pack EV</p><h5>$4.39</h5>
        <p>Booster Box EV</p><h5>$158.15</h5>
        <p>Packs Per Booster Box</p><h5>36</h5>
        <p>Cards Per Booster Pack</p><h5>11</h5>
        <table>
          <thead><tr><th>Rarity</th><th>Pull Rate</th><th>Per Booster Box</th><th>Specific Card Odds</th></tr></thead>
          <tbody>
            <tr><td>Special Illustration Rare</td><td>1 in 81 packs</td><td>0.4 cards</td><td>1 in 486 packs</td></tr>
            <tr><td>Common</td><td>4 cards per pack</td><td>144 cards</td><td>1 in 11 packs</td></tr>
            <tr><td>Total</td><td>11 cards per pack</td><td>396 cards</td><td></td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>Rarity</th><th>Total</th><th>Priced</th><th>Avg Value</th><th>EV/Pack</th></tr></thead>
          <tbody>
            <tr><td>Special Illustration Rare</td><td>6</td><td>6</td><td>$91.59</td><td>$1.13</td></tr>
            <tr><td>Common</td><td>44</td><td>44</td><td>$0.14</td><td>$0.58</td></tr>
            <tr><td>Total</td><td>211</td><td>203</td><td></td><td>$4.39</td></tr>
          </tbody>
        </table>
        <p>Card values assume Near Mint condition where available and represent market averages. Pull rates are estimates primarily sourced from Perfect Order pull rates research and based on community data and may vary from actual pack openings. Prices last updated May 21, 2026.</p>
      `,
    });

    expect(parsed?.setCode).toBe("POR");
    expect(parsed?.setName).toBe("Perfect Order");
    expect(parsed?.releaseDate).toBe("2026-03-27");
    expect(parsed?.pricesUpdatedAt).toBe("2026-05-21");
    expect(parsed?.boosterPackEvUsd).toBe(4.39);
    expect(parsed?.boosterBoxEvUsd).toBe(158.15);
    expect(parsed?.rarities).toHaveLength(2);
    const sir = parsed?.rarities.find((rarity) => rarity.rarityName === "Special Illustration Rare");
    const common = parsed?.rarities.find((rarity) => rarity.rarityName === "Common");
    expect(sir).toMatchObject({
      rarityName: "Special Illustration Rare",
      cardCount: 6,
      pullRateDenominator: 81,
      specificPullDenominator: 486,
      perBoosterBox: 0.4,
      avgValueUsd: 91.59,
      evPerPackUsd: 1.13,
    });
    expect(common).toMatchObject({
      rarityName: "Common",
      cardCount: 44,
      pullRateDenominator: null,
      specificPullDenominator: 11,
      evPerPackUsd: 0.58,
    });
  });

  it("extracts ThePriceDex pull-rate URLs from a sitemap", () => {
    expect(
      extractThePriceDexPullRateUrls(`
        <urlset>
          <url><loc>https://www.thepricedex.com/set/me3/perfect-order/pull-rates</loc></url>
          <url><loc>https://www.thepricedex.com/set/me3/perfect-order</loc></url>
        </urlset>
      `)
    ).toEqual(["https://www.thepricedex.com/set/me3/perfect-order/pull-rates"]);
  });

  it("parses ThePriceDex pull-rate tables when per-box values are not present", () => {
    const parsed = parseThePriceDexPullRatePage({
      url: "https://www.thepricedex.com/set/me2pt5/ascended-heroes/pull-rates",
      html: `
        <title>Ascended Heroes Pull Rates (2026) - Expected Value | ThePriceDex</title>
        <span>Released: 2026/01/30</span><span>295 Cards</span><span>Set Code: ASC</span>
        <p>Booster Pack EV</p><h5>$7.50</h5>
        <table>
          <thead><tr><th>Rarity</th><th>Pull Rate</th><th>Specific Card Odds</th></tr></thead>
          <tbody><tr><td>Special Illustration Rare</td><td>1 in 74 packs</td><td>1 in 520 packs</td></tr></tbody>
        </table>
        <table>
          <thead><tr><th>Rarity</th><th>Total</th><th>Priced</th><th>Avg Value</th><th>EV/Pack</th></tr></thead>
          <tbody><tr><td>Special Illustration Rare</td><td>7</td><td>7</td><td>$100.00</td><td>$1.35</td></tr></tbody>
        </table>
      `,
    });

    expect(parsed?.setCode).toBe("ASC");
    expect(parsed?.rarities[0]).toMatchObject({
      perBoosterBox: null,
      pullRateDenominator: 74,
      specificPullDenominator: 520,
      evPerPackUsd: 1.35,
    });
  });

  it("fetches Collectrics JSON and imports usable pull-rate rows", async () => {
    await clearTestData();

    const requestedUrls: string[] = [];
    const fetchImpl = async (url: string) => {
      requestedUrls.push(url);

      return new Response(
        JSON.stringify({
          "set-code": "SFA",
          "set-name": "Pokemon Shrouded Fable",
          "rarity-breakdown": {
            SIR: {
              "rarity-code": "SIR",
              "rarity-name": "Special Illustration Rare",
              "card-count": 5,
              "pull-rate-odds": "1/67",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    };

    const result = await fetchAndImportCollectricsPullRates({
      source: FETCH_TEST_SOURCE,
      setCodes: ["sfa"],
      fetchImpl,
      requestDelayMs: 0,
    });

    expect(requestedUrls).toEqual(["https://mycollectrics.com/api/set/SFA"]);
    expect(result.requestedSets).toBe(1);
    expect(result.fetchedSets).toBe(1);
    expect(result.failedSets).toEqual([]);
    expect(result.setsImported).toBe(1);
    expect(result.rarityRowsImported).toBe(1);

    const row = await db.setPullRateRarity.findFirstOrThrow({
      where: { source: FETCH_TEST_SOURCE, set_code: "SFA" },
    });
    expect(row.specific_pull_denominator).toBe(335);
  });

  it("reports unavailable Collectrics set endpoints without importing empty data", async () => {
    const fetchImpl = async () =>
      new Response("Not found", {
        status: 404,
        statusText: "Not Found",
      });

    const result = await fetchAndImportCollectricsPullRates({
      source: FETCH_TEST_SOURCE,
      setCodes: ["NOPE"],
      fetchImpl,
      requestDelayMs: 0,
    });

    expect(result.requestedSets).toBe(1);
    expect(result.fetchedSets).toBe(0);
    expect(result.setsImported).toBe(0);
    expect(result.failedSets).toEqual([
      {
        setCode: "NOPE",
        status: 404,
        error: "No Collectrics set endpoint found.",
      },
    ]);

    const marker = await db.setPullRateProfile.findUnique({
      where: {
        source_set_code: {
          source: FETCH_TEST_SOURCE,
          set_code: "NOPE",
        },
      },
      select: {
        rarity_buckets: true,
        promo_flag: true,
      },
    });
    expect(marker).toEqual({
      rarity_buckets: 0,
      promo_flag: "collectrics_unavailable",
    });
  });
});
