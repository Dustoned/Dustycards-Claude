import { describe, expect, it } from "vitest";

import { buildCompletedSyncLogCleanupWhere } from "@/lib/sync/sync-log-retention";

describe("completed sync-log retention", () => {
  it("preserves the latest sealed cadence marker while pruning completed logs", () => {
    expect(buildCompletedSyncLogCleanupWhere(["sealed-latest", "sealed-latest"])).toEqual({
      status: { in: ["success", "failed", "cancelled"] },
      finished_at: { not: null },
      id: { notIn: ["sealed-latest"] },
    });
  });

  it("keeps the existing cleanup scope when no cadence marker exists", () => {
    expect(buildCompletedSyncLogCleanupWhere([])).toEqual({
      status: { in: ["success", "failed", "cancelled"] },
      finished_at: { not: null },
    });
  });
});
