import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ExternalCardResearchError,
  researchExternalRadarCard,
} from "@/lib/external-card-research";
import {
  normalizeTradingCardGame,
  ONE_PIECE_GAME,
  POKEMON_GAME,
} from "@/lib/games";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

const USER_RESEARCH_LIMIT_PER_HOUR = 8;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const user = await requireUser();
    const { cardId: rawCardId } = await params;
    let cardId: string;
    try { cardId = decodeURIComponent(rawCardId); } catch {
      return NextResponse.json({ ok: false, error: "Invalid card id." }, { status: 400 });
    }
    if (!cardId.trim()) {
      return NextResponse.json({ ok: false, error: "A card id is required." }, { status: 400 });
    }
    if (
      await consumeRateLimit(
        `external-card-research:user:${user.id}`,
        USER_RESEARCH_LIMIT_PER_HOUR,
        60 * 60_000
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "Too many card research requests. Try again later." },
        { status: 429 }
      );
    }

    const card = await db.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        game: true,
        name: true,
        card_number: true,
        printed_card_number: true,
        artist: true,
        rarity: true,
        episode: {
          select: { name: true, code: true },
        },
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
    if (game !== POKEMON_GAME && game !== ONE_PIECE_GAME) {
      return NextResponse.json(
        { ok: false, error: "Signal Radar research is not available for Japanese cards yet." },
        { status: 400 }
      );
    }
    const research = await researchExternalRadarCard({
      cardId: card.id,
      game,
      name: card.name,
      cardNumber: card.printed_card_number ?? card.card_number,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      artist: card.artist,
      rarity: card.rarity,
    });
    return NextResponse.json(
      {
        ok: true,
        research,
        detailUrl: `/movers/signal-radar/${encodeURIComponent(card.id)}?game=${encodeURIComponent(game)}&research=1`,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof ExternalCardResearchError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("[signal-radar card research]", error);
    return NextResponse.json(
      { ok: false, error: "Could not research this card right now." },
      { status: 500 }
    );
  }
}
