import { describe, expect, it } from "vitest";
import {
  evaluateNewReleaseChasePriceGuard,
  getNewReleaseChaseFailureDelayMs,
  getNewReleaseChaseWatchCadence,
  getNewReleaseChaseWatchUiState,
} from "@/lib/new-release-chase-watch-core";

describe("new release chase watch policy", () => {
  const releaseDate = "2026-07-17T00:00:00.000Z";

  it("refreshes the top three faster and tapers after launch", () => {
    expect(
      getNewReleaseChaseWatchCadence({
        releaseDate,
        candidateRank: 1,
        now: new Date("2026-07-18T00:00:00.000Z"),
      }).cadenceMs
    ).toBe(3 * 60 * 60_000);
    expect(
      getNewReleaseChaseWatchCadence({
        releaseDate,
        candidateRank: 4,
        now: new Date("2026-07-18T00:00:00.000Z"),
      }).cadenceMs
    ).toBe(12 * 60 * 60_000);
    expect(
      getNewReleaseChaseWatchCadence({
        releaseDate,
        candidateRank: 1,
        now: new Date("2026-07-21T00:00:00.000Z"),
      }).cadenceMs
    ).toBe(6 * 60 * 60_000);
    expect(
      getNewReleaseChaseWatchCadence({
        releaseDate,
        candidateRank: 1,
        now: new Date("2026-07-26T00:00:00.000Z"),
      }).cadenceMs
    ).toBe(12 * 60 * 60_000);
  });

  it("gives late-imported cards a launch phase but stops after day fourteen", () => {
    expect(
      getNewReleaseChaseWatchCadence({
        releaseDate,
        firstSeenAt: "2026-07-26T00:00:00.000Z",
        candidateRank: 1,
        now: new Date("2026-07-26T12:00:00.000Z"),
      }).cadenceMs
    ).toBe(3 * 60 * 60_000);
    expect(
      getNewReleaseChaseWatchCadence({
        releaseDate,
        firstSeenAt: "2026-07-30T00:00:00.000Z",
        candidateRank: 1,
        now: new Date("2026-08-01T00:00:01.000Z"),
      }).active
    ).toBe(false);
  });

  it("separates current, due-soon, delayed, updating and paused UI states", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    expect(getNewReleaseChaseWatchUiState({ enabled: true, nextAttemptAt: "2026-07-21T14:00:00.000Z", now })).toBe("current");
    expect(getNewReleaseChaseWatchUiState({ enabled: true, nextAttemptAt: "2026-07-21T12:10:00.000Z", now })).toBe("due_soon");
    expect(getNewReleaseChaseWatchUiState({ enabled: true, nextAttemptAt: "2026-07-21T11:00:00.000Z", now })).toBe("delayed");
    expect(getNewReleaseChaseWatchUiState({ enabled: true, status: "refreshing", now })).toBe("updating");
    expect(getNewReleaseChaseWatchUiState({ enabled: true, paused: true, now })).toBe("paused");
  });

  it("quarantines extreme moves until a matching second observation", () => {
    expect(
      evaluateNewReleaseChasePriceGuard({ currentPrice: 100, observedPrice: 20 })
    ).toEqual({ accept: false, requiresConfirmation: true, confirmationCount: 1 });
    expect(
      evaluateNewReleaseChasePriceGuard({
        currentPrice: 100,
        observedPrice: 20.5,
        pendingPrice: 20,
        pendingConfirmations: 1,
      })
    ).toEqual({ accept: true, requiresConfirmation: false, confirmationCount: 2 });
    expect(
      evaluateNewReleaseChasePriceGuard({ currentPrice: 100, observedPrice: 70 })
    ).toEqual({ accept: true, requiresConfirmation: false, confirmationCount: 0 });
  });

  it("backs failures off without exceeding the active cadence", () => {
    expect(getNewReleaseChaseFailureDelayMs(0, 12 * 60 * 60_000)).toBe(30 * 60_000);
    expect(getNewReleaseChaseFailureDelayMs(2, 12 * 60 * 60_000)).toBe(2 * 60 * 60_000);
    expect(getNewReleaseChaseFailureDelayMs(10, 3 * 60 * 60_000)).toBe(3 * 60 * 60_000);
  });
});
