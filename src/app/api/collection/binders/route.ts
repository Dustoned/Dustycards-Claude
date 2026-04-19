import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";

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

async function resolveEpisode(input: { episodeId?: unknown; linkedQuery?: unknown }) {
  const explicitEpisodeId = toNullableString(input.episodeId);
  if (explicitEpisodeId) {
    return db.episode.findUnique({
      where: { id: explicitEpisodeId },
      select: { id: true, name: true, code: true, logo_url: true, series: true },
    });
  }

  const linkedQuery = toNullableString(input.linkedQuery);
  if (!linkedQuery) return null;

  const normalized = linkedQuery.toLowerCase();
  const episodes = await db.episode.findMany({
    where: {
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
  const binders = await db.collectionBinder.findMany({
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    select: {
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
    },
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
}

export async function POST(req: NextRequest) {
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
  if (type !== "linked_set" && type !== "custom") {
    return NextResponse.json({ error: "Invalid binder type" }, { status: 400 });
  }

  const basePurchasePrice = toNullableNumber(body.basePurchasePrice);
  if (basePurchasePrice != null && basePurchasePrice < 0) {
    return NextResponse.json({ error: "Base purchase price cannot be negative" }, { status: 400 });
  }

  if (type === "linked_set") {
    const episode = await resolveEpisode(body);
    if (!episode) {
      return NextResponse.json({ error: "Expansion not found" }, { status: 400 });
    }

    if (isHiddenExpansion({ id: episode.id, code: episode.code, name: episode.name })) {
      return NextResponse.json({ error: "Expansion is hidden" }, { status: 400 });
    }

    const existing = await db.collectionBinder.findFirst({
      where: { type: "linked_set", episode_id: episode.id },
      select: {
        id: true,
        name: true,
        type: true,
        episode_id: true,
        accent_color: true,
        icon_name: true,
        base_purchase_price: true,
        episode: {
          select: { id: true, name: true, code: true, logo_url: true },
        },
      },
    });

    if (existing) {
      return NextResponse.json({ binder: existing, reused: true });
    }

    const binder = await db.collectionBinder.create({
      data: {
        name: toNullableString(body.name) ?? episode.name,
        type,
        episode_id: episode.id,
        accent_color: toNullableString(body.accentColor),
        icon_name: toNullableString(body.iconName),
        notes: toNullableString(body.notes),
        base_purchase_price: basePurchasePrice,
      },
      select: {
        id: true,
        name: true,
        type: true,
        episode_id: true,
        accent_color: true,
        icon_name: true,
        base_purchase_price: true,
        episode: {
          select: { id: true, name: true, code: true, logo_url: true },
        },
      },
    });

    return NextResponse.json({ binder, reused: false });
  }

  const name = toNullableString(body.name);
  if (!name) {
    return NextResponse.json({ error: "Binder name is required" }, { status: 400 });
  }

  const binder = await db.collectionBinder.create({
    data: {
      name,
      type,
      accent_color: toNullableString(body.accentColor),
      icon_name: toNullableString(body.iconName),
      notes: toNullableString(body.notes),
      base_purchase_price: basePurchasePrice,
    },
    select: {
      id: true,
      name: true,
      type: true,
      episode_id: true,
      accent_color: true,
      icon_name: true,
      base_purchase_price: true,
      episode: {
        select: { id: true, name: true, code: true, logo_url: true },
      },
    },
  });

  return NextResponse.json({ binder, reused: false });
}
