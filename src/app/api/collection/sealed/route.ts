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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const items: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const normalized = toNullableString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
  }

  return items;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
    productId?: unknown;
    quantity?: unknown;
    purchasePricePerItem?: unknown;
    notes?: unknown;
    tags?: unknown;
    }>(req);

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
      user_id: user.id,
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
  } catch (error) {
    return (
      authErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to add sealed" }, { status: 500 })
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
    itemId?: unknown;
    itemIds?: unknown;
    }>(req);

  const itemIds = (() => {
    const multiple = toStringArray(body.itemIds);
    if (multiple.length > 0) return multiple;

    const single = toNullableString(body.itemId);
    return single ? [single] : [];
  })();

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "At least one sealed collection item id is required" },
      { status: 400 }
    );
  }

  const existingCount = await db.collectionSealed.count({
    where: { id: { in: itemIds }, user_id: user.id },
  });

  if (existingCount !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more sealed collection items were not found" },
      { status: 404 }
    );
  }

  const deleted = await db.collectionSealed.deleteMany({
    where: { id: { in: itemIds }, user_id: user.id },
  });

  return NextResponse.json({
    success: true,
    count: deleted.count,
  });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to remove sealed" }, { status: 500 })
    );
  }
}
