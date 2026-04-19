import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    productId?: unknown;
    quantity?: unknown;
    purchasePricePerItem?: unknown;
    notes?: unknown;
    tags?: unknown;
  };

  const productId = toNullableString(body.productId);
  if (!productId) {
    return NextResponse.json({ error: "Product id is required" }, { status: 400 });
  }

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

  const product = await db.sealedProduct.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Sealed product not found" }, { status: 404 });
  }

  const tagsInput =
    Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === "string")
      ? body.tags.join(",")
      : typeof body.tags === "string"
        ? body.tags
        : "";
  const tags = parseCollectionTags(tagsInput);

  const created = await db.collectionSealed.create({
    data: {
      product_id: product.id,
      quantity,
      purchase_price_per_item: purchasePricePerItem,
      notes: toNullableString(body.notes),
      tags: tags.length > 0 ? { create: tags.map((label) => ({ label })) } : undefined,
    },
    select: {
      id: true,
      added_at: true,
    },
  });

  return NextResponse.json({
    success: true,
    item: {
      id: created.id,
      added_at: created.added_at.toISOString(),
    },
  });
}
