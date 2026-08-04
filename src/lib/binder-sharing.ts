import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getBinderPageData } from "@/lib/collection-data";

const SHARE_TOKEN_BYTES = 24;

export class BinderShareError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BinderShareError";
    this.status = status;
  }
}

async function requireOwnedBinder(binderId: string, userId: string) {
  const binder = await db.collectionBinder.findFirst({
    where: { id: binderId, user_id: userId },
    select: { id: true, name: true },
  });
  if (!binder) throw new BinderShareError("Binder not found", 404);
  return binder;
}

export async function getBinderShareState(binderId: string, userId: string) {
  await requireOwnedBinder(binderId, userId);
  const share = await db.binderShareLink.findUnique({
    where: { user_id_binder_id: { user_id: userId, binder_id: binderId } },
    select: { token: true, revoked_at: true, created_at: true, updated_at: true },
  });
  return {
    ok: true as const,
    share:
      share && !share.revoked_at
        ? {
            token: share.token,
            createdAt: share.created_at.toISOString(),
            updatedAt: share.updated_at.toISOString(),
          }
        : null,
  };
}

export async function createBinderShare(binderId: string, userId: string) {
  await requireOwnedBinder(binderId, userId);
  const token = randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
  const share = await db.binderShareLink.upsert({
    where: { user_id_binder_id: { user_id: userId, binder_id: binderId } },
    create: { user_id: userId, binder_id: binderId, token },
    update: { token, revoked_at: null },
    select: { token: true, created_at: true, updated_at: true },
  });
  return {
    ok: true as const,
    share: {
      token: share.token,
      createdAt: share.created_at.toISOString(),
      updatedAt: share.updated_at.toISOString(),
    },
  };
}

export async function revokeBinderShare(binderId: string, userId: string) {
  await requireOwnedBinder(binderId, userId);
  await db.binderShareLink.updateMany({
    where: { user_id: userId, binder_id: binderId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return { ok: true as const, share: null };
}

export async function getSharedBinderPageData(token: string) {
  const share = await db.binderShareLink.findFirst({
    where: { token, revoked_at: null },
    select: { binder_id: true, user_id: true, updated_at: true },
  });
  if (!share) return null;

  const data = await getBinderPageData(share.binder_id, share.user_id);
  if (!data) return null;

  return {
    sharedAt: share.updated_at.toISOString(),
    binder: {
      id: data.binder.id,
      name: data.binder.name,
      type: data.binder.type,
      accentColor: data.binder.accent_color,
      iconName: data.binder.icon_name,
      episode: data.binder.episode
        ? {
            name: data.binder.episode.name,
            code: data.binder.episode.code,
            logoUrl: data.binder.episode.logo_url,
            series: data.binder.episode.series,
          }
        : null,
    },
    metrics: {
      ownedCount: data.metrics.ownedCount,
      totalCards: data.metrics.totalCards,
      currentValue: data.metrics.currentValue,
      pricedCards: data.items.filter((item) => item.owned && item.current_value != null).length,
    },
    items: data.items
      .filter((item) => item.owned)
      .map((item) => ({
        cardId: item.card_id,
        name: item.name,
        imageUrl: item.image_url,
        cardNumber: item.card_number,
        rarity: item.rarity,
        episodeName: item.episode_name,
        episodeCode: item.episode_code,
        currentValue: item.current_value,
        ownedCount: item.owned_count ?? 1,
        gradingCompany: item.grading_company,
        gradingGrade: item.grading_grade,
      })),
  };
}

export type SharedBinderPageData = NonNullable<
  Awaited<ReturnType<typeof getSharedBinderPageData>>
>;
