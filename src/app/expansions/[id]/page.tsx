import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, CalendarClock, Coins, Layers, Package } from "lucide-react";
import {
  HeaderAction,
  HeaderStatCard,
  PageHeroHeader,
} from "@/components/PageHeader";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import { POKEMON_GAME } from "@/lib/games";
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
}): NormalizedSealedProduct {
  return {
    id: product.id,
    game: POKEMON_GAME,
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
  const nextParams = new URLSearchParams();
  if (tab) nextParams.set("tab", tab);
  if (sealed) nextParams.set("sealed", sealed);
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/expansions/${id}${nextQuery ? `?${nextQuery}` : ""}`);

  const episode = await db.episode.findFirst({
    where: { id, game: POKEMON_GAME },
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
    cm_jp_lowest_nm?: number | null;
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
  let pricePanelSubtitle = `0/${cardCountDenominator} cards priced`;
  let pricePanelEmptyText = "No set prices available yet";
  let headerProgressLabel = "Card Pricing";
  let headerProgressValue = `0 / ${cardCountDenominator}`;
  let headerProgressPercent = 0;
  let headerHistoryProgressValue: string | null = null;
  let headerCountLabel = "Cards";
  let headerCountValue = cardCountDenominator;
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
          cm_jp_lowest_nm: number | null;
        }>
      >`
        SELECT
          card_id,
          fetched_at,
          cm_en_lowest_nm,
          cm_de_lowest_nm,
          cm_fr_lowest_nm,
          cm_es_lowest_nm,
          cm_it_lowest_nm,
          cm_jp_lowest_nm
        FROM (
          SELECT
            p.card_id,
            p.fetched_at,
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm,
            p.cm_jp_lowest_nm,
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
          wants: {
            where: { user_id: user.id },
            take: 1,
            select: {
              id: true,
              created_at: true,
            },
          },
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
      const price = card.prices[0] ?? null;
      const wantItem = card.wants[0] ?? null;
      const normalizedRarity = normalizeRarityLabel(card.rarity) ?? card.rarity;
      const pullRateInfo = normalizedRarity ? pullRateByRarity.get(normalizedRarity) : null;

      return {
        id: card.id,
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
        price_fetched_at: price ? price.fetched_at.toISOString() : null,
        price: price
          ? {
              cm_en_lowest_nm: price.cm_en_lowest_nm,
              cm_de_lowest_nm: price.cm_de_lowest_nm,
              cm_fr_lowest_nm: price.cm_fr_lowest_nm,
              cm_es_lowest_nm: price.cm_es_lowest_nm,
              cm_it_lowest_nm: price.cm_it_lowest_nm,
              cm_jp_lowest_nm: price.cm_jp_lowest_nm,
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

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <PageHeroHeader
        className="mb-5 sm:mb-6"
        style={{ overflow: "visible" }}
        title={episode.name}
        description={expansionHeaderDescription}
        gridClassName="xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch"
        backLinks={
          <Link
            href="/expansions"
            prefetch={false}
            className="hidden items-center gap-2 font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white sm:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to expansions
          </Link>
        }
        leadingVisual={
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-white/10 bg-white/[0.06] p-2 text-center text-sm font-bold text-white/70 shadow-sm shadow-black/20 sm:flex lg:h-16 lg:w-16">
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
            {(!pullRateProfile || !hasSealed || activeTab === "sealed") && releaseLabel ? (
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
