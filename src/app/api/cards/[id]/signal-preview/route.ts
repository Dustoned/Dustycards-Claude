import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
import { db } from "@/lib/db";
import { buildOnDemandExternalCardSignal } from "@/lib/external-signal-intelligence";
import { normalizeTradingCardGame, ONE_PIECE_GAME } from "@/lib/games";
import { readSignalRadarSnapshot } from "@/lib/signal-radar-snapshot-store";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const card = await db.card.findUnique({
      where: { id },
      select: {
        id: true,
        game: true,
        episode_id: true,
        name: true,
        image_url: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        cardmarket_id: true,
        cardmarket_url: true,
        episode: { select: { name: true, code: true } },
      },
    });
    if (!card) {
      return NextResponse.json({ ok: false, error: "Card not found." }, { status: 404 });
    }
    if (card.game === ONE_PIECE_GAME) {
      const settings = await getServerUserSettings(user.id);
      if (!settings.onePieceLibraryEnabled) {
        return NextResponse.json({ ok: false, error: "Card not found." }, { status: 404 });
      }
    }
    const game = normalizeTradingCardGame(card.game);
    const storedRadar = await readSignalRadarSnapshot(game);
    const storedSignal =
      storedRadar?.data.signals.find((signal) => signal.cardId === card.id) ?? null;
    if (storedSignal) {
      return NextResponse.json(
        { ok: true, signal: storedSignal },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const latestSafePrice = (
      await loadLatestSafeEnglishNmPrices([
        {
          id: card.id,
          game: card.game,
          episodeId: card.episode_id,
          name: card.name,
          cardNumber: card.card_number,
          printedCardNumber: card.printed_card_number,
          cardmarketId: card.cardmarket_id,
          cardmarketUrl: card.cardmarket_url,
        },
      ])
    ).get(card.id);

    const signal = await buildOnDemandExternalCardSignal({
      id: card.id,
      game,
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.printed_card_number ?? card.card_number,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      rarity: card.rarity,
      currentPrice: latestSafePrice?.value ?? null,
    });
    return NextResponse.json(
      { ok: true, signal },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("[card signal preview]", error);
    return NextResponse.json(
      { ok: false, error: "Could not build the signal preview." },
      { status: 500 }
    );
  }
}
