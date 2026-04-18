import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import {
  fetchSealedAvailabilityForEpisode,
  fetchSealedProductsForEpisode,
} from "@/lib/tcggo";
import ExpansionView, { type CardData } from "./ExpansionView";
import SealedProductsGrid from "./SealedProductsGrid";
import SyncEpisodeButton from "./SyncEpisodeButton";

export const dynamic = "force-dynamic";

const getCachedSealedAvailability = unstable_cache(
  async (episodeId: string) => fetchSealedAvailabilityForEpisode(episodeId),
  ["episode-sealed-availability"],
  { revalidate: 3600 }
);

const getCachedSealedProducts = unstable_cache(
  async (episodeId: string) => fetchSealedProductsForEpisode(episodeId),
  ["episode-sealed-products"],
  { revalidate: 3600 }
);

export default async function ExpansionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const requestedTab = tab === "sealed" ? "sealed" : "cards";

  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      _count: {
        select: { cards: true },
      },
    },
  });

  if (!episode) notFound();

  const hasSealed = await getCachedSealedAvailability(id);
  const activeTab = requestedTab === "sealed" && hasSealed ? "sealed" : "cards";

  let cards: CardData[] = [];
  if (activeTab === "cards") {
    const dbCards = await db.card.findMany({
      where: { episode_id: id },
      orderBy: [{ card_number: "asc" }, { name: "asc" }],
      include: {
        prices: {
          orderBy: { fetched_at: "desc" },
          take: 1,
        },
      },
    });

    cards = dbCards.map((card) => {
      const price = card.prices[0] ?? null;

      return {
        id: card.id,
        name: card.name,
        card_number: card.card_number,
        rarity: card.rarity,
        hp: card.hp,
        image_url: card.image_url,
        supertype: card.supertype,
        subtypes: card.subtypes,
        artist: card.artist,
        cardmarket_id: card.cardmarket_id,
        cardmarket_url: card.cardmarket_url,
        tcggo_url: card.tcggo_url,
        price_source_status: card.price_source_status,
        price_source_checked_at: card.price_source_checked_at
          ? card.price_source_checked_at.toISOString()
          : null,
        price_fetched_at: price ? price.fetched_at.toISOString() : null,
        price: price
          ? {
              cm_en_lowest_nm: price.cm_en_lowest_nm,
              cm_de_lowest_nm: price.cm_de_lowest_nm,
              cm_fr_lowest_nm: price.cm_fr_lowest_nm,
              cm_es_lowest_nm: price.cm_es_lowest_nm,
              cm_it_lowest_nm: price.cm_it_lowest_nm,
              tcp_market: price.tcp_market,
              tcp_mid: price.tcp_mid,
              tcp_low: price.tcp_low,
              cm_en_avg_7d: price.cm_en_avg_7d,
              cm_en_avg_30d: price.cm_en_avg_30d,
            }
          : null,
      };
    });
  }

  const sealedProducts = activeTab === "sealed" ? await getCachedSealedProducts(id) : [];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/expansions"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to expansions
      </Link>

      <div className="glass mb-8 flex flex-col gap-6 rounded-3xl px-6 py-6 shadow-lg shadow-black/5 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {episode.logo_url && (
            <div className="relative h-16 w-36 shrink-0">
              <Image
                src={episode.logo_url}
                alt={episode.name}
                fill
                className="object-contain drop-shadow"
                priority
                unoptimized
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {episode.name}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-500 dark:text-white/50">
              {episode.code && (
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                  {episode.code}
                </span>
              )}
              {episode.release_date && (
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                  {episode.release_date}
                </span>
              )}
              {episode.series && (
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                  {episode.series}
                </span>
              )}
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                {episode._count.cards} cards
              </span>
            </div>
          </div>

          <SyncEpisodeButton episodeId={id} />
        </div>
      </div>

      <div className="mb-6 inline-flex rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
        <Link
          href={`/expansions/${id}`}
          prefetch
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "cards"
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
          }`}
        >
          Cards
        </Link>
        {hasSealed && (
          <Link
            href={`/expansions/${id}?tab=sealed`}
            prefetch
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "sealed"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
            }`}
          >
            Sealed
          </Link>
        )}
      </div>

      {activeTab === "cards" ? (
        cards.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
            <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">No cards loaded yet</p>
            <p className="text-sm text-gray-400">Use refresh to fetch this set.</p>
          </div>
        ) : (
          <ExpansionView cards={cards} />
        )
      ) : (
        <SealedProductsGrid products={sealedProducts} />
      )}
    </div>
  );
}
