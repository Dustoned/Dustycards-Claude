export const MOBILE_PULL_REFRESH_TRIGGER_PX = 72;
export const MOBILE_PULL_REFRESH_MAX_PX = 110;
export const MOBILE_PULL_REFRESH_RESISTANCE = 2.4;
export const MOBILE_PULL_REFRESH_INTENT_SLOP_PX = 12;
export const MOBILE_PULL_REFRESH_VERTICAL_RATIO = 1.35;
export const MOBILE_PULL_REFRESH_EDGE_GUARD_PX = 26;

export type MobilePullGesturePhase = "idle" | "pending" | "pulling" | "cancelled";

export interface MobilePullGestureState {
  phase: MobilePullGesturePhase;
  startX: number;
  startY: number;
  pullPx: number;
}

interface MobilePullGesturePoint {
  x: number;
  y: number;
}

interface MobilePullGestureMove extends MobilePullGesturePoint {
  touchCount: number;
  rootAtTop: boolean;
}

export interface MobilePullGestureResult {
  state: MobilePullGestureState;
  preventDefault: boolean;
}

export function createIdleMobilePullGesture(): MobilePullGestureState {
  return { phase: "idle", startX: 0, startY: 0, pullPx: 0 };
}

export function beginMobilePullGesture(
  point: MobilePullGesturePoint,
  eligible: boolean
): MobilePullGestureState {
  return eligible
    ? { phase: "pending", startX: point.x, startY: point.y, pullPx: 0 }
    : createIdleMobilePullGesture();
}

export function cancelMobilePullGesture(
  state: MobilePullGestureState
): MobilePullGestureState {
  if (state.phase === "idle") return state;
  return { ...state, phase: "cancelled", pullPx: 0 };
}

export function advanceMobilePullGesture(
  state: MobilePullGestureState,
  move: MobilePullGestureMove
): MobilePullGestureResult {
  if (state.phase === "idle" || state.phase === "cancelled") {
    return { state, preventDefault: false };
  }

  if (move.touchCount !== 1 || !move.rootAtTop) {
    return {
      state: { ...state, phase: "cancelled", pullPx: 0 },
      preventDefault: false,
    };
  }

  const dx = move.x - state.startX;
  const dy = move.y - state.startY;
  const absoluteX = Math.abs(dx);
  const absoluteY = Math.abs(dy);

  if (state.phase === "pending" && absoluteX < MOBILE_PULL_REFRESH_INTENT_SLOP_PX && absoluteY < MOBILE_PULL_REFRESH_INTENT_SLOP_PX) {
    return { state, preventDefault: false };
  }

  if (
    dy <= 0 ||
    absoluteX >= MOBILE_PULL_REFRESH_INTENT_SLOP_PX &&
      dy < absoluteX * MOBILE_PULL_REFRESH_VERTICAL_RATIO
  ) {
    return {
      state: { ...state, phase: "cancelled", pullPx: 0 },
      preventDefault: false,
    };
  }

  const pullPx = Math.min(
    MOBILE_PULL_REFRESH_MAX_PX,
    dy / MOBILE_PULL_REFRESH_RESISTANCE
  );
  return {
    state: { ...state, phase: "pulling", pullPx },
    preventDefault: true,
  };
}

export function finishMobilePullGesture(
  state: MobilePullGestureState,
  remainingTouchCount = 0
): {
  refresh: boolean;
  state: MobilePullGestureState;
} {
  if (remainingTouchCount > 0) {
    return { refresh: false, state };
  }

  return {
    refresh:
      state.phase === "pulling" &&
      state.pullPx >= MOBILE_PULL_REFRESH_TRIGGER_PX,
    state: createIdleMobilePullGesture(),
  };
}
