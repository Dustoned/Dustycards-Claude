import { notFound } from "next/navigation";
import SignalRadarDetailClient from "@/app/movers/signal-radar/[cardId]/SignalRadarDetailClient";
import type { ModalCardData } from "@/components/card-modal/types";
import { getCardDetailPayload } from "@/lib/card-detail-data";
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
import { ALL_GAMES, POKEMON_GAME, normalizeTradingCardGame } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export default async function SignalRadarCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ game?: string; fromSet?: string }>;
}) {
  const { cardId } = await params;
  const { game: requestedGame, fromSet } = await searchParams;
  const requestedQuery = new URLSearchParams();
  if (requestedGame) requestedQuery.set("game", requestedGame);
  if (fromSet) requestedQuery.set("fromSet", fromSet);
  const requestedPath = `/movers/signal-radar/${encodeURIComponent(cardId)}${
    requestedQuery.size ? `?${requestedQuery.toString()}` : ""
  }`;
  const user = await requirePageUser(requestedPath);
  const settings = await getServerUserSettings(user.id);
  const activeGame = settings.onePieceLibraryEnabled ? ALL_GAMES : POKEMON_GAME;
  const [liveData, persistedData, card] = await Promise.all([
    getExternalSignalRadarData(activeGame),
    getPersistedExternalSignalRadarData(activeGame),
    getCardDetailPayload(cardId, user.id),
  ]);

  if (!card) notFound();
  const game = normalizeTradingCardGame(card.game);
  const detailCard: ModalCardData = { ...card, game };

  const data = await enrichExternalSignalRadarData(
    mergeExternalSignalRadarWithFallback(liveData, persistedData, activeGame)
  );
  const initialResearch = await getCachedExternalCardResearch({
    cardId: card.id,
    game,
    name: card.name,
    cardNumber: card.card_number,
    episodeName: card.episode_name,
    episodeCode: card.episode_code,
    artist: card.artist,
    rarity: card.rarity,
  });

  let signal = data.signals.find((candidate) => candidate.cardId === cardId);
  if (!signal) {
    signal = await buildOnDemandExternalCardSignal({
      id: card.id,
      game,
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.card_number,
      episodeName: card.episode_name,
      episodeCode: card.episode_code,
      rarity: card.rarity,
      currentPrice: card.price?.cm_en_lowest_nm ?? null,
    });
  }
  if (!signal) notFound();

  const rawHistory = card.price_history.map((point) => ({
    date: point.date,
    label: point.label,
    value: point.cm_market_en,
  }));
  const gradedLabel = signal.marketIntelligence?.graded.label ?? null;
  const gradedCurrency = signal.marketIntelligence?.graded.currency ?? "EUR";
  const normalizedGradedLabel = gradedLabel?.replace(/\s+/g, " ").trim().toLowerCase() ?? null;
  const ebayGradedSeries = normalizedGradedLabel
    ? (card.ebay_sold_graded_price_history ?? []).find(
        (series) =>
          series.label.toLowerCase() === normalizedGradedLabel &&
          series.currency === gradedCurrency
      ) ?? null
    : null;
  const cardMarketGradedSeries =
    normalizedGradedLabel && gradedCurrency === "EUR"
      ? (card.graded_price_history ?? []).find(
          (series) => series.label.toLowerCase() === normalizedGradedLabel
        ) ?? null
      : null;

  return (
    <div className="min-h-[calc(100dvh-var(--ui-header-height))] w-full bg-[#050508]">
      <SignalRadarDetailClient
        signal={signal}
        card={detailCard}
        priceHistory={{
          raw: rawHistory,
          rawCurrency: "EUR",
          graded: ebayGradedSeries?.points ?? cardMarketGradedSeries?.points ?? [],
          gradedCurrency,
          gradedLabel,
          modelDate: data.generatedAt,
        }}
        initialResearch={initialResearch}
        detailSize={settings.modalSize}
        backSetId={fromSet?.trim() || null}
      />
    </div>
  );
}
