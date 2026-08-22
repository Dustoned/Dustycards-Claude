import "server-only";

import {
  sealedOriginMatchesAllCards,
  type SealedOriginCardRef,
} from "@/lib/collection-sealed-origin";
import { db } from "@/lib/db";
import { isCollectionSealedOriginProduct } from "@/lib/sealed-products";

export async function isValidCollectionSealedOrigin(
  productId: string,
  cards: SealedOriginCardRef[]
): Promise<boolean> {
  const product = await db.sealedProduct.findUnique({
    where: { id: productId },
    select: {
      id: true,
      game: true,
      name: true,
      episode_id: true,
      contentSets: { select: { episode_id: true } },
      includedCards: { select: { card_id: true } },
    },
  });

  return Boolean(
    product &&
      cards.length > 0 &&
      isCollectionSealedOriginProduct(product.name) &&
      sealedOriginMatchesAllCards(product, cards)
  );
}
