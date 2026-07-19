export const CARD_HOLO_MASK_MAX_EDGE = 448;
export const CARD_HOLO_MASK_MAX_COVERAGE = 0.42;

export type CardHoloMaskTemplate = "pokemon" | "none";

export interface CardHoloMaskCard {
  game?: string | null;
  supertype?: string | null;
}

export interface CardHoloMaskSource {
  width: number;
  height: number;
  data?: ArrayLike<number> | null;
}

export interface CardHoloMaskResult {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  coverage: number;
  analyzed: boolean;
}

interface MaskShape {
  kind: "ellipse" | "rounded-rect";
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  feather: number;
  strength: number;
}

interface MaskWeights {
  hard: number;
  ink: number;
}

const POKEMON_HARD_SHAPES: readonly MaskShape[] = [
  {
    kind: "ellipse",
    x: 0.025,
    y: 0.01,
    width: 0.18,
    height: 0.155,
    feather: 0.014,
    strength: 0.98,
  },
  {
    kind: "ellipse",
    x: 0.89,
    y: 0.022,
    width: 0.09,
    height: 0.09,
    feather: 0.012,
    strength: 0.96,
  },
];

const POKEMON_INK_SHAPES: readonly MaskShape[] = [
  {
    kind: "rounded-rect",
    x: 0.018,
    y: 0.008,
    width: 0.205,
    height: 0.05,
    radius: 0.015,
    feather: 0.012,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.145,
    y: 0.025,
    width: 0.56,
    height: 0.055,
    radius: 0.015,
    feather: 0.01,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.72,
    y: 0.012,
    width: 0.16,
    height: 0.07,
    radius: 0.018,
    feather: 0.01,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.145,
    y: 0.09,
    width: 0.48,
    height: 0.032,
    radius: 0.009,
    feather: 0.008,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.035,
    y: 0.56,
    width: 0.23,
    height: 0.062,
    radius: 0.018,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.275,
    y: 0.565,
    width: 0.48,
    height: 0.045,
    radius: 0.012,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.84,
    y: 0.555,
    width: 0.135,
    height: 0.065,
    radius: 0.016,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.035,
    y: 0.625,
    width: 0.9,
    height: 0.025,
    radius: 0.008,
    feather: 0.008,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.035,
    y: 0.654,
    width: 0.72,
    height: 0.025,
    radius: 0.008,
    feather: 0.008,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.035,
    y: 0.715,
    width: 0.23,
    height: 0.062,
    radius: 0.018,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.275,
    y: 0.72,
    width: 0.5,
    height: 0.045,
    radius: 0.012,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.84,
    y: 0.71,
    width: 0.135,
    height: 0.065,
    radius: 0.016,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.035,
    y: 0.785,
    width: 0.9,
    height: 0.025,
    radius: 0.008,
    feather: 0.008,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.025,
    y: 0.855,
    width: 0.95,
    height: 0.025,
    radius: 0.008,
    feather: 0.008,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.025,
    y: 0.91,
    width: 0.33,
    height: 0.06,
    radius: 0.01,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.36,
    y: 0.91,
    width: 0.615,
    height: 0.05,
    radius: 0.01,
    feather: 0.009,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.025,
    y: 0.962,
    width: 0.31,
    height: 0.03,
    radius: 0.008,
    feather: 0.007,
    strength: 1,
  },
  {
    kind: "rounded-rect",
    x: 0.28,
    y: 0.982,
    width: 0.5,
    height: 0.017,
    radius: 0.006,
    feather: 0.006,
    strength: 1,
  },
];

