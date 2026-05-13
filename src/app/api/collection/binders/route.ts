import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getAppFeatures } from "@/lib/app-settings";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import { POKEMON_GAME } from "@/lib/games";

const binderSelect = {
  id: true,
  name: true,
  type: true,
  episode_id: true,
  accent_color: true,
  icon_name: true,
  base_purchase_price: true,
  episode: {
    select: {
      id: true,
      name: true,
      code: true,
      logo_url: true,
    },
  },
} as const;

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

async function resolveEpisode(input: {
  episodeId?: unknown;
  linkedQuery?: unknown;
  onePieceEnabled?: boolean;
}) {
  const gameWhere = input.onePieceEnabled ? {} : { game: POKEMON_GAME };
  const explicitEpisodeId = toNullableString(input.episodeId);
  if (explicitEpisodeId) {
    return db.episode.findFirst({
      where: { id: explicitEpisodeId, ...gameWhere },
      select: { id: true, name: true, code: true, logo_url: true, series: true },
    });
  }

  const linkedQuery = toNullableString(input.linkedQuery);
  if (!linkedQuery) return null;

  const normalized = linkedQuery.toLowerCase();
  const episodes = await db.episode.findMany({
    where: {
      ...gameWhere,
      OR: [
        { id: linkedQuery },
        { code: { equals: linkedQuery } },
        { name: { equals: linkedQuery } },
        { name: { contains: linkedQuery } },
      ],
    },
    select: { id: true, name: true, code: true, logo_url: true, series: true },
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    take: 20,
  });

  const visible = episodes.filter(
    (episode) =>
      !isHiddenExpansion({ id: episode.id, code: episode.code, name: episode.name })
  );

  return (
    visible.find((episode) => episode.name.toLowerCase() === normalized) ??
    visible.find((episode) => episode.code?.toLowerCase() === normalized) ??
    visible[0] ??
    null
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const binders = await db.collectionBinder.findMany({
      where: { user_id: user.id },
      orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
      select: binderSelect,
    });

    return NextResponse.json({
      binders: binders.map((binder) => ({
        id: binder.id,
        name: binder.name,
        type: binder.type,
        episode_id: binder.episode_id,
        accent_color: binder.accent_color,
        icon_name: binder.icon_name,
        base_purchase_price: binder.base_purchase_price,
        episode: binder.episode,
      })),
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to load binders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      name?: unknown;
      type?: unknown;
      episodeId?: unknown;
      linkedQuery?: unknown;
      accentColor?: unknown;
      iconName?: unknown;
      notes?: unknown;
      basePurchasePrice?: unknown;
    };

    const type = toNullableString(body.type);
    if (type !== "linked_set" && type !== "custom" && type !== "auto") {
      return NextResponse.json({ error: "Invalid binder type" }, { status: 400 });
    }

    const basePurchasePrice = toNullableNumber(body.basePurchasePrice);
    if (basePurchasePrice != null && basePurchasePrice < 0) {
      return NextResponse.json({ error: "Base purchase price cannot be negative" }, { status: 400 });
    }

    const requestedName = toNullableString(body.name);
    const features = await getAppFeatures();
    const linkedQuery = toNullableString(body.linkedQuery) ?? requestedName;
    const shouldResolveEpisode = type === "linked_set" || type === "auto";
    const episode = shouldResolveEpisode
      ? await resolveEpisode({
          episodeId: body.episodeId,
          linkedQuery,
          onePieceEnabled: features.onePieceLibraryEnabled,
        })
      : null;

    if (type === "linked_set" || (type === "auto" && episode)) {
      if (!episode) {
        return NextResponse.json({ error: "Expansion not found" }, { status: 400 });
      }

      const resolvedEpisode = episode;
      if (!resolvedEpisode) {
        return NextResponse.json({ error: "Expansion not found" }, { status: 400 });
      }

      if (isHiddenExpansion({ id: resolvedEpisode.id, code: resolvedEpisode.code, name: resolvedEpisode.name })) {
        return NextResponse.json({ error: "Expansion is hidden" }, { status: 400 });
      }

      const existing = await db.collectionBinder.findFirst({
        where: { type: "linked_set", episode_id: resolvedEpisode.id, user_id: user.id },
        select: binderSelect,
      });

      if (existing) {
        return NextResponse.json({ binder: existing, reused: true });
      }

      const binder = await db.collectionBinder.create({
        data: {
          user_id: user.id,
          name: type === "linked_set" ? requestedName ?? resolvedEpisode.name : resolvedEpisode.name,
          type: "linked_set",
          episode_id: resolvedEpisode.id,
          accent_color: toNullableString(body.accentColor),
          icon_name: null,
          notes: toNullableString(body.notes),
          base_purchase_price: basePurchasePrice,
        },
        select: binderSelect,
      });

      return NextResponse.json({ binder, reused: false });
    }

    const name = requestedName ?? linkedQuery;
    if (!name) {
      return NextResponse.json({ error: "Binder name is required" }, { status: 400 });
    }

    const binder = await db.collectionBinder.create({
      data: {
        user_id: user.id,
        name,
        type: "custom",
        accent_color: toNullableString(body.accentColor),
        icon_name: toNullableString(body.iconName),
        notes: toNullableString(body.notes),
        base_purchase_price: basePurchasePrice,
      },
      select: binderSelect,
    });

    return NextResponse.json({ binder, reused: false });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to save binder" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      id?: unknown;
      name?: unknown;
      accentColor?: unknown;
      iconName?: unknown;
      notes?: unknown;
      basePurchasePrice?: unknown;
    };

    const binderId = toNullableString(body.id);
    if (!binderId) {
      return NextResponse.json({ error: "Binder id is required" }, { status: 400 });
    }

    const name = toNullableString(body.name);
    if (!name) {
      return NextResponse.json({ error: "Binder name is required" }, { status: 400 });
    }

    const basePurchasePrice = toNullableNumber(body.basePurchasePrice);
    if (basePurchasePrice != null && basePurchasePrice < 0) {
      return NextResponse.json({ error: "Base purchase price cannot be negative" }, { status: 400 });
    }

    const existing = await db.collectionBinder.findFirst({
      where: { id: binderId, user_id: user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Binder not found" }, { status: 404 });
    }

    const binder = await db.collectionBinder.update({
      where: { id: binderId },
      data: {
        name,
        accent_color: toNullableString(body.accentColor),
        icon_name: toNullableString(body.iconName),
        notes: toNullableString(body.notes),
        base_purchase_price: basePurchasePrice,
      },
      select: binderSelect,
    });

    return NextResponse.json({ binder });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to update binder" }, { status: 500 });
  }
}
