import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, CalendarClock, Coins, Layers, Package } from "lucide-react";
import {
  HeaderStatCard,
  PageHeroHeader,
} from "@/components/PageHeader";
import BackNavigationLink from "@/components/BackNavigationLink";
import { formatCollectionCurrency } from "@/lib/collection";
import { db } from "@/lib/db";
import { getEpisodeSetPriceSnapshotRows } from "@/lib/episode-set-prices";
import { loadExpansionSealedProducts } from "@/lib/expansion-sealed-products";
import { ONE_PIECE_GAME } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import { requirePageUser } from "@/lib/page-auth";
import { buildEpisodeSetPriceHistory } from "@/lib/price-history";
import { formatReleaseLabel, isFutureReleaseDate } from "@/lib/release-dates";
import { getGroupedSealedProducts, resolveSealedFilter } from "@/lib/sealed-products";
import { getServerUserSettings } from "@/lib/user-settings-server";
import type { NormalizedSealedProduct } from "@/lib/tcggo";
import type { CardData } from "@/types/card-data";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import ExpansionCardsSection from "@/app/expansions/[id]/ExpansionCardsSection";
import SealedProductsGrid from "@/app/expansions/[id]/SealedProductsGrid";

export const dynamic = "force-dynamic";

const ONE_PIECE_CURRENT_PRICE_FIELDS = [
  "cm_en_lowest_nm",
  "cm_de_lowest_nm",
  "cm_fr_lowest_nm",
  "cm_es_lowest_nm",
  "cm_it_lowest_nm",
  "cm_en_avg_7d",
  "cm_en_avg_30d",
  "tcp_market",
  "tcp_mid",
  "tcp_low",
] as const;

type OnePieceCurrentPriceField = (typeof ONE_PIECE_CURRENT_PRICE_FIELDS)[number];
type OnePieceCurrentPriceRow = {
  card_id: string;
  cm_fetched_at: Date | string | null;
  aux_fetched_at: Date | string | null;
  tcp_fetched_at: Date | string | null;
} & Record<OnePieceCurrentPriceField, number | null>;

type OnePieceCurrentPrice = {
  fetchedAt: Date | null;
  price: NonNullable<CardData["price"]>;
};

function latestOnePiecePriceFieldSql(field: OnePieceCurrentPriceField): string {
  return `(
    SELECT p."${field}"
    FROM "Price" p
    WHERE p.card_id = cards.id
      AND p."${field}" > 0
      AND p."${field}" <> 9001
    ORDER BY p.fetched_at DESC, p.id DESC
    LIMIT 1
  ) AS "${field}"`;
}

