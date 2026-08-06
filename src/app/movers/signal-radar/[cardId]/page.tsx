import { notFound } from "next/navigation";
import SignalRadarDetailClient from "@/app/movers/signal-radar/[cardId]/SignalRadarDetailClient";
import type { ModalCardData } from "@/components/card-modal/types";
import { getCardDetailPayload } from "@/lib/card-detail-data";
import { getCachedExternalCardResearch } from "@/lib/external-card-research";
import { buildOnDemandExternalCardSignal } from "@/lib/external-signal-intelligence";
import { getExternalSignalRadarDetailContext } from "@/lib/external-signal-persisted";
import { normalizeTradingCardGame } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { readSignalRadarSnapshot } from "@/lib/signal-radar-snapshot-store";
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
  const [settings, card] = await Promise.all([
    getServerUserSettings(user.id),
    getCardDetailPayload(cardId, user.id),
  ]);

  if (!card) notFound();
  const game = normalizeTradingCardGame(card.game);
  const detailCard: ModalCardData = { ...card, game };

  // A detail request only needs intelligence for this card. Enriching the
  // complete Radar cohort here repeated the progressive feed's most expensive
  // work and made a single mobile card open wait on dozens of unrelated cards.
  // Read only this card's persisted rank/update time, then use the SWR-cached
  // single-card intelligence path. Materialising every persisted signal here
  // still cost an avoidable query/chunk pass on every detail navigation.
  const researchInput = {
    cardId: card.id,
    game,
    name: card.name,
    cardNumber: card.card_number,
    episodeName: card.episode_name,
    episodeCode: card.episode_code,
    artist: card.artist,
    rarity: card.rarity,
  } as const;
  const initialResearchPromise = getCachedExternalCardResearch(researchInput);
  // The background Radar job already persists the complete enriched signal.
  // Rebuilding that same market intelligence on the first detail visit ran
  // several cohort-wide queries and made some cold card pages take 4-5s.
  // Prefer the durable snapshot for ranked cards; retain the focused fallback
  // for direct links to cards that are not part of the current Radar cohort.
  const storedRadar = await readSignalRadarSnapshot(game);
  const storedSignal = storedRadar?.data.signals.find((item) => item.cardId === card.id) ?? null;
  const radarContextPromise = storedSignal
    ? Promise.resolve({
        generatedAt: storedRadar?.data.generatedAt ?? new Date().toISOString(),
        rank: storedSignal.rank,
        runId: null,
      })
    : getExternalSignalRadarDetailContext(card.id, game);
  const radarContext = await radarContextPromise;
  const focusedSignalPromise = storedSignal
    ? Promise.resolve(storedSignal)
    : buildOnDemandExternalCardSignal({
        id: card.id,
        game,
        name: card.name,
        imageUrl: card.image_url,
        cardNumber: card.card_number,
        episodeName: card.episode_name,
        episodeCode: card.episode_code,
        rarity: card.rarity,
        currentPrice: card.price?.cm_en_lowest_nm ?? null,
      }, {
        observationRunId: radarContext.runId,
      });
  const [focusedSignal, initialResearch] = await Promise.all([
    focusedSignalPromise,
    initialResearchPromise,
  ]);
  const signal = radarContext.rank != null && focusedSignal.rank !== radarContext.rank
    ? { ...focusedSignal, rank: radarContext.rank }
    : focusedSignal;

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
    <div className="min-h-[calc(100dvh-var(--ui-app-header-height))] w-full bg-[var(--dc-bg-main)]">
      <SignalRadarDetailClient
        signal={signal}
        card={detailCard}
        priceHistory={{
          raw: rawHistory,
          rawCurrency: "EUR",
          graded: ebayGradedSeries?.points ?? cardMarketGradedSeries?.points ?? [],
          gradedCurrency,
          gradedLabel,
          modelDate: radarContext.generatedAt,
        }}
        initialResearch={initialResearch}
        detailSize={settings.modalSize}
        backSetId={fromSet?.trim() || null}
      />
    </div>
  );
}
