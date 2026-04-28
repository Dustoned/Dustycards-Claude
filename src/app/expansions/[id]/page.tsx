import nextDynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  HeaderAction,
  HeaderMetricChip,
  HeaderProgressMeter,
  HeaderStackedProgressMeter,
  PageHeroHeader,
} from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import {
  buildEpisodeSealedSetPriceHistory,
  buildEpisodeSetPriceHistory,
} from "@/lib/price-history";
import { buildPullRateInfoFromRarity } from "@/lib/pull-rates";
import { getCachedImageUrl } from "@/lib/image-cache";
import { normalizeRarityLabel } from "@/lib/rarity";
import {
  getActiveSealedGroup,
  getActiveSealedProducts,
  getGroupedSealedProducts,
  getSealedProductPrice,
  resolveSealedFilter,
} from "@/lib/sealed-products";
import { getSealedPriceSnapshotsByEpisode } from "@/lib/sealed-price-snapshots";
import type { NormalizedSealedProduct } from "@/lib/tcggo";
import type { CardData } from "@/types/card-data";
import ExpansionCardsSection from "./ExpansionCardsSection";
import PullRateHoverTable from "./PullRateHoverTable";
import SealedProductsGrid from "./SealedProductsGrid";
import SyncEpisodeButton from "./SyncEpisodeButton";

export const dynamic = "force-dynamic";

const PriceHistoryPanel = nextDynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-48 rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

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

