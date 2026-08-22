import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status === "closed" || body.status === "open" ? body.status : null;
    if (!status) return NextResponse.json({ error: "Valid session status required" }, { status: 400 });
    const updated = await db.sealedOpeningSession.updateMany({
      where: { id, user_id: user.id },
      data: { status },
    });
    if (!updated.count) return NextResponse.json({ error: "Opening session not found" }, { status: 404 });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not update opening session" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await db.$transaction(async (tx) => {
      const session = await tx.sealedOpeningSession.findFirst({
        where: { id, user_id: user.id },
        select: {
          id: true,
          status: true,
          collection_sealed_id: true,
          _count: { select: { cards: true } },
        },
      });
      if (!session) return null;

      if (session.status === "open") {
        const removedPulls = await tx.collectionCard.deleteMany({
          where: { opening_session_id: session.id, user_id: user.id },
        });
        const restored = session.collection_sealed_id
          ? await tx.collectionSealed.updateMany({
              where: { id: session.collection_sealed_id, user_id: user.id },
              data: { quantity: { increment: 1 } },
            })
          : { count: 0 };
        await tx.sealedOpeningSession.delete({ where: { id: session.id } });
        return {
          action: "cancelled" as const,
          pullsRemoved: removedPulls.count,
          inventoryRestored: restored.count > 0,
        };
      }

      // Removing completed history must not erase real collection cards. The
      // relation uses onDelete: SetNull, leaving every pull safely collected.
      await tx.sealedOpeningSession.delete({ where: { id: session.id } });
      return {
        action: "deleted" as const,
        pullsKept: session._count.cards,
      };
    });

    if (!result) {
      return NextResponse.json({ error: "Opening session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "Could not remove opening session" },
      { status: 500 }
    );
  }
}
