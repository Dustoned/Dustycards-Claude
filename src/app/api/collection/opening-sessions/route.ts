import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isOpenableSealedProduct } from "@/lib/opening-sealed";

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
    const sealedProductId = text(body.sealedProductId);
    const packsOpened = positiveInt(body.packsOpened) ?? 1;
    if ((!collectionSealedId && !sealedProductId) || (collectionSealedId && sealedProductId)) {
      return NextResponse.json({ error: "Choose exactly one sealed product" }, { status: 400 });
    }
    const owned = collectionSealedId
      ? await db.collectionSealed.findFirst({
          where: { id: collectionSealedId, user_id: user.id },
          include: { product: { select: { id: true, name: true } } },
        })
      : null;
    if (collectionSealedId && !owned) {
      return NextResponse.json({ error: "Sealed collection item not found" }, { status: 404 });
    }
    if (owned && !isOpenableSealedProduct(owned.product.name)) {
      return NextResponse.json({ error: "This collection item is not an openable sealed product" }, { status: 400 });
    }
    const catalogProduct = sealedProductId
      ? await db.sealedProduct.findFirst({
          where: { id: sealedProductId },
          select: { id: true, name: true },
        })
      : null;
    if (sealedProductId && (!catalogProduct || !isOpenableSealedProduct(catalogProduct.name))) {
      return NextResponse.json({ error: "Openable sealed product not found" }, { status: 404 });
    }
    const suppliedCost = money(body.openedCostEur);
    if (body.openedCostEur != null && body.openedCostEur !== "" && suppliedCost == null) {
      return NextResponse.json({ error: "Opening cost must be zero or positive" }, { status: 400 });
    }
    const session = await db.$transaction(async (tx) => {
      const created = await tx.sealedOpeningSession.create({
        data: {
          user_id: user.id,
          collection_sealed_id: owned?.id ?? null,
          sealed_product_id: owned?.product_id ?? catalogProduct!.id,
          title: text(body.title),
          packs_opened: packsOpened,
          opened_cost_eur: suppliedCost ?? owned?.purchase_price_per_item ?? null,
          notes: text(body.notes),
        },
        select: { id: true },
      });

      if (owned) {
        if (owned.quantity > 1) {
          await tx.collectionSealed.update({
            where: { id: owned.id },
            data: { quantity: { decrement: 1 } },
          });
        } else {
          await tx.collectionSealed.delete({ where: { id: owned.id } });
        }
      }

      return created;
    });
    return NextResponse.json({ ok: true, id: session.id });
  } catch (error) {
    return authErrorResponse(error) ?? malformedJsonBodyResponse(error) ?? NextResponse.json({ error: "Could not create opening session" }, { status: 500 });
  }
}
