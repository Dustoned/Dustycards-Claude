import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { parseCollectionTags } from "@/lib/collection";
import { db } from "@/lib/db";

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPositiveInteger(value: unknown): number | null {
  const numeric = toNullableNumber(value);
  if (numeric == null) return null;
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJsonBody<{
      quantity?: unknown;
      purchasePricePerItem?: unknown;
      notes?: unknown;
      tags?: unknown;
    }>(req);

    const quantity = toPositiveInteger(body.quantity);
    if (quantity == null) {
      return NextResponse.json({ error: "Quantity must be at least 1" }, { status: 400 });
    }

    const purchasePricePerItem = toNullableNumber(body.purchasePricePerItem);
    if (purchasePricePerItem != null && purchasePricePerItem < 0) {
      return NextResponse.json(
        { error: "Purchase price per item cannot be negative" },
        { status: 400 }
      );
    }

    const collectionItem = await db.collectionSealed.findFirst({
      where: { id, user_id: user.id },
      select: { id: true },
    });
    if (!collectionItem) {
      return NextResponse.json({ error: "Collection item not found" }, { status: 404 });
    }

    const tagsInput =
      Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === "string")
        ? body.tags.join(",")
        : typeof body.tags === "string"
          ? body.tags
          : "";
    const tags = parseCollectionTags(tagsInput);

    await db.$transaction(async (tx) => {
      await tx.collectionSealed.update({
        where: { id },
        data: {
          quantity,
          purchase_price_per_item: purchasePricePerItem,
          notes: toNullableString(body.notes),
        },
      });
      await tx.collectionSealedTag.deleteMany({
        where: { collection_sealed_id: id },
      });
      if (tags.length > 0) {
        await tx.collectionSealedTag.createMany({
          data: tags.map((label) => ({
            collection_sealed_id: id,
            label,
          })),
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to update sealed collection item" }, { status: 500 })
    );
  }
}
