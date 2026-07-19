export const CARD_THREE_AUTO_ROTATE_IDLE_RESUME_MS = 60_000;
export const CARD_THREE_INLINE_IDLE_ROTATION_AMPLITUDE = 0.22;
export const CARD_THREE_INLINE_IDLE_ROTATION_SPEED = 0.00038;

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
