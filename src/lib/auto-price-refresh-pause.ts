export const AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_MS = 15 * 60 * 1000;
export const AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_LABEL = "15 minutes";

export function getAutoPriceRefreshPauseRemainingMs(input: {
  cancelledAt: Date | null;
  now?: Date;
}): number {
  const { cancelledAt, now = new Date() } = input;

  if (!cancelledAt) {
    return 0;
  }

  return Math.max(
    cancelledAt.getTime() + AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_MS - now.getTime(),
    0
  );
}

export function formatAutoPriceRefreshPauseRemaining(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "under a minute";
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);

  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${hours}h ${minutes}m`;
}
