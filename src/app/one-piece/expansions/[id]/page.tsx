import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  HeaderMetricChip,
  HeaderProgressMeter,
  PageHeroHeader,
} from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { db } from "@/lib/db";
import { ONE_PIECE_GAME } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import { requirePageUser } from "@/lib/page-auth";
import { buildEpisodeSetPriceHistory } from "@/lib/price-history";
import { formatReleaseLabel, isFutureReleaseDate } from "@/lib/release-dates";
import { getServerUserSettings } from "@/lib/user-settings-server";
import type { CardData } from "@/types/card-data";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import ExpansionCardsSection from "@/app/expansions/[id]/ExpansionCardsSection";

export const dynamic = "force-dynamic";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const user = await requirePageUser(`/one-piece/expansions/${rawId}`);
  const settings = await getServerUserSettings(user.id);
  if (!settings.onePieceLibraryEnabled) {
    notFound();
  }

  const episode = await db.episode.findFirst({
    where: { id, game: ONE_PIECE_GAME },
    include: {
      _count: {
        select: { cards: true },
      },
    },
  });

  if (!episode) {
    notFound();
  }

  const cardCountDenominator =
    episode._count.cards > 0 ? episode._count.cards : getKnownEpisodeCardCount(episode);
  const releaseLabel = formatReleaseLabel(episode.release_date);
  const releaseDetailLabel =
    formatReleaseLabel(episode.release_date, { includeDay: true }) ?? releaseLabel;
  const isUpcomingRelease = isFutureReleaseDate(episode.release_date);

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
      where: { episode_id: id, game: ONE_PIECE_GAME },
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
      episode_id: episode.id,
      episode_name: episode.name,
      episode_code: episode.code,
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
      pull_rate_info: null,
    };
  });
  const setContext = [episode.series, episode.code].filter(Boolean).join(" / ");
  const releaseMetricLabel = isUpcomingRelease ? "Releases" : "Released";

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/one-piece/expansions"
        prefetch={false}
        className="mb-4 hidden items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white sm:inline-flex"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to One Piece expansions
      </Link>

      <PageHeroHeader
        className="mb-5 sm:mb-8"
        style={{ overflow: "visible" }}
        eyebrow="One Piece Expansion"
        title={episode.name}
        gridClassName="xl:grid-cols-[minmax(0,1.2fr)_minmax(28rem,0.8fr)] xl:items-stretch 2xl:grid-cols-[minmax(0,1.24fr)_minmax(28rem,0.76fr)]"
        leadingVisual={
          <div className="hidden h-[var(--ui-binder-header-logo-size)] w-[var(--ui-binder-header-logo-size)] shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-black/8 bg-white/80 p-[var(--ui-binder-header-logo-padding)] text-center text-[length:var(--ui-section-header-title-size)] font-bold text-gray-500 shadow-sm shadow-black/10 dark:border-white/10 dark:bg-white/8 dark:text-white/70 sm:flex">
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
        description={
          <div className="space-y-3 sm:space-y-5">
            <p className="text-[length:var(--ui-page-header-description-size)] font-medium text-gray-600 dark:text-white/62">
              {setContext || "One Piece set"}
            </p>
            <div className="grid items-start gap-2.5 sm:gap-3 lg:grid-cols-[minmax(13.5rem,0.82fr)_minmax(20rem,1.18fr)]">
              <div className="hidden sm:block">
                <HeaderProgressMeter
                  label="Card Pricing"
                  value={headerProgressValue}
                  percent={headerProgressPercent}
                  className="sm:!min-w-0 sm:!w-full"
                />
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
                <HeaderMetricChip
                  label="Set Value"
                  value={formatCollectionCurrency(pricePanelCurrentValue)}
                  tone="emerald"
                  className="!min-w-0"
                />
                <HeaderMetricChip
                  label="Cards"
                  value={cardCountDenominator.toLocaleString("en-US")}
                  tone="sky"
                  className="!min-w-0"
                />
                {releaseLabel ? (
                  <HeaderMetricChip
                    label={releaseMetricLabel}
                    value={releaseDetailLabel ?? releaseLabel}
                    tone="slate"
                    className="!min-w-0"
                  />
                ) : null}
              </div>
            </div>
          </div>
        }
        accessory={
          <PriceHistoryPanel
            title="Set Total"
            currency="EUR"
            points={pricePanelPoints}
            currentValue={pricePanelCurrentValue}
            subtitle={pricePanelSubtitle}
            emptyText="No set prices available yet"
          />
        }
        sideClassName="max-sm:hidden [&>section]:h-full"
      />

      {cards.length === 0 ? (
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
          priceSnapshots={rawSetPriceSnapshots.map((snapshot) => ({
            ...snapshot,
            fetched_at: new Date(snapshot.fetched_at).toISOString(),
          }))}
          showPriceHistory={false}
        />
      )}
    </div>
  );
}
