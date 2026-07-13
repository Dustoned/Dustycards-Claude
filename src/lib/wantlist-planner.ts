import { db } from "@/lib/db";
import { ONE_PIECE_GAME, POKEMON_GAME, type TradingCardGameFilter } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const WANT_SOURCE_MANUAL = "manual";
export const WANT_SOURCE_BINDER_MISSING = "binder_missing";

type ExistingPlannerWant = {
  id: string;
  cardId: string;
  source: string;
  sourceEpisodeId: string | null;
  dismissedAt: Date | string | null;
};

type PlannerSetCard = {
  id: string;
  episodeId: string;
};

export type MissingBinderWantSyncPlan = {
  create: Array<{ cardId: string; episodeId: string }>;
  updateEpisode: Array<{ id: string; episodeId: string }>;
  deleteStaleIds: string[];
  hiddenKept: number;
};

export type MissingBinderWantSyncResult = MissingBinderWantSyncPlan & {
  linkedBinders: number;
  linkedEpisodes: number;
  missingCards: number;
};

function toScopedGames(options?: {
  game?: TradingCardGameFilter;
  includeOnePiece?: boolean;
}) {
  if (options?.game === POKEMON_GAME || options?.game === ONE_PIECE_GAME) {
    return [options.game];
  }

  return options?.includeOnePiece === false
    ? [POKEMON_GAME]
    : [POKEMON_GAME, ONE_PIECE_GAME];
}

export function buildMissingBinderWantSyncPlan(input: {
  linkedEpisodeIds: string[];
  setCards: PlannerSetCard[];
  ownedCardIds: string[];
  existingWants: ExistingPlannerWant[];
}): MissingBinderWantSyncPlan {
  const linkedEpisodeIds = new Set(input.linkedEpisodeIds);
  const ownedCardIds = new Set(input.ownedCardIds);
  const setCardsById = new Map(input.setCards.map((card) => [card.id, card]));
  const existingByCardId = new Map(input.existingWants.map((want) => [want.cardId, want]));
  const deleteStaleIds: string[] = [];
  const updateEpisode: Array<{ id: string; episodeId: string }> = [];
  let hiddenKept = 0;

  for (const want of input.existingWants) {
    if (want.source !== WANT_SOURCE_BINDER_MISSING) continue;

    const setCard = setCardsById.get(want.cardId);
    const episodeId = want.sourceEpisodeId ?? setCard?.episodeId ?? null;
    const isOwned = ownedCardIds.has(want.cardId);
    const isStale = !episodeId || !linkedEpisodeIds.has(episodeId) || isOwned;

    if (isStale) {
      deleteStaleIds.push(want.id);
      continue;
    }

    if (want.sourceEpisodeId !== episodeId) {
      updateEpisode.push({ id: want.id, episodeId });
    }

    if (want.dismissedAt) {
      hiddenKept += 1;
      continue;
    }
  }

  const create = input.setCards
    .filter((card) => linkedEpisodeIds.has(card.episodeId))
    .filter((card) => !ownedCardIds.has(card.id))
    .filter((card) => !existingByCardId.has(card.id))
    .map((card) => ({ cardId: card.id, episodeId: card.episodeId }));

  return {
    create,
    updateEpisode,
    deleteStaleIds,
    hiddenKept,
  };
}

