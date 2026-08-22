import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import { getOpeningSealedPoolPolicy } from "@/lib/collection-sealed-origin";
import { db } from "@/lib/db";

const OPENING_RESULT_LIMIT = 16;
const OPENING_POOL_LIMIT = 700;

function searchScore(
  card: { name: string; card_number: string | null; printed_card_number: string | null },
  rawQuery: string
): number {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return 0;

  const name = card.name.toLocaleLowerCase();
  const number = (card.printed_card_number ?? card.card_number ?? "")
    .replace(/^#/, "")
    .toLocaleLowerCase();

  if (name === query || number === query.replace(/^#/, "")) return 400;
  if (name.startsWith(query)) return 300;
  if (name.includes(query)) return 200;
  if (number.includes(query.replace(/^#/, ""))) return 160;
  return 100;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
    const query = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);

    if (!sessionId) {
      return NextResponse.json({ error: "Opening session is required" }, { status: 400 });
    }

    const session = await db.sealedOpeningSession.findFirst({
      where: { id: sessionId, user_id: user.id, status: "open" },
      select: {
        sealedProduct: {
          select: {
            id: true,
            game: true,
            name: true,
            episode_id: true,
            episode: { select: { name: true, code: true } },
            contentSets: { select: { episode_id: true } },
            includedCards: { select: { card_id: true } },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Opening session not found or already closed" },
        { status: 404 }
      );
    }

    const product = session.sealedProduct;
    const policy = getOpeningSealedPoolPolicy(product);
    const episodeIds = policy.episodeIds;
    const explicitlyIncludedCardIds = policy.includedCardIds;
    const broadSearchTokens = query.split(/\s+/).filter(Boolean);

    const cards =
      !policy.strict && query.length < 2
        ? []
        : await db.card.findMany({
            where: policy.strict
              ? {
                  game: product.game,
                  OR: [
                    { episode_id: { in: episodeIds } },
                    ...(explicitlyIncludedCardIds.length > 0
                      ? [{ id: { in: explicitlyIncludedCardIds } }]
                      : []),
                  ],
                }
              : {
                  game: product.game,
                  AND: broadSearchTokens.map((token) => ({
                    OR: [
                      { name: { contains: token } },
                      { card_number: { contains: token } },
                      { printed_card_number: { contains: token } },
                      { episode: { name: { contains: token } } },
                      { episode: { code: { contains: token } } },
                    ],
                  })),
                },
            select: {
              id: true,
              name: true,
              card_number: true,
              printed_card_number: true,
              image_url: true,
              rarity: true,
              version: true,
              episode_id: true,
              episode: { select: { name: true, code: true } },
              prices: {
                where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
                orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
                take: 1,
                select: { cm_en_lowest_nm: true },
              },
            },
            take: OPENING_POOL_LIMIT,
          });

    const includedCardIdSet = new Set(explicitlyIncludedCardIds);
    const episodeOrder = new Map(episodeIds.map((episodeId, index) => [episodeId, index]));
    const singles = cards
      .filter(
        (card) =>
          (!policy.strict ||
            episodeOrder.has(card.episode_id) ||
            includedCardIdSet.has(card.id)) &&
          cardMatchesSearchQuery(
            {
              name: card.name,
              cardNumber: card.printed_card_number ?? card.card_number,
              episodeName: card.episode.name,
              episodeCode: card.episode.code,
              rarity: card.rarity,
              version: card.version,
            },
            query
          )
      )
      .sort((left, right) => {
        const scoreDiff = searchScore(right, query) - searchScore(left, query);
        if (scoreDiff !== 0) return scoreDiff;

        const leftScope = episodeOrder.get(left.episode_id) ??
          (includedCardIdSet.has(left.id) ? episodeIds.length : episodeIds.length + 1);
        const rightScope = episodeOrder.get(right.episode_id) ??
          (includedCardIdSet.has(right.id) ? episodeIds.length : episodeIds.length + 1);
        if (leftScope !== rightScope) return leftScope - rightScope;

        return (left.printed_card_number ?? left.card_number ?? left.name).localeCompare(
          right.printed_card_number ?? right.card_number ?? right.name,
          "en",
          { numeric: true, sensitivity: "base" }
        );
      })
      .slice(0, OPENING_RESULT_LIMIT)
      .map((card) => ({
        id: card.id,
        name: card.name,
        card_number: card.printed_card_number ?? card.card_number,
        image_url: card.image_url,
        episode_name: card.episode.name,
        cm_en_lowest_nm: card.prices[0]?.cm_en_lowest_nm ?? null,
        included_promo: includedCardIdSet.has(card.id) && !episodeOrder.has(card.episode_id),
      }));

    return NextResponse.json({
      singles,
      scope: {
        strict: policy.strict,
        reason: policy.reason,
        episodeIds,
        includedPromoCount: explicitlyIncludedCardIds.length,
      },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Could not load cards for this opening" }, { status: 500 })
    );
  }
}