function latestOnePiecePriceTimestampSql(field: OnePieceCurrentPriceField, alias: string) {
  return `(
    SELECT p.fetched_at
    FROM "Price" p
    WHERE p.card_id = cards.id
      AND p."${field}" > 0
      AND p."${field}" <> 9001
    ORDER BY p.fetched_at DESC, p.id DESC
    LIMIT 1
  ) AS "${alias}"`;
}

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function getCurrentOnePiecePrices(
  episodeId: string
): Promise<Map<string, OnePieceCurrentPrice>> {
  const rows = await db.$queryRawUnsafe<OnePieceCurrentPriceRow[]>(
    `
    WITH cards AS (
      SELECT id
      FROM "Card"
      WHERE episode_id = ?
        AND game = ?
    )
    SELECT
      cards.id AS card_id,
      ${latestOnePiecePriceTimestampSql("cm_en_lowest_nm", "cm_fetched_at")},
      (
        SELECT p.fetched_at
        FROM "Price" p
        WHERE p.card_id = cards.id
          AND (
            (p.cm_de_lowest_nm > 0 AND p.cm_de_lowest_nm <> 9001)
            OR (p.cm_fr_lowest_nm > 0 AND p.cm_fr_lowest_nm <> 9001)
            OR (p.cm_es_lowest_nm > 0 AND p.cm_es_lowest_nm <> 9001)
            OR (p.cm_it_lowest_nm > 0 AND p.cm_it_lowest_nm <> 9001)
            OR (p.cm_en_avg_7d > 0 AND p.cm_en_avg_7d <> 9001)
            OR (p.cm_en_avg_30d > 0 AND p.cm_en_avg_30d <> 9001)
          )
        ORDER BY p.fetched_at DESC, p.id DESC
        LIMIT 1
      ) AS aux_fetched_at,
      ${latestOnePiecePriceTimestampSql("tcp_market", "tcp_fetched_at")},
      ${ONE_PIECE_CURRENT_PRICE_FIELDS.map(latestOnePiecePriceFieldSql).join(",\n      ")}
    FROM cards
    `,
    episodeId,
    ONE_PIECE_GAME
  );

  const pricesByCardId = new Map<string, OnePieceCurrentPrice>();
  for (const row of rows) {
    const hasPrice = ONE_PIECE_CURRENT_PRICE_FIELDS.some((field) => row[field] != null);
    if (!hasPrice) continue;
    pricesByCardId.set(row.card_id, {
      // CardData exposes one timestamp and defaults to CM. Never let a newer
      // TCP-only observation make the older CM quote appear freshly checked.
      fetchedAt:
        toValidDate(row.cm_fetched_at) ??
        toValidDate(row.aux_fetched_at) ??
        toValidDate(row.tcp_fetched_at),
      price: {
        cm_en_lowest_nm: row.cm_en_lowest_nm,
        cm_de_lowest_nm: row.cm_de_lowest_nm,
        cm_fr_lowest_nm: row.cm_fr_lowest_nm,
        cm_es_lowest_nm: row.cm_es_lowest_nm,
        cm_it_lowest_nm: row.cm_it_lowest_nm,
        tcp_market: row.tcp_market,
        tcp_mid: row.tcp_mid,
        tcp_low: row.tcp_low,
        cm_en_avg_7d: row.cm_en_avg_7d,
        cm_en_avg_30d: row.cm_en_avg_30d,
      },
    });
  }
  return pricesByCardId;
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

export default async function OnePieceExpansionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sealed?: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const { tab, sealed } = await searchParams;
  const requestedTab = tab === "sealed" ? "sealed" : "cards";
  const user = await requirePageUser(
    `/one-piece/expansions/${rawId}${requestedTab === "sealed" ? "?tab=sealed" : ""}`
  );
  const settings = await getServerUserSettings(user.id);
  if (!settings.onePieceLibraryEnabled) {
    notFound();
  }

  const episode = await db.episode.findFirst({
    where: { id, game: ONE_PIECE_GAME },
    include: {
      _count: {
        select: { cards: true, sealedProducts: true },
      },
    },
  });

  if (!episode) {
    notFound();
  }

  // Sealed products arrive through the daily sealed sync and the
  // just-released check; the tab only appears once something is stored.
  const hasSealed = episode._count.sealedProducts > 0;
  const activeTab = requestedTab === "sealed" && hasSealed ? "sealed" : "cards";
  const sealedProducts: NormalizedSealedProduct[] =
    activeTab === "sealed" ? await loadExpansionSealedProducts(id, ONE_PIECE_GAME) : [];
  const activeSealedFilter =
    activeTab === "sealed"
      ? resolveSealedFilter(sealed, getGroupedSealedProducts(sealedProducts))
      : "all";
  const sealedCountFormatted = episode._count.sealedProducts.toLocaleString("en-US");

  const cardCountDenominator =
    episode._count.cards > 0 ? episode._count.cards : getKnownEpisodeCardCount(episode);
  const releaseLabel = formatReleaseLabel(episode.release_date);
  const releaseDetailLabel =
    formatReleaseLabel(episode.release_date, { includeDay: true }) ?? releaseLabel;
  const isUpcomingRelease = isFutureReleaseDate(episode.release_date);

  const [rawSetPriceSnapshots, dbCards, currentPricesByCardId] = await Promise.all([
    getEpisodeSetPriceSnapshotRows(id),
    db.card.findMany({
      where: { episode_id: id, game: ONE_PIECE_GAME },
      orderBy: [{ card_number: "asc" }, { name: "asc" }],
    }),
    getCurrentOnePiecePrices(id),
  ]);

  const setPriceHistory = buildEpisodeSetPriceHistory(rawSetPriceSnapshots);
  const latestSetPricePoint = setPriceHistory[setPriceHistory.length - 1] ?? null;
  const pricePanelPoints = setPriceHistory.map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  const pricePanelCurrentValue = latestSetPricePoint?.total_market ?? null;
  const pricePanelSubtitle = latestSetPricePoint
    ? `${latestSetPricePoint.priced_cards}/${cardCountDenominator} cards priced`
    : `0/${cardCountDenominator} cards priced`;
  const headerProgressValue = `${latestSetPricePoint?.priced_cards ?? 0} / ${cardCountDenominator}`;
  const headerProgressPercent =
    cardCountDenominator > 0
      ? ((latestSetPricePoint?.priced_cards ?? 0) / cardCountDenominator) * 100
      : 0;
  const cards: CardData[] = dbCards.map((card) => {
    const currentPrice = currentPricesByCardId.get(card.id) ?? null;

    return {
      id: card.id,
      game: ONE_PIECE_GAME,
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
      episode_id: episode.id,
      episode_name: episode.name,
      episode_code: episode.code,
      price_source_status: card.price_source_status,
      price_source_checked_at: card.price_source_checked_at
        ? card.price_source_checked_at.toISOString()
        : null,
      price_fetched_at: currentPrice?.fetchedAt?.toISOString() ?? null,
      price: currentPrice?.price ?? null,
      pull_rate_info: null,
    };
  });
  const setContext = [episode.series, episode.code].filter(Boolean).join(" / ");
  const releaseMetricLabel = isUpcomingRelease ? "Releases" : "Released";
  const expansionHeaderDescription = [
    setContext || "One Piece set",
    releaseDetailLabel ? `${releaseMetricLabel} ${releaseDetailLabel}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const headerPricingHint = `${Math.round(headerProgressPercent)}% priced`;

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
            href="/one-piece/expansions"
            className="hidden items-center gap-2 font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white sm:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to One Piece expansions
          </BackNavigationLink>
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
              <span className="leading-none tracking-tight">{episode.code ?? "OP"}</span>
            )}
          </div>
        }
        accessory={
          <PriceHistoryPanel
            layout="dashboard"
            title="Set Total"
            currency="EUR"
            points={pricePanelPoints}
            currentValue={pricePanelCurrentValue}
            subtitle={pricePanelSubtitle}
            emptyText="No set prices available yet"
          />
        }
        sideContent={
          <>
            <HeaderStatCard
              label="Card Pricing"
              value={headerProgressValue}
              hint={headerPricingHint}
              Icon={Coins}
              tone="emerald"
            />
            <HeaderStatCard
              label="Set Value"
              value={formatCollectionCurrency(pricePanelCurrentValue)}
              Icon={Coins}
              tone="violet"
            />
            <HeaderStatCard
              label="Cards"
              value={cardCountDenominator.toLocaleString("en-US")}
              Icon={Layers}
              tone="sky"
            />
            {hasSealed && activeTab !== "sealed" ? (
              <Link
                href={`/one-piece/expansions/${encodeURIComponent(id)}?tab=sealed`}
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
            ) : releaseLabel ? (
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

      {hasSealed ? (
        <div className="mb-4 inline-flex rounded-[calc(var(--ui-segment-radius)+0.25rem)] border border-white/8 bg-white/[0.045] p-[var(--ui-segment-shell-padding)]">
          <Link
            href={`/one-piece/expansions/${encodeURIComponent(id)}`}
            prefetch={false}
            className={`rounded-[var(--ui-segment-radius)] border border-transparent px-[var(--ui-segment-x)] py-[var(--ui-segment-y)] text-[length:var(--ui-segment-font-size)] font-semibold leading-none transition-colors ${
              activeTab === "cards"
                ? "border-violet-400/40 bg-violet-600 text-white"
                : "text-white/55 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            Cards
          </Link>
          <Link
            href={`/one-piece/expansions/${encodeURIComponent(id)}?tab=sealed`}
            prefetch={false}
            className={`rounded-[var(--ui-segment-radius)] border border-transparent px-[var(--ui-segment-x)] py-[var(--ui-segment-y)] text-[length:var(--ui-segment-font-size)] font-semibold leading-none transition-colors ${
              activeTab === "sealed"
                ? "border-violet-400/40 bg-violet-600 text-white"
                : "text-white/55 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            Sealed
          </Link>
        </div>
      ) : null}

      {activeTab === "sealed" ? (
        <SealedProductsGrid
          key={`${episode.id}:sealed`}
          products={sealedProducts}
          activeFilter={activeSealedFilter}
          episode={{ id: episode.id, name: episode.name, code: episode.code }}
        />
      ) : cards.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center shadow-md shadow-black/5 sm:p-12">
          <p className="mb-1 font-semibold text-gray-800 dark:text-white">No cards loaded yet</p>
          <p className="mx-auto max-w-lg text-sm leading-6 text-gray-500 dark:text-white/52">
            Run the local One Piece import script again to fetch this set from TCGGO.
          </p>
        </div>
      ) : (
        <ExpansionCardsSection
          key={episode.id}
          cards={cards}
          totalCards={episode._count.cards}
          episode={{ id: episode.id, name: episode.name, code: episode.code }}
          showPriceHistory={false}
        />
      )}
    </div>
  );
}
