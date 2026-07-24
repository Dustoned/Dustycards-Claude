import { describe, expect, it } from "vitest";
import {
  getScannerFieldCaptureBounds,
  getScannerFieldCaptureBands,
  getScannerFieldScanRegion,
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

  it("uses a genuinely magnified centre target for a manually focused number", () => {
    const focus = getScannerFieldCaptureBounds("number", "focus");
    const expected = getScannerFieldCaptureBounds("number", "expected");

    expect(focus).toEqual({
      left: 0.23,
      top: 0.43,
      width: 0.54,
      height: 0.14,
    });
    expect(focus.width).toBeLessThan(expected.width * 0.6);
    expect(focus.left + focus.width / 2).toBeCloseTo(0.5);
    expect(focus.top + focus.height / 2).toBeCloseTo(0.5);
  });

  it("searches a broad lower-card area during automatic number reads", () => {
    const expected = getScannerFieldCaptureBounds("number", "expected");
    const bands = getScannerFieldCaptureBands("number", "expected");

    expect(expected.top).toBeLessThanOrEqual(0.62);
    expect(expected.top + expected.height).toBeGreaterThanOrEqual(0.98);
    expect(bands).toHaveLength(2);
    expect(bands[0].top).toBeLessThanOrEqual(0.6);
    expect(bands[0].top + bands[0].height).toBeGreaterThanOrEqual(0.76);
    expect(bands[1].top).toBeLessThanOrEqual(0.8);
    expect(bands[1].top + bands[1].height).toBeGreaterThanOrEqual(0.98);
  });

  it("uses one precise band only when manual field focus is active", () => {
    expect(getScannerFieldCaptureBands("number", "focus")).toEqual([
      getScannerFieldCaptureBounds("number", "focus"),
    ]);
  });

  it("never switches an automatic number read to the centre crop", () => {
    expect(getScannerFieldScanRegion("number", null)).toBe("expected");
    expect(getScannerFieldScanRegion("number", "name")).toBe("expected");
    expect(getScannerFieldScanRegion("number", "number")).toBe("focus");
  });

  it("keeps long names and attack text wider than the number target", () => {
    const name = getScannerFieldCaptureBounds("name", "focus");
    const number = getScannerFieldCaptureBounds("number", "focus");
    const attack = getScannerFieldCaptureBounds("attack", "focus");

    expect(name.width).toBeGreaterThan(number.width);
    expect(attack.width).toBeGreaterThan(name.width);
    expect(attack.height).toBeGreaterThan(name.height);
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
