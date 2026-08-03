import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, refreshMock } = vi.hoisted(() => ({
  dbMock: {
    syncJob: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    cardSubmission: {
      update: vi.fn(),
    },
  },
  refreshMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/card-submissions", () => ({
  refreshAdminCardSubmission: refreshMock,
}));

import {
  getSubmittedCardRefreshJobSnapshot,
  startSubmittedCardRefreshJob,
} from "@/lib/sync/submitted-card-refresh-job";

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    type: "submitted-card-refresh:card-1",
    status: "queued",
    details_json: JSON.stringify({
      version: 1,
      kind: "submitted-card-refresh",
      cardId: "card-1",
      submissionId: "submission-1",
      error: null,
    }),
    started_at: new Date("2026-08-03T18:55:00.000Z"),
    finished_at: null,
    heartbeat_at: new Date("2026-08-03T18:55:00.000Z"),
    created_at: new Date("2026-08-03T18:55:00.000Z"),
    updated_at: new Date("2026-08-03T18:55:00.000Z"),
    ...overrides,
  };
}

describe("submitted-card refresh background job", () => {
  beforeEach(() => {
    dbMock.syncJob.findUnique.mockReset();
    dbMock.syncJob.upsert.mockReset();
    dbMock.syncJob.update.mockReset().mockResolvedValue(makeJob());
    dbMock.cardSubmission.update.mockReset().mockResolvedValue({});
    refreshMock.mockReset();
  });

  it("returns immediately and completes a submitted-card refresh in the background", async () => {
    dbMock.syncJob.upsert.mockResolvedValue(makeJob());
    refreshMock.mockResolvedValue({});

    const snapshot = await startSubmittedCardRefreshJob("card-1", "submission-1");

    expect(snapshot).toEqual(expect.objectContaining({ status: "queued", running: true }));
    expect(dbMock.syncJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "submitted-card-refresh:card-1" },
      })
    );
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalledWith("submission-1");
      expect(dbMock.syncJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "success" }) })
      );
    });
  });

  it("persists the provider error for polling instead of dropping the HTTP response", async () => {
    dbMock.syncJob.upsert.mockResolvedValue(
      makeJob({ id: "job-2", type: "submitted-card-refresh:card-2" })
    );
    refreshMock.mockRejectedValue(new Error("Scrape.do scrape failed with status 502."));

    await startSubmittedCardRefreshJob("card-2", "submission-2");

    await vi.waitFor(() => {
      expect(dbMock.syncJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            details_json: expect.stringContaining("Scrape.do scrape failed with status 502."),
          }),
        })
      );
      expect(dbMock.cardSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "submission-2" },
          data: expect.objectContaining({
            warnings_json: expect.stringContaining("Manual refresh failed"),
          }),
        })
      );
    });
  });

  it("resumes a durable in-flight job when polling after a process restart", async () => {
    const persisted = makeJob({
      id: "job-3",
      type: "submitted-card-refresh:card-3",
      status: "running",
      details_json: JSON.stringify({
        version: 1,
        kind: "submitted-card-refresh",
        cardId: "card-3",
        submissionId: "submission-3",
        error: null,
      }),
    });
    dbMock.syncJob.findUnique.mockResolvedValue(persisted);
    refreshMock.mockResolvedValue({});

    const snapshot = await getSubmittedCardRefreshJobSnapshot("card-3");

    expect(snapshot).toEqual(expect.objectContaining({ status: "running", running: true }));
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalledWith("submission-3");
    });
  });
});
