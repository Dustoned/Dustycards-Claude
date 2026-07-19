export const CARD_THREE_AUTO_ROTATE_IDLE_RESUME_MS = 60_000;
export const CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE = 0.22;
export const CARD_THREE_INLINE_IDLE_ROTATION_SPEED = 0.00038;
export const CARD_THREE_WIGGLE_AMPLITUDE_RADIANS = Math.PI / 90;
export const CARD_THREE_WIGGLE_PERIOD_MS = 900;

export function normalizeCardThreeRotationAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function getCardThreeAutoRotateResumeDelay(
  lastInteractionAt: number | null,
  now: number
): number {
  if (lastInteractionAt == null) return 0;
  return Math.max(
    0,
    CARD_THREE_AUTO_ROTATE_IDLE_RESUME_MS - Math.max(0, now - lastInteractionAt)
  );
}

export function getCardThreeInlineIdleRotation(
  now: number,
  phase: number
): number {
  return (
    Math.sin(now * CARD_THREE_INLINE_IDLE_ROTATION_SPEED + phase) *
    CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE
  );
}

export function getCardThreeInlineIdlePhase(
  rotation: number,
  now: number
): number {
  const nearestIdleRotation = Math.min(
    CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE,
    Math.max(-CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE, rotation)
  );
  return (
    Math.asin(nearestIdleRotation / CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE) -
    now * CARD_THREE_INLINE_IDLE_ROTATION_SPEED
  );
}

export function getCardThreeWiggleAngle(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;

  const progress = (elapsedMs % CARD_THREE_WIGGLE_PERIOD_MS) / CARD_THREE_WIGGLE_PERIOD_MS;
  const phase = Math.PI * 2 * progress;

  return CARD_THREE_WIGGLE_AMPLITUDE_RADIANS * Math.sin(phase);
}

export function getCardThreeWiggleCameraOffset(
  cameraDistance: number,
  angle: number
): number {
  if (!Number.isFinite(cameraDistance) || !Number.isFinite(angle)) return 0;
  return Math.max(0, cameraDistance) * Math.tan(angle);
}