export async function syncMissingBinderWantsForUser(
  userId: string,
  options?: {
    game?: TradingCardGameFilter;
    includeOnePiece?: boolean;
  }
): Promise<MissingBinderWantSyncResult> {
  const scopedGames = toScopedGames(options);
  const linkedBinders = await db.collectionBinder.findMany({
    where: {
      user_id: userId,
      type: "linked_set",
      episode_id: { not: null },
      episode: { game: { in: scopedGames } },
    },
    select: {
      id: true,
      episode_id: true,
    },
  });

  const linkedEpisodeIds = [
    ...new Set(
      linkedBinders
        .map((binder) => binder.episode_id)
        .filter((episodeId): episodeId is string => Boolean(episodeId))
    ),
  ];

  const [setCards, ownedCards, existingWants] = await Promise.all([
    linkedEpisodeIds.length > 0
      ? db.card.findMany({
          where: { episode_id: { in: linkedEpisodeIds } },
          select: { id: true, episode_id: true },
        })
      : Promise.resolve([]),
    linkedEpisodeIds.length > 0
      ? db.collectionCard.findMany({
          where: {
            user_id: userId,
            for_sale: false,
            sold_at: null,
            card: { episode_id: { in: linkedEpisodeIds } },
          },
          select: { card_id: true },
        })
      : Promise.resolve([]),
    db.collectionWant.findMany({
      where: {
        user_id: userId,
        OR: [
          { source: WANT_SOURCE_BINDER_MISSING, card: { game: { in: scopedGames } } },
          linkedEpisodeIds.length > 0
            ? { card: { episode_id: { in: linkedEpisodeIds } } }
            : { id: "__never__" },
        ],
      },
      select: {
        id: true,
        card_id: true,
        source: true,
        source_episode_id: true,
        dismissed_at: true,
      },
    }),
  ]);

  const plan = buildMissingBinderWantSyncPlan({
    linkedEpisodeIds,
    setCards: setCards.map((card) => ({ id: card.id, episodeId: card.episode_id })),
    ownedCardIds: ownedCards.map((card) => card.card_id),
    existingWants: existingWants.map((want) => ({
      id: want.id,
      cardId: want.card_id,
      source: want.source,
      sourceEpisodeId: want.source_episode_id,
      dismissedAt: want.dismissed_at,
    })),
  });

  await db.$transaction(async (tx) => {
    if (plan.deleteStaleIds.length > 0) {
      await tx.collectionWant.deleteMany({
        where: {
          user_id: userId,
          id: { in: plan.deleteStaleIds },
          source: WANT_SOURCE_BINDER_MISSING,
        },
      });
    }

    for (const update of plan.updateEpisode) {
      await tx.collectionWant.update({
        where: { id: update.id },
        data: { source_episode_id: update.episodeId },
      });
    }

    if (plan.create.length > 0) {
      await tx.collectionWant.createMany({
        data: plan.create.map((item) => ({
          user_id: userId,
          card_id: item.cardId,
          source: WANT_SOURCE_BINDER_MISSING,
          source_episode_id: item.episodeId,
        })),
      });
    }
  });

  const ownedCardIds = new Set(ownedCards.map((card) => card.card_id));

  return {
    ...plan,
    linkedBinders: linkedBinders.length,
    linkedEpisodes: linkedEpisodeIds.length,
    missingCards: setCards.filter((card) => !ownedCardIds.has(card.id)).length,
  };
}

export async function syncMissingBinderWantsForUserSettingsScope(userId: string) {
  const settings = await getServerUserSettings(userId);
  return syncMissingBinderWantsForUser(userId, {
    includeOnePiece: settings.onePieceLibraryEnabled,
  });
}

export async function syncMissingBinderWantsAfterCollectionChange(userId: string): Promise<void> {
  try {
    await syncMissingBinderWantsForUserSettingsScope(userId);
  } catch (error) {
    console.error("Failed to sync missing binder wants", error);
  }
}

export async function resetHiddenBinderWantsForUser(
  userId: string,
  options?: {
    episodeId?: string | null;
    game?: TradingCardGameFilter;
    includeOnePiece?: boolean;
  }
) {
  const scopedGames = toScopedGames(options);
  const episodeId = options?.episodeId?.trim() || null;

  const linkedBinder = episodeId
    ? await db.collectionBinder.findFirst({
        where: {
          user_id: userId,
          type: "linked_set",
          episode_id: episodeId,
          episode: { game: { in: scopedGames } },
        },
        select: { id: true },
      })
    : null;

  if (episodeId && !linkedBinder) {
    return { count: 0 };
  }

  const result = await db.collectionWant.updateMany({
    where: {
      user_id: userId,
      source: WANT_SOURCE_BINDER_MISSING,
      dismissed_at: { not: null },
      ...(episodeId ? { source_episode_id: episodeId } : {}),
      card: { episode: { game: { in: scopedGames } } },
    },
    data: { dismissed_at: null },
  });

  return { count: result.count };
}
