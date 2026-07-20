export const MOBILE_EDGE_BACK_EVENT = "dustycards:mobile-edge-back";

export const MOBILE_EDGE_BACK_CAPTURE_PX = 12;
export const MOBILE_EDGE_BACK_MIN_SWIPE_PX = 76;
export const MOBILE_EDGE_BACK_SLOW_SWIPE_PX = 112;
export const MOBILE_EDGE_BACK_MAX_VERTICAL_DRIFT_PX = 64;
export const MOBILE_EDGE_BACK_MIN_HORIZONTAL_RATIO = 1.45;
export const MOBILE_EDGE_BACK_MIN_VELOCITY = 0.18;

export interface MobileEdgeBackGestureDelta {
  deltaX: number;
  deltaY: number;
  elapsedMs: number;
}

function isHorizontalEdgeBackIntent({
  deltaX,
  deltaY,
}: MobileEdgeBackGestureDelta): boolean {
  return (
    deltaX > 0 &&
    deltaY <= MOBILE_EDGE_BACK_MAX_VERTICAL_DRIFT_PX &&
    deltaX / Math.max(1, deltaY) >= MOBILE_EDGE_BACK_MIN_HORIZONTAL_RATIO
  );
}

/**
 * Once horizontal intent is clear, keep WebKit from taking the gesture away
 * from the app and ending it as a native overscroll cancellation.
 */
export function shouldCaptureMobileEdgeBackGesture(
  gesture: MobileEdgeBackGestureDelta
): boolean {
  return (
    gesture.deltaX >= MOBILE_EDGE_BACK_CAPTURE_PX &&
    isHorizontalEdgeBackIntent(gesture)
  );
}

/**
 * A deliberate long edge swipe should work even when it is slow. Shorter
 * swipes still need native-like velocity so ordinary vertical scrolling is
 * never interpreted as Back.
 */
export function shouldCompleteMobileEdgeBackGesture(
  gesture: MobileEdgeBackGestureDelta
): boolean {
  if (!isHorizontalEdgeBackIntent(gesture)) return false;

  const velocity = gesture.deltaX / Math.max(1, gesture.elapsedMs);
  return (
    gesture.deltaX >= MOBILE_EDGE_BACK_SLOW_SWIPE_PX ||
    (gesture.deltaX >= MOBILE_EDGE_BACK_MIN_SWIPE_PX &&
      velocity >= MOBILE_EDGE_BACK_MIN_VELOCITY)
  );
}

/**
 * Gives the currently open in-app surface first refusal on a mobile edge-back
 * gesture. A listener handles the request by calling `preventDefault()`.
 */
export function dispatchMobileEdgeBackRequest(
  target: Pick<EventTarget, "dispatchEvent"> = window
): boolean {
  const event = new Event(MOBILE_EDGE_BACK_EVENT, { cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
