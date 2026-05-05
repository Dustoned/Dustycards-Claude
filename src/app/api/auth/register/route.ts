import { NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  setSessionCookie,
} from "@/lib/auth";
import { hashPassword, isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const user = await db.user.create({
    data: {
      email,
      password_hash: await hashPassword(password),
      role: "user",
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });
  const session = await createUserSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  return NextResponse.json({ ok: true, user });
}
