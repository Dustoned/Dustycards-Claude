import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const SOLD_BATCH_LIMIT = 500;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const items: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
  }

  return items;
}

function toMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function centsToMoney(value: number): number {
  return Number((value / 100).toFixed(2));
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      itemIds?: unknown;
      prices?: unknown;
      totalPrice?: unknown;
    }>(req);

    const itemIds = toStringArray(body.itemIds);
    if (itemIds.length === 0) {
      return NextResponse.json(
        { error: "At least one For Sale item is required" },
        { status: 400 }
      );
    }

    if (itemIds.length > SOLD_BATCH_LIMIT) {
      return NextResponse.json(
        { error: `Too many cards in one request (max ${SOLD_BATCH_LIMIT})` },
        { status: 400 }
      );
    }

    const items = await db.collectionCard.findMany({
      where: {
        id: { in: itemIds },
        user_id: user.id,
        for_sale: true,
        sold_at: null,
      },
      select: { id: true },
    });
    const foundIds = new Set(items.map((item) => item.id));

    if (items.length !== itemIds.length || itemIds.some((itemId) => !foundIds.has(itemId))) {
      return NextResponse.json(
        { error: "One or more selected cards are not active For Sale cards" },
        { status: 404 }
      );
    }

    const priceByItemId = new Map<string, number>();
    if (body.prices && typeof body.prices === "object" && !Array.isArray(body.prices)) {
      const prices = body.prices as Record<string, unknown>;
      for (const itemId of itemIds) {
        const price = toMoney(prices[itemId]);
        if (price == null || price < 0) {
          return NextResponse.json(
            { error: "Every selected card needs a valid sold price" },
            { status: 400 }
          );
        }
        priceByItemId.set(itemId, centsToMoney(toCents(price)));
      }
    } else {
      const totalPrice = toMoney(body.totalPrice);
      if (totalPrice == null || totalPrice < 0) {
        return NextResponse.json(
          { error: "A valid stack sold price is required" },
          { status: 400 }
        );
      }

      const totalCents = toCents(totalPrice);
      const baseCents = Math.floor(totalCents / itemIds.length);
      const remainder = totalCents - baseCents * itemIds.length;

      itemIds.forEach((itemId, index) => {
        priceByItemId.set(itemId, centsToMoney(baseCents + (index < remainder ? 1 : 0)));
      });
    }

    const soldAt = new Date();
    await db.$transaction(
      itemIds.map((itemId) =>
        db.collectionCard.update({
          where: { id: itemId },
          data: {
            sale_price: priceByItemId.get(itemId) ?? 0,
            sold_at: soldAt,
            for_sale: true,
            binder_id: null,
          },
        })
      )
    );

    const soldTotal = centsToMoney(
      [...priceByItemId.values()].reduce((total, price) => total + toCents(price), 0)
    );

    return NextResponse.json({
      success: true,
      count: itemIds.length,
      soldTotal,
      soldAt: soldAt.toISOString(),
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to mark cards sold" }, { status: 500 })
    );
  }
}
