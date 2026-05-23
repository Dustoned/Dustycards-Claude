import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ONE_PIECE_GAME } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { WANT_SOURCE_BINDER_MISSING, WANT_SOURCE_MANUAL } from "@/lib/wantlist-planner";

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
      select: { id: true, game: true },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (card.game === ONE_PIECE_GAME) {
      const settings = await getServerUserSettings(user.id);
      if (!settings.onePieceLibraryEnabled) {
        return NextResponse.json({ error: "One Piece library is not enabled" }, { status: 403 });
      }
    }

    const owned = await db.collectionCard.findFirst({
      where: { user_id: user.id, card_id: cardId, for_sale: false },
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
      update: {
        source: WANT_SOURCE_MANUAL,
        source_episode_id: null,
        dismissed_at: null,
      },
      create: {
        user_id: user.id,
        card_id: cardId,
        source: WANT_SOURCE_MANUAL,
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

    const records = await db.collectionWant.findMany({
      where: {
        user_id: user.id,
        dismissed_at: null,
        OR: [
          ...(itemIds.length > 0 ? [{ id: { in: itemIds } }] : []),
          ...(cardIds.length > 0 ? [{ card_id: { in: cardIds } }] : []),
        ],
      },
      select: {
        id: true,
        card_id: true,
        card: {
          select: {
            episode_id: true,
            collectionItems: {
              where: { user_id: user.id, for_sale: false },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    const linkedBinders = await db.collectionBinder.findMany({
      where: {
        user_id: user.id,
        type: "linked_set",
        episode_id: { in: [...new Set(records.map((record) => record.card.episode_id))] },
      },
      select: { episode_id: true },
    });
    const linkedEpisodeIds = new Set(
      linkedBinders
        .map((binder) => binder.episode_id)
        .filter((episodeId): episodeId is string => Boolean(episodeId))
    );
    const hideRecords = records
      .filter((record) => linkedEpisodeIds.has(record.card.episode_id))
      .filter((record) => record.card.collectionItems.length === 0);
    const hideIds = hideRecords.map((record) => record.id);
    const deleteIds = records
      .filter((record) => !hideIds.includes(record.id))
      .map((record) => record.id);

    const result = await db.$transaction(async (tx) => {
      let hiddenCount = 0;
      const now = new Date();
      const hideByEpisodeId = new Map<string, string[]>();

      for (const record of hideRecords) {
        const ids = hideByEpisodeId.get(record.card.episode_id) ?? [];
        ids.push(record.id);
        hideByEpisodeId.set(record.card.episode_id, ids);
      }

      for (const [episodeId, ids] of hideByEpisodeId) {
        const hidden = await tx.collectionWant.updateMany({
          where: { user_id: user.id, id: { in: ids } },
          data: {
            source: WANT_SOURCE_BINDER_MISSING,
            source_episode_id: episodeId,
            dismissed_at: now,
          },
        });
        hiddenCount += hidden.count;
      }

      const deleted =
        deleteIds.length > 0
          ? await tx.collectionWant.deleteMany({
              where: { user_id: user.id, id: { in: deleteIds } },
            })
          : { count: 0 };

      return { hidden: hiddenCount, deleted: deleted.count };
    });

    return NextResponse.json({
      success: true,
      count: result.hidden + result.deleted,
      hidden: result.hidden,
      deleted: result.deleted,
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to remove wants" }, { status: 500 });
  }
}
