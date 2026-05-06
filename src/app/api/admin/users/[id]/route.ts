import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-crypto";
import { db } from "@/lib/db";

function normalizeRole(value: unknown): "admin" | "user" | null {
  return value === "admin" || value === "user" ? value : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      disabled?: unknown;
      newPassword?: unknown;
      newPasswordConfirm?: unknown;
      role?: unknown;
    };

    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data: {
      disabled?: boolean;
      password_hash?: string;
      role?: "admin" | "user";
    } = {};

    if (body.role !== undefined) {
      const role = normalizeRole(body.role);
      if (!role) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      if (id === currentUser.id && role !== "admin") {
        return NextResponse.json({ error: "You cannot remove your own admin role" }, { status: 400 });
      }
      data.role = role;
    }

    if (body.disabled !== undefined) {
      if (typeof body.disabled !== "boolean") {
        return NextResponse.json({ error: "Invalid disabled state" }, { status: 400 });
      }
      if (id === currentUser.id && body.disabled) {
        return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
      }
      data.disabled = body.disabled;
    }

    if (body.newPassword !== undefined || body.newPasswordConfirm !== undefined) {
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      const newPasswordConfirm =
        typeof body.newPasswordConfirm === "string" ? body.newPasswordConfirm : "";

      if (newPassword.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      if (newPassword !== newPasswordConfirm) {
        return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
      }

      data.password_hash = await hashPassword(newPassword);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        role: true,
        disabled: true,
        updated_at: true,
      },
    });

    if (data.disabled || data.password_hash) {
      await db.session.deleteMany({ where: { user_id: id } });
    }

    return NextResponse.json({
      ok: true,
      user: {
        ...user,
        updated_at: user.updated_at.toISOString(),
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not update user" }, { status: 500 });
  }
}
