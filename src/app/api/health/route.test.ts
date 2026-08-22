import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getHealthSnapshot: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/health", () => ({
  getHealthSnapshot: mocks.getHealthSnapshot,
}));

import { GET } from "@/app/api/health/route";

const staleSchedulerSnapshot = {
  ok: false,
  checkedAt: "2026-08-22T00:00:00.000Z",
  db: { ok: true, error: null },
  sqlite: { liveDbPath: "/opt/dustycards/app/dustycards.db", walBytes: 0, shmBytes: 0 },
  scheduler: {
    ok: false,
    status: "waiting",
    heartbeatAt: "2026-08-21T23:00:00.000Z",
    heartbeatAgeSeconds: 3600,
    error: null,
  },
};

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getHealthSnapshot.mockResolvedValue(staleSchedulerSnapshot);
  });

  it("keeps the full health check unhealthy when the scheduler is stale", async () => {
    const response = await GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  it("reports readiness while the database is healthy during a deploy", async () => {
    const response = await GET(new Request("http://localhost/api/health?readiness=1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("never exposes the detailed snapshot through the readiness probe", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" });

    const response = await GET(new Request("http://localhost/api/health?readiness=1"));

    expect(await response.json()).toEqual({ ok: true });
  });
});
