import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

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
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const { error } = await searchParams;

  if (user) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--ui-header-height))] max-w-5xl items-center justify-center px-4 py-10">
      <AuthForm mode="register" initialError={error ? REGISTER_ERRORS[error] ?? null : null} />
    </div>
  );
}
