import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: { groupBy: mocks.groupBy },
    user: { findMany: mocks.findMany },
  },
}));

import { getAdminActiveUsersSnapshot } from "@/lib/admin-active-users";

describe("admin active users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unique recently active accounts with their latest session", async () => {
    const now = new Date("2026-08-04T20:00:00.000Z");
    mocks.groupBy.mockResolvedValue([
      {
        user_id: "admin-1",
        _max: { last_seen_at: new Date("2026-08-04T19:59:45.000Z") },
        _count: { _all: 2 },
      },
      {
        user_id: "user-2",
        _max: { last_seen_at: new Date("2026-08-04T19:57:00.000Z") },
        _count: { _all: 1 },
      },
    ]);
    mocks.findMany.mockResolvedValue([
      { id: "admin-1", email: "admin@example.com", role: "admin" },
      { id: "user-2", email: "collector@example.com", role: "user" },
    ]);

    const result = await getAdminActiveUsersSnapshot(now);

    expect(result).toEqual({
      count: 2,
      activeWindowMinutes: 5,
      users: [
        {
          id: "admin-1",
          email: "admin@example.com",
          role: "admin",
          lastSeenAt: "2026-08-04T19:59:45.000Z",
          sessionCount: 2,
        },
        {
          id: "user-2",
          email: "collector@example.com",
          role: "user",
          lastSeenAt: "2026-08-04T19:57:00.000Z",
          sessionCount: 1,
        },
      ],
    });
    expect(mocks.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        last_seen_at: { gte: new Date("2026-08-04T19:55:00.000Z") },
      }),
    }));
  });
});
