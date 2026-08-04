import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  getSealedOriginMarketPrice,
  sealedOriginMatchesAllCards,
} from "@/lib/collection-sealed-origin";
import { db } from "@/lib/db";
import { isCollectionSealedOriginProduct } from "@/lib/sealed-products";

const SEALED_ORIGIN_CARD_LIMIT = 500;

function toUniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{ cardIds?: unknown }>(req);
    const cardIds = toUniqueIds(body.cardIds);

    if (cardIds.length === 0) {
      return NextResponse.json({ error: "At least one card id is required" }, { status: 400 });
    }
    if (cardIds.length > SEALED_ORIGIN_CARD_LIMIT) {
      return NextResponse.json(
        { error: `Too many cards in one request (max ${SEALED_ORIGIN_CARD_LIMIT})` },
        { status: 400 }
      );
    }

    const cards = await db.card.findMany({
      where: { id: { in: cardIds } },
      select: { id: true, game: true, episode_id: true },
    });
    if (cards.length !== cardIds.length) {
      return NextResponse.json({ error: "One or more cards were not found" }, { status: 404 });
    }

    const episodeIds = [...new Set(cards.map((card) => card.episode_id))];
    const games = [...new Set(cards.map((card) => card.game))];
    const products = await db.sealedProduct.findMany({
      where: {
        game: { in: games },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        game: true,
        episode_id: true,
        name: true,
        image_url: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        cm_avg_7d: true,
        cm_avg_30d: true,
        episode: { select: { id: true, name: true, code: true } },
        contentSets: {
          where: { episode_id: { in: episodeIds } },
          select: { episode_id: true },
        },
        includedCards: {
          where: { card_id: { in: cardIds } },
          select: { card_id: true },
        },
      },
    });
    const matchingProducts = products.filter(
      (product) =>
        isCollectionSealedOriginProduct(product.name) &&
        cards.every((card) => product.game === card.game)
    );

    const ownedItems = matchingProducts.length
      ? await db.collectionSealed.findMany({
          where: {
            user_id: user.id,
            product_id: { in: matchingProducts.map((product) => product.id) },
          },
          orderBy: [{ updated_at: "desc" }],
          select: {
            product_id: true,
          },
        })
      : [];
    const ownedProductIds = new Set(ownedItems.map((item) => item.product_id));

    const options = matchingProducts
      .map((product) => {
        const owned = ownedProductIds.has(product.id);
        const marketPrice = getSealedOriginMarketPrice(product);
        return {
          id: product.id,
          name: product.name,
          image_url: product.image_url,
          episode: product.episode,
          owned,
          matches_cards: sealedOriginMatchesAllCards(product, cards),
          price_basis: marketPrice,
          price_basis_source: marketPrice != null ? ("market" as const) : null,
        };
      })
      .sort(
        (left, right) =>
          Number(right.matches_cards) - Number(left.matches_cards) ||
          Number(right.owned) - Number(left.owned) ||
          left.name.localeCompare(right.name)
      );

    return NextResponse.json({ options });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      NextResponse.json({ error: "Failed to load sealed origins" }, { status: 500 })
    );
  }
}
