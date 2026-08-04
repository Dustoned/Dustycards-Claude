import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sourceFindMany: vi.fn(),
  warmCardImages: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalCatalystSource: { findMany: mocks.sourceFindMany },
  },
}));
vi.mock("@/lib/image-cache-server", () => ({
  warmCardImages: mocks.warmCardImages,
}));

import { warmUpcomingImages } from "@/lib/sync/image-warmer";

describe("Upcoming image warmer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
