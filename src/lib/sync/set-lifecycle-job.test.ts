import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/set-lifecycle-core", () => ({ assessSetLifecycle: vi.fn() }));

import {
  calculateLifecycleSetTrend,
  chunkLifecycleProductIds,
  getLifecycleCatalystEvidenceAt,
  getSetLifecycleObservationBucket,
  hasSetLevelOopStatement,
  hasSetLevelReprintStatement,
  isOopEvidenceNewerThanReprint,
  isLifecycleReprintResetActive,
  lifecycleEpisodeIdFromSourceMetadata,
} from "@/lib/sync/set-lifecycle-job";

describe("set lifecycle observation helpers", () => {
  it("chunks sealed-product queries below SQLite's parameter limit", () => {
    const productIds = Array.from({ length: 805 }, (_, index) => `product-${index}`);

    const chunks = chunkLifecycleProductIds(productIds);

    expect(chunks.map((chunk) => chunk.length)).toEqual([400, 400, 5]);
    expect(chunks.flat()).toEqual(productIds);
  });

  it("rejects an invalid lifecycle query chunk size", () => {
    expect(() => chunkLifecycleProductIds(["product-1"], 0)).toThrow(RangeError);
  });

  it("uses a stable Monday UTC bucket for the whole week", () => {
    expect(
      getSetLifecycleObservationBucket(new Date("2026-07-19T23:59:59.000Z")).toISOString()
    ).toBe("2026-07-13T00:00:00.000Z");
    expect(
      getSetLifecycleObservationBucket(new Date("2026-07-20T00:00:00.000Z")).toISOString()
    ).toBe("2026-07-20T00:00:00.000Z");
  });

  it("takes the median product trend and never treats a missing price as zero", () => {
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    const trend = calculateLifecycleSetTrend(
      [
        { product_id: "pack-a", fetched_at: at(1), cm_lowest: 10 },
        { product_id: "pack-a", fetched_at: at(31), cm_lowest: 12 },
        { product_id: "pack-b", fetched_at: at(1), cm_lowest: 20 },
        { product_id: "pack-b", fetched_at: at(31), cm_lowest: 22 },
        { product_id: "pack-c", fetched_at: at(1), cm_lowest: 30 },
        { product_id: "pack-c", fetched_at: at(31), cm_lowest: null },
      ],
      30
    );

    expect(trend).toBe(15);
  });

  it("requires a real baseline beyond the requested horizon", () => {
    expect(
      calculateLifecycleSetTrend(
        [
          {
            product_id: "new-pack",
            fetched_at: new Date("2026-07-01T00:00:00.000Z"),
            cm_lowest: 10,
          },
          {
            product_id: "new-pack",
            fetched_at: new Date("2026-07-14T00:00:00.000Z"),
            cm_lowest: 12,
          },
        ],
        30
      )
    ).toBeNull();
  });

  it("accepts only the exact set-level lifecycle watch-topic provenance", () => {
    expect(
      lifecycleEpisodeIdFromSourceMetadata(
        JSON.stringify({
          queryCardId: "watch-topic:pokemon:lifecycle:sv-prismatic-evolutions",
        }),
        "pokemon"
      )
    ).toBe("sv-prismatic-evolutions");
    expect(
      lifecycleEpisodeIdFromSourceMetadata(
        JSON.stringify({
          queryCardId: "watch-topic:pokemon:release:sv-prismatic-evolutions",
        }),
        "pokemon"
      )
    ).toBeNull();
    expect(
      lifecycleEpisodeIdFromSourceMetadata(
        JSON.stringify({ queryCardId: "card:some-card-from-the-set" }),
        "pokemon"
      )
    ).toBeNull();
  });

  it("requires an OOP phrase close to the actual set name or a specific set code", () => {
    expect(
      hasSetLevelOopStatement({
        sourceText:
          "Distribution update: Prismatic Evolutions is now out of print and no additional wave is planned.",
        episodeName: "Prismatic Evolutions",
        episodeCode: "SV8.5",
      })
    ).toBe(true);
    expect(
      hasSetLevelOopStatement({
        sourceText: "Official update for SV8.5: the print run ended this month.",
        episodeName: "Prismatic Evolutions",
        episodeCode: "SV8.5",
      })
    ).toBe(true);
  });

  it("rejects a distant product-level discontinued mention", () => {
    expect(
      hasSetLevelOopStatement({
        sourceText: `Prismatic Evolutions release details. ${"Unrelated product copy. ".repeat(
          20
        )} This display accessory was discontinued.`,
        episodeName: "Prismatic Evolutions",
        episodeCode: "SV8.5",
      })
    ).toBe(false);
  });

  it("requires a reprint or restock phrase close to the actual set", () => {
    expect(
      hasSetLevelReprintStatement({
        sourceText:
          "Pokémon confirms an additional print run for Prismatic Evolutions, with stock returning next month.",
        episodeName: "Prismatic Evolutions",
        episodeCode: "SV8.5",
      })
    ).toBe(true);
    expect(
      hasSetLevelReprintStatement({
        sourceText: "SV8.5 has been restocked at major retailers.",
        episodeName: "Prismatic Evolutions",
        episodeCode: "SV8.5",
      })
    ).toBe(true);
  });

  it("rejects a distant reprint mention for another product", () => {
    expect(
      hasSetLevelReprintStatement({
        sourceText: `Prismatic Evolutions has no reprint planned. ${"Unrelated market commentary. ".repeat(
          20
        )} A different vintage product received a mass reprint.`,
        episodeName: "Prismatic Evolutions",
        episodeCode: "SV8.5",
      })
    ).toBe(false);
  });

  it("never resurrects an OOP claim that predates a later reprint", () => {
    const oldOop = new Date("2025-01-01T00:00:00.000Z");
    const laterReprint = new Date("2025-06-01T00:00:00.000Z");
    const newestOop = new Date("2025-07-01T00:00:00.000Z");

    expect(isOopEvidenceNewerThanReprint(oldOop, laterReprint)).toBe(false);
    expect(isOopEvidenceNewerThanReprint(newestOop, laterReprint)).toBe(true);
    expect(isOopEvidenceNewerThanReprint(newestOop, null)).toBe(true);
    expect(isOopEvidenceNewerThanReprint(laterReprint, laterReprint)).toBe(false);
  });

  it("orders evidence by publication time instead of late discovery time", () => {
    const oldOopPublishedAt = getLifecycleCatalystEvidenceAt({
      observedAt: new Date("2026-07-01T00:00:00.000Z"),
      publishedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const newerReprintPublishedAt = getLifecycleCatalystEvidenceAt({
      observedAt: new Date("2026-06-01T00:00:00.000Z"),
      publishedAt: new Date("2025-06-01T00:00:00.000Z"),
    });

    expect(
      isOopEvidenceNewerThanReprint(oldOopPublishedAt, newerReprintPublishedAt)
    ).toBe(false);
  });

  it("does not reactivate an old dated reprint when it is discovered late", () => {
    const now = new Date("2026-07-14T00:00:00.000Z");

    expect(
      isLifecycleReprintResetActive({
        now,
        observedAt: new Date("2026-07-13T00:00:00.000Z"),
        publishedAt: new Date("2025-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      })
    ).toBe(false);
    expect(
      isLifecycleReprintResetActive({
        now,
        observedAt: new Date("2026-07-13T00:00:00.000Z"),
        publishedAt: null,
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      })
    ).toBe(true);
  });
});
