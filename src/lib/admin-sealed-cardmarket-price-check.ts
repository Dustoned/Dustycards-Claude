import { parseSealedMarketOffers } from "@/lib/sealed-cardmarket-offers";
import { db } from "@/lib/db";
import {
  AdminCardMarketPriceCheckError,
  createAdminCardMarketPriceCheckToken,
  parseAdminCardMarketPriceCheckToken,
} from "@/lib/admin-cardmarket-price-check";
import { scrapePageWithFallback } from "@/lib/scrape-provider";
import {
  buildSealedCardMarketSnapshotData,
  parseSealedCardMarketOfferTable,
  resolveSealedCardMarketExactSourceUrl,
  sealedCardMarketProductIdentityMatches,
} from "@/lib/sync/sealed-cardmarket-base-price-job";

export async function runAdminSealedCardMarketPriceCheck(id: string) {
  const product = await db.sealedProduct.findUnique({ where: { id } });
  if (!product)
    throw new AdminCardMarketPriceCheckError("Sealed product not found.", 404);
  const resolvedUrl = resolveSealedCardMarketExactSourceUrl({
    cardmarketId: product.cardmarket_id,
    cardmarketUrl: product.cardmarket_url,
  });
  if (!resolvedUrl)
    throw new AdminCardMarketPriceCheckError(
      "This sealed product has no direct CardMarket product linked yet.",
      409,
    );
  const requestUrl = new URL(resolvedUrl);
  // Market must not inherit a saved seller-country filter from a copied link.
  for (const key of [...requestUrl.searchParams.keys()]) {
    if (key.startsWith("sellerCountry")) requestUrl.searchParams.delete(key);
  }
  const sourceUrl = requestUrl.toString();
  let scrape = await scrapePageWithFallback(sourceUrl, { maxAge: 0 });
  let offers = parseSealedCardMarketOfferTable(scrape);
  let sellerOffers = parseSealedMarketOffers(scrape.html);
  if (sellerOffers.length === 0 && !offers.explicitNoOffers) {
    scrape = await scrapePageWithFallback(sourceUrl, {
      skipFirecrawl: true,
      maxAge: 0,
    });
    offers = parseSealedCardMarketOfferTable(scrape);
    sellerOffers = parseSealedMarketOffers(scrape.html);
  }
  const title =
    scrape.title?.trim() ||
    scrape.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    null;
  if (
    !sealedCardMarketProductIdentityMatches({
      expectedName: product.name,
      observedTitle: title,
    })
  ) {
    throw new AdminCardMarketPriceCheckError(
      "CardMarket returned a different or unidentifiable product. No price was saved.",
      422,
    );
  }
  if (offers.priceEur == null)
    throw new AdminCardMarketPriceCheckError(
      offers.explicitNoOffers
        ? "CardMarket has no available English offers for this sealed product."
        : "CardMarket's sealed offer table could not be read. Retry the live check.",
      offers.explicitNoOffers ? 422 : 502,
    );
  const marketOffer = sellerOffers[0];
  if (!marketOffer)
    throw new AdminCardMarketPriceCheckError(
      "No English sealed offers with a readable seller row could be found. No prices were saved.",
      422,
    );
  const euOffer = sellerOffers.find((offer) => offer.isEu) ?? null;
  const observedAt = new Date().toISOString();
  const currentPriceEur = product.cm_lowest;
  const differenceEur =
    currentPriceEur == null
      ? null
      : Number((marketOffer.priceEur - currentPriceEur).toFixed(2));
  return {
    currentPriceEur,
    observedPriceEur: marketOffer.priceEur,
    differenceEur,
    differencePercent:
      currentPriceEur != null && currentPriceEur > 0
        ? Number(
            (
              ((marketOffer.priceEur - currentPriceEur) / currentPriceEur) *
              100
            ).toFixed(1),
          )
        : null,
    offerCount: sellerOffers.length,
    sourceUrl: scrape.sourceUrl,
    provider: scrape.provider,
    observedAt,
    sealedMarkets: [
      { label: "Market", savedPriceEur: currentPriceEur, offer: marketOffer },
      {
        label: "EU Market",
        savedPriceEur: product.cm_lowest_eu,
        offer: euOffer,
      },
    ],
    sealedOffers: sellerOffers.slice(0, 10),
    scrapedName: title,
    scrapedSetName: null,
    scrapedCardNumber: null,
    token: createAdminCardMarketPriceCheckToken({
      v: 1,
      cardId: `sealed:${id}`,
      priceEur: marketOffer.priceEur,
      offerCount: sellerOffers.length,
      sourceUrl: scrape.sourceUrl,
      provider: scrape.provider,
      observedAt,
      sealedEuPriceEur: euOffer?.priceEur ?? null,
    }),
  };
}

export async function confirmAdminSealedCardMarketPriceCheck(
  id: string,
  token: string,
  decision: "changed" | "unchanged",
) {
  const payload = parseAdminCardMarketPriceCheckToken(token, `sealed:${id}`);
  await db.$transaction(async (tx) => {
    const product = await tx.sealedProduct.findUnique({ where: { id } });
    if (!product)
      throw new AdminCardMarketPriceCheckError(
        "Sealed product not found.",
        404,
      );
    // Keeping the saved price must not fabricate a new price observation.
    if (decision === "unchanged") return;
    const euPrice = payload.sealedEuPriceEur;
    if (
      euPrice != null &&
      (!Number.isFinite(euPrice) || euPrice < payload.priceEur)
    ) {
      throw new AdminCardMarketPriceCheckError(
        "Invalid EU market observation. Run the check again.",
      );
    }
    await tx.sealedProduct.update({
      where: { id },
      data: {
        cm_lowest: payload.priceEur,
        ...(euPrice != null ? { cm_lowest_eu: euPrice } : {}),
      },
    });
    await tx.sealedPriceSnapshot.create({
      data: {
        ...buildSealedCardMarketSnapshotData({
          productId: id,
          episodeId: product.episode_id,
          priceEur: payload.priceEur,
          observedAt: new Date(payload.observedAt),
        }),
        cm_lowest_eu: euPrice ?? null,
      },
    });
  });
}
