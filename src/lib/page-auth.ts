import { redirect } from "next/navigation";
import { getCurrentUser, type AuthUser } from "@/lib/auth";

function loginRedirect(nextPath: string): never {
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function requirePageUser(nextPath: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    loginRedirect(nextPath);
  }

  return user;
}

export async function requirePageAdmin(nextPath: string): Promise<AuthUser> {
  const user = await requirePageUser(nextPath);
  if (user.role !== "admin") {
    redirect("/account");
  }

  return user;
}
