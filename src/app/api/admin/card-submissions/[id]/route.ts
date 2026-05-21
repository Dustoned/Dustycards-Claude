import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  CardSubmissionError,
  deleteAdminCardSubmission,
  refreshAdminCardSubmission,
  updateAdminCardSubmission,
} from "@/lib/card-submissions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = (await req.json()) as Record<string, unknown>;
    const result = await updateAdminCardSubmission(id, body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, error: "Could not update submitted card." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "refresh") {
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }
    const result = await refreshAdminCardSubmission(id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, error: "Could not refresh submitted card." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const result = await deleteAdminCardSubmission(id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, error: "Could not delete submitted card." },
      { status: 500 }
    );
  }
}
