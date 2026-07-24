export type ScannerFrameMetrics = {
  brightness: number;
  contrast: number;
  edgeStrength: number;
  nameZoneContrast: number;
  numberZoneContrast: number;
  motion: number | null;
};

export type ScannerFrameReadiness = ScannerFrameMetrics & {
  cardInFrame: boolean;
  lightingGood: boolean;
  nameZoneReadable: boolean;
  numberZoneReadable: boolean;
  stable: boolean;
  ready: boolean;
};

export type ScannerRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getScannerObjectCoverSourceRect(input: {
  sourceWidth: number;
  sourceHeight: number;
  viewport: ScannerRectangle;
  frame: ScannerRectangle;
}): ScannerRectangle {
  const { sourceWidth, sourceHeight, viewport, frame } = input;
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  const coverScale = Math.max(
    viewport.width / sourceWidth,
    viewport.height / sourceHeight
  );
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const hiddenLeft = (renderedWidth - viewport.width) / 2;
  const hiddenTop = (renderedHeight - viewport.height) / 2;
  const unclamped = {
    x: (frame.x - viewport.x + hiddenLeft) / coverScale,
    y: (frame.y - viewport.y + hiddenTop) / coverScale,
    width: frame.width / coverScale,
    height: frame.height / coverScale,
  };
  const x = Math.max(0, Math.min(sourceWidth - 1, unclamped.x));
  const y = Math.max(0, Math.min(sourceHeight - 1, unclamped.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(sourceWidth - x, unclamped.width)),
    height: Math.max(1, Math.min(sourceHeight - y, unclamped.height)),
  };
}

function mean(values: Uint8Array, start = 0, end = values.length): number {
  if (end <= start) return 0;
  let total = 0;
  for (let index = start; index < end; index += 1) total += values[index];
  return total / (end - start);
}

function zoneContrast(
  values: Uint8Array,
  width: number,
  height: number,
  startRatio: number,
  endRatio: number
): number {
  const startY = Math.max(0, Math.floor(height * startRatio));
  const endY = Math.min(height, Math.ceil(height * endRatio));
  const start = startY * width;
  const end = endY * width;
  const average = mean(values, start, end);
  let variance = 0;
  for (let index = start; index < end; index += 1) {
    variance += (values[index] - average) ** 2;
  }
  return Math.sqrt(variance / Math.max(1, end - start));
}

export function rgbaToScannerGrayscale(
  rgba: Uint8ClampedArray
): Uint8Array {
  const grayscale = new Uint8Array(Math.floor(rgba.length / 4));
  for (let index = 0; index < grayscale.length; index += 1) {
    const offset = index * 4;
    grayscale[index] = Math.round(
      rgba[offset] * 0.299 +
        rgba[offset + 1] * 0.587 +
        rgba[offset + 2] * 0.114
    );
  }
  return grayscale;
}

export function measureScannerFrame(
  grayscale: Uint8Array,
  width: number,
  height: number,
  previous: Uint8Array | null
): ScannerFrameReadiness {
  const brightness = mean(grayscale);
  let variance = 0;
  let edgeTotal = 0;
  let edgeSamples = 0;
  let motionTotal = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = grayscale[index];
      variance += (value - brightness) ** 2;
      if (x > 0) {
        edgeTotal += Math.abs(value - grayscale[index - 1]);
        edgeSamples += 1;
      }
      if (y > 0) {
        edgeTotal += Math.abs(value - grayscale[index - width]);
        edgeSamples += 1;
      }
      if (previous?.length === grayscale.length) {
        motionTotal += Math.abs(value - previous[index]);
      }
    }
  }

  const contrast = Math.sqrt(variance / Math.max(1, grayscale.length));
  const edgeStrength = edgeTotal / Math.max(1, edgeSamples);
  const nameZoneContrast = zoneContrast(grayscale, width, height, 0.03, 0.24);
  const numberZoneContrast = zoneContrast(grayscale, width, height, 0.78, 0.98);
  const motion =
    previous?.length === grayscale.length
      ? motionTotal / grayscale.length
      : null;

  const lightingGood = brightness >= 42 && brightness <= 220 && contrast >= 24;
  const cardInFrame = contrast >= 28 && edgeStrength >= 8;
  const nameZoneReadable = nameZoneContrast >= 20 && edgeStrength >= 8;
  const numberZoneReadable = numberZoneContrast >= 17 && edgeStrength >= 8;
  const stable = motion != null && motion <= 6.5;

  return {
    brightness,
    contrast,
    edgeStrength,
    nameZoneContrast,
    numberZoneContrast,
    motion,
    cardInFrame,
    lightingGood,
    nameZoneReadable,
    numberZoneReadable,
    stable,
    ready:
      cardInFrame &&
      lightingGood &&
      nameZoneReadable &&
      numberZoneReadable &&
      stable,
  };
}

export function getScannerFrameDifference(
  left: Uint8Array | null,
  right: Uint8Array
): number | null {
  if (!left || left.length !== right.length) return null;
  let total = 0;
  for (let index = 0; index < right.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total / right.length;
}
