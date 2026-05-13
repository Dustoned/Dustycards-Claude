import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getAppFeatures, setOnePieceLibraryEnabled } from "@/lib/app-settings";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ features: await getAppFeatures() });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not load app settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      onePieceLibraryEnabled?: unknown;
    };

    if (typeof body.onePieceLibraryEnabled !== "boolean") {
      return NextResponse.json({ error: "Invalid One Piece setting" }, { status: 400 });
    }

    const features = await setOnePieceLibraryEnabled(body.onePieceLibraryEnabled);
    return NextResponse.json({ ok: true, features });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not save app settings" }, { status: 500 });
  }
}
