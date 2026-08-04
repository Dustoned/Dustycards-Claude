import "server-only";

import { db } from "@/lib/db";

export const ACTIVE_USER_WINDOW_MS = 5 * 60_000;
const ACTIVE_USER_LIMIT = 50;

export interface AdminActiveUser {
  id: string;
  email: string;
  role: "admin" | "user";
  lastSeenAt: string;
  sessionCount: number;
}

export interface AdminActiveUsersSnapshot {
  count: number;
  activeWindowMinutes: number;
  users: AdminActiveUser[];
}

export async function getAdminActiveUsersSnapshot(
  now = new Date()
): Promise<AdminActiveUsersSnapshot> {
  const groups = await db.session.groupBy({
    by: ["user_id"],
    where: {
      expires_at: { gt: now },
      last_seen_at: { gte: new Date(now.getTime() - ACTIVE_USER_WINDOW_MS) },
      user: {
        disabled: false,
        email_verified_at: { not: null },
      },
    },
    _max: { last_seen_at: true },
    _count: { _all: true },
    orderBy: { _max: { last_seen_at: "desc" } },
    take: ACTIVE_USER_LIMIT,
  });

  const users = groups.length
    ? await db.user.findMany({
        where: { id: { in: groups.map((group) => group.user_id) } },
        select: { id: true, email: true, role: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  const activeUsers = groups.flatMap((group) => {
    const user = usersById.get(group.user_id);
    const lastSeenAt = group._max.last_seen_at;
    if (!user || !lastSeenAt) return [];
    return [{
      id: user.id,
      email: user.email,
      role: user.role === "admin" ? "admin" as const : "user" as const,
      lastSeenAt: lastSeenAt.toISOString(),
      sessionCount: group._count._all,
    }];
  });

  return {
    count: activeUsers.length,
    activeWindowMinutes: ACTIVE_USER_WINDOW_MS / 60_000,
    users: activeUsers,
  };
}
