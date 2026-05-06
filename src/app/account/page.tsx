import AccountActions from "@/components/AccountActions";
import AdminUsersPanel, { type AdminUserSummary } from "@/components/AdminUsersPanel";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser("/account");
  const managedUsers: AdminUserSummary[] =
    user.role === "admin"
      ? (
          await db.user.findMany({
            orderBy: [{ role: "asc" }, { email: "asc" }],
            select: {
              id: true,
              email: true,
              email_verified_at: true,
              role: true,
              disabled: true,
              created_at: true,
              updated_at: true,
              _count: {
                select: {
                  binders: true,
                  collectionCards: true,
                  sealedItems: true,
                  sessions: true,
                },
              },
            },
          })
        ).map((managedUser) => ({
          id: managedUser.id,
          email: managedUser.email,
          emailVerifiedAt: managedUser.email_verified_at?.toISOString() ?? null,
          role: managedUser.role === "admin" ? "admin" : "user",
          disabled: managedUser.disabled,
          createdAt: managedUser.created_at.toISOString(),
          updatedAt: managedUser.updated_at.toISOString(),
          counts: {
            binders: managedUser._count.binders,
            cards: managedUser._count.collectionCards,
            sealed: managedUser._count.sealedItems,
            sessions: managedUser._count.sessions,
          },
        }))
      : [];

  return (
    <div className="page-container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-500 dark:text-white/45">Account</p>
        <h1 className="mt-1 break-all text-2xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
          {user.email}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/45">
          Role: <span className="font-semibold text-gray-800 dark:text-white/80">{user.role}</span>
        </p>
      </div>

      <div className="grid gap-4">
        <AccountActions />
        {user.role === "admin" && (
          <AdminUsersPanel currentUserId={user.id} users={managedUsers} />
        )}
      </div>
    </div>
  );
}
