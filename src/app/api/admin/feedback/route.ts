import { NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isFeedbackStatus } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const items = await db.feedback.findMany({
      orderBy: [{ created_at: "desc" }],
      take: 250,
      select: {
        id: true,
        category: true,
        message: true,
        page_url: true,
        status: true,
        created_at: true,
        updated_at: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      result: items.map((item) => ({
        id: item.id,
        category: item.category,
        message: item.message,
        pageUrl: item.page_url,
        status: item.status,
        createdAt: item.created_at.toISOString(),
        updatedAt: item.updated_at.toISOString(),
        userEmail: item.user.email,
      })),
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { ok: false, error: "Could not load feedback." },
        { status: 500 }
      )
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJsonBody<Record<string, unknown>>(request);
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id || !isFeedbackStatus(body.status)) {
      return NextResponse.json(
        { ok: false, error: "A valid feedback item and status are required." },
        { status: 400 }
      );
    }

    const result = await db.feedback.update({
      where: { id },
      data: { status: body.status },
      select: {
        id: true,
        status: true,
        updated_at: true,
      },
    });

    return NextResponse.json({
      ok: true,
      result: {
        id: result.id,
        status: result.status,
        updatedAt: result.updated_at.toISOString(),
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const malformedResponse = malformedJsonBodyResponse(error);
    if (malformedResponse) return malformedResponse;
    return NextResponse.json(
      { ok: false, error: "Could not update feedback." },
      { status: 500 }
    );
  }
}
