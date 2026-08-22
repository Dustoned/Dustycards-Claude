import { requirePageUser } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { getSealedOriginMarketPrice } from "@/lib/collection-sealed-origin";
import { inferSealedOpeningPackCount, isOpenableSealedProduct } from "@/lib/opening-sealed";
import OpeningSessionsClient, { type OpeningSessionView, type OwnedSealedChoice } from "./OpeningSessionsClient";

export const dynamic = "force-dynamic";

export default async function OpeningSessionsPage() {
  const user = await requirePageUser("/openings");
  const [owned, sessions] = await Promise.all([
    db.collectionSealed.findMany({
      where: { user_id: user.id, quantity: { gt: 0 } },
      orderBy: { updated_at: "desc" },
      include: {
        product: {
          select: {
            id: true,
            game: true,
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
          },
        },
      },
    }),
    db.sealedOpeningSession.findMany({
      where: { user_id: user.id },
      orderBy: { opened_at: "desc" },
      include: {
        sealedProduct: { select: { id: true, name: true, image_url: true } },
        cards: {
          orderBy: { added_at: "desc" },
          include: {
            card: {
              select: {
                id: true,
                name: true,
                card_number: true,
                image_url: true,
                prices: { orderBy: { fetched_at: "desc" }, take: 8, select: { cm_en_lowest_nm: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const setCodes = [...new Set(owned.map((item) => item.product.episode.code?.trim()).filter((code): code is string => Boolean(code)))];
  const profiles = setCodes.length
    ? await db.setPullRateProfile.findMany({
        where: { set_code: { in: setCodes } },
        orderBy: { updated_at: "desc" },
        select: { set_code: true, packs_per_booster_box: true },
      })
    : [];
  const packsBySetCode = new Map<string, number | null>();
  for (const profile of profiles) {
    const code = profile.set_code.trim().toLocaleLowerCase();
    if (!packsBySetCode.has(code)) packsBySetCode.set(code, profile.packs_per_booster_box);
  }

  const choices: OwnedSealedChoice[] = owned.filter((item) => isOpenableSealedProduct(item.product.name)).map((item) => ({
    id: item.id,
    productId: item.product_id,
    name: item.product.name,
    imageUrl: item.product.image_url,
    quantity: item.quantity,
    purchasePricePerItem: item.purchase_price_per_item,
    marketPrice: getSealedOriginMarketPrice(item.product),
    suggestedPacks: inferSealedOpeningPackCount(
      item.product.name,
      item.product.episode.code
        ? packsBySetCode.get(item.product.episode.code.trim().toLocaleLowerCase())
        : null,
      item.product.game
    ),
    episode: item.product.episode,
  }));
  const views: OpeningSessionView[] = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    status: session.status,
    openedAt: session.opened_at.toISOString(),
    packsOpened: session.packs_opened,
    cost: session.opened_cost_eur,
    product: { id: session.sealedProduct.id, name: session.sealedProduct.name, imageUrl: session.sealedProduct.image_url },
    cards: session.cards.map((copy) => ({
      collectionItemId: copy.id,
      id: copy.card.id,
      name: copy.card.name,
      cardNumber: copy.card.card_number,
      imageUrl: copy.card.image_url,
      value: copy.card.prices.find((price) => price.cm_en_lowest_nm != null)?.cm_en_lowest_nm ?? null,
    })),
  }));

  return <OpeningSessionsClient owned={choices} sessions={views} />;
}
