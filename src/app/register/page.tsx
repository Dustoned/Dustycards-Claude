import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--ui-header-height))] max-w-5xl items-center justify-center px-4 py-10">
      <AuthForm mode="register" />
    </div>
  );
}
