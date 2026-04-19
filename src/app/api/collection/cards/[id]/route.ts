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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    binderId?: unknown;
    purchasePrice?: unknown;
    condition?: unknown;
    language?: unknown;
    notes?: unknown;
    tags?: unknown;
    gradingCompany?: unknown;
    gradingGrade?: unknown;
  };

  const purchasePrice = toNullableNumber(body.purchasePrice);
  if (purchasePrice != null && purchasePrice < 0) {
    return NextResponse.json(
      { error: "Purchase price cannot be negative" },
      { status: 400 }
    );
  }

  const collectionItem = await db.collectionCard.findUnique({
    where: { id },
    select: {
      id: true,
      card: {
        select: {
          episode_id: true,
        },
      },
    },
  });

  if (!collectionItem) {
    return NextResponse.json({ error: "Collection item not found" }, { status: 404 });
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

    if (
      binder.type === "linked_set" &&
      binder.episode_id &&
      binder.episode_id !== collectionItem.card.episode_id
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

  await db.$transaction(async (tx) => {
    await tx.collectionCard.update({
      where: { id },
      data: {
        binder_id: binderId,
        purchase_price: purchasePrice,
        condition,
        language,
        notes,
        grading_company: gradingCompany,
        grading_grade: gradingGrade,
      },
    });

    await tx.collectionCardTag.deleteMany({
      where: { collection_card_id: id },
    });

    if (tags.length > 0) {
      await tx.collectionCardTag.createMany({
        data: tags.map((label) => ({
          collection_card_id: id,
          label,
        })),
      });
    }
  });

  return NextResponse.json({ success: true });
}
