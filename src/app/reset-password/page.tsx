import Link from "next/link";

export const dynamic = "force-dynamic";

const RESET_ERRORS: Record<string, string> = {
  invalid: "This reset link is invalid or expired. Request a new link.",
  mismatch: "Passwords do not match",
  short: "Password must be at least 8 characters",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const { error, token } = await searchParams;
  const message = error ? RESET_ERRORS[error] ?? null : null;
  const hasToken = Boolean(token);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--ui-header-height))] max-w-5xl items-center justify-center px-4 py-10">
      <form
        action="/api/auth/reset-password"
        method="post"
        className="glass mx-auto grid w-full max-w-sm gap-4 rounded-2xl p-6 shadow-md shadow-black/5"
      >
        <input type="hidden" name="token" value={token ?? ""} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
            Reset password
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/45">
            Choose a new password for your DustyCards account.
          </p>
        </div>

        {!hasToken && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200">
            This reset link is missing a token. Request a new link.
          </p>
        )}

        {message && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200">
            {message}
          </p>
        )}

        <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-white/75">
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={!hasToken}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-gray-950 outline-none transition focus:border-gray-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:text-white"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-white/75">
          Confirm new password
          <input
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={!hasToken}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-gray-950 outline-none transition focus:border-gray-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:text-white"
          />
        </label>

        <button
          type="submit"
          disabled={!hasToken}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-white/90"
        >
          Save new password
        </button>

        <Link
          href="/forgot-password"
          className="text-center text-sm font-semibold text-gray-700 hover:underline dark:text-white/70"
        >
          Request a new link
        </Link>
      </form>
    </div>
  );
}
