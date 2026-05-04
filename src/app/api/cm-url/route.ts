import { NextRequest, NextResponse } from "next/server";
import {
  requireId,
  validationErrorResponse,
} from "@/lib/api-validation";
import {
  buildCardMarketProductUrl,
  buildCardMarketProxyUrl,
  isDirectCardMarketUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";
import { db } from "@/lib/db";

async function syncDirectUrlIfChanged(
  cardId: string,
  current: string | null,
  next: string
): Promise<void> {
  if (current === next) return;
  await db.card.update({ where: { id: cardId }, data: { cardmarket_url: next } });
}

export async function GET(request: NextRequest) {
  let cardId: string;
  try {
    cardId = requireId(request.nextUrl.searchParams.get("card_id"), "card_id");
  } catch (error) {
    return validationErrorResponse(error) ?? NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { cardmarket_id: true, cardmarket_url: true },
  });

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  if (isDirectCardMarketUrl(card.cardmarket_url)) {
    const directUrl = withCardMarketFilters(card.cardmarket_url);
    await syncDirectUrlIfChanged(cardId, card.cardmarket_url, directUrl);
    return NextResponse.json({ url: directUrl });
  }

  if (card.cardmarket_id) {
    const directUrl = buildCardMarketProductUrl(card.cardmarket_id);
    await syncDirectUrlIfChanged(cardId, card.cardmarket_url, directUrl);
    return NextResponse.json({ url: directUrl });
  }

  return NextResponse.json({ url: buildCardMarketProxyUrl(cardId) });
}
