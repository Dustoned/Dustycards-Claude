import { describe, expect, it } from "vitest";
import {
  getScannerFrameDifference,
  getScannerObjectCoverSourceRect,
  measureScannerFrame,
} from "@/lib/card-scanner-frame";

function detailedFrame(width: number, height: number): Uint8Array {
  return Uint8Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return (x * 19 + y * 31 + ((x + y) % 3) * 47) % 220 + 18;
  });
}

describe("scanner frame readiness", () => {
  it("maps the visible outline to intrinsic object-cover camera pixels", () => {
    expect(
      getScannerObjectCoverSourceRect({
        sourceWidth: 1_920,
        sourceHeight: 1_440,
        viewport: { x: 10, y: 20, width: 390, height: 700 },
        frame: { x: 65, y: 73, width: 280, height: 391 },
      })
    ).toEqual({
      x: 672,
      y: 109.02857142857142,
      width: 576,
      height: 804.3428571428572,
    });
  });

  it("recognizes a detailed, stable and well-lit frame", () => {
    const frame = detailedFrame(36, 50);
    const metrics = measureScannerFrame(frame, 36, 50, frame);
    expect(metrics.cardInFrame).toBe(true);
    expect(metrics.nameZoneReadable).toBe(true);
    expect(metrics.numberZoneReadable).toBe(true);
    expect(metrics.stable).toBe(true);
    expect(metrics.ready).toBe(true);
  });

  it("rejects flat or moving frames", () => {
    const flat = new Uint8Array(36 * 50).fill(125);
    expect(measureScannerFrame(flat, 36, 50, flat).ready).toBe(false);

    const first = detailedFrame(36, 50);
    const second = Uint8Array.from(first, (value) => 255 - value);
    expect(measureScannerFrame(second, 36, 50, first).stable).toBe(false);
    expect(getScannerFrameDifference(first, second)).toBeGreaterThan(20);
  });
});
