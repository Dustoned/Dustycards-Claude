import "server-only";

import { db } from "@/lib/db";

export interface SealedReleaseMatchProduct {
  id: string;
  name: string;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

export function normalizeSealedReleaseProductName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/pok[eé]mon\s+trading\s+card\s+game/g, " ")
    .replace(/pok[eé]mon\s+tcg/g, " ")
    .replace(/pok[eé]mon/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildUniqueSealedProductNameIndex<T extends SealedReleaseMatchProduct>(
  products: readonly T[]
): Map<string, T> {
  const unique = new Map<string, T>();
  const ambiguous = new Set<string>();

  for (const product of products) {
    const key = normalizeSealedReleaseProductName(product.name);
    if (!key || ambiguous.has(key)) continue;
    if (unique.has(key)) {
      unique.delete(key);
      ambiguous.add(key);
      continue;
    }
    unique.set(key, product);
  }

  return unique;
}

export async function reconcileSealedReleaseWatchMatches(game: string): Promise<number> {
  const [unmatchedWatches, products] = await Promise.all([
    db.sealedReleaseWatch.findMany({
      where: { game, matched_product_id: null },
      select: { id: true, name: true },
    }),
    db.sealedProduct.findMany({
      where: { game },
      select: {
        id: true,
        name: true,
        episode: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);
  const productsByName = buildUniqueSealedProductNameIndex(products);
  const matches = unmatchedWatches.flatMap((watch) => {
    const product = productsByName.get(normalizeSealedReleaseProductName(watch.name));
    return product ? [{ watchId: watch.id, productId: product.id }] : [];
  });

  if (matches.length === 0) return 0;
  await db.$transaction(
    matches.map((match) =>
      db.sealedReleaseWatch.updateMany({
        where: { id: match.watchId, matched_product_id: null },
        data: { matched_product_id: match.productId },
      })
    )
  );
  return matches.length;
}
