import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, loadMock, warmerMock } = vi.hoisted(() => ({
  authMock: { isAuthorizedSchedulerRequest: vi.fn() },
  loadMock: { getBackgroundLoadSnapshot: vi.fn() },
  warmerMock: { warmCollectionOverviewCaches: vi.fn() },
}));

vi.mock("@/lib/scheduler-secret", () => authMock);
vi.mock("@/lib/background-load-guard", () => loadMock);
vi.mock("@/lib/collection-overview-warmer", () => warmerMock);

import { POST } from "@/app/api/internal/warm-collection-overviews/route";

function request(query = "") {
  return new NextRequest(
    `http://localhost/api/internal/warm-collection-overviews${query}`,
    { method: "POST" }
  );
}

describe("Collection overview warm-up endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.isAuthorizedSchedulerRequest.mockReturnValue(true);
    loadMock.getBackgroundLoadSnapshot.mockResolvedValue({
      activeUsers: 0,
      loadPerCpu: 0.1,
      deferred: false,
    });
    warmerMock.warmCollectionOverviewCaches.mockResolvedValue({
      users: 2,
      views: 3,
      errors: 0,
    });
  });

  it("warms Home data while the server is quiet", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deferred: false,
      users: 2,
      views: 3,
    });
    expect(warmerMock.warmCollectionOverviewCaches).toHaveBeenCalledOnce();
  });

  it("defers periodic warming while a collector is active", async () => {
    loadMock.getBackgroundLoadSnapshot.mockResolvedValue({
      activeUsers: 1,
      loadPerCpu: 0.1,
      deferred: true,
    });

    const response = await POST(request());

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deferred: true,
      reason: "active-users",
    });
    expect(warmerMock.warmCollectionOverviewCaches).not.toHaveBeenCalled();
  });

  it("allows a protected deploy warm-up to bypass the activity guard", async () => {
    loadMock.getBackgroundLoadSnapshot.mockResolvedValue({
      activeUsers: 1,
      loadPerCpu: 0.1,
      deferred: true,
    });

    const response = await POST(request("?force=1"));

    expect(response.status).toBe(200);
    expect(warmerMock.warmCollectionOverviewCaches).toHaveBeenCalledOnce();
  });

  it("hides the endpoint without the scheduler secret", async () => {
    authMock.isAuthorizedSchedulerRequest.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(warmerMock.warmCollectionOverviewCaches).not.toHaveBeenCalled();
  });
});
