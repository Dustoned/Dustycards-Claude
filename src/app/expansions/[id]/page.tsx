import CachedImage from "@/components/CachedImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, CalendarClock, Coins, Layers, Package, Radar } from "lucide-react";
import {
  HeaderAction,
  HeaderStatCard,
  PageHeroHeader,
} from "@/components/PageHeader";
import BackNavigationLink from "@/components/BackNavigationLink";
import { db } from "@/lib/db";
import { getEpisodeSetPriceSnapshotRows } from "@/lib/episode-set-prices";
import { isHiddenExpansion } from "@/lib/episodes";
import {
  getGameFromScopedId,
  getGameLabel,
  POKEMON_GAME,
  type TradingCardGame,
} from "@/lib/games";
import {
  buildEpisodeSealedSetPriceHistory,
  buildEpisodeSetPriceHistory,
} from "@/lib/price-history";
import { PREFERRED_PULL_RATE_SOURCES, buildPullRateInfoFromRarity } from "@/lib/pull-rates";

import { normalizeRarityLabel } from "@/lib/rarity";
import {
  getActiveSealedGroup,
  getActiveSealedProducts,
  getGroupedSealedProducts,
  getSealedProductPrice,
  resolveSealedFilter,
} from "@/lib/sealed-products";
import { getSealedPriceSnapshotsByEpisode } from "@/lib/sealed-price-snapshots";
import { requirePageUser } from "@/lib/page-auth";
import { formatReleaseLabel, isFutureReleaseDate } from "@/lib/release-dates";
import { getDisplayCardNumber } from "@/lib/card-number-display";
import type { NormalizedSealedProduct } from "@/lib/tcggo";
import type { CardData } from "@/types/card-data";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import ExpansionCardsSection from "./ExpansionCardsSection";
import PullRateHoverTable from "./PullRateHoverTable";
import SealedProductsGrid from "./SealedProductsGrid";
import SyncEpisodeButton from "./SyncEpisodeButton";

