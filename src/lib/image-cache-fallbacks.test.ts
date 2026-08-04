import { describe, expect, it } from "vitest";
import { getRemoteImageCandidates } from "@/lib/image-cache-fallbacks";

describe("image-cache remote fallbacks", () => {
  it("adds stable Pokemon and Bill's Archive candidates for 30th promo art", () => {
    const source = new URL(
      "https://www.pokemon.com/us/news/w_2000/f_auto/q_auto:best/v1/live/pcom-cms/static-assets/cms3/us/img/cards/full/MEP/MEP_EN_101_PC.png"
    );

    expect(getRemoteImageCandidates(source).map((url) => url.href)).toEqual([
      source.href,
      "https://www.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_101_PC.png",
      "https://bills-archive.nyc3.cdn.digitaloceanspaces.com/30th/30th_EN_101.webp",
    ]);
  });

  it("leaves unrelated images unchanged", () => {
    const source = new URL("https://www.pokemon.com/static/card.png");
    expect(getRemoteImageCandidates(source)).toEqual([source]);
  });
});
