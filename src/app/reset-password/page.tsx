import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { getSafeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

const RESET_ERRORS: Record<string, string> = {
  invalid: "This reset link is invalid or expired. Request a new link.",
  mismatch: "Passwords do not match",
  short: "Password must be at least 8 characters",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; token?: string }>;
}) {
  const { error, next, token } = await searchParams;
  const message = error ? RESET_ERRORS[error] ?? null : null;
  const hasToken = Boolean(token);
  const nextPath = getSafeNextPath(next);

  return (
    <AuthShell>
      <div className="binder-panel mx-auto grid w-full max-w-sm gap-4 rounded-2xl p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Reset password
          </h1>
          <p className="mt-1 text-sm text-white/45">
            Choose a new password for your DustyCards account.
          </p>
        </div>

        {!hasToken ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200">
            This reset link is missing a token. Request a new link.
          </p>
        ) : (
          <form action="/api/auth/reset-password" method="post" className="grid gap-4">
            <input type="hidden" name="token" value={token ?? ""} />
            <input type="hidden" name="next" value={nextPath} />
            {message && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200">
                {message}
              </p>
            )}
            <label className="grid gap-1.5 text-sm font-medium text-white/75">
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="min-h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-white outline-none transition focus:border-white/24"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-white/75">
              Confirm new password
              <input
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="min-h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-white outline-none transition focus:border-white/24"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-300/35 bg-violet-500/20 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/28"
            >
              Save new password
            </button>
          </form>
        )}

        <Link
          href={`/forgot-password?next=${encodeURIComponent(nextPath)}`}
          className="text-center text-sm font-semibold text-white/70 hover:underline"
        >
          Request a new link
        </Link>
      </div>
    </AuthShell>
  );
}
