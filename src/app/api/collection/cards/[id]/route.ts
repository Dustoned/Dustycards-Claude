import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { ValidationError, validationErrorResponse } from "@/lib/api-validation";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { parseCollectionTags } from "@/lib/collection";
import { db } from "@/lib/db";
import { serializeBgsSubgrades } from "@/lib/graded-slabs";
import { syncMissingBinderWantsAfterCollectionChange } from "@/lib/wantlist-planner";
import { SEALED_ORIGIN_PRICE_SOURCE } from "@/lib/collection-sealed-origin";
import { isValidCollectionSealedOrigin } from "@/lib/collection-sealed-origin-server";

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

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJsonBody<{
    binderId?: unknown;
    forSale?: unknown;
    purchasePrice?: unknown;
    condition?: unknown;
    language?: unknown;
    notes?: unknown;
    tags?: unknown;
    gradingCompany?: unknown;
    gradingGrade?: unknown;
    gradingSubgrades?: unknown;
    originSealedProductId?: unknown;
    purchasePriceSource?: unknown;
    }>(req);

  const purchasePrice = toNullableNumber(body.purchasePrice);
  if (purchasePrice != null && purchasePrice < 0) {
    return NextResponse.json(
      { error: "Purchase price cannot be negative" },
      { status: 400 }
    );
  }

  const originSealedProductId = toNullableString(body.originSealedProductId);
  const rawPurchasePriceSource = toNullableString(body.purchasePriceSource);
  if (
    rawPurchasePriceSource != null &&
    rawPurchasePriceSource !== SEALED_ORIGIN_PRICE_SOURCE
  ) {
    return NextResponse.json({ error: "Unsupported purchase price source" }, { status: 400 });
  }
  if (rawPurchasePriceSource && (!originSealedProductId || purchasePrice == null)) {
    return NextResponse.json(
      { error: "A sealed price basis needs both an origin and a purchase price" },
      { status: 400 }
    );
  }

  const collectionItem = await db.collectionCard.findFirst({
    where: { id, user_id: user.id },
    select: {
      id: true,
      card_id: true,
      card: {
        select: {
          episode_id: true,
          game: true,
        },
      },
    },
  });

  if (!collectionItem) {
    return NextResponse.json({ error: "Collection item not found" }, { status: 404 });
  }

  if (
    originSealedProductId &&
    !(await isValidCollectionSealedOrigin(originSealedProductId, [
      {
        id: collectionItem.card_id,
        episode_id: collectionItem.card.episode_id,
        game: collectionItem.card.game,
      },
    ]))
  ) {
    return NextResponse.json(
      { error: "Selected sealed product cannot contain this card" },
      { status: 400 }
    );
  }

  const forSale = toNullableBoolean(body.forSale) ?? false;
  const binderId = forSale ? null : toNullableString(body.binderId);
  if (binderId) {
    const binder = await db.collectionBinder.findFirst({
      where: { id: binderId, user_id: user.id },
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
  const gradingSubgradesJson =
    gradingCompany?.toUpperCase() === "BGS" ? serializeBgsSubgrades(body.gradingSubgrades) : null;

  await db.$transaction(async (tx) => {
    const updated = await tx.collectionCard.updateMany({
      where: { id, user_id: user.id, sold_at: null },
      data: {
        binder_id: binderId,
        for_sale: forSale,
        purchase_price: purchasePrice,
        condition,
        language,
        notes,
        grading_company: gradingCompany,
        grading_grade: gradingGrade,
        grading_subgrades_json: gradingSubgradesJson,
        origin_sealed_product_id: originSealedProductId,
        purchase_price_source: rawPurchasePriceSource,
      },
    });
    if (updated.count !== 1) {
      throw new ValidationError("This card was sold or removed. Reload your collection before editing it.", 409);
    }

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

    if (!forSale) {
      await tx.collectionWant.deleteMany({
        where: {
          user_id: user.id,
          card_id: collectionItem.card_id,
        },
      });
    }
  });

  await syncMissingBinderWantsAfterCollectionChange(user.id);

  return NextResponse.json({ success: true });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to update collection item" }, { status: 500 })
    );
  }
}
