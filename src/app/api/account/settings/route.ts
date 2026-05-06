import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  mergeSettings,
  parseStoredSettings,
  serializeSettings,
} from "@/lib/user-settings";

export async function GET() {
  try {
    const user = await requireUser();
    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { settings_json: true },
    });

    return NextResponse.json({
      settings: mergeSettings(parseStoredSettings(record?.settings_json)),
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not load settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { settings?: unknown };
    const settings = mergeSettings(
      body.settings && typeof body.settings === "object" ? body.settings : null
    );

    await db.user.update({
      where: { id: user.id },
      data: { settings_json: serializeSettings(settings) },
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }
}
