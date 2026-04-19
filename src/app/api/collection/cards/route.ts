import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    cardId?: unknown;
    binderId?: unknown;
    purchasePrice?: unknown;
    condition?: unknown;
    language?: unknown;
    notes?: unknown;
    tags?: unknown;
    gradingCompany?: unknown;
    gradingGrade?: unknown;
  };

  const cardId = toNullableString(body.cardId);
  if (!cardId) {
    return NextResponse.json({ error: "Card id is required" }, { status: 400 });
  }

  const purchasePrice = toNullableNumber(body.purchasePrice);
  if (purchasePrice != null && purchasePrice < 0) {
    return NextResponse.json({ error: "Purchase price cannot be negative" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, episode_id: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const binderId = toNullableString(body.binderId);
  if (binderId) {
    const binder = await db.collectionBinder.findUnique({
      where: { id: binderId },
      select: { id: true, type: true, episode_id: true },
    });

    if (!binder) {
      return NextResponse.json({ error: "Binder not found" }, { status: 404 });
    }

    if (binder.type === "linked_set" && binder.episode_id && binder.episode_id !== card.episode_id) {
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

  const created = await db.collectionCard.create({
    data: {
      card_id: card.id,
      binder_id: binderId,
      purchase_price: purchasePrice,
      condition: toNullableString(body.condition),
      language: toNullableString(body.language),
      notes: toNullableString(body.notes),
      grading_company: toNullableString(body.gradingCompany),
      grading_grade: toNullableString(body.gradingGrade),
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
}
