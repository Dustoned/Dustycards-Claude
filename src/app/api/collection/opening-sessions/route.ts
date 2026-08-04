import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<Record<string, unknown>>(request);
    const collectionSealedId = text(body.collectionSealedId);
    const packsOpened = positiveInt(body.packsOpened) ?? 1;
    if (!collectionSealedId) return NextResponse.json({ error: "Choose a sealed collection item" }, { status: 400 });
    const owned = await db.collectionSealed.findFirst({
      where: { id: collectionSealedId, user_id: user.id },
      include: { product: { select: { id: true, name: true } } },
    });
    if (!owned) return NextResponse.json({ error: "Sealed collection item not found" }, { status: 404 });
    const suppliedCost = money(body.openedCostEur);
    if (body.openedCostEur != null && body.openedCostEur !== "" && suppliedCost == null) {
      return NextResponse.json({ error: "Opening cost must be zero or positive" }, { status: 400 });
    }
    const session = await db.$transaction(async (tx) => {
      const created = await tx.sealedOpeningSession.create({
        data: {
          user_id: user.id,
          collection_sealed_id: owned.id,
          sealed_product_id: owned.product_id,
          title: text(body.title),
          packs_opened: packsOpened,
          opened_cost_eur: suppliedCost ?? owned.purchase_price_per_item,
          notes: text(body.notes),
        },
        select: { id: true },
      });

      if (owned.quantity > 1) {
        await tx.collectionSealed.update({
          where: { id: owned.id },
          data: { quantity: { decrement: 1 } },
        });
      } else {
        await tx.collectionSealed.delete({ where: { id: owned.id } });
      }

      return created;
    });
    return NextResponse.json({ ok: true, id: session.id });
  } catch (error) {
    return authErrorResponse(error) ?? malformedJsonBodyResponse(error) ?? NextResponse.json({ error: "Could not create opening session" }, { status: 500 });
  }
}
