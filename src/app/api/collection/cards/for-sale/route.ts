import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { ValidationError, validationErrorResponse } from "@/lib/api-validation";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncMissingBinderWantsAfterCollectionChange } from "@/lib/wantlist-planner";

const FOR_SALE_CARD_BATCH_LIMIT = 500;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Marks every saved (not yet sold) copy of the given catalog cards as for
// sale. Used from pages that only know card ids, such as the expansion grid.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      cardIds?: unknown;
      totalPurchasePrice?: unknown;
    }>(req);

    const cardIds = toStringArray(body.cardIds);
    if (cardIds.length === 0) {
      return NextResponse.json({ error: "At least one card id is required" }, { status: 400 });
    }

    if (cardIds.length > FOR_SALE_CARD_BATCH_LIMIT) {
      return NextResponse.json(
        { error: `Too many cards in one request (max ${FOR_SALE_CARD_BATCH_LIMIT})` },
        { status: 400 }
      );
    }

    const items = await db.collectionCard.findMany({
      where: {
        user_id: user.id,
        card_id: { in: cardIds },
        sold_at: null,
        for_sale: false,
      },
      select: { id: true },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "None of the selected cards are in your collection" },
        { status: 404 }
      );
    }

    const totalPurchasePriceInput = toNullableNumber(body.totalPurchasePrice);
    const perItemPurchasePrice =
      totalPurchasePriceInput != null && totalPurchasePriceInput >= 0
        ? Number((totalPurchasePriceInput / items.length).toFixed(2))
        : null;

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.collectionCard.updateMany({
        where: { id: { in: items.map((item) => item.id) }, user_id: user.id, sold_at: null, for_sale: false },
        data: {
          binder_id: null,
          for_sale: true,
          ...(perItemPurchasePrice != null ? { purchase_price: perItemPurchasePrice } : {}),
        },
      });
      if (result.count !== items.length) {
        throw new ValidationError("One or more cards changed. Reload your collection before listing them for sale.", 409);
      }
      return result;
    });

    await syncMissingBinderWantsAfterCollectionChange(user.id);

    return NextResponse.json({ success: true, count: updated.count });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to mark cards for sale" }, { status: 500 })
    );
  }
}
