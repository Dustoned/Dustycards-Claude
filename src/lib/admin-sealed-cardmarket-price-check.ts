import { db } from "@/lib/db";
import { AdminCardMarketPriceCheckError, createAdminCardMarketPriceCheckToken, parseAdminCardMarketPriceCheckToken } from "@/lib/admin-cardmarket-price-check";
import { scrapePageWithFallback } from "@/lib/scrape-provider";
import { buildSealedCardMarketSnapshotData, parseSealedCardMarketOfferTable, resolveSealedCardMarketExactSourceUrl, sealedCardMarketProductIdentityMatches } from "@/lib/sync/sealed-cardmarket-base-price-job";

export async function runAdminSealedCardMarketPriceCheck(id: string) {
  const product = await db.sealedProduct.findUnique({ where: { id } });
  if (!product) throw new AdminCardMarketPriceCheckError("Sealed product not found.", 404);
  const sourceUrl = resolveSealedCardMarketExactSourceUrl({ cardmarketId: product.cardmarket_id, cardmarketUrl: product.cardmarket_url });
  if (!sourceUrl) throw new AdminCardMarketPriceCheckError("This sealed product has no direct CardMarket product linked yet.", 409);
  let scrape = await scrapePageWithFallback(sourceUrl, { maxAge: 0 });
  let offers = parseSealedCardMarketOfferTable(scrape);
  if (offers.priceEur == null && !offers.explicitNoOffers) {
    scrape = await scrapePageWithFallback(sourceUrl, { skipFirecrawl: true, maxAge: 0 });
    offers = parseSealedCardMarketOfferTable(scrape);
  }
  const title = scrape.title?.trim() || scrape.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null;
  if (!sealedCardMarketProductIdentityMatches({ expectedName: product.name, observedTitle: title })) {
    throw new AdminCardMarketPriceCheckError("CardMarket returned a different or unidentifiable product. No price was saved.", 422);
  }
  if (offers.priceEur == null) throw new AdminCardMarketPriceCheckError(
    offers.explicitNoOffers ? "CardMarket has no available English offers for this sealed product." : "CardMarket's sealed offer table could not be read. Retry the live check.",
    offers.explicitNoOffers ? 422 : 502,
  );
  const observedAt = new Date().toISOString();
  const currentPriceEur = product.cm_lowest;
  const differenceEur = currentPriceEur == null ? null : Number((offers.priceEur - currentPriceEur).toFixed(2));
  return {
    currentPriceEur, observedPriceEur: offers.priceEur, differenceEur,
    differencePercent: currentPriceEur != null && currentPriceEur > 0 ? Number(((offers.priceEur - currentPriceEur) / currentPriceEur * 100).toFixed(1)) : null,
    offerCount: offers.offerCount, sourceUrl: scrape.sourceUrl, provider: scrape.provider, observedAt,
    scrapedName: title, scrapedSetName: null, scrapedCardNumber: null,
    token: createAdminCardMarketPriceCheckToken({ v: 1, cardId: `sealed:${id}`, priceEur: offers.priceEur, offerCount: offers.offerCount, sourceUrl: scrape.sourceUrl, provider: scrape.provider, observedAt }),
  };
}

export async function confirmAdminSealedCardMarketPriceCheck(id: string, token: string, decision: "changed" | "unchanged") {
  const payload = parseAdminCardMarketPriceCheckToken(token, `sealed:${id}`);
  await db.$transaction(async (tx) => {
    const product = await tx.sealedProduct.findUnique({ where: { id } });
    if (!product) throw new AdminCardMarketPriceCheckError("Sealed product not found.", 404);
    // Keeping the saved price must not fabricate a new price observation.
    if (decision === "unchanged") return;
    await tx.sealedProduct.update({ where: { id }, data: { cm_lowest: payload.priceEur } });
    await tx.sealedPriceSnapshot.create({ data: buildSealedCardMarketSnapshotData({ productId: id, episodeId: product.episode_id, priceEur: payload.priceEur, observedAt: new Date(payload.observedAt) }) });
  });
}
