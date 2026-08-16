import { notFound } from "next/navigation";
import CardDetailRoutePage from "@/components/CardDetailRoutePage";
import type { ModalCardData } from "@/components/card-modal/types";
import { getCardDetailPayload } from "@/lib/card-detail-data";
import { normalizeTradingCardGame } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";

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
  const card = await getCardDetailPayload(cardId, user.id);

  if (!card) notFound();
  const game = normalizeTradingCardGame(card.game);
  const detailCard: ModalCardData = { ...card, game };
  const backHref = fromSet?.trim()
    ? `/movers/signal-radar?game=${encodeURIComponent(game)}&set=${encodeURIComponent(fromSet.trim())}#new-release-chases`
    : `/movers/signal-radar?game=${encodeURIComponent(game)}`;

  return (
    <CardDetailRoutePage
      card={detailCard}
      backHref={backHref}
      backLabel="Back to Signal Radar"
    />
  );
}
