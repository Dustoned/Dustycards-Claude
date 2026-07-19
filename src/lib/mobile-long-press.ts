export const MOBILE_LONG_PRESS_MS = 420;
export const MOBILE_LONG_PRESS_MOVE_CANCEL_DISTANCE = 10;

export interface MobileLongPressPoint {
  x: number;
  y: number;
}

export function hasMobileLongPressMoved(
  start: MobileLongPressPoint,
  current: MobileLongPressPoint
): boolean {
  return (
    Math.hypot(current.x - start.x, current.y - start.y) >
    MOBILE_LONG_PRESS_MOVE_CANCEL_DISTANCE
  );
}