export const dynamic = "force-dynamic";

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
}, game: TradingCardGame = POKEMON_GAME): NormalizedSealedProduct {
  return {
    id: product.id,
    game,
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

function getKnownEpisodeCardCount(episode: {
  card_count: number | null;
  source_actual_card_count: number | null;
  _count: { cards: number };
}): number {
  return Math.max(
    episode._count.cards,
    episode.card_count ?? 0,
    episode.source_actual_card_count ?? 0
  );
}

interface CurrentEpisodePriceRow {
  card_id: string;
  cm_fetched_at: Date | string | null;
  tcp_fetched_at: Date | string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
  tcp_market: number | null;
  tcp_mid: number | null;
  tcp_low: number | null;
}

interface CurrentEpisodePrice {
  fetchedAt: Date | null;
  price: NonNullable<CardData["price"]>;
}

async function getCurrentEpisodePrices(
  episodeId: string
): Promise<Map<string, CurrentEpisodePrice>> {
  // CardMarket and TCGPlayer observations are independent. Ranking the two
  // sources separately prevents a newer single-source row from hiding the
  // other source's last valid current quote.
  const rows = await db.$queryRaw<CurrentEpisodePriceRow[]>`
    WITH episode_cards AS (
      SELECT id
      FROM "Card"
      WHERE episode_id = ${episodeId}
    ),
    latest_cm AS (
      SELECT
        p.*,
        ROW_NUMBER() OVER (
          PARTITION BY p.card_id
          ORDER BY p.fetched_at DESC, p.id DESC
        ) AS row_num
      FROM "Price" p
      JOIN episode_cards c ON c.id = p.card_id
      WHERE p.cm_en_lowest_nm > 0
        AND p.cm_en_lowest_nm <> 9001
    ),
    latest_tcp AS (
      SELECT
        p.*,
        ROW_NUMBER() OVER (
          PARTITION BY p.card_id
          ORDER BY p.fetched_at DESC, p.id DESC
        ) AS row_num
      FROM "Price" p
      JOIN episode_cards c ON c.id = p.card_id
      WHERE p.tcp_market > 0
        AND p.tcp_market <> 9001
    ),
    latest_aux AS (
      SELECT
        p.*,
        ROW_NUMBER() OVER (
          PARTITION BY p.card_id
          ORDER BY p.fetched_at DESC, p.id DESC
        ) AS row_num
      FROM "Price" p
      JOIN episode_cards c ON c.id = p.card_id
      WHERE (p.cm_de_lowest_nm > 0 AND p.cm_de_lowest_nm <> 9001)
         OR (p.cm_fr_lowest_nm > 0 AND p.cm_fr_lowest_nm <> 9001)
         OR (p.cm_es_lowest_nm > 0 AND p.cm_es_lowest_nm <> 9001)
         OR (p.cm_it_lowest_nm > 0 AND p.cm_it_lowest_nm <> 9001)
         OR (p.cm_jp_lowest_nm > 0 AND p.cm_jp_lowest_nm <> 9001)
         OR (p.cm_en_avg_7d > 0 AND p.cm_en_avg_7d <> 9001)
         OR (p.cm_en_avg_30d > 0 AND p.cm_en_avg_30d <> 9001)
    )
    SELECT
      c.id AS card_id,
      cm.fetched_at AS cm_fetched_at,
      tcp.fetched_at AS tcp_fetched_at,
      cm.cm_en_lowest_nm,
      aux.cm_de_lowest_nm,
      aux.cm_fr_lowest_nm,
      aux.cm_es_lowest_nm,
      aux.cm_it_lowest_nm,
      aux.cm_jp_lowest_nm,
      aux.cm_en_avg_7d,
      aux.cm_en_avg_30d,
      tcp.tcp_market,
      tcp.tcp_mid,
      tcp.tcp_low
    FROM episode_cards c
    LEFT JOIN latest_cm cm ON cm.card_id = c.id AND cm.row_num = 1
    LEFT JOIN latest_aux aux ON aux.card_id = c.id AND aux.row_num = 1
    LEFT JOIN latest_tcp tcp ON tcp.card_id = c.id AND tcp.row_num = 1
    WHERE cm.card_id IS NOT NULL OR aux.card_id IS NOT NULL OR tcp.card_id IS NOT NULL
  `;

  return new Map(
    rows.map((row) => [
      row.card_id,
      {
        // CardData exposes one timestamp and defaults to CardMarket, so never
        // let a newer TCP-only observation make an older CM quote look fresh.
        fetchedAt: row.cm_fetched_at
          ? new Date(row.cm_fetched_at)
          : row.tcp_fetched_at
            ? new Date(row.tcp_fetched_at)
            : null,
        price: {
          cm_en_lowest_nm: row.cm_en_lowest_nm,
          cm_de_lowest_nm: row.cm_de_lowest_nm,
          cm_fr_lowest_nm: row.cm_fr_lowest_nm,
          cm_es_lowest_nm: row.cm_es_lowest_nm,
          cm_it_lowest_nm: row.cm_it_lowest_nm,
          cm_jp_lowest_nm: row.cm_jp_lowest_nm,
          cm_en_avg_7d: row.cm_en_avg_7d,
          cm_en_avg_30d: row.cm_en_avg_30d,
          tcp_market: row.tcp_market,
          tcp_mid: row.tcp_mid,
          tcp_low: row.tcp_low,
        },
      },
    ])
  );
}

export default async function ExpansionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sealed?: string; card?: string }>;
}) {
  const { id } = await params;
  const episodeGame = getGameFromScopedId(id);
  const { tab, sealed, card: initialCardId } = await searchParams;
  const requestedTab = tab === "sealed" ? "sealed" : "cards";
  const nextParams = new URLSearchParams();
  if (tab) nextParams.set("tab", tab);
  if (sealed) nextParams.set("sealed", sealed);
  if (initialCardId) nextParams.set("card", initialCardId);
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/expansions/${id}${nextQuery ? `?${nextQuery}` : ""}`);

  const episode = await db.episode.findFirst({
    where: { id, game: episodeGame },
    include: {
      _count: {
        select: { cards: true, sealedProducts: true },
      },
    },
  });

  if (!episode || isHiddenExpansion({ id: episode.id, code: episode.code, name: episode.name })) {
    notFound();
  }

  const releaseLabel = formatReleaseLabel(episode.release_date);
  const releaseDetailLabel =
    formatReleaseLabel(episode.release_date, { includeDay: true }) ?? releaseLabel;
  const isUpcomingRelease = isFutureReleaseDate(episode.release_date);
  const localCardCount = episode._count.cards;
  const knownCardCount = getKnownEpisodeCardCount(episode);
  const cardCountDenominator = localCardCount > 0 ? localCardCount : knownCardCount;
  const isCardListEmpty = localCardCount === 0;
  const isUpcomingEmptySet = isUpcomingRelease && isCardListEmpty;
  const hasKnownUpcomingCardCount = isUpcomingEmptySet && knownCardCount > 0;
  const isReleasedEmptySetWithKnownCount =
    !isUpcomingRelease && isCardListEmpty && knownCardCount > 0;

  const pullRateProfiles = episode.code
    ? await db.setPullRateProfile.findMany({
        where: {
          source: { in: [...PREFERRED_PULL_RATE_SOURCES] },
          set_code: episode.code.toUpperCase(),
          rarity_buckets: { gt: 0 },
        },
        include: {
          rarities: true,
        },
      })
    : [];
  const pullRateProfile =
    pullRateProfiles.sort(
      (a, b) =>
        PREFERRED_PULL_RATE_SOURCES.indexOf(a.source as (typeof PREFERRED_PULL_RATE_SOURCES)[number]) -
        PREFERRED_PULL_RATE_SOURCES.indexOf(b.source as (typeof PREFERRED_PULL_RATE_SOURCES)[number])
    )[0] ?? null;
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

      sealedProducts = localSealedProducts.map((product) =>
        toNormalizedSealedProduct(product, episodeGame)
      );
    }
  }

  const hasSealed = hasLocalSealedProducts || sealedProducts.length > 0;
  const activeTab = requestedTab === "sealed" && hasSealed ? "sealed" : "cards";

  let cards: CardData[] = [];
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
  let pricePanelSubtitle = `0/${cardCountDenominator} cards priced`;
  let pricePanelEmptyText = "No set prices available yet";
  let headerProgressLabel = "Card Pricing";
  let headerProgressValue = `0 / ${cardCountDenominator}`;
  let headerProgressPercent = 0;
  let headerHistoryProgressValue: string | null = null;
  let headerCountLabel = "Cards";
  let headerCountValue = cardCountDenominator;
  if (activeTab === "cards") {
    const [rawSetPriceSnapshots, dbCards, currentPriceByCardId] = await Promise.all([
      getEpisodeSetPriceSnapshotRows(id),
      db.card.findMany({
        where: { episode_id: id },
        orderBy: [{ card_number: "asc" }, { name: "asc" }],
        include: {
          wants: {
            where: { user_id: user.id },
            take: 1,
            select: {
              id: true,
              created_at: true,
            },
          },
        },
      }),
      getCurrentEpisodePrices(id),
    ]);

    const setPriceHistory = buildEpisodeSetPriceHistory(rawSetPriceSnapshots);
    const latestSetPricePoint = setPriceHistory[setPriceHistory.length - 1] ?? null;

    pricePanelPoints = setPriceHistory.map((point) => ({
      date: point.date,
      label: point.label,
      value: point.total_market,
    }));
    pricePanelCurrentValue = latestSetPricePoint?.total_market ?? null;
    pricePanelSubtitle = latestSetPricePoint
      ? `${latestSetPricePoint.priced_cards}/${cardCountDenominator} cards priced`
      : `0/${cardCountDenominator} cards priced`;
    headerProgressLabel = "Card Pricing";
    headerProgressValue = `${latestSetPricePoint?.priced_cards ?? 0} / ${cardCountDenominator}`;
    headerProgressPercent =
      cardCountDenominator > 0
        ? ((latestSetPricePoint?.priced_cards ?? 0) / cardCountDenominator) * 100
        : 0;
    const historySyncedCards = dbCards.reduce(
      (total, card) => total + (card.native_history_status === "synced" ? 1 : 0),
      0
    );
    headerHistoryProgressValue = `${historySyncedCards}/${cardCountDenominator}`;
    headerCountLabel = "Cards";
    headerCountValue = cardCountDenominator;
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
      const currentPrice = currentPriceByCardId.get(card.id) ?? null;
      const wantItem = card.wants[0] ?? null;
      const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
      const pullRateInfo = normalizedRarity ? pullRateByRarity.get(normalizedRarity) : null;

      return {
        id: card.id,
        game: episodeGame,
        name: card.name,
        card_number: getDisplayCardNumber(card),
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
        price_fetched_at: currentPrice?.fetchedAt?.toISOString() ?? null,
        price: currentPrice?.price ?? null,
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
        want_item: wantItem
          ? {
              id: wantItem.id,
              created_at: wantItem.created_at.toISOString(),
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
    pricePanelEmptyText = "No sealed prices available yet";
    headerProgressLabel =
      activeSealedFilter === "all"
        ? "Sealed Pricing"
        : `${activeSealedGroup?.label ?? "Sealed"} Pricing`;
    headerProgressValue = `${currentSealedTotals.priced} / ${filteredSealedProducts.length}`;
    headerProgressPercent =
      filteredSealedProducts.length > 0
        ? (currentSealedTotals.priced / filteredSealedProducts.length) * 100
        : 0;
    headerCountLabel = "Products";
    headerCountValue = filteredSealedProducts.length;
  }

  if (activeTab === "cards" && isUpcomingEmptySet) {
    pricePanelSubtitle = hasKnownUpcomingCardCount
      ? `${knownCardCount.toLocaleString("en-US")} cards expected`
      : "Cards arrive after release";
    pricePanelEmptyText = hasKnownUpcomingCardCount
      ? "Card prices will appear after release, once the card list and prices are synced"
      : "Card prices will appear once the set is released and synced";
    headerProgressLabel = "Release Status";
    headerProgressValue = releaseDetailLabel ? `Releases ${releaseDetailLabel}` : "Upcoming set";
    headerProgressPercent = 0;
    headerHistoryProgressValue = null;
    headerCountLabel = hasKnownUpcomingCardCount ? "Expected Cards" : "Cards";
    headerCountValue = hasKnownUpcomingCardCount ? knownCardCount : 0;
  } else if (activeTab === "cards" && isReleasedEmptySetWithKnownCount) {
    pricePanelSubtitle = `${knownCardCount.toLocaleString("en-US")} cards known, none loaded`;
    pricePanelEmptyText = "Run Sync this set to import the card list and prices";
    headerProgressLabel = "Card Sync";
    headerProgressValue = `0 / ${knownCardCount.toLocaleString("en-US")}`;
    headerProgressPercent = 0;
    headerHistoryProgressValue = null;
    headerCountLabel = "Known Cards";
    headerCountValue = knownCardCount;
  }

  const expansionContext = [episode.series, episode.code].filter(Boolean).join(" / ");
  const headerCountFormatted = headerCountValue.toLocaleString("en-US");
  const sealedCountFormatted = episode._count.sealedProducts.toLocaleString("en-US");
  const releaseMetricLabel = isUpcomingRelease ? "Releases" : "Released";
  const expansionHeaderDescription = [
    expansionContext || "Expansion",
    releaseDetailLabel ? `${releaseMetricLabel} ${releaseDetailLabel}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const headerPricingHint = [
    `${Math.round(headerProgressPercent)}% priced`,
    headerHistoryProgressValue ? `History ${headerHistoryProgressValue}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const emptyCardsTitle = isUpcomingEmptySet
    ? hasKnownUpcomingCardCount
      ? "Card list not available yet"
      : "This set is not released yet"
    : "No cards loaded yet";
  const emptyCardsText = isUpcomingEmptySet
    ? hasKnownUpcomingCardCount
      ? `${episode.name} has ${knownCardCount.toLocaleString(
          "en-US"
        )} cards expected${
          releaseDetailLabel ? ` and releases ${releaseDetailLabel}` : ""
        }. Cards will appear here after the official release and the next sync.`
      : `${episode.name} ${
          releaseDetailLabel ? `releases ${releaseDetailLabel}` : "is still upcoming"
        }. Cards will appear here after the official release and the next sync.`
    : isReleasedEmptySetWithKnownCount
      ? `${episode.name} has ${knownCardCount.toLocaleString(
          "en-US"
        )} cards in the set metadata, but none are imported locally yet. Run Sync this set to load them.`
      : "Use refresh to fetch this set.";
  const rarityCountMap = new Map<string, number>();
  for (const card of cards) {
    const rarity = normalizeRarityLabel(card.rarity) ?? "Unknown";
    rarityCountMap.set(rarity, (rarityCountMap.get(rarity) ?? 0) + 1);
  }
  const rarityCounts = [...rarityCountMap].map(([name, count]) => ({ name, count }));

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <PageHeroHeader
        className="mb-5 sm:mb-6"
        style={{ overflow: "visible" }}
        title={episode.name}
        description={expansionHeaderDescription}
        gridClassName="xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch"
        backLinks={
          <BackNavigationLink
            href={
              episodeGame === POKEMON_GAME
                ? "/expansions"
                : "/expansions?game=pokemon-jp"
            }
            className="hidden items-center gap-2 font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white sm:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {getGameLabel(episodeGame)} sets
          </BackNavigationLink>
        }
        leadingVisual={
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-white/10 bg-white/[0.06] p-2 text-center text-sm font-bold text-white/70 shadow-sm shadow-black/20 sm:flex lg:h-16 lg:w-16">
            {episode.logo_url ? (
              <div className="relative h-full w-full">
                <CachedImage
                  sourceUrl={episode.logo_url}
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
        titleActions={
          <HeaderAction className="hidden sm:flex">
            <SyncEpisodeButton episodeId={id} />
          </HeaderAction>
        }
        accessory={
          <PriceHistoryPanel
            layout="dashboard"
            title={pricePanelTitle}
            currency="EUR"
            points={pricePanelPoints}
            currentValue={pricePanelCurrentValue}
            subtitle={pricePanelSubtitle}
            emptyText={pricePanelEmptyText}
          />
        }
        sideContent={
          <>
            <HeaderStatCard
              label={headerProgressLabel}
              value={headerProgressValue}
              hint={headerPricingHint}
              Icon={Coins}
              tone="emerald"
            />
            <HeaderStatCard
              label={headerCountLabel}
              value={headerCountFormatted}
              Icon={Layers}
              tone="sky"
            />
            {hasSealed && activeTab !== "sealed" ? (
              <Link
                href={`/expansions/${id}?tab=sealed`}
                prefetch={false}
                className="group h-full min-w-0 rounded-[var(--ui-header-stat-radius)] no-underline outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-violet-300/45"
                aria-label={`Open sealed products for ${episode.name}`}
              >
                <HeaderStatCard
                  label="Sealed"
                  value={sealedCountFormatted}
                  Icon={Package}
                  tone="violet"
                />
              </Link>
            ) : null}
            {episode._count.cards > 0 &&
            !isUpcomingEmptySet &&
            episodeGame === POKEMON_GAME ? (
              <Link
                href={`/movers/signal-radar?game=pokemon&set=${encodeURIComponent(id)}#new-release-chases`}
                prefetch={false}
                className="group h-full min-w-0 rounded-[var(--ui-header-stat-radius)] no-underline outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-violet-300/45"
                aria-label={`Open chase radar for ${episode.name}`}
              >
                <HeaderStatCard
                  label="Chase Radar"
                  value="Set read"
                  hint="What Radar thinks"
                  Icon={Radar}
                  tone="violet"
                />
              </Link>
            ) : null}
            {pullRateProfile ? (
              <PullRateHoverTable profile={pullRateProfile} />
            ) : releaseLabel ? (
              <HeaderStatCard
                label={releaseMetricLabel}
                value={releaseLabel}
                Icon={isUpcomingRelease ? CalendarClock : Calendar}
                tone="slate"
              />
            ) : null}
            {/* Filler slot: only when the release date is not already shown
                above (the pull-rate table took that slot) and the grid has
                room because the sealed tile is hidden. */}
            {pullRateProfile && (!hasSealed || activeTab === "sealed") && releaseLabel ? (
              <HeaderStatCard
                label={releaseMetricLabel}
                value={releaseLabel}
                Icon={isUpcomingRelease ? CalendarClock : Calendar}
                tone="slate"
              />
            ) : null}
          </>
        }
        sideClassName="grid min-w-0 auto-rows-fr grid-cols-2 gap-2 sm:gap-3 xl:grid-rows-2 xl:gap-3"
      />

      <div className="mb-4 inline-flex rounded-[calc(var(--ui-segment-radius)+0.25rem)] border border-white/8 bg-white/[0.045] p-[var(--ui-segment-shell-padding)]">
        <Link
          href={`/expansions/${id}`}
          prefetch={false}
          className={`rounded-[var(--ui-segment-radius)] border border-transparent px-[var(--ui-segment-x)] py-[var(--ui-segment-y)] text-[length:var(--ui-segment-font-size)] font-semibold leading-none transition-colors ${
            activeTab === "cards"
              ? "border-violet-400/40 bg-violet-600 text-white"
              : "text-white/55 hover:bg-white/[0.07] hover:text-white"
          }`}
        >
          Cards
        </Link>
        {hasSealed && (
          <Link
            href={`/expansions/${id}?tab=sealed`}
            prefetch={false}
            className={`rounded-[var(--ui-segment-radius)] border border-transparent px-[var(--ui-segment-x)] py-[var(--ui-segment-y)] text-[length:var(--ui-segment-font-size)] font-semibold leading-none transition-colors ${
              activeTab === "sealed"
                ? "border-violet-400/40 bg-violet-600 text-white"
                : "text-white/55 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            Sealed
          </Link>
        )}
      </div>

      {activeTab === "cards" ? (
        cards.length === 0 ? (
          <div
            className={`glass rounded-3xl p-8 text-center shadow-md shadow-black/5 sm:p-12 ${
              isUpcomingEmptySet
                ? "border-sky-300/20 bg-sky-400/[0.045] dark:border-sky-300/16 dark:bg-sky-300/[0.055]"
                : ""
            }`}
          >
            {isUpcomingEmptySet ? (
              <div className="mb-3 inline-flex items-center rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">
                {hasKnownUpcomingCardCount
                  ? `${knownCardCount.toLocaleString("en-US")} expected cards`
                  : "Upcoming set"}
              </div>
            ) : isReleasedEmptySetWithKnownCount ? (
              <div className="mb-3 inline-flex items-center rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                Sync needed
              </div>
            ) : null}
            <p className="mb-1 font-semibold text-gray-800 dark:text-white">{emptyCardsTitle}</p>
            <p className="mx-auto max-w-lg text-sm leading-6 text-gray-500 dark:text-white/52">
              {emptyCardsText}
            </p>
          </div>
        ) : (
          <ExpansionCardsSection
            key={`${episode.id}:${initialCardId ?? "list"}`}
            cards={cards}
            totalCards={episode._count.cards}
            episode={{ id: episode.id, name: episode.name, code: episode.code }}
            showPriceHistory={false}
            initialCardId={initialCardId ?? null}
            rarityDistribution={pullRateProfile ? {
              expansionName: episode.name,
              rarityCounts,
              profile: pullRateProfile,
            } : null}
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
