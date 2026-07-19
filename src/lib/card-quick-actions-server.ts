import "server-only";

import { db } from "@/lib/db";
import type { CardQuickActionMap } from "@/lib/card-quick-actions";

const CARD_ACTION_BATCH_SIZE = 400;

export async function getCardQuickActionMap(
  userId: string,
  cardIds: readonly string[]
): Promise<CardQuickActionMap> {
  const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];
  const result: CardQuickActionMap = {};

  for (let offset = 0; offset < uniqueCardIds.length; offset += CARD_ACTION_BATCH_SIZE) {
    const batch = uniqueCardIds.slice(offset, offset + CARD_ACTION_BATCH_SIZE);
    const cards = await db.card.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        name: true,
        image_url: true,
        episode: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        collectionItems: {
          where: { user_id: userId, for_sale: false, sold_at: null },
          select: { id: true },
          take: 1,
        },
        wants: {
          where: { user_id: userId, dismissed_at: null },
          select: { id: true, created_at: true },
          take: 1,
        },
      },
    });

    for (const card of cards) {
      const wantItem = card.wants[0] ?? null;
      result[card.id] = {
        card: {
          id: card.id,
          name: card.name,
          image_url: card.image_url,
          episode: card.episode,
        },
        owned: card.collectionItems.length > 0,
        wantItem: wantItem
          ? { id: wantItem.id, created_at: wantItem.created_at.toISOString() }
          : null,
      };
    }
  }

  return result;
}
