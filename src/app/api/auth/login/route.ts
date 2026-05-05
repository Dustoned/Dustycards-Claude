import { NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  setSessionCookie,
} from "@/lib/auth";
import { normalizeEmail, verifyPassword } from "@/lib/auth-crypto";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = email
    ? await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password_hash: true,
          role: true,
          disabled: true,
        },
      })
    : null;

  if (!user || user.disabled || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = await createUserSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
}
