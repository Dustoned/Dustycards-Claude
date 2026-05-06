import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth-crypto";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      newPasswordConfirm?: unknown;
    };
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const newPasswordConfirm =
      typeof body.newPasswordConfirm === "string" ? body.newPasswordConfirm : "";

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    if (newPassword !== newPasswordConfirm) {
      return NextResponse.json({ error: "New passwords do not match" }, { status: 400 });
    }

    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true },
    });

    if (!record || !(await verifyPassword(currentPassword, record.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { password_hash: await hashPassword(newPassword) },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Password change failed" }, { status: 500 });
  }
}