function formatReleaseLabel(value: string | null): string | null {
  if (!value) return null;

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return raw || null;

  const year = match[1];
  const month = match[2];
  if (!month) return year;

  const parsedMonth = Number(month);
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return year;

  const monthLabel = new Intl.DateTimeFormat("nl-NL", {
    month: "short",
  }).format(new Date(Date.UTC(Number(year), parsedMonth - 1, 1)));

  return `${monthLabel} ${year}`;
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

  const pullRateProfile = episode.code
    ? await db.setPullRateProfile.findFirst({
      where: {
        source: "collectrics",
        set_code: episode.code.toUpperCase(),
        rarity_buckets: { gt: 0 },
      },
        include: {
          rarities: true,
        },
      })
    : null;
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
  let headerProgressLabel = "Card Pricing";
  let headerProgressValue = `0 / ${episode._count.cards}`;
  let headerProgressPercent = 0;
  let headerHistoryProgressValue: string | null = null;
  let headerHistoryProgressPercent = 0;
  let headerValueLabel = "Set Value";
  let headerCountLabel = "Cards";
  let headerCountValue = episode._count.cards;
  if (activeTab === "cards") {
    const [rawSetPriceSnapshots, dbCards] = await Promise.all([
      db.$queryRaw<
        Array<{
          card_id: string;
          fetched_at: Date | string;
          cm_en_lowest_nm: number | null;
          cm_de_lowest_nm: number | null;
          cm_fr_lowest_nm: number | null;
          cm_es_lowest_nm: number | null;
          cm_it_lowest_nm: number | null;
        }>
      >`
        SELECT
          card_id,
          fetched_at,
          cm_en_lowest_nm,
          cm_de_lowest_nm,
          cm_fr_lowest_nm,
          cm_es_lowest_nm,
          cm_it_lowest_nm
        FROM (
          SELECT
            p.card_id,
            p.fetched_at,
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm,
            ROW_NUMBER() OVER (
              PARTITION BY p.card_id, DATE(p.fetched_at)
              ORDER BY p.fetched_at DESC, p.id DESC
            ) AS row_num
          FROM "Price" p
          INNER JOIN "Card" c ON c.id = p.card_id
          WHERE c.episode_id = ${id}
        )
        WHERE row_num = 1
        ORDER BY fetched_at ASC, card_id ASC
      `,
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
      fetched_at: new Date(snapshot.fetched_at).toISOString(),
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
    headerProgressLabel = "Card Pricing";
    headerProgressValue = `${latestSetPricePoint?.priced_cards ?? 0} / ${episode._count.cards}`;
    headerProgressPercent =
      episode._count.cards > 0
        ? ((latestSetPricePoint?.priced_cards ?? 0) / episode._count.cards) * 100
        : 0;
    const historySyncedCards = dbCards.reduce(
      (total, card) => total + (card.native_history_status === "synced" ? 1 : 0),
      0
    );
    headerHistoryProgressValue = `${historySyncedCards}/${episode._count.cards}`;
    headerHistoryProgressPercent =
      episode._count.cards > 0 ? (historySyncedCards / episode._count.cards) * 100 : 0;
    headerValueLabel = "Set Value";
    headerCountLabel = "Cards";
    headerCountValue = episode._count.cards;
    const pullRateByRarity = new Map(
      (pullRateProfile?.rarities ?? []).map((rarity) => [
        rarity.normalized_rarity,
        buildPullRateInfoFromRarity({
          source: rarity.source,
          setCode: rarity.set_code,
          normalizedRarity: rarity.normalized_rarity,
          rarityName: rarity.rarity_name,
          pullRateOdds: rarity.pull_rate_odds,
          pullRateDenominator: rarity.pull_rate_denominator,
          specificPullDenominator: rarity.specific_pull_denominator,
          psaAvgGemPct: rarity.psa_avg_gem_pct,
        }),
      ])
    );

    cards = dbCards.map((card) => {
      const price = card.prices[0] ?? null;
      const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
      const pullRateInfo = normalizedRarity ? pullRateByRarity.get(normalizedRarity) : null;

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
        pull_rate_info: pullRateInfo
          ? {
              source: pullRateInfo.source,
              rarity_name: pullRateInfo.rarityName,
              pull_rate_odds: pullRateInfo.pullRateOdds,
              specific_pull_odds: pullRateInfo.specificPullOdds,
              pull_rate_weight: pullRateInfo.pullRateWeight,
              psa_avg_gem_pct: pullRateInfo.psaAvgGemPct,
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
    headerProgressLabel =
      activeSealedFilter === "all"
        ? "Sealed Pricing"
        : `${activeSealedGroup?.label ?? "Sealed"} Pricing`;
    headerProgressValue = `${currentSealedTotals.priced} / ${filteredSealedProducts.length}`;
    headerProgressPercent =
      filteredSealedProducts.length > 0
        ? (currentSealedTotals.priced / filteredSealedProducts.length) * 100
        : 0;
    headerValueLabel =
      activeSealedFilter === "all"
        ? "Sealed Value"
        : `${activeSealedGroup?.label ?? "Sealed"} Value`;
    headerCountLabel = "Products";
    headerCountValue = filteredSealedProducts.length;
  }

  const expansionContext = [episode.series, episode.code].filter(Boolean).join(" / ");
  const releaseLabel = formatReleaseLabel(episode.release_date);
  const headerCountFormatted = headerCountValue.toLocaleString("nl-NL");
  const sealedCountFormatted = episode._count.sealedProducts.toLocaleString("nl-NL");

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/expansions"
        prefetch={false}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to expansions
      </Link>

      <PageHeroHeader
        className="mb-8"
        style={{ overflow: "visible" }}
        eyebrow="Expansion"
        title={episode.name}
        gridClassName="xl:grid-cols-[minmax(0,1.2fr)_minmax(28rem,0.8fr)] xl:items-stretch 2xl:grid-cols-[minmax(0,1.24fr)_minmax(28rem,0.76fr)]"
        leadingVisual={
          <div className="flex h-[var(--ui-binder-header-logo-size)] w-[var(--ui-binder-header-logo-size)] shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-black/8 bg-white/80 p-[var(--ui-binder-header-logo-padding)] text-center text-[length:var(--ui-section-header-title-size)] font-bold text-gray-500 shadow-sm shadow-black/10 dark:border-white/10 dark:bg-white/8 dark:text-white/70">
            {episode.logo_url ? (
              <div className="relative h-full w-full">
                <Image
                  src={getCachedImageUrl(episode.logo_url) ?? episode.logo_url}
                  alt={episode.name}
                  fill
                  className="object-contain drop-shadow"
                  priority
                  unoptimized
                />
              </div>
            ) : (
              <span className="leading-none tracking-tight">{episode.code ?? "SET"}</span>
            )}
          </div>
        }
        description={
          <div className="space-y-5">
            <p className="text-[length:var(--ui-page-header-description-size)] font-medium text-gray-600 dark:text-white/62">
              {expansionContext || "Expansion"}
            </p>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(13.5rem,0.82fr)_minmax(20rem,1.18fr)]">
              {headerHistoryProgressValue ? (
                <HeaderStackedProgressMeter
                  label={headerProgressLabel}
                  value={headerProgressValue}
                  percent={headerProgressPercent}
                  secondaryLabel="History Prices"
                  secondaryValue={headerHistoryProgressValue}
                  secondaryPercent={headerHistoryProgressPercent}
                  secondaryAccentColor="#38bdf8"
                  className="sm:!min-w-0 sm:!w-full"
                />
              ) : (
                <HeaderProgressMeter
                  label={headerProgressLabel}
                  value={headerProgressValue}
                  percent={headerProgressPercent}
                  className="sm:!min-w-0 sm:!w-full"
                />
              )}
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HeaderMetricChip
                  label={headerValueLabel}
                  value={formatCollectionCurrency(pricePanelCurrentValue)}
                  tone="emerald"
                  className="!min-w-0"
                />
                <HeaderMetricChip
                  label={headerCountLabel}
                  value={headerCountFormatted}
                  tone="sky"
                  className="!min-w-0"
                />
                {hasSealed && activeTab !== "sealed" ? (
                  <Link
                    href={`/expansions/${id}?tab=sealed`}
                    prefetch={false}
                    className="group min-w-0 rounded-[var(--ui-binder-metric-radius)] no-underline outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-violet-300/45"
                    aria-label={`Open sealed products for ${episode.name}`}
                  >
                    <HeaderMetricChip
                      label="Sealed"
                      value={sealedCountFormatted}
                      tone="violet"
                      className="h-full w-full !min-w-0 transition-colors group-hover:border-violet-300/35 group-hover:bg-violet-400/[0.12]"
                    />
                  </Link>
                ) : null}
                {releaseLabel ? (
                  <HeaderMetricChip
                    label="Released"
                    value={releaseLabel}
                    tone="slate"
                    className="!min-w-0"
                  />
                ) : null}
                {pullRateProfile ? (
                  <PullRateHoverTable
                    profile={pullRateProfile}
                    className="sm:col-span-2 xl:col-span-2"
                  />
                ) : null}
              </div>
            </div>
          </div>
        }
        titleActions={
          <HeaderAction>
            <SyncEpisodeButton episodeId={id} />
          </HeaderAction>
        }
        accessory={
          <PriceHistoryPanel
            title={pricePanelTitle}
            currency="EUR"
            points={pricePanelPoints}
            currentValue={pricePanelCurrentValue}
            subtitle={pricePanelSubtitle}
            emptyText={pricePanelEmptyText}
          />
        }
        sideClassName="[&>section]:h-full"
      />

      <div className="mb-6 inline-flex rounded-[calc(var(--ui-segment-radius)+0.25rem)] border border-black/8 bg-black/3 p-[var(--ui-segment-shell-padding)] dark:border-white/8 dark:bg-white/5">
        <Link
          href={`/expansions/${id}`}
          prefetch={false}
          className={`rounded-[var(--ui-segment-radius)] px-[var(--ui-segment-x)] py-[var(--ui-segment-y)] text-[length:var(--ui-segment-font-size)] font-semibold leading-none transition-colors ${
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
            prefetch={false}
            className={`rounded-[var(--ui-segment-radius)] px-[var(--ui-segment-x)] py-[var(--ui-segment-y)] text-[length:var(--ui-segment-font-size)] font-semibold leading-none transition-colors ${
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
            showPriceHistory={false}
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
