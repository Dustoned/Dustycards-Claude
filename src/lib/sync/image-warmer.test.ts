import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cardFindMany: vi.fn(),
  episodeFindMany: vi.fn(),
  sealedFindMany: vi.fn(),
  sourceFindMany: vi.fn(),
  warmCardImages: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    card: { findMany: mocks.cardFindMany },
    episode: { findMany: mocks.episodeFindMany },
    sealedProduct: { findMany: mocks.sealedFindMany },
    externalCatalystSource: { findMany: mocks.sourceFindMany },
  },
}));
vi.mock("@/lib/image-cache-server", () => ({
  warmCardImages: mocks.warmCardImages,
}));

import { warmAllImages, warmUpcomingImages } from "@/lib/sync/image-warmer";

describe("Upcoming image warmer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cardFindMany.mockResolvedValue([]);
    mocks.episodeFindMany.mockResolvedValue([]);
    mocks.sealedFindMany.mockResolvedValue([]);
    mocks.sourceFindMany.mockResolvedValue([]);
    mocks.warmCardImages.mockResolvedValue({
      total: 2,
      processed: 2,
      hits: 1,
      downloaded: 1,
      skipped: 0,
      failed: 0,
      durationMs: 12,
    });
  });

  it("includes expansion logos in a full warm pass", async () => {
    mocks.cardFindMany.mockResolvedValue([{ image_url: "https://images.test/card.webp" }]);
    mocks.episodeFindMany.mockResolvedValue([{ logo_url: "https://images.test/logo.webp" }]);
    mocks.sealedFindMany.mockResolvedValue([{ image_url: "https://images.test/box.webp" }]);

    const result = await warmAllImages();

    expect(mocks.warmCardImages).toHaveBeenNthCalledWith(
      1,
      ["https://images.test/card.webp"],
      expect.any(Object)
    );
    expect(mocks.warmCardImages).toHaveBeenNthCalledWith(
      2,
      ["https://images.test/logo.webp"],
      expect.any(Object)
    );
    expect(result.episodes.total).toBe(2);
  });

  it("collects and deduplicates stored leak and reveal artwork", async () => {
    mocks.sourceFindMany.mockResolvedValue([
      {
        metadata_json: JSON.stringify({
          upcomingReveals: [
            { name: "Pikachu", imageUrl: "https://billsarchive.com/pikachu.webp" },
            { name: "Raichu", imageUrl: "https://billsarchive.com/raichu.webp" },
          ],
        }),
      },
      {
        metadata_json: JSON.stringify({
          upcomingReveals: [
            { name: "Pikachu", imageUrl: "https://billsarchive.com/pikachu.webp" },
          ],
        }),
      },
    ]);

    await warmUpcomingImages();

    expect(mocks.warmCardImages).toHaveBeenCalledWith(
      [
        "https://billsarchive.com/pikachu.webp",
        "https://billsarchive.com/raichu.webp",
      ],
      { concurrency: 2 }
    );
  });
});
