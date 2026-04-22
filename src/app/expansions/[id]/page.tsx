import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import {
  buildEpisodeSealedSetPriceHistory,
  buildEpisodeSetPriceHistory,
} from "@/lib/price-history";
import {
  getActiveSealedGroup,
  getActiveSealedProducts,
  getGroupedSealedProducts,
  getSealedProductPrice,
  resolveSealedFilter,
} from "@/lib/sealed-products";
import { getSealedPriceSnapshotsByEpisode } from "@/lib/sealed-price-snapshots";
import {
  fetchSealedProductsForEpisode,
  type NormalizedSealedProduct,
} from "@/lib/tcggo";
import type { CardData } from "@/types/card-data";
import ExpansionCardsSection from "./ExpansionCardsSection";
import SealedProductsGrid from "./SealedProductsGrid";
import SyncEpisodeButton from "./SyncEpisodeButton";

export const dynamic = "force-dynamic";

const getCachedSealedProducts = unstable_cache(
  async (episodeId: string) => fetchSealedProductsForEpisode(episodeId),
  ["episode-sealed-products"],
  { revalidate: 3600 }
);

function isTcggoEpisodeId(value: string): boolean {
  return /^\d+$/.test(value);
}

function toNormalizedSealedProduct(product: {
  id: string;
  name: string;
  image_url: string | null;
  tcggo_url: string | null;
  cardmarket_url: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}): NormalizedSealedProduct {
  return {
    id: product.id,
    name: product.name,
    image_url: product.image_url,
    tcggo_url: product.tcggo_url,
    cardmarket_url: product.cardmarket_url,
    cardmarket_id: product.cardmarket_id,
    tcgplayer_id: product.tcgplayer_id,
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
  };
}

