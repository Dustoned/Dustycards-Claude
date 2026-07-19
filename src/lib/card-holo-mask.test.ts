import { describe, expect, it } from "vitest";
import {
  CARD_HOLO_MASK_MAX_COVERAGE,
  CARD_HOLO_MASK_MAX_EDGE,
  buildCardHoloMask,
  getCardHoloMaskDimensions,
  getCardHoloMaskWeights,
  resolveCardHoloMaskTemplate,
} from "@/lib/card-holo-mask";

function createCardPixels(
  width: number,
  height: number,
  color: readonly [number, number, number]
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
  }
  return data;
}

function drawRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: { x: number; y: number; width: number; height: number },
  color: readonly [number, number, number]
) {
  const startX = Math.max(0, Math.floor(bounds.x * width));
  const startY = Math.max(0, Math.floor(bounds.y * height));
  const endX = Math.min(width, Math.ceil((bounds.x + bounds.width) * width));
  const endY = Math.min(height, Math.ceil((bounds.y + bounds.height) * height));

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
    }
  }
}

function getFoilAllowance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const pixelX = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const pixelY = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  return data[(pixelY * width + pixelX) * 4];
}

describe("card holo mask", () => {
  it("selects the Pokemon template without applying it to One Piece or unknown cards", () => {
    expect(resolveCardHoloMaskTemplate({ game: "pokemon" })).toBe("pokemon");
    expect(resolveCardHoloMaskTemplate({ game: "onepiece", supertype: "Character" })).toBe(
      "none"
    );
    expect(resolveCardHoloMaskTemplate({ supertype: "Pokémon" })).toBe("pokemon");
    expect(resolveCardHoloMaskTemplate({})).toBe("none");
  });

  it("caps mask dimensions while retaining the source aspect ratio", () => {
    const dimensions = getCardHoloMaskDimensions(1200, 1800);

    expect(Math.max(dimensions.width, dimensions.height)).toBe(CARD_HOLO_MASK_MAX_EDGE);
    expect(dimensions.width / dimensions.height).toBeCloseTo(1200 / 1800, 2);
  });

  it("protects print ink and fixed Pokemon UI while preserving artwork", () => {
    const width = 128;
    const height = 176;
    const source = createCardPixels(width, height, [42, 148, 166]);
    drawRect(source, width, height, { x: 0.28, y: 0.055, width: 0.34, height: 0.025 }, [12, 14, 18]);
    drawRect(source, width, height, { x: 0.77, y: 0.045, width: 0.11, height: 0.025 }, [12, 14, 18]);
    drawRect(source, width, height, { x: 0.27, y: 0.585, width: 0.45, height: 0.018 }, [10, 12, 14]);
    drawRect(source, width, height, { x: 0.26, y: 0.745, width: 0.42, height: 0.012 }, [8, 10, 12]);
    drawRect(source, width, height, { x: 0.26, y: 0.757, width: 0.42, height: 0.014 }, [244, 246, 248]);
    drawRect(source, width, height, { x: 0.25, y: 0.955, width: 0.5, height: 0.012 }, [10, 12, 14]);
    drawRect(source, width, height, { x: 0.42, y: 0.33, width: 0.16, height: 0.035 }, [8, 10, 12]);
    const original = source.slice();

    const first = buildCardHoloMask({ width, height, data: source }, "pokemon");
    const second = buildCardHoloMask({ width, height, data: source }, "pokemon");

    expect(first.analyzed).toBe(true);
    expect(first.data).toEqual(second.data);
    expect(source).toEqual(original);
    expect(first.coverage).toBeLessThanOrEqual(CARD_HOLO_MASK_MAX_COVERAGE + 0.0001);
    expect(getFoilAllowance(first.data, width, height, 0.1, 0.08)).toBeLessThan(25);
    expect(getFoilAllowance(first.data, width, height, 0.935, 0.067)).toBeLessThan(30);
    expect(getFoilAllowance(first.data, width, height, 0.82, 0.056)).toBeLessThan(120);
    expect(getFoilAllowance(first.data, width, height, 0.5, 0.96)).toBeLessThan(120);
    expect(getFoilAllowance(first.data, width, height, 0.4, 0.065)).toBeLessThan(120);
    expect(getFoilAllowance(first.data, width, height, 0.45, 0.592)).toBeLessThan(140);
    expect(getFoilAllowance(first.data, width, height, 0.52, 0.115)).toBe(255);
    expect(getFoilAllowance(first.data, width, height, 0.74, 0.1)).toBe(255);
    expect(getFoilAllowance(first.data, width, height, 0.12, 0.96)).toBe(255);
    expect(getFoilAllowance(first.data, width, height, 0.45, 0.35)).toBe(255);
    expect(getFoilAllowance(first.data, width, height, 0.55, 0.25)).toBe(255);
  });

  it("feathers template boundaries instead of producing a hard rectangular cutoff", () => {
    const inside = getCardHoloMaskWeights("pokemon", 0.935, 0.067).hard;
    const feather = getCardHoloMaskWeights("pokemon", 0.935, 0.118).hard;
    const outside = getCardHoloMaskWeights("pokemon", 0.935, 0.14).hard;

    expect(inside).toBeGreaterThan(0.9);
    expect(feather).toBeGreaterThan(0);
    expect(feather).toBeLessThan(inside);
    expect(outside).toBe(0);
  });

  it("protects grey copyright glyphs without masking the full bottom border", () => {
    const width = 256;
    const height = 352;
    const source = createCardPixels(width, height, [194, 198, 202]);
    drawRect(
      source,
      width,
      height,
      { x: 0.34, y: 0.979, width: 0.055, height: 0.007 },
      [92, 94, 96]
    );
    drawRect(
      source,
      width,
      height,
      { x: 0.43, y: 0.979, width: 0.075, height: 0.007 },
      [108, 110, 112]
    );
    drawRect(
      source,
      width,
      height,
      { x: 0.55, y: 0.979, width: 0.09, height: 0.007 },
      [98, 100, 102]
    );

    const result = buildCardHoloMask({ width, height, data: source }, "pokemon");

    expect(getFoilAllowance(result.data, width, height, 0.36, 0.982)).toBeLessThan(100);
    expect(getFoilAllowance(result.data, width, height, 0.46, 0.982)).toBeLessThan(140);
    expect(getFoilAllowance(result.data, width, height, 0.59, 0.982)).toBeLessThan(120);
    expect(getFoilAllowance(result.data, width, height, 0.29, 0.982)).toBe(255);
    expect(getFoilAllowance(result.data, width, height, 0.41, 0.982)).toBe(255);
    expect(getFoilAllowance(result.data, width, height, 0.7, 0.982)).toBe(255);
    expect(getFoilAllowance(result.data, width, height, 0.46, 0.962)).toBe(255);
    expect(getFoilAllowance(result.data, width, height, 0.46, 0.998)).toBe(255);
  });

  it("returns a neutral mask for unavailable pixels and unsupported templates", () => {
    const fallback = buildCardHoloMask({ width: 4, height: 6 }, "pokemon");
    const unsupported = buildCardHoloMask(
      { width: 4, height: 6, data: createCardPixels(4, 6, [0, 0, 0]) },
      "none"
    );

    expect(fallback.analyzed).toBe(false);
    expect(fallback.coverage).toBe(0);
    expect([...fallback.data].every((value) => value === 255)).toBe(true);
    expect(unsupported.data).toEqual(fallback.data);
  });
});
