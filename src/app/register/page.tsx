import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { getCurrentUser } from "@/lib/auth";
import { getSafeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

const REGISTER_ERRORS: Record<string, string> = {
  email: "Enter a valid email address",
  exists: "An account with this email already exists",
  mismatch: "Passwords do not match",
  short: "Password must be at least 8 characters",
  throttled: "Too many registration attempts. Try again later.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  const { error, next } = await searchParams;
  const nextPath = getSafeNextPath(next);

  if (user) {
    redirect(nextPath);
  }

  return (
    <AuthShell>
      <AuthForm
        mode="register"
        nextPath={nextPath}
        initialError={error ? REGISTER_ERRORS[error] ?? null : null}
      />
    </AuthShell>
  );
}
