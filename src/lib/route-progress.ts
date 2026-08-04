export const ROUTE_PROGRESS_START_EVENT = "dustycards:route-progress-start";

export interface RouteProgressStartDetail {
  href: string;
  label?: string | null;
}

export function notifyRouteProgressStart(href: string, label?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RouteProgressStartDetail>(ROUTE_PROGRESS_START_EVENT, {
      detail: { href, label },
    })
  );
}
