import type { Prisma } from "@/generated/prisma";

export function buildCompletedSyncLogCleanupWhere(
  preservedIds: readonly string[]
): Prisma.SyncLogWhereInput {
  const uniquePreservedIds = [...new Set(preservedIds)];

  return {
    status: { in: ["success", "failed", "cancelled"] },
    finished_at: { not: null },
    ...(uniquePreservedIds.length > 0
      ? { id: { notIn: uniquePreservedIds } }
      : {}),
  };
}
