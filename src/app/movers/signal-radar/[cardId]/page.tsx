import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radar, Sparkles } from "lucide-react";
import SignalRadarDetailClient from "@/app/movers/signal-radar/[cardId]/SignalRadarDetailClient";
import {
  getLatestSafeEnglishNmPrice,
  loadSafeCardMarketHistoryRows,
} from "@/lib/card-market-history";
import { db } from "@/lib/db";
import { getCachedExternalCardResearch } from "@/lib/external-card-research";
import {
  buildOnDemandExternalCardSignal,
  enrichExternalSignalRadarData,
} from "@/lib/external-signal-intelligence";
import {
  getPersistedExternalSignalRadarData,
  mergeExternalSignalRadarWithFallback,
} from "@/lib/external-signal-persisted";
import { getExternalSignalRadarData } from "@/lib/external-signal-radar";
import {
  ALL_GAMES,
  normalizeTradingCardGame,
  ONE_PIECE_GAME,
  POKEMON_GAME,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import {
  buildCardEbaySoldGradedPriceHistory,
  buildCardGradedPriceHistory,
  buildCardPriceHistory,
} from "@/lib/price-history";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export default async function SignalRadarCardPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const requestedPath = `/movers/signal-radar/${encodeURIComponent(cardId)}`;
  const user = await requirePageUser(requestedPath);
  const settings = await getServerUserSettings(user.id);
  const activeGame = settings.onePieceLibraryEnabled ? ALL_GAMES : POKEMON_GAME;
  const [
    liveData,
    persistedData,
    cardBasics,
    ebayGradedHistoryRows,
    cardMarketGradedHistoryRows,
  ] = await Promise.all([
    getExternalSignalRadarData(activeGame),
    getPersistedExternalSignalRadarData(activeGame),
    db.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        game: true,
        episode_id: true,
        name: true,
        image_url: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        hp: true,
        supertype: true,
        subtypes: true,
        artist: true,
        cardmarket_id: true,
        cardmarket_url: true,
        episode: {
          select: { id: true, name: true, code: true, series: true, release_date: true },
        },
      },
    }),
    db.cardEbaySoldGradedPriceSnapshot.findMany({
      where: { card_id: cardId },
      orderBy: [{ fetched_at: "asc" }, { id: "asc" }],
      select: {
        fetched_at: true,
        label: true,
        median_price: true,
        currency: true,
        sample_size: true,
      },
    }),
    db.cardGradedPriceSnapshot.findMany({
      where: { card_id: cardId },
      orderBy: [{ fetched_at: "asc" }, { id: "asc" }],
      select: {
        fetched_at: true,
        label: true,
        price: true,
      },
    }),
  ]);
  if (!cardBasics) notFound();
  if (cardBasics.game === ONE_PIECE_GAME && !settings.onePieceLibraryEnabled) notFound();
  const rawHistoryRows =
    (
      await loadSafeCardMarketHistoryRows([
        {
          id: cardBasics.id,
          game: cardBasics.game,
          episodeId: cardBasics.episode_id,
          name: cardBasics.name,
          cardNumber: cardBasics.card_number,
          printedCardNumber: cardBasics.printed_card_number,
          cardmarketId: cardBasics.cardmarket_id,
          cardmarketUrl: cardBasics.cardmarket_url,
        },
      ])
    ).get(cardBasics.id) ?? [];
  const latestRawPrice = getLatestSafeEnglishNmPrice(rawHistoryRows);
  const data = await enrichExternalSignalRadarData(
    mergeExternalSignalRadarWithFallback(liveData, persistedData, activeGame)
  );
  const game = normalizeTradingCardGame(cardBasics.game);
  const initialResearch = await getCachedExternalCardResearch({
    cardId: cardBasics.id,
    game,
    name: cardBasics.name,
    cardNumber: cardBasics.printed_card_number ?? cardBasics.card_number,
    episodeName: cardBasics.episode.name,
    episodeCode: cardBasics.episode.code,
    artist: cardBasics.artist,
    rarity: cardBasics.rarity,
  });
  let signal = data.signals.find((candidate) => candidate.cardId === cardId);
  if (!signal) {
    signal = await buildOnDemandExternalCardSignal({
      id: cardBasics.id,
      game,
      name: cardBasics.name,
      imageUrl: cardBasics.image_url,
      cardNumber: cardBasics.printed_card_number ?? cardBasics.card_number,
      episodeName: cardBasics.episode.name,
      episodeCode: cardBasics.episode.code,
      rarity: cardBasics.rarity,
      currentPrice: latestRawPrice?.value ?? null,
    });
  }
  if (!signal) notFound();

  const rawHistory = buildCardPriceHistory(rawHistoryRows).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.cm_market_en,
  }));
  const gradedLabel = signal.marketIntelligence?.graded.label ?? null;
  const gradedCurrency = signal.marketIntelligence?.graded.currency ?? "EUR";
  const normalizedGradedLabel = gradedLabel?.replace(/\s+/g, " ").trim().toLowerCase() ?? null;
  const ebayGradedSeries = normalizedGradedLabel
    ? buildCardEbaySoldGradedPriceHistory(ebayGradedHistoryRows).find(
        (series) =>
          series.label.toLowerCase() === normalizedGradedLabel &&
          series.currency === gradedCurrency
      ) ?? null
    : null;
  const cardMarketGradedSeries =
    normalizedGradedLabel && gradedCurrency === "EUR"
      ? buildCardGradedPriceHistory(cardMarketGradedHistoryRows).find(
          (series) => series.label.toLowerCase() === normalizedGradedLabel
        ) ?? null
      : null;
  const gradedHistory = ebayGradedSeries?.points ?? cardMarketGradedSeries?.points ?? [];
  const displayCardBasics = {
    ...cardBasics,
    prices: latestRawPrice
      ? [
          {
            cm_en_lowest_nm: latestRawPrice.row.cm_en_lowest_nm,
            cm_de_lowest_nm: latestRawPrice.row.cm_de_lowest_nm,
            cm_fr_lowest_nm: latestRawPrice.row.cm_fr_lowest_nm,
            cm_es_lowest_nm: latestRawPrice.row.cm_es_lowest_nm,
            cm_it_lowest_nm: latestRawPrice.row.cm_it_lowest_nm,
            cm_jp_lowest_nm: latestRawPrice.row.cm_jp_lowest_nm,
          },
        ]
      : [],
  };

  const confluence = signal.marketIntelligence?.confluence;
  return (
    <div className="page-container mx-auto max-w-[112rem] px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:mb-4">
        <Link
          href={`/movers/signal-radar?game=${signal.game}`}
          className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-transparent px-1.5 pr-3 text-sm font-semibold text-white/58 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-white"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] transition group-hover:border-white/18 group-hover:bg-white/[0.08]">
            <ArrowLeft className="h-4 w-4" />
          </span>
          Back to Signal Radar
        </Link>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/14 bg-violet-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-violet-100/72">
            <Radar className="h-3.5 w-3.5" /> {signal.manualResearch || signal.rank <= 0 ? "Research profile" : `#${signal.rank} radar candidate`}
          </span>
          {confluence ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-300/14 bg-fuchsia-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-fuchsia-100/72">
              <Sparkles className="h-3.5 w-3.5" /> {confluence.label} · {confluence.score}/100
            </span>
          ) : null}
        </div>
      </div>
      <SignalRadarDetailClient
        signal={signal}
        cardBasics={displayCardBasics}
        priceHistory={{
          raw: rawHistory,
          rawCurrency: "EUR",
          graded: gradedHistory,
          gradedCurrency,
          gradedLabel,
          modelDate: data.generatedAt,
        }}
        initialResearch={initialResearch}
      />
    </div>
  );
}
