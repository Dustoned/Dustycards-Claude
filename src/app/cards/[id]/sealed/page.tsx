import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Gift, Package } from "lucide-react";
import { db } from "@/lib/db";
import CachedImage from "@/components/CachedImage";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { ONE_PIECE_GAME } from "@/lib/games";
import type { CardSealedProductItem } from "@/lib/card-sealed-products";
import CardSealedProductsBrowser from "./CardSealedProductsBrowser";
import { isPromoExpansion } from "@/lib/episodes";

export const dynamic = "force-dynamic";

export default async function CardSealedProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/cards/${encodeURIComponent(id)}/sealed`);
  const settings = await getServerUserSettings(user.id);
  const card = await db.card.findUnique({
    where: { id },
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      rarity: true,
      image_url: true,
      episode: { select: { id: true, name: true, code: true } },
    },
  });

  if (!card || (card.game === ONE_PIECE_GAME && !settings.onePieceLibraryEnabled)) notFound();
  const isPromoCard = isPromoExpansion(card.episode);

  const products = await db.sealedProduct.findMany({
    where: {
      game: card.game,
      ...(isPromoCard
        ? { includedCards: { some: { card_id: card.id } } }
        : {
            OR: [
              { episode_id: card.episode.id },
              { contentSets: { some: { episode_id: card.episode.id } } },
              { includedCards: { some: { card_id: card.id } } },
            ],
          }),
    },
    orderBy: [{ release_date: "desc" }, { cm_lowest: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      image_url: true,
      tcggo_url: true,
      cardmarket_url: true,
      cardmarket_id: true,
      release_date: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      cm_avg_7d: true,
      cm_avg_30d: true,
      episode_id: true,
      episode: { select: { id: true, name: true, code: true } },
      contentSets: {
        where: { episode_id: card.episode.id },
        select: { episode_id: true },
      },
      includedCards: {
        where: { card_id: card.id },
        take: 1,
        select: {
          relation_type: true,
          source_name: true,
          source_url: true,
          confidence: true,
        },
      },
      _count: { select: { contentSets: true } },
    },
  });

  const items: CardSealedProductItem[] = products.map((product) => {
    const includedCard = product.includedCards[0] ?? null;
    const matchType = includedCard
      ? "included_promo"
      : product._count.contentSets > 1 || product.episode_id !== card.episode.id
        ? "mixed_pack"
        : "set_product";

    return {
      id: product.id,
      name: product.name,
      imageUrl: product.image_url,
      tcggoUrl: product.tcggo_url,
      cardmarketUrl: product.cardmarket_url,
      cardmarketId: product.cardmarket_id,
      releaseDate: product.release_date?.toISOString() ?? null,
      matchType,
      relationSourceName: includedCard?.source_name ?? null,
      relationSourceUrl: includedCard?.source_url ?? null,
      relationConfidence: includedCard?.confidence ?? null,
      price: {
        cm_lowest: product.cm_lowest,
        cm_lowest_eu: product.cm_lowest_eu,
        cm_lowest_de: product.cm_lowest_de,
        cm_lowest_fr: product.cm_lowest_fr,
        cm_lowest_es: product.cm_lowest_es,
        cm_lowest_it: product.cm_lowest_it,
        cm_avg_7d: product.cm_avg_7d,
        cm_avg_30d: product.cm_avg_30d,
      },
      episode: product.episode,
    };
  });
  const setProductCount = items.filter((item) => item.matchType === "set_product").length;
  const mixedPackCount = items.filter((item) => item.matchType === "mixed_pack").length;
  const promoCount = items.filter((item) => item.matchType === "included_promo").length;

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <Link
        href="/"
        className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-white/8 bg-white/[0.025] px-3 text-xs font-bold text-white/52 transition-colors hover:border-white/16 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to collection
      </Link>

      <header className="binder-panel rounded-[var(--ui-page-header-radius)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 sm:h-32 sm:w-24">
              {card.image_url ? (
                <CachedImage
                  sourceUrl={card.image_url}
                  alt={card.name}
                  fill
                  sizes="96px"
                  className="object-contain"
                  loading="eager"
                  fetchPriority="high"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/58">
                Find in sealed
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
                {card.name}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/42">
                {[card.episode.code ?? card.episode.name, card.card_number, card.rarity]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/46">
                Every verified product where this card can be pulled or is included directly.
                Mixed products may also contain boosters from other sets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:w-[25rem]">
            {[
              { label: "Set", value: setProductCount, Icon: Package, tone: "text-violet-200" },
              { label: "Mixed", value: mixedPackCount, Icon: Boxes, tone: "text-amber-200" },
              { label: "Promos", value: promoCount, Icon: Gift, tone: "text-sky-200" },
            ].map(({ label, value, Icon, tone }) => (
              <div key={label} className="rounded-xl border border-white/8 bg-black/16 p-3">
                <Icon className={`h-4 w-4 ${tone}`} />
                <p className="mt-3 text-xl font-black tabular-nums text-white">{value}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/34">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-3 space-y-3">
        <CardSealedProductsBrowser products={items} />
      </div>
    </div>
  );
}
