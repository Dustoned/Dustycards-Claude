import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_SIGNAL_RADAR_FEED_DELAY_MS,
  MIN_CHASE_WATCH_REVALIDATE_DELAY_MS,
  commitSignalRadarFeedResult,
  getChaseWatchRevalidateDelayMs,
  getSignalRadarFeedStartDelay,
  scheduleSignalRadarFeedStart,
  selectInitialSignalRadarCards,
} from "@/lib/signal-radar-progressive";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";

describe("selectInitialSignalRadarCards", () => {
  it("revalidates Chase Watch just after its scheduled background check", () => {
    const now = new Date("2026-07-21T12:00:00Z").getTime();
    expect(
      getChaseWatchRevalidateDelayMs("2026-07-21T14:00:00Z", now)
    ).toBe(2 * 60 * 60_000 + MIN_CHASE_WATCH_REVALIDATE_DELAY_MS);
    expect(
      getChaseWatchRevalidateDelayMs("2026-07-21T11:00:00Z", now)
    ).toBe(MIN_CHASE_WATCH_REVALIDATE_DELAY_MS);
    expect(getChaseWatchRevalidateDelayMs(null, now)).toBeNull();
  });

  it("gives initial detail navigation a short uncontended window", () => {
    expect(getSignalRadarFeedStartDelay(0)).toBe(INITIAL_SIGNAL_RADAR_FEED_DELAY_MS);
    expect(getSignalRadarFeedStartDelay(1)).toBe(0);
    expect(getSignalRadarFeedStartDelay(2)).toBe(0);
  });

  it("does not start the feed after detail navigation unmounts the browser", async () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const cancel = scheduleSignalRadarFeedStart(0, start);

    cancel();
    await vi.advanceTimersByTimeAsync(INITIAL_SIGNAL_RADAR_FEED_DELAY_MS);

    expect(start).not.toHaveBeenCalled();
  });

  it("starts an explicit retry without the initial delay", async () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const cancel = scheduleSignalRadarFeedStart(1, start);

    await vi.advanceTimersByTimeAsync(0);

    expect(start).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("refuses a stale state commit after an active request is cancelled", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null = null;
    const cancel = scheduleSignalRadarFeedStart(1, (signal) => {
      requestSignal = signal;
    });
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    const commit = vi.fn();

    expect(requestSignal).not.toBeNull();
    expect(commitSignalRadarFeedResult(requestSignal as unknown as AbortSignal, commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills the initial radar grid without duplicating new-release chase cards", () => {
    const signals = Array.from({ length: 18 }, (_, index) => ({
      cardId: `card-${index}`,
    })) as ExternalCardSignal[];
    const excluded = new Set(["card-0", "card-1", "card-2", "card-3"]);

    const initial = selectInitialSignalRadarCards(signals, excluded, 12);

    expect(initial).toHaveLength(12);
    expect(initial[0]?.cardId).toBe("card-4");
    expect(initial.some((signal) => excluded.has(signal.cardId))).toBe(false);
  });

  it("retains one marker when the chase panel owns every signal", () => {
    const signals = [{ cardId: "chase-1" }, { cardId: "chase-2" }] as ExternalCardSignal[];

    expect(
      selectInitialSignalRadarCards(signals, new Set(["chase-1", "chase-2"])).map(
        (signal) => signal.cardId
      )
    ).toEqual(["chase-1"]);
  });
});
