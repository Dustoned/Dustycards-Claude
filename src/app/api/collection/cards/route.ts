import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { parseCollectionTags } from "@/lib/collection";
import { db } from "@/lib/db";
import { syncMissingBinderWantsAfterCollectionChange } from "@/lib/wantlist-planner";
import { ONE_PIECE_GAME } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

const COLLECTION_BATCH_LIMIT = 500;

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
    const body = (await req.json()) as {
    cardId?: unknown;
    cardIds?: unknown;
    binderId?: unknown;
    purchasePrice?: unknown;
    condition?: unknown;
    language?: unknown;
    notes?: unknown;
    tags?: unknown;
    gradingCompany?: unknown;
    gradingGrade?: unknown;
    };

  const cardIds = (() => {
    const multiple = toStringArray(body.cardIds);
    if (multiple.length > 0) return multiple;

    const single = toNullableString(body.cardId);
    return single ? [single] : [];
  })();

  if (cardIds.length === 0) {
    return NextResponse.json({ error: "At least one card id is required" }, { status: 400 });
  }

  if (cardIds.length > COLLECTION_BATCH_LIMIT) {
    return NextResponse.json(
      { error: `Too many cards in one request (max ${COLLECTION_BATCH_LIMIT})` },
      { status: 400 }
    );
  }

  const purchasePrice = toNullableNumber(body.purchasePrice);
  if (purchasePrice != null && purchasePrice < 0) {
    return NextResponse.json({ error: "Purchase price cannot be negative" }, { status: 400 });
  }

  const cards = await db.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, episode_id: true, game: true },
  });

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const orderedCards = cardIds
    .map((cardId) => cardsById.get(cardId) ?? null)
    .filter((card): card is { id: string; episode_id: string; game: string } => Boolean(card));

  if (orderedCards.length !== cardIds.length) {
    return NextResponse.json({ error: "One or more cards were not found" }, { status: 404 });
  }

  if (orderedCards.some((card) => card.game === ONE_PIECE_GAME)) {
    const settings = await getServerUserSettings(user.id);
    if (!settings.onePieceLibraryEnabled) {
      return NextResponse.json({ error: "One Piece library is not enabled" }, { status: 403 });
    }
  }

  const binderId = toNullableString(body.binderId);
  let binder:
    | {
        id: string;
        type: string;
        episode_id: string | null;
      }
    | null = null;

  if (binderId) {
    binder = await db.collectionBinder.findFirst({
      where: { id: binderId, user_id: user.id },
      select: { id: true, type: true, episode_id: true },
    });

    if (!binder) {
      return NextResponse.json({ error: "Binder not found" }, { status: 404 });
    }

    if (
      binder.type === "linked_set" &&
      binder.episode_id &&
      orderedCards.some((card) => card.episode_id !== binder?.episode_id)
    ) {
      return NextResponse.json(
        { error: "Linked binders can only contain cards from their own set" },
        { status: 400 }
      );
    }
  }

  const tagsInput =
    Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === "string")
      ? body.tags.join(",")
      : typeof body.tags === "string"
        ? body.tags
        : "";
  const tags = parseCollectionTags(tagsInput);

  const condition = toNullableString(body.condition);
  const language = toNullableString(body.language);
  const notes = toNullableString(body.notes);
  const gradingCompany = toNullableString(body.gradingCompany);
  const gradingGrade = toNullableString(body.gradingGrade);

  const created = await db.$transaction(async (tx) => {
    const items = await Promise.all(
      orderedCards.map((card) =>
        tx.collectionCard.create({
          data: {
            card_id: card.id,
            user_id: user.id,
            binder_id: binderId,
            purchase_price: purchasePrice,
            condition,
            language,
            notes,
            grading_company: gradingCompany,
            grading_grade: gradingGrade,
            tags: tags.length > 0 ? { create: tags.map((label) => ({ label })) } : undefined,
          },
          select: {
            id: true,
            added_at: true,
          },
        })
      )
    );

    await tx.collectionWant.deleteMany({
      where: {
        user_id: user.id,
        card_id: { in: orderedCards.map((card) => card.id) },
      },
    });

    return items;
  });

  await syncMissingBinderWantsAfterCollectionChange(user.id);

  return NextResponse.json({
    success: true,
    count: created.length,
    item: created[0]
      ? {
          id: created[0].id,
          added_at: created[0].added_at.toISOString(),
        }
      : null,
    items: created.map((item) => ({
      id: item.id,
      added_at: item.added_at.toISOString(),
    })),
  });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to add cards" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
    itemId?: unknown;
    itemIds?: unknown;
    binderId?: unknown;
    };

  const itemIds = (() => {
    const multiple = toStringArray(body.itemIds);
    if (multiple.length > 0) return multiple;

    const single = toNullableString(body.itemId);
    return single ? [single] : [];
  })();

  if (itemIds.length === 0) {
    return NextResponse.json({ error: "At least one collection item id is required" }, { status: 400 });
  }

  if (itemIds.length > COLLECTION_BATCH_LIMIT) {
    return NextResponse.json(
      { error: `Too many items in one request (max ${COLLECTION_BATCH_LIMIT})` },
      { status: 400 }
    );
  }

  const binderId = toNullableString(body.binderId);
  let binder:
    | {
        id: string;
        type: string;
        episode_id: string | null;
      }
    | null = null;

  const collectionItems = await db.collectionCard.findMany({
    where: { id: { in: itemIds }, user_id: user.id },
    select: {
      id: true,
      card: {
        select: {
          episode_id: true,
        },
      },
    },
  });

  if (collectionItems.length !== itemIds.length) {
    return NextResponse.json({ error: "One or more collection items were not found" }, { status: 404 });
  }

  if (binderId) {
    binder = await db.collectionBinder.findFirst({
      where: { id: binderId, user_id: user.id },
      select: { id: true, type: true, episode_id: true },
    });

    if (!binder) {
      return NextResponse.json({ error: "Binder not found" }, { status: 404 });
    }

    if (
      binder.type === "linked_set" &&
      binder.episode_id &&
      collectionItems.some((item) => item.card.episode_id !== binder?.episode_id)
    ) {
      return NextResponse.json(
        { error: "Linked binders can only contain cards from their own set" },
        { status: 400 }
      );
    }
  }

  const updated = await db.collectionCard.updateMany({
    where: { id: { in: itemIds }, user_id: user.id },
    data: { binder_id: binderId },
  });

  await syncMissingBinderWantsAfterCollectionChange(user.id);

  return NextResponse.json({
    success: true,
    count: updated.count,
  });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to update cards" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
    itemId?: unknown;
    itemIds?: unknown;
    };

  const itemIds = (() => {
    const multiple = toStringArray(body.itemIds);
    if (multiple.length > 0) return multiple;

    const single = toNullableString(body.itemId);
    return single ? [single] : [];
  })();

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "At least one collection item id is required" },
      { status: 400 }
    );
  }

  if (itemIds.length > COLLECTION_BATCH_LIMIT) {
    return NextResponse.json(
      { error: `Too many items in one request (max ${COLLECTION_BATCH_LIMIT})` },
      { status: 400 }
    );
  }

  const existingCount = await db.collectionCard.count({
    where: { id: { in: itemIds }, user_id: user.id },
  });

  if (existingCount !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more collection items were not found" },
      { status: 404 }
    );
  }

  const deleted = await db.collectionCard.deleteMany({
    where: { id: { in: itemIds }, user_id: user.id },
  });

  await syncMissingBinderWantsAfterCollectionChange(user.id);

  return NextResponse.json({
    success: true,
    count: deleted.count,
  });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to remove cards" }, { status: 500 });
  }
}
