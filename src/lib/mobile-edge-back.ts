export const MOBILE_EDGE_BACK_EVENT = "dustycards:mobile-edge-back";

/**
 * Gives the currently open in-app surface first refusal on a mobile edge-back
 * gesture. A listener handles the request by calling `preventDefault()`.
 */
export function dispatchMobileEdgeBackRequest(): boolean {
  const event = new Event(MOBILE_EDGE_BACK_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
