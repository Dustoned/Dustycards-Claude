import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { getCurrentUser } from "@/lib/auth";
import { getSafeNextPath } from "@/lib/safe-next-path";

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
  const nextPath = getSafeNextPath(next);
  const initialError =
    error === "invalid"
      ? "Invalid email or password"
      : error === "unverified"
        ? "Verify your email before logging in. We sent a new verification link."
        : error === "throttled"
          ? "Too many login attempts. Try again in a few minutes."
        : verify === "invalid"
          ? "Verification link is invalid or expired. Request a new email."
          : verify === "failed"
            ? "Account created, but the verification email could not be sent. Use resend below."
          : null;
  const initialApprovalPending = error === "pending";
  const resetMessage = reset === "1" ? "Password updated. You can log in now." : null;
  const verifyMessage =
    verified === "1"
      ? "Email verified. An admin still needs to approve your account before you can log in."
      : verify === "sent"
        ? "Account created. Verify your email; an admin will then approve your account."
        : null;
  const verificationEmail =
    email && email.includes("@") && !email.includes("\n") ? email : "";

  if (user) {
    redirect(nextPath);
  }

  return (
    <AuthShell>
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
          initialApprovalPending={initialApprovalPending}
          initialVerificationEmail={verificationEmail}
          showVerificationRecovery={verify === "invalid" || verify === "failed" || error === "unverified"}
        />
      </div>
    </AuthShell>
  );
}
