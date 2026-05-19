import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const didSend = sent === "1";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--ui-header-height))] max-w-5xl items-center justify-center px-4 py-10">
      <form
        action="/api/auth/forgot-password"
        method="post"
        className="binder-panel mx-auto grid w-full max-w-sm gap-4 rounded-2xl p-5"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Forgot password
          </h1>
          <p className="mt-1 text-sm text-white/45">
            Enter your email and we will send a reset link if the account exists.
          </p>
        </div>

        <label className="grid gap-1.5 text-sm font-medium text-white/75">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white outline-none transition focus:border-white/24"
          />
        </label>

        {didSend && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200">
            If that email is registered, a reset link has been sent.
          </p>
        )}

        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-violet-300/35 bg-violet-500/20 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/28"
        >
          Send reset link
        </button>

        <Link
          href="/login"
          className="text-center text-sm font-semibold text-white/70 hover:underline"
        >
          Back to login
        </Link>
      </form>
    </div>
  );
}
