import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildCardMarketProductUrl,
  buildCardMarketProxyUrl,
  isDirectCardMarketUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get("card_id");
  if (!cardId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { cardmarket_id: true, cardmarket_url: true },
  });

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const existingDirectUrl = card.cardmarket_url;

  if (isDirectCardMarketUrl(existingDirectUrl)) {
    const directUrl = withCardMarketFilters(existingDirectUrl);

    if (existingDirectUrl !== directUrl) {
      await db.card.update({
        where: { id: cardId },
        data: { cardmarket_url: directUrl },
      });
    }

    return NextResponse.json({ url: directUrl });
  }

  if (card.cardmarket_id) {
    const directUrl = buildCardMarketProductUrl(card.cardmarket_id);

    if (card.cardmarket_url !== directUrl) {
      await db.card.update({
        where: { id: cardId },
        data: { cardmarket_url: directUrl },
      });
    }

    return NextResponse.json({ url: directUrl });
  }

  return NextResponse.json({ url: buildCardMarketProxyUrl(cardId) });
}
