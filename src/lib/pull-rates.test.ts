import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  buildCollectricsSetApiUrl,
  fetchAndImportCollectricsPullRates,
  getSpecificPullDenominator,
  importPullRateData,
  parsePullRateImportContent,
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
