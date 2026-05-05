import AccountActions from "@/components/AccountActions";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser("/account");

  return (
    <div className="page-container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-500 dark:text-white/45">Account</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">
          {user.email}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/45">
          Role: <span className="font-semibold text-gray-800 dark:text-white/80">{user.role}</span>
        </p>
      </div>

      <AccountActions />
    </div>
  );
}