export default async function ExpansionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sealed?: string }>;
}) {
  const { id } = await params;
  const { tab, sealed } = await searchParams;
  const requestedTab = tab === "sealed" ? "sealed" : "cards";

  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      _count: {
        select: { cards: true, sealedProducts: true },
      },
    },
  });

  if (!episode || isHiddenExpansion({ id: episode.id, code: episode.code, name: episode.name })) {
    notFound();
  }

  const hasLocalSealedProducts = episode._count.sealedProducts > 0;
  let sealedProducts: NormalizedSealedProduct[] = [];

  if (requestedTab === "sealed") {
    if (hasLocalSealedProducts) {
      const localSealedProducts = await db.sealedProduct.findMany({
        where: { episode_id: id },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          image_url: true,
          tcggo_url: true,
          cardmarket_url: true,
          cardmarket_id: true,
          tcgplayer_id: true,
          cm_lowest: true,
          cm_lowest_eu: true,
          cm_lowest_de: true,
          cm_lowest_fr: true,
          cm_lowest_es: true,
          cm_lowest_it: true,
          cm_avg_7d: true,
          cm_avg_30d: true,
        },
      });

      sealedProducts = localSealedProducts.map(toNormalizedSealedProduct);
    } else if (isTcggoEpisodeId(id)) {
      sealedProducts = await getCachedSealedProducts(id).catch(() => []);
    }
  }

  const hasSealed = hasLocalSealedProducts || sealedProducts.length > 0;
  const activeTab = requestedTab === "sealed" && hasSealed ? "sealed" : "cards";

  let cards: CardData[] = [];
  let setPriceSnapshots: Array<{
    card_id: string;
    fetched_at: string;
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
  }> = [];
  const sealedGroups = activeTab === "sealed" ? getGroupedSealedProducts(sealedProducts) : [];
  const activeSealedFilter =
    activeTab === "sealed" ? resolveSealedFilter(sealed, sealedGroups) : "all";
  const activeSealedGroup =
    activeTab === "sealed" ? getActiveSealedGroup(sealedGroups, activeSealedFilter) : null;
  const filteredSealedProducts =
    activeTab === "sealed" ? getActiveSealedProducts(sealedGroups, activeSealedFilter) : [];
  let pricePanelTitle = "Set Total";
  let pricePanelPoints: Array<{ date: string; label: string; value: number | null }> = [];
  let pricePanelCurrentValue: number | null = null;
  let pricePanelSubtitle = `0/${episode._count.cards} cards priced`;
  let pricePanelEmptyText = "Nog geen setprijzen beschikbaar";
  if (activeTab === "cards") {
    const [rawSetPriceSnapshots, dbCards] = await Promise.all([
      db.price.findMany({
        where: { card: { episode_id: id } },
        orderBy: [{ fetched_at: "asc" }, { card_id: "asc" }],
        select: {
          card_id: true,
          fetched_at: true,
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
        },
      }),
      db.card.findMany({
        where: { episode_id: id },
        orderBy: [{ card_number: "asc" }, { name: "asc" }],
        include: {
          prices: {
            orderBy: { fetched_at: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const setPriceHistory = buildEpisodeSetPriceHistory(rawSetPriceSnapshots);
    const latestSetPricePoint = setPriceHistory[setPriceHistory.length - 1] ?? null;
    setPriceSnapshots = rawSetPriceSnapshots.map((snapshot) => ({
      ...snapshot,
      fetched_at: snapshot.fetched_at.toISOString(),
    }));

    pricePanelPoints = setPriceHistory.map((point) => ({
      date: point.date,
      label: point.label,
      value: point.total_market,
    }));
    pricePanelCurrentValue = latestSetPricePoint?.total_market ?? null;
    pricePanelSubtitle = latestSetPricePoint
      ? `${latestSetPricePoint.priced_cards}/${episode._count.cards} cards priced`
      : `0/${episode._count.cards} cards priced`;

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
  } else {
    const activeProductIds = new Set(filteredSealedProducts.map((product) => product.id));
    const sealedPriceHistory = buildEpisodeSealedSetPriceHistory(
      (await getSealedPriceSnapshotsByEpisode(id)).filter((snapshot) =>
        activeProductIds.has(snapshot.product_id)
      )
    );
    const currentSealedTotals = filteredSealedProducts.reduce(
      (acc, product) => {
        const value = getSealedProductPrice(product);
        if (value == null) return acc;

        acc.total += value;
        acc.priced += 1;
        return acc;
      },
      { total: 0, priced: 0 }
    );
    const currentSealedTotal =
      currentSealedTotals.priced > 0 ? Number(currentSealedTotals.total.toFixed(2)) : null;
    const latestSealedPricePoint = sealedPriceHistory[sealedPriceHistory.length - 1] ?? null;

    pricePanelTitle =
      activeSealedFilter === "all" ? "Sealed Total" : `${activeSealedGroup?.label ?? "Sealed"} Total`;
    pricePanelPoints = sealedPriceHistory.map((point) => ({
      date: point.date,
      label: point.label,
      value: point.total_market,
    }));
    if (pricePanelPoints.length === 0 && currentSealedTotal != null) {
      pricePanelPoints = [{ date: "current", label: "Nu", value: currentSealedTotal }];
    }
    pricePanelCurrentValue = currentSealedTotal ?? latestSealedPricePoint?.total_market ?? null;
    pricePanelSubtitle = `${currentSealedTotals.priced}/${filteredSealedProducts.length} sealed priced`;
    pricePanelEmptyText = "Nog geen sealed prijzen beschikbaar";
  }

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

        {activeTab === "sealed" && (
          <PriceHistoryPanel
            title={pricePanelTitle}
            currency="EUR"
            points={pricePanelPoints}
            currentValue={pricePanelCurrentValue}
            subtitle={pricePanelSubtitle}
            emptyText={pricePanelEmptyText}
          />
        )}
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
          <ExpansionCardsSection
            key={episode.id}
            cards={cards}
            totalCards={episode._count.cards}
            episode={{ id: episode.id, name: episode.name, code: episode.code }}
            priceSnapshots={setPriceSnapshots}
          />
        )
      ) : (
        <SealedProductsGrid
          key={episode.id}
          products={sealedProducts}
          activeFilter={activeSealedFilter}
          episode={{ id: episode.id, name: episode.name, code: episode.code }}
        />
      )}
    </div>
  );
}