// Copyright lines are commonly printed as tiny mid-grey type on the silver
// bottom border. The normal ink detector intentionally ignores those tones to
// avoid flattening neutral illustration details. Keep the more sensitive
// detector scoped to this narrow semantic region so it follows glyph contours
// without producing a full-width matte footer band.
const POKEMON_FINE_INK_SHAPES: readonly MaskShape[] = [
  {
    kind: "rounded-rect",
    x: 0.275,
    y: 0.971,
    width: 0.45,
    height: 0.022,
    radius: 0.005,
    feather: 0.004,
    strength: 1,
  },
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp01((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
}

function signedRoundedRectDistance(shape: MaskShape, x: number, y: number): number {
  const radius = Math.min(
    shape.radius ?? 0,
    shape.width / 2,
    shape.height / 2
  );
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const qx = Math.abs(x - centerX) - (halfWidth - radius);
  const qy = Math.abs(y - centerY) - (halfHeight - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function signedEllipseDistance(shape: MaskShape, x: number, y: number): number {
  const radiusX = Math.max(shape.width / 2, 0.0001);
  const radiusY = Math.max(shape.height / 2, 0.0001);
  const centerX = shape.x + radiusX;
  const centerY = shape.y + radiusY;
  const normalizedDistance = Math.hypot(
    (x - centerX) / radiusX,
    (y - centerY) / radiusY
  );
  return (normalizedDistance - 1) * Math.min(radiusX, radiusY);
}

function getShapeWeight(shape: MaskShape, x: number, y: number): number {
  const distance =
    shape.kind === "ellipse"
      ? signedEllipseDistance(shape, x, y)
      : signedRoundedRectDistance(shape, x, y);
  if (distance <= 0) return shape.strength;
  return shape.strength * (1 - smoothstep(0, shape.feather, distance));
}

function getStrongestShapeWeight(
  shapes: readonly MaskShape[],
  x: number,
  y: number
): number {
  let weight = 0;
  for (const shape of shapes) {
    weight = Math.max(weight, getShapeWeight(shape, x, y));
  }
  return weight;
}

export function resolveCardHoloMaskTemplate(
  card: CardHoloMaskCard
): CardHoloMaskTemplate {
  const game = card.game?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
  const supertype = card.supertype?.trim().toLowerCase() ?? "";

  if (game === "pokemon" || game === "pokémon" || supertype === "pokémon") {
    return "pokemon";
  }

  return "none";
}

export function getCardHoloMaskDimensions(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 63;
  const safeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 88;
  const scale = Math.min(1, CARD_HOLO_MASK_MAX_EDGE / Math.max(safeWidth, safeHeight));

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function getCardHoloMaskWeights(
  template: CardHoloMaskTemplate,
  x: number,
  y: number
): MaskWeights {
  if (template !== "pokemon") return { hard: 0, ink: 0 };

  return {
    hard: getStrongestShapeWeight(POKEMON_HARD_SHAPES, x, y),
    ink: getStrongestShapeWeight(POKEMON_INK_SHAPES, x, y),
  };
}

function getPixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function getMaskOffset(width: number, x: number, y: number): number {
  return y * width + x;
}

function getChannel(data: ArrayLike<number>, offset: number): number {
  const value = Number(data[offset]);
  return Number.isFinite(value) ? clamp01(value / 255) : 0;
}

interface InkLikelihoodMaps {
  standard: Float32Array;
  fine: Float32Array;
}

function buildInkLikelihood(
  width: number,
  height: number,
  source: ArrayLike<number>
): InkLikelihoodMaps {
  const luma = new Float32Array(width * height);
  const saturation = new Float32Array(width * height);
  const standard = new Float32Array(width * height);
  const fine = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = getPixelOffset(width, x, y);
      const maskOffset = getMaskOffset(width, x, y);
      const red = getChannel(source, pixelOffset);
      const green = getChannel(source, pixelOffset + 1);
      const blue = getChannel(source, pixelOffset + 2);
      luma[maskOffset] = red * 0.299 + green * 0.587 + blue * 0.114;
      saturation[maskOffset] = Math.max(red, green, blue) - Math.min(red, green, blue);
    }
  }

  const sampleOffsets = [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const maskOffset = getMaskOffset(width, x, y);
      const pixelOffset = getPixelOffset(width, x, y);
      const centerLuma = luma[maskOffset];
      const centerRed = getChannel(source, pixelOffset);
      const centerGreen = getChannel(source, pixelOffset + 1);
      const centerBlue = getChannel(source, pixelOffset + 2);
      let lumaSum = 0;
      let samples = 0;
      let maxLumaDelta = 0;
      let maxColorDelta = 0;

      for (const [offsetX, offsetY] of sampleOffsets) {
        const sampleX = Math.min(width - 1, Math.max(0, x + offsetX));
        const sampleY = Math.min(height - 1, Math.max(0, y + offsetY));
        const sampleMaskOffset = getMaskOffset(width, sampleX, sampleY);
        const samplePixelOffset = getPixelOffset(width, sampleX, sampleY);
        const sampleLuma = luma[sampleMaskOffset];
        const redDelta = Math.abs(centerRed - getChannel(source, samplePixelOffset));
        const greenDelta = Math.abs(centerGreen - getChannel(source, samplePixelOffset + 1));
        const blueDelta = Math.abs(centerBlue - getChannel(source, samplePixelOffset + 2));

        lumaSum += sampleLuma;
        samples += 1;
        maxLumaDelta = Math.max(maxLumaDelta, Math.abs(centerLuma - sampleLuma));
        maxColorDelta = Math.max(maxColorDelta, (redDelta + greenDelta + blueDelta) / 3);
      }

      const localMean = samples > 0 ? lumaSum / samples : centerLuma;
      const centerContrast = Math.abs(centerLuma - localMean);
      const edgeScore = smoothstep(
        0.035,
        0.2,
        maxLumaDelta * 0.82 + maxColorDelta * 0.24 + centerContrast * 1.45
      );
      const neutralInk = 1 - smoothstep(0.09, 0.34, saturation[maskOffset]);
      const darkInk =
        neutralInk *
        (1 - smoothstep(0.16, 0.5, centerLuma)) *
        smoothstep(0.025, 0.115, maxLumaDelta + centerContrast * 1.4);
      const neutralEdge = neutralInk * edgeScore;

      // Full-art cards contain high-frequency, highly saturated illustration
      // across the same area as their printed rules. Treating every colorful
      // edge as ink creates visible matte bands. Typography and UI outlines are
      // predominantly neutral black/white, so require that neutral signal here;
      // known colored symbols are handled by the semantic hard shapes instead.
      standard[maskOffset] = clamp01(
        darkInk * 0.94 + neutralEdge * 0.12
      );

      // Tiny footer type is only a few pixels tall after downsampling. Detect
      // its darker glyph cores while requiring local contrast; otherwise the
      // neutral silver border itself becomes one rectangular matte strip.
      const fineLocalContrast = Math.max(0, localMean - centerLuma);
      const fineNeutralInk =
        neutralInk *
        (1 - smoothstep(0.56, 0.7, centerLuma)) *
        smoothstep(
          0.012,
          0.075,
          fineLocalContrast + maxLumaDelta * 0.24
        );
      fine[maskOffset] = clamp01(
        Math.max(darkInk, fineNeutralInk * 0.98)
      );
    }
  }

  return { standard, fine };
}

function dilateAndSoftenMask(
  width: number,
  height: number,
  source: Float32Array
): Float32Array {
  const radius = Math.max(1, Math.round(Math.min(width, height) / 180));
  const dilated = new Float32Array(source.length);
  const softened = new Float32Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let strongest = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = Math.min(height - 1, Math.max(0, y + offsetY));
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = Math.min(width - 1, Math.max(0, x + offsetX));
          strongest = Math.max(strongest, source[getMaskOffset(width, sampleX, sampleY)]);
        }
      }
      dilated[getMaskOffset(width, x, y)] = strongest;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let samples = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const sampleY = Math.min(height - 1, Math.max(0, y + offsetY));
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.min(width - 1, Math.max(0, x + offsetX));
          const weight = offsetX === 0 && offsetY === 0 ? 2 : 1;
          sum += dilated[getMaskOffset(width, sampleX, sampleY)] * weight;
          samples += weight;
        }
      }
      softened[getMaskOffset(width, x, y)] = sum / samples;
    }
  }

  return softened;
}

