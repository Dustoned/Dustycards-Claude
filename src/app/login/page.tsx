import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    error?: string;
    next?: string;
    reset?: string;
    verified?: string;
    verify?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const { email, error, next, reset, verified, verify } = await searchParams;
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const initialError =
    error === "invalid"
      ? "Invalid email or password"
      : error === "unverified"
        ? "Verify your email before logging in. We sent a new verification link."
        : verify === "invalid"
          ? "Verification link is invalid or expired. Request a new email."
          : verify === "failed"
            ? "Account created, but the verification email could not be sent. Use resend below."
          : null;
  const resetMessage = reset === "1" ? "Password updated. You can log in now." : null;
  const verifyMessage =
    verified === "1"
      ? "Email verified. You can log in now."
      : verify === "sent"
        ? "Account created. Check your email to verify your account."
        : null;
  const verificationEmail =
    email && email.includes("@") && !email.includes("\n") ? email : "";

  if (user) {
    redirect(nextPath);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--ui-header-height))] max-w-5xl items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-sm gap-3">
        {(resetMessage || verifyMessage) && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200">
            {resetMessage ?? verifyMessage}
          </p>
        )}
        <AuthForm
          mode="login"
          nextPath={nextPath}
          initialError={initialError}
          initialVerificationEmail={verificationEmail}
        />
      </div>
    </div>
  );
}
