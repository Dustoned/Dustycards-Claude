import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  requireId,
  validationErrorResponse,
} from "@/lib/api-validation";
import {
  buildCardMarketProxyUrl,
  buildCardMarketProductUrl,
  getSafeDirectCardMarketCardUrl,
} from "@/lib/cardmarket";
import { db } from "@/lib/db";
import { normalizeTradingCardGame } from "@/lib/games";

async function syncDirectUrlIfChanged(
  cardId: string,
  current: string | null,
  next: string
): Promise<void> {
  if (current === next) return;
  await db.card.update({ where: { id: cardId }, data: { cardmarket_url: next } });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  let cardId: string;
  try {
    cardId = requireId(request.nextUrl.searchParams.get("card_id"), "card_id");
  } catch (error) {
    return validationErrorResponse(error) ?? NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { game: true, cardmarket_id: true, cardmarket_url: true },
  });

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const game = normalizeTradingCardGame(card.game);
  const directUrl = getSafeDirectCardMarketCardUrl(card.cardmarket_url, game);
  if (directUrl) {
    await syncDirectUrlIfChanged(cardId, card.cardmarket_url, directUrl);
    return NextResponse.json({ url: directUrl });
  }

  if (card.cardmarket_id) {
    const productUrl = buildCardMarketProductUrl(card.cardmarket_id, game);
    await syncDirectUrlIfChanged(cardId, card.cardmarket_url, productUrl);
    return NextResponse.json({ url: productUrl });
  }

  return NextResponse.json({ url: buildCardMarketProxyUrl(cardId) });
}
