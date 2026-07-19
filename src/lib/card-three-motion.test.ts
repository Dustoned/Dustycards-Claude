import { describe, expect, it } from "vitest";
import {
  CARD_THREE_AUTO_ROTATE_IDLE_RESUME_MS,
  CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE,
  CARD_THREE_INLINE_IDLE_ROTATION_SPEED,
  CARD_THREE_WIGGLE_AMPLITUDE_RADIANS,
  CARD_THREE_WIGGLE_DURATION_MS,
  getCardThreeAutoRotateResumeDelay,
  getCardThreeInlineIdlePhase,
  getCardThreeInlineIdleRotation,
  getCardThreeWiggleAngle,
  getCardThreeWiggleCameraOffset,
  normalizeCardThreeRotationAngle,
} from "@/lib/card-three-motion";

describe("card three motion", () => {
  it("resumes exactly one minute after the latest interaction", () => {
    expect(getCardThreeAutoRotateResumeDelay(null, 25_000)).toBe(0);
    expect(getCardThreeAutoRotateResumeDelay(25_000, 25_000)).toBe(
      CARD_THREE_AUTO_ROTATE_IDLE_RESUME_MS
    );
    expect(getCardThreeAutoRotateResumeDelay(25_000, 84_999)).toBe(1);
    expect(getCardThreeAutoRotateResumeDelay(25_000, 85_000)).toBe(0);
  });

  it("uses an even left-to-right idle sweep around the neutral angle", () => {
    const quarterPeriod =
      Math.PI / 2 / CARD_THREE_INLINE_IDLE_ROTATION_SPEED;

    expect(getCardThreeInlineIdleRotation(0, 0)).toBeCloseTo(0, 8);
    expect(getCardThreeInlineIdleRotation(quarterPeriod, 0)).toBeCloseTo(
      CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE,
      8
    );
    expect(getCardThreeInlineIdleRotation(quarterPeriod * 2, 0)).toBeCloseTo(0, 8);
    expect(getCardThreeInlineIdleRotation(quarterPeriod * 3, 0)).toBeCloseTo(
      -CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE,
      8
    );
  });

  it("continues from the nearest idle angle after interaction", () => {
    const now = 43_210;
    const phase = getCardThreeInlineIdlePhase(0.14, now);
    expect(getCardThreeInlineIdleRotation(now, phase)).toBeCloseTo(0.14, 8);

    const clampedPhase = getCardThreeInlineIdlePhase(1.7, now);
    expect(getCardThreeInlineIdleRotation(now, clampedPhase)).toBeCloseTo(
      CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE,
      8
    );
    expect(normalizeCardThreeRotationAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 8);
  });

  it("creates a short zero-centered two-cycle stereoscopic wiggle", () => {
    const firstPositivePeak = CARD_THREE_WIGGLE_DURATION_MS / 8;
    const firstNegativePeak = (CARD_THREE_WIGGLE_DURATION_MS * 3) / 8;

    expect(getCardThreeWiggleAngle(0)).toBe(0);
    expect(getCardThreeWiggleAngle(firstPositivePeak)).toBeGreaterThan(0);
    expect(getCardThreeWiggleAngle(firstNegativePeak)).toBeLessThan(0);
    expect(
      Math.abs(getCardThreeWiggleAngle(firstPositivePeak))
    ).toBeLessThanOrEqual(CARD_THREE_WIGGLE_AMPLITUDE_RADIANS);
    expect(
      Math.abs(getCardThreeWiggleAngle(firstNegativePeak))
    ).toBeLessThanOrEqual(CARD_THREE_WIGGLE_AMPLITUDE_RADIANS);
    expect(getCardThreeWiggleAngle(CARD_THREE_WIGGLE_DURATION_MS)).toBe(0);
    expect(getCardThreeWiggleAngle(CARD_THREE_WIGGLE_DURATION_MS + 500)).toBe(0);
  });

  it("converts equal left and right view angles into symmetric camera offsets", () => {
    const distance = 8;
    const right = getCardThreeWiggleCameraOffset(
      distance,
      CARD_THREE_WIGGLE_AMPLITUDE_RADIANS
    );
    const left = getCardThreeWiggleCameraOffset(
      distance,
      -CARD_THREE_WIGGLE_AMPLITUDE_RADIANS
    );

    expect(right).toBeGreaterThan(0);
    expect(left).toBeCloseTo(-right, 10);
    expect(getCardThreeWiggleCameraOffset(distance, 0)).toBe(0);
  });
});
