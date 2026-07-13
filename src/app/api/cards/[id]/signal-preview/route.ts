import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildOnDemandExternalCardSignal } from "@/lib/external-signal-intelligence";
import { normalizeTradingCardGame, ONE_PIECE_GAME } from "@/lib/games";
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
        name: true,
        image_url: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        episode: { select: { name: true, code: true } },
        prices: {
          where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
          orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
          take: 1,
          select: { cm_en_lowest_nm: true },
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

    const signal = await buildOnDemandExternalCardSignal({
      id: card.id,
      game: normalizeTradingCardGame(card.game),
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.printed_card_number ?? card.card_number,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      rarity: card.rarity,
      currentPrice: card.prices[0]?.cm_en_lowest_nm ?? null,
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