function createNeutralMask(width: number, height: number): CardHoloMaskResult {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  return { width, height, data, coverage: 0, analyzed: false };
}

export function buildCardHoloMask(
  source: CardHoloMaskSource,
  template: CardHoloMaskTemplate
): CardHoloMaskResult {
  const width = Math.max(1, Math.floor(source.width));
  const height = Math.max(1, Math.floor(source.height));
  const expectedLength = width * height * 4;

  if (
    template === "none" ||
    !source.data ||
    source.data.length < expectedLength ||
    Math.max(width, height) > CARD_HOLO_MASK_MAX_EDGE
  ) {
    return createNeutralMask(width, height);
  }

  const inkLikelihoodMaps = buildInkLikelihood(width, height, source.data);
  const inkLikelihood = dilateAndSoftenMask(
    width,
    height,
    inkLikelihoodMaps.standard
  );
  // Fine footer type is only a few pixels tall at mask resolution. Reusing the
  // general dilation would join neighbouring letters into one matte strip.
  // Preserve its per-pixel contour; GPU texture filtering feathers it at render
  // time without filling the spaces between glyphs.
  const fineInkLikelihood = inkLikelihoodMaps.fine;
  const hardProtection = new Float32Array(width * height);
  const inkProtection = new Float32Array(width * height);
  let hardCoverage = 0;
  let inkCoverage = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const maskOffset = getMaskOffset(width, x, y);
      const normalizedX = (x + 0.5) / width;
      const normalizedY = (y + 0.5) / height;
      const weights = getCardHoloMaskWeights(template, normalizedX, normalizedY);
      const fineInkWeight = getStrongestShapeWeight(
        POKEMON_FINE_INK_SHAPES,
        normalizedX,
        normalizedY
      );
      const hard = clamp01(weights.hard);
      const ink = clamp01(
        Math.max(
          weights.ink * smoothstep(0.42, 0.86, inkLikelihood[maskOffset]),
          fineInkWeight * smoothstep(0.08, 0.62, fineInkLikelihood[maskOffset])
        )
      ) * (1 - hard);
      hardProtection[maskOffset] = hard;
      inkProtection[maskOffset] = ink;
      hardCoverage += hard;
      inkCoverage += ink;
    }
  }

  const pixelCount = width * height;
  const maximumCoverage = CARD_HOLO_MASK_MAX_COVERAGE * pixelCount;
  const availableInkCoverage = Math.max(0, maximumCoverage - hardCoverage);
  const inkScale = inkCoverage > availableInkCoverage && inkCoverage > 0
    ? availableInkCoverage / inkCoverage
    : 1;
  const data = new Uint8ClampedArray(expectedLength);
  let protectedTotal = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const protection = clamp01(
      hardProtection[index] + inkProtection[index] * inkScale
    );
    const foilAllowance = Math.round((1 - protection) * 255);
    const offset = index * 4;
    data[offset] = foilAllowance;
    data[offset + 1] = foilAllowance;
    data[offset + 2] = foilAllowance;
    data[offset + 3] = 255;
    protectedTotal += protection;
  }

  return {
    width,
    height,
    data,
    coverage: protectedTotal / pixelCount,
    analyzed: true,
  };
}
