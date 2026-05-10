import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const WANTS_BATCH_LIMIT = 500;

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
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
    const body = (await req.json()) as { cardId?: unknown };
    const cardId = toNullableString(body.cardId);

    if (!cardId) {
      return NextResponse.json({ error: "Card id is required" }, { status: 400 });
    }

    const card = await db.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const owned = await db.collectionCard.findFirst({
      where: { user_id: user.id, card_id: cardId },
      select: { id: true },
    });

    if (owned) {
      return NextResponse.json(
        { error: "This card is already in your collection" },
        { status: 400 }
      );
    }

    const item = await db.collectionWant.upsert({
      where: {
        user_id_card_id: {
          user_id: user.id,
          card_id: cardId,
        },
      },
      update: {},
      create: {
        user_id: user.id,
        card_id: cardId,
      },
      select: {
        id: true,
        created_at: true,
      },
    });

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        created_at: item.created_at.toISOString(),
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to add want" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { itemId?: unknown; itemIds?: unknown; cardId?: unknown; cardIds?: unknown };
    const itemIds = (() => {
      const multiple = toStringArray(body.itemIds);
      if (multiple.length > 0) return multiple;

      const single = toNullableString(body.itemId);
      return single ? [single] : [];
    })();
    const cardIds = (() => {
      const multiple = toStringArray(body.cardIds);
      if (multiple.length > 0) return multiple;

      const single = toNullableString(body.cardId);
      return single ? [single] : [];
    })();

    if (itemIds.length === 0 && cardIds.length === 0) {
      return NextResponse.json({ error: "At least one want or card id is required" }, { status: 400 });
    }

    if (itemIds.length > WANTS_BATCH_LIMIT || cardIds.length > WANTS_BATCH_LIMIT) {
      return NextResponse.json(
        { error: `Too many wants in one request (max ${WANTS_BATCH_LIMIT})` },
        { status: 400 }
      );
    }

    const deleted = await db.collectionWant.deleteMany({
      where: {
        user_id: user.id,
        ...(itemIds.length > 0 ? { id: { in: itemIds } } : {}),
        ...(cardIds.length > 0 ? { card_id: { in: cardIds } } : {}),
      },
    });

    return NextResponse.json({ success: true, count: deleted.count });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to remove wants" }, { status: 500 });
  }
}
