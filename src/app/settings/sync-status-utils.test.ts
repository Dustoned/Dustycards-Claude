import { describe, expect, it } from "vitest";
import {
  getAutoRefreshDisplayMetrics,
  type AutoRefreshProgress,
  type AutoRefreshStatus,
} from "./sync-status-utils";

const emptyProgress: AutoRefreshProgress = {
  batchCards: null,
  batchSets: null,
  dueBacklog: null,
  currentSet: null,
  currentSetIndex: null,
  currentSetTotal: null,
  currentSetCards: null,
};

function makeStatus(
  overrides: Partial<AutoRefreshStatus> = {}
): AutoRefreshStatus {
  return {
    key: "all",
    label: "All",
    active: null,
    lastSuccess: null,
    lastFailure: null,
    dueCards: 0,
    missingPriceCards: 0,
    submittedCardCandidates: 0,
    unavailableCooldownCards: 0,
    nextUnavailableRetryLabel: null,
    nextBatchCards: 0,
    nextBatchEpisodes: 0,
    nextBatchSetLabels: [],
    nextBatchCardLabels: [],
    requestsRemaining: null,
    requestConcurrency: 1,
    quotaPaused: false,
    quotaResetLabel: null,
    scraperDisabled: false,
    ...overrides,
  };
}

describe("getAutoRefreshDisplayMetrics", () => {
  it("keeps the full real queue due when quota is paused and no batch is running", () => {
    const metrics = getAutoRefreshDisplayMetrics(
      makeStatus({
        dueCards: 5_700,
        missingPriceCards: 50,
        submittedCardCandidates: 2,
        nextBatchCards: 5_752,
        nextBatchEpisodes: 84,
        quotaPaused: true,
      }),
      emptyProgress
    );

    expect(metrics).toMatchObject({
      queueCount: 5_752,
      hasRunningBatch: false,
      currentBatchCards: 0,
      currentBatchSets: 0,
      currentBatchHint: "no batch running",
      remainingCards: 5_752,
      remainingHint: "waiting for quota reset",
      previewCards: 5_752,
      previewSets: 84,
      previewHint: "84 sets / planning only",
    });
  });

  it("does not subtract an inactive next-run preview from the queue", () => {
    const metrics = getAutoRefreshDisplayMetrics(
      makeStatus({ dueCards: 300, nextBatchCards: 50, nextBatchEpisodes: 3 }),
      { ...emptyProgress, batchCards: 50, batchSets: 3, dueBacklog: 250 }
    );

    expect(metrics.currentBatchCards).toBe(0);
    expect(metrics.remainingCards).toBe(300);
    expect(metrics.remainingHint).toBe("waiting for next run");
    expect(metrics.previewCards).toBe(50);
  });

  it("uses live progress only while an active batch is running", () => {
    const status = makeStatus({
      dueCards: 300,
      nextBatchCards: 40,
      nextBatchEpisodes: 2,
      active: {
        id: "sync-1",
        type: "auto-prices",
        label: "Background price refresh",
        status: "running",
        message: null,
        started_at: new Date("2026-08-11T08:00:00Z"),
        finished_at: null,
        cancel_requested_at: null,
      },
    });

    const metrics = getAutoRefreshDisplayMetrics(status, {
      ...emptyProgress,
      batchCards: 50,
      batchSets: 3,
      dueBacklog: 250,
    });

    expect(metrics).toMatchObject({
      hasRunningBatch: true,
      currentBatchCards: 50,
      currentBatchSets: 3,
      currentBatchHint: "3 sets",
      remainingCards: 250,
      remainingHint: "after current batch",
      previewCards: 40,
    });
  });
});
